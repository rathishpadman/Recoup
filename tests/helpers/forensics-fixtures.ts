import { retrieveBureau } from "../../src/tools/retrieval/bureau.js";
import { retrieveDocs, type EvidenceDocument } from "../../src/tools/retrieval/docs.js";
import { retrieveTpm } from "../../src/tools/retrieval/tpm.js";
import type { ServiceInvocationContext } from "../../src/services/serviceLayer.js";
import type { DeductionLine } from "../../src/types/entities.js";

export const fixtureForensicsServiceContext: ServiceInvocationContext = {
  requireSupabaseSapEvidence: true,
  requireSupabaseSyntheticEvidence: true,
  sapEvidenceSource: {
    readEvidence(line) {
      return line.recordIds
        .filter((recordId) => recordId.startsWith("INV-"))
        .map((recordId): EvidenceDocument => ({
          documentId: `SAP-${recordId}`,
          documentType: "invoice",
          recordIds: [line.lineId, recordId, `SAP-${recordId}`],
          source: "sap",
          summary: `Test SAP source row for ${recordId}.`
        }));
    }
  },
  syntheticEvidenceSource: {
    readEvidence(connectorName, line) {
      return retrieveFixtureSyntheticEvidence(connectorName, line);
    }
  }
};

function retrieveFixtureSyntheticEvidence(
  connectorName: "bureau" | "docs-repo" | "tpm",
  line: DeductionLine
): EvidenceDocument[] {
  if (connectorName === "bureau") {
    return retrieveBureau(line);
  }
  if (connectorName === "tpm") {
    return retrieveTpm(line);
  }

  return retrieveDocs(line);
}
