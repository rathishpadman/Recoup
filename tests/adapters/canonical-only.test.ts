import { describe, expect, it } from "vitest";
import { SyntheticSource } from "../../src/adapters/synthetic.js";

describe("synthetic adapter canonical output", () => {
  it("returns canonical entities only through the source port", () => {
    const source = new SyntheticSource({ seed: 42 });
    const dataset = source.loadSettlementRun();

    expect(dataset.customers.map((customer) => customer.customerId).sort()).toEqual([
      "CUST-CRESTLINE",
      "CUST-GREENLEAF",
      "CUST-HARBOR",
      "CUST-VALUMART"
    ]);
    expect(dataset.deductionLines).toHaveLength(20);
    expect(dataset.deductionLines.every((line) => line.recordIds.length > 0)).toBe(true);
  });
});
