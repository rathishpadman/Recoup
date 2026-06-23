import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

const envFilePath = ".env.local";
const openAiBaseUrl = "https://api.openai.com/v1";
const vectorStoreName = "Recoup synthetic evidence";
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

interface RuntimeEnv {
  OPENAI_API_KEY?: string;
  OPENAI_EVIDENCE_VECTOR_STORE_ID?: string;
}

interface ProvisionResult {
  createdVectorStore: boolean;
  uploadedFileCount: number;
  wroteEnvFile: boolean;
}

interface ProvisionOptions {
  updateEnvFile: boolean;
}

type FileBatchStatus = "in_progress" | "completed" | "cancelled" | "failed";

interface FileBatch {
  id: string;
  status: FileBatchStatus;
}

export async function provisionOpenAiEvidenceVectorStore(options: ProvisionOptions): Promise<ProvisionResult> {
  const env = readRuntimeEnv();
  const apiKey = readRequiredSecret(env, "OPENAI_API_KEY");
  const vectorStore = await createOrReuseVectorStore(apiKey, env.OPENAI_EVIDENCE_VECTOR_STORE_ID);
  const uploadedFiles = await uploadEvidenceFiles(apiKey, buildEvidenceDossiers());
  const fileBatch = await attachFilesToVectorStore(apiKey, vectorStore.id, uploadedFiles);

  await waitForFileBatch(apiKey, vectorStore.id, fileBatch.id);

  if (options.updateEnvFile) {
    await writeVectorStoreIdToEnvFile(vectorStore.id);
  }

  return {
    createdVectorStore: vectorStore.created,
    uploadedFileCount: uploadedFiles.length,
    wroteEnvFile: options.updateEnvFile
  };
}

function readRuntimeEnv(): RuntimeEnv {
  const envFile = existsSync(envFilePath) ? parseEnv(stripUtf8Bom(readFileSyncUtf8(envFilePath))) : {};
  return {
    ...configuredEnvValues(envFile),
    ...configuredEnvValues(process.env)
  };
}

function readFileSyncUtf8(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function configuredEnvValues(source: NodeJS.ProcessEnv | Record<string, string | undefined>): RuntimeEnv {
  const env: RuntimeEnv = {};
  if (isConfiguredValue(source.OPENAI_API_KEY)) {
    env.OPENAI_API_KEY = source.OPENAI_API_KEY;
  }
  if (isConfiguredValue(source.OPENAI_EVIDENCE_VECTOR_STORE_ID)) {
    env.OPENAI_EVIDENCE_VECTOR_STORE_ID = source.OPENAI_EVIDENCE_VECTOR_STORE_ID;
  }

  return env;
}

function readRequiredSecret(env: RuntimeEnv, key: keyof RuntimeEnv): string {
  const value = env[key];
  if (!isConfiguredValue(value)) {
    throw new Error(`${key} is required in .env.local or the shell environment.`);
  }

  return value.trim();
}

function isConfiguredValue(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

async function createOrReuseVectorStore(
  apiKey: string,
  existingVectorStoreId: string | undefined
): Promise<{ created: boolean; id: string }> {
  if (isConfiguredValue(existingVectorStoreId)) {
    return { created: false, id: existingVectorStoreId.trim() };
  }

  const response = await openAiJson(apiKey, "create vector store", "/vector_stores", {
    body: JSON.stringify({
      metadata: {
        app: "recoup",
        provenance: "synthetic",
        purpose: "evidence-vector-store"
      },
      name: vectorStoreName
    }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });

  return { created: true, id: readResponseId(response, "vector store") };
}

async function uploadEvidenceFiles(
  apiKey: string,
  dossiers: readonly EvidenceDossier[]
): Promise<Array<{ attributes: EvidenceAttributes; fileId: string }>> {
  const uploadedFiles: Array<{ attributes: EvidenceAttributes; fileId: string }> = [];

  for (const dossier of dossiers) {
    const form = new FormData();
    form.set("purpose", "assistants");
    form.set("file", new File([dossier.body], dossier.fileName, { type: "text/markdown" }));

    const response = await openAiJson(apiKey, "upload evidence file", "/files", {
      body: form,
      method: "POST"
    });

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
  uploadedFiles: ReadonlyArray<{ attributes: EvidenceAttributes; fileId: string }>
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
  });

  return readFileBatch(response);
}

async function waitForFileBatch(apiKey: string, vectorStoreId: string, fileBatchId: string): Promise<void> {
  for (let attempt = 1; attempt <= maxPollAttempts; attempt += 1) {
    const response = await openAiJson(
      apiKey,
      "retrieve vector store file batch",
      `/vector_stores/${encodeURIComponent(vectorStoreId)}/file_batches/${encodeURIComponent(fileBatchId)}`,
      { method: "GET" }
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

async function openAiJson(apiKey: string, operation: string, path: string, init: RequestInit): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${apiKey}`);

  const response = await fetch(`${openAiBaseUrl}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    throw new Error(`OpenAI ${operation} request failed with HTTP ${String(response.status)}.`);
  }

  return response.json() as Promise<unknown>;
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
  return [
    buildEvidenceDossier({
      customerId: "CUST-GREENLEAF",
      documentType: "carrier-report",
      recordIds: ["S1-L1", "PHOTO-CARRIER-1", "INV-S1-1"],
      scenarioType: "Damaged product, evidence received",
      summary: "Carrier damage evidence links the deduction line, photo record, and invoice record for retrieval validation."
    }),
    buildEvidenceDossier({
      customerId: "CUST-CRESTLINE",
      documentType: "POD",
      recordIds: ["S3-L1", "POD-SIGNED-1", "INV-S3-1"],
      scenarioType: "Shortage claim with full signed POD",
      summary: "Signed proof of delivery confirms the shortage evidence package is available for the deduction line."
    }),
    buildEvidenceDossier({
      customerId: "CUST-CRESTLINE",
      documentType: "contract",
      recordIds: ["S6-L1", "PRICE-CLAUSE-1", "INV-S6-1"],
      scenarioType: "Pricing chargeback below contracted price",
      summary: "Contract clause evidence links the pricing dispute to the source invoice and deduction line."
    }),
    buildEvidenceDossier({
      customerId: "CUST-HARBOR",
      documentType: "credit-memo",
      recordIds: ["S8-L1", "CREDIT-MEMO-1", "INV-S8-1"],
      scenarioType: "Duplicate already-credited deduction",
      summary: "Credit memo evidence links the duplicate deduction to the prior credit record and source invoice."
    })
  ];
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
