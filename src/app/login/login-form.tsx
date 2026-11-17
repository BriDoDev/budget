"use client";

import { useActionState } from "react";
import { PendingLabel } from "@/components/action-form";
import { requestMagicLink, type MagicLinkState } from "./actions";

const INITIAL_STATE: MagicLinkState = { status: "idle", message: "" };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(requestMagicLink, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">
        Correo
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        className="min-h-11 rounded-lg border border-line-strong bg-surface px-3 outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={isPending}
        className="min-h-11 cursor-pointer rounded-[10px] bg-accent px-4 font-semibold text-white hover:brightness-110 disabled:opacity-60"
      >
        {isPending ? <PendingLabel>Enviando…</PendingLabel> : "Enviar enlace de acceso"}
      </button>
      {state.message ? (
        <p role="status" className={state.status === "error" ? "text-sm text-red-700" : "text-sm text-muted"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
