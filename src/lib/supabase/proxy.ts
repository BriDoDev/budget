import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "./env";

const PUBLIC_PATH_PREFIXES = ["/login", "/auth"];

/**
 * Refreshes the Supabase session on every request and redirects anonymous
 * visitors to /login. This is an optimistic check; data access is still
 * enforced by row level security.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { url, publishableKey } = getSupabasePublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [header, value] of Object.entries(headers ?? {})) {
          response.headers.set(header, value);
        }
      },
    },
  });

  // Keep getClaims() right after creating the client: it validates and refreshes the session.
  const { data } = await supabase.auth.getClaims();
  const isPublicPath = PUBLIC_PATH_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix));

  if (!data?.claims && !isPublicPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const redirect = NextResponse.redirect(loginUrl);
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  return response;
}
