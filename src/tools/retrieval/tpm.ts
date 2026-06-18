import type { DeductionLine } from "../../types/entities.js";
import type { EvidenceDocument } from "./docs.js";

export function retrieveTpm(line: DeductionLine): EvidenceDocument[] {
  return line.recordIds
    .filter((recordId) => recordId.startsWith("TPM-"))
    .map((recordId) => ({
      documentId: recordId,
      source: "tpm",
      documentType: "trade-promo",
      summary: `Approved TPM support for ${line.lineId}.`,
      recordIds: [line.lineId, recordId]
    }));
}
