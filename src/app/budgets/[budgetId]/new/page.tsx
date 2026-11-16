import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { mutedTextClass } from "@/components/ui";
import { todayIso } from "@/lib/actions/form";
import { getBudgetMonthView } from "@/lib/data/budgets";
import { getBudget, listAccounts, listCategories, listCategoryGroups } from "@/lib/data/core";
import { listPayeeNames } from "@/lib/data/transactions";
import { currentMonthKey } from "@/lib/month";
import { toCategoryOptions } from "../accounts/register";
import { QuickTransactionForm, type TransactionKind } from "./quick-form";

type Props = PageProps<"/budgets/[budgetId]/new">;

const KINDS: TransactionKind[] = ["expense", "income", "transfer"];

/** Entry screen for a transaction, laid out for one hand on a phone. */
export default function NewTransactionPage({ params, searchParams }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-3 pb-28 md:pt-7 md:pb-8">
      <Suspense fallback={<p className={mutedTextClass}>Cargando…</p>}>
        <NewTransaction params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function NewTransaction({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { budgetId } = await params;
  const query = await searchParams;
  // Today's date and the current month come from the clock, so wait for the request first.
  await connection();

  const budget = await getBudget(budgetId);
  if (!budget) {
    notFound();
  }
  const [accounts, groups, categories, payeeNames, monthView] = await Promise.all([
    listAccounts(budgetId),
    listCategoryGroups(budgetId),
    listCategories(budgetId),
    listPayeeNames(budgetId),
    getBudgetMonthView(budgetId, currentMonthKey()),
  ]);
  const openAccounts = accounts.filter((account) => !account.closed).map((account) => ({ id: account.id, name: account.name }));
  const base = `/budgets/${budgetId}`;

  const availableByCategory: Record<string, number> = {};
  for (const category of monthView?.groups.flatMap((group) => group.categories) ?? []) {
    availableByCategory[category.id] = category.available;
  }

  const requestedKind = KINDS.find((kind) => kind === query.type) ?? "expense";
  const requestedTarget = openAccounts.find((account) => account.id === query.to)?.id ?? "";
  const requestedAccount = openAccounts.find((account) => account.id === query.account)?.id;
  const defaultAccount = requestedAccount ?? openAccounts.find((account) => account.id !== requestedTarget)?.id ?? "";

  return (
    <>
      <header className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center">
        <Link href={`${base}/accounts`} aria-label="Cancelar" className="flex size-11 items-center justify-center rounded-lg text-ink-soft hover:bg-subtle">
          <Icon name="close" size={20} />
        </Link>
        <h1 className="text-center font-display text-lg font-semibold">Nueva transacción</h1>
      </header>

      {openAccounts.length === 0 ? (
        <p className={mutedTextClass}>Agrega una cuenta para empezar a capturar transacciones.</p>
      ) : (
        <QuickTransactionForm
          budgetId={budgetId}
          accounts={openAccounts}
          categoryGroups={toCategoryOptions(groups, categories)}
          incomeCategoryId={categories.find((category) => category.kind === "income")?.id ?? null}
          availableByCategory={availableByCategory}
          currency={{ isoCode: budget.currency_iso_code, decimalDigits: budget.currency_decimal_digits }}
          payeeNames={payeeNames}
          today={todayIso()}
          initialKind={requestedKind === "transfer" && openAccounts.length < 2 ? "expense" : requestedKind}
          initialAccountId={defaultAccount}
          initialTransferAccountId={requestedTarget}
          fullFormHref={`${base}/accounts?form=1#nueva`}
        />
      )}
    </>
  );
}
