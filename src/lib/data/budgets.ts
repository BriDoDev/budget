import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { buildBudgetMonthView, type BudgetMonthView } from "../budget-view";
import type {
  AccountRow,
  BudgetRow,
  CategoryGroupRow,
  CategoryRow,
  MonthAssignmentRow,
  SubtransactionRow,
  TransactionRow,
} from "../db/types";
import type { MonthKey } from "../month";
import { createClient } from "../supabase/server";

/** PostgREST caps responses (1000 rows by default), so large tables are read in pages. */
const PAGE_SIZE = 1000;

type PageQuery<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;

export interface BudgetSummary {
  id: string;
  name: string;
  currency_iso_code: string;
}

/** Budgets the signed-in user can see (row level security filters by household). */
export async function listBudgets(): Promise<BudgetSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("budgets").select("id, name, currency_iso_code").order("name");
  if (error) {
    throw new Error(`Could not load budgets: ${error.message}`);
  }
  return (data ?? []) as BudgetSummary[];
}

export async function getBudgetMonthView(budgetId: string, month: MonthKey): Promise<BudgetMonthView | null> {
  const supabase = await createClient();
  const { data: budget, error } = await supabase
    .from("budgets")
    .select("id, household_id, name, currency_iso_code, currency_decimal_digits, imported_from, imported_at")
    .eq("id", budgetId)
    .maybeSingle();
  if (error) {
    throw new Error(`Could not load budget: ${error.message}`);
  }
  if (!budget) {
    return null;
  }

  const byBudget = <T>(table: string, columns: string, orderBy: string): PageQuery<T> =>
    (from, to) =>
      supabase
        .from(table)
        .select(columns)
        .eq("budget_id", budgetId)
        .order(orderBy)
        .range(from, to)
        .overrideTypes<T[], { merge: false }>();

  const [accounts, groups, categories, assignments, transactions, subtransactions] = await Promise.all([
    selectAll(byBudget<AccountRow>("accounts", "id, budget_id, name, type, on_budget, closed, note", "id")),
    selectAll(byBudget<CategoryGroupRow>("category_groups", "id, budget_id, name, hidden, is_internal, sort_index", "id")),
    selectAll(
      byBudget<CategoryRow>(
        "categories",
        "id, budget_id, group_id, name, kind, hidden, note, linked_account_id, sort_index",
        "id",
      ),
    ),
    selectAll(byBudget<MonthAssignmentRow>("month_assignments", "budget_id, category_id, month, amount", "month")),
    selectAll(
      byBudget<TransactionRow>(
        "transactions",
        "id, budget_id, account_id, date, amount, payee_id, category_id, memo, cleared, approved, flag_color, transfer_account_id, transfer_transaction_id",
        "id",
      ),
    ),
    selectAll(
      byBudget<SubtransactionRow>(
        "subtransactions",
        "id, budget_id, transaction_id, amount, payee_id, category_id, memo, transfer_account_id",
        "id",
      ),
    ),
  ]);

  return buildBudgetMonthView(
    { budget: budget as BudgetRow, accounts, groups, categories, assignments, transactions, subtransactions },
    month,
  );
}

async function selectAll<T>(query: PageQuery<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`Could not load rows: ${error.message}`);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) {
      return rows;
    }
  }
}
