import { describe, expect, it } from "vitest";
import { materializeRealEvidenceDataset } from "../../src/services/evidenceMaterializer.js";
import { reconcileDeductionClaim } from "../../src/services/reconciliationEngine.js";

const requiredCases = [
  {
    evidenceIds: ["EVD-CARRIER-REPORT-S1-L1", "EVD-CARRIER-PHOTO-S1-L1", "EVD-REMIT-S1-L1"],
    lineId: "S1-L1",
    ruleId: "damage-evidence-valid"
  },
  {
    evidenceIds: ["EVD-TPM-PROMO-S2-L1", "EVD-TPM-ACCRUAL-S2-L1", "EVD-REMIT-S2-L1"],
    lineId: "S2-L1",
    ruleId: "promo-not-captured"
  },
  {
    evidenceIds: ["EVD-POD-S3-L1", "EVD-REMIT-S3-L1"],
    lineId: "S3-L1",
    ruleId: "shortage-pod-mismatch"
  },
  {
    evidenceIds: ["EVD-CONTRACT-SLA-S4-L1", "EVD-POD-S4-L1", "EVD-REMIT-S4-L1"],
    lineId: "S4-L1",
    ruleId: "otif-fine-valid"
  },
  {
    evidenceIds: ["EVD-CONTRACT-SLA-S5-L1", "EVD-POD-S5-L1", "EVD-REMIT-S5-L1"],
    lineId: "S5-L1",
    ruleId: "otif-timestamp-mismatch"
  },
  {
    evidenceIds: ["EVD-CUSTOMER-PO-S6-L1", "EVD-CONTRACT-PRICING-S6-L1", "EVD-SAP-INVOICE-S6-L1", "EVD-REMIT-S6-L1"],
    lineId: "S6-L1",
    ruleId: "pricing-below-contract"
  },
  {
    evidenceIds: [
      "EVD-TPM-PROMO-S7-L1",
      "EVD-TPM-ACCRUAL-S7-L1",
      "EVD-BUREAU-S7-L1",
      "EVD-PAYMENT-HISTORY-S7-L1",
      "EVD-REMIT-S7-L1"
    ],
    lineId: "S7-L1",
    ruleId: "promo-overclaim"
  },
  {
    evidenceIds: ["EVD-SAP-CREDIT-MEMO-S8-L1", "EVD-REMIT-S8-L1"],
    lineId: "S8-L1",
    ruleId: "duplicate-credit"
  }
] as const;

describe("reconciliation requirements matrix", () => {
  it.each(requiredCases)("derives $ruleId for $lineId from canonical source evidence", ({ evidenceIds, lineId, ruleId }) => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
    const claim = dataset.claims.find((item) => item.lineId === lineId);
    if (claim === undefined) {
      throw new Error(`Missing claim ${lineId}.`);
    }

    const receipt = reconcileDeductionClaim({ claim, documents: dataset.documents });

    expect(receipt.ruleId).toBe(ruleId);
    expect(receipt.receiptId).toBe(`RECON-${lineId}`);
    expect(receipt.evidenceIds).toEqual(expect.arrayContaining([...evidenceIds]));
    expect(receipt.derivedRuleInput).toEqual(expect.objectContaining({ lineId, ruleId }));
    expect(receipt.deterministicBasis["comparedEvidenceIds"]).toEqual(expect.arrayContaining([...evidenceIds]));
    expect(receipt.deterministicBasis["inputFieldEvidence"]).toEqual(expect.any(Object));
    expect(receipt.confidenceFactors["allRequiredEvidencePresent"]).toBe(true);
    expect(receipt.confidenceFactors["evidenceCount"]).toBe(evidenceIds.length);
    expect(receipt.confidenceFactors["provenanceByEvidenceId"]).toEqual(expect.any(Object));
    expect(receipt.contentHash).toMatch(/^[a-f0-9]{64}$/u);
  });
});
