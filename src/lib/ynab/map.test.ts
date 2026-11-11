import { describe, expect, it } from "vitest";
import { mapPlanExport } from "./map";
import type { YnabCategory, YnabPlan, YnabTransaction } from "./types";

const category = (overrides: Partial<YnabCategory> & Pick<YnabCategory, "id" | "category_group_id" | "name">): YnabCategory => ({
  hidden: false,
  note: null,
  budgeted: 0,
  deleted: false,
  ...overrides,
});

const transaction = (overrides: Partial<YnabTransaction> & Pick<YnabTransaction, "id">): YnabTransaction => ({
  date: "2026-01-10",
  amount: -1_000,
  memo: null,
  cleared: "cleared",
  approved: true,
  flag_color: null,
  account_id: "checking",
  payee_id: null,
  category_id: null,
  transfer_account_id: null,
  transfer_transaction_id: null,
  deleted: false,
  ...overrides,
});

const plan: YnabPlan = {
  id: "plan-1",
  name: "Household",
  first_month: "2026-01-01",
  last_month: "2026-02-01",
  currency_format: { iso_code: "MXN", decimal_digits: 2 },
  accounts: [
    { id: "checking", name: "Checking", type: "checking", on_budget: true, closed: false, note: null, deleted: false },
    { id: "visa", name: "Visa", type: "creditCard", on_budget: true, closed: false, note: null, deleted: false },
    { id: "old", name: "Old", type: "savings", on_budget: true, closed: true, note: null, deleted: true },
  ],
  payees: [
    { id: "store", name: "Store", transfer_account_id: null, deleted: false },
    { id: "gone", name: "Gone", transfer_account_id: null, deleted: true },
  ],
  category_groups: [
    { id: "internal", name: "Internal Master Category", hidden: false, internal: true, deleted: false },
    { id: "cc", name: "Credit Card Payments", hidden: false, deleted: false },
    { id: "bills", name: "Bills", hidden: false, deleted: false },
  ],
  categories: [
    category({ id: "rta", category_group_id: "internal", name: "Inflow: Ready to Assign", internal: true }),
    category({ id: "uncategorized", category_group_id: "internal", name: "Uncategorized", internal: true }),
    category({ id: "visa-payment", category_group_id: "cc", name: "Visa" }),
    category({ id: "rent", category_group_id: "bills", name: "Rent" }),
    category({ id: "deleted-cat", category_group_id: "bills", name: "Old", deleted: true }),
  ],
  months: [
    {
      month: "2026-01-01",
      deleted: false,
      categories: [
        category({ id: "rent", category_group_id: "bills", name: "Rent", budgeted: 500_000 }),
        category({ id: "rta", category_group_id: "internal", name: "Inflow: Ready to Assign", budgeted: 0 }),
        category({ id: "visa-payment", category_group_id: "cc", name: "Visa", budgeted: 0 }),
      ],
    },
  ],
  transactions: [
    transaction({ id: "t1", payee_id: "store", category_id: "rent", amount: -500_000 }),
    transaction({ id: "t2", payee_id: "gone", category_id: "deleted-cat" }),
    transaction({ id: "t3", account_id: "old" }),
    transaction({ id: "t4", deleted: true }),
  ],
  subtransactions: [
    { id: "s1", transaction_id: "t1", amount: -500_000, memo: null, payee_id: null, category_id: "rent", transfer_account_id: null, deleted: false },
    { id: "s2", transaction_id: "t4", amount: -1_000, memo: null, payee_id: null, category_id: "rent", transfer_account_id: null, deleted: false },
  ],
};

describe("mapPlanExport", () => {
  const rows = mapPlanExport(plan, { householdId: "home", importedAt: "2026-11-11T00:00:00.000Z" });

  it("creates the budget under the household with the plan currency", () => {
    expect(rows.budget).toMatchObject({
      id: "plan-1",
      household_id: "home",
      currency_iso_code: "MXN",
      currency_decimal_digits: 2,
      imported_from: "ynab",
    });
  });

  it("classifies categories and links credit card payment categories", () => {
    const kinds = Object.fromEntries(rows.categories.map((row) => [row.id, row.kind]));
    expect(kinds).toEqual({
      rta: "income",
      uncategorized: "internal",
      "visa-payment": "credit_card_payment",
      rent: "standard",
    });
    expect(rows.categories.find((row) => row.id === "visa-payment")?.linked_account_id).toBe("visa");
  });

  it("keeps only non-zero assignments of assignable categories", () => {
    expect(rows.assignments).toEqual([
      { budget_id: "plan-1", category_id: "rent", month: "2026-01-01", amount: 500_000 },
    ]);
  });

  it("drops deleted entities and dangling references", () => {
    expect(rows.accounts.map((row) => row.id)).toEqual(["checking", "visa"]);
    expect(rows.transactions.map((row) => row.id)).toEqual(["t1", "t2"]);
    expect(rows.transactions.find((row) => row.id === "t2")).toMatchObject({ payee_id: null, category_id: null });
    expect(rows.subtransactions.map((row) => row.id)).toEqual(["s1"]);
  });
});
