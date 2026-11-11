import { buildLedger, computeBudget } from "../budget-engine";
import { toMonthKey, type MonthKey } from "../month";
import type { ImportRows } from "./map";
import type { YnabPlan } from "./types";

export interface ParityMismatch {
  name: string;
  ynab: number;
  ours: number;
}

export interface ParityReport {
  month: MonthKey;
  readyToAssign: { ynab: number; ours: number } | null;
  categoriesCompared: number;
  mismatches: ParityMismatch[];
}

/**
 * Runs our engine over a full YNAB export and compares one month against the
 * figures YNAB itself reports (category balances and Ready to Assign). It is a
 * diagnostic for the import: mismatches point at rules the engine does not
 * reproduce yet.
 */
export function comparePlanWithEngine(plan: YnabPlan, rows: ImportRows, month: MonthKey): ParityReport {
  const ynabMonth = plan.months.find((candidate) => !candidate.deleted && toMonthKey(candidate.month) === month);
  const ledger = buildLedger(
    rows.accounts.map((account) => ({ id: account.id, type: account.type, onBudget: account.on_budget })),
    rows.transactions.map((transaction) => ({
      id: transaction.id,
      accountId: transaction.account_id,
      date: transaction.date,
      amount: transaction.amount,
      categoryId: transaction.category_id,
      transferAccountId: transaction.transfer_account_id,
    })),
    rows.subtransactions.map((sub) => ({ transactionId: sub.transaction_id, amount: sub.amount, categoryId: sub.category_id })),
  );
  const result = computeBudget({
    categories: rows.categories.map((category) => ({
      id: category.id,
      kind: category.kind,
      linkedAccountId: category.linked_account_id,
    })),
    assignments: rows.assignments.map((assignment) => ({
      categoryId: assignment.category_id,
      month: toMonthKey(assignment.month),
      amount: assignment.amount,
    })),
    activity: ledger.activity,
    payments: ledger.payments,
    throughMonth: month,
  });

  const mismatches: ParityMismatch[] = [];
  let categoriesCompared = 0;
  for (const category of ynabMonth?.categories ?? []) {
    const ours = result.getCategoryMonth(category.id, month);
    if (!ours || category.balance === undefined) {
      continue;
    }
    categoriesCompared += 1;
    if (ours.available !== category.balance) {
      mismatches.push({ name: category.name, ynab: category.balance, ours: ours.available });
    }
  }

  const ourMonth = result.getMonth(month);
  return {
    month,
    readyToAssign:
      ynabMonth?.to_be_budgeted === undefined || !ourMonth
        ? null
        : { ynab: ynabMonth.to_be_budgeted, ours: ourMonth.readyToAssign },
    categoriesCompared,
    mismatches: mismatches.sort((a, b) => Math.abs(b.ynab - b.ours) - Math.abs(a.ynab - a.ours)),
  };
}
