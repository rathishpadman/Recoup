import { describe, expect, it } from "vitest";
import { buildReconciliationCutoverRepairPlanFromPreflight } from "../../scripts/planReconciliationCutoverRepair.js";

describe("reconciliation cutover repair plan", () => {
  it("builds an approval-only schema repair plan from sanitized preflight source read failures", () => {
    const plan = buildReconciliationCutoverRepairPlanFromPreflight({
      checkedAt: "2026-07-01T00:00:00.000Z",
      error: "Supabase preflight read failed for 3 source tables.",
      sourceReadFailures: [
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
      ],
      status: "fail",
      target: "local"
    });

    expect(plan).toMatchObject({
      checkedAt: "2026-07-01T00:00:00.000Z",
      noMutation: true,
      preflightStatus: "fail",
      status: "blocked",
      target: "local"
    });
    expect(plan.repairActions).toEqual([
      {
        approvalRequired: true,
        command:
          "Review and apply the canonical schema from docs/supabase-memory-schema.sql; then refresh the PostgREST schema cache for the approved Supabase project.",
        reason: "Preflight cannot verify required cutover rows until every canonical source table is visible through PostgREST.",
        tables: ["recoup_deduction_claims", "recoup_reconciliation_receipts"],
        title: "Apply canonical cutover tables"
      },
      {
        approvalRequired: true,
        command:
          "Review and repair recoup_evidence_documents to match docs/supabase-memory-schema.sql; avoid relying on CREATE TABLE IF NOT EXISTS when the table already exists with the wrong shape.",
        missingColumns: ["evidence_id", "content_hash", "retrieved_at"],
        reason: "Preflight selected columns are missing from the existing table shape.",
        tables: ["recoup_evidence_documents"],
        title: "Repair existing table schema"
      }
    ]);
    expect(plan.remainingGates).toEqual(
      expect.arrayContaining([
        "Re-run npm.cmd run preflight:reconciliation-cutover after approved schema repair.",
        "Run npm.cmd run refresh:real-evidence only after explicit RECOUP_REAL_EVIDENCE_REFRESH_APPROVED=approve-real-evidence-refresh approval."
      ])
    );
    expect(JSON.stringify(plan)).not.toContain("payload_json");
    expect(JSON.stringify(plan)).not.toContain("service-role");
    expect(JSON.stringify(plan)).not.toContain("Bearer ");
  });

  it("does not request schema repair when preflight already passes", () => {
    const plan = buildReconciliationCutoverRepairPlanFromPreflight({
      checkedAt: "2026-07-01T00:00:00.000Z",
      claims: 20,
      documents: 114,
      documentsMinimum: 114,
      evidenceHashCount: 114,
      missingEvidenceIds: [],
      missingReceiptIds: [],
      mismatchedEvidenceHashIds: [],
      mismatchedReceiptHashIds: [],
      receiptHashCount: 20,
      receipts: 20,
      requiredEvidenceIdsPresent: true,
      requiredReceiptIdsPresent: true,
      sourceTables: [],
      status: "pass",
      target: "local"
    });

    expect(plan).toMatchObject({
      noMutation: true,
      preflightStatus: "pass",
      repairActions: [],
      status: "ready_for_refresh_approval"
    });
    expect(plan.remainingGates).toContain(
      "Run npm.cmd run refresh:real-evidence only after explicit RECOUP_REAL_EVIDENCE_REFRESH_APPROVED=approve-real-evidence-refresh approval."
    );
  });

  it("keeps a read-successful failed preflight approval-gated without assuming source read failures", () => {
    const plan = buildReconciliationCutoverRepairPlanFromPreflight({
      checkedAt: "2026-07-01T00:00:00.000Z",
      claims: 20,
      documents: 113,
      documentsMinimum: 114,
      evidenceHashCount: 113,
      missingEvidenceIds: ["EVD-POD-S3-L1"],
      missingReceiptIds: [],
      mismatchedEvidenceHashIds: [],
      mismatchedReceiptHashIds: [],
      receiptHashCount: 20,
      receipts: 20,
      requiredEvidenceIdsPresent: false,
      requiredReceiptIdsPresent: true,
      sourceTables: [
        {
          count: 20,
          latestTimestamp: "2026-07-01T00:00:00.000Z",
          table: "recoup_deduction_claims"
        },
        {
          count: 113,
          latestTimestamp: "2026-07-01T00:00:00.000Z",
          table: "recoup_evidence_documents"
        },
        {
          count: 20,
          latestTimestamp: "2026-07-01T00:00:00.000Z",
          table: "recoup_reconciliation_receipts"
        }
      ],
      status: "fail",
      target: "local"
    });

    expect(plan).toMatchObject({
      noMutation: true,
      preflightError: "Reconciliation cutover preflight returned fail status.",
      preflightStatus: "fail",
      status: "blocked"
    });
    expect(plan).not.toHaveProperty("sourceReadFailures");
    expect(plan.repairActions).toEqual([
      {
        approvalRequired: true,
        reason: "Preflight failed before exposing a source-table schema diagnosis. Inspect the sanitized preflightError first.",
        title: "Inspect preflight runtime/configuration failure"
      }
    ]);
  });
});
