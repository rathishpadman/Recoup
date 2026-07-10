import { z } from "zod";
import type {
  CreditNegotiationPolicyKey,
  CreditNegotiationPolicyRationaleResult
} from "../services/creditNegotiationPolicy.js";

export type OpenAiPolicyVectorStoreFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface CreditNegotiationPolicyRationaleSearchInput {
  canonicalValueText: string;
  policyHash: string;
  policyKey: CreditNegotiationPolicyKey;
  policyVersion: number;
  question: string;
}

export interface OpenAiCreditNegotiationPolicyRationaleReader {
  searchPolicyRationale(input: CreditNegotiationPolicyRationaleSearchInput): Promise<CreditNegotiationPolicyRationaleResult[]>;
}

export interface OpenAiCreditNegotiationPolicyRationaleReaderOptions {
  apiKey: string;
  fetcher?: OpenAiPolicyVectorStoreFetch;
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
    policy_hash: z.string().min(1),
    policy_key: z.string().min(1),
    policy_version: z.number().int().positive(),
    record_id: z.string().min(1),
    source: z.literal("vector-policy-rationale"),
    value_text: z.string().min(1).optional()
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

export function createOpenAiCreditNegotiationPolicyRationaleReader(
  options: OpenAiCreditNegotiationPolicyRationaleReaderOptions
): OpenAiCreditNegotiationPolicyRationaleReader {
  const fetcher = options.fetcher ?? fetch;
  const maxResults = clampMaxResults(options.maxResults ?? defaultMaxResults);
  const apiKey = options.apiKey.trim();
  const vectorStoreId = options.vectorStoreId.trim();
  if (apiKey.length === 0 || vectorStoreId.length === 0) {
    throw new Error("OpenAI policy vector-store reader requires an API key and vector store id.");
  }

  return {
    async searchPolicyRationale(input) {
      const response = await fetcher(`https://api.openai.com/v1/vector_stores/${encodeURIComponent(vectorStoreId)}/search`, {
        body: JSON.stringify({
          max_num_results: maxResults,
          query: buildPolicyRationaleQuery(input)
        }),
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(`OpenAI policy vector-store search failed with HTTP ${String(response.status)}.`);
      }

      const parsed = searchResponseSchema.parse((await response.json()) as unknown);
      return mapSearchResults(input, parsed.data);
    }
  };
}

function mapSearchResults(
  input: CreditNegotiationPolicyRationaleSearchInput,
  results: readonly SearchResult[]
): CreditNegotiationPolicyRationaleResult[] {
  const seenRecordIds = new Set<string>();
  const rationale: CreditNegotiationPolicyRationaleResult[] = [];

  for (const result of results) {
    if (
      result.attributes.policy_hash !== input.policyHash ||
      result.attributes.policy_key !== input.policyKey ||
      result.attributes.policy_version !== input.policyVersion
    ) {
      continue;
    }
    if (seenRecordIds.has(result.attributes.record_id)) {
      continue;
    }

    seenRecordIds.add(result.attributes.record_id);
    rationale.push({
      content: firstContentText(result),
      policyHash: result.attributes.policy_hash,
      policyKey: result.attributes.policy_key,
      policyVersion: result.attributes.policy_version,
      recordId: result.attributes.record_id,
      source: result.attributes.source,
      ...(result.attributes.value_text === undefined || result.attributes.value_text === input.canonicalValueText
        ? {}
        : { valueConflict: true })
    });
  }

  return rationale;
}

function buildPolicyRationaleQuery(input: CreditNegotiationPolicyRationaleSearchInput): string {
  return [
    `policy_key:${input.policyKey}`,
    `policy_version:${String(input.policyVersion)}`,
    `policy_hash:${input.policyHash}`,
    input.question
  ].join(" ");
}

function firstContentText(result: SearchResult): string {
  const chunk = result.content[0];
  if (chunk === undefined) {
    throw new Error("OpenAI policy vector-store search result did not include content.");
  }

  return stripVectorPolicyValueMetadata(chunk.text);
}

function stripVectorPolicyValueMetadata(text: string): string {
  return text
    .split(/\r?\n/u)
    .filter((line) => !/^\s*value[_\s-]*text\s*:/iu.test(line) && !/^\s*valueText\s*:/u.test(line))
    .join("\n")
    .trim();
}

function clampMaxResults(maxResults: number): number {
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > maxAllowedResults) {
    throw new Error(`OpenAI policy vector-store maxResults must be an integer from 1 to ${String(maxAllowedResults)}.`);
  }

  return maxResults;
}
