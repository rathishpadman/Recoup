import { describe, expect, it } from "vitest";
import { materializeRealEvidenceDataset } from "../../src/services/evidenceMaterializer.js";
import { reconcileDeductionClaim } from "../../src/services/reconciliationEngine.js";

describe("reconciliation receipt basis and confidence", () => {
  it("stores source-specific deterministic basis and confidence factors", () => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
    const claim = dataset.claims.find((item) => item.lineId === "S6-L1");
    if (claim === undefined) {
      throw new Error("Missing claim S6-L1.");
    }

    const receipt = reconcileDeductionClaim({ claim, documents: dataset.documents });
    const serialized = JSON.stringify(receipt);
    const comparisonValues = expectRecord(receipt.deterministicBasis["comparisonValues"]);
    const inputFieldEvidence = expectRecord(receipt.deterministicBasis["inputFieldEvidence"]);
    const provenanceByEvidenceId = expectRecord(receipt.confidenceFactors["provenanceByEvidenceId"]);

    expect(comparisonValues["actualPaidAmount"]).toBe("0.00");
    expect(comparisonValues["contractedUnitPrice"]).toBe("9200.00");
    expect(comparisonValues["expectedContractAmount"]).toBe("9200.00");
    expect(comparisonValues["sapInvoiceBilledAmount"]).toBe("9200.00");
    expectStringArrayContaining(receipt.deterministicBasis["comparedEvidenceIds"], [
      "EVD-CUSTOMER-PO-S6-L1",
      "EVD-CONTRACT-PRICING-S6-L1",
      "EVD-SAP-INVOICE-S6-L1",
      "EVD-REMIT-S6-L1"
    ]);
    expect(inputFieldEvidence["actualPaidAmount"]).toEqual(["EVD-CUSTOMER-PO-S6-L1"]);
    expect(inputFieldEvidence["sapInvoiceBilledAmount"]).toEqual(["EVD-SAP-INVOICE-S6-L1"]);
    expect(receipt.confidenceFactors["allRequiredEvidencePresent"]).toBe(true);
    expect(receipt.confidenceFactors["evidenceCount"]).toBe(4);
    expect(provenanceByEvidenceId["EVD-SAP-INVOICE-S6-L1"]).toBe("source_generated");
    expectStringArrayContaining(receipt.confidenceFactors["sourceSystems"], ["contract_repo", "customer_po", "remittance", "sap_odata"]);
    expect(serialized).not.toMatch(/placeholder|stub|synthetic verdict|scenario label|rule_input_json/i);
  });
});

function expectRecord(value: unknown): Record<string, unknown> {
  expect(typeof value).toBe("object");
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected a record.");
  }
  return value as Record<string, unknown>;
}

function expectStringArrayContaining(value: unknown, expected: string[]): void {
  expect(Array.isArray(value)).toBe(true);
  if (!Array.isArray(value)) {
    throw new Error("Expected an array.");
  }
  expect(value.every((item) => typeof item === "string")).toBe(true);
  expect(value).toEqual(expect.arrayContaining(expected));
}
