import Link from "next/link";
import { Suspense } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { listBudgets } from "@/lib/data/budgets";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Presupuestos</h1>
        <SignOutButton />
      </header>
      <Suspense fallback={<p className="text-neutral-500">Cargando presupuestos…</p>}>
        <BudgetList />
      </Suspense>
    </main>
  );
}

async function BudgetList() {
  const budgets = await listBudgets();

  if (budgets.length === 0) {
    return (
      <p className="text-neutral-600 dark:text-neutral-400">
        Todavía no hay presupuestos en tu hogar. Importa tu plan de YNAB con{" "}
        <code className="font-mono">pnpm import:ynab</code>.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
      {budgets.map((budget) => (
        <li key={budget.id}>
          <Link
            href={`/budgets/${budget.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            <span className="font-medium">{budget.name}</span>
            <span className="text-sm text-neutral-500">{budget.currency_iso_code}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
