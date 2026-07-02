import { materializeRealEvidenceDataset } from "./evidenceMaterializer.js";

export interface RealEvidenceReadinessReport {
  claims: number;
  documents: number;
  frontendMediaProof: "not_checked";
  missingEvidenceIds: string[];
  proofScope: "local_materialized_dataset";
  requiredEvidenceIdsPresent: boolean;
  supabasePersistence: "not_checked";
}

const expectedClaimCount = 20;
const expectedDocumentCount = 114;
const requiredEvidenceIds = ["EVD-POD-S3-L1"];

export function buildRealEvidenceReadinessReport(retrievedAt = new Date().toISOString()): RealEvidenceReadinessReport {
  const dataset = materializeRealEvidenceDataset({ retrievedAt });
  const evidenceIds = new Set(dataset.documents.map((document) => document.evidenceId));
  const missingEvidenceIds = requiredEvidenceIds.filter((evidenceId) => !evidenceIds.has(evidenceId));

  return {
    claims: dataset.claims.length,
    documents: dataset.documents.length,
    frontendMediaProof: "not_checked",
    missingEvidenceIds,
    proofScope: "local_materialized_dataset",
    requiredEvidenceIdsPresent: missingEvidenceIds.length === 0,
    supabasePersistence: "not_checked"
  };
}

export function assertRealEvidenceReadiness(report: RealEvidenceReadinessReport): void {
  const reportMetadata = report as {
    frontendMediaProof?: unknown;
    proofScope?: unknown;
    supabasePersistence?: unknown;
  };

  if (
    report.claims !== expectedClaimCount ||
    report.documents !== expectedDocumentCount ||
    !report.requiredEvidenceIdsPresent ||
    reportMetadata.proofScope !== "local_materialized_dataset" ||
    reportMetadata.supabasePersistence !== "not_checked" ||
    reportMetadata.frontendMediaProof !== "not_checked"
  ) {
    throw new Error(
      `Real evidence readiness failed: expected ${String(expectedClaimCount)} claims, ${String(
        expectedDocumentCount
      )} documents, all required evidence IDs, and local-only proof scope.`
    );
  }
}
