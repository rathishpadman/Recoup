import { describe, expect, it } from "vitest";
import { materializeRealEvidenceDataset } from "../../src/services/evidenceMaterializer.js";
import { reconcileDeductionClaim } from "../../src/services/reconciliationEngine.js";

const missingEvidenceCases = [
  { evidenceId: "EVD-TPM-PROMO-S2-L1", lineId: "S2-L1", message: "Missing required tpm_promo evidence for S2-L1." },
  { evidenceId: "EVD-POD-S3-L1", lineId: "S3-L1", message: "Missing required pod evidence for S3-L1." },
  { evidenceId: "EVD-CONTRACT-SLA-S4-L1", lineId: "S4-L1", message: "Missing required contract_sla evidence for S4-L1." },
  { evidenceId: "EVD-CONTRACT-PRICING-S6-L1", lineId: "S6-L1", message: "Missing required contract_pricing evidence for S6-L1." },
  { evidenceId: "EVD-REMIT-S8-L1", lineId: "S8-L1", message: "Missing required remittance_advice evidence for S8-L1." },
  { evidenceId: "EVD-SAP-CREDIT-MEMO-S8-L1", lineId: "S8-L1", message: "Missing required sap_credit_memo evidence for S8-L1." }
] as const;

describe("reconciliation fail-closed missing-evidence matrix", () => {
  it.each(missingEvidenceCases)("fails closed for $evidenceId", ({ evidenceId, lineId, message }) => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
    const claim = dataset.claims.find((item) => item.lineId === lineId);
    if (claim === undefined) {
      throw new Error(`Missing claim ${lineId}.`);
    }
    const documents = dataset.documents.filter((document) => document.evidenceId !== evidenceId);

    expect(() => reconcileDeductionClaim({ claim, documents })).toThrow(message);
  });
});
