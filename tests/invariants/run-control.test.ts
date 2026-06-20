import { describe, expect, it } from "vitest";
import { buildRunControlStatus, toErrorEvent } from "../../src/services/conductor.js";

describe("I-16 run control", () => {
  it("blocks autonomous run-control enforcement until Appendix G budgets are configured", () => {
    expect(buildRunControlStatus()).toEqual({
      status: "blocked",
      reason: "appendix-g-run-control-unset",
      openDependencies: ["run-control-token-budget", "run-control-step-budget", "run-control-retry-cap"]
    });
  });

  it("compacts tool failures into ErrorEvent records", () => {
    expect(
      toErrorEvent({
        phase: "retrieval",
        toolName: "retrieval.sap",
        error: new Error("SAP sandbox unavailable")
      })
    ).toEqual({
      eventType: "ErrorEvent",
      phase: "retrieval",
      toolName: "retrieval.sap",
      message: "SAP sandbox unavailable",
      recoverable: true
    });
  });
});
