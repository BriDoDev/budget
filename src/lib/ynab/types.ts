/**
 * Subset of the official YNAB API (v1.79+) "plan" export returned by
 * GET /v1/plans/{plan_id}. Only the fields the importer reads are typed.
 * Amounts are milliunits.
 */
export interface YnabPlanExportResponse {
  data: {
    plan: YnabPlan;
    server_knowledge: number;
  };
}

export interface YnabPlan {
  id: string;
  name: string;
  first_month: string;
  last_month: string;
  currency_format: YnabCurrencyFormat | null;
  accounts: YnabAccount[];
  payees: YnabPayee[];
  category_groups: YnabCategoryGroup[];
  categories: YnabCategory[];
  months: YnabMonth[];
  transactions: YnabTransaction[];
  subtransactions: YnabSubtransaction[];
  scheduled_transactions?: YnabScheduledTransaction[];
  scheduled_subtransactions?: YnabScheduledSubtransaction[];
}

export interface YnabCurrencyFormat {
  iso_code: string;
  decimal_digits: number;
}

export interface YnabAccount {
  id: string;
  name: string;
  type: string;
  on_budget: boolean;
  closed: boolean;
  note: string | null;
  deleted: boolean;
}

export interface YnabPayee {
  id: string;
  name: string;
  transfer_account_id: string | null;
  deleted: boolean;
}

export interface YnabCategoryGroup {
  id: string;
  name: string;
  hidden: boolean;
  internal?: boolean;
  deleted: boolean;
}

export interface YnabCategory {
  id: string;
  category_group_id: string;
  name: string;
  hidden: boolean;
  internal?: boolean;
  /** Group the category belonged to before it was hidden (hidden categories move to a "Hidden Categories" group). */
  original_category_group_id?: string | null;
  note: string | null;
  budgeted: number;
  activity?: number;
  balance?: number;
  /** TB = target balance, TBD = target balance by date, MF = monthly funding, NEED = spending, DEBT = debt payment. */
  goal_type?: "TB" | "TBD" | "MF" | "NEED" | "DEBT" | null;
  goal_target?: number | null;
  goal_target_date?: string | null;
  goal_target_month?: string | null;
  /** 0 none, 1 monthly, 2 weekly, 13 yearly (all multiplied by the frequency); 3-12 = every 2-11 months, 14 = every 2 years. */
  goal_cadence?: number | null;
  goal_cadence_frequency?: number | null;
  goal_needs_whole_amount?: boolean | null;
  goal_creation_month?: string | null;
  deleted: boolean;
}

export interface YnabMonth {
  month: string;
  to_be_budgeted?: number;
  deleted: boolean;
  categories: YnabCategory[];
}

export type YnabClearedStatus = "cleared" | "uncleared" | "reconciled";

export interface YnabTransaction {
  id: string;
  date: string;
  amount: number;
  memo: string | null;
  cleared: YnabClearedStatus;
  approved: boolean;
  flag_color: string | null;
  account_id: string;
  payee_id: string | null;
  category_id: string | null;
  transfer_account_id: string | null;
  transfer_transaction_id: string | null;
  deleted: boolean;
}

export interface YnabSubtransaction {
  id: string;
  transaction_id: string;
  amount: number;
  memo: string | null;
  payee_id: string | null;
  category_id: string | null;
  transfer_account_id: string | null;
  deleted: boolean;
}

export interface YnabScheduledTransaction {
  id: string;
  date_first: string;
  date_next: string;
  frequency: string;
  amount: number;
  memo: string | null;
  flag_color: string | null;
  account_id: string;
  payee_id: string | null;
  category_id: string | null;
  transfer_account_id: string | null;
  deleted: boolean;
}

export interface YnabScheduledSubtransaction {
  id: string;
  scheduled_transaction_id: string;
  amount: number;
  memo: string | null;
  payee_id: string | null;
  category_id: string | null;
  transfer_account_id: string | null;
  deleted: boolean;
}
