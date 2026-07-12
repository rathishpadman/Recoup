import { z } from "zod";
import {
  openAiEvidenceVectorDocuments,
  openAiEvidenceVectorManifest,
  sameRecordIdSet
} from "../../config/openAiEvidenceVectorManifest.js";
import type { RuntimeEnv } from "../../config/env.js";
import type { SourceHealthResult } from "./sourceHealth.js";

export const openAiEvidenceVectorSourceName = "openai-evidence-vector-store";

const expectedEvidenceFileCount = openAiEvidenceVectorDocuments.length;
const defaultProviderHealthProbeTimeoutMs = 10_000;

class ProviderHealthProbeTimeoutError extends Error {}

const vectorStoreResponseSchema = z.object({
  file_counts: z.object({
    completed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    in_progress: z.number().int().nonnegative(),
    total: z.number().int().nonnegative()
  }),
  id: z.string().min(1),
  metadata: z.object({ manifest: z.string().optional() }).passthrough().optional()
});

const vectorStoreFileSchema = z.object({
  attributes: z.object({
    customer_id: z.string().min(1),
    documentType: z.enum(["POD", "carrier-report", "contract", "credit-memo"]),
    provenance: z.literal("synthetic"),
    record_id: z.string().min(1),
    recordIds: z.array(z.string().min(1)).min(1),
    scenario_type: z.string().min(1),
    source_table: z.literal("synthetic_deduction_lines")
  }),
  status: z.literal("completed")
});

const vectorStoreFileListSchema = z.object({
  data: z.array(vectorStoreFileSchema),
  has_more: z.literal(false)
});

export interface OpenAiEvidenceVectorReadinessOptions {
  env?: RuntimeEnv;
  fetcher?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}

export async function probeOpenAiEvidenceVectorReadiness(
  options: OpenAiEvidenceVectorReadinessOptions = {}
): Promise<SourceHealthResult> {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const checkedAtIso = startedAt.toISOString();
  const apiKey = env.OPENAI_API_KEY?.trim();
  const vectorStoreId = env.OPENAI_EVIDENCE_VECTOR_STORE_ID?.trim();
  const base: Pick<SourceHealthResult, "checkedAtIso" | "latencyMs" | "recordIds" | "sourceName"> = {
    checkedAtIso,
    latencyMs: 0,
    recordIds: [openAiEvidenceVectorSourceName],
    sourceName: openAiEvidenceVectorSourceName
  };

  if (apiKey === undefined || apiKey.length === 0 || vectorStoreId === undefined || vectorStoreId.length === 0) {
    return withLatency(startedAt, now, {
      ...base,
      lastError: "OpenAI evidence vector-store configuration is incomplete.",
      proofItems: ["configuration incomplete", "read-only vector-store probe", "external writes blocked"],
      sourceMode: "unavailable",
      status: "blocked"
    });
  }

  try {
    const fetcher = options.fetcher ?? fetch;
    const timeoutMs = options.timeoutMs ?? defaultProviderHealthProbeTimeoutMs;
    const storeUrl = `https://api.openai.com/v1/vector_stores/${encodeURIComponent(vectorStoreId)}`;
    const { body, response } = await requestProviderJson(fetcher, storeUrl, apiKey, timeoutMs);
    if (!response.ok) {
      return withLatency(startedAt, now, {
        ...base,
        lastError: `OpenAI evidence vector-store probe failed with HTTP ${String(response.status)}.`,
        proofItems: ["read-only vector-store probe", "source probe failed", "external writes blocked"],
        sourceMode: "unavailable",
        status: "blocked"
      });
    }

    const parsed = vectorStoreResponseSchema.parse(body);
    const counts = parsed.file_counts;
    const hasGovernedManifest = parsed.metadata?.manifest === openAiEvidenceVectorManifest;
    if (!hasGovernedManifest) {
      return invalidManifestOrFileSet(startedAt, now, base);
    }
    if (counts.failed > 0) {
      return withLatency(startedAt, now, {
        ...base,
        lastError: "OpenAI evidence vector-store indexing reported failed files.",
        proofItems: ["read-only vector-store probe", "indexing failures present", "external writes blocked"],
        sourceMode: "unavailable",
        status: "blocked"
      });
    }
    const isActivelyIndexing =
      counts.total === expectedEvidenceFileCount &&
      counts.in_progress > 0 &&
      counts.completed + counts.in_progress === expectedEvidenceFileCount;
    if (isActivelyIndexing) {
      return withLatency(startedAt, now, {
        ...base,
        lastError: "OpenAI evidence vector-store indexing is incomplete.",
        proofItems: [
          "read-only vector-store probe",
          `${String(counts.completed)} of ${String(counts.total)} files indexed`,
          "external writes blocked"
        ],
        sourceMode: "live",
        status: "degraded"
      });
    }
    const hasExactCompletedFileSet =
      counts.completed === expectedEvidenceFileCount &&
      counts.failed === 0 &&
      counts.in_progress === 0 &&
      counts.total === expectedEvidenceFileCount;
    if (!hasExactCompletedFileSet) {
      return invalidManifestOrFileSet(startedAt, now, base);
    }

    const fileListResult = await requestProviderJson(fetcher, `${storeUrl}/files?limit=100`, apiKey, timeoutMs);
    if (!fileListResult.response.ok) {
      return withLatency(startedAt, now, {
        ...base,
        lastError: `OpenAI evidence vector-store file probe failed with HTTP ${String(fileListResult.response.status)}.`,
        proofItems: ["read-only vector-store file probe", "source probe failed", "external writes blocked"],
        sourceMode: "unavailable",
        status: "blocked"
      });
    }
    const fileList = vectorStoreFileListSchema.parse(fileListResult.body);
    if (!hasExactGovernedFileManifest(fileList.data)) {
      return invalidManifestOrFileSet(startedAt, now, base);
    }

    return withLatency(startedAt, now, {
      ...base,
      proofItems: [
        "read-only vector-store probe",
        `${String(counts.completed)} files indexed`,
        "semantic retrieval index",
        "external writes blocked"
      ],
      sourceMode: "live",
      status: "connected"
    });
  } catch (error) {
    if (error instanceof ProviderHealthProbeTimeoutError) {
      return withLatency(startedAt, now, {
        ...base,
        lastError: "OpenAI evidence vector-store provider health probe timed out.",
        proofItems: ["OpenAI read-only provider health probe", "source probe timed out", "external writes blocked"],
        sourceMode: "unavailable",
        status: "blocked"
      });
    }
    return withLatency(startedAt, now, {
      ...base,
      lastError: "OpenAI evidence vector-store probe returned an invalid or unavailable response.",
      proofItems: ["read-only vector-store probe", "source probe failed", "external writes blocked"],
      sourceMode: "unavailable",
      status: "blocked"
    });
  }
}

async function requestProviderJson(
  fetcher: typeof fetch,
  url: string,
  apiKey: string,
  timeoutMs: number
): Promise<{ body: unknown; response: Response }> {
  const abortController = new AbortController();
  const providerRequest = (async (): Promise<{ body: unknown; response: Response }> => {
    const response = await fetcher(url, {
      headers: { authorization: `Bearer ${apiKey}` },
      method: "GET",
      signal: abortController.signal
    });
    return {
      body: response.ok ? await response.json() as unknown : undefined,
      response
    };
  })();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutRequest = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new ProviderHealthProbeTimeoutError("OpenAI evidence vector-store provider health probe timed out."));
      abortController.abort();
    }, timeoutMs);
  });

  try {
    return await Promise.race([providerRequest, timeoutRequest]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

function hasExactGovernedFileManifest(files: ReadonlyArray<z.infer<typeof vectorStoreFileSchema>>): boolean {
  if (files.length !== openAiEvidenceVectorDocuments.length) {
    return false;
  }
  const filesByLineId = new Map(files.map((file) => [file.attributes.record_id, file]));
  if (filesByLineId.size !== files.length) {
    return false;
  }

  return openAiEvidenceVectorDocuments.every((document) => {
    const file = filesByLineId.get(document.lineId);
    return file !== undefined
      && file.attributes.customer_id === document.customerId
      && file.attributes.documentType === document.documentType
      && file.attributes.scenario_type === document.scenarioType
      && sameRecordIdSet(file.attributes.recordIds, document.recordIds);
  });
}

function invalidManifestOrFileSet(
  startedAt: Date,
  now: () => Date,
  base: Pick<SourceHealthResult, "checkedAtIso" | "latencyMs" | "recordIds" | "sourceName">
): SourceHealthResult {
  return withLatency(startedAt, now, {
    ...base,
    lastError: "OpenAI evidence vector-store manifest or file set failed validation.",
    proofItems: [
      "OpenAI read-only provider health probe",
      "governed manifest or file set invalid",
      "external writes blocked"
    ],
    sourceMode: "unavailable",
    status: "blocked"
  });
}

function withLatency(
  startedAt: Date,
  now: () => Date,
  result: SourceHealthResult
): SourceHealthResult {
  return {
    ...result,
    latencyMs: Math.max(0, now().getTime() - startedAt.getTime())
  };
}
