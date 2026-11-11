import { Suspense } from "react";
import { BudgetSidebar } from "./sidebar";

export default function BudgetLayout({ children, params }: LayoutProps<"/budgets/[budgetId]">) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="border-b border-neutral-200 md:w-64 md:shrink-0 md:border-r md:border-b-0 dark:border-neutral-800">
        <Suspense fallback={<p className="p-4 text-sm text-neutral-500">Cargando cuentas…</p>}>
          <BudgetSidebar params={params} />
        </Suspense>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
