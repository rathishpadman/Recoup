import { describe, expect, it } from "vitest";
import { materializeRealEvidenceDataset } from "../../src/services/evidenceMaterializer.js";

describe("SAP OData fallback provenance", () => {
  it("keeps generated SAP-shaped rows source_generated until live SAP OData retrieval replaces them", () => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
    const sapDocuments = dataset.documents.filter((document) =>
      document.documentType === "sap_invoice" || document.documentType === "sap_credit_memo"
    );

    expect(sapDocuments.length).toBeGreaterThan(0);
    for (const document of sapDocuments) {
      expect(document).toEqual(
        expect.objectContaining({
          provenance: "source_generated",
          sourceSystem: "sap_odata"
        })
      );
      expect(document.payload["sourceMode"]).toBe("generated-sap-shaped-fallback");
      expect(document.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    }
  });
});
