import { toMonthKey } from "../month";
import type { ActivityLine, CardAdvanceLine, FundingSource, PaymentLine } from "./types";

/** Account types whose spending is funded with credit instead of cash. */
export const CREDIT_ACCOUNT_TYPES: ReadonlySet<string> = new Set(["creditCard", "lineOfCredit"]);

export interface LedgerAccount {
  id: string;
  type: string;
  onBudget: boolean;
}

export interface LedgerTransaction {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  categoryId: string | null;
  transferAccountId?: string | null;
}

export interface LedgerSubtransaction {
  transactionId: string;
  amount: number;
  categoryId: string | null;
}

export interface Ledger {
  activity: ActivityLine[];
  payments: PaymentLine[];
  cardAdvances: CardAdvanceLine[];
}

export interface LedgerOptions {
  /** Ids of the "Ready to Assign" inflow categories. */
  incomeCategoryIds?: ReadonlySet<string>;
}

/**
 * Converts raw transactions into engine input. It is the in-memory twin of the
 * `budget_activity` SQL function and must follow the same rules:
 * - Off-budget (tracking) accounts are ignored.
 * - Split transactions contribute their subtransactions instead of the parent.
 * - An uncategorized transfer into a credit account is a card payment; one out
 *   of it is a cash advance.
 * - Debt booked against the income category on a card (its starting balance)
 *   is not income.
 * - Any other uncategorized line is skipped.
 */
export function buildLedger(
  accounts: LedgerAccount[],
  transactions: LedgerTransaction[],
  subtransactions: LedgerSubtransaction[],
  { incomeCategoryIds = new Set<string>() }: LedgerOptions = {},
): Ledger {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const subtransactionsByParent = new Map<string, LedgerSubtransaction[]>();
  for (const subtransaction of subtransactions) {
    const siblings = subtransactionsByParent.get(subtransaction.transactionId) ?? [];
    siblings.push(subtransaction);
    subtransactionsByParent.set(subtransaction.transactionId, siblings);
  }

  const ledger: Ledger = { activity: [], payments: [], cardAdvances: [] };
  for (const transaction of transactions) {
    const account = accountsById.get(transaction.accountId);
    if (!account?.onBudget) {
      continue;
    }
    const isCredit = CREDIT_ACCOUNT_TYPES.has(account.type);
    const source: FundingSource = isCredit ? "credit" : "cash";
    const month = toMonthKey(transaction.date);

    if (isCredit && transaction.transferAccountId && !transaction.categoryId && transaction.amount !== 0) {
      const target = transaction.amount > 0 ? ledger.payments : ledger.cardAdvances;
      target.push({ accountId: account.id, month, amount: -transaction.amount });
    }

    const parts = subtransactionsByParent.get(transaction.id) ?? [transaction];
    for (const part of parts) {
      const isCardDebtAsIncome = isCredit && part.amount < 0 && incomeCategoryIds.has(part.categoryId ?? "");
      if (part.categoryId && !isCardDebtAsIncome) {
        ledger.activity.push({ categoryId: part.categoryId, month, amount: part.amount, source, accountId: account.id });
      }
    }
  }
  return ledger;
}
