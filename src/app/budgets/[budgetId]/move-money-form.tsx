"use client";

import { useActionState, useState } from "react";
import { moveMoney } from "@/app/actions/budget";
import { PendingLabel } from "@/components/action-form";
import { AmountField } from "@/components/amount-field";
import { AmountWheel } from "@/components/amount-wheel";
import { SearchSelect, type SearchSelectGroup } from "@/components/search-select";
import { inputClass, labelClass, primaryButtonClass } from "@/components/ui";
import { IDLE_STATE } from "@/lib/actions/form";
import { formatMilliunits, milliunitsToInput, parseAmountInput, type CurrencySettings } from "@/lib/money";

interface MoveMoneyFormProps {
  budgetId: string;
  month: string;
  currency: CurrencySettings;
  readyToAssign: number;
  groups: Array<{ name: string; categories: Array<{ id: string; name: string; available: number }> }>;
}

/** Moves money between two categories, or to and from what is ready to assign. */
export function MoveMoneyForm(props: MoveMoneyFormProps) {
  const [state, formAction, isPending] = useActionState(moveMoney, IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {/* Remounting the fields clears them after each move. */}
      <MoveMoneyFields key={state.version} {...props} isPending={isPending} />
      {state.message ? (
        <p role="status" className={`text-sm ${state.ok ? "text-accent-strong" : "text-red-700"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function MoveMoneyFields({ budgetId, month, currency, readyToAssign, groups, isPending }: MoveMoneyFormProps & { isPending: boolean }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(groups[0]?.categories[0]?.id ?? "");
  const [amount, setAmount] = useState("");

  const categories = groups.flatMap((group) => group.categories);
  const sourceAvailable = from ? (categories.find((category) => category.id === from)?.available ?? 0) : readyToAssign;
  const movable = Math.max(0, sourceAvailable);
  const amountMilliunits = Math.min(movable, Math.max(0, parseAmountInput(amount) ?? 0));

  const options: SearchSelectGroup[] = [
    { options: [{ value: "", label: "Listo para asignar", hint: formatMilliunits(readyToAssign, currency) }] },
    ...groups.map((group) => ({
      label: group.name,
      options: group.categories.map((category) => ({
        value: category.id,
        label: category.name,
        hint: formatMilliunits(category.available, currency),
      })),
    })),
  ];

  return (
    <>
      <input type="hidden" name="budgetId" value={budgetId} />
      <input type="hidden" name="month" value={month} />
      <div className={labelClass}>
        De
        <SearchSelect name="from" label="De dónde sale" groups={options} value={from} onValueChange={setFrom} />
      </div>
      <div className={labelClass}>
        A
        <SearchSelect name="to" label="A dónde llega" groups={options} value={to} onValueChange={setTo} />
      </div>
      <label className={labelClass}>
        Monto (hay {formatMilliunits(movable, currency)} para mover)
        <AmountField
          name="amount"
          required
          placeholder="0.00"
          value={amount}
          onValueChange={setAmount}
          decimalDigits={currency.decimalDigits}
          className={`${inputClass} text-right`}
        />
      </label>
      {movable > 0 ? (
        <AmountWheel
          // A different source has a different ceiling, so the wheel starts over.
          key={from}
          value={amountMilliunits}
          max={movable}
          currency={currency}
          onValueChange={(value) => setAmount(milliunitsToInput(value, currency.decimalDigits))}
          label="Monto a mover"
        />
      ) : null}
      <button type="submit" disabled={isPending} className={primaryButtonClass}>
        {isPending ? <PendingLabel>Moviendo…</PendingLabel> : "Mover"}
      </button>
    </>
  );
}
