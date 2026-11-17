import { Suspense } from "react";
import { SidebarSkeleton } from "@/components/skeleton";
import { BudgetSidebar } from "../sidebar";

type Props = PageProps<"/budgets/[budgetId]/menu">;

/** The sidebar as a page: on phones it is where sections and accounts live. */
export default function MenuPage({ params }: Props) {
  return (
    <main className="mx-auto w-full max-w-md pb-28">
      <Suspense fallback={<SidebarSkeleton />}>
        <Menu params={params} />
      </Suspense>
    </main>
  );
}

async function Menu({ params }: Pick<Props, "params">) {
  const { budgetId } = await params;
  return <BudgetSidebar budgetId={budgetId} />;
}
