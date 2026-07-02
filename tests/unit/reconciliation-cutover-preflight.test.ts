import { describe, expect, it } from "vitest";
import { materializeRealEvidenceDataset } from "../../src/services/evidenceMaterializer.js";
import { reconcileDeductionClaim } from "../../src/services/reconciliationEngine.js";
import {
  assertReconciliationCutoverPreflight,
  buildReconciliationCutoverPreflightReport,
  formatReconciliationCutoverPreflightFailureReport,
  formatReconciliationCutoverPreflightReport
} from "../../scripts/preflightReconciliationCutover.js";

describe("reconciliation cutover preflight", () => {
  it("passes only when the read-only cutover preflight response has the required claim, evidence, and receipt IDs with matching hashes", async () => {
    const calls: Array<{ body?: BodyInit | null; url: string }> = [];
    const report = await buildReconciliationCutoverPreflightReport({
      checkedAt: "2026-07-01T00:00:00.000Z",
      env: preflightEnv,
      fetcher: preflightFetcher(calls),
      target: "production"
    });

    expect(report).toMatchObject({
      claims: 20,
      documents: 114,
      documentsMinimum: 114,
      receipts: 20,
      requiredEvidenceIdsPresent: true,
      requiredReceiptIdsPresent: true,
      status: "pass"
    });
    expect(report.missingEvidenceIds).toEqual([]);
    expect(report.missingReceiptIds).toEqual([]);
    expect(report.mismatchedEvidenceHashIds).toEqual([]);
    expect(report.mismatchedReceiptHashIds).toEqual([]);
    expect(() => {
      assertReconciliationCutoverPreflight(report);
    }).not.toThrow();

    const serialized = formatReconciliationCutoverPreflightReport(report);
    expect(serialized).not.toContain(preflightEnv.SUPABASE_SERVICE_ROLE_KEY);
    expect(serialized).not.toContain("payload_json");
    expect(serialized).not.toContain("derived_rule_input_json");
    expect(calls.every((call) => call.body === undefined || call.body === null)).toBe(true);
    expect(calls.map((call) => new URL(call.url).searchParams.get("select"))).toEqual([
      "claim_id,line_id,created_at",
      "evidence_id,content_hash,retrieved_at,created_at",
      "receipt_id,line_id,content_hash,created_at"
    ]);
  });

  it("normalizes PostgREST timestamptz strings before recomputing expected evidence hashes", async () => {
    const report = await buildReconciliationCutoverPreflightReport({
      checkedAt: "2026-07-01T00:00:00.000Z",
      env: preflightEnv,
      fetcher: preflightFetcher([], {
        datasetRetrievedAt: "2026-07-01T15:50:26.499Z",
        evidenceRetrievedAt: "2026-07-01 15:50:26.499+00"
      }),
      target: "production"
    });

    expect(report).toMatchObject({
      claims: 20,
      documents: 114,
      receipts: 20,
      status: "pass"
    });
    expect(report.mismatchedEvidenceHashIds).toEqual([]);
    expect(report.sourceTables.find((sourceTable) => sourceTable.table === "recoup_evidence_documents")?.latestTimestamp).toBe(
      "2026-07-01 15:50:26.499+00"
    );
  });

  it("fails closed with explicit missing IDs when evidence or receipt backfill is incomplete", async () => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-07-01T00:00:00.000Z" });
    const calls: Array<{ body?: BodyInit | null; url: string }> = [];
    const missingEvidenceId = dataset.documents[0]?.evidenceId;
    const missingClaim = dataset.claims[0];
    if (missingEvidenceId === undefined || missingClaim === undefined) {
      throw new Error("Expected materialized evidence and claim fixtures.");
    }
    const missingReceiptId = `RECON-${missingClaim.lineId}`;

    const report = await buildReconciliationCutoverPreflightReport({
      checkedAt: "2026-07-01T00:00:00.000Z",
      env: preflightEnv,
      fetcher: preflightFetcher(calls, {
        missingEvidenceIds: [missingEvidenceId],
        missingReceiptIds: [missingReceiptId]
      }),
      target: "production"
    });

    expect(report.status).toBe("fail");
    expect(report.requiredEvidenceIdsPresent).toBe(false);
    expect(report.requiredReceiptIdsPresent).toBe(false);
    expect(report.missingEvidenceIds).toContain(missingEvidenceId);
    expect(report.missingReceiptIds).toContain(missingReceiptId);
    expect(() => {
      assertReconciliationCutoverPreflight(report);
    }).toThrow("Reconciliation cutover preflight failed");
  });

  it("fails closed when required IDs exist but evidence or receipt hashes do not match expected content", async () => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-07-01T00:00:00.000Z" });
    const mismatchedEvidenceId = dataset.documents[0]?.evidenceId;
    const mismatchedReceiptId = `RECON-${dataset.claims[0]?.lineId ?? ""}`;
    if (mismatchedEvidenceId === undefined || mismatchedReceiptId === "RECON-") {
      throw new Error("Expected materialized evidence and claim fixtures.");
    }

    const report = await buildReconciliationCutoverPreflightReport({
      checkedAt: "2026-07-01T00:00:00.000Z",
      env: preflightEnv,
      fetcher: preflightFetcher([], {
        mismatchedEvidenceIds: [mismatchedEvidenceId],
        mismatchedReceiptIds: [mismatchedReceiptId]
      }),
      target: "production"
    });

    expect(report.status).toBe("fail");
    expect(report.missingEvidenceIds).toEqual([]);
    expect(report.missingReceiptIds).toEqual([]);
    expect(report.mismatchedEvidenceHashIds).toContain(mismatchedEvidenceId);
    expect(report.mismatchedReceiptHashIds).toContain(mismatchedReceiptId);
    expect(() => {
      assertReconciliationCutoverPreflight(report);
    }).toThrow("mismatchedEvidenceHashIds=1");
  });

  it("requires the configured production project ref when target is production", async () => {
    await expect(
      buildReconciliationCutoverPreflightReport({
        checkedAt: "2026-07-01T00:00:00.000Z",
        env: {
          ...preflightEnv,
          RECOUP_PRODUCTION_SUPABASE_PROJECT_REF: "different-project"
        },
        fetcher: preflightFetcher([]),
        target: "production"
      })
    ).rejects.toThrow("SUPABASE_URL host recoup.supabase.co does not match RECOUP_PRODUCTION_SUPABASE_PROJECT_REF");
  });

  it("formats fail-closed CLI errors as structured reports without secrets", () => {
    const serialized = formatReconciliationCutoverPreflightFailureReport({
      checkedAt: "2026-07-01T00:00:00.000Z",
      error: new Error(`Supabase preflight read failed for recoup_deduction_claims with HTTP 404; token ${preflightEnv.SUPABASE_SERVICE_ROLE_KEY}`),
      target: "production"
    });
    const report = JSON.parse(serialized) as {
      checkedAt: string;
      error: string;
      status: string;
      target: string;
    };

    expect(report).toMatchObject({
      checkedAt: "2026-07-01T00:00:00.000Z",
      status: "fail",
      target: "production"
    });
    expect(report.error).toContain("recoup_deduction_claims");
    expect(serialized).not.toContain(preflightEnv.SUPABASE_SERVICE_ROLE_KEY);
    expect(serialized).not.toContain("payload_json");
    expect(serialized).not.toContain("derived_rule_input_json");
  });

  it("formats every failed source-table read instead of racing on the first failure", async () => {
    let caught: unknown;
    try {
      await buildReconciliationCutoverPreflightReport({
        checkedAt: "2026-07-01T00:00:00.000Z",
        env: preflightEnv,
        fetcher: preflightFailingFetcher({
          recoup_deduction_claims: {
            postgrestCode: "PGRST205",
            status: 404
          },
          recoup_evidence_documents: {
            missingColumns: ["evidence_id", "content_hash", "retrieved_at"],
            postgrestCode: "42703",
            status: 400
          },
          recoup_reconciliation_receipts: {
            postgrestCode: "PGRST205",
            status: 404
          }
        }),
        target: "local"
      });
    } catch (error: unknown) {
      caught = error;
    }

    const serialized = formatReconciliationCutoverPreflightFailureReport({
      checkedAt: "2026-07-01T00:00:00.000Z",
      error: caught,
      target: "local"
    });
    const report = JSON.parse(serialized) as {
      error: string;
      sourceReadFailures?: Array<{
        failureKind: string;
        httpStatus?: number;
        missingColumns?: string[];
        postgrestCode?: string;
        table: string;
      }>;
      status: string;
      target: string;
    };

    expect(report).toMatchObject({
      checkedAt: "2026-07-01T00:00:00.000Z",
      error: "Supabase preflight read failed for 3 source tables.",
      status: "fail",
      target: "local"
    });
    expect(report.sourceReadFailures).toEqual([
      {
        failureKind: "missing_table_or_schema_cache",
        httpStatus: 404,
        postgrestCode: "PGRST205",
        table: "recoup_deduction_claims"
      },
      {
        failureKind: "schema_mismatch",
        httpStatus: 400,
        missingColumns: ["evidence_id", "content_hash", "retrieved_at"],
        postgrestCode: "42703",
        table: "recoup_evidence_documents"
      },
      {
        failureKind: "missing_table_or_schema_cache",
        httpStatus: 404,
        postgrestCode: "PGRST205",
        table: "recoup_reconciliation_receipts"
      }
    ]);
    expect(serialized).not.toContain(preflightEnv.SUPABASE_SERVICE_ROLE_KEY);
    expect(serialized).not.toContain("payload_json");
    expect(serialized).not.toContain("derived_rule_input_json");
  });
});

const preflightEnv = {
  RECOUP_PRODUCTION_SUPABASE_PROJECT_REF: "recoup",
  SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
  SUPABASE_URL: "https://recoup.supabase.co"
} as const;

function preflightFetcher(
  calls: Array<{ body?: BodyInit | null; url: string }>,
  options: {
    mismatchedEvidenceIds?: readonly string[];
    mismatchedReceiptIds?: readonly string[];
    datasetRetrievedAt?: string;
    evidenceRetrievedAt?: string;
    missingEvidenceIds?: readonly string[];
    missingReceiptIds?: readonly string[];
  } = {}
) {
  const dataset = materializeRealEvidenceDataset({ retrievedAt: options.datasetRetrievedAt ?? "2026-07-01T00:00:00.000Z" });
  const missingEvidenceIds = new Set(options.missingEvidenceIds ?? []);
  const missingReceiptIds = new Set(options.missingReceiptIds ?? []);
  const mismatchedEvidenceIds = new Set(options.mismatchedEvidenceIds ?? []);
  const mismatchedReceiptIds = new Set(options.mismatchedReceiptIds ?? []);
  const receipts = dataset.claims.map((claim) => reconcileDeductionClaim({ claim, documents: dataset.documents }));

  return (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ ...(init.body === undefined ? {} : { body: init.body }), url });
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({
      accept: "application/json",
      apikey: preflightEnv.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${preflightEnv.SUPABASE_SERVICE_ROLE_KEY}`
    });

    const tableName = new URL(url).pathname.split("/").at(-1);
    if (tableName === "recoup_deduction_claims") {
      return Promise.resolve(
        new Response(
          JSON.stringify(
            dataset.claims.map((claim) => ({
              claim_id: claim.claimId,
              created_at: "2026-07-01T00:00:00.000Z",
              line_id: claim.lineId
            }))
          ),
          { status: 200 }
        )
      );
    }
    if (tableName === "recoup_evidence_documents") {
      return Promise.resolve(
        new Response(
          JSON.stringify(
            dataset.documents
              .filter((document) => !missingEvidenceIds.has(document.evidenceId))
              .map((document) => ({
                content_hash: mismatchedEvidenceIds.has(document.evidenceId) ? "a".repeat(64) : document.contentHash,
                created_at: "2026-07-01T00:00:00.000Z",
                evidence_id: document.evidenceId,
                retrieved_at: options.evidenceRetrievedAt ?? document.retrievedAt
              }))
          ),
          { status: 200 }
        )
      );
    }
    if (tableName === "recoup_reconciliation_receipts") {
      return Promise.resolve(
        new Response(
          JSON.stringify(
            receipts
              .map((receipt) => ({
                content_hash: mismatchedReceiptIds.has(receipt.receiptId) ? "b".repeat(64) : receipt.contentHash,
                created_at: "2026-07-01T00:00:00.000Z",
                line_id: receipt.lineId,
                receipt_id: receipt.receiptId
              }))
              .filter((receipt) => !missingReceiptIds.has(receipt.receipt_id))
          ),
          { status: 200 }
        )
      );
    }

    return Promise.resolve(new Response(JSON.stringify({ error: "unexpected table" }), { status: 404 }));
  };
}

function preflightFailingFetcher(
  failuresByTable: Partial<
    Record<
      "recoup_deduction_claims" | "recoup_evidence_documents" | "recoup_reconciliation_receipts",
      {
        missingColumns?: string[];
        postgrestCode: string;
        status: number;
      }
    >
  >
) {
  return (url: string, init: RequestInit): Promise<Response> => {
    expect(init.method).toBe("GET");
    const tableName = new URL(url).pathname.split("/").at(-1);
    const failure = tableName === undefined ? undefined : failuresByTable[tableName as keyof typeof failuresByTable];
    if (failure === undefined) {
      throw new Error(`Unexpected preflight table ${String(tableName)}.`);
    }
    const select = new URL(url).searchParams.get("select");
    if (select !== null && !select.includes(",")) {
      return Promise.resolve(
        new Response(
          JSON.stringify(
            failure.missingColumns?.includes(select)
              ? {
                  code: "42703",
                  message: `missing column with token ${preflightEnv.SUPABASE_SERVICE_ROLE_KEY}`
                }
              : []
          ),
          { status: failure.missingColumns?.includes(select) === true ? 400 : 200 }
        )
      );
    }

    return Promise.resolve(
      new Response(
        JSON.stringify({
          code: failure.postgrestCode,
          message: `failure with token ${preflightEnv.SUPABASE_SERVICE_ROLE_KEY}`
        }),
        { status: failure.status }
      )
    );
  };
}
