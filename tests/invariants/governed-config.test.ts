import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ArbitrationPnlWeightsSchema,
  DecisionEvalBarsSchema,
  GamingGateSchema,
  GovernedConfigKeySchema,
  GovernedConfigSeedRowSchema,
  GovernedConfigSeedSchema,
  PartialHoldThresholdsSchema,
  PartialHoldWeightsSchema,
  RDriftTriggerSchema,
  RScoreWeightsSchema,
  day1GovernedConfigSeed,
  governedConfigSeedRows,
  parseActiveGovernedConfigRows,
  sha256CanonicalJson
} from "../../config/governed.js";
import { decisionEvalBars, partialHoldThresholds, seed } from "../../config/thresholds.js";
import { partialHoldWeights } from "../../config/weights.js";

describe("governed Day-1 config", () => {
  it("exports the owner-ratified v1 values with a deterministic canonical hash", () => {
    const parsed = GovernedConfigSeedSchema.parse(day1GovernedConfigSeed);

    expect(Object.isFrozen(day1GovernedConfigSeed)).toBe(true);
    expect(parsed.configVersion).toBe(1);
    expect(parsed.values.arbitrationWeights).toEqual({
      billing: 0.15,
      collections: 0.25,
      credit: 0.35,
      fulfillment: 0.25
    });
    expect(parsed.values.rScoreWeights).toEqual({
      agingConcentration: 0.2,
      disputeRate: 0.25,
      dsoAdp: 0.35,
      overLimitFrequency: 0.2
    });
    expect(parsed.values.rDriftTrigger).toEqual({
      cooldownDays: 30,
      disputeRateRelativeIncrease: 0.5,
      dsoIncreaseDays: 10,
      riskTierDowngrade: 1
    });
    expect(parsed.values.gamingGate).toEqual({
      invalidLineCount: 2,
      invalidValueFloor: "10000.00",
      promoCorrelationCount: 1,
      windowDays: 90
    });
    expect(parsed.values.partialHold).toEqual({
      thresholds: partialHoldThresholds,
      weights: partialHoldWeights
    });
    expect(parsed.values.accuracyBars).toEqual(decisionEvalBars);
    expect(parsed.values.seed).toBe(seed);
    expect(typeof parsed.values.gamingGate.invalidValueFloor).toBe("string");
    expect(typeof parsed.values.gamingGate.invalidValueFloor).not.toBe("number");
    expect(parsed.configHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(parsed.configHash).toBe(sha256Canonical(parsed.values));
  });

  it("enforces supplied weight sums, floors, and HITL adjustment bands", () => {
    expect(ArbitrationPnlWeightsSchema.parse(day1GovernedConfigSeed.values.arbitrationWeights)).toEqual(
      day1GovernedConfigSeed.values.arbitrationWeights
    );
    expect(RScoreWeightsSchema.parse(day1GovernedConfigSeed.values.rScoreWeights)).toEqual(
      day1GovernedConfigSeed.values.rScoreWeights
    );

    expect(() =>
      ArbitrationPnlWeightsSchema.parse({ billing: 0.1, collections: 0.24, credit: 0.46, fulfillment: 0.2 })
    ).toThrow();
    expect(() =>
      ArbitrationPnlWeightsSchema.parse({ billing: 0.04, collections: 0.25, credit: 0.36, fulfillment: 0.35 })
    ).toThrow();
    expect(() =>
      ArbitrationPnlWeightsSchema.parse({ billing: 0.15, collections: 0.25, credit: 0.35, fulfillment: 0.2 })
    ).toThrow();
    expect(() =>
      RScoreWeightsSchema.parse({
        agingConcentration: 0.17,
        disputeRate: 0.2,
        dsoAdp: 0.46,
        overLimitFrequency: 0.17
      })
    ).toThrow();
    expect(() =>
      RScoreWeightsSchema.parse({
        agingConcentration: 0.2,
        disputeRate: 0.25,
        dsoAdp: 0.35,
        overLimitFrequency: 0.1
      })
    ).toThrow();
  });

  it("enforces Day-1 trigger and gaming-gate floors without representing money as a number", () => {
    expect(RDriftTriggerSchema.parse(day1GovernedConfigSeed.values.rDriftTrigger)).toEqual(
      day1GovernedConfigSeed.values.rDriftTrigger
    );
    expect(GamingGateSchema.parse(day1GovernedConfigSeed.values.gamingGate)).toEqual(
      day1GovernedConfigSeed.values.gamingGate
    );

    expect(() =>
      RDriftTriggerSchema.parse({
        cooldownDays: 29,
        disputeRateRelativeIncrease: 0.5,
        dsoIncreaseDays: 10,
        riskTierDowngrade: 1
      })
    ).toThrow();
    expect(() =>
      GamingGateSchema.parse({
        invalidLineCount: 1,
        invalidValueFloor: "10000.00",
        promoCorrelationCount: 1,
        windowDays: 90
      })
    ).toThrow();
    expect(() =>
      GamingGateSchema.parse({
        invalidLineCount: 2,
        invalidValueFloor: 10000,
        promoCorrelationCount: 1,
        windowDays: 90
      })
    ).toThrow();
    expect(() =>
      GamingGateSchema.parse({
        invalidLineCount: 2,
        invalidValueFloor: "9999.99",
        promoCorrelationCount: 1,
        windowDays: 90
      })
    ).toThrow();
  });

  it("rejects partial-hold weights that do not match the locked Day-1 contract", () => {
    expect(PartialHoldWeightsSchema.parse(partialHoldWeights)).toEqual(partialHoldWeights);

    expect(() =>
      PartialHoldWeightsSchema.parse({
        ...partialHoldWeights,
        customerStrategicValue: 0.16,
        orderValueVsExposure: 0.19
      })
    ).toThrow();
    expect(() =>
      PartialHoldWeightsSchema.parse({
        ...partialHoldWeights,
        dsoPaymentDrift: 0.15,
        paymentPattern: 0.2
      })
    ).toThrow();
  });

  it("rejects partial-hold thresholds that drift from the locked bands, step, floor, or ceiling", () => {
    expect(PartialHoldThresholdsSchema.parse(partialHoldThresholds)).toEqual(partialHoldThresholds);

    expect(() => PartialHoldThresholdsSchema.parse({ ...partialHoldThresholds, holdBelow: 39 })).toThrow();
    expect(() => PartialHoldThresholdsSchema.parse({ ...partialHoldThresholds, partialFrom: 41 })).toThrow();
    expect(() => PartialHoldThresholdsSchema.parse({ ...partialHoldThresholds, partialThrough: 61 })).toThrow();
    expect(() => PartialHoldThresholdsSchema.parse({ ...partialHoldThresholds, shipAbove: 59 })).toThrow();
    expect(() => PartialHoldThresholdsSchema.parse({ ...partialHoldThresholds, releaseStepPercent: 10 })).toThrow();
    expect(() => PartialHoldThresholdsSchema.parse({ ...partialHoldThresholds, minPartialReleasePercent: 35 })).toThrow();
    expect(() => PartialHoldThresholdsSchema.parse({ ...partialHoldThresholds, maxPartialReleasePercent: 75 })).toThrow();
  });

  it("rejects accuracy bars below locked release-blocking floors or above one", () => {
    expect(DecisionEvalBarsSchema.parse(decisionEvalBars)).toEqual(decisionEvalBars);
    expect(
      DecisionEvalBarsSchema.parse({
        arbitrationAgreement: 0.95,
        deductionValidityAccuracy: 0.95,
        intentPrecision: 0.95
      })
    ).toEqual({
      arbitrationAgreement: 0.95,
      deductionValidityAccuracy: 0.95,
      intentPrecision: 0.95
    });

    expect(() => DecisionEvalBarsSchema.parse({ ...decisionEvalBars, deductionValidityAccuracy: 0.89 })).toThrow();
    expect(() => DecisionEvalBarsSchema.parse({ ...decisionEvalBars, intentPrecision: 0.89 })).toThrow();
    expect(() => DecisionEvalBarsSchema.parse({ ...decisionEvalBars, arbitrationAgreement: 0.84 })).toThrow();
    expect(() => DecisionEvalBarsSchema.parse({ ...decisionEvalBars, deductionValidityAccuracy: 1.01 })).toThrow();
    expect(() => DecisionEvalBarsSchema.parse({ ...decisionEvalBars, intentPrecision: 1.01 })).toThrow();
    expect(() => DecisionEvalBarsSchema.parse({ ...decisionEvalBars, arbitrationAgreement: 1.01 })).toThrow();
  });

  it("prepares one immutable v1 seed row per governed recoup_config key", () => {
    expect(GovernedConfigKeySchema.options).toEqual([
      "arbitration_weights",
      "r_score_weights",
      "r_drift",
      "gaming_gate",
      "partial_hold",
      "accuracy_bars",
      "seed"
    ]);
    expect(governedConfigSeedRows.map((row) => row.key)).toEqual([
      "arbitration_weights",
      "r_score_weights",
      "r_drift",
      "gaming_gate",
      "partial_hold",
      "accuracy_bars",
      "seed"
    ]);

    for (const row of governedConfigSeedRows) {
      expect(row.active).toBe(true);
      expect(row.approvedBy).toBe("human:owner-ratified-day-1");
      expect(row.configVersion).toBe(1);
      expect(row.configHash).toBe(sha256Canonical(row.valueJson));
      expect(row.configHash).toMatch(/^[a-f0-9]{64}$/u);
      expect(Object.isFrozen(row)).toBe(true);
    }

    expect(governedConfigSeedRows.find((row) => row.key === "partial_hold")?.valueJson).toEqual({
      thresholds: partialHoldThresholds,
      weights: partialHoldWeights
    });
    expect(governedConfigSeedRows.find((row) => row.key === "accuracy_bars")?.valueJson).toEqual(decisionEvalBars);
    expect(governedConfigSeedRows.find((row) => row.key === "seed")?.valueJson).toEqual({ seed });
  });

  it("rejects recoup_config seed rows whose value_json does not match the declared key", () => {
    const mismatchedValueJson = { notWeights: true };

    expect(() =>
      GovernedConfigSeedRowSchema.parse({
        active: true,
        approvedBy: "human:owner-ratified-day-1",
        configHash: sha256CanonicalJson(mismatchedValueJson),
        configVersion: 1,
        effectiveFrom: "2026-06-20T00:00:00.000Z",
        key: "arbitration_weights",
        valueJson: mismatchedValueJson
      })
    ).toThrow();
  });

  it("assembles active recoup_config rows into an immutable runtime snapshot", () => {
    const snapshot = parseActiveGovernedConfigRows(toPostgrestRows());
    const rowHashes = Object.fromEntries(governedConfigSeedRows.map((row) => [row.key, row.configHash]));

    expect(snapshot).toEqual({
      configHash: day1GovernedConfigSeed.configHash,
      configVersion: 1,
      rowHashes,
      values: day1GovernedConfigSeed.values
    });
    expect(snapshot.configHash).toBe(sha256CanonicalJson(snapshot.values));
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.rowHashes)).toBe(true);
    expect(Object.isFrozen(snapshot.values)).toBe(true);
    expect(Object.isFrozen(snapshot.values.partialHold)).toBe(true);
    expect(Object.isFrozen(snapshot.values.partialHold.thresholds)).toBe(true);
  });

  it("normalizes snake_case PostgREST rows and camelCase test rows to the same snapshot", () => {
    expect(parseActiveGovernedConfigRows(toPostgrestRows())).toEqual(
      parseActiveGovernedConfigRows(governedConfigSeedRows)
    );
  });

  it("rejects active recoup_config rows whose per-key row hash was tampered", () => {
    const rows = toPostgrestRows();
    const firstRow = rows[0];

    if (firstRow === undefined) {
      throw new Error("governed config seed rows should not be empty.");
    }

    expect(() =>
      parseActiveGovernedConfigRows([
        {
          ...firstRow,
          config_hash: sha256CanonicalJson({ tampered: true })
        },
        ...rows.slice(1)
      ])
    ).toThrow(/row configHash must be sha256\(canonical value_json\)/u);
  });
});

function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function toPostgrestRows() {
  return governedConfigSeedRows.map((row) => ({
    active: row.active,
    approved_by: row.approvedBy,
    config_hash: row.configHash,
    config_version: row.configVersion,
    effective_from: row.effectiveFrom,
    key: row.key,
    value_json: row.valueJson
  }));
}
