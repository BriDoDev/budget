import Link from "next/link";
import { Icon } from "@/components/icons";
import { Money } from "@/components/money";
import { eyebrowClass, secondaryButtonClass } from "@/components/ui";
import { findAccountType } from "@/lib/accounts";
import { CREDIT_ACCOUNT_TYPES } from "@/lib/budget-engine";
import { getBudgetMonthView } from "@/lib/data/budgets";
import type { AccountWithBalance } from "@/lib/data/core";
import type { CurrencySettings } from "@/lib/money";
import { currentMonthKey } from "@/lib/month";

interface AccountsOverviewProps {
  budgetId: string;
  accounts: AccountWithBalance[];
  currency: CurrencySettings;
  uncategorizedCount: number;
}

/**
 * Accounts at a glance for phones, where the sidebar that lists them is hidden:
 * what there is, what is owed, and how much of each card is already set aside.
 */
export async function AccountsOverview({ budgetId, accounts, currency, uncategorizedCount }: AccountsOverviewProps) {
  const monthView = await getBudgetMonthView(budgetId, currentMonthKey());
  const reservedByAccount = new Map<string, number>();
  for (const category of monthView?.groups.flatMap((group) => group.categories) ?? []) {
    if (category.linkedAccountId) {
      reservedByAccount.set(category.linkedAccountId, category.available);
    }
  }

  const open = accounts.filter((account) => !account.closed);
  const isCard = (account: AccountWithBalance) => CREDIT_ACCOUNT_TYPES.has(account.type);
  const cash = open.filter((account) => account.on_budget && !isCard(account));
  const cards = open.filter((account) => account.on_budget && isCard(account));
  const tracking = open.filter((account) => !account.on_budget);
  const cashTotal = cash.reduce((sum, account) => sum + account.balance, 0);
  const cardDebt = cards.reduce((sum, account) => sum + Math.max(0, -account.balance), 0);
  const base = `/budgets/${budgetId}`;

  if (open.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 text-[15px] md:hidden">
      <section aria-label="Resumen" className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5 rounded-[14px] border border-line bg-surface px-3.5 py-3">
          <span className="text-xs text-muted">Tienes</span>
          <Money amount={cashTotal} currency={currency} className="font-display text-xl font-semibold" />
        </div>
        <div className="flex flex-col gap-0.5 rounded-[14px] border border-line bg-surface px-3.5 py-3">
          <span className="text-xs text-muted">Debes en tarjetas</span>
          <Money amount={cardDebt} currency={currency} className={`font-display text-xl font-semibold ${cardDebt > 0 ? "text-warn-ink" : ""}`} />
        </div>
      </section>

      {uncategorizedCount > 0 ? (
        <Link
          href={`${base}/accounts?filter=uncategorized`}
          className="flex min-h-13 items-center gap-2.5 rounded-[14px] border border-warn-line bg-warn-softer px-3.5 py-2 font-medium text-warn-deep"
        >
          <Icon name="alert" />
          <span className="flex-1">
            {uncategorizedCount === 1 ? "1 movimiento sin categoría" : `${uncategorizedCount} movimientos sin categoría`}
          </span>
          <Icon name="chevronRight" />
        </Link>
      ) : null}

      {cash.length > 0 ? (
        <AccountGroup title="Efectivo y débito">
          {cash.map((account) => (
            <AccountRow key={account.id} href={`${base}/accounts/${account.id}`} account={account} currency={currency} />
          ))}
        </AccountGroup>
      ) : null}

      {cards.length > 0 ? (
        <AccountGroup title="Tarjetas de crédito">
          {cards.map((account) => {
            const debt = Math.max(0, -account.balance);
            const reserved = Math.max(0, reservedByAccount.get(account.id) ?? 0);
            const missing = Math.max(0, debt - reserved);
            const percent = debt === 0 ? 100 : Math.min(100, Math.round((reserved / debt) * 100));
            return (
              <div key={account.id} className="flex flex-col gap-2 border-t border-hairline px-3.5 pt-1 pb-3">
                <AccountRow
                  href={`${base}/accounts/${account.id}`}
                  account={account}
                  currency={currency}
                  isNested
                  detail={
                    debt === 0 ? (
                      "Sin deuda"
                    ) : missing > 0 ? (
                      <>
                        Apartado <Money amount={reserved} currency={currency} /> · faltan <Money amount={missing} currency={currency} />
                      </>
                    ) : (
                      "El pago completo ya está apartado"
                    )
                  }
                />
                {debt > 0 ? (
                  <>
                    <span role="img" aria-label={`Pago apartado al ${percent} por ciento`} className="block h-1.5 rounded-full bg-track">
                      <span className={`block h-full rounded-full ${missing > 0 ? "bg-warn" : "bg-accent"}`} style={{ width: `${percent}%` }} />
                    </span>
                    <Link href={`${base}/new?type=transfer&to=${account.id}`} className={`${secondaryButtonClass} self-start rounded-full`}>
                      Registrar pago
                    </Link>
                  </>
                ) : null}
              </div>
            );
          })}
        </AccountGroup>
      ) : null}

      {tracking.length > 0 ? (
        <AccountGroup title="Seguimiento">
          {tracking.map((account) => (
            <AccountRow key={account.id} href={`${base}/accounts/${account.id}`} account={account} currency={currency} />
          ))}
        </AccountGroup>
      ) : null}
    </div>
  );
}

function AccountGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="overflow-hidden rounded-[14px] border border-line bg-surface">
      <h2 className={`bg-subtle px-3.5 py-2 ${eyebrowClass}`}>{title}</h2>
      {children}
    </section>
  );
}

function AccountRow({
  href,
  account,
  currency,
  detail,
  isNested = false,
}: {
  href: string;
  account: AccountWithBalance;
  currency: CurrencySettings;
  detail?: React.ReactNode;
  /** Inside a card block that already draws its own divider and padding. */
  isNested?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 active:bg-subtle ${isNested ? "min-h-12" : "min-h-16 border-t border-hairline px-3.5 py-2"}`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{account.name}</span>
        <span className="text-xs text-muted">{detail ?? findAccountType(account.type)?.label ?? account.type}</span>
      </span>
      <Money amount={account.balance} currency={currency} className={`font-semibold ${account.balance < 0 ? "text-warn-ink" : ""}`} />
      <Icon name="chevronRight" className="text-muted" />
    </Link>
  );
}
