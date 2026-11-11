import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPlanExport } from "./client";
import { mapPlanExport, type DeletableTable, type ImportRows, type KnownEntities } from "./map";
import type { YnabPlan } from "./types";

const BATCH_SIZE = 500;
const PAGE_SIZE = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Children first, so deletes never trip a foreign key that does not cascade. */
const DELETE_ORDER: DeletableTable[] = [
  "subtransactions",
  "transactions",
  "scheduled_subtransactions",
  "scheduled_transactions",
  "categories",
  "category_groups",
  "payees",
  "accounts",
];

export interface SyncOptions {
  accessToken: string;
  /** Plan id, or "last-used" / "default". */
  planId: string;
  householdId: string;
  fetchImpl?: typeof fetch;
}

export interface SyncResult {
  /** "full" replaces everything YNAB knows; "delta" applies only what changed since the last sync. */
  mode: "full" | "delta";
  budgetId: string;
  budgetName: string;
  upserted: Record<string, number>;
  deleted: number;
  plan: YnabPlan;
  rows: ImportRows;
}

/**
 * One-way sync from YNAB into the household database. The first run imports
 * the whole plan; later runs ask YNAB only for entities changed since the
 * stored server knowledge. Rows created in this app are never touched, but a
 * row that also changed in YNAB is overwritten by the YNAB version.
 */
export async function syncYnabPlan(supabase: SupabaseClient, options: SyncOptions): Promise<SyncResult> {
  const previous = await findSyncedBudget(supabase, options);
  const { plan, serverKnowledge } = await fetchPlanExport(options.accessToken, previous?.id ?? options.planId, {
    lastKnowledgeOfServer: previous?.ynab_server_knowledge,
    fetchImpl: options.fetchImpl,
  });

  const known = previous ? await loadKnownEntities(supabase, previous.id) : undefined;
  const rows = mapPlanExport(plan, {
    householdId: options.householdId,
    importedAt: new Date().toISOString(),
    serverKnowledge,
    known,
  });

  // The server knowledge only advances once every change is stored, so a failed run is retried in full.
  await upsertRows(supabase, "budgets", [
    { ...rows.budget, ynab_server_knowledge: previous?.ynab_server_knowledge ?? null },
  ]);
  await upsertRows(supabase, "accounts", rows.accounts);
  await upsertRows(supabase, "category_groups", rows.categoryGroups);
  await upsertRows(supabase, "categories", rows.categories);
  await upsertRows(supabase, "payees", rows.payees);
  await upsertRows(supabase, "month_assignments", rows.assignments, "category_id,month");
  await upsertRows(supabase, "transactions", rows.transactions);
  await upsertRows(supabase, "subtransactions", rows.subtransactions);
  await upsertRows(supabase, "scheduled_transactions", rows.scheduledTransactions);
  await upsertRows(supabase, "scheduled_subtransactions", rows.scheduledSubtransactions);

  let deleted = 0;
  for (const table of DELETE_ORDER) {
    deleted += await deleteRows(supabase, table, rows.budget.id, rows.deleted[table]);
  }

  const { error: knowledgeError } = await supabase
    .from("budgets")
    .update({ ynab_server_knowledge: serverKnowledge })
    .eq("id", rows.budget.id);
  if (knowledgeError) {
    throw new Error(`Could not store the sync position: ${knowledgeError.message}`);
  }

  return {
    mode: previous ? "delta" : "full",
    budgetId: rows.budget.id,
    budgetName: rows.budget.name,
    upserted: {
      accounts: rows.accounts.length,
      categoryGroups: rows.categoryGroups.length,
      categories: rows.categories.length,
      payees: rows.payees.length,
      assignments: rows.assignments.length,
      transactions: rows.transactions.length,
      subtransactions: rows.subtransactions.length,
      scheduledTransactions: rows.scheduledTransactions.length,
    },
    deleted,
    plan,
    rows,
  };
}

/** The budget a previous sync created for this plan, when it can be identified without asking YNAB. */
async function findSyncedBudget(
  supabase: SupabaseClient,
  options: SyncOptions,
): Promise<{ id: string; ynab_server_knowledge: number } | null> {
  let query = supabase
    .from("budgets")
    .select("id, ynab_server_knowledge")
    .eq("household_id", options.householdId)
    .eq("imported_from", "ynab")
    .not("ynab_server_knowledge", "is", null);
  if (UUID_PATTERN.test(options.planId)) {
    query = query.eq("id", options.planId);
  }
  const { data, error } = await query.limit(2);
  if (error) {
    throw new Error(`Could not read synced budgets: ${error.message}`);
  }
  // With an alias ("last-used") and several synced plans the target is ambiguous: fall back to a full import.
  return data?.length === 1 ? (data[0] as { id: string; ynab_server_knowledge: number }) : null;
}

async function loadKnownEntities(supabase: SupabaseClient, budgetId: string): Promise<KnownEntities> {
  const [accounts, categoryGroups, categories, payees, transactions, scheduled] = await Promise.all([
    selectAll<KnownEntities["accounts"][number]>(supabase, "accounts", "id, name, type", budgetId),
    selectAll<KnownEntities["categoryGroups"][number]>(supabase, "category_groups", "id, name, is_internal", budgetId),
    selectAll<KnownEntities["categories"][number]>(supabase, "categories", "id, kind", budgetId),
    selectAll<{ id: string }>(supabase, "payees", "id", budgetId),
    selectAll<{ id: string }>(supabase, "transactions", "id", budgetId),
    selectAll<{ id: string }>(supabase, "scheduled_transactions", "id", budgetId),
  ]);
  return {
    accounts,
    categoryGroups,
    categories,
    payeeIds: payees.map((row) => row.id),
    transactionIds: transactions.map((row) => row.id),
    scheduledTransactionIds: scheduled.map((row) => row.id),
  };
}

async function selectAll<T>(supabase: SupabaseClient, table: string, columns: string, budgetId: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("budget_id", budgetId)
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
      .overrideTypes<T[], { merge: false }>();
    if (error) {
      throw new Error(`Could not read ${table}: ${error.message}`);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) {
      return rows;
    }
  }
}

async function upsertRows(supabase: SupabaseClient, table: string, rows: object[], onConflict = "id"): Promise<void> {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) {
      throw new Error(`Could not upsert ${table} (rows ${start}-${start + batch.length - 1}): ${error.message}`);
    }
  }
}

async function deleteRows(supabase: SupabaseClient, table: string, budgetId: string, ids: string[]): Promise<number> {
  for (let start = 0; start < ids.length; start += BATCH_SIZE) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("budget_id", budgetId)
      .in("id", ids.slice(start, start + BATCH_SIZE));
    if (error) {
      throw new Error(`Could not delete from ${table}: ${error.message}`);
    }
  }
  return ids.length;
}
