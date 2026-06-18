import { describe, expect, it } from "vitest";
import {
  buildAccuracyBarReport,
  buildCanonicalDeductionValidityCases,
  calculateAccuracy,
  calculateAgreement,
  calculatePrecision,
  evaluateMetricGate
} from "../../evals/harness.js";
import { decisionEvalBars } from "../../config/thresholds.js";
import { buildSyntheticDataset } from "../../datagen/generate.js";
import type { DeductionVerdict } from "../../src/types/entities.js";

describe("accuracy bar metric harness", () => {
  it("calculates perfect accuracy for exact deduction verdict matches", () => {
    const cases = [
      { predicted: "valid", actual: "valid" },
      { predicted: "invalid", actual: "invalid" }
    ];

    expect(calculateAccuracy(cases)).toBe(1);
  });

  it("passes a metric gate when score meets the deduction validity accuracy threshold", () => {
    const cases = [
      { predicted: "valid", actual: "valid" },
      { predicted: "invalid", actual: "invalid" }
    ];

    expect(
      evaluateMetricGate(cases, calculateAccuracy, decisionEvalBars.deductionValidityAccuracy)
    ).toEqual({
      status: "pass",
      score: 1,
      threshold: decisionEvalBars.deductionValidityAccuracy
    });
  });

  it("fails a metric gate below threshold for one wrong verdict out of two", () => {
    const cases = [
      { predicted: "valid", actual: "valid" },
      { predicted: "invalid", actual: "valid" }
    ];

    expect(
      evaluateMetricGate(cases, calculateAccuracy, decisionEvalBars.deductionValidityAccuracy)
    ).toEqual({
      status: "fail",
      score: 0.5,
      threshold: decisionEvalBars.deductionValidityAccuracy
    });
  });

  it("passes the deduction validity accuracy gate on canonical S1-S8 labels", () => {
    const cases = buildCanonicalDeductionValidityCases(buildSyntheticDataset({ seed: 42 }).deductionLines);

    expect(cases).toHaveLength(20);
    expect(
      evaluateMetricGate(cases, calculateAccuracy, decisionEvalBars.deductionValidityAccuracy)
    ).toEqual({
      status: "pass",
      score: 1,
      threshold: decisionEvalBars.deductionValidityAccuracy
    });
  });

  it("derives canonical deduction predictions from rule outputs instead of actual verdict labels", () => {
    const lines = buildSyntheticDataset({ seed: 42 }).deductionLines;
    const firstLine = lines[0];
    if (firstLine === undefined) {
      throw new Error("Expected at least one canonical deduction line");
    }
    const alternateVerdict: DeductionVerdict = firstLine.verdict === "valid" ? "invalid" : "valid";
    const mutatedLines = lines.map((line, index) =>
      index === 0
        ? {
            ...line,
            verdict: alternateVerdict
          }
        : line
    );

    const cases = buildCanonicalDeductionValidityCases(mutatedLines);

    expect(cases[0]).toEqual({
      predicted: firstLine.verdict,
      actual: alternateVerdict
    });
    expect(calculateAccuracy(cases)).toBeLessThan(1);
  });

  it("reports reduced deduction validity accuracy when one canonical verdict is wrong", () => {
    const cases = buildCanonicalDeductionValidityCases(buildSyntheticDataset({ seed: 42 }).deductionLines);
    const mutatedCases = cases.map((metricCase, index) =>
      index === 0
        ? {
            ...metricCase,
            predicted: metricCase.actual === "valid" ? "invalid" : "valid"
          }
        : metricCase
    );

    const result = evaluateMetricGate(mutatedCases, calculateAccuracy, decisionEvalBars.deductionValidityAccuracy);

    expect(result).toEqual({
      status: "pass",
      score: 19 / 20,
      threshold: decisionEvalBars.deductionValidityAccuracy
    });
  });

  it("fails the deduction validity accuracy gate when canonical verdict accuracy is below threshold", () => {
    const cases = buildCanonicalDeductionValidityCases(buildSyntheticDataset({ seed: 42 }).deductionLines);
    const mutatedCases = cases.map((metricCase, index) =>
      index < 3
        ? {
            ...metricCase,
            predicted: metricCase.actual === "valid" ? "invalid" : "valid"
          }
        : metricCase
    );

    const result = evaluateMetricGate(mutatedCases, calculateAccuracy, decisionEvalBars.deductionValidityAccuracy);

    expect(result.status).toBe("fail");
    expect("score" in result ? result.score : 1).toBeLessThan(decisionEvalBars.deductionValidityAccuracy);
  });

  it("calculates precision for a positive gaming label", () => {
    const cases = [
      { predicted: "gaming", actual: "gaming" },
      { predicted: "distressed-honest", actual: "distressed-honest" }
    ];

    expect(calculatePrecision(cases, "gaming")).toBe(1);
  });

  it("calculates agreement over two exact matches and one mismatch", () => {
    const cases = [
      { predicted: "approve", actual: "approve" },
      { predicted: "block", actual: "block" },
      { predicted: "route", actual: "block" }
    ];

    expect(calculateAgreement(cases)).toBe(2 / 3);
  });

  it("blocks an empty metric gate when labels are unavailable", () => {
    expect(
      evaluateMetricGate([], calculateAgreement, decisionEvalBars.arbitrationAgreement, "arbitration labels unavailable")
    ).toEqual({
      status: "blocked",
      reason: "arbitration labels unavailable"
    });
  });

  it("blocks intent precision when a non-empty partial intent label set is incomplete", () => {
    const deductionValidityCases = buildCanonicalDeductionValidityCases(
      buildSyntheticDataset({ seed: 42 }).deductionLines
    );

    const report = buildAccuracyBarReport({
      deductionValidityCases,
      intentCases: [{ predicted: "gaming", actual: "gaming" }],
      arbitrationCases: [],
      thresholds: decisionEvalBars,
      requiredIntentLabelCount: 4,
      requiredArbitrationLabelCount: 0
    });

    expect(report.intentPrecision).toEqual({
      status: "blocked",
      reason: "complete intent labels unavailable"
    });
  });

  it("blocks arbitration agreement when a non-empty partial expert label set is incomplete", () => {
    const deductionValidityCases = buildCanonicalDeductionValidityCases(
      buildSyntheticDataset({ seed: 42 }).deductionLines
    );

    const report = buildAccuracyBarReport({
      deductionValidityCases,
      intentCases: [],
      arbitrationCases: [{ predicted: "approve", actual: "approve" }],
      thresholds: decisionEvalBars,
      requiredIntentLabelCount: 0,
      requiredArbitrationLabelCount: 2
    });

    expect(report.arbitrationAgreement).toEqual({
      status: "blocked",
      reason: "arbitration expert labels unavailable"
    });
  });

  it("surfaces unavailable complete intent and arbitration labels in the full accuracy-bar report", () => {
    const deductionValidityCases = buildCanonicalDeductionValidityCases(
      buildSyntheticDataset({ seed: 42 }).deductionLines
    );

    expect(
      buildAccuracyBarReport({
        deductionValidityCases,
        intentCases: [],
        arbitrationCases: [],
        thresholds: decisionEvalBars,
        requiredIntentLabelCount: 1,
        requiredArbitrationLabelCount: 1
      })
    ).toEqual({
      deductionValidity: {
        status: "pass",
        score: 1,
        threshold: decisionEvalBars.deductionValidityAccuracy
      },
      intentPrecision: {
        status: "blocked",
        reason: "complete intent labels unavailable"
      },
      arbitrationAgreement: {
        status: "blocked",
        reason: "arbitration expert labels unavailable"
      }
    });
  });

  it("blocks non-empty partial report labels when callers omit completeness metadata", () => {
    const deductionValidityCases = buildCanonicalDeductionValidityCases(
      buildSyntheticDataset({ seed: 42 }).deductionLines
    );
    const incompleteInput = {
      deductionValidityCases,
      intentCases: [{ predicted: "gaming", actual: "gaming" }],
      arbitrationCases: [{ predicted: "approve", actual: "approve" }],
      thresholds: decisionEvalBars
    } as unknown as Parameters<typeof buildAccuracyBarReport>[0];

    expect(buildAccuracyBarReport(incompleteInput)).toEqual({
      deductionValidity: {
        status: "pass",
        score: 1,
        threshold: decisionEvalBars.deductionValidityAccuracy
      },
      intentPrecision: {
        status: "blocked",
        reason: "complete intent labels unavailable"
      },
      arbitrationAgreement: {
        status: "blocked",
        reason: "arbitration expert labels unavailable"
      }
    });
  });
});
