import type { DeductionLine } from "../../types/entities.js";

export type EvidenceDocumentSource = "sap" | "docs" | "tpm";
export type EvidenceDocumentType = "POD" | "contract" | "trade-promo" | "carrier-report" | "credit-memo" | "invoice";

export interface EvidenceDocument {
  documentId: string;
  source: EvidenceDocumentSource;
  documentType: EvidenceDocumentType;
  summary: string;
  recordIds: string[];
}

export function retrieveDocs(line: DeductionLine): EvidenceDocument[] {
  return line.recordIds
    .filter((recordId) => !recordId.startsWith("INV-") && !recordId.startsWith("TPM-") && recordId !== line.lineId)
    .map((recordId) => ({
      documentId: recordId,
      source: sourceForRecord(recordId),
      documentType: typeForRecord(recordId),
      summary: `${line.scenarioType} proof anchored to ${recordId}.`,
      recordIds: [line.lineId, recordId]
    }));
}

function sourceForRecord(recordId: string): EvidenceDocumentSource {
  if (recordId.startsWith("TPM-")) {
    return "tpm";
  }

  if (recordId.startsWith("POD-") || recordId.startsWith("PHOTO-") || recordId.startsWith("PRICE-") || recordId.startsWith("SLA-")) {
    return "docs";
  }

  return "sap";
}

function typeForRecord(recordId: string): EvidenceDocumentType {
  if (recordId.startsWith("TPM-")) {
    return "trade-promo";
  }

  if (recordId.startsWith("POD-")) {
    return "POD";
  }

  if (recordId.startsWith("PRICE-") || recordId.startsWith("SLA-")) {
    return "contract";
  }

  if (recordId.startsWith("CREDIT-")) {
    return "credit-memo";
  }

  return "carrier-report";
}
