"use client";

import { useState, type ReactNode } from "react";
import { formatMilliunits, type CurrencySettings } from "@/lib/money";
import type { CategorySpending, MonthCashflow, MonthNetWorth } from "@/lib/reports";

const GRID_STEPS = [0, 0.5, 1];
const TOOLTIP_FLIP_THRESHOLD = 0.6;

function compactAmount(amount: number, currency: CurrencySettings): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency.isoCode,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount / 1000);
}

function shortMonth(month: string): string {
  return new Intl.DateTimeFormat("es-MX", { month: "short", timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`));
}

function longMonth(month: string): string {
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}T00:00:00Z`),
  );
}

/** Floating readout anchored at a horizontal position (0-1) of the plot; flips side near the right edge. */
function Tooltip({ position, title, children }: { position: number; title: string; children: ReactNode }) {
  const flips = position > TOOLTIP_FLIP_THRESHOLD;
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 min-w-40 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs shadow-md dark:border-neutral-700 dark:bg-neutral-900"
      style={flips ? { right: `${(1 - position) * 100 + 2}%` } : { left: `${position * 100 + 2}%` }}
    >
      <p className="mb-1 text-neutral-500 capitalize">{title}</p>
      {children}
    </div>
  );
}

function TooltipRow({ label, value, seriesClass }: { label: string; value: string; seriesClass?: string }) {
  return (
    <p className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
        {seriesClass ? <span className={`inline-block h-0.5 w-3 rounded ${seriesClass}`} /> : null}
        {label}
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </p>
  );
}

function YAxis({ max, min = 0, currency }: { max: number; min?: number; currency: CurrencySettings }) {
  return (
    <>
      {GRID_STEPS.map((step) => (
        <div key={step} className="absolute inset-x-0 border-t border-neutral-200 dark:border-neutral-800" style={{ bottom: `${step * 100}%` }}>
          <span className="absolute -top-2 right-full pr-2 text-[11px] whitespace-nowrap text-neutral-500 tabular-nums">
            {compactAmount(min + (max - min) * step, currency)}
          </span>
        </div>
      ))}
    </>
  );
}

/** Ranked horizontal bars: one series, so the title names it and no legend is needed. */
export function SpendingBars({ items, currency }: { items: CategorySpending[]; currency: CurrencySettings }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...items.map((item) => item.total), 1);
  const total = items.reduce((sum, item) => sum + item.total, 0);

  return (
    <ul className="flex flex-col" onPointerLeave={() => setActive(null)}>
      {items.map((item, index) => (
        <li
          key={item.categoryId}
          tabIndex={0}
          onPointerEnter={() => setActive(index)}
          onFocus={() => setActive(index)}
          onBlur={() => setActive(null)}
          className={`grid grid-cols-[minmax(6rem,11rem)_1fr_auto] items-center gap-3 rounded px-1 py-1.5 text-sm outline-none ${active === index ? "bg-neutral-100 dark:bg-neutral-900" : ""}`}
        >
          <span className="truncate" title={item.groupName}>{item.name}</span>
          <span className="block h-3">
            <span
              className="block h-full rounded-r bg-(--viz-series-1)"
              style={{ width: `${Math.max(0.5, (item.total / max) * 100)}%`, opacity: active === null || active === index ? 1 : 0.55 }}
            />
          </span>
          <span className="text-right tabular-nums">
            {formatMilliunits(item.total, currency)}
            {active === index ? (
              <span className="ml-2 text-xs text-neutral-500">{Math.round((item.total / total) * 100)}% del total</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Grouped bars per month for two series, with a legend and a per-month readout. */
export function CashflowBars({ months, currency }: { months: MonthCashflow[]; currency: CurrencySettings }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...months.flatMap((month) => [month.income, month.expenses]), 1);
  const activeMonth = active === null ? null : months[active];

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex gap-4 text-xs text-neutral-600 dark:text-neutral-400">
        <li className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-(--viz-series-1)" />Ingresos</li>
        <li className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-(--viz-series-2)" />Gastos</li>
      </ul>
      <div className="relative ml-14 h-44" onPointerLeave={() => setActive(null)}>
        <YAxis max={max} currency={currency} />
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
          {months.map((month, index) => (
            <div
              key={month.month}
              tabIndex={0}
              aria-label={`${longMonth(month.month)}: ingresos ${formatMilliunits(month.income, currency)}, gastos ${formatMilliunits(month.expenses, currency)}`}
              onPointerEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              className={`flex items-end justify-center gap-0.5 px-1 outline-none ${active === index ? "bg-neutral-100/70 dark:bg-neutral-800/60" : ""}`}
            >
              <span className="block w-full max-w-5 rounded-t bg-(--viz-series-1)" style={{ height: `${(Math.max(0, month.income) / max) * 100}%` }} />
              <span className="block w-full max-w-5 rounded-t bg-(--viz-series-2)" style={{ height: `${(Math.max(0, month.expenses) / max) * 100}%` }} />
            </div>
          ))}
        </div>
        {activeMonth && active !== null ? (
          <Tooltip position={(active + 0.5) / months.length} title={longMonth(activeMonth.month)}>
            <TooltipRow label="Ingresos" value={formatMilliunits(activeMonth.income, currency)} seriesClass="bg-(--viz-series-1)" />
            <TooltipRow label="Gastos" value={formatMilliunits(activeMonth.expenses, currency)} seriesClass="bg-(--viz-series-2)" />
            <TooltipRow label="Diferencia" value={formatMilliunits(activeMonth.net, currency)} />
          </Tooltip>
        ) : null}
      </div>
      <MonthAxis months={months.map((month) => month.month)} />
    </div>
  );
}

/** Single-series line with a crosshair that snaps to the nearest month. */
export function NetWorthLine({ months, currency }: { months: MonthNetWorth[]; currency: CurrencySettings }) {
  const [active, setActive] = useState<number | null>(null);
  const values = months.map((month) => month.netWorth);
  const min = Math.min(0, ...values);
  const max = Math.max(...values, min + 1);
  const xOf = (index: number) => (months.length === 1 ? 0.5 : index / (months.length - 1));
  const yOf = (value: number) => (value - min) / (max - min);
  const path = months.map((month, index) => `${index === 0 ? "M" : "L"}${xOf(index) * 100},${(1 - yOf(month.netWorth)) * 100}`).join(" ");
  const activeMonth = active === null ? null : months[active];

  const snapToPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    setActive(Math.round(ratio * (months.length - 1)));
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative mr-3 ml-14 h-44 outline-none"
        tabIndex={0}
        aria-label="Patrimonio por mes. Usa las flechas izquierda y derecha para recorrer los meses."
        onPointerMove={snapToPointer}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            const step = event.key === "ArrowRight" ? 1 : -1;
            setActive((current) => Math.min(months.length - 1, Math.max(0, (current ?? (step > 0 ? -1 : months.length)) + step)));
          }
        }}
      >
        <YAxis max={max} min={min} currency={currency} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
          <path d={path} fill="none" stroke="var(--viz-series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {activeMonth && active !== null ? (
          <>
            <div className="absolute inset-y-0 w-px bg-neutral-400 dark:bg-neutral-600" style={{ left: `${xOf(active) * 100}%` }} />
            <div
              className="absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-(--viz-series-1) ring-2 ring-(--background)"
              style={{ left: `${xOf(active) * 100}%`, bottom: `${yOf(activeMonth.netWorth) * 100}%` }}
            />
            <Tooltip position={xOf(active)} title={longMonth(activeMonth.month)}>
              <TooltipRow label="Patrimonio" value={formatMilliunits(activeMonth.netWorth, currency)} seriesClass="bg-(--viz-series-1)" />
              <TooltipRow label="Lo que tienes" value={formatMilliunits(activeMonth.assets, currency)} />
              <TooltipRow label="Lo que debes" value={formatMilliunits(activeMonth.debts, currency)} />
            </Tooltip>
          </>
        ) : null}
      </div>
      <MonthAxis months={months.map((month) => month.month)} isEdgeAligned />
    </div>
  );
}

function MonthAxis({ months, isEdgeAligned = false }: { months: string[]; isEdgeAligned?: boolean }) {
  return (
    <div
      className={`ml-14 text-[11px] text-neutral-500 ${isEdgeAligned ? "mr-3 flex justify-between" : "grid"}`}
      style={isEdgeAligned ? undefined : { gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
    >
      {months.map((month) => (
        <span key={month} className="text-center">{shortMonth(month)}</span>
      ))}
    </div>
  );
}
