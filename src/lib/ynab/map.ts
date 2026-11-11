import { CREDIT_ACCOUNT_TYPES } from "../budget-engine/ledger";
import type { CategoryKind } from "../budget-engine/types";
import type {
  AccountRow,
  BudgetRow,
  CategoryGroupRow,
  CategoryRow,
  MonthAssignmentRow,
  PayeeRow,
  SubtransactionRow,
  TransactionRow,
} from "../db/types";
import { toMonthKey } from "../month";
import type { YnabCategory, YnabCategoryGroup, YnabPlan } from "./types";

export interface ImportRows {
  budget: BudgetRow;
  accounts: AccountRow[];
  categoryGroups: CategoryGroupRow[];
  categories: CategoryRow[];
  assignments: MonthAssignmentRow[];
  payees: PayeeRow[];
  transactions: TransactionRow[];
  subtransactions: SubtransactionRow[];
}

export interface MapPlanOptions {
  householdId: string;
  importedAt: string;
}

const CREDIT_CARD_PAYMENTS_GROUP = "Credit Card Payments";
const LEGACY_INTERNAL_GROUP = "Internal Master Category";
const INCOME_CATEGORY_PATTERN = /^(Inflow:|To be Budgeted$)/i;
const DEFAULT_CURRENCY = { iso_code: "MXN", decimal_digits: 2 };

/**
 * Maps a YNAB plan export into rows of our own schema. YNAB ids are reused as
 * primary keys so re-running the import upserts instead of duplicating.
 * Deleted entities and references to them are dropped.
 */
export function mapPlanExport(plan: YnabPlan, options: MapPlanOptions): ImportRows {
  const budgetId = plan.id;
  const currency = plan.currency_format ?? DEFAULT_CURRENCY;

  const accounts: AccountRow[] = plan.accounts
    .filter((account) => !account.deleted)
    .map((account) => ({
      id: account.id,
      budget_id: budgetId,
      name: account.name,
      type: account.type,
      on_budget: account.on_budget,
      closed: account.closed,
      note: account.note,
    }));
  const accountIds = new Set(accounts.map((account) => account.id));
  const creditAccountIdsByName = new Map(
    accounts
      .filter((account) => CREDIT_ACCOUNT_TYPES.has(account.type))
      .map((account) => [account.name, account.id]),
  );

  const liveGroups = plan.category_groups.filter((group) => !group.deleted);
  const groupsById = new Map(liveGroups.map((group) => [group.id, group]));
  const categoryGroups: CategoryGroupRow[] = liveGroups.map((group, index) => ({
    id: group.id,
    budget_id: budgetId,
    name: group.name,
    hidden: group.hidden,
    is_internal: isInternalGroup(group),
    sort_index: index,
  }));

  const categories: CategoryRow[] = [];
  for (const [index, category] of plan.categories.entries()) {
    const group = groupsById.get(category.category_group_id);
    if (category.deleted || !group) {
      continue;
    }
    const kind = resolveCategoryKind(category, group);
    categories.push({
      id: category.id,
      budget_id: budgetId,
      group_id: group.id,
      name: category.name,
      kind,
      hidden: category.hidden,
      note: category.note,
      linked_account_id:
        kind === "credit_card_payment" ? (creditAccountIdsByName.get(category.name) ?? null) : null,
      sort_index: index,
    });
  }
  const categoriesById = new Map(categories.map((category) => [category.id, category]));

  const assignments: MonthAssignmentRow[] = [];
  for (const month of plan.months) {
    if (month.deleted) {
      continue;
    }
    for (const monthCategory of month.categories) {
      const category = categoriesById.get(monthCategory.id);
      if (!category || !isAssignable(category.kind) || monthCategory.budgeted === 0) {
        continue;
      }
      assignments.push({
        budget_id: budgetId,
        category_id: category.id,
        month: toMonthKey(month.month),
        amount: monthCategory.budgeted,
      });
    }
  }

  const payees: PayeeRow[] = plan.payees
    .filter((payee) => !payee.deleted)
    .map((payee) => ({
      id: payee.id,
      budget_id: budgetId,
      name: payee.name,
      transfer_account_id: keepIfKnown(payee.transfer_account_id, accountIds),
    }));
  const payeeIds = new Set(payees.map((payee) => payee.id));
  const categoryIds = new Set(categoriesById.keys());

  const transactions: TransactionRow[] = plan.transactions
    .filter((transaction) => !transaction.deleted && accountIds.has(transaction.account_id))
    .map((transaction) => ({
      id: transaction.id,
      budget_id: budgetId,
      account_id: transaction.account_id,
      date: transaction.date,
      amount: transaction.amount,
      payee_id: keepIfKnown(transaction.payee_id, payeeIds),
      category_id: keepIfKnown(transaction.category_id, categoryIds),
      memo: transaction.memo,
      cleared: transaction.cleared,
      approved: transaction.approved,
      flag_color: transaction.flag_color,
      transfer_account_id: keepIfKnown(transaction.transfer_account_id, accountIds),
      transfer_transaction_id: transaction.transfer_transaction_id,
    }));
  const transactionIds = new Set(transactions.map((transaction) => transaction.id));

  const subtransactions: SubtransactionRow[] = plan.subtransactions
    .filter((sub) => !sub.deleted && transactionIds.has(sub.transaction_id))
    .map((sub) => ({
      id: sub.id,
      budget_id: budgetId,
      transaction_id: sub.transaction_id,
      amount: sub.amount,
      payee_id: keepIfKnown(sub.payee_id, payeeIds),
      category_id: keepIfKnown(sub.category_id, categoryIds),
      memo: sub.memo,
      transfer_account_id: keepIfKnown(sub.transfer_account_id, accountIds),
    }));

  return {
    budget: {
      id: budgetId,
      household_id: options.householdId,
      name: plan.name,
      currency_iso_code: currency.iso_code,
      currency_decimal_digits: currency.decimal_digits,
      imported_from: "ynab",
      imported_at: options.importedAt,
    },
    accounts,
    categoryGroups,
    categories,
    assignments,
    payees,
    transactions,
    subtransactions,
  };
}

export function resolveCategoryKind(category: YnabCategory, group: YnabCategoryGroup): CategoryKind {
  if (group.name === CREDIT_CARD_PAYMENTS_GROUP) {
    return "credit_card_payment";
  }
  if (category.internal || isInternalGroup(group)) {
    return INCOME_CATEGORY_PATTERN.test(category.name) ? "income" : "internal";
  }
  return "standard";
}

function isInternalGroup(group: YnabCategoryGroup): boolean {
  return group.internal === true || group.name === LEGACY_INTERNAL_GROUP;
}

function isAssignable(kind: CategoryKind): boolean {
  return kind === "standard" || kind === "credit_card_payment";
}

function keepIfKnown(id: string | null, knownIds: ReadonlySet<string>): string | null {
  return id && knownIds.has(id) ? id : null;
}
