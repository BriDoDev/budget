import { maxMonth, minMonth, monthRange, type MonthKey } from "../month";
import type {
  CategoryMonthResult,
  EngineInput,
  EngineResult,
  MonthResult,
} from "./types";

const UNKNOWN_ACCOUNT = "";

/**
 * Envelope budgeting math. The rules mirror the client-side calculations
 * documented in docs/ynab-internals.md:
 *
 * Per category and month:
 *   carryover  = max(previous available, 0)
 *   available  = carryover + assigned + cashActivity + creditActivity
 *   funded     = carryover + assigned
 *   unbudgetedCash   = min(funded + cash, 0)
 *   unbudgetedCredit = min(-(funded + cash), credit, 0) + max(funded + cash, 0)
 *   fundedCredit     = credit - unbudgetedCredit
 *   cashOverspent    = min(max(unbudgetedCash, available), 0)
 *   creditOverspent  = min(max(unbudgetedCredit, available), 0)
 *
 * Credit cards: the funded part of a category's card spending moves into the
 * card's payment category (-fundedCredit), and payments to the card spend that
 * category. Payment categories are then computed like any other envelope, with
 * those amounts as cash activity. Cash taken out of a card is not reserved for
 * its payment: it becomes money to assign.
 *
 * Per month:
 *   availableToBudget = prev.availableToBudget + prev.overspent + income + cardAdvances - assigned
 *   fundedInFuture    = availableToBudget > 0 && assignedInFuture > 0
 *                         ? min(availableToBudget, assignedInFuture) : 0
 *   readyToAssign     = availableToBudget - fundedInFuture
 */
export function computeBudget(input: EngineInput): EngineResult {
  const standardCategories = input.categories.filter((category) => category.kind === "standard");
  const paymentCategories = input.categories.filter((category) => category.kind === "credit_card_payment");
  const incomeCategoryIds = new Set(
    input.categories.filter((category) => category.kind === "income").map((category) => category.id),
  );

  const months = resolveMonths(input);
  const assignedByKey = new Map<string, number>();
  const cashByKey = new Map<string, number>();
  const creditByKey = new Map<string, Map<string, number>>();
  const paymentsByKey = new Map<string, number>();
  const incomeByMonth = new Map<MonthKey, number>();
  const advancesByMonth = new Map<MonthKey, number>();

  for (const assignment of input.assignments) {
    addTo(assignedByKey, key(assignment.categoryId, assignment.month), assignment.amount);
  }
  for (const line of input.activity) {
    if (incomeCategoryIds.has(line.categoryId)) {
      addTo(incomeByMonth, line.month, line.amount);
    } else if (line.source === "credit") {
      const lineKey = key(line.categoryId, line.month);
      const byAccount = creditByKey.get(lineKey) ?? new Map<string, number>();
      addTo(byAccount, line.accountId ?? UNKNOWN_ACCOUNT, line.amount);
      creditByKey.set(lineKey, byAccount);
    } else {
      addTo(cashByKey, key(line.categoryId, line.month), line.amount);
    }
  }
  for (const payment of input.payments ?? []) {
    addTo(paymentsByKey, key(payment.accountId, payment.month), payment.amount);
  }
  for (const advance of input.cardAdvances ?? []) {
    addTo(advancesByMonth, advance.month, advance.amount);
  }

  const categoryMonths = new Map<string, CategoryMonthResult>();
  const previousAvailable = new Map<string, number>();
  const monthResults: MonthResult[] = [];
  let previousAvailableToBudget = 0;
  let previousOverspent = 0;

  for (const month of months) {
    const totals = { assigned: 0, activity: 0, overspent: 0 };
    const fundedByAccount = new Map<string, number>();

    const record = (result: CategoryMonthResult) => {
      categoryMonths.set(key(result.categoryId, month), result);
      previousAvailable.set(result.categoryId, result.available);
      totals.assigned += result.assigned;
      totals.activity += result.activity;
      totals.overspent += result.cashOverspent;
    };

    for (const category of standardCategories) {
      const categoryKey = key(category.id, month);
      const creditByAccount = creditByKey.get(categoryKey);
      const result = computeCategoryMonth(
        category.id,
        month,
        previousAvailable.get(category.id) ?? 0,
        assignedByKey.get(categoryKey) ?? 0,
        cashByKey.get(categoryKey) ?? 0,
        sumValues(creditByAccount),
      );
      record(result);
      for (const [accountId, share] of splitFundedCredit(result.fundedCredit, creditByAccount)) {
        addTo(fundedByAccount, accountId, -share);
      }
    }

    for (const category of paymentCategories) {
      const categoryKey = key(category.id, month);
      const accountId = category.linkedAccountId ?? null;
      const moved = accountId ? (fundedByAccount.get(accountId) ?? 0) : 0;
      const paid = accountId ? (paymentsByKey.get(key(accountId, month)) ?? 0) : 0;
      record(
        computeCategoryMonth(
          category.id,
          month,
          previousAvailable.get(category.id) ?? 0,
          assignedByKey.get(categoryKey) ?? 0,
          (cashByKey.get(categoryKey) ?? 0) + moved + paid,
          sumValues(creditByKey.get(categoryKey)),
        ),
      );
    }

    const income = incomeByMonth.get(month) ?? 0;
    const cardAdvances = advancesByMonth.get(month) ?? 0;
    const availableToBudget =
      previousAvailableToBudget + previousOverspent + income + cardAdvances - totals.assigned;

    monthResults.push({
      month,
      income,
      cardAdvances,
      assigned: totals.assigned,
      activity: totals.activity,
      overspent: totals.overspent,
      availableToBudget,
      assignedInFuture: 0,
      fundedInFuture: 0,
      readyToAssign: availableToBudget,
    });
    previousAvailableToBudget = availableToBudget;
    previousOverspent = totals.overspent;
  }

  applyFutureFunding(monthResults);

  const monthsByKey = new Map(monthResults.map((result) => [result.month, result]));
  return {
    months: monthResults,
    getMonth: (month) => monthsByKey.get(month),
    getCategoryMonth: (categoryId, month) => categoryMonths.get(key(categoryId, month)),
  };
}

export function computeCategoryMonth(
  categoryId: string,
  month: MonthKey,
  previousAvailable: number,
  assigned: number,
  cashActivity: number,
  creditActivity: number,
): CategoryMonthResult {
  const carryover = previousAvailable > 0 ? previousAvailable : 0;
  const funded = carryover + assigned;
  const available = funded + cashActivity + creditActivity;
  const afterCash = funded + cashActivity;
  const unbudgetedCash = Math.min(afterCash, 0);
  const unbudgetedCredit = Math.min(-afterCash, creditActivity, 0) + Math.max(afterCash, 0);

  return {
    categoryId,
    month,
    carryover,
    assigned,
    cashActivity,
    creditActivity,
    activity: cashActivity + creditActivity,
    available,
    cashOverspent: normalizeZero(Math.min(Math.max(unbudgetedCash, available), 0)),
    creditOverspent: normalizeZero(Math.min(Math.max(unbudgetedCredit, available), 0)),
    fundedCredit: normalizeZero(creditActivity - unbudgetedCredit),
  };
}

/**
 * Splits a category's funded credit activity between the cards that produced
 * it. Cards with a net refund keep their whole amount; the rest is shared
 * between the cards with net spending in proportion to that spending.
 */
export function splitFundedCredit(
  fundedCredit: number,
  creditByAccount: ReadonlyMap<string, number> | undefined,
): Map<string, number> {
  const shares = new Map<string, number>();
  if (!creditByAccount) {
    return shares;
  }

  let refunds = 0;
  let spending = 0;
  const spenders: Array<[accountId: string, amount: number]> = [];
  for (const [accountId, amount] of [...creditByAccount].sort(([a], [b]) => a.localeCompare(b))) {
    if (amount > 0) {
      shares.set(accountId, amount);
      refunds += amount;
    } else if (amount < 0) {
      spenders.push([accountId, amount]);
      spending += amount;
    }
  }

  const toSplit = fundedCredit - refunds;
  let remaining = toSplit;
  spenders.forEach(([accountId, amount], index) => {
    const isLast = index === spenders.length - 1;
    const share = isLast ? remaining : Math.trunc((toSplit * amount) / spending);
    shares.set(accountId, share);
    remaining -= share;
  });
  return shares;
}

function applyFutureFunding(months: MonthResult[]): void {
  let assignedAfter = 0;
  for (let index = months.length - 1; index >= 0; index--) {
    const month = months[index];
    month.assignedInFuture = assignedAfter;
    month.fundedInFuture =
      month.availableToBudget <= 0 || assignedAfter <= 0
        ? 0
        : Math.min(month.availableToBudget, assignedAfter);
    month.readyToAssign = month.availableToBudget - month.fundedInFuture;
    assignedAfter += month.assigned;
  }
}

function resolveMonths(input: EngineInput): MonthKey[] {
  const dataMonths = [
    ...input.assignments.map((assignment) => assignment.month),
    ...input.activity.map((line) => line.month),
    ...(input.payments ?? []).map((payment) => payment.month),
    ...(input.cardAdvances ?? []).map((advance) => advance.month),
  ];
  if (input.throughMonth) {
    dataMonths.push(input.throughMonth);
  }
  if (dataMonths.length === 0) {
    return [];
  }
  const first = dataMonths.reduce(minMonth);
  const last = dataMonths.reduce(maxMonth);
  return monthRange(first, last);
}

function key(id: string, month: MonthKey): string {
  return `${month}|${id}`;
}

function addTo<K>(map: Map<K, number>, mapKey: K, amount: number): void {
  map.set(mapKey, (map.get(mapKey) ?? 0) + amount);
}

function sumValues(map: ReadonlyMap<string, number> | undefined): number {
  let total = 0;
  for (const value of map?.values() ?? []) {
    total += value;
  }
  return total;
}

/** Avoids leaking `-0` from Math.min/Math.max into results. */
function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}
