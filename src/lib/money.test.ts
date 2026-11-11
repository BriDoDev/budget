import { describe, expect, it } from "vitest";
import { milliunitsToInput, parseAmountInput } from "./money";

describe("amount inputs", () => {
  it("parses what people type into milliunits", () => {
    expect(parseAmountInput("1,500.50")).toBe(1_500_500);
    expect(parseAmountInput("$ 80")).toBe(80_000);
    expect(parseAmountInput("-12.5")).toBe(-12_500);
    expect(parseAmountInput(".75")).toBe(750);
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
