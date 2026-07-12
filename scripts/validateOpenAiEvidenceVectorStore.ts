import { pathToFileURL } from "node:url";
import {
  findOpenAiEvidenceVectorDocument,
  sameRecordIdSet
} from "../config/openAiEvidenceVectorManifest.js";
import {
  createOpenAiVectorStoreEvidenceReader,
  type OpenAiVectorStoreEvidenceReader
} from "../src/adapters/openAiVectorStore.js";
import { buildSyntheticDataset } from "../src/adapters/syntheticData.js";

export async function validateOpenAiEvidenceVectorStore(
  env: NodeJS.ProcessEnv = process.env,
  readerOverride?: OpenAiVectorStoreEvidenceReader
): Promise<Array<{
  customerId: string;
  documentTypes: string[];
  evidenceCount: number;
  lineId: string;
  scores: number[];
}>> {
  const apiKey = readRequiredEnv(env, "OPENAI_API_KEY");
  const vectorStoreId = readRequiredEnv(env, "OPENAI_EVIDENCE_VECTOR_STORE_ID");
  const reader = readerOverride ?? createOpenAiVectorStoreEvidenceReader({ apiKey, vectorStoreId });
  const rows = [];

  for (const line of buildSyntheticDataset({ seed: 42 }).deductionLines) {
    const evidence = await reader.searchEvidence(line);
    const governedDocument = findOpenAiEvidenceVectorDocument(line.lineId);
    if (governedDocument === undefined && evidence.length !== 0) {
      throw new Error(`${line.lineId} received out-of-scope OpenAI vector-store evidence.`);
    }
    if (
      governedDocument !== undefined &&
      (evidence.length !== 1 || evidence[0]?.documentType !== governedDocument.documentType)
    ) {
      throw new Error(`${line.lineId} did not retrieve its expected OpenAI vector-store evidence.`);
    }
    if (governedDocument !== undefined) {
      const document = evidence[0];
      if (document === undefined) {
        throw new Error(`${line.lineId} did not retrieve its expected OpenAI vector-store evidence.`);
      }
      if (!sameRecordIdSet(document.recordIds, governedDocument.recordIds)) {
        throw new Error(`${line.lineId} did not return the exact governed record-id set.`);
      }
      if (isProviderIdentifier(document.documentId)) {
        throw new Error(`${line.lineId} exposed a provider evidence identifier.`);
      }
    }

    rows.push({
      customerId: line.customerId,
      documentTypes: evidence.map((item) => item.documentType),
      evidenceCount: evidence.length,
      lineId: line.lineId,
      scores: evidence.map((item) => Number(item.score.toFixed(3)))
    });
  }

  return rows;
}

function isProviderIdentifier(value: string): boolean {
  return /^(?:file-|vs[_-])/u.test(value);
}

function readRequiredEnv(env: NodeJS.ProcessEnv, key: "OPENAI_API_KEY" | "OPENAI_EVIDENCE_VECTOR_STORE_ID"): string {
  const value = env[key]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${key} is required for OpenAI evidence vector-store validation.`);
  }
  return value;
}

async function main(): Promise<void> {
  const rows = await validateOpenAiEvidenceVectorStore();
  console.log(JSON.stringify(rows, null, 2));
  console.log("VECTOR_VALIDATION=PASS");
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "OpenAI evidence vector-store validation failed.");
    process.exitCode = 1;
  });
}
