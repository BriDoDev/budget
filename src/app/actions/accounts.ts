"use server";

import { refresh } from "next/cache";
import { findAccountType } from "@/lib/accounts";
import { fail, readText, readUuid, succeed, todayIso, type ActionState } from "@/lib/actions/form";
import { parseAmountInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

/** Adds an account with its starting balance. For debts the balance is typed as the amount owed. */
export async function createAccount(previous: ActionState, formData: FormData): Promise<ActionState> {
  const budgetId = readUuid(formData, "budgetId");
  const name = readText(formData, "name");
  const type = findAccountType(readText(formData, "type"));
  const balance = parseAmountInput(readText(formData, "balance") || "0");
  if (!budgetId || !type) {
    return fail(previous, "Elige el tipo de cuenta.");
  }
  if (!name) {
    return fail(previous, "Ponle un nombre a la cuenta.");
  }
  if (balance === null) {
    return fail(previous, "Escribe un saldo válido.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_account", {
    p_budget_id: budgetId,
    p_name: name,
    p_type: type.value,
    p_on_budget: type.onBudget,
    p_starting_balance: type.isLiability ? -Math.abs(balance) : balance,
    p_date: todayIso(),
  });
  if (error) {
    return fail(previous, "No se pudo crear la cuenta.");
  }
  refresh();
  return succeed(previous, "Cuenta creada.");
}

export async function setAccountClosed(formData: FormData): Promise<void> {
  const accountId = readUuid(formData, "accountId");
  if (!accountId) {
    return;
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("accounts")
    .update({ closed: formData.get("closed") === "true" })
    .eq("id", accountId);
  if (error) {
    throw new Error("No se pudo actualizar la cuenta.");
  }
  refresh();
}
