import type { DeductionLine } from "../../types/entities.js";
import type { EvidenceDocument } from "./docs.js";

export function retrieveBureau(line: DeductionLine): EvidenceDocument[] {
  return line.recordIds
    .filter((recordId) => recordId.startsWith("BUREAU-"))
    .map((recordId) => ({
      documentId: recordId,
      source: "bureau",
      documentType: "bureau-signal",
      summary: `Bureau risk signal anchored to ${recordId}.`,
      recordIds: [line.lineId, recordId]
    }));
}
