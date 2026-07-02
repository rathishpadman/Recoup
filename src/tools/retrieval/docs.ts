import type { DeductionLine } from "../../types/entities.js";

export type EvidenceDocumentSource = "sap" | "docs" | "tpm" | "bureau" | "remittance" | "supabase";
export type EvidenceDocumentType =
  | "POD"
  | "contract"
  | "trade-promo"
  | "carrier-report"
  | "credit-memo"
  | "invoice"
  | "bureau-signal"
  | "remittance-advice"
  | "edi-remittance";

export interface EvidenceDocumentRetrievalMetadata {
  fileName: string;
  mode: "semantic-vector";
  provenance: "openai-vector-store";
  score: number;
  vectorStoreId: string;
}

export interface EvidenceDocument {
  documentId: string;
  source: EvidenceDocumentSource;
  documentType: EvidenceDocumentType;
  summary: string;
  recordIds: string[];
  freshnessRecordIds?: string[];
  retrieval?: EvidenceDocumentRetrievalMetadata;
}

export function retrieveDocs(line: DeductionLine): EvidenceDocument[] {
  return mergeEvidenceDocuments(
    line,
    line.recordIds
      .filter((recordId) => isDocumentRepositoryRecord(recordId, line.lineId))
      .map((recordId) => ({
        documentId: recordId,
        source: sourceForRecord(recordId),
        documentType: typeForRecord(recordId),
        summary: `${line.scenarioType} proof anchored to ${recordId}.`,
        recordIds: [line.lineId, recordId]
      }))
  );
}

export function mergeEvidenceDocuments(
  line: DeductionLine,
  ...documentGroups: readonly (readonly EvidenceDocument[])[]
): EvidenceDocument[] {
  const documentsById = new Map<string, EvidenceDocument>();

  for (const document of documentGroups.flat()) {
    if (!isEvidenceDocumentRelevant(line, document) || documentsById.has(document.documentId)) {
      continue;
    }

    documentsById.set(document.documentId, {
      ...document,
      recordIds: dedupeRecordIds([line.lineId, document.documentId, ...document.recordIds])
    });
  }

  return [...documentsById.values()];
}

function isDocumentRepositoryRecord(recordId: string, lineId: string): boolean {
  return (
    recordId !== lineId &&
    (recordId.startsWith("POD-") ||
      recordId.startsWith("PHOTO-") ||
      recordId.startsWith("PRICE-") ||
      recordId.startsWith("SLA-") ||
      recordId.startsWith("CREDIT-"))
  );
}

function isEvidenceDocumentRelevant(line: DeductionLine, document: EvidenceDocument): boolean {
  const lineRecordIds = new Set([line.lineId, ...line.recordIds]);

  return document.recordIds.some((recordId) => lineRecordIds.has(recordId)) || lineRecordIds.has(document.documentId);
}

function sourceForRecord(recordId: string): EvidenceDocumentSource {
  if (recordId.startsWith("TPM-")) {
    return "tpm";
  }

  if (recordId.startsWith("POD-") || recordId.startsWith("PHOTO-") || recordId.startsWith("PRICE-") || recordId.startsWith("SLA-")) {
    return "docs";
  }

  if (recordId.startsWith("CREDIT-")) {
    return "supabase";
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

function dedupeRecordIds(recordIds: readonly string[]): string[] {
  return [...new Set(recordIds.filter((recordId) => recordId.trim().length > 0))];
}
