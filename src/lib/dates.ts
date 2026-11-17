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

/**
 * "15 nov" for a day of a month, with the year when it is not `referenceMonth`'s.
 * Without a day, or with one the month does not have, it is the month's last day.
 */
export function formatDueDate(month: string, referenceMonth: string, day: number | null = null): string {
  const [year, monthNumber] = month.slice(0, 7).split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const label = new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: month.slice(0, 4) === referenceMonth.slice(0, 4) ? undefined : "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, Math.min(day ?? lastDay, lastDay))));
  return label.replace(/\./g, "");
}

/** "noviembre" from a month key. */
export function formatMonthWord(month: string): string {
  return new Intl.DateTimeFormat(LOCALE, { month: "long", timeZone: "UTC" }).format(
    new Date(`${month.slice(0, 7)}-01T00:00:00Z`),
  );
}

/** "Hoy", "Ayer" or "Viernes 13 de noviembre" for an ISO date; used to head a day of transactions. */
export function formatDayTitle(isoDate: string, todayIsoDate: string): string {
  const day = isoDate.slice(0, 10);
  if (day === todayIsoDate) {
    return "Hoy";
  }
  const date = new Date(`${day}T00:00:00Z`);
  const today = new Date(`${todayIsoDate}T00:00:00Z`);
  if (today.getTime() - date.getTime() === 24 * 60 * 60 * 1000) {
    return "Ayer";
  }
  const label = new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: date.getUTCFullYear() === today.getUTCFullYear() ? undefined : "numeric",
    timeZone: "UTC",
  })
    .format(date)
    .replace(",", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
