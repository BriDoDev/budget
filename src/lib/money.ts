/**
 * Amounts are stored as integer milliunits (1 currency unit = 1000 milliunits),
 * the same convention used by YNAB. Integers avoid floating point drift when
 * summing thousands of transactions.
 */
export const MILLIUNITS_PER_UNIT = 1000;

export interface CurrencySettings {
  isoCode: string;
  decimalDigits: number;
}

const AMOUNT_INPUT_PATTERN = /^-?(\d+\.?\d*|\.\d+)$/;

export function milliunitsToUnits(amount: number): number {
  return amount / MILLIUNITS_PER_UNIT;
}

export function unitsToMilliunits(amount: number): number {
  return Math.round(amount * MILLIUNITS_PER_UNIT);
}

export function formatMilliunits(
  amount: number,
  currency: CurrencySettings,
  locale = "es-MX",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.isoCode,
    minimumFractionDigits: currency.decimalDigits,
    maximumFractionDigits: currency.decimalDigits,
  }).format(milliunitsToUnits(amount));
}

/** Plain decimal text for form inputs, e.g. 1500500 → "1500.50". */
export function milliunitsToInput(amount: number, decimalDigits = 2): string {
  return milliunitsToUnits(amount).toFixed(decimalDigits);
}

/**
 * Parses what a person types in an amount field ("1,500.50", "$ 80", "-12.5")
 * into milliunits. Returns null when the text is not a number.
 */
export function parseAmountInput(raw: string | null | undefined): number | null {
  const cleaned = (raw ?? "").replace(/[\s$,]/g, "");
  if (!AMOUNT_INPUT_PATTERN.test(cleaned)) {
    return null;
  }
  return unitsToMilliunits(Number(cleaned));
}
