import type { GoalType } from "./budget-engine/goals";
import type { CategoryRow } from "./db/types";
import { formatMilliunits, type CurrencySettings } from "./money";

/** Name YNAB gives the group that holds one payment category per credit card. */
export const CREDIT_CARD_PAYMENTS_GROUP = "Credit Card Payments";

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  monthly_funding: "Asignar un monto cada mes",
  needed_spending: "Tener un monto listo para gastar",
  target_balance: "Llegar a un saldo",
  target_balance_by_date: "Llegar a un saldo para una fecha",
};

/** Group name for display; the built-in credit card group is stored in English. */
export function groupLabel(name: string): string {
  return name === CREDIT_CARD_PAYMENTS_GROUP ? "Pagos de tarjetas de crédito" : name;
}

export function formatMonthName(month: string): string {
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month.slice(0, 7)}-01T00:00:00Z`),
  );
}

/** One-line description of a category goal, or null when it has none. */
export function describeGoal(
  category: Pick<CategoryRow, "goal_type" | "goal_target" | "goal_target_month" | "goal_cadence_months" | "goal_needs_whole_amount">,
  currency: CurrencySettings,
): string | null {
  if (!category.goal_type || !category.goal_target) {
    return null;
  }
  const amount = formatMilliunits(category.goal_target, currency);
  switch (category.goal_type) {
    case "monthly_funding":
      return `Asignar ${amount} cada mes`;
    case "target_balance":
      return `Llegar a ${amount}`;
    case "target_balance_by_date":
      return category.goal_target_month ? `Llegar a ${amount} para ${formatMonthName(category.goal_target_month)}` : `Llegar a ${amount}`;
    case "needed_spending": {
      const every = category.goal_cadence_months > 1 ? `cada ${category.goal_cadence_months} meses` : "cada mes";
      const due = category.goal_cadence_months > 1 && category.goal_target_month ? `, próximo en ${formatMonthName(category.goal_target_month)}` : "";
      const mode = category.goal_needs_whole_amount ? "" : " (rellenando lo que falte)";
      return `Tener ${amount} para gastar ${every}${due}${mode}`;
    }
  }
}
