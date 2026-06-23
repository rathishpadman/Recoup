import { z } from "zod";
import type { DeductionLine } from "../types/entities.js";

export type OpenAiVectorStoreFetch = (url: string, init: RequestInit) => Promise<Response>;

export type OpenAiVectorStoreEvidenceType =
  | "POD"
  | "carrier-report"
  | "contract"
  | "correspondence"
  | "credit-memo"
  | "invoice"
  | "trade-promo";

export interface OpenAiVectorStoreEvidence {
  documentId: string;
  documentType: OpenAiVectorStoreEvidenceType;
  fileName: string;
  provenance: "openai-vector-store";
  recordIds: string[];
  score: number;
  source: "docs";
  summary: string;
}

export interface OpenAiVectorStoreEvidenceReader {
  searchEvidence(line: DeductionLine): Promise<OpenAiVectorStoreEvidence[]>;
}

export interface OpenAiVectorStoreEvidenceReaderOptions {
  apiKey: string;
  fetcher?: OpenAiVectorStoreFetch;
  maxResults?: number;
  vectorStoreId: string;
}

const defaultMaxResults = 5;
const maxAllowedResults = 10;

const searchContentChunkSchema = z.object({
  text: z.string().min(1),
  type: z.literal("text")
});

const searchResultSchema = z.object({
  attributes: z.object({
    documentType: z.enum(["POD", "carrier-report", "contract", "correspondence", "credit-memo", "invoice", "trade-promo"]),
    recordIds: z.array(z.string().min(1)).min(1),
    source_table: z.string().min(1),
    record_id: z.string().min(1),
    customer_id: z.string().min(1),
    scenario_type: z.string().min(1),
    provenance: z.literal("synthetic")
  }),
  content: z.array(searchContentChunkSchema).min(1),
  file_id: z.string().min(1),
  filename: z.string().min(1),
  score: z.number().min(0).max(1)
});

const searchResponseSchema = z.object({
  data: z.array(searchResultSchema)
});

type SearchResult = z.infer<typeof searchResultSchema>;

export function createOpenAiVectorStoreEvidenceReader(
  options: OpenAiVectorStoreEvidenceReaderOptions
): OpenAiVectorStoreEvidenceReader {
  const fetcher = options.fetcher ?? fetch;
  const maxResults = clampMaxResults(options.maxResults ?? defaultMaxResults);
  const apiKey = options.apiKey.trim();
  const vectorStoreId = options.vectorStoreId.trim();
  if (apiKey.length === 0 || vectorStoreId.length === 0) {
    throw new Error("OpenAI vector-store evidence reader requires an API key and vector store id.");
  }

  return {
    async searchEvidence(line) {
      const response = await fetcher(`https://api.openai.com/v1/vector_stores/${encodeURIComponent(vectorStoreId)}/search`, {
        body: JSON.stringify({
          max_num_results: maxResults,
          query: buildEvidenceQuery(line)
        }),
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(`OpenAI vector-store search failed with HTTP ${String(response.status)}.`);
      }

      const parsed = searchResponseSchema.parse((await response.json()) as unknown);
      return mapSearchResults(line, parsed.data);
    }
  };
}

function mapSearchResults(line: DeductionLine, results: readonly SearchResult[]): OpenAiVectorStoreEvidence[] {
  const seenFileIds = new Set<string>();
  const lineRecordIds = new Set([line.lineId, ...line.recordIds]);
  const evidence: OpenAiVectorStoreEvidence[] = [];

  for (const result of results) {
    const resultRecordIds = dedupeRecordIds([...result.attributes.recordIds, result.attributes.record_id]);
    if (
      seenFileIds.has(result.file_id) ||
      result.attributes.customer_id !== line.customerId ||
      result.attributes.scenario_type !== line.scenarioType ||
      !resultRecordIds.some((recordId) => lineRecordIds.has(recordId))
    ) {
      continue;
    }

    seenFileIds.add(result.file_id);
    evidence.push({
      documentId: result.file_id,
      documentType: result.attributes.documentType,
      fileName: result.filename,
      provenance: "openai-vector-store",
      recordIds: resultRecordIds,
      score: result.score,
      source: "docs",
      summary: firstContentText(result)
    });
  }

  return evidence;
}

function buildEvidenceQuery(line: DeductionLine): string {
  return [
    `customer:${line.customerId}`,
    `deduction:${line.lineId}`,
    `scenario:${line.scenarioType}`,
    ...line.recordIds.map((recordId) => `record:${recordId}`)
  ].join(" ");
}

function firstContentText(result: SearchResult): string {
  const chunk = result.content[0];
  if (chunk === undefined) {
    throw new Error("OpenAI vector-store search result did not include content.");
  }

  return chunk.text;
}

function dedupeRecordIds(recordIds: readonly string[]): string[] {
  return [...new Set(recordIds)];
}

function clampMaxResults(maxResults: number): number {
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > maxAllowedResults) {
    throw new Error(`OpenAI vector-store maxResults must be an integer from 1 to ${String(maxAllowedResults)}.`);
  }

  return maxResults;
}
