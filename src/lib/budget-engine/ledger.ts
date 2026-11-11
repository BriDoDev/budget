import { toMonthKey } from "../month";
import type { ActivityLine, FundingSource } from "./types";

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
}

export interface LedgerSubtransaction {
  transactionId: string;
  amount: number;
  categoryId: string | null;
}

/**
 * Converts stored transactions into categorized activity lines for the engine.
 * - Off-budget (tracking) accounts are ignored.
 * - Split transactions contribute their subtransactions instead of the parent.
 * - Uncategorized lines (e.g. transfers between budget accounts) are skipped.
 */
export function buildActivityLines(
  accounts: LedgerAccount[],
  transactions: LedgerTransaction[],
  subtransactions: LedgerSubtransaction[],
): ActivityLine[] {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const subtransactionsByParent = new Map<string, LedgerSubtransaction[]>();
  for (const subtransaction of subtransactions) {
    const siblings = subtransactionsByParent.get(subtransaction.transactionId) ?? [];
    siblings.push(subtransaction);
    subtransactionsByParent.set(subtransaction.transactionId, siblings);
  }

  const lines: ActivityLine[] = [];
  for (const transaction of transactions) {
    const account = accountsById.get(transaction.accountId);
    if (!account?.onBudget) {
      continue;
    }
    const source: FundingSource = CREDIT_ACCOUNT_TYPES.has(account.type) ? "credit" : "cash";
    const month = toMonthKey(transaction.date);
    const parts = subtransactionsByParent.get(transaction.id) ?? [transaction];

    for (const part of parts) {
      if (part.categoryId) {
        lines.push({ categoryId: part.categoryId, month, amount: part.amount, source });
      }
    }
  }
  return lines;
}
