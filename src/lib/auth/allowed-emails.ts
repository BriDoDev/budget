/** Parses a comma separated list of e-mails into a normalized set. */
export function parseAllowedEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => normalizeEmail(email))
      .filter((email) => email.length > 0),
  );
}

export function isEmailAllowed(email: string, allowed: ReadonlySet<string>): boolean {
  return allowed.has(normalizeEmail(email));
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
