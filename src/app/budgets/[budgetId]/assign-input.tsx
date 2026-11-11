"use client";

import { useActionState, useRef } from "react";
import { setAssignment } from "@/app/actions/budget";
import { IDLE_STATE } from "@/lib/actions/form";
import { milliunitsToInput } from "@/lib/money";

interface AssignInputProps {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  month: string;
  assigned: number;
  decimalDigits: number;
}

/** Editable "assigned" cell: saves on Enter or when the field loses focus with a new value. */
export function AssignInput({ budgetId, categoryId, categoryName, month, assigned, decimalDigits }: AssignInputProps) {
  const [state, formAction, isPending] = useActionState(setAssignment, IDLE_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const initialValue = milliunitsToInput(assigned, decimalDigits);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col items-end gap-0.5">
      <input type="hidden" name="budgetId" value={budgetId} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="month" value={month} />
      <input
        key={`${assigned}:${state.version}`}
        name="amount"
        defaultValue={initialValue}
        inputMode="decimal"
        aria-label={`Asignado a ${categoryName}`}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={(event) => {
          if (!isPending && event.currentTarget.value.trim() !== initialValue) {
            formRef.current?.requestSubmit();
          }
        }}
        className={`w-24 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-right tabular-nums outline-none hover:border-neutral-300 focus:border-neutral-500 dark:hover:border-neutral-700 dark:focus:border-neutral-400 ${isPending ? "opacity-60" : ""}`}
      />
      {!state.ok && state.message ? (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
