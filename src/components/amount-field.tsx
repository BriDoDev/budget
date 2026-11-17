"use client";

import { useEffect, useRef, useState, type ComponentProps, type FocusEvent } from "react";
import { hasArithmetic, milliunitsToInput, parseAmountInput } from "@/lib/money";

const OPERATORS = [
  { symbol: "+", label: "Sumar" },
  { symbol: "−", label: "Restar" },
  { symbol: "×", label: "Multiplicar" },
  { symbol: "÷", label: "Dividir" },
];

interface AmountFieldProps extends Omit<ComponentProps<"input">, "value" | "onChange" | "type"> {
  /** Text to show when something outside the field sets the amount; typing still flows through `onValueChange`. */
  value?: string;
  /** Called with the text of the field every time it changes, including after a calculation. */
  onValueChange?: (value: string) => void;
  decimalDigits?: number;
  /** "floating" hangs the operator keys under the field; "inline" keeps them in the layout. */
  operators?: "floating" | "inline";
  wrapperClassName?: string;
}

/**
 * Amount input that does arithmetic. Phone number pads have no operator keys,
 * so it shows its own while focused: "100" then "+" then "200" leaves 300.00.
 */
export function AmountField({
  value,
  onValueChange,
  decimalDigits = 2,
  operators = "floating",
  wrapperClassName = "",
  onFocus,
  onBlur,
  ...inputProps
}: AmountFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // The field owns its text so operator keys can edit it; an outside value is copied in when it differs.
  useEffect(() => {
    const input = inputRef.current;
    if (input && value !== undefined && input.value !== value) {
      input.value = value;
    }
  }, [value]);

  const setValue = (next: string) => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.value = next;
    input.setSelectionRange(next.length, next.length);
    onValueChange?.(next);
  };

  /** Replaces a calculation with its result; plain numbers and unfinished text stay as typed. */
  const resolve = () => {
    const input = inputRef.current;
    if (!input || !hasArithmetic(input.value)) {
      return;
    }
    const result = parseAmountInput(input.value.replace(/[+\-−×÷*/\s]+$/, ""));
    if (result !== null) {
      setValue(milliunitsToInput(result, decimalDigits));
    }
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    resolve();
    setIsFocused(false);
    onBlur?.(event);
  };

  const keys = (
    <span
      role="group"
      aria-label="Operaciones"
      className={
        operators === "inline"
          ? "flex justify-center gap-2"
          : "absolute top-full right-0 z-20 mt-1 flex gap-1 rounded-xl border border-line bg-surface p-1 shadow-lg"
      }
    >
      {[...OPERATORS, { symbol: "=", label: "Calcular" }].map((operator) => (
        <button
          key={operator.symbol}
          type="button"
          tabIndex={-1}
          aria-label={operator.label}
          // Keep the focus (and the phone keyboard) on the field while the key is pressed.
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (operator.symbol === "=") {
              resolve();
            } else {
              const base = (inputRef.current?.value ?? "").replace(/[+\-−×÷*/\s]+$/, "");
              // An operator needs a number before it; only a minus may open the amount.
              if (base !== "" || operator.symbol === "−") {
                setValue(`${base}${operator.symbol}`);
              }
            }
            inputRef.current?.focus();
          }}
          className="flex size-10 cursor-pointer items-center justify-center rounded-lg bg-subtle text-lg font-semibold text-ink hover:bg-neutral-soft active:bg-line"
        >
          {operator.symbol}
        </button>
      ))}
    </span>
  );

  return (
    <span className={`relative ${operators === "inline" ? "flex flex-col gap-3" : "block"} ${wrapperClassName}`}>
      <input
        {...inputProps}
        ref={inputRef}
        inputMode="decimal"
        autoComplete="off"
        onChange={(event) => onValueChange?.(event.target.value)}
        onFocus={(event) => {
          setIsFocused(true);
          onFocus?.(event);
        }}
        onBlur={handleBlur}
      />
      {operators === "inline" || isFocused ? keys : null}
    </span>
  );
}
