import { addMonths, monthsApart, type MonthKey } from "../month";

/**
 * - monthly_funding: assign `target` every month.
 * - needed_spending: have `target` set aside by each due date (monthly by default).
 * - target_balance: reach an available balance of `target`, with no deadline.
 * - target_balance_by_date: reach `target` available by `targetMonth`.
 */
export type GoalType = "monthly_funding" | "needed_spending" | "target_balance" | "target_balance_by_date";

export interface Goal {
  type: GoalType;
  /** Milliunits. */
  target: number;
  targetMonth: MonthKey | null;
  /** Repeat interval of the due date in months. 0 means the goal does not repeat. */
  cadenceMonths: number;
  /** needed_spending only: true sets aside the full target each period, false refills up to it. */
  needsWholeAmount: boolean;
  /** Month the goal starts counting. Earlier months have no goal. */
  createdMonth: MonthKey | null;
}

export interface GoalMonthValues {
  carryover: number;
  assigned: number;
  available: number;
}

export interface GoalStatus {
  /** What still has to be assigned this month to stay on track. */
  underfunded: number;
  /** Amount to assign this month according to the goal (0 when it has no monthly pace). */
  monthTarget: number;
  /** Money counted towards the goal so far in its current period. */
  funded: number;
  /** Progress from 0 to 100. */
  percentageComplete: number;
}

const NO_GOAL_STATUS: GoalStatus = { underfunded: 0, monthTarget: 0, funded: 0, percentageComplete: 0 };

/**
 * Goal progress for one month, following the calculation observed in the YNAB
 * web client (docs/ynab-internals.md, "Goals").
 *
 * @param lookup values of the same category in any month (undefined when out of range)
 * @param roundingStep smallest assignable amount in milliunits (10 = one cent)
 */
export function computeGoalStatus(
  goal: Goal,
  month: MonthKey,
  lookup: (month: MonthKey) => GoalMonthValues | undefined,
  roundingStep = 10,
): GoalStatus {
  const current = lookup(month);
  if (!current || goal.target <= 0 || (goal.createdMonth && month < goal.createdMonth)) {
    return NO_GOAL_STATUS;
  }
  const { assigned, available } = current;
  const target = goal.target;

  if (goal.type === "monthly_funding") {
    const underfunded = Math.max(0, target - assigned);
    return { underfunded, monthTarget: target, funded: assigned, percentageComplete: percentage(assigned, target) };
  }

  if (goal.type === "target_balance" || (goal.type === "target_balance_by_date" && !goal.targetMonth)) {
    return { underfunded: 0, monthTarget: 0, funded: available, percentageComplete: percentage(available, target) };
  }

  const period = resolvePeriod(goal, month);
  const monthsRemaining = month > period.end ? 0 : monthsApart(month, period.end) + 1;

  if (goal.type === "target_balance_by_date") {
    const stillNeeded = target - available + assigned;
    const monthTarget = monthsRemaining > 0 ? roundUp(Math.max(0, stillNeeded / monthsRemaining), roundingStep) : 0;
    const underfunded =
      monthsRemaining <= 0
        ? 0
        : assigned < 0 && stillNeeded < 0
          ? Math.max(0, target - available)
          : Math.max(0, monthTarget - assigned);
    return { underfunded, monthTarget, funded: available, percentageComplete: percentage(available, target) };
  }

  // needed_spending: money assigned during the period counts, plus what the
  // category already held when the period started (unless it needs the whole amount).
  let funded = goal.needsWholeAmount ? 0 : Math.max(0, lookup(period.start)?.carryover ?? 0);
  for (let cursor = period.start; cursor <= month; cursor = addMonths(cursor, 1)) {
    funded += lookup(cursor)?.assigned ?? 0;
  }
  const stillNeeded = target - (funded - assigned);
  const monthTarget = monthsRemaining > 0 ? roundUp(Math.max(0, stillNeeded / monthsRemaining), roundingStep) : 0;
  const underfunded =
    monthsRemaining <= 0
      ? 0
      : assigned < 0 && stillNeeded < 0
        ? Math.max(0, target - funded)
        : Math.max(0, monthTarget - assigned);
  return { underfunded, monthTarget, funded, percentageComplete: percentage(funded, target) };
}

/** Period of the goal that contains `month`: the first one ends on the target month, later ones repeat by cadence. */
function resolvePeriod(goal: Goal, month: MonthKey): { start: MonthKey; end: MonthKey } {
  if (!goal.targetMonth) {
    // Without a due month the goal is due every `cadenceMonths` counted from its start (monthly by default).
    const cadence = Math.max(1, goal.cadenceMonths);
    const origin = goal.createdMonth ?? month;
    const elapsed = Math.max(0, monthsApart(origin, month));
    const start = addMonths(origin, Math.floor(elapsed / cadence) * cadence);
    return { start, end: addMonths(start, cadence - 1) };
  }
  if (month <= goal.targetMonth) {
    const start = goal.createdMonth && goal.createdMonth <= goal.targetMonth ? goal.createdMonth : goal.targetMonth;
    return { start, end: goal.targetMonth };
  }
  if (goal.cadenceMonths <= 0) {
    return { start: goal.createdMonth ?? goal.targetMonth, end: goal.targetMonth };
  }
  const periodsElapsed = Math.ceil(monthsApart(goal.targetMonth, month) / goal.cadenceMonths);
  const end = addMonths(goal.targetMonth, periodsElapsed * goal.cadenceMonths);
  return { start: addMonths(end, 1 - goal.cadenceMonths), end };
}

function roundUp(amount: number, step: number): number {
  return Math.ceil(amount / step) * step;
}

function percentage(funded: number, target: number): number {
  return Math.round(Math.min(1, Math.max(0, funded / target)) * 100);
}
