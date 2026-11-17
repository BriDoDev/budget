import type { GoalType } from "../budget-engine/goals";
import { CREDIT_ACCOUNT_TYPES } from "../budget-engine/ledger";
import type { CategoryKind } from "../budget-engine/types";
import { CREDIT_CARD_PAYMENTS_GROUP } from "../categories";
import type {
  AccountRow,
  BudgetRow,
  CategoryGroupRow,
  CategoryRow,
  MonthAssignmentRow,
  PayeeRow,
  ScheduledSubtransactionRow,
  ScheduledTransactionRow,
  SubtransactionRow,
  TransactionRow,
} from "../db/types";
import { toMonthKey } from "../month";
import { isFrequency } from "../schedule";
import type { YnabCategory, YnabPlan } from "./types";

/** sort_index is only sent on full imports: a delta lists entities in change order, not display order. */
type Unsorted<T extends { sort_index: number }> = Omit<T, "sort_index"> & { sort_index?: number };

export interface ImportRows {
  budget: BudgetRow;
  accounts: AccountRow[];
  categoryGroups: Unsorted<CategoryGroupRow>[];
  categories: Unsorted<CategoryRow>[];
  assignments: MonthAssignmentRow[];
  payees: PayeeRow[];
  transactions: TransactionRow[];
  subtransactions: SubtransactionRow[];
  scheduledTransactions: ScheduledTransactionRow[];
  scheduledSubtransactions: ScheduledSubtransactionRow[];
  /** Ids YNAB reports as deleted. Only populated by delta exports. */
  deleted: Record<DeletableTable, string[]>;
}

export type DeletableTable =
  | "accounts"
  | "category_groups"
  | "categories"
  | "payees"
  | "transactions"
  | "subtransactions"
  | "scheduled_transactions"
  | "scheduled_subtransactions";

/**
 * What the database already holds. A delta export only lists changed entities,
 * so references to unchanged ones are resolved against this.
 */
export interface KnownEntities {
  accounts: Array<Pick<AccountRow, "id" | "name" | "type">>;
  categoryGroups: Array<Pick<CategoryGroupRow, "id" | "name" | "is_internal">>;
  categories: Array<Pick<CategoryRow, "id" | "kind">>;
  payeeIds: string[];
  transactionIds: string[];
  scheduledTransactionIds: string[];
}

export interface MapPlanOptions {
  householdId: string;
  importedAt: string;
  serverKnowledge?: number | null;
  /** Present when mapping a delta export. */
  known?: KnownEntities;
}

interface GroupInfo {
  name: string;
  isInternal: boolean;
}

const LEGACY_INTERNAL_GROUP = "Internal Master Category";
const INCOME_CATEGORY_PATTERN = /^(Inflow:|To be Budgeted$)/i;
const DEFAULT_CURRENCY = { iso_code: "MXN", decimal_digits: 2 };
const WEEKS_PER_MONTH = 52 / 12;
const GOAL_TYPES: Record<string, GoalType> = {
  MF: "monthly_funding",
  DEBT: "monthly_funding",
  NEED: "needed_spending",
  TB: "target_balance",
  TBD: "target_balance_by_date",
};

/**
 * Maps a YNAB plan export into rows of our own schema. YNAB ids are reused as
 * primary keys so re-running the import upserts instead of duplicating.
 * Deleted entities and references to them are dropped.
 */
export function mapPlanExport(plan: YnabPlan, options: MapPlanOptions): ImportRows {
  const budgetId = plan.id;
  const isDelta = options.known !== undefined;
  const known = options.known;
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
  const deletedAccounts = deletedIds(plan.accounts);
  const allAccounts = mergeById(known?.accounts ?? [], accounts).filter((account) => !deletedAccounts.has(account.id));
  const accountIds = new Set(allAccounts.map((account) => account.id));
  const creditAccountIdsByName = new Map(
    allAccounts.filter((account) => CREDIT_ACCOUNT_TYPES.has(account.type)).map((account) => [account.name, account.id]),
  );

  const liveGroups = plan.category_groups.filter((group) => !group.deleted);
  const categoryGroups: Unsorted<CategoryGroupRow>[] = liveGroups.map((group, index) => ({
    id: group.id,
    budget_id: budgetId,
    name: group.name,
    hidden: group.hidden,
    is_internal: group.internal === true || group.name === LEGACY_INTERNAL_GROUP,
    ...(isDelta ? {} : { sort_index: index }),
  }));
  const groupsById = new Map<string, GroupInfo>();
  for (const group of known?.categoryGroups ?? []) {
    groupsById.set(group.id, { name: group.name, isInternal: group.is_internal });
  }
  for (const group of categoryGroups) {
    groupsById.set(group.id, { name: group.name, isInternal: group.is_internal });
  }

  const categories: Unsorted<CategoryRow>[] = [];
  for (const [index, category] of plan.categories.entries()) {
    // A hidden category keeps its place in the group it came from.
    const groupId =
      category.original_category_group_id && groupsById.has(category.original_category_group_id)
        ? category.original_category_group_id
        : category.category_group_id;
    const group = groupsById.get(groupId);
    if (category.deleted || !group) {
      continue;
    }
    const kind = resolveCategoryKind(category, group);
    categories.push({
      id: category.id,
      budget_id: budgetId,
      group_id: groupId,
      name: category.name,
      kind,
      hidden: category.hidden,
      note: category.note,
      linked_account_id:
        kind === "credit_card_payment" ? (creditAccountIdsByName.get(category.name) ?? null) : null,
      ...mapGoal(category),
      ...(isDelta ? {} : { sort_index: index }),
    });
  }
  const deletedCategories = deletedIds(plan.categories);
  const kindsById = new Map<string, CategoryKind>();
  for (const category of [...(known?.categories ?? []), ...categories]) {
    if (!deletedCategories.has(category.id)) {
      kindsById.set(category.id, category.kind);
    }
  }
  const categoryIds = new Set(kindsById.keys());

  const assignments: MonthAssignmentRow[] = [];
  for (const month of plan.months) {
    if (month.deleted) {
      continue;
    }
    for (const monthCategory of month.categories) {
      const kind = kindsById.get(monthCategory.id);
      const isAssignable = kind === "standard" || kind === "credit_card_payment";
      // A delta must also carry assignments that went back to zero.
      if (!isAssignable || (monthCategory.budgeted === 0 && !isDelta)) {
        continue;
      }
      assignments.push({
        budget_id: budgetId,
        category_id: monthCategory.id,
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
  const payeeIds = new Set([...(known?.payeeIds ?? []), ...payees.map((payee) => payee.id)]);
  for (const id of deletedIds(plan.payees)) {
    payeeIds.delete(id);
  }

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
  const transactionIds = new Set([...(known?.transactionIds ?? []), ...transactions.map((row) => row.id)]);

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

  const scheduledSource = plan.scheduled_transactions ?? [];
  const scheduledTransactions: ScheduledTransactionRow[] = scheduledSource
    .filter((scheduled) => !scheduled.deleted && accountIds.has(scheduled.account_id))
    .map((scheduled) => ({
      id: scheduled.id,
      budget_id: budgetId,
      account_id: scheduled.account_id,
      date_first: scheduled.date_first,
      date_next: scheduled.date_next,
      frequency: isFrequency(scheduled.frequency) ? scheduled.frequency : "never",
      amount: scheduled.amount,
      payee_id: keepIfKnown(scheduled.payee_id, payeeIds),
      category_id: keepIfKnown(scheduled.category_id, categoryIds),
      memo: scheduled.memo,
      flag_color: scheduled.flag_color,
      transfer_account_id: keepIfKnown(scheduled.transfer_account_id, accountIds),
    }));
  const scheduledIds = new Set([
    ...(known?.scheduledTransactionIds ?? []),
    ...scheduledTransactions.map((row) => row.id),
  ]);

  const scheduledSubSource = plan.scheduled_subtransactions ?? [];
  const scheduledSubtransactions: ScheduledSubtransactionRow[] = scheduledSubSource
    .filter((sub) => !sub.deleted && scheduledIds.has(sub.scheduled_transaction_id))
    .map((sub) => ({
      id: sub.id,
      budget_id: budgetId,
      scheduled_transaction_id: sub.scheduled_transaction_id,
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
      ynab_server_knowledge: options.serverKnowledge ?? null,
    },
    accounts,
    categoryGroups,
    categories,
    assignments,
    payees,
    transactions,
    subtransactions,
    scheduledTransactions,
    scheduledSubtransactions,
    deleted: {
      accounts: [...deletedAccounts],
      category_groups: [...deletedIds(plan.category_groups)],
      categories: [...deletedCategories],
      payees: [...deletedIds(plan.payees)],
      transactions: [...deletedIds(plan.transactions)],
      subtransactions: [...deletedIds(plan.subtransactions)],
      scheduled_transactions: [...deletedIds(scheduledSource)],
      scheduled_subtransactions: [...deletedIds(scheduledSubSource)],
    },
  };
}

export function resolveCategoryKind(category: Pick<YnabCategory, "name" | "internal">, group: GroupInfo): CategoryKind {
  if (group.name === CREDIT_CARD_PAYMENTS_GROUP) {
    return "credit_card_payment";
  }
  // Newer exports flag internal categories themselves; older ones only flag the group.
  if (category.internal ?? group.isInternal) {
    return INCOME_CATEGORY_PATTERN.test(category.name) ? "income" : "internal";
  }
  return "standard";
}

type GoalColumns = Pick<
  CategoryRow,
  "goal_type" | "goal_target" | "goal_target_month" | "goal_cadence_months" | "goal_needs_whole_amount" | "goal_due_day" | "goal_created_month"
>;

/** Translates YNAB goal fields. Weekly targets become an equivalent monthly amount (an approximation). */
export function mapGoal(category: YnabCategory): GoalColumns {
  const type = category.goal_type ? (GOAL_TYPES[category.goal_type] ?? null) : null;
  const target = category.goal_target ?? 0;
  if (!type || target <= 0) {
    return {
      goal_type: null,
      goal_target: null,
      goal_target_month: null,
      goal_cadence_months: 0,
      goal_needs_whole_amount: true,
      goal_due_day: null,
      goal_created_month: null,
    };
  }

  const cadence = category.goal_cadence ?? 0;
  const frequency = Math.max(1, category.goal_cadence_frequency ?? 1);
  const isWeekly = cadence === 2;
  const targetDate = category.goal_target_date ?? category.goal_target_month ?? null;
  return {
    goal_type: type,
    goal_target: isWeekly ? Math.round((target * WEEKS_PER_MONTH) / frequency) : target,
    goal_target_month: targetDate && !isWeekly ? toMonthKey(targetDate) : null,
    goal_cadence_months: cadenceInMonths(cadence, frequency),
    goal_needs_whole_amount: category.goal_needs_whole_amount ?? true,
    goal_due_day: isWeekly ? null : dueDay(category),
    goal_created_month: category.goal_creation_month ? toMonthKey(category.goal_creation_month) : null,
  };
}

/** Day of the month a YNAB goal is due: its own day field, or the day of its target date. */
function dueDay(category: YnabCategory): number | null {
  const day = category.goal_day ?? (category.goal_target_date ? Number(category.goal_target_date.slice(8, 10)) : null);
  return day !== null && Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

function cadenceInMonths(cadence: number, frequency: number): number {
  if (cadence === 1) return frequency;
  if (cadence === 2) return 1;
  if (cadence === 13) return 12 * frequency;
  if (cadence === 14) return 24;
  if (cadence >= 3 && cadence <= 12) return cadence - 1;
  return 0;
}

function deletedIds(entities: Array<{ id: string; deleted: boolean }>): Set<string> {
  return new Set(entities.filter((entity) => entity.deleted).map((entity) => entity.id));
}

function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const merged = new Map(existing.map((entity) => [entity.id, entity]));
  for (const entity of incoming) {
    merged.set(entity.id, entity);
  }
  return [...merged.values()];
}

function keepIfKnown(id: string | null, knownIds: ReadonlySet<string>): string | null {
  return id && knownIds.has(id) ? id : null;
}
