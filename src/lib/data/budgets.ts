import "server-only";
import { cache } from "react";
import { buildBudgetMonthView, type BudgetMonthView } from "../budget-view";
import type { MonthAssignmentRow } from "../db/types";
import type { MonthKey } from "../month";
import { createClient } from "../supabase/server";
import { fetchActivity, getBudget, listCategories, listCategoryGroups, selectPaged } from "./core";

export interface BudgetSummary {
  id: string;
  household_id: string;
  name: string;
  currency_iso_code: string;
}

type AssignmentSlice = Pick<MonthAssignmentRow, "category_id" | "month" | "amount">;

/** Budgets the signed-in user can see (row level security filters by household). */
export async function listBudgets(): Promise<BudgetSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budgets")
    .select("id, household_id, name, currency_iso_code")
    .order("name");
  if (error) {
    throw new Error(`Could not load budgets: ${error.message}`);
  }
  return (data ?? []) as BudgetSummary[];
}

export async function listAssignments(budgetId: string): Promise<AssignmentSlice[]> {
  const supabase = await createClient();
  return selectPaged<AssignmentSlice>((from, to) =>
    supabase
      .from("month_assignments")
      .select("category_id, month, amount")
      .eq("budget_id", budgetId)
      .order("month")
      .order("category_id")
      .range(from, to)
      .overrideTypes<AssignmentSlice[], { merge: false }>(),
  );
}

/** Cached per request: the sidebar and the month page ask for the same view. */
export const getBudgetMonthView = cache(async (budgetId: string, month: MonthKey): Promise<BudgetMonthView | null> => {
  const budget = await getBudget(budgetId);
  if (!budget) {
    return null;
  }
  const [groups, categories, assignments, activity] = await Promise.all([
    listCategoryGroups(budgetId),
    listCategories(budgetId),
    listAssignments(budgetId),
    fetchActivity(budgetId),
  ]);
  return buildBudgetMonthView({ budget, groups, categories, assignments, activity }, month);
});

export interface CategoryActivityItem {
  id: string;
  date: string;
  amount: number;
  account_id: string;
  payee: { name: string } | null;
}

/** Latest transactions of a category within a month (splits are not included). */
export async function listCategoryMonthActivity(
  budgetId: string,
  categoryId: string,
  month: MonthKey,
  nextMonth: MonthKey,
  limit = 5,
): Promise<CategoryActivityItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, date, amount, account_id, payee:payees(name)")
    .eq("budget_id", budgetId)
    .eq("category_id", categoryId)
    .gte("date", month)
    .lt("date", nextMonth)
    .order("date", { ascending: false })
    .order("id")
    .limit(limit)
    .overrideTypes<CategoryActivityItem[], { merge: false }>();
  if (error) {
    throw new Error(`Could not load category activity: ${error.message}`);
  }
  return data ?? [];
}

/** Scheduled transactions whose next date has arrived. */
export async function countDueScheduled(budgetId: string, today: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("scheduled_transactions")
    .select("id", { count: "exact", head: true })
    .eq("budget_id", budgetId)
    .lte("date_next", today);
  if (error) {
    throw new Error(`Could not count scheduled transactions: ${error.message}`);
  }
  return count ?? 0;
}
