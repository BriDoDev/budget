import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  advanceScheduledTransaction,
  createScheduledTransaction,
  deleteScheduledTransaction,
} from "@/app/actions/scheduled";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Money } from "@/components/money";
import { ListSkeleton } from "@/components/skeleton";
import { cardClass, inputClass, labelClass, linkButtonClass, mutedTextClass, pageClass, tableHeaderClass } from "@/components/ui";
import { todayIso } from "@/lib/actions/form";
import { groupLabel } from "@/lib/categories";
import { getBudget, listAccounts, listCategories, listCategoryGroups } from "@/lib/data/core";
import { categoryLabel, listPayeeNames, listScheduledTransactions, type ScheduledListItem } from "@/lib/data/transactions";
import type { CurrencySettings } from "@/lib/money";
import { FREQUENCIES, FREQUENCY_LABELS } from "@/lib/schedule";

type Props = PageProps<"/budgets/[budgetId]/scheduled">;

export default function ScheduledPage({ params }: Props) {
  return (
    <main className={pageClass}>
      <h1 className="font-display text-[28px] leading-tight font-semibold">Transacciones programadas</h1>
      <Suspense fallback={<ListSkeleton label="Cargando programadas…" />}>
        <Scheduled params={params} />
      </Suspense>
    </main>
  );
}

async function Scheduled({ params }: Pick<Props, "params">) {
  const { budgetId } = await params;
  const budget = await getBudget(budgetId);
  if (!budget) {
    notFound();
  }
  const [scheduled, accounts, groups, categories, payeeNames] = await Promise.all([
    listScheduledTransactions(budgetId),
    listAccounts(budgetId),
    listCategoryGroups(budgetId),
    listCategories(budgetId),
    listPayeeNames(budgetId),
  ]);
  const currency: CurrencySettings = { isoCode: budget.currency_iso_code, decimalDigits: budget.currency_decimal_digits };
  const today = todayIso();
  const openAccounts = accounts.filter((account) => !account.closed);
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const incomeCategory = categories.find((category) => category.kind === "income");

  return (
    <>
      <p className={mutedTextClass}>
        Pagos e ingresos que se repiten. Cuando llegue su fecha, regístralos con un clic para que entren a la cuenta.
      </p>

      {openAccounts.length === 0 ? (
        <p className={mutedTextClass}>Agrega una cuenta desde la barra lateral para programar transacciones.</p>
      ) : (
        <details className={cardClass} open={scheduled.length === 0}>
          <summary className="cursor-pointer text-sm font-medium">Programar una transacción</summary>
          <ActionForm action={createScheduledTransaction} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="budgetId" value={budgetId} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className={labelClass}>
                Cuenta
                <select name="accountId" required className={inputClass}>
                  {openAccounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Primera fecha
                <input type="date" name="date" defaultValue={today} required className={inputClass} />
              </label>
              <label className={labelClass}>
                Se repite
                <select name="frequency" defaultValue="monthly" className={inputClass}>
                  {FREQUENCIES.map((frequency) => (
                    <option key={frequency} value={frequency}>{FREQUENCY_LABELS[frequency]}</option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Beneficiario
                <input name="payeeName" list="scheduled-payees" className={inputClass} />
                <datalist id="scheduled-payees">
                  {payeeNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </label>
              <label className={labelClass}>
                O transferir a otra cuenta
                <select name="transferAccountId" defaultValue="" className={inputClass}>
                  <option value="">No es transferencia</option>
                  {openAccounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Categoría
                <select name="categoryId" defaultValue="" className={inputClass}>
                  <option value="">Sin categoría</option>
                  {incomeCategory ? <option value={incomeCategory.id}>Ingreso: listo para asignar</option> : null}
                  {groups
                    .filter((group) => !group.is_internal && !group.hidden)
                    .map((group) => (
                      <optgroup key={group.id} label={groupLabel(group.name)}>
                        {categories
                          .filter((category) => category.group_id === group.id && category.kind === "standard" && !category.hidden)
                          .map((category) => (
                            <option key={category.id} value={category.id}>{category.name}</option>
                          ))}
                      </optgroup>
                    ))}
                </select>
              </label>
              <label className={labelClass}>
                Salida
                <input name="outflow" inputMode="decimal" placeholder="0.00" className={`${inputClass} text-right`} />
              </label>
              <label className={labelClass}>
                Entrada
                <input name="inflow" inputMode="decimal" placeholder="0.00" className={`${inputClass} text-right`} />
              </label>
              <label className={`${labelClass} sm:col-span-2`}>
                Nota
                <input name="memo" className={inputClass} />
              </label>
            </div>
            <SubmitButton pendingLabel="Programando…">Programar</SubmitButton>
          </ActionForm>
        </details>
      )}

      {scheduled.length === 0 ? (
        <p className={mutedTextClass}>Todavía no hay transacciones programadas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className={tableHeaderClass}>
                <th className="py-2 pr-2 font-medium">Próxima fecha</th>
                <th className="py-2 pr-2 font-medium">Se repite</th>
                <th className="py-2 pr-2 font-medium">Cuenta</th>
                <th className="py-2 pr-2 font-medium">Beneficiario</th>
                <th className="py-2 pr-2 font-medium">Categoría</th>
                <th className="py-2 pr-2 text-right font-medium">Monto</th>
                <th className="py-2 font-medium"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {scheduled.map((item) => (
                <ScheduledRow key={item.id} item={item} accountNames={accountNames} currency={currency} isDue={item.date_next <= today} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ScheduledRow({
  item,
  accountNames,
  currency,
  isDue,
}: {
  item: ScheduledListItem;
  accountNames: Map<string, string>;
  currency: CurrencySettings;
  isDue: boolean;
}) {
  const payee = item.transfer_account_id
    ? `Transferencia: ${accountNames.get(item.transfer_account_id) ?? "otra cuenta"}`
    : (item.payee?.name ?? "");
  const category =
    item.scheduled_subtransactions.length > 0 ? "Dividida" : (categoryLabel(item.category) ?? (item.transfer_account_id ? "" : "Sin categoría"));

  return (
    <tr className={`border-b border-hairline align-top ${isDue ? "bg-warn-softer" : ""}`}>
      <td className="py-2 pr-2 whitespace-nowrap tabular-nums">
        {item.date_next}
        {isDue ? <span className="ml-2 text-xs text-warn-ink">Ya toca</span> : null}
      </td>
      <td className="py-2 pr-2">{FREQUENCY_LABELS[item.frequency]}</td>
      <td className="py-2 pr-2">{accountNames.get(item.account_id)}</td>
      <td className="py-2 pr-2">
        {payee}
        {item.memo ? <span className="block text-xs text-muted">{item.memo}</span> : null}
      </td>
      <td className="py-2 pr-2">{category}</td>
      <td className={`py-2 pr-2 text-right ${item.amount > 0 ? "text-accent-strong" : ""}`}>
        <Money amount={item.amount} currency={currency} />
      </td>
      <td className="py-2 text-right whitespace-nowrap">
        <form action={advanceScheduledTransaction} className="inline">
          <input type="hidden" name="id" value={item.id} />
          <SubmitButton className={`${linkButtonClass} mr-2`} name="enter" value="true" title="Crea la transacción en la cuenta y pasa a la siguiente fecha">
            Registrar
          </SubmitButton>
          <SubmitButton className={`${linkButtonClass} mr-2`} name="enter" value="false" title="Pasa a la siguiente fecha sin crear la transacción">
            Saltar
          </SubmitButton>
        </form>
        <form action={deleteScheduledTransaction} className="inline">
          <input type="hidden" name="id" value={item.id} />
          <SubmitButton className={`${linkButtonClass} !text-red-700`}>Eliminar</SubmitButton>
        </form>
      </td>
    </tr>
  );
}
