import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Money } from "@/components/money";
import { cardClass, inputClass, labelClass, mutedTextClass, pageClass, secondaryButtonClass, tableHeaderClass } from "@/components/ui";
import { formatMonthName, groupLabel } from "@/lib/categories";
import { fetchAccountMonthTotals, fetchActivity, getBudget, listCategories, listCategoryGroups } from "@/lib/data/core";
import type { CurrencySettings } from "@/lib/money";
import { addMonths, currentMonthKey, monthRange, toMonthKey } from "@/lib/month";
import {
  incomeVsExpenses,
  netWorthByMonth,
  spendingByCategory,
  type CategorySpending,
  type ReportCategory,
} from "@/lib/reports";
import { CashflowBars, NetWorthLine, SpendingBars } from "./charts";

type Props = PageProps<"/budgets/[budgetId]/reports">;

const PERIODS = [3, 6, 12, 24];
const DEFAULT_PERIOD = 6;
const MAX_CATEGORY_BARS = 10;

export default function ReportsPage({ params, searchParams }: Props) {
  return (
    <main className={pageClass}>
      <h1 className="text-2xl font-semibold">Reportes</h1>
      <Suspense fallback={<p className="text-neutral-500">Calculando reportes…</p>}>
        <Reports params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Reports({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { budgetId } = await params;
  const requestedPeriod = Number((await searchParams).months);
  const period = PERIODS.includes(requestedPeriod) ? requestedPeriod : DEFAULT_PERIOD;

  const budget = await getBudget(budgetId);
  if (!budget) {
    notFound();
  }
  const [activity, totals, groups, categories] = await Promise.all([
    fetchActivity(budgetId),
    fetchAccountMonthTotals(budgetId),
    listCategoryGroups(budgetId),
    listCategories(budgetId),
  ]);

  const currency: CurrencySettings = { isoCode: budget.currency_iso_code, decimalDigits: budget.currency_decimal_digits };
  const lastMonth = currentMonthKey();
  const months = monthRange(addMonths(lastMonth, 1 - period), lastMonth);
  const groupNames = new Map(groups.map((group) => [group.id, groupLabel(group.name)]));
  const reportCategories: ReportCategory[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    groupName: groupNames.get(category.group_id) ?? "",
    kind: category.kind,
  }));
  const rows = activity
    .filter((row) => row.kind === "activity" && row.category_id)
    .map((row) => ({ categoryId: row.category_id!, month: toMonthKey(row.month), amount: row.amount }));

  const spending = spendingByCategory(rows, reportCategories, months);
  const cashflow = incomeVsExpenses(rows, reportCategories, months);
  const netWorth = netWorthByMonth(
    totals.map((total) => ({
      accountId: total.account_id,
      month: toMonthKey(total.month),
      amount: total.cleared_amount + total.uncleared_amount,
    })),
    months,
  );

  const totalIncome = cashflow.reduce((sum, month) => sum + month.income, 0);
  const totalExpenses = cashflow.reduce((sum, month) => sum + month.expenses, 0);
  const currentNetWorth = netWorth.at(-1)?.netWorth ?? 0;
  const spendingBars = foldSmallCategories(spending);

  return (
    <>
      <form method="get" className="flex items-end gap-3">
        <label className={labelClass}>
          Periodo
          <select name="months" defaultValue={period} className={inputClass}>
            {PERIODS.map((option) => (
              <option key={option} value={option}>Últimos {option} meses</option>
            ))}
          </select>
        </label>
        <button type="submit" className={secondaryButtonClass}>Aplicar</button>
      </form>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ingresos del periodo" amount={totalIncome} currency={currency} />
        <Stat label="Gastos del periodo" amount={totalExpenses} currency={currency} />
        <Stat label="Diferencia" amount={totalIncome - totalExpenses} currency={currency} />
        <Stat label="Patrimonio hoy" amount={currentNetWorth} currency={currency} />
      </dl>

      <section className={`${cardClass} flex flex-col gap-4`}>
        <h2 className="font-medium">Gasto por categoría</h2>
        {spendingBars.length === 0 ? (
          <p className={mutedTextClass}>No hay gastos categorizados en este periodo.</p>
        ) : (
          <SpendingBars items={spendingBars} currency={currency} />
        )}
        {spending.length > spendingBars.length ? (
          <details>
            <summary className="cursor-pointer text-sm text-neutral-600 dark:text-neutral-400">Ver las {spending.length} categorías</summary>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className={tableHeaderClass}>
                  <th className="py-2 font-medium">Categoría</th>
                  <th className="py-2 font-medium">Grupo</th>
                  <th className="py-2 text-right font-medium">Gasto</th>
                </tr>
              </thead>
              <tbody>
                {spending.map((entry) => (
                  <tr key={entry.categoryId} className="border-b border-neutral-100 dark:border-neutral-900">
                    <td className="py-1.5">{entry.name}</td>
                    <td className="py-1.5 text-neutral-500">{entry.groupName}</td>
                    <td className="py-1.5 text-right"><Money amount={entry.total} currency={currency} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ) : null}
      </section>

      <section className={`${cardClass} flex flex-col gap-4`}>
        <h2 className="font-medium">Ingresos contra gastos</h2>
        <CashflowBars months={cashflow} currency={currency} />
        <details>
          <summary className="cursor-pointer text-sm text-neutral-600 dark:text-neutral-400">Ver como tabla</summary>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className={tableHeaderClass}>
                <th className="py-2 font-medium">Mes</th>
                <th className="py-2 text-right font-medium">Ingresos</th>
                <th className="py-2 text-right font-medium">Gastos</th>
                <th className="py-2 text-right font-medium">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {cashflow.map((month) => (
                <tr key={month.month} className="border-b border-neutral-100 dark:border-neutral-900">
                  <td className="py-1.5 capitalize">{formatMonthName(month.month)}</td>
                  <td className="py-1.5 text-right"><Money amount={month.income} currency={currency} /></td>
                  <td className="py-1.5 text-right"><Money amount={month.expenses} currency={currency} /></td>
                  <td className="py-1.5 text-right"><Money amount={month.net} currency={currency} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <section className={`${cardClass} flex flex-col gap-4`}>
        <h2 className="font-medium">Patrimonio</h2>
        <p className={mutedTextClass}>Lo que tienes menos lo que debes, al cierre de cada mes. Incluye las cuentas de seguimiento.</p>
        <NetWorthLine months={netWorth} currency={currency} />
        <details>
          <summary className="cursor-pointer text-sm text-neutral-600 dark:text-neutral-400">Ver como tabla</summary>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className={tableHeaderClass}>
                <th className="py-2 font-medium">Mes</th>
                <th className="py-2 text-right font-medium">Lo que tienes</th>
                <th className="py-2 text-right font-medium">Lo que debes</th>
                <th className="py-2 text-right font-medium">Patrimonio</th>
              </tr>
            </thead>
            <tbody>
              {netWorth.map((month) => (
                <tr key={month.month} className="border-b border-neutral-100 dark:border-neutral-900">
                  <td className="py-1.5 capitalize">{formatMonthName(month.month)}</td>
                  <td className="py-1.5 text-right"><Money amount={month.assets} currency={currency} /></td>
                  <td className="py-1.5 text-right"><Money amount={month.debts} currency={currency} /></td>
                  <td className="py-1.5 text-right"><Money amount={month.netWorth} currency={currency} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>
    </>
  );
}

function Stat({ label, amount, currency }: { label: string; amount: number; currency: CurrencySettings }) {
  return (
    <div className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="text-lg font-semibold">
        <Money amount={amount} currency={currency} />
      </dd>
    </div>
  );
}

/** Keeps the largest categories as bars and folds the rest into a single "Otras" bar. */
function foldSmallCategories(spending: CategorySpending[]): CategorySpending[] {
  if (spending.length <= MAX_CATEGORY_BARS) {
    return spending;
  }
  const top = spending.slice(0, MAX_CATEGORY_BARS - 1);
  const rest = spending.slice(MAX_CATEGORY_BARS - 1);
  return [
    ...top,
    {
      categoryId: "other",
      name: `Otras (${rest.length})`,
      groupName: "",
      total: rest.reduce((sum, entry) => sum + entry.total, 0),
    },
  ];
}
