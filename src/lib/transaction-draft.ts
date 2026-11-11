/** Value of the category field that means "this transaction is split across categories". */
export const SPLIT_CATEGORY = "__split__";

export interface CategoryOptionGroup {
  name: string;
  options: Array<{ id: string; name: string }>;
}

export interface SplitDraft {
  categoryId: string;
  /** Positive amount as typed; it takes the sign of the transaction. */
  amount: string;
}

/** Field values of the transaction form when editing an existing transaction. */
export interface TransactionDraft {
  id: string;
  accountId: string;
  date: string;
  outflow: string;
  inflow: string;
  payeeName: string;
  transferAccountId: string;
  categoryId: string;
  memo: string;
  isCleared: boolean;
  flagColor: string;
  splits: SplitDraft[];
}
