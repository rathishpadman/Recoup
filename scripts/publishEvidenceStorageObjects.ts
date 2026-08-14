import { pathToFileURL } from "node:url";
import { loadLocalRuntimeEnvFiles, type RuntimeEnv } from "../config/env.js";
import { materializeRealEvidenceDataset } from "../src/services/evidenceMaterializer.js";
import { evidenceStorageBucket, evidenceStorageObjectPath, evidenceStorageUri } from "../src/services/evidenceStorage.js";
import { renderPodDocumentPdf } from "../src/services/podDocumentPdf.js";

export type EvidenceStoragePublishFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface EvidenceStoragePublishReport {
  bucket: string;
  published: string[];
  status: "pass";
  uploaded: number;
}

const publishApprovalEnv = "RECOUP_EVIDENCE_STORAGE_PUBLISH_APPROVED";
const publishApprovalValue = "approve-evidence-storage-publish";

export async function publishEvidenceStorageObjects(input: {
  env?: RuntimeEnv;
  fetcher?: EvidenceStoragePublishFetch;
  retrievedAt?: string;
} = {}): Promise<EvidenceStoragePublishReport> {
  const env = input.env ?? loadLocalRuntimeEnvFiles();
  if (env[publishApprovalEnv] !== publishApprovalValue) {
    throw new Error(`${publishApprovalEnv}=${publishApprovalValue} is required before evidence storage objects can be published.`);
  }
  const baseUrl = readRequiredEnv(env, "SUPABASE_URL").replace(/\/+$/u, "");
  const serviceRoleKey = readRequiredEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  const fetcher = input.fetcher ?? ((url, init) => fetch(url, init));
  const authHeaders = { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` };

  await ensureBucket(fetcher, baseUrl, authHeaders);

  const dataset = materializeRealEvidenceDataset({ retrievedAt: input.retrievedAt ?? new Date().toISOString() });
  const podDocuments = dataset.documents.filter((document) => document.documentType === "pod");
  const published: string[] = [];

  for (const document of podDocuments) {
    const payload = document.payload as {
      deliveredQuantity?: string;
      invoiceRef?: string;
      podSignedFullDelivery?: boolean;
      signedQuantity?: string;
    };
    const pdf = renderPodDocumentPdf({
      contentHash: document.contentHash,
      customerId: document.customerId,
      deliveredQuantity: payload.deliveredQuantity ?? "0",
      evidenceId: document.evidenceId,
      invoiceRef: payload.invoiceRef ?? "",
      lineId: document.sourceRecordId.replace(/^POD-/u, ""),
      podReference: document.sourceRecordId,
      podSignedFullDelivery: payload.podSignedFullDelivery === true,
      retrievedAt: document.retrievedAt,
      signedQuantity: payload.signedQuantity ?? "0",
      sourceSystem: document.sourceSystem
    });

    const objectPath = evidenceStorageObjectPath(document.documentType, document.evidenceId);
    const uploadResponse = await fetcher(`${baseUrl}/storage/v1/object/${evidenceStorageBucket}/${objectPath}`, {
      body: new Uint8Array(pdf),
      headers: { ...authHeaders, "content-type": "application/pdf", "x-upsert": "true" },
      method: "POST"
    });
    if (!uploadResponse.ok) {
      throw new Error(`Evidence storage upload failed for ${document.evidenceId} with HTTP ${String(uploadResponse.status)}.`);
    }

    const patchResponse = await fetcher(
      `${baseUrl}/rest/v1/recoup_evidence_documents?evidence_id=eq.${encodeURIComponent(document.evidenceId)}`,
      {
        body: JSON.stringify({ storage_uri: evidenceStorageUri(document.documentType, document.evidenceId) }),
        headers: { ...authHeaders, "content-type": "application/json", prefer: "return=minimal" },
        method: "PATCH"
      }
    );
    if (!patchResponse.ok) {
      throw new Error(`Evidence storage URI update failed for ${document.evidenceId} with HTTP ${String(patchResponse.status)}.`);
    }

    published.push(document.evidenceId);
  }

  return { bucket: evidenceStorageBucket, published, status: "pass", uploaded: published.length };
}

async function ensureBucket(
  fetcher: EvidenceStoragePublishFetch,
  baseUrl: string,
  authHeaders: Record<string, string>
): Promise<void> {
  const response = await fetcher(`${baseUrl}/storage/v1/bucket`, {
    body: JSON.stringify({ id: evidenceStorageBucket, name: evidenceStorageBucket, public: false }),
    headers: { ...authHeaders, "content-type": "application/json" },
    method: "POST"
  });
  if (response.ok || response.status === 409) {
    return;
  }

  throw new Error(`Evidence storage bucket creation failed with HTTP ${String(response.status)}.`);
}

function readRequiredEnv(env: RuntimeEnv, key: "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_URL"): string {
  const value = env[key]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${key} is required to publish evidence storage objects.`);
  }

  return value;
}

async function main(): Promise<void> {
  const report = await publishEvidenceStorageObjects();
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Evidence storage publish failed."}\n`);
    process.exitCode = 1;
  });
}
