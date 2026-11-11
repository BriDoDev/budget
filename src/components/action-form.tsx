"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { IDLE_STATE, type ActionState } from "@/lib/actions/form";
import { primaryButtonClass } from "./ui";

type FormAction = (previous: ActionState, formData: FormData) => Promise<ActionState>;

interface ActionFormProps {
  action: FormAction;
  children: ReactNode;
  className?: string;
}

/**
 * Form bound to a server action that reports success or failure. Its fields
 * remount after each success so they pick up the refreshed server values.
 */
export function ActionForm({ action, children, className }: ActionFormProps) {
  const [state, formAction] = useActionState(action, IDLE_STATE);

  return (
    <form action={formAction} className={className}>
      <div key={state.version} className="contents">
        {children}
      </div>
      {state.message ? (
        <p role="status" className={`text-sm ${state.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

interface SubmitButtonProps {
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
  name?: string;
  value?: string;
  title?: string;
  "aria-label"?: string;
}

/** Submit button that disables itself while its form is being sent. */
export function SubmitButton({ children, className = primaryButtonClass, pendingLabel, ...rest }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className} {...rest}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
