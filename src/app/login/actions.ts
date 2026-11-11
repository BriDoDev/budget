"use server";

import { headers } from "next/headers";
import { isEmailAllowed, parseAllowedEmails } from "@/lib/auth/allowed-emails";
import { createClient } from "@/lib/supabase/server";

export interface MagicLinkState {
  status: "idle" | "sent" | "error";
  message: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENT_MESSAGE = "Si tu correo está autorizado, te enviamos un enlace para entrar.";

export async function requestMagicLink(_previous: MagicLinkState, formData: FormData): Promise<MagicLinkState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!EMAIL_PATTERN.test(email)) {
    return { status: "error", message: "Escribe un correo válido." };
  }

  // Only household members may sign in; the response does not reveal who is allowed.
  if (!isEmailAllowed(email, parseAllowedEmails(process.env.ALLOWED_EMAILS))) {
    return { status: "sent", message: SENT_MESSAGE };
  }

  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });

  if (error) {
    return { status: "error", message: "No se pudo enviar el enlace. Intenta de nuevo en un momento." };
  }
  return { status: "sent", message: SENT_MESSAGE };
}
