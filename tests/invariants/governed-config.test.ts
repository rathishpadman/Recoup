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
  normalizeGovernedConfigRow,
  parseActiveGovernedConfigRows,
  sha256CanonicalJson
} from "../../config/governed.js";
import { decisionEvalBars, partialHoldThresholds, seed } from "../../config/thresholds.js";

const partialHoldWeights = day1GovernedConfigSeed.values.partialHold.weights;

describe("governed Day-1 config", () => {
  it("exports the owner-ratified v1 values with a deterministic canonical hash", () => {
    const parsed = GovernedConfigSeedSchema.parse(day1GovernedConfigSeed);

    expect(Object.isFrozen(day1GovernedConfigSeed)).toBe(true);
    expect(parsed.configVersion).toBe(1);
    expect(parsed.values.arbitrationWeights).toEqual({
      billing: 0.15,
      collections: 0.2,
      credit: 0.35,
      fulfillment: 0.3
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
    expect(parsed.values.riskMeshCases.harbor).toMatchObject({
      caseId: "ARB-HARBOR-ORDER-640K",
      customerId: "CUST-HARBOR",
      orderAmount: "640010.00",
      orderId: "6534",
      terms: "2/10 Net-30 + 25% deposit"
    });
    expect(parsed.values.seed).toBe(seed);
    expect(typeof parsed.values.gamingGate.invalidValueFloor).toBe("string");
    expect(typeof parsed.values.gamingGate.invalidValueFloor).not.toBe("number");
    expect(parsed.configHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(parsed.configHash).toBe(sha256Canonical(parsed.values));
  });

  it("enforces the SDD Risk Mesh function set as credit, fulfillment, billing, and collections", () => {
    const functionNames = new Set(
      day1GovernedConfigSeed.values.riskMeshCases.harbor.arbitrationPositions.map((position) => position.functionName)
    );

    expect(Object.keys(day1GovernedConfigSeed.values.arbitrationWeights).sort()).toEqual([
      "billing",
      "collections",
      "credit",
      "fulfillment"
    ]);
    expect([...functionNames].sort()).toEqual(["billing", "collections", "credit", "fulfillment"]);
    expect(() =>
      ArbitrationPnlWeightsSchema.parse({
        collections: 0.2,
        credit: 0.35,
        fulfillment: 0.3,
        relationship: 0.15
      })
    ).toThrow();
  });

  it("enforces governed weight shapes and sums without locking runtime rows to Day-1 seed values", () => {
    expect(ArbitrationPnlWeightsSchema.parse(day1GovernedConfigSeed.values.arbitrationWeights)).toEqual(
      day1GovernedConfigSeed.values.arbitrationWeights
    );
    expect(RScoreWeightsSchema.parse(day1GovernedConfigSeed.values.rScoreWeights)).toEqual(
      day1GovernedConfigSeed.values.rScoreWeights
    );

    expect(ArbitrationPnlWeightsSchema.parse({ billing: 0.1, collections: 0.25, credit: 0.4, fulfillment: 0.25 })).toEqual({
      billing: 0.1,
      collections: 0.25,
      credit: 0.4,
      fulfillment: 0.25
    });
    expect(RScoreWeightsSchema.parse({ agingConcentration: 0.25, disputeRate: 0.25, dsoAdp: 0.3, overLimitFrequency: 0.2 })).toEqual({
      agingConcentration: 0.25,
      disputeRate: 0.25,
      dsoAdp: 0.3,
      overLimitFrequency: 0.2
    });
    expect(() =>
      ArbitrationPnlWeightsSchema.parse({ billing: 0.1, collections: 0.2, credit: 0.35, fulfillment: 0.3 })
    ).toThrow();
    expect(() =>
      ArbitrationPnlWeightsSchema.parse({ collections: 0.2, credit: 0.35, fulfillment: 0.3 })
    ).toThrow();
    expect(() =>
      RScoreWeightsSchema.parse({
        agingConcentration: -0.1,
        disputeRate: 0.25,
        dsoAdp: 0.45,
        overLimitFrequency: 0.4
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

  it("enforces trigger and gaming-gate structure without representing money as a number", () => {
    expect(RDriftTriggerSchema.parse(day1GovernedConfigSeed.values.rDriftTrigger)).toEqual(
      day1GovernedConfigSeed.values.rDriftTrigger
    );
    expect(GamingGateSchema.parse(day1GovernedConfigSeed.values.gamingGate)).toEqual(
      day1GovernedConfigSeed.values.gamingGate
    );

    expect(
      RDriftTriggerSchema.parse({
        cooldownDays: 7,
        disputeRateRelativeIncrease: 0.25,
        dsoIncreaseDays: 5,
        riskTierDowngrade: 2
      })
    ).toEqual({
      cooldownDays: 7,
      disputeRateRelativeIncrease: 0.25,
      dsoIncreaseDays: 5,
      riskTierDowngrade: 2
    });
    expect(
      GamingGateSchema.parse({
        invalidLineCount: 1,
        invalidValueFloor: "5000.00",
        promoCorrelationCount: 1,
        windowDays: 30
      })
    ).toEqual({
      invalidLineCount: 1,
      invalidValueFloor: "5000.00",
      promoCorrelationCount: 1,
      windowDays: 30
    });
    expect(() =>
      RDriftTriggerSchema.parse({
        cooldownDays: 0,
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
    ).not.toThrow();
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
        invalidValueFloor: "0.00",
        promoCorrelationCount: 1,
        windowDays: 90
      })
    ).toThrow();
  });

  it("accepts runtime partial-hold weights from governed rows while rejecting invalid sums", () => {
    expect(PartialHoldWeightsSchema.parse(partialHoldWeights)).toEqual(partialHoldWeights);

    expect(
      PartialHoldWeightsSchema.parse({
        customerStrategicValue: 0.1,
        dsoPaymentDrift: 0.25,
        orderMargin: 0.15,
        orderValueVsExposure: 0.25,
        paymentPattern: 0.1,
        revenueForecast: 0.15
      })
    ).toEqual({
      customerStrategicValue: 0.1,
      dsoPaymentDrift: 0.25,
      orderMargin: 0.15,
      orderValueVsExposure: 0.25,
      paymentPattern: 0.1,
      revenueForecast: 0.15
    });
    expect(() =>
      PartialHoldWeightsSchema.parse({
        ...partialHoldWeights,
        customerStrategicValue: 0.16
      })
    ).toThrow();
    expect(() =>
      PartialHoldWeightsSchema.parse({
        ...partialHoldWeights,
        dsoPaymentDrift: -0.05,
        paymentPattern: 0.4
      })
    ).toThrow();
  });

  it("accepts runtime partial-hold thresholds from governed rows while enforcing logical bands", () => {
    expect(PartialHoldThresholdsSchema.parse(partialHoldThresholds)).toEqual(partialHoldThresholds);

    expect(
      PartialHoldThresholdsSchema.parse({
        holdBelow: 35,
        partialFrom: 35,
        partialThrough: 65,
        shipAbove: 65,
        releaseStepPercent: 10,
        minPartialReleasePercent: 30,
        maxPartialReleasePercent: 80
      })
    ).toEqual({
      holdBelow: 35,
      partialFrom: 35,
      partialThrough: 65,
      shipAbove: 65,
      releaseStepPercent: 10,
      minPartialReleasePercent: 30,
      maxPartialReleasePercent: 80
    });
    expect(() => PartialHoldThresholdsSchema.parse({ ...partialHoldThresholds, holdBelow: 101 })).toThrow();
    expect(() => PartialHoldThresholdsSchema.parse({ ...partialHoldThresholds, partialFrom: 39 })).toThrow();
    expect(() => PartialHoldThresholdsSchema.parse({ ...partialHoldThresholds, partialThrough: 39 })).toThrow();
    expect(() => PartialHoldThresholdsSchema.parse({ ...partialHoldThresholds, shipAbove: 59 })).toThrow();
    expect(() => PartialHoldThresholdsSchema.parse({ ...partialHoldThresholds, releaseStepPercent: 0 })).toThrow();
    expect(() => PartialHoldThresholdsSchema.parse({ ...partialHoldThresholds, minPartialReleasePercent: 75 })).toThrow();
  });

  it("accepts runtime accuracy bars from governed rows while rejecting impossible ratios", () => {
    expect(DecisionEvalBarsSchema.parse(decisionEvalBars)).toEqual(decisionEvalBars);
    expect(
      DecisionEvalBarsSchema.parse({
        arbitrationAgreement: 0.8,
        deductionValidityAccuracy: 0.88,
        intentPrecision: 0.86
      })
    ).toEqual({
      arbitrationAgreement: 0.8,
      deductionValidityAccuracy: 0.88,
      intentPrecision: 0.86
    });

    expect(() => DecisionEvalBarsSchema.parse({ ...decisionEvalBars, deductionValidityAccuracy: -0.01 })).toThrow();
    expect(() => DecisionEvalBarsSchema.parse({ ...decisionEvalBars, intentPrecision: -0.01 })).toThrow();
    expect(() => DecisionEvalBarsSchema.parse({ ...decisionEvalBars, arbitrationAgreement: -0.01 })).toThrow();
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
      "risk_mesh_cases",
      "seed"
    ]);
    expect(governedConfigSeedRows.map((row) => row.key)).toEqual([
      "arbitration_weights",
      "r_score_weights",
      "r_drift",
      "gaming_gate",
      "partial_hold",
      "accuracy_bars",
      "risk_mesh_cases",
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
    expect(governedConfigSeedRows.find((row) => row.key === "risk_mesh_cases")?.valueJson).toEqual(
      day1GovernedConfigSeed.values.riskMeshCases
    );
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

  it("uses active Supabase row values as runtime authority when hashes and schemas are valid", () => {
    const runtimeOverrides = {
      accuracy_bars: {
        arbitrationAgreement: 0.8,
        deductionValidityAccuracy: 0.88,
        intentPrecision: 0.86
      },
      arbitration_weights: {
        billing: 0.1,
        collections: 0.25,
        credit: 0.4,
        fulfillment: 0.25
      },
      gaming_gate: {
        invalidLineCount: 1,
        invalidValueFloor: "5000.00",
        promoCorrelationCount: 1,
        windowDays: 30
      },
      partial_hold: {
        thresholds: {
          holdBelow: 35,
          maxPartialReleasePercent: 80,
          minPartialReleasePercent: 30,
          partialFrom: 35,
          partialThrough: 65,
          releaseStepPercent: 10,
          shipAbove: 65
        },
        weights: {
          customerStrategicValue: 0.1,
          dsoPaymentDrift: 0.25,
          orderMargin: 0.15,
          orderValueVsExposure: 0.25,
          paymentPattern: 0.1,
          revenueForecast: 0.15
        }
      },
      r_drift: {
        cooldownDays: 7,
        disputeRateRelativeIncrease: 0.25,
        dsoIncreaseDays: 5,
        riskTierDowngrade: 2
      },
      r_score_weights: {
        agingConcentration: 0.25,
        disputeRate: 0.25,
        dsoAdp: 0.3,
        overLimitFrequency: 0.2
      }
    };
    const snapshot = parseActiveGovernedConfigRows(toPostgrestRows(runtimeOverrides));

    expect(snapshot.values.accuracyBars).toEqual(runtimeOverrides.accuracy_bars);
    expect(snapshot.values.arbitrationWeights).toEqual(runtimeOverrides.arbitration_weights);
    expect(snapshot.values.gamingGate).toEqual(runtimeOverrides.gaming_gate);
    expect(snapshot.values.partialHold).toEqual(runtimeOverrides.partial_hold);
    expect(snapshot.values.rDriftTrigger).toEqual(runtimeOverrides.r_drift);
    expect(snapshot.values.rScoreWeights).toEqual(runtimeOverrides.r_score_weights);
    expect(snapshot.configHash).toBe(sha256CanonicalJson(snapshot.values));
  });

  it("normalizes snake_case PostgREST rows and camelCase test rows to the same snapshot", () => {
    expect(parseActiveGovernedConfigRows(toPostgrestRows())).toEqual(
      parseActiveGovernedConfigRows(governedConfigSeedRows)
    );
  });

  it("normalizes Supabase timestamptz offsets before strict datetime validation", () => {
    const [row] = toPostgrestRows();
    if (row === undefined) {
      throw new Error("governed config seed rows should not be empty.");
    }

    expect(normalizeGovernedConfigRow({ ...row, effective_from: "2026-06-20 00:00:00+00" }).effectiveFrom).toBe(
      "2026-06-20T00:00:00.000Z"
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

function toPostgrestRows(overrides: Partial<Record<string, unknown>> = {}) {
  return governedConfigSeedRows.map((row) => ({
    active: row.active,
    approved_by: row.approvedBy,
    config_hash: sha256CanonicalJson(overrides[row.key] ?? row.valueJson),
    config_version: row.configVersion,
    effective_from: row.effectiveFrom,
    key: row.key,
    value_json: overrides[row.key] ?? row.valueJson
  }));
}
