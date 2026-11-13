"use server";

import { refresh } from "next/cache";
import { fail, readMonth, readUuid, succeed, type ActionState } from "@/lib/actions/form";
import { getBudgetMonthView } from "@/lib/data/budgets";
import { parseAmountInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

/** Sets the amount assigned to a category in a month. */
export async function setAssignment(previous: ActionState, formData: FormData): Promise<ActionState> {
  const budgetId = readUuid(formData, "budgetId");
  const categoryId = readUuid(formData, "categoryId");
  const month = readMonth(formData, "month");
  const amount = parseAmountInput(formData.get("amount") as string | null);
  if (!budgetId || !categoryId || !month) {
    return fail(previous, "Faltan datos de la categoría.");
  }
  if (amount === null) {
    return fail(previous, "Escribe un monto válido.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("month_assignments").upsert(
    { budget_id: budgetId, category_id: categoryId, month, amount, updated_at: new Date().toISOString() },
    { onConflict: "category_id,month" },
  );
  if (error) {
    return fail(previous, "No se pudo guardar la asignación.");
  }
  refresh();
  return succeed(previous);
}

/** Moves assigned money between categories. An empty side means Ready to Assign. */
export async function moveMoney(previous: ActionState, formData: FormData): Promise<ActionState> {
  const budgetId = readUuid(formData, "budgetId");
  const month = readMonth(formData, "month");
  const from = readUuid(formData, "from");
  const to = readUuid(formData, "to");
  const amount = parseAmountInput(formData.get("amount") as string | null);
  if (!budgetId || !month) {
    return fail(previous, "Faltan datos del presupuesto.");
  }
  if (amount === null || amount <= 0) {
    return fail(previous, "Escribe un monto mayor a cero.");
  }
  if (from === to) {
    return fail(previous, "Elige un origen y un destino distintos.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("move_money", {
    p_budget_id: budgetId,
    p_month: month,
    p_from: from,
    p_to: to,
    p_amount: amount,
  });
  if (error) {
    return fail(previous, "No se pudo mover el dinero.");
  }
  refresh();
  return succeed(previous, "Dinero movido.");
}

/** Assigns to every category what its goal still needs this month. */
export async function fundGoals(previous: ActionState, formData: FormData): Promise<ActionState> {
  const budgetId = readUuid(formData, "budgetId");
  const month = readMonth(formData, "month");
  if (!budgetId || !month) {
    return fail(previous, "Faltan datos del presupuesto.");
  }
  const view = await getBudgetMonthView(budgetId, month);
  if (!view) {
    return fail(previous, "No se encontró el presupuesto.");
  }

  const updatedAt = new Date().toISOString();
  const rows = view.groups
    .flatMap((group) => group.categories)
    .filter((category) => (category.goal?.underfunded ?? 0) > 0)
    .map((category) => ({
      budget_id: budgetId,
      category_id: category.id,
      month,
      amount: category.assigned + (category.goal?.underfunded ?? 0),
      updated_at: updatedAt,
    }));
  if (rows.length === 0) {
    return succeed(previous, "Tus metas ya están cubiertas.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("month_assignments").upsert(rows, { onConflict: "category_id,month" });
  if (error) {
    return fail(previous, "No se pudieron cubrir las metas.");
  }
  refresh();
  return succeed(previous);
}
