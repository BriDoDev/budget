import "server-only";
import type { ClearedStatus, ScheduledTransactionRow } from "../db/types";
import { createClient } from "../supabase/server";

const DEFAULT_LIMIT = 100;
const MAX_MATCHING_PAYEES = 200;

export type TransactionFilter = "all" | "unapproved" | "uncleared" | "uncategorized";

export interface TransactionQuery {
  accountId?: string;
  search?: string;
  filter?: TransactionFilter;
  limit?: number;
}

export interface SplitLine {
  id: string;
  amount: number;
  memo: string | null;
  category_id: string | null;
  category: CategoryRef | null;
}

/** Name to show for a category; the internal income category gets a friendly label. */
export interface CategoryRef {
  name: string;
  kind: string;
}

export function categoryLabel(category: CategoryRef | null): string | null {
  if (!category) {
    return null;
  }
  return category.kind === "income" ? "Ingreso: listo para asignar" : category.name;
}

export interface TransactionListItem {
  id: string;
  account_id: string;
  date: string;
  amount: number;
  memo: string | null;
  cleared: ClearedStatus;
  approved: boolean;
  flag_color: string | null;
  category_id: string | null;
  payee_id: string | null;
  transfer_account_id: string | null;
  payee: { name: string } | null;
  category: CategoryRef | null;
  subtransactions: SplitLine[];
}

export interface TransactionPage {
  items: TransactionListItem[];
  /** True when more rows match than were returned. */
  hasMore: boolean;
}

const TRANSACTION_COLUMNS =
  "id, account_id, date, amount, memo, cleared, approved, flag_color, category_id, payee_id, transfer_account_id, " +
  "payee:payees(name), category:categories(name, kind), " +
  "subtransactions(id, amount, memo, category_id, category:categories(name, kind))";

export async function listTransactions(budgetId: string, query: TransactionQuery = {}): Promise<TransactionPage> {
  const supabase = await createClient();
  const limit = query.limit ?? DEFAULT_LIMIT;

  let request = supabase
    .from("transactions")
    .select(TRANSACTION_COLUMNS)
    .eq("budget_id", budgetId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id")
    .limit(limit + 1);

  if (query.accountId) {
    request = request.eq("account_id", query.accountId);
  }
  if (query.filter === "unapproved") {
    request = request.eq("approved", false);
  } else if (query.filter === "uncleared") {
    request = request.eq("cleared", "uncleared");
  } else if (query.filter === "uncategorized") {
    // No category, not a transfer and not a split (splits carry their categories in subtransactions).
    request = request.is("category_id", null).is("transfer_account_id", null).is("subtransactions", null);
  }

  const term = sanitizeSearch(query.search);
  if (term) {
    const { data: payees } = await supabase
      .from("payees")
      .select("id")
      .eq("budget_id", budgetId)
      .ilike("name", `%${term}%`)
      .limit(MAX_MATCHING_PAYEES);
    const payeeIds = (payees ?? []).map((payee) => payee.id as string);
    const conditions = [`memo.ilike.%${term}%`];
    if (payeeIds.length > 0) {
      conditions.push(`payee_id.in.(${payeeIds.join(",")})`);
    }
    request = request.or(conditions.join(","));
  }

  const { data, error } = await request.overrideTypes<TransactionListItem[], { merge: false }>();
  if (error) {
    throw new Error(`Could not load transactions: ${error.message}`);
  }
  const rows = data ?? [];
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

export interface TransactionCounts {
  uncleared: number;
  uncategorized: number;
}

/** How many transactions still need attention, for the filter labels. */
export async function countTransactions(budgetId: string, accountId?: string): Promise<TransactionCounts> {
  const supabase = await createClient();
  let uncleared = supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("budget_id", budgetId)
    .eq("cleared", "uncleared");
  let uncategorized = supabase
    .from("transactions")
    .select("id, subtransactions(id)", { count: "exact", head: true })
    .eq("budget_id", budgetId)
    .is("category_id", null)
    .is("transfer_account_id", null)
    .is("subtransactions", null);
  if (accountId) {
    uncleared = uncleared.eq("account_id", accountId);
    uncategorized = uncategorized.eq("account_id", accountId);
  }
  const [unclearedResult, uncategorizedResult] = await Promise.all([uncleared, uncategorized]);
  if (unclearedResult.error || uncategorizedResult.error) {
    throw new Error("Could not count transactions.");
  }
  return { uncleared: unclearedResult.count ?? 0, uncategorized: uncategorizedResult.count ?? 0 };
}

export async function getTransaction(budgetId: string, transactionId: string): Promise<TransactionListItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(TRANSACTION_COLUMNS)
    .eq("budget_id", budgetId)
    .eq("id", transactionId)
    .maybeSingle()
    .overrideTypes<TransactionListItem, { merge: false }>();
  if (error) {
    throw new Error(`Could not load transaction: ${error.message}`);
  }
  return data;
}

/** Payee names for autocompletion, most recently created first. Transfer payees are excluded. */
export async function listPayeeNames(budgetId: string, limit = 500): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payees")
    .select("name")
    .eq("budget_id", budgetId)
    .is("transfer_account_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`Could not load payees: ${error.message}`);
  }
  return [...new Set((data ?? []).map((payee) => payee.name as string))];
}

export interface ScheduledListItem extends ScheduledTransactionRow {
  payee: { name: string } | null;
  category: CategoryRef | null;
  scheduled_subtransactions: Array<{ amount: number; category_id: string | null; memo: string | null }>;
}

export async function listScheduledTransactions(budgetId: string): Promise<ScheduledListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scheduled_transactions")
    .select(
      "id, budget_id, account_id, date_first, date_next, frequency, amount, payee_id, category_id, memo, flag_color, transfer_account_id, " +
        "payee:payees(name), category:categories(name, kind), scheduled_subtransactions(amount, category_id, memo)",
    )
    .eq("budget_id", budgetId)
    .order("date_next")
    .order("id")
    .overrideTypes<ScheduledListItem[], { merge: false }>();
  if (error) {
    throw new Error(`Could not load scheduled transactions: ${error.message}`);
  }
  return data ?? [];
}

/** Removes characters that have a meaning in PostgREST filter syntax. */
function sanitizeSearch(search: string | undefined): string {
  return (search ?? "").replace(/[,()%*\\"]/g, " ").trim().slice(0, 80);
}
