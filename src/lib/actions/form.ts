import { isMonthKey, toMonthKey, type MonthKey } from "../month";

/** Result of a form action. `version` grows on every success so forms can reset themselves. */
export interface ActionState {
  ok: boolean;
  message: string;
  version: number;
}

export const IDLE_STATE: ActionState = { ok: false, message: "", version: 0 };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_INPUT_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function succeed(previous: ActionState, message = ""): ActionState {
  return { ok: true, message, version: previous.version + 1 };
}

export function fail(previous: ActionState, message: string): ActionState {
  return { ok: false, message, version: previous.version };
}

export function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function readUuid(formData: FormData, name: string): string | null {
  const value = readText(formData, name);
  return UUID_PATTERN.test(value) ? value : null;
}

export function readDate(formData: FormData, name: string): string | null {
  const value = readText(formData, name);
  return ISO_DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
}

/** Accepts "YYYY-MM" (month inputs) or a full month key. */
export function readMonth(formData: FormData, name: string): MonthKey | null {
  const value = readText(formData, name);
  if (MONTH_INPUT_PATTERN.test(value)) {
    return toMonthKey(value);
  }
  return isMonthKey(value) ? value : null;
}

/** Only in-app budget paths are accepted as redirect targets. */
export function readReturnPath(formData: FormData, fallback: string): string {
  const value = readText(formData, "returnTo");
  return value.startsWith("/budgets/") && !value.includes("//") ? value : fallback;
}

export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
