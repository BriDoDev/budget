import { describe, expect, it } from "vitest";
import { planGoalFunding } from "./goal-funding";

const needs = [
  { categoryId: "rent", assigned: 0, underfunded: 4_500_000 },
  { categoryId: "groceries", assigned: 1_000_000, underfunded: 2_200_000 },
  { categoryId: "internet", assigned: 0, underfunded: 609_000 },
];

describe("planGoalFunding", () => {
  it("funds every goal when there is enough money", () => {
    const plan = planGoalFunding(needs, 10_000_000);
    expect(plan.assignments).toEqual([
      { categoryId: "rent", amount: 4_500_000 },
      { categoryId: "groceries", amount: 3_200_000 },
      { categoryId: "internet", amount: 609_000 },
    ]);
    expect(plan.shortfall).toBe(0);
  });

  it("stops when the money runs out, funding the last category in part", () => {
    const plan = planGoalFunding(needs, 5_000_000);
    expect(plan.assignments).toEqual([
      { categoryId: "rent", amount: 4_500_000 },
      { categoryId: "groceries", amount: 1_500_000 },
    ]);
    expect(plan.shortfall).toBe(1_700_000 + 609_000);
  });

  it("assigns nothing when nothing is ready to assign", () => {
    const plan = planGoalFunding(needs, -300_000);
    expect(plan.assignments).toEqual([]);
    expect(plan.shortfall).toBe(7_309_000);
  });
});
