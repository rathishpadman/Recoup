import { describe, expect, it } from "vitest";
import {
  buildForensicsReadModelFreshnessRecordIds,
  isForensicsReadModelFresh,
  REQUIRED_EVIDENCE_FRESHNESS_SOURCES
} from "../../src/services/evidenceFreshness.js";
import { buildSyntheticDataset } from "../../src/adapters/syntheticData.js";
import { sourcePortFromSupabaseSnapshots } from "../../src/adapters/supabaseSyntheticSource.js";
import { materializeRealEvidenceDataset } from "../../src/services/evidenceMaterializer.js";

describe("evidence freshness metadata", () => {
  it("tracks freshness for every canonical evidence type, not only SAP", () => {
    expect(REQUIRED_EVIDENCE_FRESHNESS_SOURCES.map((source) => source.documentType).sort()).toEqual([
      "bureau_alert",
      "carrier_damage_report",
      "carrier_photo",
      "contract_pricing",
      "contract_sla",
      "customer_po",
      "edi_812",
      "payment_history",
      "pod",
      "remittance_advice",
      "sap_credit_memo",
      "sap_invoice",
      "tpm_accrual",
      "tpm_promo"
    ]);
    expect(REQUIRED_EVIDENCE_FRESHNESS_SOURCES).toContainEqual({
      documentType: "payment_history",
      freshnessMode: "document_hash_and_retrieved_at",
      sourceSystem: "payment_history"
    });
  });

  it("includes source table, line event, and receipt hashes in the Forensics cache fingerprint", () => {
    const settlementRun = buildSyntheticDataset({ seed: 42 });
    const line = settlementRun.deductionLines.find((candidate) => candidate.lineId === "S3-L1");
    if (line === undefined || line.ruleInput === undefined) {
      throw new Error("Expected S3-L1 fixture rule input.");
    }
    const source = sourcePortFromSupabaseSnapshots({ settlementRun });
    const currentRecordIds = buildForensicsReadModelFreshnessRecordIds({
      reconciliation: {
        mode: "authoritative",
        receipts: [
          {
            claimId: "CLAIM-S3-L1",
            confidenceFactors: { evidenceCount: 2 },
            contentHash: "a".repeat(64),
            derivedRuleInput: line.ruleInput as never,
            deterministicBasis: { comparedEvidenceIds: ["EVD-POD-S3-L1"] },
            evidenceIds: ["EVD-POD-S3-L1"],
            lineId: "S3-L1",
            receiptId: "RECON-S3-L1",
            ruleId: "shortage-pod-mismatch"
          }
        ]
      },
      source,
      sourceTableIdentity: ["recoup_deduction_claims", "recoup_reconciliation_receipts"]
    });

    expect(currentRecordIds).toEqual(expect.arrayContaining(["recoup_deduction_claims", "recoup_reconciliation_receipts"]));
    expect(currentRecordIds).toContain("line:S3-L1");
    expect(currentRecordIds).toContain(`line:S3-L1:event:${line.eventId}`);
    expect(currentRecordIds).toContain("receipt:RECON-S3-L1:content:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(isForensicsReadModelFresh(currentRecordIds, [...currentRecordIds].reverse())).toBe(true);
    expect(isForensicsReadModelFresh(["receipt:RECON-S3-L1:content:old"], currentRecordIds)).toBe(false);
  });

  it("changes the Forensics cache fingerprint when canonical evidence document hashes change behind unchanged receipts", () => {
    const settlementRun = buildSyntheticDataset({ seed: 42 });
    const line = settlementRun.deductionLines.find((candidate) => candidate.lineId === "S3-L1");
    if (line === undefined || line.ruleInput === undefined) {
      throw new Error("Expected S3-L1 fixture rule input.");
    }
    const source = sourcePortFromSupabaseSnapshots({ settlementRun });
    const baseEvidenceDataset = materializeRealEvidenceDataset({ retrievedAt: "2026-07-02T00:00:00.000Z" });
    const receipt = {
      claimId: "CLAIM-S3-L1",
      confidenceFactors: { evidenceCount: 2 },
      contentHash: "a".repeat(64),
      derivedRuleInput: line.ruleInput as never,
      deterministicBasis: { comparedEvidenceIds: ["EVD-POD-S3-L1"] },
      evidenceIds: ["EVD-POD-S3-L1"],
      lineId: "S3-L1",
      receiptId: "RECON-S3-L1",
      ruleId: "shortage-pod-mismatch" as const
    };
    const firstRecordIds = buildForensicsReadModelFreshnessRecordIds({
      reconciliation: {
        evidenceDataset: {
          ...baseEvidenceDataset,
          documents: baseEvidenceDataset.documents.map((document) =>
            document.evidenceId === "EVD-POD-S3-L1" ? { ...document, contentHash: "b".repeat(64) } : document
          )
        },
        mode: "authoritative",
        receipts: [receipt]
      },
      source,
      sourceTableIdentity: ["recoup_evidence_documents", "recoup_reconciliation_receipts"]
    });
    const secondRecordIds = buildForensicsReadModelFreshnessRecordIds({
      reconciliation: {
        evidenceDataset: {
          ...baseEvidenceDataset,
          documents: baseEvidenceDataset.documents.map((document) =>
            document.evidenceId === "EVD-POD-S3-L1" ? { ...document, contentHash: "c".repeat(64) } : document
          )
        },
        mode: "authoritative",
        receipts: [receipt]
      },
      source,
      sourceTableIdentity: ["recoup_evidence_documents", "recoup_reconciliation_receipts"]
    });

    expect(firstRecordIds).toContain("evidence-dataset:EVD-POD-S3-L1:content:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    expect(isForensicsReadModelFresh(firstRecordIds, secondRecordIds)).toBe(false);
  });

  it("changes the Forensics cache fingerprint when raw source-row hashes change behind the same evidence summary", () => {
    const settlementRun = buildSyntheticDataset({ seed: 42 });
    const line = settlementRun.deductionLines[0];
    if (line === undefined) {
      throw new Error("Expected a synthetic deduction line.");
    }
    const source = sourcePortFromSupabaseSnapshots({ settlementRun });
    const first = buildForensicsReadModelFreshnessRecordIds({
      serviceContext: {
        sapEvidenceSource: {
          readEvidence() {
            return [
              {
                documentId: "SAP-90000002",
                documentType: "invoice",
                freshnessRecordIds: ["source-row:recoup_src_sap:SAP-90000002:hash:first"],
                recordIds: [line.lineId, "SAP-90000002"],
                source: "sap",
                summary: "SAP invoice summary"
              }
            ];
          }
        }
      },
      source,
      sourceTableIdentity: ["recoup_src_sap"]
    });
    const second = buildForensicsReadModelFreshnessRecordIds({
      serviceContext: {
        sapEvidenceSource: {
          readEvidence() {
            return [
              {
                documentId: "SAP-90000002",
                documentType: "invoice",
                freshnessRecordIds: ["source-row:recoup_src_sap:SAP-90000002:hash:second"],
                recordIds: [line.lineId, "SAP-90000002"],
                source: "sap",
                summary: "SAP invoice summary"
              }
            ];
          }
        }
      },
      source,
      sourceTableIdentity: ["recoup_src_sap"]
    });

    expect(isForensicsReadModelFresh(first, second)).toBe(false);
  });
});
