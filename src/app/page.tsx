import Link from "@/components/app-link";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/skeleton";
import { SignOutButton } from "@/components/sign-out-button";
import { linkButtonClass, mutedTextClass } from "@/components/ui";
import { listBudgets } from "@/lib/data/budgets";
import { listHouseholds } from "@/lib/data/household";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-[28px] leading-tight font-semibold">Presupuestos</h1>
        <div className="flex items-center gap-4">
          <Link href="/household" className={linkButtonClass}>Hogar</Link>
          <SignOutButton />
        </div>
      </header>
      <Suspense fallback={<ListSkeleton label="Cargando presupuestos…" cards={1} rows={2} />}>
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
    <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-surface">
      {budgets.map((budget) => (
        <li key={budget.id}>
          <Link
            href={`/budgets/${budget.id}`}
            className="flex min-h-14 items-center justify-between px-5 py-3 hover:bg-subtle"
          >
            <span className="font-medium">{budget.name}</span>
            <span className="text-sm text-muted">{budget.currency_iso_code}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
