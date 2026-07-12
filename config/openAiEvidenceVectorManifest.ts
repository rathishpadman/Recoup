export const openAiEvidenceVectorManifest = "maya-evidence-seed-42-v1";

export const openAiEvidenceVectorDocuments = [
  {
    customerId: "CUST-GREENLEAF",
    documentType: "carrier-report",
    lineId: "S1-L1",
    recordIds: ["S1-L1", "PHOTO-CARRIER-1", "INV-S1-1"],
    scenarioType: "Damaged product, evidence received"
  },
  {
    customerId: "CUST-CRESTLINE",
    documentType: "POD",
    lineId: "S3-L1",
    recordIds: ["S3-L1", "POD-SIGNED-1", "INV-S3-1"],
    scenarioType: "Shortage claim with full signed POD"
  },
  {
    customerId: "CUST-CRESTLINE",
    documentType: "contract",
    lineId: "S6-L1",
    recordIds: ["S6-L1", "PRICE-CLAUSE-1", "INV-S6-1"],
    scenarioType: "Pricing chargeback below contracted price"
  },
  {
    customerId: "CUST-HARBOR",
    documentType: "credit-memo",
    lineId: "S8-L1",
    recordIds: ["S8-L1", "CREDIT-MEMO-1", "INV-S8-1"],
    scenarioType: "Duplicate already-credited deduction"
  }
] as const;

export type OpenAiEvidenceVectorDocument = (typeof openAiEvidenceVectorDocuments)[number];

export function findOpenAiEvidenceVectorDocument(lineId: string): OpenAiEvidenceVectorDocument | undefined {
  return openAiEvidenceVectorDocuments.find((document) => document.lineId === lineId);
}

export function sameRecordIdSet(actual: readonly string[], expected: readonly string[]): boolean {
  const normalizedActual = [...new Set(actual)].sort();
  const normalizedExpected = [...new Set(expected)].sort();
  return normalizedActual.length === normalizedExpected.length
    && normalizedActual.every((recordId, index) => recordId === normalizedExpected[index]);
}
