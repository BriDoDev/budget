import { maxMonth, minMonth, monthRange, type MonthKey } from "../month";
import type {
  CategoryMonthResult,
  EngineCategory,
  EngineInput,
  EngineResult,
  MonthResult,
} from "./types";

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
 *   cashOverspent    = min(max(unbudgetedCash, available), 0)
 *   creditOverspent  = min(max(unbudgetedCredit, available), 0)
 *
 * Per month:
 *   availableToBudget = prev.availableToBudget + prev.overspent + income - assigned
 *   fundedInFuture    = availableToBudget > 0 && assignedInFuture > 0
 *                         ? min(availableToBudget, assignedInFuture) : 0
 *   readyToAssign     = availableToBudget - fundedInFuture
 */
export function computeBudget(input: EngineInput): EngineResult {
  const budgetCategories = input.categories.filter(isBudgetCategory);
  const incomeCategoryIds = new Set(
    input.categories.filter((category) => category.kind === "income").map((category) => category.id),
  );

  const months = resolveMonths(input);
  const assignedByKey = new Map<string, number>();
  const cashByKey = new Map<string, number>();
  const creditByKey = new Map<string, number>();
  const incomeByMonth = new Map<MonthKey, number>();

  for (const assignment of input.assignments) {
    addTo(assignedByKey, key(assignment.categoryId, assignment.month), assignment.amount);
  }
  for (const line of input.activity) {
    if (incomeCategoryIds.has(line.categoryId)) {
      addTo(incomeByMonth, line.month, line.amount);
      continue;
    }
    const target = line.source === "credit" ? creditByKey : cashByKey;
    addTo(target, key(line.categoryId, line.month), line.amount);
  }

  const categoryMonths = new Map<string, CategoryMonthResult>();
  const previousAvailable = new Map<string, number>();
  const monthResults: MonthResult[] = [];
  let previousAvailableToBudget = 0;
  let previousOverspent = 0;

  for (const month of months) {
    let monthAssigned = 0;
    let monthActivity = 0;
    let monthOverspent = 0;

    for (const category of budgetCategories) {
      const result = computeCategoryMonth(
        category.id,
        month,
        previousAvailable.get(category.id) ?? 0,
        assignedByKey.get(key(category.id, month)) ?? 0,
        cashByKey.get(key(category.id, month)) ?? 0,
        creditByKey.get(key(category.id, month)) ?? 0,
      );
      categoryMonths.set(key(category.id, month), result);
      previousAvailable.set(category.id, result.available);
      monthAssigned += result.assigned;
      monthActivity += result.activity;
      monthOverspent += result.cashOverspent;
    }

    const income = incomeByMonth.get(month) ?? 0;
    const availableToBudget = previousAvailableToBudget + previousOverspent + income - monthAssigned;

    monthResults.push({
      month,
      income,
      assigned: monthAssigned,
      activity: monthActivity,
      overspent: monthOverspent,
      availableToBudget,
      assignedInFuture: 0,
      fundedInFuture: 0,
      readyToAssign: availableToBudget,
    });
    previousAvailableToBudget = availableToBudget;
    previousOverspent = monthOverspent;
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
  };
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

function isBudgetCategory(category: EngineCategory): boolean {
  return category.kind === "standard" || category.kind === "credit_card_payment";
}

function key(categoryId: string, month: MonthKey): string {
  return `${month}|${categoryId}`;
}

function addTo<K>(map: Map<K, number>, mapKey: K, amount: number): void {
  map.set(mapKey, (map.get(mapKey) ?? 0) + amount);
}

/** Avoids leaking `-0` from Math.min/Math.max into results. */
function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}
