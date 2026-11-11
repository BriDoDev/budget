import { describe, expect, it } from "vitest";
import { nextOccurrence } from "./schedule";

describe("nextOccurrence", () => {
  it("returns null for one-time schedules", () => {
    expect(nextOccurrence("2026-11-11", "never")).toBeNull();
  });

  it("steps day-based frequencies across month and year boundaries", () => {
    expect(nextOccurrence("2026-12-28", "weekly")).toBe("2027-01-04");
    expect(nextOccurrence("2026-02-20", "everyOtherWeek")).toBe("2026-03-06");
    expect(nextOccurrence("2026-01-31", "daily")).toBe("2026-02-01");
  });

  it("keeps the anchor day on month-based frequencies", () => {
    expect(nextOccurrence("2026-01-31", "monthly", "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence("2026-02-28", "monthly", "2026-01-31")).toBe("2026-03-31");
    expect(nextOccurrence("2026-11-15", "every3Months")).toBe("2027-02-15");
    expect(nextOccurrence("2024-02-29", "yearly")).toBe("2025-02-28");
  });

  it("alternates between the anchor day and 15 days later on twiceAMonth", () => {
    expect(nextOccurrence("2026-11-05", "twiceAMonth", "2026-11-05")).toBe("2026-11-20");
    expect(nextOccurrence("2026-11-20", "twiceAMonth", "2026-11-05")).toBe("2026-12-05");
    expect(nextOccurrence("2026-02-15", "twiceAMonth", "2026-01-30")).toBe("2026-02-28");
  });
});
