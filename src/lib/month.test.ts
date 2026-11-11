import { describe, expect, it } from "vitest";
import { addMonths, isMonthKey, monthRange, toMonthKey } from "./month";

describe("month helpers", () => {
  it("normalizes dates to the first day of the month", () => {
    expect(toMonthKey("2026-11-27")).toBe("2026-11-01");
    expect(toMonthKey("2026-11")).toBe("2026-11-01");
    expect(() => toMonthKey("27/11/2026")).toThrow();
  });

  it("adds months across year boundaries", () => {
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(addMonths("2026-03-01", 14)).toBe("2027-05-01");
  });

  it("builds inclusive ranges", () => {
    expect(monthRange("2026-11-01", "2027-01-01")).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
    expect(monthRange("2026-02-01", "2026-01-01")).toEqual([]);
  });

  it("validates month keys", () => {
    expect(isMonthKey("2026-02-01")).toBe(true);
    expect(isMonthKey("2026-02-15")).toBe(false);
    expect(isMonthKey("2026-13-01")).toBe(false);
  });
});
