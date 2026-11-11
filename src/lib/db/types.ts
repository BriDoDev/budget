import type { GoalType } from "../budget-engine/goals";
import type { CategoryKind } from "../budget-engine/types";
import type { Frequency } from "../schedule";

/** Row shapes of the public schema (see supabase/migrations). Amounts are milliunits. */

export interface HouseholdRow {
  id: string;
  name: string;
}

export interface HouseholdMemberRow {
  household_id: string;
  user_id: string;
  role: "owner" | "member";
}

export interface BudgetRow {
  id: string;
  household_id: string;
  name: string;
  currency_iso_code: string;
  currency_decimal_digits: number;
  imported_from: string | null;
  imported_at: string | null;
  ynab_server_knowledge: number | null;
}

export interface AccountRow {
  id: string;
  budget_id: string;
  name: string;
  type: string;
  on_budget: boolean;
  closed: boolean;
  note: string | null;
}

export interface CategoryGroupRow {
  id: string;
  budget_id: string;
  name: string;
  hidden: boolean;
  is_internal: boolean;
  sort_index: number;
}

export interface CategoryRow {
  id: string;
  budget_id: string;
  group_id: string;
  name: string;
  kind: CategoryKind;
  hidden: boolean;
  note: string | null;
  linked_account_id: string | null;
  sort_index: number;
  goal_type: GoalType | null;
  goal_target: number | null;
  goal_target_month: string | null;
  goal_cadence_months: number;
  goal_needs_whole_amount: boolean;
  goal_created_month: string | null;
}

export interface MonthAssignmentRow {
  budget_id: string;
  category_id: string;
  month: string;
  amount: number;
}

export interface PayeeRow {
  id: string;
  budget_id: string;
  name: string;
  transfer_account_id: string | null;
}

export type ClearedStatus = "cleared" | "uncleared" | "reconciled";

export interface TransactionRow {
  id: string;
  budget_id: string;
  account_id: string;
  date: string;
  amount: number;
  payee_id: string | null;
  category_id: string | null;
  memo: string | null;
  cleared: ClearedStatus;
  approved: boolean;
  flag_color: string | null;
  transfer_account_id: string | null;
  transfer_transaction_id: string | null;
}

export interface SubtransactionRow {
  id: string;
  budget_id: string;
  transaction_id: string;
  amount: number;
  payee_id: string | null;
  category_id: string | null;
  memo: string | null;
  transfer_account_id: string | null;
}

export interface ScheduledTransactionRow {
  id: string;
  budget_id: string;
  account_id: string;
  date_first: string;
  date_next: string;
  frequency: Frequency;
  amount: number;
  payee_id: string | null;
  category_id: string | null;
  memo: string | null;
  flag_color: string | null;
  transfer_account_id: string | null;
}

export interface ScheduledSubtransactionRow {
  id: string;
  budget_id: string;
  scheduled_transaction_id: string;
  amount: number;
  payee_id: string | null;
  category_id: string | null;
  memo: string | null;
  transfer_account_id: string | null;
}

export interface HouseholdInviteRow {
  household_id: string;
  email: string;
  created_at: string;
}
