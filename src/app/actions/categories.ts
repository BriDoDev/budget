"use server";

import { refresh } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CREDIT_CARD_PAYMENTS_GROUP } from "@/lib/categories";
import { fail, readMonth, readText, readUuid, succeed, type ActionState } from "@/lib/actions/form";
import type { GoalType } from "@/lib/budget-engine";
import { currentMonthKey } from "@/lib/month";
import { parseAmountInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const GOAL_TYPES: ReadonlySet<string> = new Set<GoalType>([
  "monthly_funding",
  "needed_spending",
  "target_balance",
  "target_balance_by_date",
]);
const SORTABLE_TABLES = { category: "categories", group: "category_groups" } as const;

export async function createCategoryGroup(previous: ActionState, formData: FormData): Promise<ActionState> {
  const budgetId = readUuid(formData, "budgetId");
  const name = readText(formData, "name");
  if (!budgetId || !name) {
    return fail(previous, "Ponle un nombre al grupo.");
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("category_groups")
    .insert({ budget_id: budgetId, name, sort_index: await nextSortIndex(supabase, "category_groups", budgetId) });
  if (error) {
    return fail(previous, "No se pudo crear el grupo.");
  }
  refresh();
  return succeed(previous);
}

export async function createCategory(previous: ActionState, formData: FormData): Promise<ActionState> {
  const budgetId = readUuid(formData, "budgetId");
  const groupId = readUuid(formData, "groupId");
  const name = readText(formData, "name");
  if (!budgetId || !groupId || !name) {
    return fail(previous, "Ponle un nombre a la categoría.");
  }
  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({
    budget_id: budgetId,
    group_id: groupId,
    name,
    sort_index: await nextSortIndex(supabase, "categories", budgetId),
  });
  if (error) {
    return fail(previous, "No se pudo crear la categoría.");
  }
  refresh();
  return succeed(previous);
}

export async function updateCategoryGroup(previous: ActionState, formData: FormData): Promise<ActionState> {
  const groupId = readUuid(formData, "groupId");
  const name = readText(formData, "name");
  if (!groupId || !name) {
    return fail(previous, "El grupo necesita un nombre.");
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("category_groups")
    .update({ name, hidden: formData.get("hidden") === "on" })
    .eq("id", groupId);
  if (error) {
    return fail(previous, "No se pudo guardar el grupo.");
  }
  refresh();
  return succeed(previous, "Guardado.");
}

/** Saves name, note, group, visibility and goal of a category. */
export async function updateCategory(previous: ActionState, formData: FormData): Promise<ActionState> {
  const categoryId = readUuid(formData, "categoryId");
  const name = readText(formData, "name");
  if (!categoryId || !name) {
    return fail(previous, "La categoría necesita un nombre.");
  }

  const goalChoice = readText(formData, "goalType");
  const goalType = GOAL_TYPES.has(goalChoice) ? (goalChoice as GoalType) : null;
  const goalTarget = goalType ? parseAmountInput(readText(formData, "goalTarget")) : null;
  const goalMonth = readMonth(formData, "goalTargetMonth");
  const repeatMonths = Number(readText(formData, "goalRepeat")) || 0;
  const dueDayChoice = Number(readText(formData, "goalDueDay"));
  const dueDay = Number.isInteger(dueDayChoice) && dueDayChoice >= 1 && dueDayChoice <= 31 ? dueDayChoice : null;
  if (goalType && (goalTarget === null || goalTarget <= 0)) {
    return fail(previous, "Escribe el monto de la meta.");
  }
  if (goalType === "target_balance_by_date" && !goalMonth) {
    return fail(previous, "Elige el mes en que quieres llegar al saldo.");
  }
  if (goalType === "needed_spending" && repeatMonths > 1 && !goalMonth) {
    return fail(previous, "Elige el mes del próximo vencimiento.");
  }

  const usesMonth = goalType === "target_balance_by_date" || (goalType === "needed_spending" && repeatMonths > 1);
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("categories")
    .select("budget_id, group_id, kind, goal_type, goal_created_month")
    .eq("id", categoryId)
    .maybeSingle();
  if (readError || !current) {
    return fail(previous, "No se encontró la categoría.");
  }

  // Moving to another group puts the category at the end of it; card payment categories stay in theirs.
  const groupId = readUuid(formData, "groupId");
  const move: { group_id?: string; sort_index?: number } = {};
  if (groupId && groupId !== current.group_id && current.kind === "standard") {
    const { data: group } = await supabase
      .from("category_groups")
      .select("id, name, is_internal")
      .eq("id", groupId)
      .eq("budget_id", current.budget_id)
      .maybeSingle();
    if (!group || group.is_internal || group.name === CREDIT_CARD_PAYMENTS_GROUP) {
      return fail(previous, "No se puede mover la categoría a ese grupo.");
    }
    move.group_id = groupId;
    move.sort_index = await nextSortIndex(supabase, "categories", current.budget_id);
  }

  const { error } = await supabase
    .from("categories")
    .update({
      ...move,
      name,
      note: readText(formData, "note") || null,
      hidden: formData.get("hidden") === "on",
      goal_type: goalType,
      goal_target: goalType ? goalTarget : null,
      goal_target_month: usesMonth ? goalMonth : null,
      goal_cadence_months: goalType === "needed_spending" ? Math.max(1, repeatMonths) : 0,
      goal_needs_whole_amount: formData.get("goalRefill") !== "on",
      goal_due_day: goalType && goalType !== "target_balance" ? dueDay : null,
      // A goal keeps its start month while its type stays the same.
      goal_created_month: goalType
        ? current.goal_type === goalType && current.goal_created_month
          ? current.goal_created_month
          : currentMonthKey()
        : null,
    })
    .eq("id", categoryId);
  if (error) {
    return fail(previous, "No se pudo guardar la categoría.");
  }
  refresh();
  return succeed(previous, "Guardado.");
}

/** Moves a category or a group one position up or down among its siblings. */
export async function moveSortable(formData: FormData): Promise<void> {
  const kind = readText(formData, "kind") as keyof typeof SORTABLE_TABLES;
  const table = SORTABLE_TABLES[kind];
  const id = readUuid(formData, "id");
  const direction = readText(formData, "direction") === "up" ? -1 : 1;
  if (!table || !id) {
    return;
  }

  const supabase = await createClient();
  const { data: target } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  if (!target) {
    return;
  }
  let siblingsQuery = supabase.from(table).select("id, sort_index").eq("budget_id", target.budget_id);
  if (kind === "category") {
    siblingsQuery = siblingsQuery.eq("group_id", target.group_id);
  }
  const { data: siblings } = await siblingsQuery.order("sort_index").order("id");
  const ordered = (siblings ?? []) as Array<{ id: string; sort_index: number }>;
  const index = ordered.findIndex((row) => row.id === id);
  const neighbor = ordered[index + direction];
  if (index < 0 || !neighbor) {
    return;
  }

  // Rewrites every position so ties (imports number rows globally) cannot block the swap.
  [ordered[index], ordered[index + direction]] = [neighbor, ordered[index]];
  const base = Math.min(...ordered.map((row) => row.sort_index));
  for (const [position, row] of ordered.entries()) {
    const { error } = await supabase.from(table).update({ sort_index: base + position }).eq("id", row.id);
    if (error) {
      throw new Error("No se pudo reordenar.");
    }
  }
  refresh();
}

async function nextSortIndex(supabase: SupabaseClient, table: string, budgetId: string): Promise<number> {
  const { data } = await supabase
    .from(table)
    .select("sort_index")
    .eq("budget_id", budgetId)
    .order("sort_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data?.sort_index as number | undefined) ?? 0) + 1;
}

/**
 * Drops a category at a position: into `groupId`, right before `beforeId`, or
 * at the end of the group when `beforeId` is null. Used by drag and drop.
 */
export async function placeCategory(categoryId: string, groupId: string, beforeId: string | null): Promise<void> {
  const supabase = await createClient();
  const { data: category } = await supabase
    .from("categories")
    .select("id, budget_id, group_id, kind")
    .eq("id", categoryId)
    .maybeSingle();
  if (!category) {
    return;
  }
  if (groupId !== category.group_id) {
    const { data: group } = await supabase
      .from("category_groups")
      .select("id, name, is_internal")
      .eq("id", groupId)
      .eq("budget_id", category.budget_id)
      .maybeSingle();
    // Card payment categories live in their own group, and nothing else moves into it.
    if (!group || group.is_internal || group.name === CREDIT_CARD_PAYMENTS_GROUP || category.kind !== "standard") {
      return;
    }
  }

  const { data: siblings } = await supabase
    .from("categories")
    .select("id, sort_index")
    .eq("budget_id", category.budget_id)
    .eq("group_id", groupId)
    .neq("id", categoryId)
    .order("sort_index")
    .order("id");
  const ordered = ((siblings ?? []) as Array<{ id: string; sort_index: number }>).map((row) => row.id);
  const position = beforeId ? ordered.indexOf(beforeId) : -1;
  ordered.splice(position < 0 ? ordered.length : position, 0, categoryId);

  // Rewrites every position of the group so ties left by imports cannot scramble the order.
  const base = Math.min(0, ...(siblings ?? []).map((row) => row.sort_index as number));
  for (const [index, id] of ordered.entries()) {
    const { error } = await supabase
      .from("categories")
      .update(id === categoryId ? { group_id: groupId, sort_index: base + index } : { sort_index: base + index })
      .eq("id", id);
    if (error) {
      throw new Error("No se pudo mover la categoría.");
    }
  }
  refresh();
}
