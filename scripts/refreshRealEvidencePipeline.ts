import { pathToFileURL } from "node:url";
import { loadLocalRuntimeEnvFiles, type RuntimeEnv } from "../config/env.js";
import { createSupabaseEvidenceRepositoryFromEnv, type EvidenceRepositorySupabaseFetch } from "../src/services/evidenceRepository.js";
import { materializeRealEvidenceDataset } from "../src/services/evidenceMaterializer.js";
import { reconcileDeductionClaim } from "../src/services/reconciliationEngine.js";
import {
  createSupabaseReconciliationReceiptRepositoryFromEnv,
  type ReconciliationReceiptRepositorySupabaseFetch
} from "../src/services/reconciliationReceipts.js";

export type RealEvidenceRefreshPipelineFetch = EvidenceRepositorySupabaseFetch & ReconciliationReceiptRepositorySupabaseFetch;
export type RealEvidenceRefreshPipelineStatus = "pass";

export interface RealEvidenceRefreshPipelineReport {
  claims: number;
  documents: number;
  evidenceHashCount: number;
  links: number;
  receiptHashCount: number;
  receipts: number;
  refreshedAt: string;
  status: RealEvidenceRefreshPipelineStatus;
}

const refreshApprovalEnv = "RECOUP_REAL_EVIDENCE_REFRESH_APPROVED";
const refreshApprovalValue = "approve-real-evidence-refresh";

export async function refreshRealEvidencePipeline(input: {
  env?: RuntimeEnv;
  fetcher?: RealEvidenceRefreshPipelineFetch;
  retrievedAt?: string;
} = {}): Promise<RealEvidenceRefreshPipelineReport> {
  const env = input.env ?? loadLocalRuntimeEnvFiles();
  assertRefreshApproved(env);
  const evidenceRepository = createSupabaseEvidenceRepositoryFromEnv(env, input.fetcher);
  const receiptRepository = createSupabaseReconciliationReceiptRepositoryFromEnv(env, input.fetcher);
  if (evidenceRepository === undefined || receiptRepository === undefined) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for real evidence refresh.");
  }

  const refreshedAt = input.retrievedAt ?? new Date().toISOString();
  const dataset = materializeRealEvidenceDataset({ retrievedAt: refreshedAt });
  const receipts = dataset.claims.map((claim) =>
    reconcileDeductionClaim({
      claim,
      documents: dataset.documents
    })
  );

  await evidenceRepository.upsertEvidenceDataset(dataset);
  await receiptRepository.upsertReconciliationReceipts(receipts);

  return {
    claims: dataset.claims.length,
    documents: dataset.documents.length,
    evidenceHashCount: new Set(dataset.documents.map((document) => document.contentHash)).size,
    links: dataset.links.length,
    receiptHashCount: new Set(receipts.map((receipt) => receipt.contentHash)).size,
    receipts: receipts.length,
    refreshedAt,
    status: "pass"
  };
}

function assertRefreshApproved(env: RuntimeEnv): void {
  if (env[refreshApprovalEnv] !== refreshApprovalValue) {
    throw new Error(`${refreshApprovalEnv}=${refreshApprovalValue} is required before real evidence refresh can upsert rows.`);
  }
}

export function formatRealEvidenceRefreshPipelineReport(report: RealEvidenceRefreshPipelineReport): string {
  return `${JSON.stringify(report)}\n`;
}

async function main(): Promise<void> {
  const report = await refreshRealEvidencePipeline();
  process.stdout.write(formatRealEvidenceRefreshPipelineReport(report));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Real evidence refresh failed."}\n`);
    process.exitCode = 1;
  });
}
