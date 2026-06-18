import { describe, expect, it } from "vitest";
import { buildSyntheticDataset } from "../../datagen/generate.js";
import { runForensicsInvestigation } from "../../src/agents/forensics.js";
import {
  evaluateFalsePositiveGate,
  findValidDeductionsPursued,
  findWrongfulContainments,
  type ContainmentDecision,
  type CustomerIntentLabel,
  type RecoveryDecision
} from "../../evals/harness.js";

describe("decision false-positive gate", () => {
  it("does not flag valid deductions when every valid line is not pursued", () => {
    const lines = buildSyntheticDataset({ seed: 42 }).deductionLines;
    const decisions: RecoveryDecision[] = lines.map((line) => ({
      lineId: line.lineId,
      pursueRecovery: false
    }));

    expect(findValidDeductionsPursued(lines, decisions)).toEqual([]);
  });

  it("flags a valid S1/S2/S4 deduction when it is pursued", () => {
    const lines = buildSyntheticDataset({ seed: 42 }).deductionLines;
    const validLine = lines.find((line) => line.scenarioId === "S1" && line.verdict === "valid");
    if (validLine === undefined) {
      throw new Error("Expected canonical S1 valid deduction line");
    }
    const decisions: RecoveryDecision[] = lines.map((line) => ({
      lineId: line.lineId,
      pursueRecovery: line.lineId === validLine.lineId
    }));

    expect(findValidDeductionsPursued(lines, decisions)).toEqual([validLine.lineId]);
  });

  it("does not flag containment when Harbor is not contained and Crestline is contained", () => {
    const labels: CustomerIntentLabel[] = [
      { customerId: "CUST-HARBOR", intentLabel: "distressed-honest" },
      { customerId: "CUST-CRESTLINE", intentLabel: "gaming" }
    ];
    const decisions: ContainmentDecision[] = [
      { customerId: "CUST-HARBOR", contained: false },
      { customerId: "CUST-CRESTLINE", contained: true }
    ];

    expect(findWrongfulContainments(labels, decisions)).toEqual([]);
  });

  it("flags Harbor when distressed-honest Harbor is contained", () => {
    const labels: CustomerIntentLabel[] = [
      { customerId: "CUST-HARBOR", intentLabel: "distressed-honest" },
      { customerId: "CUST-CRESTLINE", intentLabel: "gaming" }
    ];
    const decisions: ContainmentDecision[] = [
      { customerId: "CUST-HARBOR", contained: true },
      { customerId: "CUST-CRESTLINE", contained: true }
    ];

    expect(findWrongfulContainments(labels, decisions)).toEqual(["CUST-HARBOR"]);
  });

  it("passes the false-positive gate with no violations", () => {
    expect(evaluateFalsePositiveGate([])).toEqual({
      status: "pass",
      falsePositiveCount: 0,
      violations: []
    });
  });

  it("passes with the actual S4 Forensics recovery decisions", () => {
    const lines = buildSyntheticDataset({ seed: 42 }).deductionLines;
    const run = runForensicsInvestigation();
    const cases = run.decisions.map((decision) => {
      const actualLine = lines.find((line) => line.lineId === decision.lineId);
      if (actualLine === undefined) {
        throw new Error(`Missing actual label for ${decision.lineId}`);
      }

      return {
        predicted: decision.verdict,
        actual: actualLine.verdict
      };
    });

    expect(cases.every((metricCase) => metricCase.predicted === metricCase.actual)).toBe(true);
    expect(findValidDeductionsPursued(lines, run.recoveryDecisions)).toEqual([]);
    expect(evaluateFalsePositiveGate(findValidDeductionsPursued(lines, run.recoveryDecisions))).toEqual({
      status: "pass",
      falsePositiveCount: 0,
      violations: []
    });
  });

  it("fails the false-positive gate with violations and reports the count", () => {
    expect(evaluateFalsePositiveGate(["S1-L1", "CUST-HARBOR"])).toEqual({
      status: "fail",
      falsePositiveCount: 2,
      violations: ["S1-L1", "CUST-HARBOR"]
    });
  });
});
