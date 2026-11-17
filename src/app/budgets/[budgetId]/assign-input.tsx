"use client";

import { useActionState, useRef } from "react";
import { setAssignment } from "@/app/actions/budget";
import { AmountField } from "@/components/amount-field";
import { IDLE_STATE } from "@/lib/actions/form";
import { milliunitsToInput } from "@/lib/money";

interface AssignInputProps {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  month: string;
  assigned: number;
  decimalDigits: number;
  /** Stronger outline for the category shown in the detail panel. */
  isHighlighted?: boolean;
}

/** Editable "assigned" field: saves on Enter or when it loses focus with a new value. */
export function AssignInput({
  budgetId,
  categoryId,
  categoryName,
  month,
  assigned,
  decimalDigits,
  isHighlighted = false,
}: AssignInputProps) {
  const [state, formAction, isPending] = useActionState(setAssignment, IDLE_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const initialValue = milliunitsToInput(assigned, decimalDigits);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col items-end gap-0.5">
      <input type="hidden" name="budgetId" value={budgetId} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="month" value={month} />
      <AmountField
        key={`${assigned}:${state.version}`}
        name="amount"
        defaultValue={initialValue}
        decimalDigits={decimalDigits}
        aria-label={`Asignado a ${categoryName}`}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={(event) => {
          if (!isPending && event.currentTarget.value.trim() !== initialValue) {
            formRef.current?.requestSubmit();
          }
        }}
        className={`min-h-11 w-full max-w-[124px] rounded-lg bg-surface px-2.5 text-right text-ink tabular-nums outline-none focus:border-accent ${
          isHighlighted ? "border-2 border-accent" : "border border-line-strong"
        } ${isPending ? "opacity-60" : ""}`}
      />
      {!state.ok && state.message ? (
        <span role="alert" className="text-xs text-red-700">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
