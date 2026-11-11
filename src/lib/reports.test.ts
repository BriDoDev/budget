import { describe, expect, it } from "vitest";
import { incomeVsExpenses, netWorthByMonth, spendingByCategory, type ReportCategory } from "./reports";

const categories: ReportCategory[] = [
  { id: "rta", name: "Inflow: Ready to Assign", groupName: "Internal", kind: "income" },
  { id: "rent", name: "Renta", groupName: "Fijos", kind: "standard" },
  { id: "food", name: "Súper", groupName: "Día a día", kind: "standard" },
  { id: "visa", name: "Visa", groupName: "Credit Card Payments", kind: "credit_card_payment" },
];
const rows = [
  { categoryId: "rta", month: "2026-10-01", amount: 20_000 },
  { categoryId: "rent", month: "2026-10-01", amount: -8_000 },
  { categoryId: "food", month: "2026-10-01", amount: -3_000 },
  { categoryId: "food", month: "2026-11-01", amount: -4_000 },
  { categoryId: "food", month: "2026-11-01", amount: 500 },
  { categoryId: "visa", month: "2026-11-01", amount: -2_000 },
  { categoryId: "rent", month: "2026-09-01", amount: -8_000 },
];
const months = ["2026-10-01", "2026-11-01"];

describe("reports", () => {
  it("ranks net spending by category inside the range", () => {
    expect(spendingByCategory(rows, categories, months).map((entry) => [entry.name, entry.total])).toEqual([
      ["Renta", 8_000],
      ["Súper", 6_500],
    ]);
  });

  it("compares income with spending per month, ignoring card payments", () => {
    expect(incomeVsExpenses(rows, categories, months)).toEqual([
      { month: "2026-10-01", income: 20_000, expenses: 11_000, net: 9_000 },
      { month: "2026-11-01", income: 0, expenses: 3_500, net: -3_500 },
    ]);
  });

  it("accumulates balances into assets, debts and net worth", () => {
    const totals = [
      { accountId: "checking", month: "2026-09-01", amount: 10_000 },
      { accountId: "checking", month: "2026-10-01", amount: 5_000 },
      { accountId: "visa", month: "2026-10-01", amount: -4_000 },
      { accountId: "visa", month: "2026-11-01", amount: 1_000 },
    ];

    expect(netWorthByMonth(totals, months)).toEqual([
      { month: "2026-10-01", assets: 15_000, debts: 4_000, netWorth: 11_000 },
      { month: "2026-11-01", assets: 15_000, debts: 3_000, netWorth: 12_000 },
    ]);
  });
});
