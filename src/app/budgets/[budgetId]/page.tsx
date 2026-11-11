import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Money } from "@/components/money";
import type { BudgetMonthView, CategoryLine } from "@/lib/budget-view";
import { getBudgetMonthView } from "@/lib/data/budgets";
import { currentMonthKey, toMonthKey, type MonthKey } from "@/lib/month";

const MONTH_PARAM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export default function BudgetPage({ params, searchParams }: PageProps<"/budgets/[budgetId]">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <Link href="/" className="text-sm text-neutral-600 underline-offset-4 hover:underline dark:text-neutral-400">
        ← Presupuestos
      </Link>
      <Suspense fallback={<p className="text-neutral-500">Calculando el mes…</p>}>
        <BudgetMonth params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function BudgetMonth({
  params,
  searchParams,
}: Pick<PageProps<"/budgets/[budgetId]">, "params" | "searchParams">) {
  const { budgetId } = await params;
  const { month } = await searchParams;
  const monthKey = typeof month === "string" && MONTH_PARAM_PATTERN.test(month) ? toMonthKey(month) : currentMonthKey();

  const view = await getBudgetMonthView(budgetId, monthKey);
  if (!view) {
    notFound();
  }

  return (
    <>
      <MonthHeader view={view} />
      <CategoryTable view={view} />
    </>
  );
}

function MonthHeader({ view }: { view: BudgetMonthView }) {
  const { summary, budget } = view;
  const isNegative = summary.readyToAssign < 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{budget.name}</h1>
        <nav className="flex items-center gap-3 text-sm">
          <Link href={monthHref(budget.id, view.previousMonth)} aria-label="Mes anterior" className="rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            ←
          </Link>
          <span className="min-w-36 text-center font-medium capitalize">{formatMonthLabel(view.month)}</span>
          <Link href={monthHref(budget.id, view.nextMonth)} aria-label="Mes siguiente" className="rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            →
          </Link>
        </nav>
      </div>
      <div
        className={`flex flex-col gap-1 rounded-lg px-4 py-3 ${isNegative ? "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100" : "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"}`}
      >
        <span className="text-sm">Listo para asignar</span>
        <Money amount={summary.readyToAssign} currency={budget.currency} className="text-3xl font-semibold" />
        <span className="text-xs opacity-80">
          Ingresos del mes <Money amount={summary.income} currency={budget.currency} /> · Asignado{" "}
          <Money amount={summary.assigned} currency={budget.currency} />
          {summary.fundedInFuture > 0 ? (
            <>
              {" "}· Asignado a meses futuros <Money amount={summary.fundedInFuture} currency={budget.currency} />
            </>
          ) : null}
        </span>
      </div>
    </section>
  );
}

function CategoryTable({ view }: { view: BudgetMonthView }) {
  const { currency } = view.budget;

  if (view.groups.length === 0) {
    return <p className="text-neutral-600 dark:text-neutral-400">Este presupuesto aún no tiene categorías.</p>;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
          <th className="py-2 font-medium">Categoría</th>
          <th className="py-2 text-right font-medium">Asignado</th>
          <th className="py-2 text-right font-medium">Actividad</th>
          <th className="py-2 text-right font-medium">Disponible</th>
        </tr>
      </thead>
      {view.groups.map((group) => (
        <tbody key={group.id}>
          <tr className="bg-neutral-50 font-medium dark:bg-neutral-900">
            <td className="px-2 py-2">{group.name}</td>
            <td className="py-2 text-right"><Money amount={group.assigned} currency={currency} /></td>
            <td className="py-2 text-right"><Money amount={group.activity} currency={currency} /></td>
            <td className="px-2 py-2 text-right"><Money amount={group.available} currency={currency} /></td>
          </tr>
          {group.categories.map((category) => (
            <tr key={category.id} className="border-b border-neutral-100 dark:border-neutral-900">
              <td className="px-2 py-2 pl-6">{category.name}</td>
              <td className="py-2 text-right"><Money amount={category.assigned} currency={currency} /></td>
              <td className="py-2 text-right"><Money amount={category.activity} currency={currency} /></td>
              <td className="px-2 py-2 text-right">
                <span className={`rounded-full px-2 py-0.5 ${availableTone(category)}`}>
                  <Money amount={category.available} currency={currency} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

/** Red for cash overspending, amber for credit overspending, green when funded. */
function availableTone(category: CategoryLine): string {
  if (category.cashOverspent < 0) {
    return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
  }
  if (category.creditOverspent < 0) {
    return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
  }
  if (category.available > 0) {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }
  return "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300";
}

function monthHref(budgetId: string, month: MonthKey): string {
  return `/budgets/${budgetId}?month=${month.slice(0, 7)}`;
}

function formatMonthLabel(month: MonthKey): string {
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}T00:00:00Z`),
  );
}
