"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { IDLE_STATE, type ActionState } from "@/lib/actions/form";
import { Icon } from "./icons";
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
        <p role="status" className={`text-sm ${state.ok ? "text-accent-strong" : "text-red-700"}`}>
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

/**
 * Submit button that disables itself while its form is being sent. With a
 * pending label it shows a spinner next to it; without one it keeps its
 * content and pulses, so icon and link buttons do not change size.
 */
export function SubmitButton({ children, className = primaryButtonClass, pendingLabel, ...rest }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isPulsing = pending && !pendingLabel;
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} ${isPulsing ? "animate-pulse motion-reduce:animate-none" : ""}`}
      {...rest}
    >
      {pending && pendingLabel ? <PendingLabel>{pendingLabel}</PendingLabel> : children}
    </button>
  );
}

/** Spinner followed by what is happening, for buttons that manage their own pending state. */
export function PendingLabel({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <Icon name="spinner" size={16} strokeWidth={2.25} className="animate-spin motion-reduce:animate-none" />
      {children}
    </span>
  );
}
