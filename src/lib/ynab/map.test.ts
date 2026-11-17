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

describe("mapPlanExport goals and scheduled transactions", () => {
  const withExtras: YnabPlan = {
    ...plan,
    categories: [
      ...plan.categories,
      category({ id: "vacation", category_group_id: "bills", name: "Vacaciones", goal_type: "TBD", goal_target: 12_000_000, goal_target_date: "2027-07-15", goal_creation_month: "2026-08-01" }),
      category({ id: "insurance", category_group_id: "bills", name: "Seguro", goal_type: "NEED", goal_target: 6_000_000, goal_cadence: 13, goal_cadence_frequency: 1, goal_target_date: "2027-03-01", goal_needs_whole_amount: false }),
      category({ id: "coffee", category_group_id: "bills", name: "Café", goal_type: "NEED", goal_target: 300_000, goal_cadence: 2, goal_cadence_frequency: 1 }),
    ],
    scheduled_transactions: [
      { id: "sch-1", date_first: "2026-01-05", date_next: "2026-12-05", frequency: "monthly", amount: -8_000_000, memo: null, flag_color: null, account_id: "checking", payee_id: "store", category_id: "rent", transfer_account_id: null, deleted: false },
      { id: "sch-2", date_first: "2026-01-05", date_next: "2026-12-05", frequency: "monthly", amount: -1, memo: null, flag_color: null, account_id: "old", payee_id: null, category_id: null, transfer_account_id: null, deleted: false },
    ],
    scheduled_subtransactions: [
      { id: "ssub-1", scheduled_transaction_id: "sch-1", amount: -8_000_000, memo: null, payee_id: null, category_id: "rent", transfer_account_id: null, deleted: false },
      { id: "ssub-2", scheduled_transaction_id: "sch-2", amount: -1, memo: null, payee_id: null, category_id: null, transfer_account_id: null, deleted: false },
    ],
  };
  const rows = mapPlanExport(withExtras, { householdId: "home", importedAt: "2026-11-11T00:00:00.000Z", serverKnowledge: 42 });
  const goalOf = (id: string) => rows.categories.find((row) => row.id === id);

  it("translates YNAB goal types, dates and cadences", () => {
    expect(goalOf("vacation")).toMatchObject({ goal_type: "target_balance_by_date", goal_target: 12_000_000, goal_target_month: "2027-07-01", goal_due_day: 15, goal_created_month: "2026-08-01" });
    expect(goalOf("insurance")).toMatchObject({ goal_type: "needed_spending", goal_cadence_months: 12, goal_needs_whole_amount: false });
    expect(goalOf("coffee")).toMatchObject({ goal_type: "needed_spending", goal_target: 1_300_000, goal_cadence_months: 1, goal_target_month: null });
    expect(goalOf("rent")).toMatchObject({ goal_type: null, goal_target: null });
  });

  it("imports scheduled transactions of live accounts with their splits", () => {
    expect(rows.scheduledTransactions.map((row) => row.id)).toEqual(["sch-1"]);
    expect(rows.scheduledSubtransactions.map((row) => row.id)).toEqual(["ssub-1"]);
    expect(rows.budget.ynab_server_knowledge).toBe(42);
  });
});

describe("mapPlanExport delta", () => {
  const delta: YnabPlan = {
    ...plan,
    accounts: [],
    payees: [{ id: "gone", name: "Gone", transfer_account_id: null, deleted: true }],
    category_groups: [],
    categories: [category({ id: "rent", category_group_id: "bills", name: "Renta nueva" })],
    months: [{ month: "2026-02-01", deleted: false, categories: [category({ id: "rent", category_group_id: "bills", name: "Renta nueva", budgeted: 0 })] }],
    transactions: [
      transaction({ id: "t9", payee_id: "store", category_id: "rent" }),
      transaction({ id: "t1", deleted: true }),
    ],
    subtransactions: [{ id: "s9", transaction_id: "t-existing", amount: -1_000, memo: null, payee_id: "gone", category_id: "rent", transfer_account_id: null, deleted: false }],
  };
  const rows = mapPlanExport(delta, {
    householdId: "home",
    importedAt: "2026-11-12T00:00:00.000Z",
    known: {
      accounts: [{ id: "checking", name: "Checking", type: "checking" }],
      categoryGroups: [{ id: "bills", name: "Bills", is_internal: false }],
      categories: [{ id: "rent", kind: "standard" }],
      payeeIds: ["store", "gone"],
      transactionIds: ["t1", "t-existing"],
      scheduledTransactionIds: [],
    },
  });

  it("resolves references against entities that are not part of the delta", () => {
    expect(rows.categories).toHaveLength(1);
    expect(rows.categories[0]).toMatchObject({ id: "rent", name: "Renta nueva", kind: "standard" });
    expect(rows.categories[0]).not.toHaveProperty("sort_index");
    expect(rows.transactions[0]).toMatchObject({ id: "t9", payee_id: "store", category_id: "rent" });
    expect(rows.subtransactions[0]).toMatchObject({ id: "s9", transaction_id: "t-existing", payee_id: null });
  });

  it("keeps zeroed assignments and reports deletions", () => {
    expect(rows.assignments).toEqual([{ budget_id: "plan-1", category_id: "rent", month: "2026-02-01", amount: 0 }]);
    expect(rows.deleted.transactions).toEqual(["t1"]);
    expect(rows.deleted.payees).toEqual(["gone"]);
  });
});

describe("mapPlanExport hidden categories", () => {
  it("keeps a hidden category as a regular one in its original group", () => {
    const withHidden: YnabPlan = {
      ...plan,
      category_groups: [...plan.category_groups, { id: "hidden", name: "Hidden Categories", hidden: false, internal: true, deleted: false }],
      categories: [
        ...plan.categories,
        category({ id: "gym", category_group_id: "hidden", original_category_group_id: "bills", name: "Gimnasio", hidden: true, internal: false }),
      ],
    };
    const rows = mapPlanExport(withHidden, { householdId: "home", importedAt: "2026-11-11T00:00:00.000Z" });

    expect(rows.categories.find((row) => row.id === "gym")).toMatchObject({ group_id: "bills", kind: "standard", hidden: true });
  });
});
