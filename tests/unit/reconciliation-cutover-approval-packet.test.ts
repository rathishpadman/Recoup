import { describe, expect, it } from "vitest";
import { buildReconciliationCutoverRepairPlanFromPreflight } from "../../scripts/planReconciliationCutoverRepair.js";
import { buildReconciliationCutoverApprovalPacket, formatReconciliationCutoverApprovalPacketMarkdown } from "../../scripts/planReconciliationCutoverApprovalPacket.js";
import { buildReconciliationCutoverSchemaRepairSqlArtifact } from "../../scripts/generateReconciliationCutoverSchemaRepairSql.js";

describe("reconciliation cutover approval packet", () => {
  it("packages blocked preflight evidence into a no-mutation human approval packet", () => {
    const repairPlan = buildReconciliationCutoverRepairPlanFromPreflight({
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
    const packet = buildReconciliationCutoverApprovalPacket({
      generatedAt: "2026-07-01T00:00:00.000Z",
      repairPlan,
      sqlArtifact: buildReconciliationCutoverSchemaRepairSqlArtifact({
        generatedAt: "2026-07-01T00:00:00.000Z"
      })
    });

    expect(packet).toMatchObject({
      approvalRequired: true,
      artifactType: "human_approval_cutover_packet",
      generatedAt: "2026-07-01T00:00:00.000Z",
      noMutation: true,
      status: "blocked",
      target: "local"
    });
    expect(packet.readOnlyVerificationCommands).toEqual([
      "npm.cmd run check:reconciliation-cutover-env",
      "npm.cmd run check:real-evidence-proof",
      "npm.cmd run preflight:reconciliation-cutover",
      "npm.cmd run plan:reconciliation-cutover-repair"
    ]);
    expect(packet.postApprovalMutationCommands).toEqual([
      "npm.cmd run refresh:real-evidence # only after RECOUP_REAL_EVIDENCE_REFRESH_APPROVED=approve-real-evidence-refresh"
    ]);
    expect(packet.postApprovalProductionProofCommands).toEqual([
      "npm.cmd run preflight:reconciliation-cutover -- --target=production # only after RECOUP_PRODUCTION_SUPABASE_PROJECT_REF is configured",
      "npm.cmd run capture:real-evidence-audit",
      "npm.cmd run verify:real-evidence-visual",
      "npm.cmd run verify:real-evidence-a11y",
      "npm.cmd run check:real-evidence-proof"
    ]);
    expect(packet.approvalChecklist.map((item) => item.title)).toEqual([
      "Approve canonical schema repair",
      "Approve real evidence refresh",
      "Approve production project binding",
      "Approve preview/canary/browser proof"
    ]);
  });

  it("renders blocked source failures and commented SQL without secrets or executable DDL", () => {
    const repairPlan = buildReconciliationCutoverRepairPlanFromPreflight({
      checkedAt: "2026-07-01T00:00:00.000Z",
      error: "Supabase preflight read failed for 1 source table.",
      sourceReadFailures: [
        {
          failureKind: "schema_mismatch",
          httpStatus: 400,
          missingColumns: ["evidence_id", "content_hash", "retrieved_at"],
          postgrestCode: "42703",
          table: "recoup_evidence_documents"
        }
      ],
      status: "fail",
      target: "local"
    });
    const markdown = formatReconciliationCutoverApprovalPacketMarkdown(
      buildReconciliationCutoverApprovalPacket({
        generatedAt: "2026-07-01T00:00:00.000Z",
        repairPlan,
        sqlArtifact: buildReconciliationCutoverSchemaRepairSqlArtifact({
          generatedAt: "2026-07-01T00:00:00.000Z"
        })
      })
    );

    expect(markdown).toContain("# Reconciliation Cutover Approval Packet");
    expect(markdown).toContain("| recoup_evidence_documents | schema_mismatch | 400 | 42703 | evidence_id, content_hash, retrieved_at |");
    expect(markdown).toContain("- [ ] Approve canonical schema repair");
    expect(markdown).toContain("```sql\n-- REVIEW ONLY. Do not run without human approval.");
    expect(markdown).not.toMatch(/^(?!\s*--|\s*```|\s*$)\s*(CREATE|ALTER)\s+/mu);
    expect(markdown.toLowerCase()).not.toContain("service_role");
    expect(markdown.toLowerCase()).not.toContain("service-role");
    expect(markdown.toLowerCase()).not.toContain("bearer ");
    expect(markdown.toLowerCase()).not.toContain("supabase_service_role_key");
  });

  it("keeps refresh and production proof separated when preflight is ready", () => {
    const repairPlan = buildReconciliationCutoverRepairPlanFromPreflight({
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
    const packet = buildReconciliationCutoverApprovalPacket({
      generatedAt: "2026-07-01T00:00:00.000Z",
      repairPlan,
      sqlArtifact: buildReconciliationCutoverSchemaRepairSqlArtifact({
        generatedAt: "2026-07-01T00:00:00.000Z"
      })
    });

    expect(packet.status).toBe("ready_for_refresh_approval");
    expect(packet.readOnlyVerificationCommands).not.toEqual(expect.arrayContaining(packet.postApprovalMutationCommands));
    expect(packet.approvalChecklist.map((item) => item.gate)).toEqual([
      "schema_repair",
      "real_evidence_refresh",
      "production_project_binding",
      "preview_canary_browser_proof"
    ]);
  });

  it("renders sanitized preflight errors and remaining gates when table diagnostics are unavailable", () => {
    const repairPlan = buildReconciliationCutoverRepairPlanFromPreflight({
      checkedAt: "2026-07-01T00:00:00.000Z",
      error: "RECOUP_PRODUCTION_SUPABASE_PROJECT_REF is required for production cutover preflight.",
      status: "fail",
      target: "production"
    });
    const markdown = formatReconciliationCutoverApprovalPacketMarkdown(
      buildReconciliationCutoverApprovalPacket({
        generatedAt: "2026-07-01T00:00:00.000Z",
        repairPlan,
        sqlArtifact: buildReconciliationCutoverSchemaRepairSqlArtifact({
          generatedAt: "2026-07-01T00:00:00.000Z"
        })
      })
    );

    expect(markdown).toContain("## Blocking Preflight Error");
    expect(markdown).toContain("Command host: Windows PowerShell in this Recoup workspace.");
    expect(markdown).toContain("RECOUP_PRODUCTION_SUPABASE_PROJECT_REF is required for production cutover preflight.");
    expect(markdown).toContain("## Remaining Gates");
    expect(markdown).toContain("- Run npm.cmd run preflight:reconciliation-cutover -- --target=production after RECOUP_PRODUCTION_SUPABASE_PROJECT_REF is configured.");
    expect(markdown).toContain("No source-read failures were reported by the read-only preflight.");
  });
});
