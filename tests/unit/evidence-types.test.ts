import { describe, expect, it } from "vitest";
import {
  CanonicalEvidenceDocumentSchema,
  evidenceContentHash,
  type CanonicalEvidenceDocument
} from "../../src/types/evidence.js";
import { DeductionClaimSchema } from "../../src/types/claims.js";

describe("canonical evidence and claim type contracts", () => {
  it("parses canonical POD evidence and computes a stable content hash", () => {
    const payload = {
      deliveredQuantity: "100",
      signedQuantity: "100",
      signedBy: "NorthBay Receiving",
      signedAt: "2026-06-18T10:15:00.000Z"
    };

    const document = CanonicalEvidenceDocumentSchema.parse({
      contentHash: evidenceContentHash(payload),
      customerId: "CUST-CRESTLINE",
      documentType: "pod",
      evidenceId: "EVD-POD-S3-L1",
      payload,
      provenance: "source_generated",
      retrievedAt: "2026-06-18T10:15:00.000Z",
      sourceRecordId: "POD-S3-L1",
      sourceSystem: "three_pl",
      storageUri: "supabase://recoup_evidence_documents/EVD-POD-S3-L1",
      validFrom: "2026-06-18"
    } satisfies CanonicalEvidenceDocument);

    expect(document.evidenceId).toBe("EVD-POD-S3-L1");
    expect(document.documentType).toBe("pod");
    expect(document.contentHash).toBe("fb7c923c3231a8d6a6bf74bb0c2b3f7dd20f9f876c3d7c8875a094469bf86521");
    expect(evidenceContentHash({ ...payload, signedBy: "NorthBay Receiving" })).toBe(document.contentHash);
  });

  it("rejects canonical evidence when the persisted hash does not match the payload", () => {
    expect(() =>
      CanonicalEvidenceDocumentSchema.parse({
        contentHash: "0".repeat(64),
        customerId: "CUST-CRESTLINE",
        documentType: "pod",
        evidenceId: "EVD-POD-S3-L1",
        payload: {
          deliveredQuantity: "100",
          signedQuantity: "100"
        },
        provenance: "source_generated",
        retrievedAt: "2026-06-18T10:15:00.000Z",
        sourceRecordId: "POD-S3-L1",
        sourceSystem: "three_pl"
      })
    ).toThrow();
  });

  it("rejects unsupported JSON values before hashing", () => {
    expect(() => evidenceContentHash({ values: [undefined] })).toThrow("Evidence payload must be JSON serializable.");
    expect(() => evidenceContentHash({ score: Number.NaN })).toThrow("Evidence payload must contain only finite numbers.");
  });

  it("parses deduction claims without runtime scenario identifiers", () => {
    const claim = DeductionClaimSchema.parse({
      claimAmount: "1400.00",
      claimId: "CLAIM-S3-L1",
      customerId: "CUST-CRESTLINE",
      goldScenarioId: "S3",
      invoiceRef: "INV-S3-L1",
      lineId: "S3-L1",
      reasonCode: "SHORTAGE",
      recordIds: ["S3-L1", "INV-S3-L1", "EVD-REMIT-S3-L1"],
      remittanceEvidenceId: "EVD-REMIT-S3-L1"
    });

    expect(claim.goldScenarioId).toBe("S3");
    expect(claim).not.toHaveProperty("scenarioId");
    expect(claim).not.toHaveProperty("scenario_id");
  });
});
