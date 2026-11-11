/** Repeat frequencies of scheduled transactions (same identifiers as the YNAB API). */
export const FREQUENCIES = [
  "never",
  "daily",
  "weekly",
  "everyOtherWeek",
  "twiceAMonth",
  "every4Weeks",
  "monthly",
  "everyOtherMonth",
  "every3Months",
  "every4Months",
  "twiceAYear",
  "yearly",
  "everyOtherYear",
] as const;

export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  never: "Una sola vez",
  daily: "Diario",
  weekly: "Semanal",
  everyOtherWeek: "Cada 2 semanas",
  twiceAMonth: "Dos veces al mes",
  every4Weeks: "Cada 4 semanas",
  monthly: "Mensual",
  everyOtherMonth: "Cada 2 meses",
  every3Months: "Cada 3 meses",
  every4Months: "Cada 4 meses",
  twiceAYear: "Dos veces al año",
  yearly: "Anual",
  everyOtherYear: "Cada 2 años",
};

const DAY_STEPS: Partial<Record<Frequency, number>> = { daily: 1, weekly: 7, everyOtherWeek: 14, every4Weeks: 28 };
const MONTH_STEPS: Partial<Record<Frequency, number>> = {
  monthly: 1,
  everyOtherMonth: 2,
  every3Months: 3,
  every4Months: 4,
  twiceAYear: 6,
  yearly: 12,
  everyOtherYear: 24,
};
const HALF_MONTH_DAYS = 15;

export function isFrequency(value: string): value is Frequency {
  return (FREQUENCIES as readonly string[]).includes(value);
}

/**
 * Date of the occurrence after `date` (ISO "YYYY-MM-DD"), or null when the
 * schedule does not repeat. Month-based frequencies keep the day of `anchorDate`
 * (the first occurrence), clamped to the length of the month, so a schedule on
 * the 31st does not drift after February. "twiceAMonth" alternates between the
 * anchor day and 15 days later.
 */
export function nextOccurrence(date: string, frequency: Frequency, anchorDate: string = date): string | null {
  if (frequency === "never") {
    return null;
  }
  const [year, month, day] = parseIsoDate(date);
  const anchorDay = parseIsoDate(anchorDate)[2];

  const dayStep = DAY_STEPS[frequency];
  if (dayStep) {
    return formatUtc(new Date(Date.UTC(year, month - 1, day + dayStep)));
  }

  if (frequency === "twiceAMonth") {
    const firstDay = anchorDay > HALF_MONTH_DAYS ? anchorDay - HALF_MONTH_DAYS : anchorDay;
    const secondDay = firstDay + HALF_MONTH_DAYS;
    return day < clampDay(year, month, secondDay) && day >= firstDay
      ? isoDate(year, month, clampDay(year, month, secondDay))
      : day < firstDay
        ? isoDate(year, month, firstDay)
        : shiftMonths(year, month, 1, firstDay);
  }

  return shiftMonths(year, month, MONTH_STEPS[frequency] ?? 1, anchorDay);
}

function shiftMonths(year: number, month: number, count: number, day: number): string {
  const total = year * 12 + (month - 1) + count;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return isoDate(nextYear, nextMonth, clampDay(nextYear, nextMonth, day));
}

function clampDay(year: number, month: number, day: number): number {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.min(day, daysInMonth);
}

function parseIsoDate(date: string): [year: number, month: number, day: number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error(`Invalid ISO date: "${date}"`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatUtc(date: Date): string {
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}
