import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import {
  openAiEvidenceVectorDocuments,
  openAiEvidenceVectorManifest
} from "../config/openAiEvidenceVectorManifest.js";

const envFilePath = ".env.local";
const openAiBaseUrl = "https://api.openai.com/v1";
const vectorStoreName = "Recoup synthetic evidence";
const expectedEvidenceFileCount = openAiEvidenceVectorDocuments.length;
const defaultRequestTimeoutMs = 10_000;
const pollDelayMs = 2_000;
const maxPollAttempts = 30;

type EvidenceDocumentType =
  | "POD"
  | "carrier-report"
  | "contract"
  | "correspondence"
  | "credit-memo"
  | "invoice"
  | "trade-promo";

interface EvidenceAttributes {
  documentType: EvidenceDocumentType;
  recordIds: string[];
  source_table: string;
  record_id: string;
  customer_id: string;
  scenario_type: string;
  provenance: "synthetic";
}

interface EvidenceDossier {
  attributes: EvidenceAttributes;
  body: string;
  fileName: string;
}

export interface OpenAiEvidenceVectorProvisioningEnv {
  OPENAI_API_KEY?: string;
  OPENAI_EVIDENCE_VECTOR_STORE_ID?: string;
}

export interface OpenAiEvidenceVectorProvisionResult {
  createdVectorStore: boolean;
  uploadedFileCount: number;
  vectorStoreId: string;
  wroteEnvFile: boolean;
}

export interface OpenAiEvidenceVectorProvisionOptions {
  env?: OpenAiEvidenceVectorProvisioningEnv;
  fetcher?: typeof fetch;
  requestTimeoutMs?: number;
  updateEnvFile: boolean;
  writeVectorStoreId?: (vectorStoreId: string) => Promise<void>;
}

type FileBatchStatus = "in_progress" | "completed" | "cancelled" | "failed";

interface FileBatch {
  id: string;
  status: FileBatchStatus;
}

interface VectorStoreFileCounts {
  cancelled: number;
  completed: number;
  failed: number;
  inProgress: number;
  total: number;
}

export async function provisionOpenAiEvidenceVectorStore(
  options: OpenAiEvidenceVectorProvisionOptions
): Promise<OpenAiEvidenceVectorProvisionResult> {
  const env = options.env ?? readRuntimeEnv();
  const fetcher = options.fetcher ?? fetch;
  const requestTimeoutMs = readRequestTimeoutMs(options.requestTimeoutMs);
  const apiKey = readRequiredSecret(env, "OPENAI_API_KEY");
  const vectorStore = await createOrReuseVectorStore(
    apiKey,
    env.OPENAI_EVIDENCE_VECTOR_STORE_ID,
    fetcher,
    requestTimeoutMs
  );
  const uploadedFiles = vectorStore.shouldUpload
    ? await uploadEvidenceFiles(apiKey, buildEvidenceDossiers(), fetcher, requestTimeoutMs)
    : [];

  if (uploadedFiles.length > 0) {
    const fileBatch = await attachFilesToVectorStore(
      apiKey,
      vectorStore.id,
      uploadedFiles,
      fetcher,
      requestTimeoutMs
    );
    await waitForFileBatch(apiKey, vectorStore.id, fileBatch.id, fetcher, requestTimeoutMs);
  }

  if (options.updateEnvFile) {
    await (options.writeVectorStoreId ?? writeVectorStoreIdToEnvFile)(vectorStore.id);
  }

  return {
    createdVectorStore: vectorStore.created,
    uploadedFileCount: uploadedFiles.length,
    vectorStoreId: vectorStore.id,
    wroteEnvFile: options.updateEnvFile
  };
}

function readRuntimeEnv(): OpenAiEvidenceVectorProvisioningEnv {
  const envFile = existsSync(envFilePath) ? parseEnv(stripUtf8Bom(readFileSyncUtf8(envFilePath))) : {};
  return {
    ...configuredEnvValues(envFile),
    ...configuredEnvValues(process.env)
  };
}

function readFileSyncUtf8(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function configuredEnvValues(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>
): OpenAiEvidenceVectorProvisioningEnv {
  const env: OpenAiEvidenceVectorProvisioningEnv = {};
  if (isConfiguredValue(source.OPENAI_API_KEY)) {
    env.OPENAI_API_KEY = source.OPENAI_API_KEY;
  }
  if (isConfiguredValue(source.OPENAI_EVIDENCE_VECTOR_STORE_ID)) {
    env.OPENAI_EVIDENCE_VECTOR_STORE_ID = source.OPENAI_EVIDENCE_VECTOR_STORE_ID;
  }

  return env;
}

function readRequiredSecret(
  env: OpenAiEvidenceVectorProvisioningEnv,
  key: keyof OpenAiEvidenceVectorProvisioningEnv
): string {
  const value = env[key];
  if (!isConfiguredValue(value)) {
    throw new Error(`${key} is required in .env.local or the shell environment.`);
  }

  return value.trim();
}

function isConfiguredValue(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function readRequestTimeoutMs(value: number | undefined): number {
  if (value === undefined) {
    return defaultRequestTimeoutMs;
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("OpenAI request timeout must be a positive finite number of milliseconds.");
  }

  return Math.floor(value);
}

async function createOrReuseVectorStore(
  apiKey: string,
  existingVectorStoreId: string | undefined,
  fetcher: typeof fetch,
  requestTimeoutMs: number
): Promise<{ created: boolean; id: string; shouldUpload: boolean }> {
  if (isConfiguredValue(existingVectorStoreId)) {
    const existingId = existingVectorStoreId.trim();
    const { body, response } = await withRequestTimeout(requestTimeoutMs, async (signal) => {
      const response = await fetcher(`${openAiBaseUrl}/vector_stores/${encodeURIComponent(existingId)}`, {
        headers: { authorization: `Bearer ${apiKey}` },
        method: "GET",
        signal
      });
      const body = response.ok ? await response.json() as unknown : undefined;
      return { body, response };
    });
    if (response.ok) {
      const state = readVectorStoreState(body, existingId);
      if (state.manifest !== openAiEvidenceVectorManifest) {
        throw new Error("OpenAI configured vector store does not match the expected evidence manifest.");
      }
      if (isCompletedEvidenceManifest(state.fileCounts)) {
        return { created: false, id: existingId, shouldUpload: false };
      }
      if (isEmptyEvidenceManifest(state.fileCounts)) {
        return { created: false, id: existingId, shouldUpload: true };
      }

      throw new Error("OpenAI configured vector store has a nonempty incomplete evidence manifest.");
    }
    if (response.status !== 404) {
      throw new Error(`OpenAI validate vector store request failed with HTTP ${String(response.status)}.`);
    }
  }

  const response = await openAiJson(apiKey, "create vector store", "/vector_stores", {
    body: JSON.stringify({
      metadata: {
        app: "recoup",
        manifest: openAiEvidenceVectorManifest,
        provenance: "synthetic",
        purpose: "evidence-vector-store"
      },
      name: vectorStoreName
    }),
    headers: { "content-type": "application/json" },
    method: "POST"
  }, fetcher, requestTimeoutMs);

  return { created: true, id: readResponseId(response, "vector store"), shouldUpload: true };
}

async function uploadEvidenceFiles(
  apiKey: string,
  dossiers: readonly EvidenceDossier[],
  fetcher: typeof fetch,
  requestTimeoutMs: number
): Promise<Array<{ attributes: EvidenceAttributes; fileId: string }>> {
  const uploadedFiles: Array<{ attributes: EvidenceAttributes; fileId: string }> = [];

  for (const dossier of dossiers) {
    const form = new FormData();
    form.set("purpose", "assistants");
    form.set("file", new File([dossier.body], dossier.fileName, { type: "text/markdown" }));

    const response = await openAiJson(apiKey, "upload evidence file", "/files", {
      body: form,
      method: "POST"
    }, fetcher, requestTimeoutMs);

    uploadedFiles.push({
      attributes: dossier.attributes,
      fileId: readResponseId(response, "file")
    });
  }

  return uploadedFiles;
}

async function attachFilesToVectorStore(
  apiKey: string,
  vectorStoreId: string,
  uploadedFiles: ReadonlyArray<{ attributes: EvidenceAttributes; fileId: string }>,
  fetcher: typeof fetch,
  requestTimeoutMs: number
): Promise<FileBatch> {
  const response = await openAiJson(apiKey, "create vector store file batch", `/vector_stores/${encodeURIComponent(vectorStoreId)}/file_batches`, {
    body: JSON.stringify({
      files: uploadedFiles.map((uploadedFile) => ({
        attributes: uploadedFile.attributes,
        file_id: uploadedFile.fileId
      }))
    }),
    headers: { "content-type": "application/json" },
    method: "POST"
  }, fetcher, requestTimeoutMs);

  return readFileBatch(response);
}

async function waitForFileBatch(
  apiKey: string,
  vectorStoreId: string,
  fileBatchId: string,
  fetcher: typeof fetch,
  requestTimeoutMs: number
): Promise<void> {
  for (let attempt = 1; attempt <= maxPollAttempts; attempt += 1) {
    const response = await openAiJson(
      apiKey,
      "retrieve vector store file batch",
      `/vector_stores/${encodeURIComponent(vectorStoreId)}/file_batches/${encodeURIComponent(fileBatchId)}`,
      { method: "GET" },
      fetcher,
      requestTimeoutMs
    );
    const fileBatch = readFileBatch(response);

    if (fileBatch.status === "completed") {
      return;
    }

    if (fileBatch.status === "failed" || fileBatch.status === "cancelled") {
      throw new Error(`OpenAI vector store file batch ended with status ${fileBatch.status}.`);
    }

    await sleep(pollDelayMs);
  }

  throw new Error("OpenAI vector store file batch did not complete before the local polling timeout.");
}

async function openAiJson(
  apiKey: string,
  operation: string,
  path: string,
  init: RequestInit,
  fetcher: typeof fetch,
  requestTimeoutMs: number
): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${apiKey}`);

  return withRequestTimeout(requestTimeoutMs, async (signal) => {
    const response = await fetcher(`${openAiBaseUrl}${path}`, {
      ...init,
      headers,
      signal
    });

    if (!response.ok) {
      throw new Error(`OpenAI ${operation} request failed with HTTP ${String(response.status)}.`);
    }

    return await response.json() as unknown;
  });
}

async function withRequestTimeout<T>(
  requestTimeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, requestTimeoutMs);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

function readVectorStoreState(
  response: unknown,
  expectedId: string
): { fileCounts: VectorStoreFileCounts; manifest: string | undefined } {
  if (!isJsonObject(response) || readResponseId(response, "vector store") !== expectedId) {
    throw new Error("OpenAI vector store response did not match the configured store.");
  }
  if (!isJsonObject(response.file_counts)) {
    throw new Error("OpenAI vector store response did not include file counts.");
  }

  return {
    fileCounts: {
      cancelled: readNonNegativeInteger(response.file_counts.cancelled, "cancelled"),
      completed: readNonNegativeInteger(response.file_counts.completed, "completed"),
      failed: readNonNegativeInteger(response.file_counts.failed, "failed"),
      inProgress: readNonNegativeInteger(response.file_counts.in_progress, "in_progress"),
      total: readNonNegativeInteger(response.file_counts.total, "total")
    },
    manifest: isJsonObject(response.metadata) && typeof response.metadata.manifest === "string"
      ? response.metadata.manifest
      : undefined
  };
}

function readNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || typeof value !== "number" || value < 0) {
    throw new Error(`OpenAI vector store response included an invalid ${label} file count.`);
  }

  return value;
}

function isCompletedEvidenceManifest(fileCounts: VectorStoreFileCounts): boolean {
  return fileCounts.completed === expectedEvidenceFileCount
    && fileCounts.total === expectedEvidenceFileCount
    && fileCounts.cancelled === 0
    && fileCounts.failed === 0
    && fileCounts.inProgress === 0;
}

function isEmptyEvidenceManifest(fileCounts: VectorStoreFileCounts): boolean {
  return fileCounts.completed === 0
    && fileCounts.total === 0
    && fileCounts.cancelled === 0
    && fileCounts.failed === 0
    && fileCounts.inProgress === 0;
}

function readResponseId(response: unknown, label: string): string {
  if (!isJsonObject(response) || typeof response.id !== "string" || response.id.trim().length === 0) {
    throw new Error(`OpenAI ${label} response did not include an id.`);
  }

  return response.id;
}

function readFileBatch(response: unknown): FileBatch {
  const id = readResponseId(response, "file batch");
  if (!isJsonObject(response) || !isFileBatchStatus(response.status)) {
    throw new Error("OpenAI file batch response did not include a supported status.");
  }

  return { id, status: response.status };
}

function isFileBatchStatus(value: unknown): value is FileBatchStatus {
  return value === "in_progress" || value === "completed" || value === "cancelled" || value === "failed";
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function writeVectorStoreIdToEnvFile(vectorStoreId: string): Promise<void> {
  const currentBody = existsSync(envFilePath) ? stripUtf8Bom(await readFile(envFilePath, "utf8")) : "";
  await writeFile(envFilePath, upsertEnvValue(currentBody, "OPENAI_EVIDENCE_VECTOR_STORE_ID", vectorStoreId), "utf8");
}

function upsertEnvValue(body: string, key: string, value: string): string {
  const envLine = `${key}=${formatEnvValue(value)}`;
  const matcher = new RegExp(`^${escapeRegExp(key)}=.*$`, "mu");
  if (matcher.test(body)) {
    return body.replace(matcher, envLine);
  }

  const separator = body.length === 0 || body.endsWith("\n") ? "" : "\n";
  return `${body}${separator}${envLine}\n`;
}

function formatEnvValue(value: string): string {
  return /^[A-Za-z0-9_./:@-]+$/u.test(value) ? value : JSON.stringify(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function stripUtf8Bom(body: string): string {
  return body.startsWith("\uFEFF") ? body.slice(1) : body;
}

function buildEvidenceDossiers(): EvidenceDossier[] {
  const summaries: Record<(typeof openAiEvidenceVectorDocuments)[number]["lineId"], string> = {
    "S1-L1": "Carrier damage evidence links the deduction line, photo record, and invoice record for retrieval validation.",
    "S3-L1": "Signed proof of delivery confirms the shortage evidence package is available for the deduction line.",
    "S6-L1": "Contract clause evidence links the pricing dispute to the source invoice and deduction line.",
    "S8-L1": "Credit memo evidence links the duplicate deduction to the prior credit record and source invoice."
  };
  return openAiEvidenceVectorDocuments.map((document) => buildEvidenceDossier({
    customerId: document.customerId,
    documentType: document.documentType,
    recordIds: [document.recordIds[0], document.recordIds[1], document.recordIds[2]],
    scenarioType: document.scenarioType,
    summary: summaries[document.lineId]
  }));
}

function buildEvidenceDossier(input: {
  customerId: string;
  documentType: EvidenceDocumentType;
  recordIds: [string, string, string];
  scenarioType: string;
  summary: string;
}): EvidenceDossier {
  const lineId = input.recordIds[0];
  const attributes: EvidenceAttributes = {
    documentType: input.documentType,
    recordIds: input.recordIds,
    source_table: "synthetic_deduction_lines",
    record_id: lineId,
    customer_id: input.customerId,
    scenario_type: input.scenarioType,
    provenance: "synthetic"
  };

  return {
    attributes,
    fileName: `recoup-synthetic-evidence-${lineId.toLowerCase()}.md`,
    body: [
      `# Recoup synthetic evidence dossier ${lineId}`,
      "",
      `documentType: ${input.documentType}`,
      `recordIds: ${input.recordIds.join(", ")}`,
      `source_table: ${attributes.source_table}`,
      `record_id: ${attributes.record_id}`,
      `customer_id: ${attributes.customer_id}`,
      `scenario_type: ${attributes.scenario_type}`,
      "provenance: synthetic",
      "",
      input.summary,
      "Any monetary values for this record must be computed by Recoup deterministic core code, not by this dossier."
    ].join("\n")
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main(): Promise<void> {
  const result = await provisionOpenAiEvidenceVectorStore({ updateEnvFile: true });
  const action = result.createdVectorStore ? "created" : "reused";
  const envNote = result.wroteEnvFile ? "Updated .env.local with the evidence vector store setting." : "Skipped .env.local update.";

  console.log(`OpenAI evidence vector store ${action}; uploaded ${String(result.uploadedFileCount)} synthetic dossier file(s).`);
  console.log(envNote);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "OpenAI evidence vector store provisioning failed.");
    process.exitCode = 1;
  });
}
