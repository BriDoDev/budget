/**
 * A budget month, always represented by its first day in ISO form: "YYYY-MM-01".
 * Using the first day keeps the key sortable as a plain string and compatible
 * with Postgres `date` columns.
 */
export type MonthKey = string;

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-01$/;
const ISO_DATE_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-\d{2}/;

export function isMonthKey(value: string): value is MonthKey {
  return MONTH_KEY_PATTERN.test(value);
}

/** Converts an ISO date ("YYYY-MM-DD") or month ("YYYY-MM") into its MonthKey. */
export function toMonthKey(isoDate: string): MonthKey {
  const normalized = /^\d{4}-\d{2}$/.test(isoDate) ? `${isoDate}-01` : isoDate;
  const match = ISO_DATE_PATTERN.exec(normalized);
  if (!match) {
    throw new Error(`Invalid ISO date: "${isoDate}"`);
  }
  return `${match[1]}-${match[2]}-01`;
}

export function addMonths(month: MonthKey, count: number): MonthKey {
  const [year, monthIndex] = parseMonth(month);
  const total = year * 12 + monthIndex + count;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
}

/** Inclusive list of months between `start` and `end`. Empty when start > end. */
export function monthRange(start: MonthKey, end: MonthKey): MonthKey[] {
  const months: MonthKey[] = [];
  for (let month = start; month <= end; month = addMonths(month, 1)) {
    months.push(month);
  }
  return months;
}

export function currentMonthKey(now: Date = new Date()): MonthKey {
  return toMonthKey(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
  );
}

export function maxMonth(a: MonthKey, b: MonthKey): MonthKey {
  return a >= b ? a : b;
}

export function minMonth(a: MonthKey, b: MonthKey): MonthKey {
  return a <= b ? a : b;
}

function parseMonth(month: MonthKey): [year: number, monthIndex: number] {
  if (!isMonthKey(month)) {
    throw new Error(`Invalid month key: "${month}"`);
  }
  return [Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1];
}
