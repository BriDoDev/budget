import { describe, expect, it } from "vitest";
import { buildBudgetMonthView, type BudgetRows } from "./budget-view";
import type { CategoryRow } from "./db/types";

const budgetId = "b1";
const NO_GOAL = {
  goal_type: null,
  goal_target: null,
  goal_target_month: null,
  goal_cadence_months: 0,
  goal_needs_whole_amount: true,
  goal_due_day: null,
  goal_created_month: null,
} as const;

const category = (overrides: Partial<CategoryRow> & Pick<CategoryRow, "id" | "group_id" | "name">): CategoryRow => ({
  budget_id: budgetId,
  kind: "standard",
  hidden: false,
  note: null,
  linked_account_id: null,
  sort_index: 0,
  ...NO_GOAL,
  ...overrides,
});

const rows: BudgetRows = {
  budget: {
    id: budgetId,
    household_id: "h1",
    name: "Hogar",
    currency_iso_code: "MXN",
    currency_decimal_digits: 2,
    imported_from: "ynab",
    imported_at: null,
    ynab_server_knowledge: null,
  },
  groups: [
    { id: "internal", budget_id: budgetId, name: "Internal Master Category", hidden: false, is_internal: true, sort_index: 0 },
    { id: "cards", budget_id: budgetId, name: "Credit Card Payments", hidden: false, is_internal: false, sort_index: 1 },
    { id: "bills", budget_id: budgetId, name: "Gastos fijos", hidden: false, is_internal: false, sort_index: 2 },
  ],
  categories: [
    category({ id: "rta", group_id: "internal", name: "Inflow: Ready to Assign", kind: "income" }),
    category({ id: "visa-payment", group_id: "cards", name: "Visa", kind: "credit_card_payment", linked_account_id: "visa", sort_index: 1 }),
    category({ id: "rent", group_id: "bills", name: "Renta", sort_index: 2, goal_type: "monthly_funding", goal_target: 9_000_000, goal_created_month: "2026-01-01" }),
    category({ id: "food", group_id: "bills", name: "Súper", sort_index: 3 }),
    category({ id: "old", group_id: "bills", name: "Oculta", hidden: true, sort_index: 4 }),
  ],
  assignments: [
    { category_id: "rent", month: "2026-11-01", amount: 8_000_000 },
    { category_id: "food", month: "2026-11-01", amount: 3_000_000 },
  ],
  activity: [
    { kind: "activity", category_id: "rta", account_id: "checking", account_type: "checking", month: "2026-11-01", amount: 20_000_000 },
    { kind: "activity", category_id: "rent", account_id: "checking", account_type: "checking", month: "2026-11-01", amount: -8_000_000 },
    { kind: "activity", category_id: "food", account_id: "visa", account_type: "creditCard", month: "2026-11-01", amount: -1_200_000 },
    { kind: "payment", category_id: null, account_id: "visa", account_type: "creditCard", month: "2026-11-01", amount: -500_000 },
  ],
};

describe("buildBudgetMonthView", () => {
  const view = buildBudgetMonthView(rows, "2026-11-01");
  const line = (name: string) => view.groups.flatMap((group) => group.categories).find((entry) => entry.name === name);

  it("summarizes the month and hides internal groups and hidden categories", () => {
    expect(view.summary).toMatchObject({ income: 20_000_000, assigned: 11_000_000, readyToAssign: 9_000_000 });
    expect(view.previousMonth).toBe("2026-10-01");
    expect(view.nextMonth).toBe("2026-12-01");
    expect(view.groups.map((group) => group.name)).toEqual(["Credit Card Payments", "Gastos fijos"]);
    expect(view.groups[1].categories.map((entry) => entry.name)).toEqual(["Renta", "Súper"]);
  });

  it("funds the card payment category from covered card spending and card payments", () => {
    expect(line("Súper")).toMatchObject({ activity: -1_200_000, available: 1_800_000 });
    expect(line("Visa")).toMatchObject({ activity: 700_000, available: 700_000 });
  });

  it("reports what goals still need this month", () => {
    expect(line("Renta")?.goal).toMatchObject({ underfunded: 1_000_000, monthTarget: 9_000_000 });
    expect(line("Súper")?.goal).toBeNull();
    expect(view.underfunded).toBe(1_000_000);
  });

  it("returns an empty summary for a month without data", () => {
    const empty = buildBudgetMonthView({ ...rows, assignments: [], activity: [] }, "2027-01-01");
    expect(empty.summary.readyToAssign).toBe(0);
  });
});
