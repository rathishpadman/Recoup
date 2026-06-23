import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildReleaseReadinessReport } from "../../evals/harness.js";
import { decisionEvalBars } from "../../config/thresholds.js";
import {
  buildRunControlStatus,
  createRunBudgetController,
  parseRunControlConfig,
  toErrorEvent,
  type RunControlConfig
} from "../../src/services/conductor.js";

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

  it("accepts explicit owner-supplied Appendix G run-control budgets without providing defaults", () => {
    expect(
      buildRunControlStatus({
        approvedBy: "human:owner-run-control",
        phases: {
          containment: { retryCap: 2, stepBudget: 24, tokenBudget: 45000 },
          forensics: { retryCap: 2, stepBudget: 80, tokenBudget: 200000 },
          query: { retryCap: 1, stepBudget: 12, tokenBudget: 32000 },
          recovery: { retryCap: 2, stepBudget: 40, tokenBudget: 90000 },
          riskMesh: { retryCap: 2, stepBudget: 36, tokenBudget: 90000 },
          sentinel: { retryCap: 2, stepBudget: 30, tokenBudget: 70000 }
        }
      })
    ).toEqual({
      status: "pass",
      approvedBy: "human:owner-run-control",
      retryCapPhaseCount: 6,
      stepBudgetPhaseCount: 6,
      tokenBudgetPhaseCount: 6
    });
  });

  it("rejects partial run-control input instead of treating it as configured", () => {
    expect(() =>
      parseRunControlConfig({
        approvedBy: "human:owner-run-control",
        phases: {
          forensics: { retryCap: 2, stepBudget: 80, tokenBudget: 200000 }
        }
      })
    ).toThrow();
  });

  it("enforces owner-configured step, retry, and token budgets without defaults", () => {
    const controller = createRunBudgetController(tightRunControlConfig);

    controller.recordStep({ phase: "forensics" });
    controller.recordStep({ phase: "forensics" });
    controller.recordRetry({ phase: "forensics" });
    controller.recordTokenUsage({ phase: "forensics", tokens: 12 });

    expect(() => {
      controller.recordStep({ phase: "forensics" });
    }).toThrow("Run step budget exceeded for phase forensics.");
    expect(() => {
      controller.recordRetry({ phase: "forensics" });
    }).toThrow("Run retry cap exceeded for phase forensics.");
    expect(() => {
      controller.recordTokenUsage({ phase: "forensics", tokens: 9 });
    }).toThrow(
      "Run token budget exceeded for phase forensics."
    );
    expect(controller.snapshot().forensics).toEqual({
      retryCount: 1,
      stepCount: 2,
      tokenCount: 12
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

  it("does not hard-code SDK agent-as-tool run-control defaults", () => {
    const agentRuntimeSource = readFileSync("src/agents/agentRuntime.ts", "utf8");

    expect(agentRuntimeSource).not.toContain("maxTurns: 1");
    expect(agentRuntimeSource).not.toContain("runOptions: { maxTurns");
  });
});

const tightRunControlConfig: RunControlConfig = {
  approvedBy: "human:owner-run-control",
  phases: {
    containment: { retryCap: 1, stepBudget: 1, tokenBudget: 1 },
    forensics: { retryCap: 1, stepBudget: 2, tokenBudget: 20 },
    query: { retryCap: 1, stepBudget: 1, tokenBudget: 1 },
    recovery: { retryCap: 1, stepBudget: 1, tokenBudget: 1 },
    riskMesh: { retryCap: 1, stepBudget: 1, tokenBudget: 1 },
    sentinel: { retryCap: 1, stepBudget: 1, tokenBudget: 1 }
  }
};
