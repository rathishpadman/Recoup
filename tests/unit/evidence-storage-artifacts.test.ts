import { describe, expect, it } from "vitest";
import {
  evidenceStorageBucket,
  evidenceStorageObjectPath,
  evidenceStorageUri,
  parseEvidenceStorageUri
} from "../../src/services/evidenceStorage.js";
import { renderPodDocumentPdf } from "../../src/services/podDocumentPdf.js";

const podInput = {
  contentHash: "b".repeat(64),
  customerId: "CUST-CRESTLINE",
  deliveredQuantity: "100",
  evidenceId: "EVD-POD-S3-L1",
  invoiceRef: "INV-S3-L1",
  lineId: "S3-L1",
  podReference: "POD-S3-L1",
  podSignedFullDelivery: true,
  retrievedAt: "2026-07-01T00:00:00.000Z",
  signedQuantity: "100",
  sourceSystem: "three_pl"
};

describe("evidence storage locations", () => {
  it("round-trips a stored object URI to its bucket and object path", () => {
    const uri = evidenceStorageUri("pod", "EVD-POD-S3-L1");

    expect(uri).toBe("supabase://storage/recoup-evidence/pod/EVD-POD-S3-L1.pdf");
    expect(evidenceStorageObjectPath("pod", "EVD-POD-S3-L1")).toBe("pod/EVD-POD-S3-L1.pdf");
    expect(parseEvidenceStorageUri(uri)).toEqual({
      bucket: evidenceStorageBucket,
      objectPath: "pod/EVD-POD-S3-L1.pdf"
    });
  });

  it("rejects the legacy row-pointer URI and blank values so they fall back to the rendered artifact", () => {
    expect(parseEvidenceStorageUri("supabase://recoup_evidence_documents/EVD-POD-S3-L1")).toBeUndefined();
    expect(parseEvidenceStorageUri("supabase://storage/recoup-evidence")).toBeUndefined();
    expect(parseEvidenceStorageUri(null)).toBeUndefined();
    expect(parseEvidenceStorageUri("   ")).toBeUndefined();
  });
});

describe("proof of delivery artifact", () => {
  it("renders a delivery receipt carrying the consignment, quantities and provenance", () => {
    const pdf = renderPodDocumentPdf(podInput).toString("latin1");

    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("%%EOF");
    expect(pdf).toContain("PROOF OF DELIVERY");
    expect(pdf).toContain("CUST-CRESTLINE");
    expect(pdf).toContain("INV-S3-L1");
    expect(pdf).toContain("POD-S3-L1");
    expect(pdf).toContain("Received and signed by");
    expect(pdf).toContain("Full consignment signed for without exception.");
    expect(pdf).toContain(podInput.contentHash);
    // Both Helvetica faces must be declared or the bold headings fall back and the layout collapses.
    expect(pdf).toContain("/BaseFont /Helvetica");
    expect(pdf).toContain("/BaseFont /Helvetica-Bold");
  });

  it("states the shortfall when the consignee signed for less than was delivered", () => {
    const pdf = renderPodDocumentPdf({
      ...podInput,
      podSignedFullDelivery: false,
      signedQuantity: "88"
    }).toString("latin1");

    // Parentheses are PDF-escaped in the content stream, so match around them.
    expect(pdf).toContain("Short-signed on delivery: 12 unit");
    expect(pdf).toContain("not accepted by the consignee.");
    expect(pdf).toContain("Signed short.");
    expect(pdf).not.toContain("Full consignment signed for without exception.");
  });
});
