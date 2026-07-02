import { describe, expect, it } from "vitest";
import { materializeRealEvidenceDataset } from "../../src/services/evidenceMaterializer.js";
import { reconcileDeductionClaim } from "../../src/services/reconciliationEngine.js";
import {
  CanonicalEvidenceDocumentSchema,
  evidenceContentHash,
  type CanonicalEvidenceDocument
} from "../../src/types/evidence.js";

describe("reconciliation mutation sensitivity", () => {
  it("fails closed when a POD source field no longer supports the shortage finding", () => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
    const claim = claimByLine(dataset, "S3-L1");
    const baseline = reconcileDeductionClaim({ claim, documents: dataset.documents });
    const mutatedDocuments = mutatePayload(dataset.documents, "EVD-POD-S3-L1", {
      podSignedFullDelivery: false
    });

    expect(baseline.derivedRuleInput).toEqual(expect.objectContaining({ podSignedFullDelivery: true }));
    expect(() => reconcileDeductionClaim({ claim, documents: mutatedDocuments })).toThrow(
      "Unable to derive reconciliation rule for S3-L1 from evidence documents."
    );
  });

  it("fails closed when pricing evidence no longer proves below-contract deduction", () => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
    const claim = claimByLine(dataset, "S6-L1");
    const baseline = reconcileDeductionClaim({ claim, documents: dataset.documents });
    const mutatedDocuments = mutatePayload(dataset.documents, "EVD-CUSTOMER-PO-S6-L1", {
      actualPaidAmount: baseline.derivedRuleInput["contractedUnitPrice"]
    });

    expect(baseline.derivedRuleInput).toEqual(expect.objectContaining({ deductedBelowContractPrice: true }));
    expect(() => reconcileDeductionClaim({ claim, documents: mutatedDocuments })).toThrow(
      "Unable to derive reconciliation rule for S6-L1 from evidence documents."
    );
  });
});

function claimByLine(dataset: ReturnType<typeof materializeRealEvidenceDataset>, lineId: string) {
  const claim = dataset.claims.find((item) => item.lineId === lineId);
  if (claim === undefined) {
    throw new Error(`Missing claim ${lineId}.`);
  }
  return claim;
}

function mutatePayload(
  documents: readonly CanonicalEvidenceDocument[],
  evidenceId: string,
  payloadPatch: Record<string, unknown>
): CanonicalEvidenceDocument[] {
  return documents.map((document) => {
    if (document.evidenceId !== evidenceId) {
      return document;
    }

    const payload = { ...document.payload, ...payloadPatch };
    return CanonicalEvidenceDocumentSchema.parse({
      ...document,
      contentHash: evidenceContentHash(payload),
      payload
    });
  });
}
