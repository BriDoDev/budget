import { describe, expect, it } from "vitest";
import { buildBudgetMonthView, type BudgetRows } from "./budget-view";

const budgetId = "b1";

const rows: BudgetRows = {
  budget: {
    id: budgetId,
    household_id: "h1",
    name: "Hogar",
    currency_iso_code: "MXN",
    currency_decimal_digits: 2,
    imported_from: "ynab",
    imported_at: null,
  },
  accounts: [{ id: "checking", budget_id: budgetId, name: "Débito", type: "checking", on_budget: true, closed: false, note: null }],
  groups: [
    { id: "internal", budget_id: budgetId, name: "Internal Master Category", hidden: false, is_internal: true, sort_index: 0 },
    { id: "bills", budget_id: budgetId, name: "Gastos fijos", hidden: false, is_internal: false, sort_index: 1 },
  ],
  categories: [
    { id: "rta", budget_id: budgetId, group_id: "internal", name: "Inflow: Ready to Assign", kind: "income", hidden: false, note: null, linked_account_id: null, sort_index: 0 },
    { id: "rent", budget_id: budgetId, group_id: "bills", name: "Renta", kind: "standard", hidden: false, note: null, linked_account_id: null, sort_index: 1 },
    { id: "old", budget_id: budgetId, group_id: "bills", name: "Oculta", kind: "standard", hidden: true, note: null, linked_account_id: null, sort_index: 2 },
  ],
  assignments: [{ budget_id: budgetId, category_id: "rent", month: "2026-11-01", amount: 8_000_000 }],
  transactions: [
    { id: "t1", budget_id: budgetId, account_id: "checking", date: "2026-11-01", amount: 20_000_000, payee_id: null, category_id: "rta", memo: null, cleared: "cleared", approved: true, flag_color: null, transfer_account_id: null, transfer_transaction_id: null },
    { id: "t2", budget_id: budgetId, account_id: "checking", date: "2026-11-03", amount: -8_000_000, payee_id: null, category_id: "rent", memo: null, cleared: "cleared", approved: true, flag_color: null, transfer_account_id: null, transfer_transaction_id: null },
  ],
  subtransactions: [],
};

describe("buildBudgetMonthView", () => {
  it("summarizes the month and hides internal groups and hidden categories", () => {
    const view = buildBudgetMonthView(rows, "2026-11-01");

    expect(view.summary).toMatchObject({ income: 20_000_000, assigned: 8_000_000, readyToAssign: 12_000_000 });
    expect(view.previousMonth).toBe("2026-10-01");
    expect(view.nextMonth).toBe("2026-12-01");
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]).toMatchObject({ name: "Gastos fijos", assigned: 8_000_000, activity: -8_000_000, available: 0 });
    expect(view.groups[0].categories.map((category) => category.name)).toEqual(["Renta"]);
  });

  it("returns an empty summary for a month without data", () => {
    const view = buildBudgetMonthView({ ...rows, assignments: [], transactions: [] }, "2027-01-01");
    expect(view.summary.readyToAssign).toBe(0);
  });
});
