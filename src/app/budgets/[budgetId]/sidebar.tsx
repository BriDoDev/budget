import Link from "next/link";
import { createAccount } from "@/app/actions/accounts";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Money } from "@/components/money";
import { NavLink } from "@/components/nav-link";
import { inputClass, labelClass } from "@/components/ui";
import { ACCOUNT_TYPES } from "@/lib/accounts";
import { getBudget, listAccounts, type AccountWithBalance } from "@/lib/data/core";
import type { CurrencySettings } from "@/lib/money";

export async function BudgetSidebar({ params }: { params: Promise<{ budgetId: string }> }) {
  const { budgetId } = await params;
  const budget = await getBudget(budgetId);
  if (!budget) {
    return null;
  }
  const accounts = await listAccounts(budgetId);
  const currency: CurrencySettings = {
    isoCode: budget.currency_iso_code,
    decimalDigits: budget.currency_decimal_digits,
  };
  const base = `/budgets/${budgetId}`;
  const open = accounts.filter((account) => !account.closed);
  const closed = accounts.filter((account) => account.closed);

  return (
    <nav className="flex flex-col gap-4 p-3" aria-label="Presupuesto">
      <div className="flex flex-col gap-0.5 px-2">
        <span className="font-semibold">{budget.name}</span>
        <Link href="/" className="text-xs text-neutral-500 underline-offset-4 hover:underline">
          Cambiar de presupuesto
        </Link>
      </div>

      <div className="flex flex-col gap-0.5">
        <NavLink href={base} exact>Presupuesto</NavLink>
        <NavLink href={`${base}/accounts`} exact>Todos los movimientos</NavLink>
        <NavLink href={`${base}/scheduled`}>Programadas</NavLink>
        <NavLink href={`${base}/reports`}>Reportes</NavLink>
        <NavLink href={`${base}/categories`}>Categorías y metas</NavLink>
        <NavLink href="/household">Hogar</NavLink>
      </div>

      <AccountSection title="Cuentas del presupuesto" accounts={open.filter((account) => account.on_budget)} base={base} currency={currency} />
      <AccountSection title="Seguimiento" accounts={open.filter((account) => !account.on_budget)} base={base} currency={currency} />

      {closed.length > 0 ? (
        <details className="px-2 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-neutral-500">Cuentas cerradas ({closed.length})</summary>
          <div className="mt-1 flex flex-col gap-0.5">
            {closed.map((account) => (
              <NavLink key={account.id} href={`${base}/accounts/${account.id}`} className="-mx-2">
                <span className="truncate">{account.name}</span>
              </NavLink>
            ))}
          </div>
        </details>
      ) : null}

      <details className="px-2 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-neutral-500">Agregar cuenta</summary>
        <ActionForm action={createAccount} className="mt-2 flex flex-col gap-2">
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
}: {
  title: string;
  accounts: AccountWithBalance[];
  base: string;
  currency: CurrencySettings;
}) {
  if (accounts.length === 0) {
    return null;
  }
  const total = accounts.reduce((sum, account) => sum + account.balance, 0);

  return (
    <section className="flex flex-col gap-0.5">
      <h2 className="flex items-center justify-between px-2 text-xs font-medium text-neutral-500">
        <span>{title}</span>
        <Money amount={total} currency={currency} />
      </h2>
      {accounts.map((account) => (
        <NavLink key={account.id} href={`${base}/accounts/${account.id}`}>
          <span className="truncate">{account.name}</span>
          <Money amount={account.balance} currency={currency} className={account.balance < 0 ? "text-red-600 dark:text-red-400" : ""} />
        </NavLink>
      ))}
    </section>
  );
}
