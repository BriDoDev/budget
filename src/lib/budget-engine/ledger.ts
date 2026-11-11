import { toMonthKey } from "../month";
import type { ActivityLine, FundingSource, PaymentLine } from "./types";

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
}

/**
 * Converts raw transactions into engine input. It is the in-memory twin of the
 * `budget_activity` SQL function and must follow the same rules:
 * - Off-budget (tracking) accounts are ignored.
 * - Split transactions contribute their subtransactions instead of the parent.
 * - Uncategorized transfers on a credit account are card payments.
 * - Any other uncategorized line is skipped.
 */
export function buildLedger(
  accounts: LedgerAccount[],
  transactions: LedgerTransaction[],
  subtransactions: LedgerSubtransaction[],
): Ledger {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const subtransactionsByParent = new Map<string, LedgerSubtransaction[]>();
  for (const subtransaction of subtransactions) {
    const siblings = subtransactionsByParent.get(subtransaction.transactionId) ?? [];
    siblings.push(subtransaction);
    subtransactionsByParent.set(subtransaction.transactionId, siblings);
  }

  const ledger: Ledger = { activity: [], payments: [] };
  for (const transaction of transactions) {
    const account = accountsById.get(transaction.accountId);
    if (!account?.onBudget) {
      continue;
    }
    const isCredit = CREDIT_ACCOUNT_TYPES.has(account.type);
    const source: FundingSource = isCredit ? "credit" : "cash";
    const month = toMonthKey(transaction.date);

    if (isCredit && transaction.transferAccountId && !transaction.categoryId) {
      ledger.payments.push({ accountId: account.id, month, amount: -transaction.amount });
    }

    const parts = subtransactionsByParent.get(transaction.id) ?? [transaction];
    for (const part of parts) {
      if (part.categoryId) {
        ledger.activity.push({ categoryId: part.categoryId, month, amount: part.amount, source, accountId: account.id });
      }
    }
  }
  return ledger;
}
