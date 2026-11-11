"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  fail,
  readDate,
  readReturnPath,
  readText,
  readUuid,
  succeed,
  todayIso,
  type ActionState,
} from "@/lib/actions/form";
import { formatMilliunits, parseAmountInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { SPLIT_CATEGORY } from "@/lib/transaction-draft";

const CLEARED_STATES = new Set(["cleared", "uncleared"]);
const FLAG_COLORS = new Set(["red", "orange", "yellow", "green", "blue", "purple"]);

interface SplitInput {
  categoryId: string;
  amount: string;
  memo?: string;
}

/** Creates or edits a transaction, including transfers and splits. */
export async function saveTransaction(previous: ActionState, formData: FormData): Promise<ActionState> {
  const budgetId = readUuid(formData, "budgetId");
  const accountId = readUuid(formData, "accountId");
  const date = readDate(formData, "date");
  const transactionId = readText(formData, "id");
  if (!budgetId || !accountId) {
    return fail(previous, "Elige una cuenta.");
  }
  if (!date) {
    return fail(previous, "Elige una fecha válida.");
  }

  const outflow = parseAmountInput(readText(formData, "outflow") || "0");
  const inflow = parseAmountInput(readText(formData, "inflow") || "0");
  if (outflow === null || inflow === null || outflow < 0 || inflow < 0) {
    return fail(previous, "Escribe los montos como números positivos.");
  }
  const amount = inflow - outflow;
  if (amount === 0) {
    return fail(previous, "Escribe un monto en salida o en entrada.");
  }

  const categoryChoice = readText(formData, "categoryId");
  const splits = categoryChoice === SPLIT_CATEGORY ? parseSplits(formData, amount) : [];
  if (splits === null) {
    return fail(previous, "Cada parte necesita un monto, y juntas deben sumar el total.");
  }

  const flag = readText(formData, "flagColor");
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_transaction", {
    p: {
      id: transactionId,
      budget_id: budgetId,
      account_id: accountId,
      date,
      amount,
      payee_name: readText(formData, "payeeName"),
      category_id: readUuid(formData, "categoryId") ?? "",
      transfer_account_id: readUuid(formData, "transferAccountId") ?? "",
      memo: readText(formData, "memo"),
      cleared: formData.get("cleared") === "on" ? "cleared" : "uncleared",
      flag_color: FLAG_COLORS.has(flag) ? flag : "",
      splits,
    },
  });
  if (error) {
    return fail(previous, "No se pudo guardar la transacción.");
  }

  if (transactionId) {
    revalidateBudgetLayout();
    redirect(readReturnPath(formData, `/budgets/${budgetId}/accounts/${accountId}`));
  }
  refresh();
  return succeed(previous, "Transacción guardada.");
}

export async function deleteTransaction(formData: FormData): Promise<void> {
  const budgetId = readUuid(formData, "budgetId");
  const transactionId = readText(formData, "id");
  if (!budgetId || !transactionId) {
    return;
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_transaction", { p_id: transactionId });
  if (error) {
    throw new Error("No se pudo eliminar la transacción.");
  }
  revalidateBudgetLayout();
  redirect(readReturnPath(formData, `/budgets/${budgetId}/accounts`));
}

/** Switches a transaction between cleared and uncleared. Reconciled transactions stay locked. */
export async function setCleared(formData: FormData): Promise<void> {
  const transactionId = readText(formData, "id");
  const cleared = readText(formData, "cleared");
  if (!transactionId || !CLEARED_STATES.has(cleared)) {
    return;
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({ cleared })
    .eq("id", transactionId)
    .neq("cleared", "reconciled");
  if (error) {
    throw new Error("No se pudo actualizar la transacción.");
  }
  refresh();
}

export async function approveTransaction(formData: FormData): Promise<void> {
  const transactionId = readText(formData, "id");
  if (!transactionId) {
    return;
  }
  const supabase = await createClient();
  const { error } = await supabase.from("transactions").update({ approved: true }).eq("id", transactionId);
  if (error) {
    throw new Error("No se pudo aprobar la transacción.");
  }
  refresh();
}

/** Reconciles an account against the balance shown by the bank. */
export async function reconcileAccount(previous: ActionState, formData: FormData): Promise<ActionState> {
  const accountId = readUuid(formData, "accountId");
  const statementBalance = parseAmountInput(formData.get("statementBalance") as string | null);
  if (!accountId) {
    return fail(previous, "Elige una cuenta.");
  }
  if (statementBalance === null) {
    return fail(previous, "Escribe el saldo que muestra tu banco.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reconcile_account", {
    p_account_id: accountId,
    p_statement_balance: statementBalance,
    p_date: todayIso(),
  });
  if (error) {
    return fail(previous, "No se pudo conciliar la cuenta.");
  }
  refresh();
  const adjustment = Number(data ?? 0);
  return succeed(
    previous,
    adjustment === 0
      ? "Cuenta conciliada sin ajustes."
      : `Cuenta conciliada con un ajuste de ${formatMilliunits(adjustment, { isoCode: readText(formData, "currency") || "MXN", decimalDigits: 2 })}.`,
  );
}

/** A redirect keeps the sidebar it already has, so its balances are invalidated explicitly. */
function revalidateBudgetLayout(): void {
  revalidatePath("/budgets/[budgetId]", "layout");
}

/** Parses split rows; amounts are typed as positive numbers and take the sign of the total. */
function parseSplits(formData: FormData, total: number): Array<{ amount: number; category_id: string; memo: string }> | null {
  let inputs: SplitInput[];
  try {
    inputs = JSON.parse(readText(formData, "splits") || "[]") as SplitInput[];
  } catch {
    return null;
  }
  if (!Array.isArray(inputs) || inputs.length < 2) {
    return null;
  }
  const sign = total < 0 ? -1 : 1;
  const splits = [];
  for (const input of inputs) {
    const amount = parseAmountInput(input.amount);
    if (amount === null || amount <= 0) {
      return null;
    }
    splits.push({ amount: sign * amount, category_id: input.categoryId ?? "", memo: input.memo ?? "" });
  }
  return splits.reduce((sum, split) => sum + split.amount, 0) === total ? splits : null;
}
