import { buildActivityLines, computeBudget, type MonthResult } from "./budget-engine";
import type {
  AccountRow,
  BudgetRow,
  CategoryGroupRow,
  CategoryRow,
  MonthAssignmentRow,
  SubtransactionRow,
  TransactionRow,
} from "./db/types";
import { addMonths, toMonthKey, type MonthKey } from "./month";
import type { CurrencySettings } from "./money";

export interface BudgetRows {
  budget: BudgetRow;
  accounts: AccountRow[];
  groups: CategoryGroupRow[];
  categories: CategoryRow[];
  assignments: MonthAssignmentRow[];
  transactions: TransactionRow[];
  subtransactions: SubtransactionRow[];
}

export interface CategoryLine {
  id: string;
  name: string;
  kind: CategoryRow["kind"];
  assigned: number;
  activity: number;
  available: number;
  cashOverspent: number;
  creditOverspent: number;
}

export interface CategoryGroupLine {
  id: string;
  name: string;
  assigned: number;
  activity: number;
  available: number;
  categories: CategoryLine[];
}

export interface BudgetMonthView {
  budget: { id: string; name: string; currency: CurrencySettings };
  month: MonthKey;
  previousMonth: MonthKey;
  nextMonth: MonthKey;
  summary: MonthResult;
  groups: CategoryGroupLine[];
}

/** Runs the budget engine over stored rows and shapes the month screen. Hidden and internal categories are omitted. */
export function buildBudgetMonthView(rows: BudgetRows, month: MonthKey): BudgetMonthView {
  const result = computeBudget({
    categories: rows.categories.map((category) => ({ id: category.id, kind: category.kind })),
    assignments: rows.assignments.map((assignment) => ({
      categoryId: assignment.category_id,
      month: toMonthKey(assignment.month),
      amount: assignment.amount,
    })),
    activity: buildActivityLines(
      rows.accounts.map((account) => ({ id: account.id, type: account.type, onBudget: account.on_budget })),
      rows.transactions.map((transaction) => ({
        id: transaction.id,
        accountId: transaction.account_id,
        date: transaction.date,
        amount: transaction.amount,
        categoryId: transaction.category_id,
      })),
      rows.subtransactions.map((sub) => ({
        transactionId: sub.transaction_id,
        amount: sub.amount,
        categoryId: sub.category_id,
      })),
    ),
    throughMonth: month,
  });

  const visibleCategories = rows.categories
    .filter((category) => !category.hidden && (category.kind === "standard" || category.kind === "credit_card_payment"))
    .sort((a, b) => a.sort_index - b.sort_index);

  const groups: CategoryGroupLine[] = [...rows.groups]
    .filter((group) => !group.hidden && !group.is_internal)
    .sort((a, b) => a.sort_index - b.sort_index)
    .map((group) => {
      const categories = visibleCategories
        .filter((category) => category.group_id === group.id)
        .map((category): CategoryLine => {
          const values = result.getCategoryMonth(category.id, month);
          return {
            id: category.id,
            name: category.name,
            kind: category.kind,
            assigned: values?.assigned ?? 0,
            activity: values?.activity ?? 0,
            available: values?.available ?? 0,
            cashOverspent: values?.cashOverspent ?? 0,
            creditOverspent: values?.creditOverspent ?? 0,
          };
        });
      return {
        id: group.id,
        name: group.name,
        assigned: sum(categories, "assigned"),
        activity: sum(categories, "activity"),
        available: sum(categories, "available"),
        categories,
      };
    })
    .filter((group) => group.categories.length > 0);

  return {
    budget: {
      id: rows.budget.id,
      name: rows.budget.name,
      currency: { isoCode: rows.budget.currency_iso_code, decimalDigits: rows.budget.currency_decimal_digits },
    },
    month,
    previousMonth: addMonths(month, -1),
    nextMonth: addMonths(month, 1),
    summary: result.getMonth(month) ?? emptyMonth(month),
    groups,
  };
}

function emptyMonth(month: MonthKey): MonthResult {
  return {
    month,
    income: 0,
    assigned: 0,
    activity: 0,
    overspent: 0,
    availableToBudget: 0,
    assignedInFuture: 0,
    fundedInFuture: 0,
    readyToAssign: 0,
  };
}

function sum(lines: CategoryLine[], field: "assigned" | "activity" | "available"): number {
  return lines.reduce((total, line) => total + line[field], 0);
}
