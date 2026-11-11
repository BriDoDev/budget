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
