import { describe, expect, it } from "vitest";
import { MoneySchema, money } from "../../src/types/money.js";

describe("money invariants", () => {
  it("stores monetary values as Decimal instances, not JavaScript numbers", () => {
    const parsed = MoneySchema.parse("112400.00");

    expect(parsed.toFixed(2)).toBe("112400.00");
    expect(typeof parsed).not.toBe("number");
  });

  it("adds decimal amounts without floating-point drift", () => {
    const total = money("0.10").plus(money("0.20"));

    expect(total.toFixed(2)).toBe("0.30");
  });
});
