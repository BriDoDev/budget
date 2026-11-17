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
  const cleaned = (raw ?? "").replace(/[\s$,]/g, "").replace(/−/g, "-");
  if (AMOUNT_INPUT_PATTERN.test(cleaned)) {
    return unitsToMilliunits(Number(cleaned));
  }
  const result = evaluateArithmetic(cleaned);
  return result === null ? null : unitsToMilliunits(result);
}

/** True when the text is a calculation ("100+200") rather than a plain number. */
export function hasArithmetic(raw: string): boolean {
  return /[+*/×÷x]|.[-−]/i.test(raw.trim());
}

const ARITHMETIC_PATTERN = /^-?(\d+\.?\d*|\.\d+)([+\-*/](\d+\.?\d*|\.\d+))+$/;

/**
 * Evaluates sums like "100+200" or "1200/12-50" so nobody has to do the math
 * before typing an amount. Multiplication and division bind tighter; there are
 * no parentheses. Returns null for anything else, including dividing by zero.
 */
function evaluateArithmetic(text: string): number | null {
  const expression = text.replace(/[×x]/gi, "*").replace(/÷/g, "/").replace(/−/g, "-");
  if (!ARITHMETIC_PATTERN.test(expression)) {
    return null;
  }
  const tokens = expression.match(/(^-)?(\d+\.?\d*|\.\d+)|[+\-*/]/g) ?? [];
  const terms: number[] = [Number(tokens[0])];
  for (let index = 1; index < tokens.length; index += 2) {
    const operator = tokens[index];
    const value = Number(tokens[index + 1]);
    if (operator === "*") {
      terms[terms.length - 1] *= value;
    } else if (operator === "/") {
      if (value === 0) {
        return null;
      }
      terms[terms.length - 1] /= value;
    } else {
      terms.push(operator === "-" ? -value : value);
    }
  }
  const total = terms.reduce((sum, term) => sum + term, 0);
  return Number.isFinite(total) ? total : null;
}
