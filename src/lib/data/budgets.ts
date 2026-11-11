import "server-only";
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

export async function getBudgetMonthView(budgetId: string, month: MonthKey): Promise<BudgetMonthView | null> {
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
}
