"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatMilliunits, MILLIUNITS_PER_UNIT, type CurrencySettings } from "@/lib/money";

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 3;
/** Step sizes in currency units; the wheel uses the smallest that keeps it short enough to spin. */
const STEPS = [10, 50, 100, 500, 1000, 5000];
const MAX_ITEMS = 240;

interface AmountWheelProps {
  /** Selected amount in milliunits. */
  value: number;
  /** Largest amount the wheel offers, in milliunits. */
  max: number;
  currency: CurrencySettings;
  onValueChange: (value: number) => void;
  label: string;
}

/** Amounts from zero to `max` in round steps, always including `max` and `pinned`. */
export function wheelValues(max: number, pinned: number): number[] {
  const step = (STEPS.find((candidate) => max / (candidate * MILLIUNITS_PER_UNIT) <= MAX_ITEMS) ?? STEPS[STEPS.length - 1]) * MILLIUNITS_PER_UNIT;
  const values = new Set<number>([max]);
  for (let amount = 0; amount < max; amount += step) {
    values.add(amount);
  }
  if (pinned >= 0 && pinned <= max) {
    values.add(pinned);
  }
  return [...values].sort((a, b) => a - b);
}

/**
 * Wheel picker for an amount, like the date wheels on a phone: spin it and the
 * amount in the middle is the choice. It only offers what there is to give.
 */
export function AmountWheel({ value, max, currency, onValueChange, label }: AmountWheelProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  // The starting value stays on the wheel even when it is not a round step.
  const [pinned] = useState(value);
  const values = useMemo(() => wheelValues(max, pinned), [max, pinned]);
  const selectedIndex = Math.max(0, values.indexOf(value));

  // Follow changes made elsewhere (typing in the field) without fighting a spin in progress.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const index = values.indexOf(value);
    if (scroller && index >= 0 && Math.round(scroller.scrollTop / ITEM_HEIGHT) !== index) {
      scroller.scrollTop = index * ITEM_HEIGHT;
    }
  }, [value, values]);

  const handleScroll = () => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const scroller = scrollerRef.current;
      if (!scroller) {
        return;
      }
      const next = values[Math.min(values.length - 1, Math.max(0, Math.round(scroller.scrollTop / ITEM_HEIGHT)))];
      if (next !== undefined && next !== value) {
        onValueChange(next);
      }
    });
  };

  return (
    <div className="relative rounded-[14px] border border-line bg-subtle">
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-2 top-1/2 h-11 -translate-y-1/2 rounded-[10px] border border-accent/40 bg-surface" />
      <div
        ref={scrollerRef}
        role="listbox"
        aria-label={label}
        tabIndex={0}
        onScroll={handleScroll}
        style={{ height: ITEM_HEIGHT * VISIBLE_ITEMS, paddingBlock: ITEM_HEIGHT }}
        className="relative snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {values.map((amount, index) => (
          <button
            key={amount}
            type="button"
            role="option"
            aria-selected={index === selectedIndex}
            tabIndex={-1}
            onClick={() => scrollerRef.current?.scrollTo({ top: index * ITEM_HEIGHT, behavior: "smooth" })}
            style={{ height: ITEM_HEIGHT }}
            className={`flex w-full cursor-pointer snap-center items-center justify-center tabular-nums ${
              index === selectedIndex ? "font-display text-xl font-semibold text-ink" : "text-base text-muted"
            }`}
          >
            {formatMilliunits(amount, currency)}
          </button>
        ))}
      </div>
    </div>
  );
}
