import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import { computeRiskScore, evaluateRiskDrift } from "../../src/core/risk.js";

const governedConfig = day1GovernedConfigSeed.values;

describe("risk core", () => {
  it("computes R-score from supplied component values and governed weights", () => {
    const assessment = computeRiskScore({
      customerId: "CUST-HARBOR",
      recordIds: ["CUST-HARBOR", "RISK-FEATURES-HARBOR"],
      componentScores: {
        agingConcentration: 40,
        disputeRate: 60,
        dsoAdp: 70,
        overLimitFrequency: 80
      },
      weights: governedConfig.rScoreWeights
    });

    expect(assessment.status).toBe("computed_from_supplied_components");
    expect(assessment.score.toFixed(2)).toBe("63.50");
    expect(assessment.recordIds).toEqual(["CUST-HARBOR", "RISK-FEATURES-HARBOR"]);
    expect(assessment.deterministicBasis).toEqual({
      componentValueBounds: "caller-supplied-0-100-component-values",
      componentScores: {
        agingConcentration: 40,
        disputeRate: 60,
        dsoAdp: 70,
        overLimitFrequency: 80
      },
      rScoreWeights: "governed-config-snapshot",
      sourceNormalization: "caller-supplied-component-values",
      weightedComponents: {
        agingConcentration: "8.00",
        disputeRate: "15.00",
        dsoAdp: "24.50",
        overLimitFrequency: "16.00"
      }
    });
  });

  it("computes R-drift from supplied observations and governed triggers", () => {
    const assessment = evaluateRiskDrift({
      baselineDisputeRate: 0.1,
      baselineDsoDays: 32,
      baselineRiskTierRank: 1,
      cooldownDaysSinceLastReview: 31,
      currentDisputeRate: 0.16,
      currentDsoDays: 51,
      currentRiskTierRank: 2,
      customerId: "CUST-HARBOR",
      recordIds: ["CUST-HARBOR", "RISK-OBS-HARBOR"],
      trigger: governedConfig.rDriftTrigger
    });

    expect(assessment.status).toBe("computed_from_supplied_observations");
    expect(assessment.drifted).toBe(true);
    expect(assessment.deterministicBasis).toMatchObject({
      computedDisputeRateRelativeIncrease: "0.6000",
      computedDsoIncreaseDays: 19,
      computedRiskTierDowngrade: 1,
      rDriftTrigger: "governed-config-snapshot",
      triggered: {
        cooldownSatisfied: true,
        disputeRateRelativeIncrease: true,
        dsoIncreaseDays: true,
        riskTierDowngrade: true
      }
    });
  });

  it("computes stateless R-drift from DSO observations without inventing dispute or tier signals", () => {
    const assessment = evaluateRiskDrift({
      baselineDsoDays: 32,
      currentDsoDays: 51,
      customerId: "CUST-HARBOR",
      recordIds: ["CUST-HARBOR", "90000036", "90000085"],
      trigger: governedConfig.rDriftTrigger
    });

    expect(assessment.drifted).toBe(true);
    expect(assessment.deterministicBasis).toMatchObject({
      computedDisputeRateRelativeIncrease: null,
      computedDsoIncreaseDays: 19,
      computedRiskTierDowngrade: null,
      observedSignals: {
        baselineDsoDays: 32,
        currentDsoDays: 51
      },
      triggered: {
        cooldownSatisfied: true,
        disputeRateRelativeIncrease: false,
        dsoIncreaseDays: true,
        riskTierDowngrade: false
      }
    });
  });

  it("keeps R-drift below trigger when cooldown has not elapsed", () => {
    const assessment = evaluateRiskDrift({
      baselineDisputeRate: 0.1,
      baselineDsoDays: 32,
      baselineRiskTierRank: 1,
      cooldownDaysSinceLastReview: 10,
      currentDisputeRate: 0.16,
      currentDsoDays: 51,
      currentRiskTierRank: 2,
      customerId: "CUST-HARBOR",
      recordIds: ["CUST-HARBOR", "RISK-OBS-HARBOR"],
      trigger: governedConfig.rDriftTrigger
    });

    expect(assessment.drifted).toBe(false);
    expect(assessment.deterministicBasis.triggered.cooldownSatisfied).toBe(false);
  });

  it("rejects component values that are not supplied finite 0-100 values", () => {
    expect(() =>
      computeRiskScore({
        customerId: "CUST-HARBOR",
        recordIds: ["CUST-HARBOR", "RISK-FEATURES-HARBOR"],
        componentScores: {
          agingConcentration: 40,
          disputeRate: 60,
          dsoAdp: Number.NaN,
          overLimitFrequency: 80
        },
        weights: governedConfig.rScoreWeights
      })
    ).toThrow("R-score component dsoAdp must be a supplied finite 0-100 component value.");

    expect(() =>
      computeRiskScore({
        customerId: "CUST-HARBOR",
        recordIds: ["CUST-HARBOR", "RISK-FEATURES-HARBOR"],
        componentScores: {
          agingConcentration: 40,
          disputeRate: 60,
          dsoAdp: 101,
          overLimitFrequency: 80
        },
        weights: governedConfig.rScoreWeights
      })
    ).toThrow("R-score component dsoAdp must be a supplied finite 0-100 component value.");
  });

  it("rejects computed risk assessments without cited recordIds", () => {
    expect(() =>
      computeRiskScore({
        customerId: "CUST-HARBOR",
        recordIds: [],
        componentScores: {
          agingConcentration: 40,
          disputeRate: 60,
          dsoAdp: 70,
          overLimitFrequency: 80
        },
        weights: governedConfig.rScoreWeights
      })
    ).toThrow("Risk assessments require cited recordIds.");
  });

  it("rejects undefined zero-baseline dispute-rate relative-increase policy", () => {
    expect(() =>
      evaluateRiskDrift({
        baselineDisputeRate: 0,
        baselineDsoDays: 32,
        baselineRiskTierRank: 1,
        cooldownDaysSinceLastReview: 31,
        currentDisputeRate: 0.01,
        currentDsoDays: 51,
        currentRiskTierRank: 2,
        customerId: "CUST-HARBOR",
        recordIds: ["CUST-HARBOR", "RISK-OBS-HARBOR"],
        trigger: governedConfig.rDriftTrigger
      })
    ).toThrow("R-drift dispute-rate relative increase requires a positive baseline dispute rate.");
  });
});
