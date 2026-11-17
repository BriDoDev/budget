import Link from "@/components/app-link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { fundGoals, setAssignment } from "@/app/actions/budget";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Icon } from "@/components/icons";
import { Money } from "@/components/money";
import { BudgetSkeleton } from "@/components/skeleton";
import {
  cardClass,
  detailBackdropClass,
  detailPanelClass,
  eyebrowClass,
  headingClass,
  linkButtonClass,
  mutedTextClass,
  pageClass,
  pillNeutralClass,
  pillPositiveClass,
  pillWarnClass,
  secondaryButtonClass,
  statValueClass,
  tableHeaderClass,
} from "@/components/ui";
import type { BudgetMonthView, CategoryLine } from "@/lib/budget-view";
import { describeGoal, groupLabel } from "@/lib/categories";
import { getBudgetMonthView, listAssignments, listCategoryMonthActivity, type CategoryActivityItem } from "@/lib/data/budgets";
import { listAccounts, listCategories } from "@/lib/data/core";
import { formatMonthEnd, formatMonthTitle, formatMonthWord, formatShortDate } from "@/lib/dates";
import { formatMilliunits, milliunitsToInput, type CurrencySettings } from "@/lib/money";
import { currentMonthKey, toMonthKey, type MonthKey } from "@/lib/month";
import { AssignInput } from "./assign-input";
import { AssignWheel } from "./assign-wheel";
import { CategoryDetailSlot, CategoryLink, CategorySelection, type CategoryPreview } from "./category-selection";
import { MoveMoneyForm } from "./move-money-form";

const MONTH_PARAM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_ATTENTION_ITEMS = 4;

type Props = PageProps<"/budgets/[budgetId]">;

interface CategoryStatus {
  /** Progress bar under the category name; null when there is nothing to show. */
  bar: { percent: number; isWarning: boolean; label: string } | null;
  caption: string;
  isWarning: boolean;
}

interface AttentionItem {
  categoryId: string;
  text: string;
}

export default function BudgetPage({ params, searchParams }: Props) {
  return (
    <main className={pageClass}>
      <Suspense fallback={<BudgetSkeleton />}>
        <BudgetMonth params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function BudgetMonth({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { budgetId } = await params;
  const query = await searchParams;
  // The default month comes from the clock, so wait for the request before reading it.
  await connection();
  const monthKey =
    typeof query.month === "string" && MONTH_PARAM_PATTERN.test(query.month) ? toMonthKey(query.month) : currentMonthKey();

  const view = await getBudgetMonthView(budgetId, monthKey);
  if (!view) {
    notFound();
  }
  const accounts = await listAccounts(budgetId);
  const cardBalances = new Map(accounts.map((account) => [account.id, account.balance]));
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));

  const statuses = new Map<string, CategoryStatus>();
  for (const category of view.groups.flatMap((group) => group.categories)) {
    statuses.set(category.id, describeStatus(category, view, cardBalances.get(category.linkedAccountId ?? "")));
  }

  const selectedId = typeof query.cat === "string" ? query.cat : "";
  const selectedGroup = view.groups.find((group) => group.categories.some((category) => category.id === selectedId));
  const selected = selectedGroup?.categories.find((category) => category.id === selectedId);

  const previews: Record<string, CategoryPreview> = {};
  for (const group of view.groups) {
    for (const category of group.categories) {
      const status = statuses.get(category.id);
      previews[category.id] = {
        name: category.name,
        groupName: groupLabel(group.name),
        caption: status?.caption ?? "",
        isWarning: status?.isWarning ?? false,
      };
    }
  }

  return (
    <CategorySelection selectedId={selected?.id ?? ""}>
      <MonthHeader view={view} />
      <Summary view={view} />
      <div className="flex flex-wrap items-start gap-5">
        <CategoryTable view={view} statuses={statuses} />
        <CategoryDetailSlot
          renderedId={selected?.id ?? ""}
          closeHref={budgetHref(view.budget.id, view.month)}
          previews={previews}
          placeholder={
            <aside className={`${cardClass} ${mutedTextClass} hidden flex-[1_1_300px] lg:block`}>
              Elige una categoría para ver su meta, de dónde viene su saldo y sus movimientos del mes.
            </aside>
          }
        >
          {selected && selectedGroup ? (
          <CategoryDetail
            view={view}
            category={selected}
            groupName={groupLabel(selectedGroup.name)}
            status={statuses.get(selected.id)}
            accountNames={accountNames}
          />
          ) : null}
        </CategoryDetailSlot>
      </div>
    </CategorySelection>
  );
}

function MonthHeader({ view }: { view: BudgetMonthView }) {
  const { budget } = view;
  return (
    <header className="relative flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-4 max-md:w-full">
        <h1 className={`${headingClass} max-md:sr-only`}>Presupuesto</h1>
        <nav aria-label="Mes" className="flex items-center gap-1 rounded-[10px] border border-line bg-surface px-1 max-md:w-full">
          <Link href={budgetHref(budget.id, view.previousMonth)} aria-label="Mes anterior" className="flex size-11 items-center justify-center rounded-lg text-ink-soft hover:bg-subtle">
            <Icon name="chevronLeft" />
          </Link>
          <span className="min-w-36 flex-1 text-center font-semibold">{formatMonthTitle(view.month)}</span>
          <Link href={budgetHref(budget.id, view.nextMonth)} aria-label="Mes siguiente" className="flex size-11 items-center justify-center rounded-lg text-ink-soft hover:bg-subtle">
            <Icon name="chevronRight" />
          </Link>
        </nav>
      </div>

      <div className="flex flex-wrap items-start gap-2.5">
        <details className="md:relative">
          <summary className={`${secondaryButtonClass} list-none`}>
            <Icon name="swap" />
            Mover dinero
          </summary>
          <div className="absolute right-0 z-10 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-[14px] border border-line bg-surface p-4 shadow-lg max-md:inset-x-0 max-md:w-auto">
            <MoveMoneyForm
              budgetId={budget.id}
              month={view.month}
              currency={budget.currency}
              readyToAssign={view.summary.readyToAssign}
              groups={view.groups.map((group) => ({
                name: groupLabel(group.name),
                categories: group.categories.map((category) => ({ id: category.id, name: category.name, available: category.available })),
              }))}
            />
          </div>
        </details>

        {view.underfunded > 0 ? (
          <ActionForm action={fundGoals} className="flex flex-col items-end gap-1">
            <input type="hidden" name="budgetId" value={budget.id} />
            <input type="hidden" name="month" value={view.month} />
            <SubmitButton pendingLabel="Asignando…">
              Cubrir metas · {formatMilliunits(view.underfunded, budget.currency)}
            </SubmitButton>
          </ActionForm>
        ) : null}
      </div>
    </header>
  );
}

function Summary({ view }: { view: BudgetMonthView }) {
  const { summary } = view;
  const { currency } = view.budget;
  const categories = view.groups.flatMap((group) => group.categories);
  const spending = categories.filter((category) => category.kind === "standard" && category.activity < 0);
  const spent = spending.reduce((sum, category) => sum - category.activity, 0);
  const attention = listAttention(categories, currency);
  const attentionCategories = new Set(attention.map((item) => item.categoryId)).size;
  const isOverAssigned = summary.readyToAssign < 0;
  const monthWord = formatMonthWord(view.month);

  return (
    <section aria-label="Resumen del mes" className="flex flex-wrap gap-4">
      <div className={`flex flex-[1.3_1_240px] flex-col gap-1 rounded-[14px] px-5 py-4 ${isOverAssigned ? "bg-warn text-white" : "bg-accent text-white"}`}>
        <span className="text-[13px] font-medium">{isOverAssigned ? "Asignaste de más" : "Listo para asignar"}</span>
        <Money amount={summary.readyToAssign} currency={currency} className="font-display text-4xl leading-tight font-semibold" />
        <span className="text-[13px]">
          Entraron <Money amount={summary.income} currency={currency} /> este mes
        </span>
      </div>

      <div className="hidden flex-[1_1_200px] flex-col gap-1 rounded-[14px] border border-line bg-surface px-5 py-4 sm:flex">
        <span className="text-[13px] font-medium text-muted">Asignado en {monthWord}</span>
        <Money amount={summary.assigned} currency={currency} className={statValueClass} />
        <span className="text-[13px] text-muted">
          {summary.fundedInFuture > 0 ? (
            <>
              y <Money amount={summary.fundedInFuture} currency={currency} /> ya en meses futuros
            </>
          ) : (
            "nada asignado a meses futuros"
          )}
        </span>
      </div>

      <div className="hidden flex-[1_1_200px] flex-col gap-1 rounded-[14px] border border-line bg-surface px-5 py-4 sm:flex">
        <span className="text-[13px] font-medium text-muted">Gastado en {monthWord}</span>
        <Money amount={spent} currency={currency} className={statValueClass} />
        <span className="text-[13px] text-muted">
          {spending.length === 1 ? "en 1 categoría" : `en ${spending.length} categorías`}
        </span>
      </div>

      {attention.length > 0 ? (
        <div className="flex flex-[1.3_1_240px] flex-col gap-1.5 rounded-[14px] border border-warn-line bg-warn-softer px-5 py-4 text-warn-deep">
          <span className="flex items-center gap-2 text-[13px] font-semibold">
            <Icon name="alert" />
            {attentionCategories === 1 ? "1 categoría necesita atención" : `${attentionCategories} categorías necesitan atención`}
          </span>
          {attention.slice(0, MAX_ATTENTION_ITEMS).map((item) => (
            <CategoryLink key={item.categoryId + item.text} categoryId={item.categoryId} href={`${budgetHref(view.budget.id, view.month, item.categoryId)}#detalle`} className="underline underline-offset-2 max-md:hidden">
              {item.text}
            </CategoryLink>
          ))}
          {attention.length > MAX_ATTENTION_ITEMS ? <span className="max-md:hidden">y {attention.length - MAX_ATTENTION_ITEMS} más</span> : null}
        </div>
      ) : (
        <div className="flex flex-[1.3_1_240px] flex-col justify-center gap-1 rounded-[14px] border border-line bg-surface px-5 py-4">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-accent-strong">
            <Icon name="check" />
            Todo en orden
          </span>
          <span className="text-[13px] text-muted">Ninguna categoría se pasó y las metas del mes están cubiertas.</span>
        </div>
      )}
    </section>
  );
}

function CategoryTable({
  view,
  statuses,
}: {
  view: BudgetMonthView;
  statuses: Map<string, CategoryStatus>;
}) {
  const { currency } = view.budget;

  if (view.groups.length === 0) {
    return (
      <p className={`${cardClass} ${mutedTextClass} flex-[999_1_560px]`}>
        Este presupuesto aún no tiene categorías.{" "}
        <Link href={`/budgets/${view.budget.id}/categories`} className="text-accent underline underline-offset-4">
          Crea la primera
        </Link>
        .
      </p>
    );
  }

  return (
    <section aria-label="Categorías" className="min-w-0 flex-[999_1_560px] rounded-[14px] border border-line bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className={tableHeaderClass}>
            <th className="px-4 py-3 font-semibold">Categoría</th>
            <th className="hidden px-2 py-3 text-right font-semibold sm:table-cell">Asignado</th>
            <th className="hidden px-2 py-3 text-right font-semibold sm:table-cell">Gastado</th>
            <th className="px-4 py-3 text-right font-semibold">Disponible</th>
          </tr>
        </thead>
        {view.groups.map((group) => (
          <tbody key={group.id}>
            <tr className={`border-t border-line bg-subtle ${eyebrowClass}`}>
              <th scope="rowgroup" className="px-4 py-2 text-left font-semibold">{groupLabel(group.name)}</th>
              <td className="hidden px-2 py-2 text-right sm:table-cell"><Money amount={group.assigned} currency={currency} /></td>
              <td className="hidden px-2 py-2 text-right sm:table-cell"><Money amount={group.activity} currency={currency} /></td>
              <td className="px-4 py-2 text-right"><Money amount={group.available} currency={currency} /></td>
            </tr>
            {group.categories.map((category) => {
              const status = statuses.get(category.id);
              const detailHref = `${budgetHref(view.budget.id, view.month, category.id)}#detalle`;
              return (
                <tr key={category.id} className="border-t border-hairline has-[a[aria-current]]:bg-accent-soft/60">
                  <td>
                    {/* The link covers the whole cell, so touching the bar or the caption opens the detail too. */}
                    <CategoryLink categoryId={category.id} href={detailHref} className="group block px-4 py-2.5">
                      <span className="font-medium group-hover:underline group-aria-[current=true]:font-semibold">{category.name}</span>
                      {status?.bar ? <ProgressBar bar={status.bar} /> : null}
                      {status?.caption ? (
                        <span className={`mt-1 block text-xs font-normal ${status.isWarning ? "text-warn-ink" : "text-muted"}`}>{status.caption}</span>
                      ) : null}
                    </CategoryLink>
                  </td>
                  <td className="hidden px-2 py-2 sm:table-cell">
                    <AssignInput
                      budgetId={view.budget.id}
                      categoryId={category.id}
                      categoryName={category.name}
                      month={view.month}
                      assigned={category.assigned}
                      decimalDigits={currency.decimalDigits}
                    />
                  </td>
                  <td className="hidden px-2 py-2.5 text-right sm:table-cell"><Money amount={category.activity} currency={currency} /></td>
                  <td>
                    <CategoryLink categoryId={category.id} href={detailHref} aria-label={`Disponible en ${category.name}`} className="flex justify-end px-4 py-2.5">
                      <AvailablePill category={category} currency={currency} />
                    </CategoryLink>
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </section>
  );
}

async function CategoryDetail({
  view,
  category,
  groupName,
  status,
  accountNames,
}: {
  view: BudgetMonthView;
  category: CategoryLine;
  groupName: string;
  status: CategoryStatus | undefined;
  accountNames: Map<string, string>;
}) {
  const { budget } = view;
  const { currency } = budget;
  const [activity, rows, assignments] = await Promise.all([
    listCategoryMonthActivity(budget.id, category.id, view.month, view.nextMonth),
    listCategories(budget.id),
    listAssignments(budget.id),
  ]);
  const closeHref = budgetHref(budget.id, view.month);
  const overspent = -(category.cashOverspent + category.creditOverspent);
  const lastMonthAssigned =
    assignments.find((entry) => entry.category_id === category.id && entry.month === view.previousMonth)?.amount ?? 0;
  const shortcuts = [
    overspent > 0 ? { label: "Cubrir lo que se pasó", amount: category.assigned + overspent, isWarning: true } : null,
    lastMonthAssigned > 0 && lastMonthAssigned !== category.assigned
      ? { label: `Igual que ${formatMonthWord(view.previousMonth)}`, amount: lastMonthAssigned, isWarning: false }
      : null,
  ].filter((shortcut) => shortcut !== null);
  const row = rows.find((candidate) => candidate.id === category.id);
  const goalText = row ? describeGoal(row, currency) : null;
  const missing = category.goal?.underfunded ?? 0;
  // A category can be given what it already has plus whatever is still unassigned.
  const assignCeiling = category.assigned + Math.max(0, view.summary.readyToAssign);

  return (
    <>
    {/* On phones the detail is a sheet over the list; touching outside it closes it. */}
    <CategoryLink categoryId="" href={closeHref} aria-label="Cerrar detalle" className={detailBackdropClass} />
    <aside
      id="detalle"
      aria-label={`Detalle de ${category.name}`}
      className={detailPanelClass}
    >
      <span aria-hidden="true" className="h-1 w-10 shrink-0 self-center rounded-full bg-line-strong md:hidden" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={eyebrowClass}>{groupName}</span>
          <h2 className="font-display text-[22px] font-semibold">{category.name}</h2>
          {status?.caption ? <span className={`text-sm ${status.isWarning ? "text-warn-ink" : "text-muted"}`}>{status.caption}</span> : null}
        </div>
        <CategoryLink
          categoryId=""
          href={closeHref}
          aria-label="Cerrar detalle"
          className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-subtle md:hidden"
        >
          <Icon name="close" size={20} />
        </CategoryLink>
      </div>

      {category.goal && goalText ? (
        <div className={`flex flex-col gap-2 rounded-[10px] p-3.5 ${missing > 0 ? "bg-warn-softer text-warn-deep" : "bg-accent-soft text-accent-strong"}`}>
          <span className="font-semibold">Meta: {goalText}</span>
          <ProgressBar
            bar={{ percent: category.goal.percentageComplete, isWarning: missing > 0, label: `Meta al ${category.goal.percentageComplete} por ciento` }}
            isWide
          />
          {missing > 0 ? (
            <ActionForm action={setAssignment} className="flex flex-col gap-2">
              <input type="hidden" name="budgetId" value={budget.id} />
              <input type="hidden" name="categoryId" value={category.id} />
              <input type="hidden" name="month" value={view.month} />
              <input type="hidden" name="amount" value={milliunitsToInput(category.assigned + missing, 3)} />
              <span className="text-[13px]">
                Faltan <Money amount={missing} currency={currency} /> este mes.
              </span>
              <SubmitButton pendingLabel="Asignando…">Asignar {formatMilliunits(missing, currency)}</SubmitButton>
            </ActionForm>
          ) : (
            <span className="text-[13px]">Cubierta este mes.</span>
          )}
        </div>
      ) : (
        <Link href={`/budgets/${budget.id}/categories`} className={linkButtonClass}>
          Ponerle una meta
        </Link>
      )}

      <dl className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2.5">
        <dt className="text-muted">Venía del mes pasado</dt>
        <dd className="text-right"><Money amount={category.carryover} currency={currency} /></dd>
        <dt className="text-muted">Asignado este mes</dt>
        <dd className="justify-self-end">
          <AssignInput
            budgetId={budget.id}
            categoryId={category.id}
            categoryName={`${category.name} (detalle)`}
            month={view.month}
            assigned={category.assigned}
            decimalDigits={currency.decimalDigits}
          />
        </dd>
        <dt className="text-muted">{category.kind === "credit_card_payment" ? "Movimiento del mes" : "Gastado"}</dt>
        <dd className="text-right"><Money amount={category.activity} currency={currency} /></dd>
        <dt className="border-t border-line pt-2.5 font-semibold">Disponible</dt>
        <dd className="border-t border-line pt-2.5 text-right font-semibold"><Money amount={category.available} currency={currency} /></dd>
      </dl>

      {assignCeiling > 0 ? (
        <AssignWheel
          // Start over from the stored amount after every change.
          key={`${category.id}:${category.assigned}`}
          budgetId={budget.id}
          categoryId={category.id}
          month={view.month}
          assigned={category.assigned}
          max={assignCeiling}
          currency={currency}
        />
      ) : null}

      {shortcuts.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className={eyebrowClass}>Atajos para asignar</span>
          <div className="grid grid-cols-2 gap-2">
            {shortcuts.map((shortcut) => (
              <ActionForm key={shortcut.label} action={setAssignment} className="flex flex-col">
                <input type="hidden" name="budgetId" value={budget.id} />
                <input type="hidden" name="categoryId" value={category.id} />
                <input type="hidden" name="month" value={view.month} />
                <input type="hidden" name="amount" value={milliunitsToInput(shortcut.amount, 3)} />
                <SubmitButton
                  className={`flex min-h-13 w-full cursor-pointer flex-col justify-center rounded-xl border px-3 py-1.5 text-left disabled:opacity-60 ${
                    shortcut.isWarning ? "border-warn-line bg-warn-softer text-warn-deep" : "border-line bg-surface text-ink hover:bg-subtle"
                  }`}
                >
                  <span className="text-xs">{shortcut.label}</span>
                  <span className="font-semibold tabular-nums">{formatMilliunits(shortcut.amount, currency)}</span>
                </SubmitButton>
              </ActionForm>
            ))}
          </div>
        </div>
      ) : null}

      {category.kind === "standard" ? (
        <div className="flex flex-col gap-2">
          <span className={eyebrowClass}>Movimientos del mes</span>
          {activity.length === 0 ? (
            <span className={mutedTextClass}>Sin movimientos directos este mes.</span>
          ) : (
            activity.map((item) => <ActivityLink key={item.id} item={item} budgetId={budget.id} accountNames={accountNames} currency={currency} />)
          )}
        </div>
      ) : null}

      {category.note ? (
        <div className="flex flex-col gap-1">
          <span className={eyebrowClass}>Nota</span>
          <p className="text-sm">{category.note}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-3">
        <Link href={`/budgets/${budget.id}/categories`} className={linkButtonClass}>Editar categoría</Link>
        <CategoryLink categoryId="" href={closeHref} className={linkButtonClass}>Cerrar detalle</CategoryLink>
      </div>
    </aside>
    </>
  );
}

function ActivityLink({
  item,
  budgetId,
  accountNames,
  currency,
}: {
  item: CategoryActivityItem;
  budgetId: string;
  accountNames: Map<string, string>;
  currency: CurrencySettings;
}) {
  return (
    <Link
      href={`/budgets/${budgetId}/accounts/${item.account_id}`}
      className="flex min-h-11 items-center justify-between gap-3 rounded-[10px] border border-line px-3 py-1.5 hover:bg-subtle"
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{item.payee?.name ?? "Sin beneficiario"}</span>
        <span className="text-xs text-muted">
          {formatShortDate(item.date)} · {accountNames.get(item.account_id) ?? "Cuenta"}
        </span>
      </span>
      <Money amount={item.amount} currency={currency} />
    </Link>
  );
}

function ProgressBar({ bar, isWide = false }: { bar: NonNullable<CategoryStatus["bar"]>; isWide?: boolean }) {
  return (
    <span role="img" aria-label={bar.label} className={`mt-1.5 block h-1.5 rounded-full bg-track ${isWide ? "" : "max-w-[260px]"}`}>
      <span
        className={`block h-full rounded-full ${bar.isWarning ? "bg-warn" : "bg-accent"}`}
        style={{ width: `${Math.min(100, Math.max(0, bar.percent))}%` }}
      />
    </span>
  );
}

/** Blue when there is money left, orange with an icon when overspent, gray at zero. */
function AvailablePill({ category, currency }: { category: CategoryLine; currency: CurrencySettings }) {
  if (category.cashOverspent < 0 || category.creditOverspent < 0) {
    return (
      <span className={pillWarnClass}>
        <Icon name="alert" size={14} strokeWidth={2} />
        <Money amount={category.available} currency={currency} />
      </span>
    );
  }
  return (
    <span className={category.available > 0 ? pillPositiveClass : pillNeutralClass}>
      <Money amount={category.available} currency={currency} />
    </span>
  );
}

/** Explains in a sentence where a category stands this month. */
function describeStatus(category: CategoryLine, view: BudgetMonthView, cardBalance: number | undefined): CategoryStatus {
  const money = (amount: number) => formatMilliunits(amount, view.budget.currency);

  if (category.kind === "credit_card_payment") {
    const debt = Math.max(0, -(cardBalance ?? 0));
    const missing = Math.max(0, debt - category.available);
    const caption =
      debt === 0
        ? "Sin deuda en la tarjeta"
        : missing > 0
          ? `Debes ${money(debt)} · faltan ${money(missing)} por apartar`
          : `Debes ${money(debt)} · ya está apartado`;
    return { bar: null, caption, isWarning: category.cashOverspent < 0 };
  }

  const funded = category.carryover + category.assigned;
  const spent = -category.activity;
  const spentOfFunded = `Gastaste ${money(spent)} de ${money(funded)}`;

  if (category.cashOverspent < 0) {
    return {
      bar: { percent: 100, isWarning: true, label: "Gastado más de lo disponible" },
      caption: `${spentOfFunded} · se descuenta en ${formatMonthWord(view.nextMonth)}`,
      isWarning: true,
    };
  }
  if (category.creditOverspent < 0) {
    return {
      bar: { percent: 100, isWarning: true, label: "Gastado más de lo disponible" },
      caption: `${spentOfFunded} · queda como deuda de la tarjeta`,
      isWarning: true,
    };
  }
  if (category.goal && category.goal.underfunded > 0) {
    return {
      bar: { percent: category.goal.percentageComplete, isWarning: true, label: `Meta al ${category.goal.percentageComplete} por ciento` },
      caption: `Faltan ${money(category.goal.underfunded)} para la meta${describeDue(category, view.month)}`,
      isWarning: true,
    };
  }
  if (funded > 0 && spent > 0) {
    const percent = Math.round((spent / funded) * 100);
    return { bar: { percent, isWarning: false, label: `Gastado ${percent} por ciento de lo disponible` }, caption: spentOfFunded, isWarning: false };
  }
  if (category.goal) {
    const percent = category.goal.percentageComplete;
    return { bar: { percent, isWarning: false, label: `Meta al ${percent} por ciento` }, caption: `Meta al ${percent}%${describeDue(category, view.month)}`, isWarning: false };
  }
  return { bar: null, caption: "", isWarning: false };
}

/** " - 30 nov": the day by which the goal has to be met; empty for goals without a deadline. */
function describeDue(category: CategoryLine, month: MonthKey): string {
  return category.goalDueMonth ? ` - ${formatMonthEnd(category.goalDueMonth, month)}` : "";
}

function listAttention(categories: CategoryLine[], currency: CurrencySettings): AttentionItem[] {
  const money = (amount: number) => formatMilliunits(amount, currency);
  const items: AttentionItem[] = [];
  for (const category of categories) {
    if (category.cashOverspent < 0) {
      items.push({ categoryId: category.id, text: `${category.name} gastó ${money(-category.cashOverspent)} de más` });
    } else if (category.creditOverspent < 0) {
      items.push({ categoryId: category.id, text: `${category.name} gastó ${money(-category.creditOverspent)} de más con tarjeta` });
    }
    if (category.goal && category.goal.underfunded > 0) {
      items.push({ categoryId: category.id, text: `A ${category.name} le faltan ${money(category.goal.underfunded)} para su meta` });
    }
  }
  return items;
}

function budgetHref(budgetId: string, month: MonthKey, categoryId?: string): string {
  const query = new URLSearchParams({ month: month.slice(0, 7) });
  if (categoryId) {
    query.set("cat", categoryId);
  }
  return `/budgets/${budgetId}?${query}`;
}
