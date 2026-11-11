import { formatMilliunits, type CurrencySettings } from "@/lib/money";

interface MoneyProps {
  amount: number;
  currency: CurrencySettings;
  className?: string;
}

export function Money({ amount, currency, className = "" }: MoneyProps) {
  return <span className={`tabular-nums ${className}`}>{formatMilliunits(amount, currency)}</span>;
}
