const LOCALE = "es-MX";

/** "11 nov" for dates in the current year, "11 nov 2025" otherwise. Takes an ISO date ("YYYY-MM-DD"). */
export function formatShortDate(isoDate: string, now: Date = new Date()): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  const isCurrentYear = date.getUTCFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: isCurrentYear ? undefined : "numeric",
    timeZone: "UTC",
  })
    .format(date)
    .replace(".", "");
}

/** "Noviembre de 2026" from a month key or any ISO date in that month. */
export function formatMonthTitle(month: string): string {
  const label = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month.slice(0, 7)}-01T00:00:00Z`),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "noviembre" from a month key. */
export function formatMonthWord(month: string): string {
  return new Intl.DateTimeFormat(LOCALE, { month: "long", timeZone: "UTC" }).format(
    new Date(`${month.slice(0, 7)}-01T00:00:00Z`),
  );
}
