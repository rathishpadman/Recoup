import type { DeductionLine } from "../../types/entities.js";
import type { EvidenceDocument } from "./docs.js";

export function retrieveSap(line: DeductionLine): EvidenceDocument[] {
  return line.recordIds
    .filter((recordId) => recordId.startsWith("INV-"))
    .map((recordId) => ({
      documentId: recordId,
      source: "sap",
      documentType: "invoice",
      summary: `Read-only invoice reference for ${line.lineId}.`,
      recordIds: [line.lineId, recordId]
    }));
}
