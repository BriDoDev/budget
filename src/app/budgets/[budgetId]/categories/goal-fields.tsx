"use client";

import { useState } from "react";
import { AmountField } from "@/components/amount-field";
import { inputClass, labelClass } from "@/components/ui";
import type { GoalType } from "@/lib/budget-engine";
import { formatMonthName } from "@/lib/categories";
import { formatMilliunits, parseAmountInput, type CurrencySettings } from "@/lib/money";
import { monthsApart, toMonthKey } from "@/lib/month";

interface GoalFieldsProps {
  goalType: GoalType | null;
  /** Target formatted for an input, e.g. "1500.00". */
  goalTarget: string;
  /** "YYYY-MM" or empty. */
  goalTargetMonth: string;
  cadenceMonths: number;
  needsWholeAmount: boolean;
  /** Day of the month the goal is due; null for the last day. */
  dueDay: number | null;
  /** What the category has available right now, in milliunits; feeds the preview. */
  available: number;
  /** "YYYY-MM" of the current month. */
  currentMonth: string;
  currency: CurrencySettings;
}

/** What the money is for, in the words a person would use; each one maps to a goal type. */
type Purpose = "" | "spend" | "save_monthly" | "save_total";

const PURPOSES: Array<{ value: Purpose; label: string }> = [
  { value: "", label: "Sin meta" },
  { value: "spend", label: "Un gasto que se repite (renta, luz, seguro)" },
  { value: "save_monthly", label: "Ahorrar un monto cada mes" },
  { value: "save_total", label: "Juntar un total" },
];
const REPEAT_OPTIONS = [
  { value: 1, label: "Cada mes" },
  { value: 2, label: "Cada 2 meses" },
  { value: 3, label: "Cada 3 meses" },
  { value: 4, label: "Cada 4 meses" },
  { value: 6, label: "Cada 6 meses" },
  { value: 12, label: "Cada año" },
];
const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

function toPurpose(goalType: GoalType | null): Purpose {
  if (goalType === "needed_spending") return "spend";
  if (goalType === "monthly_funding") return "save_monthly";
  return goalType ? "save_total" : "";
}

/** Goal inputs of the category form, asked as plain questions, with a line that says what the goal will ask for. */
export function GoalFields({
  goalType,
  goalTarget,
  goalTargetMonth,
  cadenceMonths,
  needsWholeAmount,
  dueDay,
  available,
  currentMonth,
  currency,
}: GoalFieldsProps) {
  const [purpose, setPurpose] = useState<Purpose>(toPurpose(goalType));
  const [repeat, setRepeat] = useState(Math.max(1, cadenceMonths));
  const [amount, setAmount] = useState(goalTarget);
  const [month, setMonth] = useState(goalTargetMonth);
  const [day, setDay] = useState(dueDay ? String(dueDay) : "");
  const [countsLeftover, setCountsLeftover] = useState(!needsWholeAmount);

  const isRepeatingLater = purpose === "spend" && repeat > 1;
  const usesMonth = isRepeatingLater || purpose === "save_total";
  const resolvedType: GoalType | "" =
    purpose === "spend"
      ? "needed_spending"
      : purpose === "save_monthly"
        ? "monthly_funding"
        : purpose === "save_total"
          ? month
            ? "target_balance_by_date"
            : "target_balance"
          : "";
  const hasDay = purpose !== "" && resolvedType !== "target_balance";
  const preview = describePreview({
    purpose,
    repeat,
    amount: parseAmountInput(amount) ?? 0,
    month: usesMonth ? month : "",
    day,
    countsLeftover,
    available,
    currentMonth,
    currency,
  });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="goalType" value={resolvedType} />
      <input type="hidden" name="goalRepeat" value={purpose === "spend" ? repeat : 0} />

      <label className={`${labelClass} sm:col-span-2`}>
        ¿Para qué es este dinero?
        <select value={purpose} onChange={(event) => setPurpose(event.target.value as Purpose)} className={inputClass}>
          {PURPOSES.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      {purpose ? (
        <label className={labelClass}>
          {purpose === "save_total" ? "¿Cuánto quieres juntar?" : "¿Cuánto?"}
          <AmountField
            name="goalTarget"
            defaultValue={goalTarget}
            onValueChange={setAmount}
            decimalDigits={currency.decimalDigits}
            required
            placeholder="0.00"
            className={inputClass}
          />
        </label>
      ) : null}

      {purpose === "spend" ? (
        <label className={labelClass}>
          ¿Cada cuánto?
          <select value={repeat} onChange={(event) => setRepeat(Number(event.target.value))} className={inputClass}>
            {REPEAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      ) : null}

      {usesMonth ? (
        <label className={labelClass}>
          {isRepeatingLater ? "¿Qué mes toca el próximo?" : "¿Para qué mes? (opcional)"}
          <input
            type="month"
            name="goalTargetMonth"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            required={isRepeatingLater}
            className={inputClass}
          />
        </label>
      ) : null}

      {hasDay ? (
        <label className={labelClass}>
          ¿Qué día vence?
          <select name="goalDueDay" value={day} onChange={(event) => setDay(event.target.value)} className={inputClass}>
            <option value="">El último día del mes</option>
            {DAYS.map((option) => (
              <option key={option} value={option}>El día {option}</option>
            ))}
          </select>
        </label>
      ) : null}

      {purpose === "spend" ? (
        <label className="flex min-h-11 items-center gap-2.5 text-sm sm:col-span-2">
          <input
            type="checkbox"
            name="goalRefill"
            checked={countsLeftover}
            onChange={(event) => setCountsLeftover(event.target.checked)}
            className="size-[18px]"
          />
          Si sobra del periodo anterior, cuenta para este
        </label>
      ) : null}

      {preview ? (
        <p role="status" className="rounded-[10px] bg-accent-soft px-3.5 py-2.5 text-sm text-accent-strong sm:col-span-2">
          {preview}
        </p>
      ) : null}
    </div>
  );
}

interface PreviewInput {
  purpose: Purpose;
  repeat: number;
  /** Goal amount in milliunits. */
  amount: number;
  /** "YYYY-MM" or empty. */
  month: string;
  day: string;
  countsLeftover: boolean;
  available: number;
  currentMonth: string;
  currency: CurrencySettings;
}

/** One sentence on what the goal will ask for. The monthly figure is an estimate: the budget does the exact math. */
function describePreview({ purpose, repeat, amount, month, day, countsLeftover, available, currentMonth, currency }: PreviewInput): string | null {
  if (!purpose || amount <= 0) {
    return null;
  }
  const money = (value: number) => formatMilliunits(value, currency);
  const byDay = day ? `para el día ${day}` : "para fin de mes";
  const missing = Math.max(0, amount - Math.max(0, available));

  if (purpose === "save_monthly") {
    return `Apartarás ${money(amount)} cada mes, ${byDay}.`;
  }
  if (purpose === "spend" && repeat === 1) {
    const leftover = countsLeftover ? " Lo que sobre de un mes cuenta para el siguiente." : "";
    return `Cada mes necesitarás ${money(amount)}, ${byDay}.${leftover}`;
  }
  if (!month) {
    return purpose === "save_total" ? `Te faltan ${money(missing)}. Sin fecha límite, avanzas a tu ritmo.` : null;
  }

  const monthsLeft = monthsApart(toMonthKey(`${currentMonth}-01`), toMonthKey(`${month}-01`)) + 1;
  if (monthsLeft < 1) {
    return "Ese mes ya pasó: elige uno que venga.";
  }
  if (missing === 0) {
    return `Ya tienes los ${money(amount)} completos para ${formatMonthName(month)}.`;
  }
  return `Te faltan ${money(missing)}: aparta unos ${money(Math.ceil(missing / monthsLeft))} cada mes para tenerlo en ${formatMonthName(month)}.`;
}
