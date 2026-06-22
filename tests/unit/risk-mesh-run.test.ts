import { describe, expect, it } from "vitest";
import { runRiskMeshClosedLoop } from "../../src/agents/riskMesh.js";
import { buildSyntheticDataset } from "../../src/adapters/syntheticData.js";

describe("S6 Risk Mesh closed loop", () => {
  it("runs Harbor through Sentinel, blocked arbitration, partial hold, draft actions, and audit", () => {
    const run = runRiskMeshClosedLoop();

    expect(run.customerId).toBe("CUST-HARBOR");
    expect(run.sentinel.status).toBe("blocked");
    expect(run.sentinel.reason).toBe("verify-runtime-config-loader-required");
    expect(run.sentinel.deterministicBasis).toMatchObject({
      rDriftTrigger: "owner-ratified-day-1-seed-present",
      rScoreWeights: "owner-ratified-day-1-seed-present",
      runtimeConfigLoader: "verify-runtime-config-loader-required"
    });
    expect(run.arbitration.status).toBe("blocked");
    expect(run.arbitration.reason).toBe("verify-prod-calibration-required");
    expect(run.partialHold.compositeScore.toFixed(2)).toBe("51.25");
    expect(run.partialHold.releaseRatioPercent.toFixed(0)).toBe("55");
    expect(run.holdAction.proposedReleaseAmount.toFixed(2)).toBe("352000.00");
    expect(run.holdAction.proposedBackOrderAmount.toFixed(2)).toBe("288000.00");
    expect(run.holdAction.status).toBe("pending_human");
    expect(run.termsAction.status).toBe("pending_human");
    expect(run.termsAction.terms).toBe("2/10 Net-30 + deposit/clearance condition");
    expect(run.auditEntries.every((entry) => entry.entryHash.match(/^[a-f0-9]{64}$/))).toBe(true);
    expect(run.autonomyGauge.mode).toBe("supervised");
  });

  it("computes a deterministic Crestline M6 gaming-gate component readout from S2/S3/S6 facts", async () => {
    const { evaluateGamingCandidate } = await import("../../src/core/risk.js");
    const dataset = buildSyntheticDataset({ seed: 42 });

    const candidate = evaluateGamingCandidate({
      customerId: "CUST-CRESTLINE",
      deductionLines: dataset.deductionLines
    });

    expect(candidate.customerId).toBe("CUST-CRESTLINE");
    expect(candidate.candidate).toBe(true);
    expect(candidate.recordIds).toEqual(
      expect.arrayContaining(["S2-L1", "TPM-CONTRACT-1", "S3-L1", "POD-SIGNED-1", "S6-L1", "PRICE-CLAUSE-1"])
    );
    expect(candidate.behavioralEvidenceIds).toEqual(
      expect.arrayContaining(["TPM-CONTRACT-1", "POD-SIGNED-1", "PRICE-CLAUSE-1"])
    );
    expect(candidate.deterministicBasis.gamingThresholds).toBe("owner-ratified-day-1-seed-present");
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
