import Link from "next/link";
import { notFound } from "next/navigation";
import { setAccountClosed } from "@/app/actions/accounts";
import { approveTransaction, deleteTransaction, reconcileAccount, setCleared } from "@/app/actions/transactions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Icon } from "@/components/icons";
import { Money } from "@/components/money";
import {
  eyebrowClass,
  headingClass,
  inputClass,
  labelClass,
  linkButtonClass,
  mutedTextClass,
  pillWarnClass,
  primaryButtonClass,
  secondaryButtonClass,
  sectionTitleClass,
  tableHeaderClass,
} from "@/components/ui";
import { accountTypeLabel } from "@/lib/accounts";
import { todayIso } from "@/lib/actions/form";
import { groupLabel } from "@/lib/categories";
import { getBudget, listAccounts, listCategories, listCategoryGroups, type AccountWithBalance } from "@/lib/data/core";
import {
  categoryLabel,
  countTransactions,
  getTransaction,
  listPayeeNames,
  listTransactions,
  type TransactionFilter,
  type TransactionListItem,
} from "@/lib/data/transactions";
import type { CategoryGroupRow, CategoryRow } from "@/lib/db/types";
import { formatDayTitle, formatShortDate } from "@/lib/dates";
import { milliunitsToInput, type CurrencySettings } from "@/lib/money";
import { SPLIT_CATEGORY, type CategoryOptionGroup, type TransactionDraft } from "@/lib/transaction-draft";
import { AccountsOverview } from "./overview";
import { TransactionForm } from "./transaction-form";

const PAGE_STEP = 100;
const MAX_LIMIT = 2000;
const FILTER_VALUES: TransactionFilter[] = ["all", "unapproved", "uncleared", "uncategorized"];
const FLAG_CLASSES: Record<string, string> = {
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-400",
  green: "bg-green-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
};

interface RegisterProps {
  budgetId: string;
  /** Omitted to list the transactions of every account. */
  accountId?: string;
  searchParams: Record<string, string | string[] | undefined>;
}

/** Transaction list with its entry form. Shared by the single-account and all-accounts pages. */
export async function Register({ budgetId, accountId, searchParams }: RegisterProps) {
  const budget = await getBudget(budgetId);
  if (!budget) {
    notFound();
  }
  const accounts = await listAccounts(budgetId);
  const account = accountId ? accounts.find((candidate) => candidate.id === accountId) : undefined;
  if (accountId && !account) {
    notFound();
  }

  const search = firstValue(searchParams.q);
  const filter = FILTER_VALUES.find((value) => value === firstValue(searchParams.filter)) ?? "all";
  const limit = Math.min(MAX_LIMIT, Math.max(PAGE_STEP, Number(firstValue(searchParams.limit)) || PAGE_STEP));
  const editId = firstValue(searchParams.edit);
  // Phones enter transactions on their own screen; the inline form only shows there when asked for.
  const isFormRequested = firstValue(searchParams.form) === "1";
  const basePath = accountId ? `/budgets/${budgetId}/accounts/${accountId}` : `/budgets/${budgetId}/accounts`;

  const [page, counts, groups, categories, payeeNames, editing] = await Promise.all([
    listTransactions(budgetId, { accountId, search, filter, limit }),
    countTransactions(budgetId, accountId),
    listCategoryGroups(budgetId),
    listCategories(budgetId),
    listPayeeNames(budgetId),
    editId ? getTransaction(budgetId, editId) : null,
  ]);

  const currency: CurrencySettings = { isoCode: budget.currency_iso_code, decimalDigits: budget.currency_decimal_digits };
  const accountNames = new Map(accounts.map((entry) => [entry.id, entry.name]));
  const openAccounts = accounts.filter((entry) => !entry.closed).map((entry) => ({ id: entry.id, name: entry.name }));
  const pathWith = (nextFilter: TransactionFilter, extra: Record<string, string> = {}) => {
    const query = new URLSearchParams(extra);
    if (search) query.set("q", search);
    if (nextFilter !== "all") query.set("filter", nextFilter);
    return query.size > 0 ? `${basePath}?${query}` : basePath;
  };
  const listPath = pathWith(filter);
  const filters: Array<{ value: TransactionFilter; label: string }> = [
    { value: "all", label: "Todas" },
    { value: "unapproved", label: "Sin aprobar" },
    { value: "uncleared", label: counts.uncleared > 0 ? `Sin confirmar · ${counts.uncleared}` : "Sin confirmar" },
    { value: "uncategorized", label: counts.uncategorized > 0 ? `Sin categoría · ${counts.uncategorized}` : "Sin categoría" },
  ];

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className={eyebrowClass}>
            {account ? `${accountTypeLabel(account.type)}${account.closed ? " · cerrada" : ""}` : "Todas las cuentas"}
          </span>
          <h1 className={headingClass}>
            {account ? (
              account.name
            ) : (
              <>
                <span className="md:hidden">Cuentas</span>
                <span className="hidden md:inline">Movimientos</span>
              </>
            )}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {account ? <AccountActions account={account} currency={currency} /> : null}
          {openAccounts.length > 0 ? (
            <span className="hidden md:block">
              <a href="#nueva" className={primaryButtonClass}>
                <Icon name="plus" />
                Nueva transacción
              </a>
            </span>
          ) : null}
        </div>
      </header>

      {account ? (
        <BalanceStrip account={account} currency={currency} unclearedCount={counts.uncleared} />
      ) : (
        <AccountsOverview budgetId={budgetId} accounts={accounts} currency={currency} uncategorizedCount={counts.uncategorized} />
      )}

      {openAccounts.length === 0 ? (
        <p className={mutedTextClass}>Agrega una cuenta para empezar a capturar transacciones.</p>
      ) : (
        <section
          id="nueva"
          className={`scroll-mt-4 rounded-[14px] border-2 border-accent bg-surface px-4.5 py-4 ${editing || isFormRequested ? "" : "hidden md:block"}`}
        >
          <h2 className={`mb-3 ${eyebrowClass}`}>{editing ? "Editar transacción" : "Nueva transacción"}</h2>
          <TransactionForm
            budgetId={budgetId}
            accounts={openAccounts}
            fixedAccountId={editing ? undefined : accountId}
            categoryGroups={toCategoryOptions(groups, categories)}
            incomeCategoryId={categories.find((category) => category.kind === "income")?.id ?? null}
            payeeNames={payeeNames}
            today={todayIso()}
            returnTo={listPath}
            initial={editing ? toDraft(editing, currency.decimalDigits) : undefined}
          />
          {editing ? (
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
              <Link href={listPath} className={linkButtonClass}>Cancelar</Link>
              <form action={deleteTransaction}>
                <input type="hidden" name="budgetId" value={budgetId} />
                <input type="hidden" name="id" value={editing.id} />
                <input type="hidden" name="returnTo" value={listPath} />
                <SubmitButton className={`${linkButtonClass} !text-red-700`} pendingLabel="Eliminando…">
                  Eliminar transacción
                </SubmitButton>
              </form>
            </div>
          ) : null}
        </section>
      )}

      {account ? null : <h2 className={`${sectionTitleClass} md:hidden`}>Movimientos</h2>}

      <div className="flex flex-wrap items-center gap-3">
        <form method="get" action={basePath} className="flex min-w-60 flex-1 items-center gap-2">
          {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
          <label className="flex min-h-11 flex-1 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3 text-muted focus-within:border-accent">
            <Icon name="search" />
            <span className="sr-only">Buscar por beneficiario o nota</span>
            <input
              type="search"
              name="q"
              defaultValue={search}
              placeholder="Buscar por beneficiario o nota"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
            />
          </label>
          <button type="submit" className={secondaryButtonClass}>Buscar</button>
        </form>
        <nav aria-label="Mostrar" className="flex flex-wrap gap-1.5">
          {filters.map((option) => (
            <Link
              key={option.value}
              href={pathWith(option.value)}
              aria-current={option.value === filter ? "true" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm ${
                option.value === filter
                  ? "border-accent bg-accent-soft font-semibold text-accent"
                  : "border-line-strong bg-surface font-medium text-ink-soft hover:bg-subtle"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </div>

      {page.items.length === 0 ? (
        <p className={mutedTextClass}>No hay transacciones que coincidan.</p>
      ) : (
        <>
        <DayList
          items={page.items}
          accountNames={accountNames}
          showAccount={!account}
          currency={currency}
          today={todayIso()}
          editHref={(id) => `${pathWith(filter, { edit: id })}#nueva`}
        />
        <section aria-label="Movimientos" className="hidden overflow-x-auto rounded-[14px] border border-line bg-surface md:block">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className={tableHeaderClass}>
                <th className="w-14 py-3 pl-4 font-semibold">Banco</th>
                <th className="px-2 py-3 font-semibold">Fecha</th>
                {account ? null : <th className="px-2 py-3 font-semibold">Cuenta</th>}
                <th className="px-2 py-3 font-semibold">Beneficiario</th>
                <th className="px-2 py-3 font-semibold">Categoría</th>
                <th className="px-2 py-3 text-right font-semibold">Salida</th>
                <th className="px-2 py-3 text-right font-semibold">Entrada</th>
                <th className="py-3 pr-4 font-semibold"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  accountNames={accountNames}
                  showAccount={!account}
                  currency={currency}
                  editHref={`${pathWith(filter, { edit: transaction.id })}#nueva`}
                />
              ))}
            </tbody>
          </table>
        </section>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>
          {page.items.length === 1 ? "1 movimiento" : `${page.items.length} movimientos`}
          {page.hasMore ? " mostrados, hay más" : ""}
        </span>
        {page.hasMore ? (
          <Link href={pathWith(filter, { limit: String(limit + PAGE_STEP) })} className="font-medium text-accent underline underline-offset-4">
            Ver más transacciones
          </Link>
        ) : null}
      </div>
    </>
  );
}

function AccountActions({ account, currency }: { account: AccountWithBalance; currency: CurrencySettings }) {
  return (
    <>
      <form action={setAccountClosed}>
        <input type="hidden" name="accountId" value={account.id} />
        <input type="hidden" name="closed" value={account.closed ? "false" : "true"} />
        <SubmitButton className={`${linkButtonClass} px-2`}>{account.closed ? "Reabrir cuenta" : "Cerrar cuenta"}</SubmitButton>
      </form>
      <details className="relative">
        <summary className={`${secondaryButtonClass} list-none`}>
          <Icon name="lock" />
          Conciliar con el banco
        </summary>
        <div className="absolute right-0 z-10 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-[14px] border border-line bg-surface p-4 shadow-lg">
          <ActionForm action={reconcileAccount} className="flex flex-col gap-3">
            <input type="hidden" name="accountId" value={account.id} />
            <input type="hidden" name="currency" value={currency.isoCode} />
            <p className={mutedTextClass}>
              Escribe el saldo que muestra tu banco hoy. Lo confirmado queda bloqueado y, si hay diferencia contra{" "}
              <Money amount={account.clearedBalance} currency={currency} />, se registra un ajuste.
            </p>
            <label className={labelClass}>
              Saldo en el banco
              <input
                name="statementBalance"
                inputMode="decimal"
                required
                placeholder={milliunitsToInput(account.clearedBalance, currency.decimalDigits)}
                className={`${inputClass} text-right`}
              />
            </label>
            <SubmitButton pendingLabel="Conciliando…">Conciliar</SubmitButton>
          </ActionForm>
        </div>
      </details>
    </>
  );
}

/** Balances read as a sum: confirmed plus unconfirmed equals the account balance. */
function BalanceStrip({
  account,
  currency,
  unclearedCount,
}: {
  account: AccountWithBalance;
  currency: CurrencySettings;
  unclearedCount: number;
}) {
  return (
    <section aria-label="Saldos" className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[14px] border border-line bg-surface px-5 py-4 max-md:items-end max-md:px-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] text-muted">Confirmado en el banco</span>
        <Money amount={account.clearedBalance} currency={currency} className="font-display text-[22px] font-semibold max-md:text-base" />
      </div>
      <span aria-hidden="true" className="text-[22px] text-muted max-md:hidden">+</span>
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] text-muted">
          Sin confirmar{unclearedCount > 0 ? ` (${unclearedCount} ${unclearedCount === 1 ? "movimiento" : "movimientos"})` : ""}
        </span>
        <Money amount={account.unclearedBalance} currency={currency} className="font-display text-[22px] font-semibold max-md:text-base" />
      </div>
      <span aria-hidden="true" className="text-[22px] text-muted max-md:hidden">=</span>
      <div className="flex flex-col gap-0.5 max-md:order-first max-md:w-full">
        <span className="text-[13px] text-muted">Saldo de la cuenta</span>
        <Money
          amount={account.balance}
          currency={currency}
          className={`font-display text-[28px] leading-tight font-bold ${account.balance < 0 ? "text-warn-ink" : "text-accent"}`}
        />
      </div>
    </section>
  );
}

function TransactionRow({
  transaction,
  accountNames,
  showAccount,
  currency,
  editHref,
}: {
  transaction: TransactionListItem;
  accountNames: Map<string, string>;
  showAccount: boolean;
  currency: CurrencySettings;
  editHref: string;
}) {
  const isSplit = transaction.subtransactions.length > 0;
  const isTransfer = Boolean(transaction.transfer_account_id);
  const needsCategory = !isSplit && !isTransfer && !transaction.category;
  const payeeLabel = isTransfer
    ? `Transferencia: ${accountNames.get(transaction.transfer_account_id ?? "") ?? "otra cuenta"}`
    : (transaction.payee?.name ?? "");
  const flagClass = transaction.flag_color ? FLAG_CLASSES[transaction.flag_color] : undefined;

  return (
    <tr className={`border-t border-hairline align-middle ${transaction.approved && !needsCategory ? "" : "bg-warn-softer/60"}`}>
      <td className="py-1 pl-2">
        <ClearedControl transaction={transaction} />
      </td>
      <td className="px-2 py-2 whitespace-nowrap tabular-nums">{formatShortDate(transaction.date)}</td>
      {showAccount ? <td className="px-2 py-2">{accountNames.get(transaction.account_id)}</td> : null}
      <td className="px-2 py-2">
        <span className="flex items-center gap-1.5 font-medium">
          {flagClass ? <span className={`inline-block size-2 shrink-0 rounded-full ${flagClass}`} title="Bandera" /> : null}
          {payeeLabel}
        </span>
        {transaction.memo ? <span className="block text-xs text-muted">{transaction.memo}</span> : null}
        {transaction.approved ? null : <span className="block text-xs text-warn-ink">Sin aprobar</span>}
      </td>
      <td className="px-2 py-2">
        {isSplit ? (
          <ul className="flex flex-col gap-0.5">
            {transaction.subtransactions.map((split) => (
              <li key={split.id} className="flex justify-between gap-3">
                <span>{categoryLabel(split.category) ?? "Sin categoría"}</span>
                <Money amount={Math.abs(split.amount)} currency={currency} className="text-muted" />
              </li>
            ))}
          </ul>
        ) : needsCategory ? (
          <Link href={editHref} className={`${pillWarnClass} min-h-9 border border-warn-line`}>
            <Icon name="tag" size={14} strokeWidth={2} />
            Elegir categoría
          </Link>
        ) : (
          categoryLabel(transaction.category)
        )}
      </td>
      <td className="px-2 py-2 text-right">
        {transaction.amount < 0 ? <Money amount={-transaction.amount} currency={currency} /> : null}
      </td>
      <td className="px-2 py-2 text-right font-semibold text-accent-strong">
        {transaction.amount > 0 ? (
          <>
            +<Money amount={transaction.amount} currency={currency} />
          </>
        ) : null}
      </td>
      <td className="py-2 pr-4 text-right whitespace-nowrap">
        {transaction.approved ? null : (
          <form action={approveTransaction} className="mr-3 inline">
            <input type="hidden" name="id" value={transaction.id} />
            <SubmitButton className={linkButtonClass}>Aprobar</SubmitButton>
          </form>
        )}
        <Link href={editHref} className={linkButtonClass}>Editar</Link>
      </td>
    </tr>
  );
}

/** Phone layout of the list: one card per day, each transaction a row that opens it for editing. */
function DayList({
  items,
  accountNames,
  showAccount,
  currency,
  today,
  editHref,
}: {
  items: TransactionListItem[];
  accountNames: Map<string, string>;
  showAccount: boolean;
  currency: CurrencySettings;
  today: string;
  editHref: (transactionId: string) => string;
}) {
  const days = new Map<string, TransactionListItem[]>();
  for (const item of items) {
    days.set(item.date, [...(days.get(item.date) ?? []), item]);
  }

  return (
    <div className="flex flex-col gap-3 md:hidden">
      {[...days].map(([date, transactions]) => (
        <section key={date} aria-label={formatDayTitle(date, today)} className="overflow-hidden rounded-[14px] border border-line bg-surface">
          <div className={`flex justify-between bg-subtle px-3.5 py-2 ${eyebrowClass}`}>
            <span>{formatDayTitle(date, today)}</span>
            <SignedMoney amount={transactions.reduce((sum, transaction) => sum + transaction.amount, 0)} currency={currency} />
          </div>
          {transactions.map((transaction) => {
            const isSplit = transaction.subtransactions.length > 0;
            const isTransfer = Boolean(transaction.transfer_account_id);
            const needsCategory = !isSplit && !isTransfer && !transaction.category;
            const title = isTransfer
              ? `Transferencia: ${accountNames.get(transaction.transfer_account_id ?? "") ?? "otra cuenta"}`
              : (transaction.payee?.name ?? "Sin beneficiario");
            const detail = [
              isSplit ? "Dividida en varias categorías" : isTransfer ? "Traspaso entre cuentas" : categoryLabel(transaction.category),
              showAccount ? accountNames.get(transaction.account_id) : null,
              transaction.approved ? null : "Sin aprobar",
            ].filter(Boolean);
            return (
              <Link
                key={transaction.id}
                href={editHref(transaction.id)}
                className="flex min-h-15 items-center gap-3 border-t border-hairline px-3.5 py-2 text-[15px] active:bg-subtle"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{title}</span>
                  {needsCategory ? (
                    <span className="flex items-center gap-1 text-xs text-warn-ink">
                      <Icon name="alert" size={13} strokeWidth={2} />
                      {["Elige una categoría", ...detail].join(" · ")}
                    </span>
                  ) : (
                    <span className="truncate text-xs text-muted">{detail.join(" · ")}</span>
                  )}
                </span>
                <SignedMoney amount={transaction.amount} currency={currency} className="font-semibold" />
              </Link>
            );
          })}
        </section>
      ))}
    </div>
  );
}

/** Amount with an explicit sign; money coming in is tinted so it does not rely on the sign alone. */
function SignedMoney({ amount, currency, className = "" }: { amount: number; currency: CurrencySettings; className?: string }) {
  return (
    <span className={`whitespace-nowrap tabular-nums ${amount > 0 ? "text-accent-strong" : ""} ${className}`}>
      {amount > 0 ? "+" : ""}
      <Money amount={amount} currency={currency} />
    </span>
  );
}

/** Lock for reconciled rows; otherwise a toggle between pending (empty circle) and confirmed (check). */
function ClearedControl({ transaction }: { transaction: TransactionListItem }) {
  if (transaction.cleared === "reconciled") {
    return (
      <span role="img" aria-label="Conciliada" title="Conciliada: ya no se puede cambiar" className="flex size-11 items-center justify-center text-muted">
        <Icon name="lock" />
      </span>
    );
  }
  const isCleared = transaction.cleared === "cleared";
  return (
    <form action={setCleared}>
      <input type="hidden" name="id" value={transaction.id} />
      <input type="hidden" name="cleared" value={isCleared ? "uncleared" : "cleared"} />
      <SubmitButton
        className="flex size-11 cursor-pointer items-center justify-center rounded-lg hover:bg-subtle disabled:opacity-60"
        aria-label={isCleared ? "Confirmada en el banco. Marcar como pendiente" : "Pendiente. Marcar como confirmada en el banco"}
      >
        {isCleared ? (
          <span className="flex size-[18px] items-center justify-center rounded-full bg-accent text-white">
            <Icon name="check" size={12} strokeWidth={3} />
          </span>
        ) : (
          <span className="block size-[18px] rounded-full border-2 border-line-strong" />
        )}
      </SubmitButton>
    </form>
  );
}

export function toCategoryOptions(groups: CategoryGroupRow[], categories: CategoryRow[]): CategoryOptionGroup[] {
  return groups
    .filter((group) => !group.is_internal && !group.hidden)
    .map((group) => ({
      name: groupLabel(group.name),
      options: categories
        .filter((category) => category.group_id === group.id && category.kind === "standard" && !category.hidden)
        .map((category) => ({ id: category.id, name: category.name })),
    }))
    .filter((group) => group.options.length > 0);
}

function toDraft(transaction: TransactionListItem, decimalDigits: number): TransactionDraft {
  const format = (amount: number) => milliunitsToInput(Math.abs(amount), decimalDigits);
  return {
    id: transaction.id,
    accountId: transaction.account_id,
    date: transaction.date,
    outflow: transaction.amount < 0 ? format(transaction.amount) : "",
    inflow: transaction.amount > 0 ? format(transaction.amount) : "",
    payeeName: transaction.payee?.name ?? "",
    transferAccountId: transaction.transfer_account_id ?? "",
    categoryId: transaction.subtransactions.length > 0 ? SPLIT_CATEGORY : (transaction.category_id ?? ""),
    memo: transaction.memo ?? "",
    isCleared: transaction.cleared !== "uncleared",
    flagColor: transaction.flag_color ?? "",
    splits: transaction.subtransactions.map((split) => ({
      categoryId: split.category_id ?? "",
      amount: format(split.amount),
    })),
  };
}

function firstValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}
