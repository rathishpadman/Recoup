import { describe, expect, it, vi } from "vitest";
import { provisionOpenAiEvidenceVectorStore } from "../../scripts/provisionOpenAiEvidenceVectorStore.js";

const expectedManifest = "maya-evidence-seed-42-v1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status
  });
}

function successfulProvisioningFetcher(input: {
  existingStore?: unknown;
  existingStoreStatus?: number;
  replacementStoreId?: string;
} = {}): { calls: string[]; fetcher: typeof fetch; requestBodies: string[]; signals: Array<AbortSignal | null | undefined> } {
  const calls: string[] = [];
  const requestBodies: string[] = [];
  const signals: Array<AbortSignal | null | undefined> = [];
  let uploadIndex = 0;
  const replacementStoreId = input.replacementStoreId ?? "vs-replacement";
  const fetcher: typeof fetch = (request, init) => {
    const url = stringifyFetchInput(request);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    signals.push(init?.signal);
    if (typeof init?.body === "string") {
      requestBodies.push(init.body);
    }

    if (url.endsWith("/vector_stores/vs-existing") && (init?.method ?? "GET") === "GET") {
      const status = input.existingStoreStatus ?? 200;
      return Promise.resolve(
        status === 200
          ? jsonResponse(
              input.existingStore ?? {
                file_counts: { cancelled: 0, completed: 4, failed: 0, in_progress: 0, total: 4 },
                id: "vs-existing",
                metadata: { manifest: expectedManifest }
              }
            )
          : jsonResponse({ error: "missing" }, status)
      );
    }
    if (url.endsWith("/vector_stores") && init?.method === "POST") {
      return Promise.resolve(jsonResponse({ id: replacementStoreId }));
    }
    if (url.endsWith("/files") && init?.method === "POST") {
      uploadIndex += 1;
      return Promise.resolve(jsonResponse({ id: `file-${String(uploadIndex)}` }));
    }
    if (url.endsWith("/file_batches") && init?.method === "POST") {
      return Promise.resolve(jsonResponse({ id: "batch-1", status: "in_progress" }));
    }
    if (url.endsWith("/file_batches/batch-1") && init?.method === "GET") {
      return Promise.resolve(jsonResponse({ id: "batch-1", status: "completed" }));
    }

    return Promise.resolve(jsonResponse({ error: "unexpected" }, 500));
  };

  return { calls, fetcher, requestBodies, signals };
}

function stringifyFetchInput(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

describe("OpenAI evidence vector-store provisioner", () => {
  it("reuses an exact completed seed manifest without uploading duplicate files", async () => {
    const { calls, fetcher, signals } = successfulProvisioningFetcher();
    const result = await provisionOpenAiEvidenceVectorStore({
      env: { OPENAI_API_KEY: "sk-test", OPENAI_EVIDENCE_VECTOR_STORE_ID: "vs-existing" },
      fetcher,
      updateEnvFile: false
    });

    expect(result).toMatchObject({ createdVectorStore: false, uploadedFileCount: 0, vectorStoreId: "vs-existing" });
    expect(calls).toEqual(["GET https://api.openai.com/v1/vector_stores/vs-existing"]);
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
  });

  it("uploads one seed batch into an empty store with the exact manifest", async () => {
    const { calls, fetcher, signals } = successfulProvisioningFetcher({
      existingStore: {
        file_counts: { cancelled: 0, completed: 0, failed: 0, in_progress: 0, total: 0 },
        id: "vs-existing",
        metadata: { manifest: expectedManifest }
      }
    });

    const result = await provisionOpenAiEvidenceVectorStore({
      env: { OPENAI_API_KEY: "sk-test", OPENAI_EVIDENCE_VECTOR_STORE_ID: "vs-existing" },
      fetcher,
      updateEnvFile: false
    });

    expect(result).toMatchObject({ createdVectorStore: false, uploadedFileCount: 4, vectorStoreId: "vs-existing" });
    expect(calls.filter((call) => call.endsWith("/file_batches") && call.startsWith("POST "))).toHaveLength(1);
    expect(calls.filter((call) => call === "POST https://api.openai.com/v1/files")).toHaveLength(4);
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
  });

  it("fails closed when the configured store has a different manifest", async () => {
    const { calls, fetcher } = successfulProvisioningFetcher({
      existingStore: {
        file_counts: { cancelled: 0, completed: 4, failed: 0, in_progress: 0, total: 4 },
        id: "vs-existing",
        metadata: { manifest: "other-seed" }
      }
    });

    await expect(
      provisionOpenAiEvidenceVectorStore({
        env: { OPENAI_API_KEY: "sk-test", OPENAI_EVIDENCE_VECTOR_STORE_ID: "vs-existing" },
        fetcher,
        updateEnvFile: false
      })
    ).rejects.toThrow("configured vector store does not match the expected evidence manifest");

    expect(calls).toEqual(["GET https://api.openai.com/v1/vector_stores/vs-existing"]);
  });

  it.each([
    { completed: 2, failed: 0, in_progress: 0, total: 2 },
    { completed: 3, failed: 0, in_progress: 1, total: 4 },
    { completed: 3, failed: 1, in_progress: 0, total: 4 }
  ])("fails closed for a nonempty incomplete store with counts %o", async (fileCounts) => {
    const { calls, fetcher } = successfulProvisioningFetcher({
      existingStore: {
        file_counts: { cancelled: 0, ...fileCounts },
        id: "vs-existing",
        metadata: { manifest: expectedManifest }
      }
    });

    await expect(
      provisionOpenAiEvidenceVectorStore({
        env: { OPENAI_API_KEY: "sk-test", OPENAI_EVIDENCE_VECTOR_STORE_ID: "vs-existing" },
        fetcher,
        updateEnvFile: false
      })
    ).rejects.toThrow("configured vector store has a nonempty incomplete evidence manifest");

    expect(calls).toEqual(["GET https://api.openai.com/v1/vector_stores/vs-existing"]);
  });

  it("creates a replacement store when the configured store returns 404", async () => {
    const { calls, fetcher, requestBodies, signals } = successfulProvisioningFetcher({ existingStoreStatus: 404 });
    const writeVectorStoreId = vi.fn<(vectorStoreId: string) => Promise<void>>(() => Promise.resolve());
    const result = await provisionOpenAiEvidenceVectorStore({
      env: { OPENAI_API_KEY: "sk-test", OPENAI_EVIDENCE_VECTOR_STORE_ID: "vs-existing" },
      fetcher,
      updateEnvFile: true,
      writeVectorStoreId
    });

    expect(result).toMatchObject({ createdVectorStore: true, uploadedFileCount: 4, vectorStoreId: "vs-replacement" });
    expect(calls.slice(0, 2)).toEqual([
      "GET https://api.openai.com/v1/vector_stores/vs-existing",
      "POST https://api.openai.com/v1/vector_stores"
    ]);
    expect(requestBodies.some((body) => body.includes(`"manifest":"${expectedManifest}"`))).toBe(true);
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
    expect(writeVectorStoreId).toHaveBeenCalledWith("vs-replacement");
  });

  it.each([401, 403])("fails closed on HTTP %s without creating a replacement store", async (status) => {
    const { calls, fetcher } = successfulProvisioningFetcher({ existingStoreStatus: status });

    await expect(
      provisionOpenAiEvidenceVectorStore({
        env: { OPENAI_API_KEY: "sk-test", OPENAI_EVIDENCE_VECTOR_STORE_ID: "vs-existing" },
        fetcher,
        updateEnvFile: false
      })
    ).rejects.toThrow(`OpenAI validate vector store request failed with HTTP ${String(status)}.`);

    expect(calls).toEqual(["GET https://api.openai.com/v1/vector_stores/vs-existing"]);
  });

  it("aborts a stalled OpenAI request at the configured timeout", async () => {
    const fetcher: typeof fetch = (_request, init) => {
      if (!(init?.signal instanceof AbortSignal)) {
        return Promise.reject(new Error("missing bounded timeout"));
      }

      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new Error("mock request aborted"));
        }, { once: true });
      });
    };

    await expect(
      provisionOpenAiEvidenceVectorStore({
        env: { OPENAI_API_KEY: "sk-test", OPENAI_EVIDENCE_VECTOR_STORE_ID: "vs-existing" },
        fetcher,
        requestTimeoutMs: 5,
        updateEnvFile: false
      })
    ).rejects.toThrow("mock request aborted");
  });

  it("keeps the timeout active while parsing the OpenAI response body", async () => {
    const fetcher: typeof fetch = (_request, init) => {
      const signal = init?.signal;
      if (!(signal instanceof AbortSignal)) {
        return Promise.reject(new Error("missing bounded timeout"));
      }

      return Promise.resolve({
        json: () => new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new Error("mock response body aborted"));
          }, { once: true });
        }),
        ok: true,
        status: 200
      } as Response);
    };
    const provisioning = provisionOpenAiEvidenceVectorStore({
      env: { OPENAI_API_KEY: "sk-test", OPENAI_EVIDENCE_VECTOR_STORE_ID: "vs-existing" },
      fetcher,
      requestTimeoutMs: 5,
      updateEnvFile: false
    });
    const boundedProvisioning = Promise.race([
      provisioning,
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error("test timed out waiting for response-body abort"));
        }, 100);
      })
    ]);

    await expect(boundedProvisioning).rejects.toThrow("mock response body aborted");
  });
});
