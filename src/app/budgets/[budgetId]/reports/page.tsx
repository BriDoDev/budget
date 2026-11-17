import Link from "@/components/app-link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Money } from "@/components/money";
import { ReportsSkeleton } from "@/components/skeleton";
import { cardClass, headingClass, mutedTextClass, pageClass, sectionTitleClass, statValueClass, tableHeaderClass } from "@/components/ui";
import { formatMonthName, groupLabel } from "@/lib/categories";
import { fetchAccountMonthTotals, fetchActivity, getBudget, listCategories, listCategoryGroups } from "@/lib/data/core";
import { formatMonthWord } from "@/lib/dates";
import { formatMilliunits, type CurrencySettings } from "@/lib/money";
import { addMonths, currentMonthKey, monthRange, toMonthKey } from "@/lib/month";
import {
  incomeVsExpenses,
  netWorthByMonth,
  spendingByCategory,
  type CategorySpending,
  type MonthCashflow,
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
      <Suspense fallback={<ReportsSkeleton />}>
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
  const latest = netWorth.at(-1);
  const previous = netWorth.at(-2);
  const spendingBars = foldSmallCategories(spending);
  const rangeLabel = `de ${formatMonthWord(months[0])} a ${formatMonthWord(lastMonth)}`;

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className={headingClass}>Reportes</h1>
        <nav aria-label="Periodo" className="flex gap-0.5 rounded-[10px] border border-line-strong bg-surface p-[3px]">
          {PERIODS.map((option) => (
            <Link
              key={option}
              href={`/budgets/${budgetId}/reports?months=${option}`}
              aria-current={option === period ? "true" : undefined}
              className={`flex min-h-10 items-center rounded-lg px-3 text-sm whitespace-nowrap sm:px-4 ${
                option === period ? "bg-accent font-semibold text-white" : "font-medium text-ink-soft hover:bg-subtle"
              }`}
            >
              {option} meses
            </Link>
          ))}
        </nav>
      </header>

      <dl className="flex flex-wrap gap-4">
        <Stat label="Entró" amount={totalIncome} currency={currency} />
        <Stat label="Se gastó" amount={totalExpenses} currency={currency} />
        <Stat label="Quedó" amount={totalIncome - totalExpenses} currency={currency} isHighlighted />
        <Stat label="Patrimonio hoy" amount={latest?.netWorth ?? 0} currency={currency} />
      </dl>

      <div className="flex flex-wrap gap-5">
        <section className={`${cardClass} flex min-w-0 flex-[1_1_420px] flex-col gap-4`}>
          <div className="flex flex-col gap-0.5">
            <h2 className={sectionTitleClass}>En qué se fue el dinero</h2>
            <span className="text-[13px] text-muted">Gasto por categoría, {rangeLabel}</span>
          </div>
          {spendingBars.length === 0 ? (
            <p className={mutedTextClass}>No hay gastos categorizados en este periodo.</p>
          ) : (
            <SpendingBars items={spendingBars} currency={currency} />
          )}
          {spending.length > spendingBars.length ? (
            <details>
              <summary className="cursor-pointer text-sm text-muted">Ver las {spending.length} categorías</summary>
              <table className="mt-2 w-full border-collapse text-sm">
                <thead>
                  <tr className={tableHeaderClass}>
                    <th className="py-2 font-semibold">Categoría</th>
                    <th className="py-2 font-semibold">Grupo</th>
                    <th className="py-2 text-right font-semibold">Gasto</th>
                  </tr>
                </thead>
                <tbody>
                  {spending.map((entry) => (
                    <tr key={entry.categoryId} className="border-b border-hairline">
                      <td className="py-1.5">{entry.name}</td>
                      <td className="py-1.5 text-muted">{entry.groupName}</td>
                      <td className="py-1.5 text-right"><Money amount={entry.total} currency={currency} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ) : null}
        </section>

        <section className={`${cardClass} flex min-w-0 flex-[1_1_420px] flex-col gap-4`}>
          <div className="flex flex-col gap-0.5">
            <h2 className={sectionTitleClass}>Lo que entró y lo que salió</h2>
            <span className="text-[13px] text-muted">{compareLastMonths(cashflow, currency)}</span>
          </div>
          <CashflowBars months={cashflow} currency={currency} />
          <details>
            <summary className="cursor-pointer text-sm text-muted">Ver como tabla</summary>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className={tableHeaderClass}>
                  <th className="py-2 font-semibold">Mes</th>
                  <th className="py-2 text-right font-semibold">Ingresos</th>
                  <th className="py-2 text-right font-semibold">Gastos</th>
                  <th className="py-2 text-right font-semibold">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {cashflow.map((month) => (
                  <tr key={month.month} className="border-b border-hairline">
                    <td className="py-1.5 first-letter:uppercase">{formatMonthName(month.month)}</td>
                    <td className="py-1.5 text-right"><Money amount={month.income} currency={currency} /></td>
                    <td className="py-1.5 text-right"><Money amount={month.expenses} currency={currency} /></td>
                    <td className="py-1.5 text-right"><Money amount={month.net} currency={currency} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      </div>

      <section className={`${cardClass} flex flex-wrap gap-6`}>
        <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 className={sectionTitleClass}>Patrimonio</h2>
            <span className="text-[13px] text-muted">
              Lo que tienes menos lo que debes, al cierre de cada mes. Incluye las cuentas de seguimiento.
            </span>
          </div>
          <NetWorthLine months={netWorth} currency={currency} />
          <details>
            <summary className="cursor-pointer text-sm text-muted">Ver como tabla</summary>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className={tableHeaderClass}>
                  <th className="py-2 font-semibold">Mes</th>
                  <th className="py-2 text-right font-semibold">Lo que tienes</th>
                  <th className="py-2 text-right font-semibold">Lo que debes</th>
                  <th className="py-2 text-right font-semibold">Patrimonio</th>
                </tr>
              </thead>
              <tbody>
                {netWorth.map((month) => (
                  <tr key={month.month} className="border-b border-hairline">
                    <td className="py-1.5 first-letter:uppercase">{formatMonthName(month.month)}</td>
                    <td className="py-1.5 text-right"><Money amount={month.assets} currency={currency} /></td>
                    <td className="py-1.5 text-right"><Money amount={month.debts} currency={currency} /></td>
                    <td className="py-1.5 text-right"><Money amount={month.netWorth} currency={currency} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>

        <dl className="grid flex-[1_1_240px] grid-cols-[1fr_auto] content-center gap-x-4 gap-y-3">
          <dt className="text-muted">Lo que tienes</dt>
          <dd className="text-right"><Money amount={latest?.assets ?? 0} currency={currency} /></dd>
          <dt className="text-muted">Lo que debes</dt>
          <dd className="text-right text-warn-ink"><Money amount={-(latest?.debts ?? 0)} currency={currency} /></dd>
          <dt className="border-t border-line pt-3 font-semibold">Patrimonio</dt>
          <dd className="border-t border-line pt-3 text-right font-semibold"><Money amount={latest?.netWorth ?? 0} currency={currency} /></dd>
          {latest && previous ? (
            <>
              <dt className="text-muted">Cambio desde {formatMonthWord(previous.month)}</dt>
              <dd className={`text-right font-semibold ${latest.netWorth - previous.netWorth < 0 ? "text-warn-ink" : "text-accent-strong"}`}>
                {latest.netWorth - previous.netWorth > 0 ? "+" : ""}
                <Money amount={latest.netWorth - previous.netWorth} currency={currency} />
              </dd>
            </>
          ) : null}
        </dl>
      </section>
    </>
  );
}

function Stat({
  label,
  amount,
  currency,
  isHighlighted = false,
}: {
  label: string;
  amount: number;
  currency: CurrencySettings;
  isHighlighted?: boolean;
}) {
  const tone = !isHighlighted ? "" : amount < 0 ? "text-warn-ink" : "text-accent";
  return (
    <div className="min-w-0 flex-[1_1_140px] rounded-[14px] border border-line bg-surface px-4 py-3.5 sm:flex-[1_1_200px] sm:px-5 sm:py-4">
      <dt className="text-[13px] font-medium text-muted">{label}</dt>
      <dd className={`mt-0.5 ${statValueClass} max-sm:text-lg ${tone}`}>
        <Money amount={amount} currency={currency} />
      </dd>
    </div>
  );
}

/** One sentence comparing spending of the last two months of the range. */
function compareLastMonths(cashflow: MonthCashflow[], currency: CurrencySettings): string {
  const latest = cashflow.at(-1);
  const previous = cashflow.at(-2);
  if (!latest || !previous) {
    return "Ingresos y gastos por mes";
  }
  const difference = latest.expenses - previous.expenses;
  const months = `En ${formatMonthWord(latest.month)} gastaste`;
  if (difference === 0) {
    return `${months} lo mismo que en ${formatMonthWord(previous.month)}`;
  }
  return `${months} ${formatMilliunits(Math.abs(difference), currency)} ${difference > 0 ? "más" : "menos"} que en ${formatMonthWord(previous.month)}`;
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
