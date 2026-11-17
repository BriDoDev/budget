import Link from "@/components/app-link";
import { createAccount } from "@/app/actions/accounts";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Icon, type IconName } from "@/components/icons";
import { Money } from "@/components/money";
import { NavLink } from "@/components/nav-link";
import { eyebrowClass, inputClass, labelClass, pillWarnClass } from "@/components/ui";
import { ACCOUNT_TYPES } from "@/lib/accounts";
import { todayIso } from "@/lib/actions/form";
import { CREDIT_ACCOUNT_TYPES } from "@/lib/budget-engine";
import { countDueScheduled, getBudgetMonthView } from "@/lib/data/budgets";
import { getBudget, listAccounts, type AccountWithBalance } from "@/lib/data/core";
import { formatMilliunits, type CurrencySettings } from "@/lib/money";
import { currentMonthKey } from "@/lib/month";

const SECTIONS: Array<{ path: string; label: string; icon: IconName; exact?: boolean }> = [
  { path: "", label: "Presupuesto", icon: "budget", exact: true },
  { path: "/accounts", label: "Movimientos", icon: "list", exact: true },
  { path: "/scheduled", label: "Programadas", icon: "calendar" },
  { path: "/reports", label: "Reportes", icon: "chart" },
  { path: "/categories", label: "Categorías y metas", icon: "tag" },
];

/** Budget navigation: sections, accounts with balances and the form to add an account. */
export async function BudgetSidebar({ budgetId }: { budgetId: string }) {
  const budget = await getBudget(budgetId);
  if (!budget) {
    return null;
  }
  const [accounts, dueScheduled, monthView] = await Promise.all([
    listAccounts(budgetId),
    countDueScheduled(budgetId, todayIso()),
    getBudgetMonthView(budgetId, currentMonthKey()),
  ]);

  const currency: CurrencySettings = {
    isoCode: budget.currency_iso_code,
    decimalDigits: budget.currency_decimal_digits,
  };
  // Money already set aside in each card's payment category.
  const reservedByAccount = new Map<string, number>();
  for (const category of monthView?.groups.flatMap((group) => group.categories) ?? []) {
    if (category.linkedAccountId) {
      reservedByAccount.set(category.linkedAccountId, category.available);
    }
  }

  const base = `/budgets/${budgetId}`;
  const open = accounts.filter((account) => !account.closed);
  const closed = accounts.filter((account) => account.closed);

  return (
    <nav className="flex flex-col gap-5 px-3.5 py-5" aria-label="Presupuesto">
      <div className="flex items-center gap-2.5 px-2">
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-[9px] bg-accent font-display font-bold text-white"
        >
          {budget.name.charAt(0).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-display text-base font-semibold">{budget.name}</span>
          <Link href="/" className="text-xs text-muted hover:text-ink">
            Cambiar de presupuesto
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        {SECTIONS.map((section) => (
          <NavLink key={section.path} href={`${base}${section.path}`} exact={section.exact}>
            <Icon name={section.icon} />
            <span className="flex-1">{section.label}</span>
            {section.path === "/scheduled" && dueScheduled > 0 ? (
              <span className={`${pillWarnClass} !px-2 !py-0.5 text-xs`}>{dueScheduled} por registrar</span>
            ) : null}
          </NavLink>
        ))}
        <NavLink href="/household">
          <Icon name="home" />
          Hogar
        </NavLink>
      </div>

      <AccountSection
        title="Cuentas"
        accounts={open.filter((account) => account.on_budget)}
        base={base}
        currency={currency}
        reservedByAccount={reservedByAccount}
      />
      <AccountSection
        title="Seguimiento"
        accounts={open.filter((account) => !account.on_budget)}
        base={base}
        currency={currency}
        reservedByAccount={reservedByAccount}
      />

      {closed.length > 0 ? (
        <details className="px-3 text-sm">
          <summary className={`cursor-pointer ${eyebrowClass}`}>Cuentas cerradas ({closed.length})</summary>
          <div className="mt-1 -mx-3 flex flex-col gap-0.5">
            {closed.map((account) => (
              <NavLink key={account.id} href={`${base}/accounts/${account.id}`}>
                <span className="truncate">{account.name}</span>
              </NavLink>
            ))}
          </div>
        </details>
      ) : null}

      <details>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface text-sm font-medium text-ink-soft hover:bg-subtle">
          <Icon name="plus" size={16} />
          Agregar cuenta
        </summary>
        <ActionForm action={createAccount} className="mt-3 flex flex-col gap-2.5 px-1">
          <input type="hidden" name="budgetId" value={budgetId} />
          <label className={labelClass}>
            Nombre
            <input name="name" required className={inputClass} />
          </label>
          <label className={labelClass}>
            Tipo
            <select name="type" defaultValue="checking" className={inputClass}>
              {ACCOUNT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Saldo actual (en deudas, lo que debes)
            <input name="balance" inputMode="decimal" placeholder="0.00" className={inputClass} />
          </label>
          <SubmitButton pendingLabel="Creando…">Crear cuenta</SubmitButton>
        </ActionForm>
      </details>
    </nav>
  );
}

function AccountSection({
  title,
  accounts,
  base,
  currency,
  reservedByAccount,
}: {
  title: string;
  accounts: AccountWithBalance[];
  base: string;
  currency: CurrencySettings;
  reservedByAccount: Map<string, number>;
}) {
  if (accounts.length === 0) {
    return null;
  }
  const total = accounts.reduce((sum, account) => sum + account.balance, 0);

  return (
    <section className="flex flex-col gap-0.5">
      <h2 className={`flex items-center justify-between px-3 pb-1.5 text-[11px] ${eyebrowClass}`}>
        <span>{title}</span>
        <Money amount={total} currency={currency} />
      </h2>
      {accounts.map((account) => {
        const isCard = account.on_budget && CREDIT_ACCOUNT_TYPES.has(account.type);
        return (
          <NavLink key={account.id} href={`${base}/accounts/${account.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm">
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{account.name}</span>
              {isCard ? (
                <span className="text-xs font-normal text-muted">
                  {formatMilliunits(Math.max(0, reservedByAccount.get(account.id) ?? 0), currency)} apartados
                </span>
              ) : null}
            </span>
            <Money amount={account.balance} currency={currency} className={account.balance < 0 ? "text-warn-ink" : ""} />
          </NavLink>
        );
      })}
    </section>
  );
}
