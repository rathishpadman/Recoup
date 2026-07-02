import type { RuntimeEnv } from "../../config/env.js";
import type { ReconciliationReceipt } from "./reconciliationEngine.js";

export type ReconciliationReceiptRepositorySupabaseFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface SupabaseReconciliationReceiptRepositoryOptions {
  fetcher?: ReconciliationReceiptRepositorySupabaseFetch;
  serviceRoleKey: string;
  url: string;
}

export interface SupabaseReconciliationReceiptRepository {
  upsertReconciliationReceipts(receipts: ReconciliationReceipt[]): Promise<void>;
}

export function createSupabaseReconciliationReceiptRepository(
  options: SupabaseReconciliationReceiptRepositoryOptions
): SupabaseReconciliationReceiptRepository {
  const baseUrl = normalizeSupabaseUrl(options.url);
  const fetcher = options.fetcher ?? fetch;

  return {
    async upsertReconciliationReceipts(receipts) {
      await upsertRows(
        fetcher,
        options.serviceRoleKey,
        `${baseUrl}/rest/v1/recoup_reconciliation_receipts?on_conflict=receipt_id`,
        receipts.map(toReconciliationReceiptRow)
      );
    }
  };
}

export function createSupabaseReconciliationReceiptRepositoryFromEnv(
  env: RuntimeEnv,
  fetcher?: ReconciliationReceiptRepositorySupabaseFetch
): SupabaseReconciliationReceiptRepository | undefined {
  if (env.SUPABASE_URL === undefined || env.SUPABASE_SERVICE_ROLE_KEY === undefined) {
    return undefined;
  }

  return createSupabaseReconciliationReceiptRepository({
    ...(fetcher === undefined ? {} : { fetcher }),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    url: env.SUPABASE_URL
  });
}

function toReconciliationReceiptRow(receipt: ReconciliationReceipt) {
  return {
    claim_id: receipt.claimId,
    confidence_factors: receipt.confidenceFactors,
    content_hash: receipt.contentHash,
    derived_rule_input_json: receipt.derivedRuleInput,
    deterministic_basis: receipt.deterministicBasis,
    evidence_ids: receipt.evidenceIds,
    line_id: receipt.lineId,
    receipt_id: receipt.receiptId,
    rule_id: receipt.ruleId
  };
}

async function upsertRows(
  fetcher: ReconciliationReceiptRepositorySupabaseFetch,
  serviceRoleKey: string,
  url: string,
  rows: Array<Record<string, unknown>>
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const response = await fetcher(url, {
    body: JSON.stringify(rows),
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Supabase reconciliation receipt upsert failed with HTTP ${String(response.status)}.`);
  }
}

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/+$/u, "");
}
