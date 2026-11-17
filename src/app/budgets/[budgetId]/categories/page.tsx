import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/skeleton";
import { pageClass } from "@/components/ui";
import { CREDIT_CARD_PAYMENTS_GROUP, describeGoal, groupLabel } from "@/lib/categories";
import { getBudgetMonthView } from "@/lib/data/budgets";
import { getBudget, listCategories, listCategoryGroups } from "@/lib/data/core";
import { milliunitsToInput, type CurrencySettings } from "@/lib/money";
import { currentMonthKey } from "@/lib/month";
import { CategoryBoard, type BoardGroup } from "./category-board";

type Props = PageProps<"/budgets/[budgetId]/categories">;

export default function CategoriesPage({ params, searchParams }: Props) {
  return (
    <main className={pageClass}>
      <h1 className="font-display text-[28px] leading-tight font-semibold">Categorías y metas</h1>
      <Suspense fallback={<ListSkeleton label="Cargando categorías…" cards={3} />}>
        <CategoryManager params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function CategoryManager({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { budgetId } = await params;
  const query = await searchParams;
  // The goal preview counts months from today, so wait for the request before reading the clock.
  await connection();
  const month = currentMonthKey();

  const budget = await getBudget(budgetId);
  if (!budget) {
    notFound();
  }
  const [groups, categories, monthView] = await Promise.all([
    listCategoryGroups(budgetId),
    listCategories(budgetId),
    getBudgetMonthView(budgetId, month),
  ]);
  const currency: CurrencySettings = { isoCode: budget.currency_iso_code, decimalDigits: budget.currency_decimal_digits };
  const availableByCategory = new Map(
    (monthView?.groups ?? []).flatMap((group) => group.categories).map((category) => [category.id, category.available]),
  );

  const board: BoardGroup[] = groups
    .filter((group) => !group.is_internal)
    .map((group) => ({
      id: group.id,
      name: group.name,
      label: groupLabel(group.name),
      hidden: group.hidden,
      isCardGroup: group.name === CREDIT_CARD_PAYMENTS_GROUP,
      categories: categories
        .filter((category) => category.group_id === group.id && category.kind !== "income" && category.kind !== "internal")
        .map((category) => ({
          id: category.id,
          name: category.name,
          note: category.note,
          hidden: category.hidden,
          isCardPayment: category.kind === "credit_card_payment",
          goalType: category.goal_type,
          goalTarget: category.goal_target ? milliunitsToInput(category.goal_target, currency.decimalDigits) : "",
          goalTargetMonth: category.goal_target_month?.slice(0, 7) ?? "",
          cadenceMonths: category.goal_cadence_months,
          needsWholeAmount: category.goal_needs_whole_amount,
          dueDay: category.goal_due_day,
          goalText: describeGoal(category, currency),
          available: availableByCategory.get(category.id) ?? 0,
        })),
    }));

  return (
    <CategoryBoard
      budgetId={budgetId}
      groups={board}
      currency={currency}
      currentMonth={month.slice(0, 7)}
      initialEditId={typeof query.edit === "string" ? query.edit : ""}
    />
  );
}
