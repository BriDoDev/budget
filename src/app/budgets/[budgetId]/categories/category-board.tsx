"use client";

import { useActionState, useOptimistic, useState, useTransition, type KeyboardEvent, type PointerEvent } from "react";
import {
  createCategory,
  createCategoryGroup,
  moveSortable,
  placeCategory,
  updateCategory,
  updateCategoryGroup,
} from "@/app/actions/categories";
import { ActionForm, PendingLabel, SubmitButton } from "@/components/action-form";
import { Icon } from "@/components/icons";
import {
  cardClass,
  eyebrowClass,
  inputClass,
  labelClass,
  linkButtonClass,
  mutedTextClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";
import { IDLE_STATE, type ActionState } from "@/lib/actions/form";
import type { GoalType } from "@/lib/budget-engine";
import type { CurrencySettings } from "@/lib/money";
import { GoalFields } from "./goal-fields";

export interface BoardCategory {
  id: string;
  name: string;
  note: string | null;
  hidden: boolean;
  /** Card payment categories cannot leave their group. */
  isCardPayment: boolean;
  goalType: GoalType | null;
  /** Goal amount formatted for an input, or empty. */
  goalTarget: string;
  /** "YYYY-MM" or empty. */
  goalTargetMonth: string;
  cadenceMonths: number;
  needsWholeAmount: boolean;
  dueDay: number | null;
  /** The goal in one sentence, or null without a goal. */
  goalText: string | null;
  /** Available this month, in milliunits. */
  available: number;
}

export interface BoardGroup {
  id: string;
  /** Name as stored, for the rename field. */
  name: string;
  /** Name as shown. */
  label: string;
  hidden: boolean;
  /** The built-in group that holds one payment category per credit card. */
  isCardGroup: boolean;
  categories: BoardCategory[];
}

interface CategoryBoardProps {
  budgetId: string;
  groups: BoardGroup[];
  currency: CurrencySettings;
  /** "YYYY-MM" of the current month. */
  currentMonth: string;
  /** Category whose editor opens with the page. */
  initialEditId: string;
}

interface Drop {
  groupId: string;
  /** Category the dragged one lands before; null for the end of the group. */
  beforeId: string | null;
}

interface Drag extends Drop {
  categoryId: string;
  /** Where the category was when the drag began, to tell a real move from a plain tap. */
  origin: Drop;
}

/** Scrolls the page while a drag is held near the top or bottom edge. */
const EDGE_SCROLL_ZONE = 90;
const EDGE_SCROLL_STEP = 14;

function moveCategory(groups: BoardGroup[], categoryId: string, drop: Drop): BoardGroup[] {
  const moved = groups.flatMap((group) => group.categories).find((category) => category.id === categoryId);
  if (!moved) {
    return groups;
  }
  return groups.map((group) => {
    const rest = group.categories.filter((category) => category.id !== categoryId);
    if (group.id !== drop.groupId) {
      return { ...group, categories: rest };
    }
    const position = drop.beforeId ? rest.findIndex((category) => category.id === drop.beforeId) : -1;
    const index = position < 0 ? rest.length : position;
    return { ...group, categories: [...rest.slice(0, index), moved, ...rest.slice(index)] };
  });
}

/** Where a category dragged to height `y` would land, read from the rows on screen. */
function findDrop(y: number, categoryId: string): Drop | null {
  const lists = [...document.querySelectorAll<HTMLElement>("[data-group-list]")];
  const list =
    lists.find((element) => {
      const rect = element.getBoundingClientRect();
      return y >= rect.top && y <= rect.bottom;
    }) ?? null;
  if (!list?.dataset.groupList) {
    return null;
  }
  const rows = [...list.querySelectorAll<HTMLElement>("[data-category-row]")].filter((row) => row.dataset.categoryRow !== categoryId);
  const next = rows.find((row) => {
    const rect = row.getBoundingClientRect();
    return y < rect.top + rect.height / 2;
  });
  return { groupId: list.dataset.groupList, beforeId: next?.dataset.categoryRow ?? null };
}

/**
 * Groups and categories of a budget: tap a category to edit it in a sheet,
 * drag its handle to reorder it or move it to another group.
 */
export function CategoryBoard({ budgetId, groups, currency, currentMonth, initialEditId }: CategoryBoardProps) {
  const [board, setBoard] = useOptimistic(groups);
  const [, startTransition] = useTransition();
  const [editingId, setEditingId] = useState(initialEditId);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [drag, setDrag] = useState<Drag | null>(null);

  const allCategories = board.flatMap((group) => group.categories.map((category) => ({ category, group })));
  const editing = allCategories.find((entry) => entry.category.id === editingId);
  const hiddenCategories = allCategories.filter((entry) => entry.category.hidden);
  const movableGroups = board.filter((group) => !group.isCardGroup);

  const toggleGroup = (groupId: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(groupId)) {
        next.add(groupId);
      }
      return next;
    });

  const place = (categoryId: string, drop: Drop) => {
    startTransition(async () => {
      setBoard((current) => moveCategory(current, categoryId, drop));
      await placeCategory(categoryId, drop.groupId, drop.beforeId);
    });
  };

  const canDropIn = (categoryId: string, groupId: string) => {
    const source = allCategories.find((entry) => entry.category.id === categoryId);
    const target = board.find((group) => group.id === groupId);
    // Card payments stay in the card group, and nothing else goes into it.
    return Boolean(source && target && (source.group.id === groupId || (!source.category.isCardPayment && !target.isCardGroup)));
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>, categoryId: string, groupId: string) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const visible = board.find((group) => group.id === groupId)?.categories.filter((category) => !category.hidden) ?? [];
    const origin: Drop = { groupId, beforeId: visible[visible.findIndex((category) => category.id === categoryId) + 1]?.id ?? null };
    setDrag({ categoryId, origin, ...origin });
  };
  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag) {
      return;
    }
    if (event.clientY < EDGE_SCROLL_ZONE) {
      window.scrollBy(0, -EDGE_SCROLL_STEP);
    } else if (event.clientY > window.innerHeight - EDGE_SCROLL_ZONE) {
      window.scrollBy(0, EDGE_SCROLL_STEP);
    }
    const drop = findDrop(event.clientY, drag.categoryId);
    if (drop && canDropIn(drag.categoryId, drop.groupId) && (drop.groupId !== drag.groupId || drop.beforeId !== drag.beforeId)) {
      setDrag({ ...drag, ...drop });
    }
  };
  const handlePointerUp = () => {
    if (drag && (drag.groupId !== drag.origin.groupId || drag.beforeId !== drag.origin.beforeId)) {
      place(drag.categoryId, { groupId: drag.groupId, beforeId: drag.beforeId });
    }
    setDrag(null);
  };
  /** Keyboard version of the drag: the arrows move the category one place within its group. */
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, categoryId: string, group: BoardGroup) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }
    event.preventDefault();
    const visible = group.categories.filter((category) => !category.hidden);
    const index = visible.findIndex((category) => category.id === categoryId);
    const target = event.key === "ArrowUp" ? index - 1 : index + 2;
    if (index < 0 || target < 0 || target > visible.length) {
      return;
    }
    place(categoryId, { groupId: group.id, beforeId: visible[target]?.id ?? null });
  };

  const dropLine = <li aria-hidden="true" className="h-0.5 rounded-full bg-accent" />;

  return (
    <>
      {board.length === 0 ? (
        <p className={mutedTextClass}>Crea tu primer grupo, por ejemplo “Gastos fijos”, y luego agrégale categorías.</p>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className={mutedTextClass}>Toca una categoría para editarla. Arrastra el asa para cambiarla de lugar o de grupo.</p>
          <button
            type="button"
            className={`${linkButtonClass} shrink-0`}
            onClick={() => setCollapsed(collapsed.size === board.length ? new Set() : new Set(board.map((group) => group.id)))}
          >
            {collapsed.size === board.length ? "Desplegar todo" : "Plegar todo"}
          </button>
        </div>
      )}

      {board.map((group, groupIndex) => {
        const visible = group.categories.filter((category) => !category.hidden);
        const isCollapsed = collapsed.has(group.id);
        const isDropTarget = drag?.groupId === group.id;
        return (
          <section
            key={group.id}
            data-group-list={group.id}
            className={`${cardClass} flex flex-col gap-3 ${isDropTarget && isCollapsed ? "border-accent" : ""}`}
          >
            <header className="flex items-center justify-between gap-2">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={() => toggleGroup(group.id)}
                className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
              >
                <Icon name={isCollapsed ? "chevronRight" : "chevronDown"} className="text-muted" />
                <span className="min-w-0 truncate font-display text-base font-semibold">{group.label}</span>
                <span className="shrink-0 text-xs text-muted">
                  {visible.length === 1 ? "1 categoría" : `${visible.length} categorías`}
                  {group.hidden ? " · oculto" : ""}
                </span>
              </button>
              <MoveGroupButtons id={group.id} isFirst={groupIndex === 0} isLast={groupIndex === board.length - 1} label={group.label} />
            </header>

            {isCollapsed ? null : (
              <>
                <ul className="flex flex-col">
                  {visible.map((category) => (
                    <CategoryRowItem
                      key={category.id}
                      category={category}
                      isDragged={drag?.categoryId === category.id}
                      lineBefore={isDropTarget && drag?.beforeId === category.id ? dropLine : null}
                      onEdit={() => setEditingId(category.id)}
                      onPointerDown={(event) => handlePointerDown(event, category.id, group.id)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onKeyDown={(event) => handleKeyDown(event, category.id, group)}
                    />
                  ))}
                  {isDropTarget && drag?.beforeId === null ? dropLine : null}
                  {visible.length === 0 && !isDropTarget ? <li className={`${mutedTextClass} py-2`}>Sin categorías.</li> : null}
                </ul>

                {group.isCardGroup ? (
                  <p className={mutedTextClass}>Cada tarjeta de crédito tiene aquí su categoría de pago. Se crean solas al agregar la tarjeta.</p>
                ) : (
                  <>
                    <ActionForm action={createCategory} className="flex flex-col gap-2">
                      <input type="hidden" name="budgetId" value={budgetId} />
                      <input type="hidden" name="groupId" value={group.id} />
                      <div className="flex items-end gap-2">
                        <label className={`${labelClass} min-w-0 flex-1`}>
                          Nueva categoría en {group.label}
                          <input name="name" required className={inputClass} />
                        </label>
                        <SubmitButton className={secondaryButtonClass} pendingLabel="Agregando…">Agregar</SubmitButton>
                      </div>
                    </ActionForm>
                    <details>
                      <summary className={`${linkButtonClass} cursor-pointer`}>Renombrar u ocultar el grupo</summary>
                      <ActionForm action={updateCategoryGroup} className="mt-2 flex flex-col gap-2">
                        <input type="hidden" name="groupId" value={group.id} />
                        <div className="flex flex-wrap items-end gap-3">
                          <label className={`${labelClass} min-w-48 flex-1`}>
                            Nombre
                            <input name="name" defaultValue={group.name} required className={inputClass} />
                          </label>
                          <label className="flex min-h-11 items-center gap-2 text-sm">
                            <input type="checkbox" name="hidden" defaultChecked={group.hidden} className="size-[18px]" />
                            Ocultar del presupuesto
                          </label>
                          <SubmitButton className={secondaryButtonClass} pendingLabel="Guardando…">Guardar</SubmitButton>
                        </div>
                      </ActionForm>
                    </details>
                  </>
                )}
              </>
            )}
          </section>
        );
      })}

      {hiddenCategories.length > 0 ? (
        <details className={cardClass}>
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-display text-base font-semibold">
            Ocultas
            <span className="text-xs font-normal text-muted">
              {hiddenCategories.length === 1 ? "1 categoría" : `${hiddenCategories.length} categorías`}
            </span>
          </summary>
          <p className={`${mutedTextClass} mb-1`}>No aparecen en el presupuesto. Toca una para volver a mostrarla.</p>
          <ul className="flex flex-col">
            {hiddenCategories.map(({ category, group }) => (
              <li key={category.id} className="border-t border-hairline">
                <button
                  type="button"
                  onClick={() => setEditingId(category.id)}
                  className="flex min-h-13 w-full cursor-pointer items-center gap-3 py-2 text-left hover:bg-subtle"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{category.name}</span>
                    <span className="truncate text-xs text-muted">{group.label}</span>
                  </span>
                  <Icon name="chevronRight" className="text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <section className={cardClass}>
        <ActionForm action={createCategoryGroup} className="flex flex-col gap-2">
          <input type="hidden" name="budgetId" value={budgetId} />
          <div className="flex items-end gap-2">
            <label className={`${labelClass} min-w-0 flex-1`}>
              Nuevo grupo
              <input name="name" required placeholder="Por ejemplo, Gastos fijos" className={inputClass} />
            </label>
            <SubmitButton pendingLabel="Creando…">Crear grupo</SubmitButton>
          </div>
        </ActionForm>
      </section>

      {editing ? (
        <CategoryEditor
          // A different category gets a fresh form.
          key={editing.category.id}
          category={editing.category}
          groupId={editing.group.id}
          groups={movableGroups}
          currency={currency}
          currentMonth={currentMonth}
          onClose={() => setEditingId("")}
        />
      ) : null}
    </>
  );
}

interface CategoryRowItemProps {
  category: BoardCategory;
  isDragged: boolean;
  /** Marker drawn above the row when the dragged category would land before it. */
  lineBefore: React.ReactNode;
  onEdit: () => void;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

function CategoryRowItem({ category, isDragged, lineBefore, onEdit, onPointerDown, onPointerMove, onPointerUp, onKeyDown }: CategoryRowItemProps) {
  return (
    <>
      {lineBefore}
      <li data-category-row={category.id} className={`flex items-center border-t border-hairline ${isDragged ? "bg-accent-soft opacity-60" : ""}`}>
        <button
          type="button"
          aria-label={`Mover ${category.name}. Arrastra, o usa las flechas arriba y abajo.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          // The handle owns the gesture, so dragging it never scrolls the page.
          className="-ml-2 flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted hover:bg-subtle active:cursor-grabbing"
        >
          <Icon name="grip" strokeWidth={2.5} />
        </button>
        <button type="button" onClick={onEdit} className="flex min-h-13 min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 text-left hover:bg-subtle">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{category.name}</span>
            <span className="truncate text-xs text-muted">{category.goalText ?? "Sin meta"}</span>
          </span>
          <Icon name="chevronRight" className="text-muted" />
        </button>
      </li>
    </>
  );
}

function MoveGroupButtons({ id, isFirst, isLast, label }: { id: string; isFirst: boolean; isLast: boolean; label: string }) {
  const buttonClass = "flex size-9 cursor-pointer items-center justify-center rounded-lg text-ink-soft hover:bg-subtle disabled:cursor-default disabled:opacity-30";
  return (
    <form action={moveSortable} className="flex shrink-0">
      <input type="hidden" name="kind" value="group" />
      <input type="hidden" name="id" value={id} />
      <button type="submit" name="direction" value="up" disabled={isFirst} aria-label={`Subir el grupo ${label}`} className={buttonClass}>
        <Icon name="chevronDown" className="rotate-180" />
      </button>
      <button type="submit" name="direction" value="down" disabled={isLast} aria-label={`Bajar el grupo ${label}`} className={buttonClass}>
        <Icon name="chevronDown" />
      </button>
    </form>
  );
}

interface CategoryEditorProps {
  category: BoardCategory;
  groupId: string;
  /** Groups the category can be moved to. */
  groups: BoardGroup[];
  currency: CurrencySettings;
  currentMonth: string;
  onClose: () => void;
}

/** Editor of one category: a sheet from the bottom on phones, a dialog on wide screens. */
function CategoryEditor({ category, groupId, groups, currency, currentMonth, onClose }: CategoryEditorProps) {
  const [state, formAction, isPending] = useActionState(async (previous: ActionState, formData: FormData) => {
    const next = await updateCategory(previous, formData);
    if (next.ok) {
      onClose();
    }
    return next;
  }, IDLE_STATE);

  return (
    <>
      <button type="button" aria-label="Cerrar sin guardar" onClick={onClose} className="fixed inset-0 z-30 cursor-default bg-ink/45" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Editar ${category.name}`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
        className="fixed inset-x-0 bottom-0 z-40 flex max-h-[92dvh] flex-col gap-4 overflow-y-auto rounded-t-[22px] bg-surface px-5 pt-2.5 pb-8 shadow-2xl md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[560px] md:max-w-[calc(100vw-2rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[18px] md:pt-5 md:pb-5"
      >
        <span aria-hidden="true" className="h-1 w-10 shrink-0 self-center rounded-full bg-line-strong md:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className={eyebrowClass}>Editar categoría</span>
            <h2 className="truncate font-display text-[22px] font-semibold">{category.name}</h2>
          </div>
          <button
            type="button"
            aria-label="Cerrar sin guardar"
            onClick={onClose}
            className="-mt-1 -mr-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-soft hover:bg-subtle"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="categoryId" value={category.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              Nombre
              <input name="name" defaultValue={category.name} required className={inputClass} />
            </label>
            {category.isCardPayment ? null : (
              <label className={labelClass}>
                Grupo
                <select name="groupId" defaultValue={groupId} className={inputClass}>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>{group.label}</option>
                  ))}
                </select>
              </label>
            )}
            <label className={`${labelClass} sm:col-span-2`}>
              Nota (opcional)
              <input name="note" defaultValue={category.note ?? ""} className={inputClass} />
            </label>
          </div>

          <fieldset className="flex flex-col gap-3 border-t border-line pt-3">
            <legend className={`${eyebrowClass} float-left mb-3 w-full`}>Meta</legend>
            <GoalFields
              goalType={category.goalType}
              goalTarget={category.goalTarget}
              goalTargetMonth={category.goalTargetMonth}
              cadenceMonths={category.cadenceMonths}
              needsWholeAmount={category.needsWholeAmount}
              dueDay={category.dueDay}
              available={category.available}
              currentMonth={currentMonth}
              currency={currency}
            />
          </fieldset>

          <label className="flex min-h-11 items-center gap-2.5 border-t border-line pt-3 text-sm">
            <input type="checkbox" name="hidden" defaultChecked={category.hidden} className="size-[18px]" />
            Ocultar del presupuesto
          </label>

          {!state.ok && state.message ? (
            <p role="alert" className="text-sm text-red-700">{state.message}</p>
          ) : null}

          <button type="submit" disabled={isPending} className={`${primaryButtonClass} min-h-13`}>
            {isPending ? <PendingLabel>Guardando…</PendingLabel> : "Guardar categoría"}
          </button>
        </form>
      </div>
    </>
  );
}
