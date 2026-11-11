import Link from "next/link";
import { notFound } from "next/navigation";
import { setAccountClosed } from "@/app/actions/accounts";
import { approveTransaction, deleteTransaction, reconcileAccount, setCleared } from "@/app/actions/transactions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Money } from "@/components/money";
import {
  cardClass,
  inputClass,
  labelClass,
  linkButtonClass,
  mutedTextClass,
  secondaryButtonClass,
  tableHeaderClass,
} from "@/components/ui";
import { accountTypeLabel } from "@/lib/accounts";
import { groupLabel } from "@/lib/categories";
import { todayIso } from "@/lib/actions/form";
import { getBudget, listAccounts, listCategories, listCategoryGroups, type AccountWithBalance } from "@/lib/data/core";
import {
  categoryLabel,
  getTransaction,
  listPayeeNames,
  listTransactions,
  type TransactionFilter,
  type TransactionListItem,
} from "@/lib/data/transactions";
import type { CategoryGroupRow, CategoryRow } from "@/lib/db/types";
import { milliunitsToInput, type CurrencySettings } from "@/lib/money";
import { SPLIT_CATEGORY, type CategoryOptionGroup, type TransactionDraft } from "@/lib/transaction-draft";
import { TransactionForm } from "./transaction-form";

const PAGE_STEP = 100;
const MAX_LIMIT = 2000;
const FILTERS: Array<{ value: TransactionFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "unapproved", label: "Sin aprobar" },
  { value: "uncleared", label: "Sin confirmar en el banco" },
];
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
  const filter = FILTERS.find((option) => option.value === firstValue(searchParams.filter))?.value ?? "all";
  const limit = Math.min(MAX_LIMIT, Math.max(PAGE_STEP, Number(firstValue(searchParams.limit)) || PAGE_STEP));
  const editId = firstValue(searchParams.edit);
  const basePath = accountId ? `/budgets/${budgetId}/accounts/${accountId}` : `/budgets/${budgetId}/accounts`;

  const [page, groups, categories, payeeNames, editing] = await Promise.all([
    listTransactions(budgetId, { accountId, search, filter, limit }),
    listCategoryGroups(budgetId),
    listCategories(budgetId),
    listPayeeNames(budgetId),
    editId ? getTransaction(budgetId, editId) : null,
  ]);

  const currency: CurrencySettings = { isoCode: budget.currency_iso_code, decimalDigits: budget.currency_decimal_digits };
  const accountNames = new Map(accounts.map((entry) => [entry.id, entry.name]));
  const openAccounts = accounts.filter((entry) => !entry.closed).map((entry) => ({ id: entry.id, name: entry.name }));
  const query = new URLSearchParams();
  if (search) query.set("q", search);
  if (filter !== "all") query.set("filter", filter);
  const listPath = query.size > 0 ? `${basePath}?${query}` : basePath;

  return (
    <>
      {account ? (
        <AccountHeader account={account} currency={currency} />
      ) : (
        <h1 className="text-2xl font-semibold">Todos los movimientos</h1>
      )}

      {openAccounts.length === 0 ? (
        <p className={mutedTextClass}>Agrega una cuenta desde la barra lateral para capturar transacciones.</p>
      ) : (
        <section className={cardClass}>
          <h2 className="mb-3 text-sm font-medium">{editing ? "Editar transacción" : "Nueva transacción"}</h2>
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
            <div className="mt-3 flex items-center justify-between border-t border-neutral-200 pt-3 dark:border-neutral-800">
              <Link href={listPath} className={linkButtonClass}>Cancelar</Link>
              <form action={deleteTransaction}>
                <input type="hidden" name="budgetId" value={budgetId} />
                <input type="hidden" name="id" value={editing.id} />
                <input type="hidden" name="returnTo" value={listPath} />
                <SubmitButton className={`${linkButtonClass} !text-red-600 dark:!text-red-400`} pendingLabel="Eliminando…">
                  Eliminar transacción
                </SubmitButton>
              </form>
            </div>
          ) : null}
        </section>
      )}

      <form method="get" action={basePath} className="flex flex-wrap items-end gap-3">
        <label className={`${labelClass} min-w-48 flex-1`}>
          Buscar por beneficiario o nota
          <input name="q" defaultValue={search} className={inputClass} />
        </label>
        <label className={labelClass}>
          Mostrar
          <select name="filter" defaultValue={filter} className={inputClass}>
            {FILTERS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" className={secondaryButtonClass}>Filtrar</button>
      </form>

      {page.items.length === 0 ? (
        <p className={mutedTextClass}>No hay transacciones que coincidan.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className={tableHeaderClass}>
                <th className="py-2 pr-2 font-medium">Fecha</th>
                {account ? null : <th className="py-2 pr-2 font-medium">Cuenta</th>}
                <th className="py-2 pr-2 font-medium">Beneficiario</th>
                <th className="py-2 pr-2 font-medium">Categoría</th>
                <th className="py-2 pr-2 text-right font-medium">Salida</th>
                <th className="py-2 pr-2 text-right font-medium">Entrada</th>
                <th className="py-2 pr-2 font-medium">Banco</th>
                <th className="py-2 font-medium"><span className="sr-only">Acciones</span></th>
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
                  editHref={`${listPath}${query.size > 0 ? "&" : "?"}edit=${encodeURIComponent(transaction.id)}`}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {page.hasMore ? (
        <Link href={`${listPath}${query.size > 0 ? "&" : "?"}limit=${limit + PAGE_STEP}`} className={`${linkButtonClass} self-center`}>
          Ver más transacciones
        </Link>
      ) : null}
    </>
  );
}

function AccountHeader({ account, currency }: { account: AccountWithBalance; currency: CurrencySettings }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{account.name}</h1>
          <p className={mutedTextClass}>
            {accountTypeLabel(account.type)}
            {account.closed ? " · Cerrada" : ""}
          </p>
        </div>
        <form action={setAccountClosed}>
          <input type="hidden" name="accountId" value={account.id} />
          <input type="hidden" name="closed" value={account.closed ? "false" : "true"} />
          <SubmitButton className={linkButtonClass}>{account.closed ? "Reabrir cuenta" : "Cerrar cuenta"}</SubmitButton>
        </form>
      </div>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <BalanceStat label="Confirmado en el banco" amount={account.clearedBalance} currency={currency} />
        <BalanceStat label="Sin confirmar" amount={account.unclearedBalance} currency={currency} />
        <BalanceStat label="Saldo" amount={account.balance} currency={currency} isEmphasized />
      </dl>
      <details className="rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <summary className="cursor-pointer text-sm font-medium">Conciliar con el banco</summary>
        <ActionForm action={reconcileAccount} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="accountId" value={account.id} />
          <input type="hidden" name="currency" value={currency.isoCode} />
          <p className={mutedTextClass}>
            Escribe el saldo que muestra tu banco hoy. Las transacciones confirmadas quedan bloqueadas y, si hay
            diferencia contra <Money amount={account.clearedBalance} currency={currency} />, se registra un ajuste.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className={labelClass}>
              Saldo en el banco
              <input
                name="statementBalance"
                inputMode="decimal"
                required
                placeholder={milliunitsToInput(account.clearedBalance, currency.decimalDigits)}
                className={`${inputClass} w-40 text-right`}
              />
            </label>
            <SubmitButton pendingLabel="Conciliando…">Conciliar</SubmitButton>
          </div>
        </ActionForm>
      </details>
    </section>
  );
}

function BalanceStat({
  label,
  amount,
  currency,
  isEmphasized = false,
}: {
  label: string;
  amount: number;
  currency: CurrencySettings;
  isEmphasized?: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className={isEmphasized ? "text-lg font-semibold" : "text-lg"}>
        <Money amount={amount} currency={currency} />
      </dd>
    </div>
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
  const payeeLabel = transaction.transfer_account_id
    ? `Transferencia: ${accountNames.get(transaction.transfer_account_id) ?? "otra cuenta"}`
    : (transaction.payee?.name ?? "");
  const flagClass = transaction.flag_color ? FLAG_CLASSES[transaction.flag_color] : undefined;

  return (
    <tr className={`border-b border-neutral-100 align-top dark:border-neutral-900 ${transaction.approved ? "" : "bg-amber-50 dark:bg-amber-950/40"}`}>
      <td className="py-2 pr-2 whitespace-nowrap tabular-nums">{transaction.date}</td>
      {showAccount ? <td className="py-2 pr-2">{accountNames.get(transaction.account_id)}</td> : null}
      <td className="py-2 pr-2">
        <span className="flex items-center gap-1.5">
          {flagClass ? <span className={`inline-block size-2 shrink-0 rounded-full ${flagClass}`} title="Bandera" /> : null}
          {payeeLabel}
        </span>
        {transaction.memo ? <span className="block text-xs text-neutral-500">{transaction.memo}</span> : null}
      </td>
      <td className="py-2 pr-2">
        {isSplit ? (
          <ul className="flex flex-col gap-0.5">
            {transaction.subtransactions.map((split) => (
              <li key={split.id} className="flex justify-between gap-3">
                <span>{categoryLabel(split.category) ?? "Sin categoría"}</span>
                <Money amount={split.amount} currency={currency} className="text-neutral-500" />
              </li>
            ))}
          </ul>
        ) : (
          (categoryLabel(transaction.category) ?? (transaction.transfer_account_id ? "" : <span className="text-neutral-500">Sin categoría</span>))
        )}
      </td>
      <td className="py-2 pr-2 text-right">
        {transaction.amount < 0 ? <Money amount={-transaction.amount} currency={currency} /> : null}
      </td>
      <td className="py-2 pr-2 text-right">
        {transaction.amount > 0 ? <Money amount={transaction.amount} currency={currency} /> : null}
      </td>
      <td className="py-2 pr-2">
        {transaction.cleared === "reconciled" ? (
          <span className="text-xs text-neutral-500" title="Conciliada: ya no se puede cambiar su estado">Conciliada</span>
        ) : (
          <form action={setCleared}>
            <input type="hidden" name="id" value={transaction.id} />
            <input type="hidden" name="cleared" value={transaction.cleared === "cleared" ? "uncleared" : "cleared"} />
            <SubmitButton
              className={`rounded-full border px-2 py-0.5 text-xs ${transaction.cleared === "cleared" ? "border-emerald-600 text-emerald-700 dark:text-emerald-400" : "border-neutral-300 text-neutral-500 dark:border-neutral-700"}`}
              title="Cambiar si ya aparece en el banco"
            >
              {transaction.cleared === "cleared" ? "Confirmada" : "Pendiente"}
            </SubmitButton>
          </form>
        )}
      </td>
      <td className="py-2 text-right whitespace-nowrap">
        {transaction.approved ? null : (
          <form action={approveTransaction} className="mr-2 inline">
            <input type="hidden" name="id" value={transaction.id} />
            <SubmitButton className={linkButtonClass}>Aprobar</SubmitButton>
          </form>
        )}
        <Link href={editHref} className={linkButtonClass}>Editar</Link>
      </td>
    </tr>
  );
}

function toCategoryOptions(groups: CategoryGroupRow[], categories: CategoryRow[]): CategoryOptionGroup[] {
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
