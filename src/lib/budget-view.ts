import {
  computeBudget,
  computeGoalStatus,
  goalDueMonth,
  CREDIT_ACCOUNT_TYPES,
  type ActivityLine,
  type CardAdvanceLine,
  type EngineResult,
  type Goal,
  type GoalStatus,
  type MonthResult,
  type PaymentLine,
} from "./budget-engine";
import type { BudgetRow, CategoryGroupRow, CategoryRow, MonthAssignmentRow } from "./db/types";
import { addMonths, toMonthKey, type MonthKey } from "./month";
import type { CurrencySettings } from "./money";

/** Aggregated activity as returned by the `budget_activity` SQL function. */
export interface ActivityAggregate {
  kind: "activity" | "payment" | "advance";
  category_id: string | null;
  account_id: string;
  account_type: string;
  month: string;
  amount: number;
}

export interface BudgetRows {
  budget: BudgetRow;
  groups: CategoryGroupRow[];
  categories: CategoryRow[];
  assignments: Pick<MonthAssignmentRow, "category_id" | "month" | "amount">[];
  activity: ActivityAggregate[];
}

export interface CategoryLine {
  id: string;
  name: string;
  kind: CategoryRow["kind"];
  note: string | null;
  /** Credit account paid from this category (payment categories only). */
  linkedAccountId: string | null;
  /** Positive balance that came in from the previous month. */
  carryover: number;
  assigned: number;
  activity: number;
  available: number;
  cashOverspent: number;
  creditOverspent: number;
  goal: GoalStatus | null;
  /** Month the goal is due, when it has a date. */
  goalDueMonth: MonthKey | null;
  /** Day of that month the goal is due; null means its last day. */
  goalDueDay: number | null;
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
  /** Sum of what goals still need this month. */
  underfunded: number;
  groups: CategoryGroupLine[];
}

/** Runs the engine over the stored assignments and aggregated activity of a budget. */
export function runEngine(rows: Omit<BudgetRows, "budget" | "groups">, throughMonth: MonthKey): EngineResult {
  const activity: ActivityLine[] = [];
  const payments: PaymentLine[] = [];
  const cardAdvances: CardAdvanceLine[] = [];
  for (const row of rows.activity) {
    const month = toMonthKey(row.month);
    if (row.kind === "payment") {
      payments.push({ accountId: row.account_id, month, amount: row.amount });
    } else if (row.kind === "advance") {
      cardAdvances.push({ accountId: row.account_id, month, amount: row.amount });
    } else if (row.category_id) {
      activity.push({
        categoryId: row.category_id,
        month,
        amount: row.amount,
        source: CREDIT_ACCOUNT_TYPES.has(row.account_type) ? "credit" : "cash",
        accountId: row.account_id,
      });
    }
  }

  return computeBudget({
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
    activity,
    payments,
    cardAdvances,
    throughMonth,
  });
}

/** Shapes the month screen. Hidden and internal categories are omitted. */
export function buildBudgetMonthView(rows: BudgetRows, month: MonthKey): BudgetMonthView {
  const result = runEngine(rows, month);
  const roundingStep = 10 ** Math.max(0, 3 - rows.budget.currency_decimal_digits);

  const visibleCategories = rows.categories
    .filter((category) => !category.hidden && (category.kind === "standard" || category.kind === "credit_card_payment"))
    .sort((a, b) => a.sort_index - b.sort_index);

  let underfunded = 0;
  const groups: CategoryGroupLine[] = [...rows.groups]
    .filter((group) => !group.hidden && !group.is_internal)
    .sort((a, b) => a.sort_index - b.sort_index)
    .map((group) => {
      const categories = visibleCategories
        .filter((category) => category.group_id === group.id)
        .map((category): CategoryLine => {
          const values = result.getCategoryMonth(category.id, month);
          const goal = toGoal(category);
          const goalStatus = goal
            ? computeGoalStatus(goal, month, (lookupMonth) => result.getCategoryMonth(category.id, lookupMonth), roundingStep)
            : null;
          underfunded += goalStatus?.underfunded ?? 0;
          return {
            id: category.id,
            name: category.name,
            kind: category.kind,
            note: category.note,
            linkedAccountId: category.linked_account_id,
            carryover: values?.carryover ?? 0,
            assigned: values?.assigned ?? 0,
            activity: values?.activity ?? 0,
            available: values?.available ?? 0,
            cashOverspent: values?.cashOverspent ?? 0,
            creditOverspent: values?.creditOverspent ?? 0,
            goal: goalStatus,
            goalDueMonth: goal ? goalDueMonth(goal, month) : null,
            goalDueDay: category.goal_due_day,
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
    underfunded,
    groups,
  };
}

export function toGoal(category: CategoryRow): Goal | null {
  if (!category.goal_type || !category.goal_target) {
    return null;
  }
  return {
    type: category.goal_type,
    target: category.goal_target,
    targetMonth: category.goal_target_month ? toMonthKey(category.goal_target_month) : null,
    cadenceMonths: category.goal_cadence_months,
    needsWholeAmount: category.goal_needs_whole_amount,
    createdMonth: category.goal_created_month ? toMonthKey(category.goal_created_month) : null,
  };
}

function emptyMonth(month: MonthKey): MonthResult {
  return {
    month,
    income: 0,
    cardAdvances: 0,
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
