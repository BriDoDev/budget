import { describe, expect, it } from "vitest";
import { milliunitsToInput, parseAmountInput } from "./money";

describe("amount inputs", () => {
  it("parses what people type into milliunits", () => {
    expect(parseAmountInput("1,500.50")).toBe(1_500_500);
    expect(parseAmountInput("$ 80")).toBe(80_000);
    expect(parseAmountInput("-12.5")).toBe(-12_500);
    expect(parseAmountInput(".75")).toBe(750);
  });

  it("does the math when a calculation is typed", () => {
    expect(parseAmountInput("100+200")).toBe(300_000);
    expect(parseAmountInput("100.00 + 200")).toBe(300_000);
    expect(parseAmountInput("1,200/12-50")).toBe(50_000);
    expect(parseAmountInput("10+2×3")).toBe(16_000);
    expect(parseAmountInput("-50+20")).toBe(-30_000);
    expect(parseAmountInput("100÷3")).toBe(33_333);
  });

  it("rejects calculations that make no sense", () => {
    expect(parseAmountInput("100+")).toBeNull();
    expect(parseAmountInput("10/0")).toBeNull();
    expect(parseAmountInput("5++5")).toBeNull();
  });

  it("rejects text that is not a number", () => {
    expect(parseAmountInput("")).toBeNull();
    expect(parseAmountInput("abc")).toBeNull();
    expect(parseAmountInput("1.2.3")).toBeNull();
    expect(parseAmountInput(null)).toBeNull();
  });

  it("formats milliunits for editing", () => {
    expect(milliunitsToInput(1_500_500)).toBe("1500.50");
    expect(milliunitsToInput(-80_000)).toBe("-80.00");
  });
});
