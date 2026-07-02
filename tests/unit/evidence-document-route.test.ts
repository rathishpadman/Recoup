import { describe, expect, it } from "vitest";
import { buildEvidenceDocumentResponse } from "../../cockpit/app/api/forensics/evidence-documents/[evidenceId]/route.js";

const podRow = {
  customer_id: "CUST-CREST",
  content_hash: "a".repeat(64),
  document_type: "pod",
  evidence_id: "EVD-POD-S3-L1",
  payload_json: {
    deliveredQuantity: "100",
    invoiceRef: "INV-S3-L1",
    lineId: "S3-L1",
    podSignedFullDelivery: true,
    signedQuantity: "100"
  },
  provenance: "source_generated",
  raw_text: null,
  retrieved_at: "2026-07-01T00:00:00.000Z",
  source_record_id: "POD-S3-L1",
  source_system: "three_pl",
  storage_uri: "supabase://recoup_evidence_documents/EVD-POD-S3-L1"
};

describe("evidence document route rendition", () => {
  it("serves generated POD evidence as a source-generated PDF artifact", async () => {
    const response = buildEvidenceDocumentResponse(podRow);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="EVD-POD-S3-L1.pdf"');
    expect(response.headers.get("x-recoup-evidence-provenance")).toBe("source_generated");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");

    const body = Buffer.from(await response.arrayBuffer()).toString("utf8");
    expect(body).toContain("%PDF-1.4");
    expect(body).toContain("Recoup generated source evidence artifact");
    expect(body).toContain("EVD-POD-S3-L1");
    expect(body).toContain("POD-S3-L1");
    expect(body).toContain("source_generated");
    expect(body).toContain("podSignedFullDelivery: true");
  });

  it("serves generated SAP invoice and remittance evidence as PDF artifacts", async () => {
    const invoiceResponse = buildEvidenceDocumentResponse({
      ...podRow,
      document_type: "sap_invoice",
      evidence_id: "EVD-SAP-INVOICE-S3-L1",
      payload_json: {
        billedAmount: "21300.00",
        customerId: "CUST-CREST",
        invoiceRef: "INV-S3-L1",
        lineId: "S3-L1"
      },
      source_record_id: "INV-S3-L1",
      source_system: "sap_odata",
      storage_uri: "supabase://recoup_evidence_documents/EVD-SAP-INVOICE-S3-L1"
    });
    const remittanceResponse = buildEvidenceDocumentResponse({
      ...podRow,
      document_type: "remittance_advice",
      evidence_id: "EVD-REMIT-S3-L1",
      payload_json: {
        claimAmount: "21300.00",
        deductionRef: "DED-S3-L1",
        invoiceRef: "INV-S3-L1",
        lineId: "S3-L1",
        reasonCode: "SHORTAGE"
      },
      source_record_id: "REMIT-S3-L1",
      source_system: "remittance",
      storage_uri: "supabase://recoup_evidence_documents/EVD-REMIT-S3-L1"
    });

    expect(invoiceResponse.headers.get("content-type")).toBe("application/pdf");
    expect(invoiceResponse.headers.get("content-disposition")).toBe('inline; filename="EVD-SAP-INVOICE-S3-L1.pdf"');
    expect(Buffer.from(await invoiceResponse.arrayBuffer()).toString("utf8")).toContain("billedAmount: 21300.00");

    expect(remittanceResponse.headers.get("content-type")).toBe("application/pdf");
    expect(remittanceResponse.headers.get("content-disposition")).toBe('inline; filename="EVD-REMIT-S3-L1.pdf"');
    expect(Buffer.from(await remittanceResponse.arrayBuffer()).toString("utf8")).toContain("reasonCode: SHORTAGE");
  });

  it("keeps evidence without generated storage on the safe HTML viewer path", async () => {
    const response = buildEvidenceDocumentResponse({
      ...podRow,
      document_type: "bureau_alert",
      evidence_id: "EVD-BUREAU-S3-L1",
      payload_json: {
        alertType: "normal-monitoring",
        customerId: "CUST-CREST",
        lineId: "S3-L1",
        riskScore: 25
      },
      source_record_id: "BUREAU-CUST-CREST",
      source_system: "bureau",
      storage_uri: null
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="EVD-BUREAU-S3-L1.html"');

    const body = await response.text();
    expect(body).toContain("EVD-BUREAU-S3-L1 source evidence document");
    expect(body).toContain("BUREAU-CUST-CREST");
    expect(body).not.toContain("%PDF-");
  });
});
