import { describe, expect, it } from "vitest";
import { mapPlanExport } from "./map";
import { comparePlanWithEngine } from "./parity";
import type { YnabPlan } from "./types";

const base = { hidden: false, note: null, deleted: false };
const plan: YnabPlan = {
  id: "plan-1",
  name: "Hogar",
  first_month: "2026-11-01",
  last_month: "2026-11-01",
  currency_format: { iso_code: "MXN", decimal_digits: 2 },
  accounts: [{ id: "checking", name: "Débito", type: "checking", on_budget: true, closed: false, note: null, deleted: false }],
  payees: [],
  category_groups: [
    { id: "internal", name: "Internal Master Category", hidden: false, internal: true, deleted: false },
    { id: "bills", name: "Gastos fijos", hidden: false, deleted: false },
  ],
  categories: [
    { ...base, id: "rta", category_group_id: "internal", name: "Inflow: Ready to Assign", internal: true, budgeted: 0 },
    { ...base, id: "rent", category_group_id: "bills", name: "Renta", budgeted: 8_000 },
    { ...base, id: "power", category_group_id: "bills", name: "Luz", budgeted: 500 },
  ],
  months: [
    {
      month: "2026-11-01",
      to_be_budgeted: 11_500,
      deleted: false,
      categories: [
        { ...base, id: "rent", category_group_id: "bills", name: "Renta", budgeted: 8_000, balance: 0 },
        { ...base, id: "power", category_group_id: "bills", name: "Luz", budgeted: 500, balance: 999 },
      ],
    },
  ],
  transactions: [
    { id: "t1", date: "2026-11-01", amount: 20_000, memo: null, cleared: "cleared", approved: true, flag_color: null, account_id: "checking", payee_id: null, category_id: "rta", transfer_account_id: null, transfer_transaction_id: null, deleted: false },
    { id: "t2", date: "2026-11-02", amount: -8_000, memo: null, cleared: "cleared", approved: true, flag_color: null, account_id: "checking", payee_id: null, category_id: "rent", transfer_account_id: null, transfer_transaction_id: null, deleted: false },
  ],
  subtransactions: [],
};

describe("comparePlanWithEngine", () => {
  it("reports where our engine and YNAB disagree for a month", () => {
    const rows = mapPlanExport(plan, { householdId: "home", importedAt: "2026-11-11T00:00:00.000Z" });
    const report = comparePlanWithEngine(plan, rows, "2026-11-01");

    expect(report.readyToAssign).toEqual({ ynab: 11_500, ours: 11_500 });
    expect(report.categoriesCompared).toBe(2);
    expect(report.mismatches).toEqual([{ name: "Luz", ynab: 999, ours: 500 }]);
  });
});
