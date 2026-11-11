import type { CategoryKind } from "./budget-engine/types";
import type { MonthKey } from "./month";

export interface ReportActivityRow {
  categoryId: string;
  month: MonthKey;
  amount: number;
}

export interface ReportCategory {
  id: string;
  name: string;
  groupName: string;
  kind: CategoryKind;
}

export interface AccountMonthTotal {
  accountId: string;
  month: MonthKey;
  /** Net change of the account balance during the month. */
  amount: number;
}

export interface CategorySpending {
  categoryId: string;
  name: string;
  groupName: string;
  /** Net spending in the range as a positive number. */
  total: number;
}

export interface MonthCashflow {
  month: MonthKey;
  income: number;
  /** Net spending of the month as a positive number. */
  expenses: number;
  net: number;
}

export interface MonthNetWorth {
  month: MonthKey;
  assets: number;
  /** Sum of negative balances, as a positive number. */
  debts: number;
  netWorth: number;
}

/** Net spending per standard category over `months`, largest first. Categories with net inflows are omitted. */
export function spendingByCategory(
  rows: ReportActivityRow[],
  categories: ReportCategory[],
  months: MonthKey[],
): CategorySpending[] {
  const inRange = new Set(months);
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (inRange.has(row.month)) {
      totals.set(row.categoryId, (totals.get(row.categoryId) ?? 0) + row.amount);
    }
  }
  return categories
    .filter((category) => category.kind === "standard")
    .map((category) => ({
      categoryId: category.id,
      name: category.name,
      groupName: category.groupName,
      total: -(totals.get(category.id) ?? 0),
    }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/** Income (inflows to Ready to Assign) against net spending in standard categories, per month. */
export function incomeVsExpenses(
  rows: ReportActivityRow[],
  categories: ReportCategory[],
  months: MonthKey[],
): MonthCashflow[] {
  const kinds = new Map(categories.map((category) => [category.id, category.kind]));
  const byMonth = new Map<MonthKey, { income: number; expenses: number }>(
    months.map((month) => [month, { income: 0, expenses: 0 }]),
  );
  for (const row of rows) {
    const bucket = byMonth.get(row.month);
    const kind = kinds.get(row.categoryId);
    if (!bucket) {
      continue;
    }
    if (kind === "income") {
      bucket.income += row.amount;
    } else if (kind === "standard") {
      bucket.expenses -= row.amount;
    }
  }
  return months.map((month) => {
    const { income, expenses } = byMonth.get(month)!;
    return { month, income, expenses, net: income - expenses };
  });
}

/** Balance of every account at the end of each month, split into assets and debts. */
export function netWorthByMonth(totals: AccountMonthTotal[], months: MonthKey[]): MonthNetWorth[] {
  const changesByAccount = new Map<string, Map<MonthKey, number>>();
  for (const total of totals) {
    const changes = changesByAccount.get(total.accountId) ?? new Map<MonthKey, number>();
    changes.set(total.month, (changes.get(total.month) ?? 0) + total.amount);
    changesByAccount.set(total.accountId, changes);
  }

  const firstMonth = months[0];
  const balances = new Map<string, number>();
  for (const [accountId, changes] of changesByAccount) {
    let opening = 0;
    for (const [month, amount] of changes) {
      if (firstMonth !== undefined && month < firstMonth) {
        opening += amount;
      }
    }
    balances.set(accountId, opening);
  }

  return months.map((month) => {
    let assets = 0;
    let debts = 0;
    for (const [accountId, changes] of changesByAccount) {
      const balance = (balances.get(accountId) ?? 0) + (changes.get(month) ?? 0);
      balances.set(accountId, balance);
      if (balance >= 0) {
        assets += balance;
      } else {
        debts -= balance;
      }
    }
    return { month, assets, debts, netWorth: assets - debts };
  });
}
