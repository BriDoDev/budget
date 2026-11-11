import { describe, expect, it } from "vitest";
import { buildLedger } from "./ledger";

const accounts = [
  { id: "checking", type: "checking", onBudget: true },
  { id: "visa", type: "creditCard", onBudget: true },
  { id: "brokerage", type: "otherAsset", onBudget: false },
];

describe("buildLedger", () => {
  it("tags lines by funding source, account and month", () => {
    const { activity } = buildLedger(
      accounts,
      [
        { id: "t1", accountId: "checking", date: "2026-01-15", amount: -10_000, categoryId: "groceries" },
        { id: "t2", accountId: "visa", date: "2026-02-03", amount: -20_000, categoryId: "groceries" },
      ],
      [],
    );

    expect(activity).toEqual([
      { categoryId: "groceries", month: "2026-01-01", amount: -10_000, source: "cash", accountId: "checking" },
      { categoryId: "groceries", month: "2026-02-01", amount: -20_000, source: "credit", accountId: "visa" },
    ]);
  });

  it("expands split transactions into their subtransactions", () => {
    const { activity } = buildLedger(
      accounts,
      [{ id: "split", accountId: "checking", date: "2026-01-20", amount: -30_000, categoryId: null }],
      [
        { transactionId: "split", amount: -10_000, categoryId: "groceries" },
        { transactionId: "split", amount: -20_000, categoryId: "household" },
      ],
    );

    expect(activity.map((line) => [line.categoryId, line.amount])).toEqual([
      ["groceries", -10_000],
      ["household", -20_000],
    ]);
  });

  it("skips off-budget accounts and uncategorized cash transfers", () => {
    const ledger = buildLedger(
      accounts,
      [
        { id: "t1", accountId: "brokerage", date: "2026-01-01", amount: 5_000, categoryId: "groceries" },
        { id: "t2", accountId: "checking", date: "2026-01-01", amount: -5_000, categoryId: null, transferAccountId: "visa" },
      ],
      [],
    );

    expect(ledger).toEqual({ activity: [], payments: [] });
  });

  it("records transfers on a credit account as payments against its payment category", () => {
    const { payments } = buildLedger(
      accounts,
      [
        { id: "pay", accountId: "visa", date: "2026-03-05", amount: 40_000, categoryId: null, transferAccountId: "checking" },
        { id: "advance", accountId: "visa", date: "2026-03-09", amount: -15_000, categoryId: null, transferAccountId: "checking" },
      ],
      [],
    );

    expect(payments).toEqual([
      { accountId: "visa", month: "2026-03-01", amount: -40_000 },
      { accountId: "visa", month: "2026-03-01", amount: 15_000 },
    ]);
  });
});
