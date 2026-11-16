"use server";

import { refresh } from "next/cache";
import { fail, readMonth, readUuid, succeed, type ActionState } from "@/lib/actions/form";
import { getBudgetMonthView } from "@/lib/data/budgets";
import { planGoalFunding } from "@/lib/goal-funding";
import { formatMilliunits, parseAmountInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

/** Sets the amount assigned to a category in a month. Raising it is limited to the money ready to assign. */
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

  const view = await getBudgetMonthView(budgetId, month);
  if (!view) {
    return fail(previous, "No se encontró el presupuesto.");
  }
  const current = view.groups.flatMap((group) => group.categories).find((category) => category.id === categoryId)?.assigned ?? 0;
  const spendable = Math.max(0, view.summary.readyToAssign);
  if (amount - current > spendable) {
    return fail(previous, `Solo tienes ${formatMilliunits(spendable, view.budget.currency)} listos para asignar.`);
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
  const view = await getBudgetMonthView(budgetId, month);
  if (!view) {
    return fail(previous, "No se encontró el presupuesto.");
  }
  // Money can only leave a place that has it: neither side may end up negative.
  const source = view.groups.flatMap((group) => group.categories).find((category) => category.id === from);
  const movable = Math.max(0, from ? (source?.available ?? 0) : view.summary.readyToAssign);
  if (amount > movable) {
    return fail(previous, `Solo hay ${formatMilliunits(movable, view.budget.currency)} disponibles para mover desde ahí.`);
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

/** Assigns what goals still need this month, in budget order, until the money ready to assign runs out. */
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

  const needs = view.groups
    .flatMap((group) => group.categories)
    .map((category) => ({ categoryId: category.id, assigned: category.assigned, underfunded: category.goal?.underfunded ?? 0 }))
    .filter((need) => need.underfunded > 0);
  if (needs.length === 0) {
    return succeed(previous, "Tus metas ya están cubiertas.");
  }
  const plan = planGoalFunding(needs, view.summary.readyToAssign);
  if (plan.assignments.length === 0) {
    return fail(previous, "No tienes dinero listo para asignar.");
  }

  const updatedAt = new Date().toISOString();
  const rows = plan.assignments.map((assignment) => ({
    budget_id: budgetId,
    category_id: assignment.categoryId,
    month,
    amount: assignment.amount,
    updated_at: updatedAt,
  }));

  const supabase = await createClient();
  const { error } = await supabase.from("month_assignments").upsert(rows, { onConflict: "category_id,month" });
  if (error) {
    return fail(previous, "No se pudieron cubrir las metas.");
  }
  refresh();
  return succeed(
    previous,
    plan.shortfall > 0
      ? `Se asignó todo lo disponible; a tus metas aún les faltan ${formatMilliunits(plan.shortfall, view.budget.currency)}.`
      : "",
  );
}
