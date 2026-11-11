import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Completes a magic-link sign in (token hash or PKCE code) and lands on a relative path. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = toSafeRelativePath(searchParams.get("next"));

  const supabase = await createClient();
  let failed = true;
  if (tokenHash && type) {
    failed = Boolean((await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error);
  } else if (code) {
    failed = Boolean((await supabase.auth.exchangeCodeForSession(code)).error);
  }

  if (!failed) {
    // Joins the households that invited this e-mail before it had an account.
    await supabase.rpc("accept_household_invites");
  }

  const destination = request.nextUrl.clone();
  destination.search = "";
  destination.pathname = failed ? "/login" : next;
  return NextResponse.redirect(destination);
}

function toSafeRelativePath(path: string | null): string {
  return path && path.startsWith("/") && !path.startsWith("//") ? path : "/";
}
