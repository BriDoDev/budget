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
  note: string | null;
  budgeted: number;
  deleted: boolean;
}

export interface YnabMonth {
  month: string;
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
