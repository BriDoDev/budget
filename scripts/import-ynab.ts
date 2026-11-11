/**
 * Syncs a YNAB plan into the household database (one way, YNAB → app).
 *
 *   pnpm import:ynab
 *
 * The first run imports the whole plan and prints how our numbers compare with
 * YNAB's. Later runs only fetch what changed in YNAB since the previous one.
 *
 * Reads YNAB_ACCESS_TOKEN, YNAB_PLAN_ID, ALLOWED_EMAILS, HOUSEHOLD_NAME and the
 * Supabase variables from .env.local. Every e-mail in ALLOWED_EMAILS must have
 * signed in once (magic link) so its user exists; the first one owns the household.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAllowedEmails } from "../src/lib/auth/allowed-emails";
import { formatMilliunits } from "../src/lib/money";
import { currentMonthKey } from "../src/lib/month";
import { createAdminClient } from "../src/lib/supabase/admin";
import { comparePlanWithEngine } from "../src/lib/ynab/parity";
import { syncYnabPlan } from "../src/lib/ynab/sync";

const USERS_PAGE_SIZE = 1000;
const MAX_MISMATCHES_SHOWN = 10;

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

  console.log(`Syncing YNAB plan "${planId}"…`);
  const result = await syncYnabPlan(supabase, { accessToken, planId, householdId });

  console.log(`${result.mode === "full" ? "Imported" : "Updated"} "${result.budgetName}" (${result.mode} sync):`);
  console.table({ ...result.upserted, deleted: result.deleted });

  if (result.mode === "full") {
    printParity(result);
  }
}

function printParity(result: Awaited<ReturnType<typeof syncYnabPlan>>): void {
  const report = comparePlanWithEngine(result.plan, result.rows, currentMonthKey());
  const currency = {
    isoCode: result.rows.budget.currency_iso_code,
    decimalDigits: result.rows.budget.currency_decimal_digits,
  };
  const money = (amount: number) => formatMilliunits(amount, currency);

  console.log(`\nCheck against YNAB for ${report.month.slice(0, 7)}:`);
  if (report.readyToAssign) {
    const { ynab, ours } = report.readyToAssign;
    console.log(`  Ready to Assign: YNAB ${money(ynab)}, this app ${money(ours)}${ynab === ours ? " ✓" : " ✗"}`);
  }
  const matching = report.categoriesCompared - report.mismatches.length;
  console.log(`  Category balances: ${matching} of ${report.categoriesCompared} match`);
  for (const mismatch of report.mismatches.slice(0, MAX_MISMATCHES_SHOWN)) {
    console.log(`    ${mismatch.name}: YNAB ${money(mismatch.ynab)}, this app ${money(mismatch.ours)}`);
  }
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
