import { Suspense } from "react";
import { pageClass } from "@/components/ui";
import { Register } from "./register";

export default function AllAccountsPage({ params, searchParams }: PageProps<"/budgets/[budgetId]/accounts">) {
  return (
    <main className={pageClass}>
      <Suspense fallback={<p className="text-muted">Cargando movimientos…</p>}>
        <AllAccounts params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function AllAccounts({ params, searchParams }: Pick<PageProps<"/budgets/[budgetId]/accounts">, "params" | "searchParams">) {
  const { budgetId } = await params;
  return <Register budgetId={budgetId} searchParams={await searchParams} />;
}
