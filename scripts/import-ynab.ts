/**
 * One-time (re-runnable) import of a YNAB plan into the household database.
 *
 *   pnpm import:ynab
 *
 * Reads YNAB_ACCESS_TOKEN, YNAB_PLAN_ID, ALLOWED_EMAILS, HOUSEHOLD_NAME and the
 * Supabase variables from .env.local. Every e-mail in ALLOWED_EMAILS must have
 * signed in once (magic link) so its user exists; the first one owns the household.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAllowedEmails } from "../src/lib/auth/allowed-emails";
import { createAdminClient } from "../src/lib/supabase/admin";
import { fetchPlanExport } from "../src/lib/ynab/client";
import { mapPlanExport } from "../src/lib/ynab/map";

const BATCH_SIZE = 500;
const USERS_PAGE_SIZE = 1000;

async function main(): Promise<void> {
  const accessToken = requireEnv("YNAB_ACCESS_TOKEN");
  const planId = process.env.YNAB_PLAN_ID || "last-used";
  const householdName = process.env.HOUSEHOLD_NAME || "Hogar";
  const memberEmails = [...parseAllowedEmails(requireEnv("ALLOWED_EMAILS"))];
  if (memberEmails.length === 0) {
    throw new Error("ALLOWED_EMAILS must contain at least one e-mail.");
  }

  const supabase = createAdminClient();
  const userIds = await resolveUserIds(supabase, memberEmails);
  const householdId = await ensureHousehold(supabase, householdName, userIds);

  console.log(`Downloading YNAB plan "${planId}"…`);
  const plan = await fetchPlanExport(accessToken, planId);
  const rows = mapPlanExport(plan, { householdId, importedAt: new Date().toISOString() });

  await upsertRows(supabase, "budgets", [rows.budget]);
  await upsertRows(supabase, "accounts", rows.accounts);
  await upsertRows(supabase, "category_groups", rows.categoryGroups);
  await upsertRows(supabase, "categories", rows.categories);
  await upsertRows(supabase, "payees", rows.payees);
  await upsertRows(supabase, "month_assignments", rows.assignments, "category_id,month");
  await upsertRows(supabase, "transactions", rows.transactions);
  await upsertRows(supabase, "subtransactions", rows.subtransactions);

  console.log(`Imported "${rows.budget.name}" into household ${householdId}:`);
  console.table({
    accounts: rows.accounts.length,
    categoryGroups: rows.categoryGroups.length,
    categories: rows.categories.length,
    payees: rows.payees.length,
    assignments: rows.assignments.length,
    transactions: rows.transactions.length,
    subtransactions: rows.subtransactions.length,
  });
}

async function resolveUserIds(supabase: SupabaseClient, emails: string[]): Promise<string[]> {
  const idsByEmail = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: USERS_PAGE_SIZE });
    if (error) {
      throw new Error(`Could not list users: ${error.message}`);
    }
    for (const user of data.users) {
      if (user.email) {
        idsByEmail.set(user.email.toLowerCase(), user.id);
      }
    }
    if (data.users.length < USERS_PAGE_SIZE) {
      break;
    }
  }

  const missing = emails.filter((email) => !idsByEmail.has(email));
  if (missing.length > 0) {
    throw new Error(`These e-mails have not signed in yet (open the app and request a magic link): ${missing.join(", ")}`);
  }
  return emails.map((email) => idsByEmail.get(email)!);
}

/** Reuses the household owned by the first member, or creates it, then ensures every member belongs to it. */
async function ensureHousehold(supabase: SupabaseClient, name: string, userIds: string[]): Promise<string> {
  const [ownerId] = userIds;
  const { data: owned, error: ownedError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", ownerId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (ownedError) {
    throw new Error(`Could not read households: ${ownedError.message}`);
  }

  let householdId = owned?.household_id as string | undefined;
  if (!householdId) {
    const { data: created, error: createError } = await supabase
      .from("households")
      .insert({ name })
      .select("id")
      .single();
    if (createError) {
      throw new Error(`Could not create household: ${createError.message}`);
    }
    householdId = created.id as string;
  }

  const memberships = userIds.map((userId, index) => ({
    household_id: householdId,
    user_id: userId,
    role: index === 0 ? "owner" : "member",
  }));
  const { error: membersError } = await supabase
    .from("household_members")
    .upsert(memberships, { onConflict: "household_id,user_id", ignoreDuplicates: true });
  if (membersError) {
    throw new Error(`Could not add household members: ${membersError.message}`);
  }
  return householdId;
}

async function upsertRows(
  supabase: SupabaseClient,
  table: string,
  rows: object[],
  onConflict = "id",
): Promise<void> {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) {
      throw new Error(`Could not upsert ${table} (rows ${start}-${start + batch.length - 1}): ${error.message}`);
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.local.`);
  }
  return value;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
