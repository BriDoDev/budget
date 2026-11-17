"use client";

import Link from "@/components/app-link";
import { useActionState, useState, type ReactNode } from "react";
import { saveTransaction } from "@/app/actions/transactions";
import { PendingLabel } from "@/components/action-form";
import { Icon, type IconName } from "@/components/icons";
import { linkButtonClass, pillNeutralClass, pillPositiveClass, pillWarnClass } from "@/components/ui";
import { IDLE_STATE } from "@/lib/actions/form";
import { formatMilliunits, parseAmountInput, type CurrencySettings } from "@/lib/money";
import type { CategoryOptionGroup } from "@/lib/transaction-draft";

export type TransactionKind = "expense" | "income" | "transfer";

interface QuickTransactionFormProps {
  budgetId: string;
  accounts: Array<{ id: string; name: string }>;
  categoryGroups: CategoryOptionGroup[];
  incomeCategoryId: string | null;
  /** What each category has left this month, in milliunits. */
  availableByCategory: Record<string, number>;
  currency: CurrencySettings;
  payeeNames: string[];
  today: string;
  initialKind: TransactionKind;
  initialAccountId: string;
  initialTransferAccountId: string;
  /** Where splits, flags and the rest of the options live. */
  fullFormHref: string;
}

const KIND_OPTIONS: Array<{ value: TransactionKind; label: string; submitLabel: string }> = [
  { value: "expense", label: "Gasto", submitLabel: "Guardar gasto" },
  { value: "income", label: "Ingreso", submitLabel: "Guardar ingreso" },
  { value: "transfer", label: "Traspaso", submitLabel: "Guardar traspaso" },
];

const FIELD_CLASS = "min-h-7 w-full min-w-0 appearance-none bg-transparent text-[15px] font-medium text-ink outline-none";

export function QuickTransactionForm({
  budgetId,
  accounts,
  categoryGroups,
  incomeCategoryId,
  availableByCategory,
  currency,
  payeeNames,
  today,
  initialKind,
  initialAccountId,
  initialTransferAccountId,
  fullFormHref,
}: QuickTransactionFormProps) {
  const [state, formAction, isPending] = useActionState(saveTransaction, IDLE_STATE);
  const [kind, setKind] = useState<TransactionKind>(initialKind);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(initialAccountId);
  const [categoryId, setCategoryId] = useState("");
  const [transferAccountId, setTransferAccountId] = useState(initialTransferAccountId);

  const canTransfer = accounts.length > 1;
  const transferTargets = accounts.filter((account) => account.id !== accountId);
  const transferTarget = transferTargets.some((account) => account.id === transferAccountId)
    ? transferAccountId
    : (transferTargets[0]?.id ?? "");
  const amountMilliunits = parseAmountInput(amount || "0") ?? 0;
  const remaining = kind === "expense" && categoryId in availableByCategory ? availableByCategory[categoryId] - amountMilliunits : null;
  const submitLabel = KIND_OPTIONS.find((option) => option.value === kind)?.submitLabel ?? "Guardar";

  return (
    <form action={formAction} className="flex flex-col gap-4 text-[15px]">
      <input type="hidden" name="budgetId" value={budgetId} />
      <input type="hidden" name="id" value="" />
      <input type="hidden" name="splits" value="[]" />
      <input type="hidden" name="leaveAfterSave" value="on" />
      <input type="hidden" name="returnTo" value={`/budgets/${budgetId}/accounts/${accountId}`} />
      <input type="hidden" name={kind === "income" ? "inflow" : "outflow"} value={amount} />
      {kind === "income" ? <input type="hidden" name="categoryId" value={incomeCategoryId ?? ""} /> : null}
      {kind === "transfer" ? <input type="hidden" name="transferAccountId" value={transferTarget} /> : null}

      <div role="group" aria-label="Tipo de movimiento" className="grid grid-cols-3 gap-1 rounded-[14px] bg-line p-1">
        {KIND_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={kind === option.value}
            disabled={option.value === "transfer" && !canTransfer}
            onClick={() => setKind(option.value)}
            className={`min-h-11 cursor-pointer rounded-[10px] disabled:cursor-default disabled:opacity-50 ${
              kind === option.value ? "bg-surface font-semibold text-ink shadow-sm" : "font-medium text-ink-soft"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <label className="flex flex-col items-center gap-1 py-4">
        <span className="text-[13px] text-muted">Monto</span>
        <span className="flex items-baseline justify-center gap-1">
          <span aria-hidden="true" className="font-display text-3xl font-semibold text-muted">
            {kind === "income" ? "+$" : "−$"}
          </span>
          <input
            inputMode="decimal"
            required
            autoFocus
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            size={Math.max(4, amount.length)}
            className="max-w-[70vw] bg-transparent font-display text-[52px] leading-none font-semibold text-ink outline-none placeholder:text-line-strong"
          />
        </span>
      </label>

      <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
        {kind === "transfer" ? null : (
          <FieldRow icon="home" label={kind === "income" ? "Quién te pagó" : "Beneficiario"}>
            <input name="payeeName" list="quick-payee-names" autoComplete="off" placeholder="Escribe o elige" className={FIELD_CLASS} />
            <datalist id="quick-payee-names">
              {payeeNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </FieldRow>
        )}

        {kind === "expense" ? (
          <FieldRow
            icon="budget"
            label="Categoría"
            trailing={
              remaining === null ? null : (
                <span className={`text-[13px] ${remaining < 0 ? pillWarnClass : remaining > 0 ? pillPositiveClass : pillNeutralClass}`}>
                  {remaining < 0 ? "Se pasa por " : "Quedan "}
                  {formatMilliunits(Math.abs(remaining), currency)}
                </span>
              )
            }
          >
            <select name="categoryId" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={FIELD_CLASS}>
              <option value="">Sin categoría</option>
              {categoryGroups.map((group) => (
                <optgroup key={group.name} label={group.name}>
                  {group.options.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </FieldRow>
        ) : null}

        <FieldRow icon="card" label={kind === "transfer" ? "Sale de" : "Cuenta"}>
          <select name="accountId" value={accountId} onChange={(event) => setAccountId(event.target.value)} required className={FIELD_CLASS}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
        </FieldRow>

        {kind === "transfer" ? (
          <FieldRow icon="swap" label="Llega a">
            <select
              aria-label="Cuenta que recibe"
              value={transferTarget}
              onChange={(event) => setTransferAccountId(event.target.value)}
              className={FIELD_CLASS}
            >
              {transferTargets.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </FieldRow>
        ) : null}

        <FieldRow icon="calendar" label="Fecha">
          <input type="date" name="date" defaultValue={today} required className={FIELD_CLASS} />
        </FieldRow>

        <FieldRow icon="tag" label="Nota (opcional)">
          <input name="memo" autoComplete="off" className={FIELD_CLASS} />
        </FieldRow>
      </div>

      <label className="flex min-h-11 items-center gap-2.5">
        <input type="checkbox" name="cleared" className="size-5" />
        Ya aparece en el banco
      </label>

      {state.message ? (
        <p role="status" className={`text-sm ${state.ok ? "text-accent-strong" : "text-red-700"}`}>
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="min-h-14 cursor-pointer rounded-2xl bg-accent text-base font-semibold text-white hover:brightness-110 disabled:opacity-60"
      >
        {isPending ? <PendingLabel>Guardando…</PendingLabel> : submitLabel}
      </button>

      <Link href={fullFormHref} className={`${linkButtonClass} flex min-h-11 items-center justify-center`}>
        Dividir en categorías y más opciones
      </Link>
    </form>
  );
}

/** One tappable row of the form: the whole row is the label, so touching anywhere focuses its field. */
function FieldRow({ icon, label, trailing, children }: { icon: IconName; label: string; trailing?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex min-h-15 items-center gap-3 border-t border-hairline px-3.5 py-2 first:border-t-0 focus-within:bg-accent-soft/50">
      <Icon name={icon} size={20} className="text-muted" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-muted">{label}</span>
        {children}
      </span>
      {trailing}
    </label>
  );
}
