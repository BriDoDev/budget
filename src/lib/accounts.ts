export interface AccountTypeInfo {
  value: string;
  label: string;
  /** Budget accounts feed categories; tracking accounts only count towards net worth. */
  onBudget: boolean;
  /** Balances of liabilities are entered as what is owed. */
  isLiability: boolean;
}

export const ACCOUNT_TYPES: AccountTypeInfo[] = [
  { value: "checking", label: "Débito / cheques", onBudget: true, isLiability: false },
  { value: "savings", label: "Ahorro", onBudget: true, isLiability: false },
  { value: "cash", label: "Efectivo", onBudget: true, isLiability: false },
  { value: "creditCard", label: "Tarjeta de crédito", onBudget: true, isLiability: true },
  { value: "lineOfCredit", label: "Línea de crédito", onBudget: true, isLiability: true },
  { value: "otherAsset", label: "Inversión u otro activo (seguimiento)", onBudget: false, isLiability: false },
  { value: "otherLiability", label: "Préstamo u otra deuda (seguimiento)", onBudget: false, isLiability: true },
];

export function findAccountType(value: string): AccountTypeInfo | undefined {
  return ACCOUNT_TYPES.find((type) => type.value === value);
}

export function accountTypeLabel(value: string): string {
  return findAccountType(value)?.label ?? value;
}
