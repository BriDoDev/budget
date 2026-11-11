import { describe, expect, it } from "vitest";
import { buildActivityLines } from "./ledger";

const accounts = [
  { id: "checking", type: "checking", onBudget: true },
  { id: "visa", type: "creditCard", onBudget: true },
  { id: "brokerage", type: "otherAsset", onBudget: false },
];

describe("buildActivityLines", () => {
  it("tags lines by funding source and month", () => {
    const lines = buildActivityLines(
      accounts,
      [
        { id: "t1", accountId: "checking", date: "2026-01-15", amount: -10_000, categoryId: "groceries" },
        { id: "t2", accountId: "visa", date: "2026-02-03", amount: -20_000, categoryId: "groceries" },
      ],
      [],
    );

    expect(lines).toEqual([
      { categoryId: "groceries", month: "2026-01-01", amount: -10_000, source: "cash" },
      { categoryId: "groceries", month: "2026-02-01", amount: -20_000, source: "credit" },
    ]);
  });

  it("expands split transactions into their subtransactions", () => {
    const lines = buildActivityLines(
      accounts,
      [{ id: "split", accountId: "checking", date: "2026-01-20", amount: -30_000, categoryId: null }],
      [
        { transactionId: "split", amount: -10_000, categoryId: "groceries" },
        { transactionId: "split", amount: -20_000, categoryId: "household" },
      ],
    );

    expect(lines.map((line) => [line.categoryId, line.amount])).toEqual([
      ["groceries", -10_000],
      ["household", -20_000],
    ]);
  });

  it("skips off-budget accounts and uncategorized transfers", () => {
    const lines = buildActivityLines(
      accounts,
      [
        { id: "t1", accountId: "brokerage", date: "2026-01-01", amount: 5_000, categoryId: "groceries" },
        { id: "t2", accountId: "checking", date: "2026-01-01", amount: -5_000, categoryId: null },
      ],
      [],
    );

    expect(lines).toEqual([]);
  });
});
