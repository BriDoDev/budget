import { describe, expect, it } from "vitest";
import { computeBudget, computeCategoryMonth } from "./engine";
import type { EngineCategory } from "./types";

const JAN = "2026-01-01";
const FEB = "2026-02-01";
const MAR = "2026-03-01";

const categories: EngineCategory[] = [
  { id: "income", kind: "income" },
  { id: "groceries", kind: "standard" },
  { id: "rent", kind: "standard" },
  { id: "uncategorized", kind: "internal" },
];

describe("computeBudget", () => {
  it("computes Ready to Assign from income minus assignments", () => {
    const result = computeBudget({
      categories,
      assignments: [
        { categoryId: "groceries", month: JAN, amount: 400_000 },
        { categoryId: "rent", month: JAN, amount: 200_000 },
      ],
      activity: [{ categoryId: "income", month: JAN, amount: 1_000_000, source: "cash" }],
    });

    expect(result.getMonth(JAN)).toMatchObject({
      income: 1_000_000,
      assigned: 600_000,
      availableToBudget: 400_000,
      readyToAssign: 400_000,
    });
  });

  it("rolls positive balances into the next month", () => {
    const result = computeBudget({
      categories,
      assignments: [{ categoryId: "groceries", month: JAN, amount: 100_000 }],
      activity: [{ categoryId: "groceries", month: JAN, amount: -30_000, source: "cash" }],
      throughMonth: FEB,
    });

    expect(result.getCategoryMonth("groceries", JAN)?.available).toBe(70_000);
    expect(result.getCategoryMonth("groceries", FEB)).toMatchObject({
      carryover: 70_000,
      assigned: 0,
      available: 70_000,
    });
  });

  it("resets cash overspending and deducts it from next month's Ready to Assign", () => {
    const result = computeBudget({
      categories,
      assignments: [{ categoryId: "groceries", month: JAN, amount: 50_000 }],
      activity: [
        { categoryId: "income", month: JAN, amount: 500_000, source: "cash" },
        { categoryId: "groceries", month: JAN, amount: -80_000, source: "cash" },
      ],
      throughMonth: FEB,
    });

    expect(result.getCategoryMonth("groceries", JAN)).toMatchObject({
      available: -30_000,
      cashOverspent: -30_000,
      creditOverspent: 0,
    });
    expect(result.getMonth(JAN)).toMatchObject({ availableToBudget: 450_000, overspent: -30_000 });
    expect(result.getCategoryMonth("groceries", FEB)).toMatchObject({ carryover: 0, available: 0 });
    expect(result.getMonth(FEB)?.readyToAssign).toBe(420_000);
  });

  it("does not deduct credit overspending from Ready to Assign", () => {
    const result = computeBudget({
      categories,
      assignments: [{ categoryId: "groceries", month: JAN, amount: 100_000 }],
      activity: [
        { categoryId: "income", month: JAN, amount: 500_000, source: "cash" },
        { categoryId: "groceries", month: JAN, amount: -30_000, source: "cash" },
        { categoryId: "groceries", month: JAN, amount: -100_000, source: "credit" },
      ],
      throughMonth: FEB,
    });

    expect(result.getCategoryMonth("groceries", JAN)).toMatchObject({
      available: -30_000,
      cashOverspent: 0,
      creditOverspent: -30_000,
    });
    expect(result.getMonth(JAN)?.overspent).toBe(0);
    expect(result.getMonth(FEB)?.readyToAssign).toBe(400_000);
  });

  it("splits a negative balance between cash and credit overspending", () => {
    const result = computeCategoryMonth("groceries", JAN, 0, 0, -50_000, -30_000);

    expect(result).toMatchObject({ available: -80_000, cashOverspent: -50_000, creditOverspent: -30_000 });
  });

  it("subtracts money assigned in future months from the current Ready to Assign", () => {
    const result = computeBudget({
      categories,
      assignments: [
        { categoryId: "rent", month: JAN, amount: 100_000 },
        { categoryId: "rent", month: FEB, amount: 200_000 },
        { categoryId: "rent", month: MAR, amount: 150_000 },
      ],
      activity: [{ categoryId: "income", month: JAN, amount: 600_000, source: "cash" }],
    });

    expect(result.getMonth(JAN)).toMatchObject({
      availableToBudget: 500_000,
      assignedInFuture: 350_000,
      fundedInFuture: 350_000,
      readyToAssign: 150_000,
    });
    expect(result.getMonth(MAR)).toMatchObject({ availableToBudget: 150_000, readyToAssign: 150_000 });
  });

  it("does not report future funding when Ready to Assign is negative", () => {
    const result = computeBudget({
      categories,
      assignments: [
        { categoryId: "rent", month: JAN, amount: 300_000 },
        { categoryId: "rent", month: FEB, amount: 100_000 },
      ],
      activity: [{ categoryId: "income", month: JAN, amount: 200_000, source: "cash" }],
    });

    expect(result.getMonth(JAN)).toMatchObject({ fundedInFuture: 0, readyToAssign: -100_000 });
  });

  it("ignores internal categories and keeps income out of category results", () => {
    const result = computeBudget({
      categories,
      assignments: [],
      activity: [
        { categoryId: "income", month: JAN, amount: 10_000, source: "cash" },
        { categoryId: "uncategorized", month: JAN, amount: -5_000, source: "cash" },
      ],
    });

    expect(result.getCategoryMonth("income", JAN)).toBeUndefined();
    expect(result.getCategoryMonth("uncategorized", JAN)).toBeUndefined();
    expect(result.getMonth(JAN)).toMatchObject({ activity: 0, readyToAssign: 10_000 });
  });

  it("returns no months when there is no data", () => {
    expect(computeBudget({ categories, assignments: [], activity: [] }).months).toEqual([]);
  });
});
