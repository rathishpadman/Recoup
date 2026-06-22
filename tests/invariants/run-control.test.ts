import { describe, expect, it } from "vitest";
import { buildReleaseReadinessReport } from "../../evals/harness.js";
import { decisionEvalBars } from "../../config/thresholds.js";
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

  it("keeps unset run control as a release-blocking failure", () => {
    expect(
      buildReleaseReadinessReport({
        runControl: buildRunControlStatus(),
        accuracyBars: {
          deductionValidity: {
            status: "pass",
            score: 1,
            threshold: decisionEvalBars.deductionValidityAccuracy
          },
          intentPrecision: {
            status: "pass",
            score: 1,
            threshold: decisionEvalBars.intentPrecision
          },
          arbitrationAgreement: {
            status: "pass",
            score: 1,
            threshold: decisionEvalBars.arbitrationAgreement
          }
        }
      })
    ).toEqual({
      status: "fail",
      blockers: [
        {
          gate: "run-control",
          reason: "appendix-g-run-control-unset",
          openDependencies: ["run-control-token-budget", "run-control-step-budget", "run-control-retry-cap"]
        }
      ]
    });
  });
});
