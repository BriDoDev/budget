"use client";

import { useActionState } from "react";
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
        className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {isPending ? "Enviando…" : "Enviar enlace de acceso"}
      </button>
      {state.message ? (
        <p role="status" className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-neutral-600 dark:text-neutral-400"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
