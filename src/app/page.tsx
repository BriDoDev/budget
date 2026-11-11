import Link from "next/link";
import { Suspense } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { linkButtonClass, mutedTextClass } from "@/components/ui";
import { listBudgets } from "@/lib/data/budgets";
import { listHouseholds } from "@/lib/data/household";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Presupuestos</h1>
        <div className="flex items-center gap-4">
          <Link href="/household" className={linkButtonClass}>Hogar</Link>
          <SignOutButton />
        </div>
      </header>
      <Suspense fallback={<p className="text-neutral-500">Cargando presupuestos…</p>}>
        <BudgetList />
      </Suspense>
    </main>
  );
}

async function BudgetList() {
  // Listing households first also accepts a pending invite, so a new member sees the shared budgets right away.
  const households = await listHouseholds();
  const budgets = await listBudgets();

  if (budgets.length === 0) {
    return (
      <p className={mutedTextClass}>
        {households.length === 0 ? "Aún no tienes un hogar. " : "Tu hogar todavía no tiene presupuestos. "}
        <Link href="/household" className="underline underline-offset-4">
          {households.length === 0 ? "Créalo aquí" : "Crea uno o tráelo de YNAB"}
        </Link>
        .
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
