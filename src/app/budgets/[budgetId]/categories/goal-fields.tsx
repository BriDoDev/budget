"use client";

import { useState } from "react";
import { inputClass, labelClass } from "@/components/ui";
import type { GoalType } from "@/lib/budget-engine";
import { GOAL_TYPE_LABELS } from "@/lib/categories";

interface GoalFieldsProps {
  goalType: GoalType | null;
  /** Target formatted for an input, e.g. "1500.00". */
  goalTarget: string;
  /** "YYYY-MM" or empty. */
  goalTargetMonth: string;
  cadenceMonths: number;
  needsWholeAmount: boolean;
}

const REPEAT_OPTIONS = [
  { value: 1, label: "Cada mes" },
  { value: 2, label: "Cada 2 meses" },
  { value: 3, label: "Cada 3 meses" },
  { value: 4, label: "Cada 4 meses" },
  { value: 6, label: "Cada 6 meses" },
  { value: 12, label: "Cada año" },
];

/** Goal inputs of the category form; shows only the fields the chosen goal type uses. */
export function GoalFields({ goalType, goalTarget, goalTargetMonth, cadenceMonths, needsWholeAmount }: GoalFieldsProps) {
  const [type, setType] = useState<GoalType | "">(goalType ?? "");
  const [repeat, setRepeat] = useState(Math.max(1, cadenceMonths));
  const needsMonth = type === "target_balance_by_date" || (type === "needed_spending" && repeat > 1);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={labelClass}>
        Meta
        <select name="goalType" value={type} onChange={(event) => setType(event.target.value as GoalType | "")} className={inputClass}>
          <option value="">Sin meta</option>
          {Object.entries(GOAL_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      {type ? (
        <label className={labelClass}>
          Monto de la meta
          <input name="goalTarget" inputMode="decimal" defaultValue={goalTarget} required placeholder="0.00" className={inputClass} />
        </label>
      ) : null}
      {type === "needed_spending" ? (
        <label className={labelClass}>
          Se repite
          <select name="goalRepeat" value={repeat} onChange={(event) => setRepeat(Number(event.target.value))} className={inputClass}>
            {REPEAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      ) : null}
      {needsMonth ? (
        <label className={labelClass}>
          {type === "needed_spending" ? "Próximo vencimiento" : "Para cuándo"}
          <input type="month" name="goalTargetMonth" defaultValue={goalTargetMonth} required className={inputClass} />
        </label>
      ) : null}
      {type === "needed_spending" ? (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="goalRefill" defaultChecked={!needsWholeAmount} />
          Contar lo que ya había disponible (solo rellenar lo que falte)
        </label>
      ) : null}
    </div>
  );
}
