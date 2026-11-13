import { Suspense } from "react";
import { pageClass } from "@/components/ui";
import { Register } from "../register";

type Props = PageProps<"/budgets/[budgetId]/accounts/[accountId]">;

export default function AccountPage({ params, searchParams }: Props) {
  return (
    <main className={pageClass}>
      <Suspense fallback={<p className="text-muted">Cargando movimientos…</p>}>
        <Account params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Account({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { budgetId, accountId } = await params;
  return <Register budgetId={budgetId} accountId={accountId} searchParams={await searchParams} />;
}
