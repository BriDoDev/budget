"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { fail, readText, readUuid, succeed, type ActionState } from "@/lib/actions/form";
import { normalizeEmail } from "@/lib/auth/allowed-emails";
import { createClient } from "@/lib/supabase/server";
import { YnabApiError } from "@/lib/ynab/client";
import { syncYnabPlan } from "@/lib/ynab/sync";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/;

export async function createHousehold(previous: ActionState, formData: FormData): Promise<ActionState> {
  const name = readText(formData, "name");
  if (!name) {
    return fail(previous, "Ponle un nombre a tu hogar.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_household", { household_name: name });
  if (error) {
    return fail(previous, "No se pudo crear el hogar.");
  }
  refresh();
  return succeed(previous);
}

export async function createBudget(previous: ActionState, formData: FormData): Promise<ActionState> {
  const householdId = readUuid(formData, "householdId");
  const name = readText(formData, "name");
  const currency = readText(formData, "currency") || "MXN";
  if (!householdId || !name) {
    return fail(previous, "Ponle un nombre al presupuesto.");
  }
  if (!CURRENCY_PATTERN.test(currency)) {
    return fail(previous, "La moneda debe ser un código de tres letras, como MXN.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_budget", {
    target_household_id: householdId,
    budget_name: name,
    currency,
  });
  if (error || !data) {
    return fail(previous, "No se pudo crear el presupuesto.");
  }
  redirect(`/budgets/${data as string}`);
}

/** Lets another e-mail sign in and join the household on their first visit. */
export async function inviteMember(previous: ActionState, formData: FormData): Promise<ActionState> {
  const householdId = readUuid(formData, "householdId");
  const email = normalizeEmail(readText(formData, "email"));
  if (!householdId || !EMAIL_PATTERN.test(email)) {
    return fail(previous, "Escribe un correo válido.");
  }
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { error } = await supabase
    .from("household_invites")
    .upsert(
      { household_id: householdId, email, invited_by: claims?.claims.sub ?? null },
      { onConflict: "household_id,email" },
    );
  if (error) {
    return fail(previous, "No se pudo guardar la invitación.");
  }
  refresh();
  return succeed(previous, `Listo. ${email} ya puede entrar con su correo.`);
}

export async function revokeInvite(formData: FormData): Promise<void> {
  const householdId = readUuid(formData, "householdId");
  const email = normalizeEmail(readText(formData, "email"));
  if (!householdId || !email) {
    return;
  }
  const supabase = await createClient();
  const { error } = await supabase.from("household_invites").delete().eq("household_id", householdId).eq("email", email);
  if (error) {
    throw new Error("No se pudo quitar la invitación.");
  }
  refresh();
}

/** Pulls changes from YNAB using the token configured on the server. */
export async function syncFromYnab(previous: ActionState, formData: FormData): Promise<ActionState> {
  const householdId = readUuid(formData, "householdId");
  const accessToken = process.env.YNAB_ACCESS_TOKEN;
  if (!householdId) {
    return fail(previous, "Falta el hogar.");
  }
  if (!accessToken) {
    return fail(previous, "Falta YNAB_ACCESS_TOKEN en la configuración del servidor.");
  }

  const supabase = await createClient();
  try {
    const result = await syncYnabPlan(supabase, {
      accessToken,
      planId: readText(formData, "planId") || process.env.YNAB_PLAN_ID || "last-used",
      householdId,
    });
    refresh();
    const changes = Object.values(result.upserted).reduce((sum, count) => sum + count, 0) + result.deleted;
    return succeed(
      previous,
      result.mode === "full"
        ? `Se importó "${result.budgetName}" completo.`
        : `"${result.budgetName}" actualizado: ${changes} cambios traídos de YNAB.`,
    );
  } catch (error) {
    if (error instanceof YnabApiError && error.status === 401) {
      return fail(previous, "YNAB rechazó el token. Genera uno nuevo y actualiza YNAB_ACCESS_TOKEN.");
    }
    console.error("YNAB sync failed", error);
    return fail(previous, "No se pudo sincronizar con YNAB.");
  }
}
