"use client";

import { useState, type ReactNode } from "react";
import { formatMilliunits, type CurrencySettings } from "@/lib/money";
import type { CategorySpending, MonthCashflow, MonthNetWorth } from "@/lib/reports";

const GRID_STEPS = [0, 0.5, 1];
const TOOLTIP_FLIP_THRESHOLD = 0.6;
/** Above this many months, labels on every mark would collide, so only the hover readout shows values. */
const MAX_DIRECT_LABELS = 6;
/** Headroom above the tallest bar so its label fits inside the plot. */
const AXIS_HEADROOM = 1.12;

const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/** Rounds an axis maximum up to a round number so the gridline labels read cleanly. */
function niceCeiling(value: number): number {
  if (value <= 0) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = NICE_STEPS.find((candidate) => candidate >= value / magnitude) ?? 10;
  return step * magnitude;
}

function compactAmount(amount: number, currency: CurrencySettings): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency.isoCode,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount / 1000);
}

function monthLabel(month: string, format: "short" | "long"): string {
  const label = new Intl.DateTimeFormat("es-MX", { month: format, timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`));
  return format === "long" ? label.charAt(0).toUpperCase() + label.slice(1) : label.replace(".", "");
}

function monthWithYear(month: string): string {
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
      className="pointer-events-none absolute top-0 z-10 min-w-44 rounded-[10px] border border-line bg-surface px-3 py-2 text-xs shadow-md"
      style={flips ? { right: `${(1 - position) * 100 + 2}%` } : { left: `${position * 100 + 2}%` }}
    >
      <p className="mb-1 text-muted first-letter:uppercase">{title}</p>
      {children}
    </div>
  );
}

function TooltipRow({ label, value, seriesClass }: { label: string; value: string; seriesClass?: string }) {
  return (
    <p className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted">
        {seriesClass ? <span className={`inline-block h-0.5 w-3 rounded ${seriesClass}`} /> : null}
        {label}
      </span>
      <span className="font-semibold text-ink tabular-nums">{value}</span>
    </p>
  );
}

function YAxis({ max, min = 0, currency }: { max: number; min?: number; currency: CurrencySettings }) {
  return (
    <>
      {GRID_STEPS.map((step) => (
        <div key={step} className={`absolute inset-x-0 border-t ${step === 0 ? "border-line-strong" : "border-hairline"}`} style={{ bottom: `${step * 100}%` }}>
          <span className="absolute -top-2 right-full pr-2 text-xs whitespace-nowrap text-muted tabular-nums">
            {compactAmount(min + (max - min) * step, currency)}
          </span>
        </div>
      ))}
    </>
  );
}

function MonthAxis({ months, isEdgeAligned = false }: { months: string[]; isEdgeAligned?: boolean }) {
  const format = months.length <= MAX_DIRECT_LABELS ? "long" : "short";
  return (
    <div
      className={`ml-12 text-xs text-muted ${isEdgeAligned ? "mr-7 flex justify-between" : "grid"}`}
      style={isEdgeAligned ? undefined : { gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
    >
      {months.map((month) => (
        <span key={month} className="text-center">
          {/* Full month names collide on a phone, so it always gets the short form. */}
          <span className="sm:hidden">{monthLabel(month, "short")}</span>
          <span className="hidden sm:inline">{monthLabel(month, format)}</span>
        </span>
      ))}
    </div>
  );
}

/** Ranked horizontal bars. One series, so the card title names it and no legend is needed. */
export function SpendingBars({ items, currency }: { items: CategorySpending[]; currency: CurrencySettings }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...items.map((item) => item.total), 1);
  const total = items.reduce((sum, item) => sum + item.total, 0) || 1;

  return (
    <ul className="flex flex-col gap-1.5" onPointerLeave={() => setActive(null)}>
      {items.map((item, index) => (
        <li
          key={item.categoryId}
          tabIndex={0}
          title={item.groupName || undefined}
          onPointerEnter={() => setActive(index)}
          onFocus={() => setActive(index)}
          onBlur={() => setActive(null)}
          className={`grid grid-cols-[minmax(5.5rem,8rem)_1fr_auto] items-center gap-3 rounded-lg px-1.5 py-1.5 text-sm outline-none ${active === index ? "bg-subtle" : ""}`}
        >
          <span className="truncate font-medium">{item.name}</span>
          <span className="block h-3.5">
            <span
              className="block h-full rounded-r bg-(--viz-series-1)"
              style={{ width: `${Math.max(0.5, (item.total / max) * 100)}%`, opacity: active === null || active === index ? 1 : 0.5 }}
            />
          </span>
          <span className="text-right tabular-nums">
            <span className="font-semibold">{formatMilliunits(item.total, currency)}</span>{" "}
            <span className="text-muted">{Math.round((item.total / total) * 100)}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Grouped bars per month for two series, with a legend and a per-month readout. */
export function CashflowBars({ months, currency }: { months: MonthCashflow[]; currency: CurrencySettings }) {
  const [active, setActive] = useState<number | null>(null);
  const axisMax = niceCeiling(Math.max(...months.flatMap((month) => [month.income, month.expenses]), 1) * AXIS_HEADROOM);
  const showLabels = months.length <= MAX_DIRECT_LABELS;
  const activeMonth = active === null ? null : months[active];

  const bar = (value: number, seriesClass: string) => (
    <span className="flex h-full w-full max-w-11 flex-col items-center justify-end gap-1">
      {showLabels && value > 0 ? <span className="text-xs font-semibold whitespace-nowrap">{compactAmount(value, currency)}</span> : null}
      <span className={`block w-full max-w-7 rounded-t ${seriesClass}`} style={{ height: `${(Math.max(0, value) / axisMax) * 100}%` }} />
    </span>
  );

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex gap-4 text-[13px] text-ink-soft">
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block size-3 rounded-[3px] bg-(--viz-series-1)" />Ingresos</li>
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block size-3 rounded-[3px] bg-(--viz-series-2)" />Gastos</li>
      </ul>
      <div className="relative ml-12 h-52" onPointerLeave={() => setActive(null)}>
        <YAxis max={axisMax} currency={currency} />
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
          {months.map((month, index) => {
            const isEmpty = month.income === 0 && month.expenses === 0;
            return (
              <div
                key={month.month}
                tabIndex={0}
                aria-label={`${monthWithYear(month.month)}: ingresos ${formatMilliunits(month.income, currency)}, gastos ${formatMilliunits(month.expenses, currency)}`}
                onPointerEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                className={`flex items-end justify-center gap-0.5 px-1 outline-none ${active === index ? "bg-subtle/80" : ""}`}
              >
                {isEmpty ? (
                  showLabels ? <span className="pb-2 text-xs text-muted max-sm:hidden">Sin movimientos</span> : null
                ) : (
                  <>
                    {bar(month.income, "bg-(--viz-series-1)")}
                    {bar(month.expenses, "bg-(--viz-series-2)")}
                  </>
                )}
              </div>
            );
          })}
        </div>
        {activeMonth && active !== null ? (
          <Tooltip position={(active + 0.5) / months.length} title={monthWithYear(activeMonth.month)}>
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
  const highest = Math.max(...values, min + 1);
  const max = min < 0 ? highest : niceCeiling(highest * AXIS_HEADROOM);
  const xOf = (index: number) => (months.length === 1 ? 0.5 : index / (months.length - 1));
  const yOf = (value: number) => (value - min) / (max - min);
  const path = months.map((month, index) => `${index === 0 ? "M" : "L"}${xOf(index) * 100},${(1 - yOf(month.netWorth)) * 100}`).join(" ");
  const showMarkers = months.length <= MAX_DIRECT_LABELS * 2;
  const lastIndex = months.length - 1;
  const activeMonth = active === null ? null : months[active];

  const snapToPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    setActive(Math.round(ratio * (months.length - 1)));
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative mr-7 ml-12 h-52 outline-none"
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
        {showMarkers
          ? months.map((month, index) => (
              <span
                key={month.month}
                aria-hidden="true"
                className="absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-(--viz-series-1) ring-2 ring-surface"
                style={{ left: `${xOf(index) * 100}%`, bottom: `${yOf(month.netWorth) * 100}%` }}
              />
            ))
          : null}
        {active === null && months.length > 0 ? (
          <span
            className="absolute -translate-y-3 translate-x-3 text-xs font-semibold whitespace-nowrap"
            style={{ right: 0, bottom: `${yOf(months[lastIndex].netWorth) * 100}%` }}
          >
            {formatMilliunits(months[lastIndex].netWorth, currency)}
          </span>
        ) : null}
        {activeMonth && active !== null ? (
          <>
            <div className="absolute inset-y-0 w-px bg-line-strong" style={{ left: `${xOf(active) * 100}%` }} />
            <Tooltip position={xOf(active)} title={monthWithYear(activeMonth.month)}>
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
