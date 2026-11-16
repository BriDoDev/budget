import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { NavLink } from "@/components/nav-link";

const TAB_CLASS = "flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px]";
const ACTIVE_CLASS = "font-semibold text-accent";
const INACTIVE_CLASS = "font-medium text-muted";

/** Bottom navigation shown on phones, where the sidebar is hidden. */
export function MobileNav({ budgetId }: { budgetId: string }) {
  const base = `/budgets/${budgetId}`;
  const tab = (href: string, label: string, icon: IconName, exact = false) => (
    <NavLink href={href} exact={exact} className={TAB_CLASS} activeClassName={ACTIVE_CLASS} inactiveClassName={INACTIVE_CLASS}>
      <Icon name={icon} size={22} />
      {label}
    </NavLink>
  );

  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 items-center border-t border-line bg-surface px-2 pt-2 pb-3 md:hidden"
    >
      {tab(base, "Presupuesto", "budget", true)}
      {tab(`${base}/accounts`, "Cuentas", "list")}
      <Link
        href={`${base}/new`}
        aria-label="Nueva transacción"
        className="flex size-13 items-center justify-center justify-self-center rounded-full bg-accent text-white"
      >
        <Icon name="plus" size={24} strokeWidth={2} />
      </Link>
      {tab(`${base}/reports`, "Reportes", "chart")}
      {tab(`${base}/menu`, "Más", "more")}
    </nav>
  );
}
