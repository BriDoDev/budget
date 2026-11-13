import { Suspense } from "react";
import { MobileNav } from "./mobile-nav";
import { BudgetSidebar } from "./sidebar";

type Params = LayoutProps<"/budgets/[budgetId]">["params"];

export default function BudgetLayout({ children, params }: LayoutProps<"/budgets/[budgetId]">) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="hidden border-line bg-surface md:block md:w-[264px] md:shrink-0 md:border-r">
        <Suspense fallback={<p className="p-5 text-sm text-muted">Cargando cuentas…</p>}>
          <Sidebar params={params} />
        </Suspense>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
      <Suspense fallback={null}>
        <PhoneNav params={params} />
      </Suspense>
    </div>
  );
}

async function Sidebar({ params }: { params: Params }) {
  const { budgetId } = await params;
  return <BudgetSidebar budgetId={budgetId} />;
}

async function PhoneNav({ params }: { params: Params }) {
  const { budgetId } = await params;
  return <MobileNav budgetId={budgetId} />;
}
