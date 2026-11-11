import { describe, expect, it } from "vitest";
import { computeGoalStatus, type Goal, type GoalMonthValues } from "./goals";

const baseGoal: Goal = {
  type: "monthly_funding",
  target: 100_000,
  targetMonth: null,
  cadenceMonths: 0,
  needsWholeAmount: true,
  createdMonth: "2026-01-01",
};

const lookupFrom = (values: Record<string, Partial<GoalMonthValues>>) => (month: string) => {
  const entry = values[month];
  return entry ? { carryover: 0, assigned: 0, available: 0, ...entry } : undefined;
};

describe("computeGoalStatus", () => {
  it("asks for the full amount every month on monthly funding goals", () => {
    const status = computeGoalStatus(baseGoal, "2026-03-01", lookupFrom({ "2026-03-01": { assigned: 40_000, available: 300_000 } }));

    expect(status).toMatchObject({ underfunded: 60_000, monthTarget: 100_000, percentageComplete: 40 });
  });

  it("ignores the previous balance when a spending goal needs the whole amount", () => {
    const goal: Goal = { ...baseGoal, type: "needed_spending", needsWholeAmount: true };
    const lookup = lookupFrom({ "2026-03-01": { carryover: 70_000, assigned: 10_000, available: 80_000 } });

    expect(computeGoalStatus(goal, "2026-03-01", lookup).underfunded).toBe(90_000);
  });

  it("only refills up to the target when the spending goal allows it", () => {
    const goal: Goal = { ...baseGoal, type: "needed_spending", needsWholeAmount: false };
    const lookup = lookupFrom({ "2026-03-01": { carryover: 70_000, assigned: 10_000, available: 80_000 } });

    expect(computeGoalStatus(goal, "2026-03-01", lookup)).toMatchObject({ underfunded: 20_000, funded: 80_000 });
  });

  it("spreads a yearly spending goal over the months left in its period", () => {
    const goal: Goal = { ...baseGoal, type: "needed_spending", target: 12_000_000, targetMonth: "2026-12-01", cadenceMonths: 12 };
    const lookup = lookupFrom({
      "2026-01-01": { assigned: 1_000_000 },
      "2026-02-01": { assigned: 1_000_000 },
      "2026-03-01": { assigned: 0 },
      "2027-02-01": { assigned: 0 },
    });

    expect(computeGoalStatus(goal, "2026-03-01", lookup)).toMatchObject({ monthTarget: 1_000_000, underfunded: 1_000_000 });
    // After the due month the goal starts a new 12-month period (Jan-Dec 2027).
    expect(computeGoalStatus(goal, "2027-02-01", lookup).monthTarget).toBe(1_090_910);
  });

  it("paces a balance goal with a deadline and stops asking after it", () => {
    const goal: Goal = { ...baseGoal, type: "target_balance_by_date", target: 1_200_000, targetMonth: "2026-12-01" };
    const october = lookupFrom({ "2026-10-01": { carryover: 900_000, available: 900_000 } });
    const afterDeadline = lookupFrom({ "2027-01-01": { carryover: 900_000, available: 900_000 } });

    expect(computeGoalStatus(goal, "2026-10-01", october)).toMatchObject({ monthTarget: 100_000, underfunded: 100_000, percentageComplete: 75 });
    expect(computeGoalStatus(goal, "2027-01-01", afterDeadline).underfunded).toBe(0);
  });

  it("tracks progress without a monthly amount on open-ended balance goals", () => {
    const goal: Goal = { ...baseGoal, type: "target_balance", target: 500_000 };
    const status = computeGoalStatus(goal, "2026-05-01", lookupFrom({ "2026-05-01": { available: 125_000 } }));

    expect(status).toMatchObject({ underfunded: 0, monthTarget: 0, percentageComplete: 25 });
  });

  it("reports nothing before the goal starts", () => {
    const status = computeGoalStatus(baseGoal, "2025-12-01", lookupFrom({ "2025-12-01": { assigned: 0 } }));

    expect(status).toEqual({ underfunded: 0, monthTarget: 0, funded: 0, percentageComplete: 0 });
  });
});
