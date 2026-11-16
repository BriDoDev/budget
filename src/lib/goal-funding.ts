/** A category whose goal still needs money this month. */
export interface FundingNeed {
  categoryId: string;
  assigned: number;
  underfunded: number;
}

export interface FundingPlan {
  /** New assigned amount for each category that receives money. */
  assignments: Array<{ categoryId: string; amount: number }>;
  /** What the goals still need after spending everything that was available. */
  shortfall: number;
}

/**
 * Spreads the money that is ready to assign over the goals that need it, in
 * the order given, and never assigns more than there is: the last category
 * reached may be funded only in part and the rest are left as they were.
 */
export function planGoalFunding(needs: FundingNeed[], readyToAssign: number): FundingPlan {
  let remaining = Math.max(0, readyToAssign);
  let shortfall = 0;
  const assignments: FundingPlan["assignments"] = [];
  for (const need of needs) {
    if (need.underfunded <= 0) {
      continue;
    }
    const funded = Math.min(need.underfunded, remaining);
    if (funded > 0) {
      assignments.push({ categoryId: need.categoryId, amount: need.assigned + funded });
      remaining -= funded;
    }
    shortfall += need.underfunded - funded;
  }
  return { assignments, shortfall };
}
