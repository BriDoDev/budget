"use client";

import { useActionState, useState } from "react";
import { saveTransaction } from "@/app/actions/transactions";
import { PendingLabel } from "@/components/action-form";
import { AmountField } from "@/components/amount-field";
import { SearchSelect, type SearchSelectGroup } from "@/components/search-select";
import { inputClass, labelClass, linkButtonClass, primaryButtonClass } from "@/components/ui";
import { IDLE_STATE } from "@/lib/actions/form";
import { parseAmountInput } from "@/lib/money";
import {
  SPLIT_CATEGORY,
  type CategoryOptionGroup,
  type SplitDraft,
  type TransactionDraft,
} from "@/lib/transaction-draft";

interface TransactionFormProps {
  budgetId: string;
  accounts: Array<{ id: string; name: string }>;
  /** Set on an account page, where the account is not a choice. */
  fixedAccountId?: string;
  categoryGroups: CategoryOptionGroup[];
  incomeCategoryId: string | null;
  payeeNames: string[];
  today: string;
  returnTo: string;
  /** Transaction being edited; omitted when creating. */
  initial?: TransactionDraft;
}

const FLAG_OPTIONS = [
  { value: "", label: "Sin bandera" },
  { value: "red", label: "Roja" },
  { value: "orange", label: "Naranja" },
  { value: "yellow", label: "Amarilla" },
  { value: "green", label: "Verde" },
  { value: "blue", label: "Azul" },
  { value: "purple", label: "Morada" },
];
const EMPTY_SPLITS: SplitDraft[] = [
  { categoryId: "", amount: "" },
  { categoryId: "", amount: "" },
];

export function TransactionForm(props: TransactionFormProps) {
  const [state, formAction, isPending] = useActionState(saveTransaction, IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {/* Remounting the fields clears them after each saved transaction. */}
      <TransactionFields key={`${props.initial?.id ?? "new"}:${state.version}`} {...props} isPending={isPending} />
      {state.message ? (
        <p role="status" className={`text-sm ${state.ok ? "text-accent-strong" : "text-red-700"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function TransactionFields({
  budgetId,
  accounts,
  fixedAccountId,
  categoryGroups,
  incomeCategoryId,
  payeeNames,
  today,
  returnTo,
  initial,
  isPending,
}: TransactionFormProps & { isPending: boolean }) {
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [transferAccountId, setTransferAccountId] = useState(initial?.transferAccountId ?? "");
  const [splits, setSplits] = useState<SplitDraft[]>(initial?.splits.length ? initial.splits : EMPTY_SPLITS);
  const [outflow, setOutflow] = useState(initial?.outflow ?? "");
  const [inflow, setInflow] = useState(initial?.inflow ?? "");

  const transferTargets = accounts.filter((account) => account.id !== fixedAccountId);
  const isTransfer = transferAccountId !== "";
  const isSplit = categoryId === SPLIT_CATEGORY && !isTransfer;
  const total = Math.abs((parseAmountInput(inflow || "0") ?? 0) - (parseAmountInput(outflow || "0") ?? 0));
  const splitTotal = splits.reduce((sum, split) => sum + (parseAmountInput(split.amount) ?? 0), 0);
  const remaining = (total - splitTotal) / 1000;

  const updateSplit = (index: number, patch: Partial<SplitDraft>) =>
    setSplits((current) => current.map((split, position) => (position === index ? { ...split, ...patch } : split)));

  const baseOptions = [
    { value: "", label: "Sin categoría" },
    ...(incomeCategoryId ? [{ value: incomeCategoryId, label: "Ingreso: listo para asignar" }] : []),
  ];
  const groupedOptions: SearchSelectGroup[] = categoryGroups.map((group) => ({
    label: group.name,
    options: group.options.map((option) => ({ value: option.id, label: option.name })),
  }));
  const categoryOptions: SearchSelectGroup[] = [
    { options: [...baseOptions, { value: SPLIT_CATEGORY, label: "Dividir en varias categorías…", disabled: isTransfer }] },
    ...groupedOptions,
  ];
  const splitCategoryOptions: SearchSelectGroup[] = [{ options: baseOptions }, ...groupedOptions];

  return (
    <>
      <input type="hidden" name="budgetId" value={budgetId} />
      <input type="hidden" name="id" value={initial?.id ?? ""} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="splits" value={JSON.stringify(isSplit ? splits : [])} />
      {fixedAccountId ? <input type="hidden" name="accountId" value={fixedAccountId} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {fixedAccountId ? null : (
          <label className={labelClass}>
            Cuenta
            <select name="accountId" defaultValue={initial?.accountId ?? accounts[0]?.id} required className={inputClass}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className={labelClass}>
          Fecha
          <input type="date" name="date" defaultValue={initial?.date ?? today} required className={inputClass} />
        </label>
        <label className={labelClass}>
          Beneficiario
          <input
            name="payeeName"
            list="payee-names"
            defaultValue={initial?.payeeName ?? ""}
            disabled={isTransfer}
            placeholder={isTransfer ? "Transferencia" : "A quién le pagaste"}
            className={inputClass}
          />
          <datalist id="payee-names">
            {payeeNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <label className={labelClass}>
          O transferir a otra cuenta
          <select
            name="transferAccountId"
            value={transferAccountId}
            onChange={(event) => setTransferAccountId(event.target.value)}
            className={inputClass}
          >
            <option value="">No es transferencia</option>
            {transferTargets.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
        </label>
        <div className={labelClass}>
          Categoría
          <SearchSelect name="categoryId" label="Categoría" groups={categoryOptions} value={categoryId} onValueChange={setCategoryId} />
        </div>
        <label className={labelClass}>
          Salida
          <AmountField name="outflow" defaultValue={outflow} onValueChange={setOutflow} placeholder="0.00" className={`${inputClass} text-right text-expense`} />
        </label>
        <label className={labelClass}>
          Entrada
          <AmountField name="inflow" defaultValue={inflow} onValueChange={setInflow} placeholder="0.00" className={`${inputClass} text-right text-income`} />
        </label>
        <label className={labelClass}>
          Nota
          <input name="memo" defaultValue={initial?.memo ?? ""} className={inputClass} />
        </label>
      </div>

      {isSplit ? (
        <fieldset className="flex flex-col gap-2 rounded-[10px] border border-line p-3">
          <legend className="px-1 text-xs font-semibold text-muted">Partes de la transacción</legend>
          {splits.map((split, index) => (
            <div key={index} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
              <SearchSelect
                label={`Categoría de la parte ${index + 1}`}
                groups={splitCategoryOptions}
                value={split.categoryId}
                onValueChange={(value) => updateSplit(index, { categoryId: value })}
              />
              <AmountField
                aria-label={`Monto de la parte ${index + 1}`}
                defaultValue={split.amount}
                onValueChange={(value) => updateSplit(index, { amount: value })}
                placeholder="0.00"
                className={`${inputClass} text-right`}
              />
              <button
                type="button"
                className={linkButtonClass}
                disabled={splits.length <= 2}
                onClick={() => setSplits((current) => current.filter((_, position) => position !== index))}
              >
                Quitar
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between text-xs">
            <button type="button" className={linkButtonClass} onClick={() => setSplits((current) => [...current, { categoryId: "", amount: "" }])}>
              Agregar parte
            </button>
            <span className={remaining === 0 ? "text-muted" : "text-warn-ink"}>
              {remaining === 0 ? "Las partes suman el total" : `Falta repartir ${remaining.toFixed(2)}`}
            </span>
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="cleared" className="size-[18px]" defaultChecked={initial?.isCleared ?? false} />
          Ya aparece en el banco
        </label>
        <label className="flex items-center gap-2 text-sm">
          Bandera
          <select name="flagColor" defaultValue={initial?.flagColor ?? ""} className={`${inputClass} w-auto`}>
            {FLAG_OPTIONS.map((flag) => (
              <option key={flag.value} value={flag.value}>{flag.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={isPending} className={`${primaryButtonClass} ml-auto`}>
          {isPending ? <PendingLabel>Guardando…</PendingLabel> : initial ? "Guardar cambios" : "Agregar transacción"}
        </button>
      </div>
    </>
  );
}
