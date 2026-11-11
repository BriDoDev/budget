import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Presupuesto del hogar</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Te enviamos un enlace a tu correo para entrar, sin contraseña.
        </p>
      </div>
      <LoginForm />
    </main>
  );
}
