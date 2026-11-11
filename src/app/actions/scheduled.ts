"use server";

import { refresh } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fail, readDate, readText, readUuid, succeed, type ActionState } from "@/lib/actions/form";
import type { ScheduledListItem } from "@/lib/data/transactions";
import { parseAmountInput } from "@/lib/money";
import { isFrequency, nextOccurrence } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

export async function createScheduledTransaction(previous: ActionState, formData: FormData): Promise<ActionState> {
  const budgetId = readUuid(formData, "budgetId");
  const accountId = readUuid(formData, "accountId");
  const date = readDate(formData, "date");
  const frequency = readText(formData, "frequency");
  if (!budgetId || !accountId) {
    return fail(previous, "Elige una cuenta.");
  }
  if (!date || !isFrequency(frequency)) {
    return fail(previous, "Elige la fecha y la frecuencia.");
  }
  const outflow = parseAmountInput(readText(formData, "outflow") || "0");
  const inflow = parseAmountInput(readText(formData, "inflow") || "0");
  if (outflow === null || inflow === null || inflow - outflow === 0) {
    return fail(previous, "Escribe un monto en salida o en entrada.");
  }

  const supabase = await createClient();
  const transferAccountId = readUuid(formData, "transferAccountId");
  const payeeName = readText(formData, "payeeName");
  const payeeId = transferAccountId || !payeeName ? null : await findOrCreatePayee(supabase, budgetId, payeeName);

  const { error } = await supabase.from("scheduled_transactions").insert({
    budget_id: budgetId,
    account_id: accountId,
    date_first: date,
    date_next: date,
    frequency,
    amount: inflow - outflow,
    payee_id: payeeId,
    category_id: transferAccountId ? null : readUuid(formData, "categoryId"),
    memo: readText(formData, "memo") || null,
    transfer_account_id: transferAccountId,
  });
  if (error) {
    return fail(previous, "No se pudo programar la transacción.");
  }
  refresh();
  return succeed(previous, "Transacción programada.");
}

/**
 * Advances a scheduled transaction to its next date. With `enter` it first
 * records the occurrence as a real transaction. One-time schedules are removed.
 */
export async function advanceScheduledTransaction(formData: FormData): Promise<void> {
  const scheduledId = readUuid(formData, "id");
  const shouldEnter = formData.get("enter") === "true";
  if (!scheduledId) {
    return;
  }

  const supabase = await createClient();
  const { data: scheduled, error: readError } = await supabase
    .from("scheduled_transactions")
    .select(
      "id, budget_id, account_id, date_first, date_next, frequency, amount, payee_id, category_id, memo, flag_color, transfer_account_id, " +
        "payee:payees(name), category:categories(name), scheduled_subtransactions(amount, category_id, memo)",
    )
    .eq("id", scheduledId)
    .maybeSingle()
    .overrideTypes<ScheduledListItem, { merge: false }>();
  if (readError || !scheduled) {
    throw new Error("No se encontró la transacción programada.");
  }

  if (shouldEnter) {
    const { error } = await supabase.rpc("save_transaction", {
      p: {
        budget_id: scheduled.budget_id,
        account_id: scheduled.account_id,
        date: scheduled.date_next,
        amount: scheduled.amount,
        payee_name: scheduled.payee?.name ?? "",
        category_id: scheduled.category_id ?? "",
        transfer_account_id: scheduled.transfer_account_id ?? "",
        memo: scheduled.memo ?? "",
        cleared: "uncleared",
        flag_color: scheduled.flag_color ?? "",
        splits: scheduled.scheduled_subtransactions.map((split) => ({
          amount: split.amount,
          category_id: split.category_id ?? "",
          memo: split.memo ?? "",
        })),
      },
    });
    if (error) {
      throw new Error("No se pudo registrar la transacción.");
    }
  }

  const nextDate = nextOccurrence(scheduled.date_next, scheduled.frequency, scheduled.date_first);
  const { error } = nextDate
    ? await supabase.from("scheduled_transactions").update({ date_next: nextDate }).eq("id", scheduledId)
    : await supabase.from("scheduled_transactions").delete().eq("id", scheduledId);
  if (error) {
    throw new Error("No se pudo actualizar la transacción programada.");
  }
  refresh();
}

export async function deleteScheduledTransaction(formData: FormData): Promise<void> {
  const scheduledId = readUuid(formData, "id");
  if (!scheduledId) {
    return;
  }
  const supabase = await createClient();
  const { error } = await supabase.from("scheduled_transactions").delete().eq("id", scheduledId);
  if (error) {
    throw new Error("No se pudo eliminar la transacción programada.");
  }
  refresh();
}

async function findOrCreatePayee(supabase: SupabaseClient, budgetId: string, name: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from("payees")
    .select("id")
    .eq("budget_id", budgetId)
    .is("transfer_account_id", null)
    .ilike("name", name.replace(/[%_\\]/g, "\\$&"))
    .limit(1)
    .maybeSingle();
  if (existing) {
    return existing.id as string;
  }
  const { data: created } = await supabase.from("payees").insert({ budget_id: budgetId, name }).select("id").single();
  return (created?.id as string | undefined) ?? null;
}
