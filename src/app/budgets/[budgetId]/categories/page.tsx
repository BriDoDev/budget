import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  createCategory,
  createCategoryGroup,
  moveSortable,
  updateCategory,
  updateCategoryGroup,
} from "@/app/actions/categories";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cardClass, inputClass, labelClass, linkButtonClass, mutedTextClass, pageClass, secondaryButtonClass } from "@/components/ui";
import { CREDIT_CARD_PAYMENTS_GROUP, describeGoal, groupLabel } from "@/lib/categories";
import { getBudget, listCategories, listCategoryGroups } from "@/lib/data/core";
import type { CategoryGroupRow, CategoryRow } from "@/lib/db/types";
import { milliunitsToInput, type CurrencySettings } from "@/lib/money";
import { GoalFields } from "./goal-fields";

type Props = PageProps<"/budgets/[budgetId]/categories">;

export default function CategoriesPage({ params }: Props) {
  return (
    <main className={pageClass}>
      <h1 className="font-display text-[28px] leading-tight font-semibold">Categorías y metas</h1>
      <Suspense fallback={<p className="text-muted">Cargando categorías…</p>}>
        <CategoryManager params={params} />
      </Suspense>
    </main>
  );
}

async function CategoryManager({ params }: Pick<Props, "params">) {
  const { budgetId } = await params;
  const budget = await getBudget(budgetId);
  if (!budget) {
    notFound();
  }
  const [groups, categories] = await Promise.all([listCategoryGroups(budgetId), listCategories(budgetId)]);
  const currency: CurrencySettings = { isoCode: budget.currency_iso_code, decimalDigits: budget.currency_decimal_digits };
  const editableGroups = groups.filter((group) => !group.is_internal);

  return (
    <>
      {editableGroups.length === 0 ? (
        <p className={mutedTextClass}>Crea tu primer grupo, por ejemplo “Gastos fijos”, y luego agrégale categorías.</p>
      ) : null}

      {editableGroups.map((group, index) => (
        <GroupCard
          key={group.id}
          group={group}
          categories={categories.filter((category) => category.group_id === group.id && category.kind !== "income" && category.kind !== "internal")}
          currency={currency}
          isFirst={index === 0}
          isLast={index === editableGroups.length - 1}
        />
      ))}

      <section className={cardClass}>
        <h2 className="mb-3 text-sm font-medium">Nuevo grupo</h2>
        <ActionForm action={createCategoryGroup} className="flex flex-col gap-2">
          <input type="hidden" name="budgetId" value={budgetId} />
          <div className="flex flex-wrap items-end gap-3">
            <label className={`${labelClass} min-w-48 flex-1`}>
              Nombre del grupo
              <input name="name" required className={inputClass} />
            </label>
            <SubmitButton pendingLabel="Creando…">Crear grupo</SubmitButton>
          </div>
        </ActionForm>
      </section>
    </>
  );
}

function GroupCard({
  group,
  categories,
  currency,
  isFirst,
  isLast,
}: {
  group: CategoryGroupRow;
  categories: CategoryRow[];
  currency: CurrencySettings;
  isFirst: boolean;
  isLast: boolean;
}) {
  const isCardGroup = group.name === CREDIT_CARD_PAYMENTS_GROUP;

  return (
    <section className={`${cardClass} flex flex-col gap-3`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">
          {groupLabel(group.name)}
          {group.hidden ? <span className="ml-2 text-xs font-normal text-muted">Oculto</span> : null}
        </h2>
        <MoveButtons kind="group" id={group.id} isFirst={isFirst} isLast={isLast} label={groupLabel(group.name)} />
      </header>

      {isCardGroup ? (
        <p className={mutedTextClass}>
          Cada tarjeta de crédito tiene aquí su categoría de pago. Se crean solas al agregar la tarjeta.
        </p>
      ) : (
        <details>
          <summary className={`${linkButtonClass} cursor-pointer`}>Renombrar u ocultar el grupo</summary>
          <ActionForm action={updateCategoryGroup} className="mt-2 flex flex-col gap-2">
            <input type="hidden" name="groupId" value={group.id} />
            <div className="flex flex-wrap items-end gap-3">
              <label className={`${labelClass} min-w-48 flex-1`}>
                Nombre
                <input name="name" defaultValue={group.name} required className={inputClass} />
              </label>
              <label className="flex items-center gap-2 pb-1.5 text-sm">
                <input type="checkbox" name="hidden" defaultChecked={group.hidden} />
                Ocultar del presupuesto
              </label>
              <SubmitButton className={secondaryButtonClass} pendingLabel="Guardando…">Guardar</SubmitButton>
            </div>
          </ActionForm>
        </details>
      )}

      <ul className="flex flex-col divide-y divide-line">
        {categories.map((category, index) => (
          <li key={category.id} className="py-2">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span>
                  {category.name}
                  {category.hidden ? <span className="ml-2 text-xs text-muted">Oculta</span> : null}
                  <span className="block text-xs text-muted">{describeGoal(category, currency) ?? "Sin meta"}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-muted underline underline-offset-4">Editar</span>
                  <MoveButtons kind="category" id={category.id} isFirst={index === 0} isLast={index === categories.length - 1} label={category.name} />
                </span>
              </summary>
              <ActionForm action={updateCategory} className="mt-3 flex flex-col gap-3">
                <input type="hidden" name="categoryId" value={category.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={labelClass}>
                    Nombre
                    <input name="name" defaultValue={category.name} required className={inputClass} />
                  </label>
                  <label className={labelClass}>
                    Nota
                    <input name="note" defaultValue={category.note ?? ""} className={inputClass} />
                  </label>
                </div>
                <GoalFields
                  goalType={category.goal_type}
                  goalTarget={category.goal_target ? milliunitsToInput(category.goal_target, currency.decimalDigits) : ""}
                  goalTargetMonth={category.goal_target_month?.slice(0, 7) ?? ""}
                  cadenceMonths={category.goal_cadence_months}
                  needsWholeAmount={category.goal_needs_whole_amount}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="hidden" defaultChecked={category.hidden} />
                    Ocultar del presupuesto
                  </label>
                  <SubmitButton pendingLabel="Guardando…">Guardar categoría</SubmitButton>
                </div>
              </ActionForm>
            </details>
          </li>
        ))}
      </ul>

      {isCardGroup ? null : (
        <ActionForm action={createCategory} className="flex flex-col gap-2">
          <input type="hidden" name="budgetId" value={group.budget_id} />
          <input type="hidden" name="groupId" value={group.id} />
          <div className="flex flex-wrap items-end gap-3">
            <label className={`${labelClass} min-w-48 flex-1`}>
              Nueva categoría en {groupLabel(group.name)}
              <input name="name" required className={inputClass} />
            </label>
            <SubmitButton className={secondaryButtonClass} pendingLabel="Agregando…">Agregar</SubmitButton>
          </div>
        </ActionForm>
      )}
    </section>
  );
}

function MoveButtons({
  kind,
  id,
  isFirst,
  isLast,
  label,
}: {
  kind: "group" | "category";
  id: string;
  isFirst: boolean;
  isLast: boolean;
  label: string;
}) {
  const buttonClass = "rounded px-1.5 py-0.5 text-sm hover:bg-subtle disabled:opacity-30";
  return (
    <form action={moveSortable} className="flex gap-1">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" name="direction" value="up" disabled={isFirst} aria-label={`Subir ${label}`} className={buttonClass}>
        ↑
      </button>
      <button type="submit" name="direction" value="down" disabled={isLast} aria-label={`Bajar ${label}`} className={buttonClass}>
        ↓
      </button>
    </form>
  );
}
