import { describe, expect, it } from "vitest";
import type {
  OpenAiVectorStoreEvidence,
  OpenAiVectorStoreEvidenceReader
} from "../../src/adapters/openAiVectorStore.js";
import { validateOpenAiEvidenceVectorStore } from "../../scripts/validateOpenAiEvidenceVectorStore.js";

const expectedEvidence: ReadonlyMap<
  string,
  { documentType: OpenAiVectorStoreEvidence["documentType"]; recordIds: readonly string[] }
> = new Map([
  ["S1-L1", { documentType: "carrier-report", recordIds: ["S1-L1", "PHOTO-CARRIER-1", "INV-S1-1"] }],
  ["S3-L1", { documentType: "POD", recordIds: ["S3-L1", "POD-SIGNED-1", "INV-S3-1"] }],
  ["S6-L1", { documentType: "contract", recordIds: ["S6-L1", "PRICE-CLAUSE-1", "INV-S6-1"] }],
  ["S8-L1", { documentType: "credit-memo", recordIds: ["S8-L1", "CREDIT-MEMO-1", "INV-S8-1"] }]
]);

describe("OpenAI evidence vector-store validator", () => {
  it("accepts only the exact governed record-id set and returns no provider ids", async () => {
    const rows = await validateOpenAiEvidenceVectorStore(testEnv, exactReader());

    expect(rows.filter((row) => row.evidenceCount > 0).map((row) => row.lineId)).toEqual([
      "S1-L1",
      "S3-L1",
      "S6-L1",
      "S8-L1"
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/(?:file-|vs_)/u);
  });

  it("rejects an otherwise matching dossier with a foreign record id", async () => {
    const reader = exactReader({
      lineId: "S6-L1",
      recordIds: ["S6-L1", "PRICE-CLAUSE-1", "INV-S6-1", "S8-L1"]
    });

    await expect(validateOpenAiEvidenceVectorStore(testEnv, reader)).rejects.toThrow(
      "S6-L1 did not return the exact governed record-id set."
    );
  });

  it("rejects provider-shaped evidence document ids", async () => {
    const reader = exactReader({ documentId: "file-provider-id", lineId: "S3-L1" });

    await expect(validateOpenAiEvidenceVectorStore(testEnv, reader)).rejects.toThrow(
      "S3-L1 exposed a provider evidence identifier."
    );
  });
});

const testEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  OPENAI_API_KEY: "sk-test-not-a-real-secret",
  OPENAI_EVIDENCE_VECTOR_STORE_ID: "vs_test_not_returned"
};

function exactReader(
  override?: { documentId?: string; lineId: string; recordIds?: string[] }
): OpenAiVectorStoreEvidenceReader {
  return {
    searchEvidence(line) {
      const expected = expectedEvidence.get(line.lineId);
      if (expected === undefined) {
        return Promise.resolve([]);
      }

      return Promise.resolve([
        {
          documentId:
            override?.lineId === line.lineId && override.documentId !== undefined
              ? override.documentId
              : `VECTOR-EVIDENCE-${line.lineId}`,
          documentType: expected.documentType,
          fileName: `${line.lineId}.txt`,
          provenance: "openai-vector-store",
          recordIds:
            override?.lineId === line.lineId && override.recordIds !== undefined
              ? override.recordIds
              : [...expected.recordIds],
          score: 0.91,
          source: "docs",
          summary: `Governed vector evidence for ${line.lineId}.`
        }
      ]);
    }
  };
}
