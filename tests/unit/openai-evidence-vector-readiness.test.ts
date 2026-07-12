import { describe, expect, it, vi } from "vitest";
import { probeOpenAiEvidenceVectorReadiness } from "../../src/services/openAiEvidenceVectorReadiness.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status
  });
}

const now = () => new Date("2026-07-12T05:00:00.000Z");

describe("OpenAI evidence vector readiness", () => {
  it("reports connected only for the governed manifest with exactly four completed files", async () => {
    const fetcher = providerFetcher();
    const result = await probeOpenAiEvidenceVectorReadiness({
      env: { OPENAI_API_KEY: "sk-test", OPENAI_EVIDENCE_VECTOR_STORE_ID: "vs-test" },
      fetcher,
      now
    });

    expect(result).toMatchObject({
      checkedAtIso: "2026-07-12T05:00:00.000Z",
      sourceMode: "live",
      sourceName: "openai-evidence-vector-store",
      status: "connected"
    });
    expect(result.proofItems).toEqual(expect.arrayContaining(["read-only vector-store probe", "4 files indexed"]));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain("sk-test");
    expect(JSON.stringify(result)).not.toContain("vs-test");
  });

  it("fails closed when one indexed file does not match the governed evidence manifest", async () => {
    const invalidFiles = governedVectorFiles();
    const firstFile = invalidFiles[0];
    if (firstFile === undefined) {
      throw new Error("Expected a governed vector file fixture.");
    }
    invalidFiles[0] = {
      ...firstFile,
      attributes: { ...firstFile.attributes, documentType: "contract" }
    };
    const result = await probeOpenAiEvidenceVectorReadiness({
      env: { OPENAI_API_KEY: "sk-test", OPENAI_EVIDENCE_VECTOR_STORE_ID: "vs-test" },
      fetcher: providerFetcher({ files: invalidFiles }),
      now
    });

    expect(result).toMatchObject({ sourceMode: "unavailable", status: "blocked" });
    expect(result.lastError).toBe("OpenAI evidence vector-store manifest or file set failed validation.");
  });

  it("reports degraded while vector files are still indexing", async () => {
    const result = await probeOpenAiEvidenceVectorReadiness({
      env: { OPENAI_API_KEY: "sk-test", OPENAI_EVIDENCE_VECTOR_STORE_ID: "vs-test" },
      fetcher: () => Promise.resolve(response({
        file_counts: { completed: 2, failed: 0, in_progress: 2, total: 4 },
        id: "vs-test",
        metadata: { manifest: "maya-evidence-seed-42-v1" }
      })),
      now
    });

    expect(result).toMatchObject({ sourceMode: "live", status: "degraded" });
    expect(result.lastError).toBe("OpenAI evidence vector-store indexing is incomplete.");
  });

  it.each([
    ["missing manifest", { file_counts: { completed: 4, failed: 0, in_progress: 0, total: 4 }, id: "vs-test", metadata: {} }],
    ["wrong manifest", { file_counts: { completed: 4, failed: 0, in_progress: 0, total: 4 }, id: "vs-test", metadata: { manifest: "other" } }],
    ["wrong complete file count", { file_counts: { completed: 3, failed: 0, in_progress: 0, total: 3 }, id: "vs-test", metadata: { manifest: "maya-evidence-seed-42-v1" } }],
    ["empty store", { file_counts: { completed: 0, failed: 0, in_progress: 0, total: 0 }, id: "vs-test", metadata: { manifest: "maya-evidence-seed-42-v1" } }]
  ])("fails closed for a %s", async (_label, body) => {
    const result = await probeOpenAiEvidenceVectorReadiness({
      env: { OPENAI_API_KEY: "sk-test", OPENAI_EVIDENCE_VECTOR_STORE_ID: "vs-test" },
      fetcher: () => Promise.resolve(response(body)),
      now
    });

    expect(result).toMatchObject({ sourceMode: "unavailable", status: "blocked" });
    expect(result.lastError).toBe("OpenAI evidence vector-store manifest or file set failed validation.");
  });

  it("aborts and fails closed when the provider readiness request exceeds its deadline", async () => {
    let observedSignal: AbortSignal | undefined;
    const result = await probeOpenAiEvidenceVectorReadiness({
      env: { OPENAI_API_KEY: "sk-test", OPENAI_EVIDENCE_VECTOR_STORE_ID: "vs-test" },
      fetcher: (_input, init) => {
        observedSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          observedSignal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          }, { once: true });
        });
      },
      now,
      timeoutMs: 1
    });

    expect(observedSignal?.aborted).toBe(true);
    expect(result).toMatchObject({ sourceMode: "unavailable", status: "blocked" });
    expect(result.lastError).toBe("OpenAI evidence vector-store provider health probe timed out.");
  });

  it("fails closed when the provider response body exceeds the same deadline", async () => {
    const stalledBody = new ReadableStream<Uint8Array>({
      start() {
        // The body intentionally remains open so the provider deadline must end the probe.
      }
    });
    const result = await probeOpenAiEvidenceVectorReadiness({
      env: { OPENAI_API_KEY: "sk-test", OPENAI_EVIDENCE_VECTOR_STORE_ID: "vs-test" },
      fetcher: () => Promise.resolve(new Response(stalledBody, {
        headers: { "content-type": "application/json" },
        status: 200
      })),
      now,
      timeoutMs: 1
    });

    expect(result).toMatchObject({ sourceMode: "unavailable", status: "blocked" });
    expect(result.lastError).toBe("OpenAI evidence vector-store provider health probe timed out.");
  });

  it("fails closed when configuration is missing", async () => {
    const result = await probeOpenAiEvidenceVectorReadiness({ env: {}, now });

    expect(result).toMatchObject({
      sourceMode: "unavailable",
      sourceName: "openai-evidence-vector-store",
      status: "blocked"
    });
    expect(result.lastError).toBe("OpenAI evidence vector-store configuration is incomplete.");
  });

  it.each([401, 403, 404])("fails closed on provider HTTP %s without exposing identifiers", async (status) => {
    const result = await probeOpenAiEvidenceVectorReadiness({
      env: { OPENAI_API_KEY: "sk-test", OPENAI_EVIDENCE_VECTOR_STORE_ID: "vs-test" },
      fetcher: () => Promise.resolve(response({ error: "provider detail" }, status)),
      now
    });

    expect(result).toMatchObject({ sourceMode: "unavailable", status: "blocked" });
    expect(result.lastError).toBe(`OpenAI evidence vector-store probe failed with HTTP ${String(status)}.`);
    expect(JSON.stringify(result)).not.toContain("sk-test");
    expect(JSON.stringify(result)).not.toContain("vs-test");
  });
});

function providerFetcher(input: {
  files?: ReturnType<typeof governedVectorFiles>;
  store?: Record<string, unknown>;
} = {}) {
  const store = input.store ?? {
    file_counts: { completed: 4, failed: 0, in_progress: 0, total: 4 },
    id: "vs-test",
    metadata: { manifest: "maya-evidence-seed-42-v1" }
  };
  const files = input.files ?? governedVectorFiles();
  return vi.fn((request: RequestInfo | URL) => {
    const url = typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
    return Promise.resolve(response(url.endsWith("/files?limit=100") ? { data: files, has_more: false } : store));
  });
}

function governedVectorFiles() {
  return [
    governedVectorFile("S1-L1", "CUST-GREENLEAF", "carrier-report", ["S1-L1", "PHOTO-CARRIER-1", "INV-S1-1"], "Damaged product, evidence received"),
    governedVectorFile("S3-L1", "CUST-CRESTLINE", "POD", ["S3-L1", "POD-SIGNED-1", "INV-S3-1"], "Shortage claim with full signed POD"),
    governedVectorFile("S6-L1", "CUST-CRESTLINE", "contract", ["S6-L1", "PRICE-CLAUSE-1", "INV-S6-1"], "Pricing chargeback below contracted price"),
    governedVectorFile("S8-L1", "CUST-HARBOR", "credit-memo", ["S8-L1", "CREDIT-MEMO-1", "INV-S8-1"], "Duplicate already-credited deduction")
  ];
}

function governedVectorFile(
  lineId: string,
  customerId: string,
  documentType: string,
  recordIds: string[],
  scenarioType: string
) {
  return {
    attributes: {
      customer_id: customerId,
      documentType,
      provenance: "synthetic",
      record_id: lineId,
      recordIds,
      scenario_type: scenarioType,
      source_table: "synthetic_deduction_lines"
    },
    status: "completed"
  };
}
