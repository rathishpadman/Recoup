import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildReconciliationCutoverSchemaRepairSqlArtifact } from "../../scripts/generateReconciliationCutoverSchemaRepairSql.js";

describe("reconciliation cutover schema repair SQL artifact", () => {
  it("builds a review-only SQL artifact with no mutation side effects", () => {
    const artifact = buildReconciliationCutoverSchemaRepairSqlArtifact({
      generatedAt: "2026-07-01T00:00:00.000Z"
    });

    expect(artifact).toMatchObject({
      approvalRequired: true,
      artifactType: "review_only_schema_repair_sql",
      generatedAt: "2026-07-01T00:00:00.000Z",
      noMutation: true,
      sourcePath: "docs/supabase-memory-schema.sql",
      status: "blocked_until_human_approved"
    });
    expect(artifact.warnings).toEqual(
      expect.arrayContaining([
        "This script does not connect to Supabase and does not apply SQL.",
        "CREATE TABLE IF NOT EXISTS does not repair recoup_evidence_documents when that table already exists with the wrong shape.",
        "Apply any SQL only after human approval, table-shape inspection, backup/rollback planning, and a PostgREST schema-cache refresh plan."
      ])
    );
    expect(artifact.readOnlyVerificationCommands).toEqual(["npm.cmd run preflight:reconciliation-cutover", "npm.cmd run plan:reconciliation-cutover-repair"]);
    expect(artifact.postApprovalMutationCommands).toEqual([
      "npm.cmd run refresh:real-evidence # only after RECOUP_REAL_EVIDENCE_REFRESH_APPROVED=approve-real-evidence-refresh"
    ]);
    expect(artifact.postApprovalProductionProofCommands).toEqual([
      "npm.cmd run preflight:reconciliation-cutover -- --target=production # only after RECOUP_PRODUCTION_SUPABASE_PROJECT_REF is configured",
      "npm.cmd run capture:real-evidence-audit",
      "npm.cmd run verify:real-evidence-visual",
      "npm.cmd run verify:real-evidence-a11y",
      "npm.cmd run check:real-evidence-proof"
    ]);
    expect(artifact).not.toHaveProperty("verificationCommands");
  });

  it("includes commented canonical missing-table DDL and staged existing-table repair notes", () => {
    const { reviewOnlySqlPlan } = buildReconciliationCutoverSchemaRepairSqlArtifact({
      generatedAt: "2026-07-01T00:00:00.000Z"
    });

    expect(reviewOnlySqlPlan).toContain("-- CREATE TABLE IF NOT EXISTS recoup_evidence_documents");
    expect(reviewOnlySqlPlan).toContain("-- CREATE TABLE IF NOT EXISTS recoup_evidence_links");
    expect(reviewOnlySqlPlan).toContain("-- CREATE TABLE IF NOT EXISTS recoup_deduction_claims");
    expect(reviewOnlySqlPlan).toContain("-- CREATE TABLE IF NOT EXISTS recoup_reconciliation_receipts");
    expect(reviewOnlySqlPlan).toContain("-- ALTER TABLE recoup_evidence_documents ADD COLUMN IF NOT EXISTS evidence_id text;");
    expect(reviewOnlySqlPlan).toContain("-- ALTER TABLE recoup_evidence_documents ADD COLUMN IF NOT EXISTS content_hash text;");
    expect(reviewOnlySqlPlan).toContain("-- ALTER TABLE recoup_evidence_documents ADD COLUMN IF NOT EXISTS retrieved_at timestamptz;");
    expect(reviewOnlySqlPlan).toContain("Do not add NOT NULL, primary-key, or foreign-key constraints to existing populated tables until the backfill has been inspected.");
    expect(reviewOnlySqlPlan).not.toMatch(/^(?!\s*--)\s*(CREATE|ALTER)\s+/mu);
  });

  it("does not include DML, destructive SQL, or secret-bearing strings", () => {
    const serialized = JSON.stringify(
      buildReconciliationCutoverSchemaRepairSqlArtifact({
        generatedAt: "2026-07-01T00:00:00.000Z"
      })
    ).toLowerCase();

    expect(serialized).not.toMatch(/\binsert\s+into\b/);
    expect(serialized).not.toMatch(/\bupdate\s+\w+/);
    expect(serialized).not.toMatch(/\bdelete\s+from\b/);
    expect(serialized).not.toMatch(/\bdrop\s+(table|schema|database)\b/);
    expect(serialized).not.toContain("service_role");
    expect(serialized).not.toContain("service-role");
    expect(serialized).not.toContain("bearer ");
    expect(serialized).not.toContain("supabase_service_role_key");
  });

  it("keeps the npm planning command blocked at the CLI boundary", () => {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = spawnSync(npmCommand, ["run", "plan:reconciliation-cutover-sql"], {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: process.platform === "win32"
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Blocked until human approval; SQL was generated for review only and was not applied.");

    const jsonStart = result.stdout.indexOf("{");
    expect(jsonStart).toBeGreaterThanOrEqual(0);
    const artifact = JSON.parse(result.stdout.slice(jsonStart)) as ReturnType<typeof buildReconciliationCutoverSchemaRepairSqlArtifact>;
    expect(artifact).toMatchObject({
      approvalRequired: true,
      artifactType: "review_only_schema_repair_sql",
      noMutation: true,
      status: "blocked_until_human_approved"
    });
    expect(artifact.reviewOnlySqlPlan).not.toMatch(/^(?!\s*--)\s*(CREATE|ALTER)\s+/mu);
  }, 15_000);
});
