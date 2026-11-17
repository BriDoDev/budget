import { Suspense } from "react";
import { RegisterSkeleton } from "@/components/skeleton";
import { pageClass } from "@/components/ui";
import { Register } from "./register";

export default function AllAccountsPage({ params, searchParams }: PageProps<"/budgets/[budgetId]/accounts">) {
  return (
    <main className={pageClass}>
      <Suspense fallback={<RegisterSkeleton isAccountsHome />}>
        <AllAccounts params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function AllAccounts({ params, searchParams }: Pick<PageProps<"/budgets/[budgetId]/accounts">, "params" | "searchParams">) {
  const { budgetId } = await params;
  return <Register budgetId={budgetId} searchParams={await searchParams} />;
}
