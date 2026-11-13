import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { cache } from "react";
import type { AccountRow, BudgetRow, CategoryGroupRow, CategoryRow } from "../db/types";
import { createClient } from "../supabase/server";

/** PostgREST caps responses (1000 rows by default), so large results are read in pages. */
const PAGE_SIZE = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PageQuery<T> = (
  from: number,
  to: number,
) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;

export interface ActivityRow {
  kind: "activity" | "payment" | "advance";
  category_id: string | null;
  account_id: string;
  account_type: string;
  month: string;
  amount: number;
}

export interface AccountMonthTotalRow {
  account_id: string;
  month: string;
  cleared_amount: number;
  uncleared_amount: number;
}

export interface AccountWithBalance extends AccountRow {
  clearedBalance: number;
  unclearedBalance: number;
  balance: number;
}

/** RPC results are untyped without generated database types; this states the row shape the function returns. */
function asRows<T>(query: PromiseLike<{ data: unknown; error: PostgrestError | null }>) {
  return query as PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export async function selectPaged<T>(query: PageQuery<T>): Promise<T[]> {
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

// The loaders below are wrapped in React `cache` so the sidebar and the page
// share one query per request.

export const getBudget = cache(async (budgetId: string): Promise<BudgetRow | null> => {
  if (!isUuid(budgetId)) {
    return null;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budgets")
    .select(
      "id, household_id, name, currency_iso_code, currency_decimal_digits, imported_from, imported_at, ynab_server_knowledge",
    )
    .eq("id", budgetId)
    .maybeSingle();
  if (error) {
    throw new Error(`Could not load budget: ${error.message}`);
  }
  return data as BudgetRow | null;
});

export const listCategoryGroups = cache(async (budgetId: string): Promise<CategoryGroupRow[]> => {
  const supabase = await createClient();
  return selectPaged<CategoryGroupRow>((from, to) =>
    supabase
      .from("category_groups")
      .select("id, budget_id, name, hidden, is_internal, sort_index")
      .eq("budget_id", budgetId)
      .order("sort_index")
      .order("id")
      .range(from, to)
      .overrideTypes<CategoryGroupRow[], { merge: false }>(),
  );
});

export const listCategories = cache(async (budgetId: string): Promise<CategoryRow[]> => {
  const supabase = await createClient();
  return selectPaged<CategoryRow>((from, to) =>
    supabase
      .from("categories")
      .select(
        "id, budget_id, group_id, name, kind, hidden, note, linked_account_id, sort_index, goal_type, goal_target, goal_target_month, goal_cadence_months, goal_needs_whole_amount, goal_created_month",
      )
      .eq("budget_id", budgetId)
      .order("sort_index")
      .order("id")
      .range(from, to)
      .overrideTypes<CategoryRow[], { merge: false }>(),
  );
});

export const fetchActivity = cache(async (budgetId: string): Promise<ActivityRow[]> => {
  const supabase = await createClient();
  return selectPaged<ActivityRow>((from, to) =>
    asRows<ActivityRow>(
      supabase
        .rpc("budget_activity", { p_budget_id: budgetId })
        .order("month")
        .order("kind")
        .order("account_id")
        .order("category_id")
        .range(from, to),
    ),
  );
});

export const fetchAccountMonthTotals = cache(async (budgetId: string): Promise<AccountMonthTotalRow[]> => {
  const supabase = await createClient();
  return selectPaged<AccountMonthTotalRow>((from, to) =>
    asRows<AccountMonthTotalRow>(
      supabase.rpc("account_month_totals", { p_budget_id: budgetId }).order("month").order("account_id").range(from, to),
    ),
  );
});

export const listAccounts = cache(async (budgetId: string): Promise<AccountWithBalance[]> => {
  const supabase = await createClient();
  const [accounts, totals] = await Promise.all([
    selectPaged<AccountRow>((from, to) =>
      supabase
        .from("accounts")
        .select("id, budget_id, name, type, on_budget, closed, note")
        .eq("budget_id", budgetId)
        .order("name")
        .order("id")
        .range(from, to)
        .overrideTypes<AccountRow[], { merge: false }>(),
    ),
    fetchAccountMonthTotals(budgetId),
  ]);

  const balances = new Map<string, { cleared: number; uncleared: number }>();
  for (const total of totals) {
    const entry = balances.get(total.account_id) ?? { cleared: 0, uncleared: 0 };
    entry.cleared += total.cleared_amount;
    entry.uncleared += total.uncleared_amount;
    balances.set(total.account_id, entry);
  }
  return accounts.map((account) => {
    const { cleared, uncleared } = balances.get(account.id) ?? { cleared: 0, uncleared: 0 };
    return { ...account, clearedBalance: cleared, unclearedBalance: uncleared, balance: cleared + uncleared };
  });
});
