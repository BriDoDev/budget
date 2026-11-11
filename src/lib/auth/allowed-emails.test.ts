import { describe, expect, it } from "vitest";
import { isEmailAllowed, parseAllowedEmails } from "./allowed-emails";

describe("allowed e-mails", () => {
  it("normalizes case and whitespace and ignores empty entries", () => {
    const allowed = parseAllowedEmails(" Ana@Example.com, ,luis@example.com ");
    expect([...allowed]).toEqual(["ana@example.com", "luis@example.com"]);
    expect(isEmailAllowed("  ANA@example.com", allowed)).toBe(true);
    expect(isEmailAllowed("someone@example.com", allowed)).toBe(false);
  });

  it("returns an empty set when the variable is missing", () => {
    expect(parseAllowedEmails(undefined).size).toBe(0);
  });
});
