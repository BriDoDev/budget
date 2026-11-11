import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { moveMoney, setAssignment } from "@/app/actions/budget";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Money } from "@/components/money";
import { inputClass, labelClass, linkButtonClass, mutedTextClass, pageClass, tableHeaderClass } from "@/components/ui";
import type { BudgetMonthView, CategoryLine } from "@/lib/budget-view";
import { groupLabel } from "@/lib/categories";
import { getBudgetMonthView } from "@/lib/data/budgets";
import { milliunitsToInput } from "@/lib/money";
import { currentMonthKey, toMonthKey, type MonthKey } from "@/lib/month";
import { AssignInput } from "./assign-input";

const MONTH_PARAM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export default function BudgetPage({ params, searchParams }: PageProps<"/budgets/[budgetId]">) {
  return (
    <main className={pageClass}>
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
      <MoveMoney view={view} />
      <CategoryTable view={view} />
    </>
  );
}

function MonthHeader({ view }: { view: BudgetMonthView }) {
  const { summary, budget } = view;
  const isNegative = summary.readyToAssign < 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Presupuesto</h1>
        <nav className="flex items-center gap-2 text-sm" aria-label="Mes">
          <Link href={monthHref(budget.id, view.previousMonth)} aria-label="Mes anterior" className="rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            ←
          </Link>
          <span className="min-w-36 text-center font-medium">{formatMonthLabel(view.month)}</span>
          <Link href={monthHref(budget.id, view.nextMonth)} aria-label="Mes siguiente" className="rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            →
          </Link>
        </nav>
      </div>
      <div
        className={`flex flex-col gap-1 rounded-lg px-4 py-3 ${isNegative ? "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100" : "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"}`}
      >
        <span className="text-sm">{isNegative ? "Asignaste de más" : "Listo para asignar"}</span>
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
      {view.underfunded > 0 ? (
        <p className={mutedTextClass}>
          A tus metas les faltan <Money amount={view.underfunded} currency={budget.currency} className="font-medium" /> este mes.
        </p>
      ) : null}
    </section>
  );
}

function MoveMoney({ view }: { view: BudgetMonthView }) {
  const options = view.groups.map((group) => (
    <optgroup key={group.id} label={groupLabel(group.name)}>
      {group.categories.map((category) => (
        <option key={category.id} value={category.id}>{category.name}</option>
      ))}
    </optgroup>
  ));

  return (
    <details className="rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <summary className="cursor-pointer text-sm font-medium">Mover dinero entre categorías</summary>
      <ActionForm action={moveMoney} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="budgetId" value={view.budget.id} />
        <input type="hidden" name="month" value={view.month} />
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
          <label className={labelClass}>
            De
            <select name="from" defaultValue="" className={inputClass}>
              <option value="">Listo para asignar</option>
              {options}
            </select>
          </label>
          <label className={labelClass}>
            A
            <select name="to" defaultValue={view.groups[0]?.categories[0]?.id ?? ""} className={inputClass}>
              <option value="">Listo para asignar</option>
              {options}
            </select>
          </label>
          <label className={labelClass}>
            Monto
            <input name="amount" inputMode="decimal" required placeholder="0.00" className={inputClass} />
          </label>
          <SubmitButton pendingLabel="Moviendo…">Mover</SubmitButton>
        </div>
      </ActionForm>
    </details>
  );
}

function CategoryTable({ view }: { view: BudgetMonthView }) {
  const { currency } = view.budget;

  if (view.groups.length === 0) {
    return (
      <p className={mutedTextClass}>
        Este presupuesto aún no tiene categorías.{" "}
        <Link href={`/budgets/${view.budget.id}/categories`} className="underline underline-offset-4">Crea la primera</Link>.
      </p>
    );
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className={tableHeaderClass}>
          <th className="py-2 font-medium">Categoría</th>
          <th className="py-2 text-right font-medium">Asignado</th>
          <th className="py-2 text-right font-medium">Actividad</th>
          <th className="py-2 pr-2 text-right font-medium">Disponible</th>
        </tr>
      </thead>
      {view.groups.map((group) => (
        <tbody key={group.id}>
          <tr className="bg-neutral-50 font-medium dark:bg-neutral-900">
            <td className="px-2 py-2">{groupLabel(group.name)}</td>
            <td className="px-1.5 py-2 text-right"><Money amount={group.assigned} currency={currency} /></td>
            <td className="py-2 text-right"><Money amount={group.activity} currency={currency} /></td>
            <td className="px-2 py-2 text-right"><Money amount={group.available} currency={currency} /></td>
          </tr>
          {group.categories.map((category) => (
            <tr key={category.id} className="border-b border-neutral-100 align-top dark:border-neutral-900">
              <td className="px-2 py-2 pl-4">
                <span>{category.name}</span>
                <GoalNote view={view} category={category} />
              </td>
              <td className="py-1.5 text-right">
                <AssignInput
                  budgetId={view.budget.id}
                  categoryId={category.id}
                  categoryName={category.name}
                  month={view.month}
                  assigned={category.assigned}
                  decimalDigits={currency.decimalDigits}
                />
              </td>
              <td className="py-2 text-right"><Money amount={category.activity} currency={currency} /></td>
              <td className="px-2 py-2 text-right">
                <span className={`rounded-full px-2 py-0.5 ${availableTone(category)}`} title={availableTitle(category)}>
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

/** Goal progress under the category name, with a one-click way to assign what is missing. */
function GoalNote({ view, category }: { view: BudgetMonthView; category: CategoryLine }) {
  const { goal } = category;
  if (!goal) {
    return null;
  }
  const { currency } = view.budget;

  if (goal.underfunded <= 0) {
    return <span className="block text-xs text-neutral-500">Meta al {goal.percentageComplete}%</span>;
  }
  return (
    <ActionForm action={setAssignment} className="flex flex-wrap items-center gap-x-2 text-xs text-amber-700 dark:text-amber-400">
      <input type="hidden" name="budgetId" value={view.budget.id} />
      <input type="hidden" name="categoryId" value={category.id} />
      <input type="hidden" name="month" value={view.month} />
      <input type="hidden" name="amount" value={milliunitsToInput(category.assigned + goal.underfunded, 3)} />
      <span>
        Faltan <Money amount={goal.underfunded} currency={currency} /> para la meta
      </span>
      <SubmitButton className={`${linkButtonClass} !text-xs`} pendingLabel="Asignando…">Asignar</SubmitButton>
    </ActionForm>
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

function availableTitle(category: CategoryLine): string | undefined {
  if (category.cashOverspent < 0) {
    return "Gastaste de más en efectivo. Se descontará de lo listo para asignar el próximo mes.";
  }
  if (category.creditOverspent < 0) {
    return "Gastaste de más con tarjeta. Queda como deuda de la tarjeta.";
  }
  return undefined;
}

function monthHref(budgetId: string, month: MonthKey): string {
  return `/budgets/${budgetId}?month=${month.slice(0, 7)}`;
}

function formatMonthLabel(month: MonthKey): string {
  const label = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}T00:00:00Z`),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}
