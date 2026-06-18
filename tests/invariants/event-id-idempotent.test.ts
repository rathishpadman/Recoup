import { describe, expect, it } from "vitest";
import { createEventId } from "../../src/types/variance.js";

describe("event id determinism", () => {
  it("hashes rule, sorted record ids, and period into a stable event id", () => {
    const first = createEventId({
      ruleId: "shortage-pod-mismatch",
      recordIds: ["DL-003", "POD-001", "INV-009"],
      period: "2026-06"
    });
    const second = createEventId({
      ruleId: "shortage-pod-mismatch",
      recordIds: ["INV-009", "DL-003", "POD-001"],
      period: "2026-06"
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});
