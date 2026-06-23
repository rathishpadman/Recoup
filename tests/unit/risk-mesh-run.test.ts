import { describe, expect, it } from "vitest";
import {
  day1BootstrapSeedApprovedBy,
  day1GovernedConfigSeed,
  governedConfigSeedRows,
  parseActiveGovernedConfigRows,
  sha256CanonicalJson
} from "../../config/governed.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import { runRiskMeshClosedLoop } from "../../src/agents/riskMesh.js";
import { buildSyntheticDataset } from "../../src/adapters/syntheticData.js";

const governedConfig = day1GovernedConfigSeed.values;
const source = new SyntheticSource({ seed: 42 });

describe("S6 Risk Mesh closed loop", () => {
  it("runs Harbor through Sentinel, ranked owner-supplied arbitration, partial hold, draft actions, and audit", () => {
    const run = runRiskMeshClosedLoop({ governedConfig, source });

    expect(run.customerId).toBe("CUST-HARBOR");
    expect(run.sentinel.status).toBe("blocked");
    expect(run.sentinel.reason).toBe("source-risk-observation-fields-required");
    expect(run.sentinel.deterministicBasis).toMatchObject({
      rDriftTrigger: "governed-config-snapshot",
      rScoreWeights: "governed-config-snapshot",
      governedConfigSnapshot: "governed-config-snapshot"
    });
    expect(run.arbitration.status).toBe("ranked");
    if (run.arbitration.status !== "ranked") {
      throw new Error("Round 2 owner-supplied option values must rank Harbor arbitration.");
    }
    expect(run.arbitration.resolution).toBe("partial_release_55");
    expect(run.arbitration.rankedOptions.map((option) => [option.optionId, option.weightedValue])).toEqual([
      ["partial_release_55", "0.7575"],
      ["full_release_revised_terms", "0.6600"],
      ["full_release_100", "0.5500"],
      ["full_hold_0", "0.4925"]
    ]);
    expect(run.partialHold.compositeScore.toFixed(2)).toBe("51.25");
    expect(run.partialHold.releaseRatioPercent.toFixed(0)).toBe("55");
    expect(run.holdAction.proposedReleaseAmount.toFixed(2)).toBe("352005.50");
    expect(run.holdAction.proposedBackOrderAmount.toFixed(2)).toBe("288004.50");
    expect(run.holdAction.deterministicBasis).toMatchObject({
      amountSource: "partial-hold-core",
      compositeScore: "51.25",
      releaseRatioPercent: "55"
    });
    expect(run.holdAction.status).toBe("pending_human");
    expect(run.termsAction.status).toBe("pending_human");
    expect(run.termsAction.terms).toBe("2/10 Net-30 + 25% deposit");
    expect(run.termsAction.deterministicBasis).toMatchObject({
      rDriftTrigger: "governed-config-snapshot",
      rScoreWeights: "governed-config-snapshot",
      governedConfigSnapshot: "governed-config-snapshot",
      observedSignals: {
        baselineDsoDays: 32,
        currentDsoDays: 51,
        disputeSpike: true,
        lienSignal: true
      }
    });
    expect(run.auditEntries.every((entry) => entry.entryHash.match(/^[a-f0-9]{64}$/))).toBe(true);
    expect(run.autonomyGauge.mode).toBe("supervised");
  });

  it("uses Supabase recoup_config risk-mesh case values instead of static code values", () => {
    const runtimeGovernedConfig = parseActiveGovernedConfigRows(
      buildSupabaseGovernedConfigRows({
        harbor: {
          ...governedConfig.riskMeshCases.harbor,
          arbitrationPositions: [
            {
              functionName: "credit",
              optionId: "partial-hold",
              position: "DB-backed credit position.",
              recordIds: ["CUST-HARBOR", "6534", "DB-RISK-MESH-POSITION-CREDIT"]
            },
            {
              functionName: "fulfillment",
              optionId: "ship-now",
              position: "DB-backed fulfillment position.",
              recordIds: ["6534", "DB-RISK-MESH-POSITION-FULFILLMENT"]
            },
            {
              functionName: "billing",
              optionId: "revised-terms",
              position: "DB-backed billing position.",
              recordIds: ["CUST-HARBOR", "DB-RISK-MESH-POSITION-BILLING"]
            },
            {
              functionName: "collections",
              optionId: "sentinel-checkpoint",
              position: "DB-backed collections position.",
              recordIds: ["CUST-HARBOR", "DB-RISK-MESH-POSITION-COLLECTIONS"]
            }
          ],
          caseId: "ARB-HARBOR-ORDER-640K",
          customerId: "CUST-HARBOR",
          holdBasis: "DB-backed controlled-release basis.",
          orderAmount: "1000.00",
          orderId: "6534",
          partialHoldScores: {
            customerStrategicValue: 60,
            dsoPaymentDrift: 60,
            orderMargin: 60,
            orderValueVsExposure: 60,
            paymentPattern: 60,
            revenueForecast: 60
          },
          recordIds: ["CUST-HARBOR", "USCU_S04", "6534", "DB-RISK-MESH-CASE"],
          terms: "1/10 Net-45 + 10% deposit",
          termsBasis: "DB-backed terms basis."
        }
      })
    ).values;

    const run = runRiskMeshClosedLoop({ governedConfig: runtimeGovernedConfig, source });

    expect(run.partialHold.compositeScore.toFixed(2)).toBe("60.00");
    expect(run.partialHold.releaseRatioPercent.toFixed(0)).toBe("60");
    expect(run.holdAction.orderAmount.toFixed(2)).toBe("1000.00");
    expect(run.holdAction.proposedReleaseAmount.toFixed(2)).toBe("600.00");
    expect(run.holdAction.proposedBackOrderAmount.toFixed(2)).toBe("400.00");
    expect(run.holdAction.basis).toBe("DB-backed controlled-release basis.");
    expect(run.termsAction.terms).toBe("1/10 Net-45 + 10% deposit");
    expect(run.termsAction.basis).toBe("DB-backed terms basis.");
    expect(run.arbitration.recordIds).toContain("DB-RISK-MESH-POSITION-CREDIT");
  });

  it("allows runtime governed config with owner-supplied option values to return ranked arbitration", () => {
    const runtimeGovernedConfig = parseActiveGovernedConfigRows(
      buildSupabaseGovernedConfigRows({
        harbor: {
          ...governedConfig.riskMeshCases.harbor,
          arbitrationPositions: [
            {
              functionName: "credit",
              optionId: "partial-hold",
              optionValue: "100.00",
              position: "Owner-supplied credit value for controlled release.",
              recordIds: ["CUST-HARBOR", "6534", "DB-RANKED-CREDIT"]
            },
            {
              functionName: "fulfillment",
              optionId: "ship-now",
              optionValue: "80.00",
              position: "Owner-supplied fulfillment value for immediate shipment.",
              recordIds: ["6534", "DB-RANKED-FULFILLMENT"]
            },
            {
              functionName: "billing",
              optionId: "revised-terms",
              optionValue: "120.00",
              position: "Owner-supplied billing value for revised terms.",
              recordIds: ["CUST-HARBOR", "DB-RANKED-BILLING"]
            },
            {
              functionName: "collections",
              optionId: "sentinel-checkpoint",
              optionValue: "70.00",
              position: "Owner-supplied collections value for checkpoint handling.",
              recordIds: ["CUST-HARBOR", "DB-RANKED-COLLECTIONS"]
            }
          ]
        }
      })
    ).values;

    const run = runRiskMeshClosedLoop({ governedConfig: runtimeGovernedConfig, source });

    expect(run.arbitration.status).toBe("ranked");
    if (run.arbitration.status !== "ranked") {
      throw new Error("Expected owner-supplied option values to rank arbitration.");
    }
    expect(run.arbitration.resolution).toBe("partial-hold");
    expect(run.arbitration.rankedOptions.map((option) => [option.optionId, option.weightedValue])).toEqual([
      ["partial-hold", "35.0000"],
      ["ship-now", "24.0000"],
      ["revised-terms", "18.0000"],
      ["sentinel-checkpoint", "14.0000"]
    ]);
    expect(run.holdAction.status).toBe("pending_human");
    expect(run.termsAction.status).toBe("pending_human");
    expect(run.auditTrailValid).toBe(true);
  });

  it("computes a deterministic Crestline M6 gaming-gate component readout from S2/S3/S6 facts", async () => {
    const { evaluateGamingCandidate } = await import("../../src/core/risk.js");
    const dataset = buildSyntheticDataset({ seed: 42 });

    const candidate = evaluateGamingCandidate({
      customerId: "CUST-CRESTLINE",
      deductionLines: dataset.deductionLines,
      gate: governedConfig.gamingGate
    });

    expect(candidate.customerId).toBe("CUST-CRESTLINE");
    expect(candidate.candidate).toBe(true);
    expect(candidate.recordIds).toEqual(
      expect.arrayContaining(["S2-L1", "TPM-CONTRACT-1", "S3-L1", "POD-SIGNED-1", "S6-L1", "PRICE-CLAUSE-1"])
    );
    expect(candidate.behavioralEvidenceIds).toEqual(
      expect.arrayContaining(["TPM-CONTRACT-1", "POD-SIGNED-1", "PRICE-CLAUSE-1"])
    );
    expect(candidate.deterministicBasis.gamingThresholds).toBe("governed-config-snapshot");
    expect(candidate.deterministicBasis.rScoreComponents).toMatchObject({
      invalidLineCount: 6,
      invalidPricingLineCount: 2,
      invalidShortageLineCount: 4,
      promoCorrelationCount: 2,
      thresholdInvalidLineCount: 2,
      thresholdPromoCorrelationCount: 1
    });
    expect(candidate.deterministicBasis.rScoreComponents.invalidValueFloor).toBe("10000.00");
  });
});

function buildSupabaseGovernedConfigRows(riskMeshCases: Record<string, unknown>): unknown[] {
  const rows = governedConfigSeedRows.filter((row) => row.key !== "risk_mesh_cases");
  return [
    ...rows.map((row) => ({
      active: row.active,
      approved_by: row.approvedBy,
      config_hash: row.configHash,
      config_version: row.configVersion,
      effective_from: row.effectiveFrom,
      key: row.key,
      value_json: row.valueJson
    })),
    buildSupabaseConfigRow("risk_mesh_cases", riskMeshCases)
  ];
}

function buildSupabaseConfigRow(key: string, valueJson: Record<string, unknown>): unknown {
  return {
    active: true,
    approved_by: day1BootstrapSeedApprovedBy,
    config_hash: sha256CanonicalJson(valueJson),
    config_version: 1,
    effective_from: "2026-06-20T00:00:00.000Z",
    key,
    value_json: valueJson
  };
}
