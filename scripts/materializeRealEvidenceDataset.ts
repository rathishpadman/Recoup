import { materializeRealEvidenceDataset } from "../src/services/evidenceMaterializer.js";

const dataset = materializeRealEvidenceDataset({ retrievedAt: new Date().toISOString() });

process.stdout.write(
  `${JSON.stringify({
    claims: dataset.claims.length,
    documents: dataset.documents.length
  })}\n`
);
