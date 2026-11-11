import type { MonthKey } from "../month";

/**
 * - standard: a regular spending/saving envelope.
 * - income: the "Ready to Assign" inflow category; money categorized here funds the month.
 * - credit_card_payment: envelope that holds money for paying a credit card.
 * - internal: bookkeeping categories (e.g. "Uncategorized") excluded from budgeting.
 */
export type CategoryKind = "standard" | "income" | "credit_card_payment" | "internal";

/** Whether the money for an activity line came from a cash or a credit account. */
export type FundingSource = "cash" | "credit";

export interface EngineCategory {
  id: string;
  kind: CategoryKind;
  /** Credit account paid from this category. Only for `credit_card_payment`. */
  linkedAccountId?: string | null;
}

/** Money assigned to a category in a month (milliunits). */
export interface Assignment {
  categoryId: string;
  month: MonthKey;
  amount: number;
}

/** Categorized, signed activity (outflows negative, inflows positive) in milliunits. */
export interface ActivityLine {
  categoryId: string;
  month: MonthKey;
  amount: number;
  source: FundingSource;
  /** Account of the activity. Needed on credit lines to fund the right payment category. */
  accountId?: string;
}

/**
 * Transfer in or out of a credit account, expressed as its effect on the
 * payment category: negative when paying the card, positive for a cash advance.
 */
export interface PaymentLine {
  accountId: string;
  month: MonthKey;
  amount: number;
}

export interface EngineInput {
  categories: EngineCategory[];
  assignments: Assignment[];
  activity: ActivityLine[];
  payments?: PaymentLine[];
  /** Extends the computed range up to this month even without data (e.g. the current month). */
  throughMonth?: MonthKey;
}

export interface CategoryMonthResult {
  categoryId: string;
  month: MonthKey;
  /** Positive balance rolled over from the previous month. Negative balances never roll over. */
  carryover: number;
  assigned: number;
  cashActivity: number;
  creditActivity: number;
  activity: number;
  /** Balance at the end of the month ("Available"). */
  available: number;
  /** Portion of a negative balance caused by cash spending (<= 0). Deducted from next month's Ready to Assign. */
  cashOverspent: number;
  /** Portion of a negative balance caused by credit spending (<= 0). Becomes unfunded card debt. */
  creditOverspent: number;
  /** Credit activity covered by the category's own money; it moves to the card's payment category. */
  fundedCredit: number;
}

export interface MonthResult {
  month: MonthKey;
  /** Inflows categorized as Ready to Assign during the month. */
  income: number;
  assigned: number;
  activity: number;
  /** Total cash overspending of the month (<= 0). */
  overspent: number;
  /** Running pool of unassigned money after this month's assignments. */
  availableToBudget: number;
  /** Sum of assignments in every month after this one. */
  assignedInFuture: number;
  /** Part of `availableToBudget` already committed to future months. */
  fundedInFuture: number;
  /** What the month view shows as "Ready to Assign". */
  readyToAssign: number;
}

export interface EngineResult {
  months: MonthResult[];
  getMonth(month: MonthKey): MonthResult | undefined;
  getCategoryMonth(categoryId: string, month: MonthKey): CategoryMonthResult | undefined;
}
