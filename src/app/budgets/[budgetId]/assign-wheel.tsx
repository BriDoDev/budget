"use client";

import { useActionState, useState } from "react";
import { setAssignment } from "@/app/actions/budget";
import { PendingLabel } from "@/components/action-form";
import { AmountWheel } from "@/components/amount-wheel";
import { eyebrowClass, primaryButtonClass } from "@/components/ui";
import { IDLE_STATE } from "@/lib/actions/form";
import { formatMilliunits, milliunitsToInput, type CurrencySettings } from "@/lib/money";

interface AssignWheelProps {
  budgetId: string;
  categoryId: string;
  month: string;
  /** What the category has assigned this month, in milliunits. */
  assigned: number;
  /** The most it can be given: what it has plus the money still ready to assign. */
  max: number;
  currency: CurrencySettings;
}

/** Sets what a category gets this month by spinning a wheel instead of typing. */
export function AssignWheel({ budgetId, categoryId, month, assigned, max, currency }: AssignWheelProps) {
  const [state, formAction, isPending] = useActionState(setAssignment, IDLE_STATE);
  const [amount, setAmount] = useState(assigned);
  const difference = amount - assigned;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="budgetId" value={budgetId} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="amount" value={milliunitsToInput(amount, 3)} />
      <span className={eyebrowClass}>Desliza para asignar</span>
      <AmountWheel value={amount} max={max} currency={currency} onValueChange={setAmount} label="Monto a asignar" />
      <button type="submit" disabled={isPending || difference === 0} className={primaryButtonClass}>
        {isPending ? (
          <PendingLabel>Asignando…</PendingLabel>
        ) : difference === 0 ? (
          "Gira la rueda para cambiar el monto"
        ) : (
          `Dejar en ${formatMilliunits(amount, currency)} (${difference > 0 ? "+" : "−"}${formatMilliunits(Math.abs(difference), currency)})`
        )}
      </button>
      {!state.ok && state.message ? (
        <span role="alert" className="text-xs text-red-700">{state.message}</span>
      ) : null}
    </form>
  );
}
