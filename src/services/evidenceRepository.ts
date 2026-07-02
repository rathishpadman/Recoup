import type { RuntimeEnv } from "../../config/env.js";
import type { DeductionClaim } from "../types/claims.js";
import type { CanonicalEvidenceDocument, EvidenceLink } from "../types/evidence.js";
import type { RealEvidenceDataset } from "./evidenceMaterializer.js";

export type EvidenceRepositorySupabaseFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface SupabaseEvidenceRepositoryOptions {
  fetcher?: EvidenceRepositorySupabaseFetch;
  serviceRoleKey: string;
  url: string;
}

export interface SupabaseEvidenceRepository {
  upsertEvidenceDataset(dataset: RealEvidenceDataset): Promise<void>;
}

export function createSupabaseEvidenceRepository(options: SupabaseEvidenceRepositoryOptions): SupabaseEvidenceRepository {
  const baseUrl = normalizeSupabaseUrl(options.url);
  const fetcher = options.fetcher ?? fetch;

  return {
    async upsertEvidenceDataset(dataset) {
      await upsertRows(fetcher, options.serviceRoleKey, `${baseUrl}/rest/v1/recoup_evidence_documents?on_conflict=evidence_id`, {
        rows: dataset.documents.map(toEvidenceDocumentRow)
      });
      await upsertRows(
        fetcher,
        options.serviceRoleKey,
        `${baseUrl}/rest/v1/recoup_evidence_links?on_conflict=evidence_id,record_id,record_role`,
        {
          rows: dataset.links.map(toEvidenceLinkRow)
        }
      );
      await upsertRows(fetcher, options.serviceRoleKey, `${baseUrl}/rest/v1/recoup_deduction_claims?on_conflict=claim_id`, {
        rows: dataset.claims.map(toDeductionClaimRow)
      });
    }
  };
}

export function createSupabaseEvidenceRepositoryFromEnv(
  env: RuntimeEnv,
  fetcher?: EvidenceRepositorySupabaseFetch
): SupabaseEvidenceRepository | undefined {
  if (env.SUPABASE_URL === undefined || env.SUPABASE_SERVICE_ROLE_KEY === undefined) {
    return undefined;
  }

  return createSupabaseEvidenceRepository({
    ...(fetcher === undefined ? {} : { fetcher }),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    url: env.SUPABASE_URL
  });
}

function toEvidenceDocumentRow(document: CanonicalEvidenceDocument) {
  return {
    content_hash: document.contentHash,
    customer_id: document.customerId,
    document_type: document.documentType,
    evidence_id: document.evidenceId,
    payload_json: document.payload,
    provenance: document.provenance,
    raw_text: document.rawText ?? null,
    retrieved_at: document.retrievedAt,
    source_record_id: document.sourceRecordId,
    source_system: document.sourceSystem,
    storage_uri: document.storageUri ?? null,
    valid_from: document.validFrom ?? null,
    valid_to: document.validTo ?? null
  };
}

function toEvidenceLinkRow(link: EvidenceLink) {
  return {
    evidence_id: link.evidenceId,
    record_id: link.recordId,
    record_role: link.recordRole
  };
}

function toDeductionClaimRow(claim: DeductionClaim) {
  return {
    claim_amount: claim.claimAmount.toFixed(2),
    claim_id: claim.claimId,
    customer_id: claim.customerId,
    invoice_ref: claim.invoiceRef,
    line_id: claim.lineId,
    reason_code: claim.reasonCode,
    record_ids: claim.recordIds,
    remittance_evidence_id: claim.remittanceEvidenceId
  };
}

async function upsertRows(
  fetcher: EvidenceRepositorySupabaseFetch,
  serviceRoleKey: string,
  url: string,
  input: { rows: Array<Record<string, unknown>> }
): Promise<void> {
  if (input.rows.length === 0) {
    return;
  }

  const response = await fetcher(url, {
    body: JSON.stringify(input.rows),
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Supabase evidence upsert failed with HTTP ${String(response.status)}.`);
  }
}

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/+$/u, "");
}
