import { describe, expect, it } from "vitest";
import { reconstructExpectedPosition } from "../../src/core/expected.js";
import { money } from "../../src/types/money.js";

describe("expected position reconstruction", () => {
  it("computes contracted price times delivered quantity from POD", () => {
    const result = reconstructExpectedPosition({
      kind: "contracted-delivery",
      contractedUnitPrice: money("12.50"),
      deliveredQuantity: "8",
      actual: money("110.00")
    });

    expect(result.expected.toFixed(2)).toBe("100.00");
    expect(result.actual.toFixed(2)).toBe("110.00");
    expect(result.delta.toFixed(2)).toBe("10.00");
  });

  it("uses the approved TPM promo accrual as expected", () => {
    const result = reconstructExpectedPosition({
      kind: "promo-accrual",
      approvedAccrual: money("4500.00"),
      actual: money("5100.00")
    });

    expect(result.expected.toFixed(2)).toBe("4500.00");
    expect(result.actual.toFixed(2)).toBe("5100.00");
    expect(result.delta.toFixed(2)).toBe("600.00");
  });

  it("uses the contract SLA allowed fine as expected", () => {
    const result = reconstructExpectedPosition({
      kind: "contract-sla",
      allowedFine: money("9800.00"),
      actual: money("9800.00")
    });

    expect(result.expected.toFixed(2)).toBe("9800.00");
    expect(result.actual.toFixed(2)).toBe("9800.00");
    expect(result.delta.toFixed(2)).toBe("0.00");
  });

  it("computes delta as actual minus expected without floating-point drift", () => {
    const result = reconstructExpectedPosition({
      kind: "contracted-delivery",
      contractedUnitPrice: money("0.10"),
      deliveredQuantity: "2",
      actual: money("0.30")
    });

    expect(result.expected.toFixed(2)).toBe("0.20");
    expect(result.delta.toFixed(2)).toBe("0.10");
  });
});
