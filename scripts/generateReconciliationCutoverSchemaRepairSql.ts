import { pathToFileURL } from "node:url";

export type ReconciliationCutoverSchemaRepairSqlStatus = "blocked_until_human_approved";

export interface ReconciliationCutoverSchemaRepairSqlArtifact {
  approvalRequired: true;
  artifactType: "review_only_schema_repair_sql";
  generatedAt: string;
  noMutation: true;
  postApprovalMutationCommands: string[];
  postApprovalProductionProofCommands: string[];
  readOnlyVerificationCommands: string[];
  reviewOnlySqlPlan: string;
  sourcePath: "docs/supabase-memory-schema.sql";
  status: ReconciliationCutoverSchemaRepairSqlStatus;
  warnings: string[];
}

export interface BuildReconciliationCutoverSchemaRepairSqlArtifactOptions {
  generatedAt?: string;
}

const sourcePath = "docs/supabase-memory-schema.sql" as const;

const warnings = [
  "This script does not connect to Supabase and does not apply SQL.",
  "The SQL plan comments every DDL line so it is not executable by default.",
  "CREATE TABLE IF NOT EXISTS does not repair recoup_evidence_documents when that table already exists with the wrong shape.",
  "Apply any SQL only after human approval, table-shape inspection, backup/rollback planning, and a PostgREST schema-cache refresh plan."
] as const;

const readOnlyVerificationCommands = [
  "npm.cmd run preflight:reconciliation-cutover",
  "npm.cmd run plan:reconciliation-cutover-repair"
] as const;

const postApprovalMutationCommands = [
  "npm.cmd run refresh:real-evidence # only after RECOUP_REAL_EVIDENCE_REFRESH_APPROVED=approve-real-evidence-refresh",
] as const;

const postApprovalProductionProofCommands = [
  "npm.cmd run preflight:reconciliation-cutover -- --target=production # only after RECOUP_PRODUCTION_SUPABASE_PROJECT_REF is configured",
  "npm.cmd run capture:real-evidence-audit",
  "npm.cmd run verify:real-evidence-visual",
  "npm.cmd run verify:real-evidence-a11y",
  "npm.cmd run check:real-evidence-proof"
] as const;

export function buildReconciliationCutoverSchemaRepairSqlArtifact(
  options: BuildReconciliationCutoverSchemaRepairSqlArtifactOptions = {}
): ReconciliationCutoverSchemaRepairSqlArtifact {
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  return {
    approvalRequired: true,
    artifactType: "review_only_schema_repair_sql",
    generatedAt,
    noMutation: true,
    postApprovalMutationCommands: [...postApprovalMutationCommands],
    postApprovalProductionProofCommands: [...postApprovalProductionProofCommands],
    readOnlyVerificationCommands: [...readOnlyVerificationCommands],
    reviewOnlySqlPlan: buildReviewOnlySqlPlan(),
    sourcePath,
    status: "blocked_until_human_approved",
    warnings: [...warnings]
  };
}

export function formatReconciliationCutoverSchemaRepairSqlArtifact(
  artifact: ReconciliationCutoverSchemaRepairSqlArtifact
): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

function buildReviewOnlySqlPlan(): string {
  return `-- REVIEW ONLY. Do not run without human approval.
-- Source contract: docs/supabase-memory-schema.sql.
-- This script is generated as a local artifact only; it does not apply anything.
-- Every DDL line below is commented so the artifact is non-executable by default.
-- CREATE TABLE IF NOT EXISTS does not repair an existing wrong-shaped recoup_evidence_documents table.
-- Do not add NOT NULL, primary-key, or foreign-key constraints to existing populated tables until the backfill has been inspected.

-- CREATE TABLE IF NOT EXISTS recoup_evidence_documents (
--   evidence_id text PRIMARY KEY,
--   document_type text NOT NULL CHECK (document_type IN ('pod', 'sap_invoice', 'sap_credit_memo', 'customer_po', 'contract_pricing', 'contract_sla', 'tpm_promo', 'tpm_accrual', 'carrier_damage_report', 'carrier_photo', 'remittance_advice', 'edi_812', 'bureau_alert', 'payment_history')),
--   source_system text NOT NULL,
--   customer_id text NOT NULL,
--   source_record_id text NOT NULL,
--   payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
--   raw_text text,
--   content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
--   storage_uri text,
--   retrieved_at timestamptz NOT NULL,
--   valid_from date,
--   valid_to date,
--   provenance text NOT NULL CHECK (provenance IN ('sap_odata', 'source_generated', 'uploaded_document', 'provider_api')),
--   created_at timestamptz NOT NULL DEFAULT now(),
--   CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
-- );

-- CREATE TABLE IF NOT EXISTS recoup_evidence_links (
--   evidence_id text NOT NULL REFERENCES recoup_evidence_documents(evidence_id),
--   record_id text NOT NULL,
--   record_role text NOT NULL CHECK (record_role IN ('deduction_line', 'claim', 'customer', 'invoice', 'source_record')),
--   PRIMARY KEY(evidence_id, record_id, record_role)
-- );

-- CREATE TABLE IF NOT EXISTS recoup_deduction_claims (
--   claim_id text PRIMARY KEY,
--   line_id text NOT NULL,
--   gold_scenario_id text,
--   customer_id text NOT NULL,
--   invoice_ref text NOT NULL,
--   claim_amount numeric(18,2) NOT NULL,
--   reason_code text NOT NULL,
--   remittance_evidence_id text NOT NULL REFERENCES recoup_evidence_documents(evidence_id),
--   record_ids jsonb NOT NULL CHECK (jsonb_typeof(record_ids) = 'array' AND jsonb_array_length(record_ids) > 0),
--   created_at timestamptz NOT NULL DEFAULT now()
-- );

-- CREATE TABLE IF NOT EXISTS recoup_reconciliation_receipts (
--   receipt_id text PRIMARY KEY,
--   claim_id text NOT NULL REFERENCES recoup_deduction_claims(claim_id),
--   line_id text NOT NULL,
--   rule_id text NOT NULL,
--   derived_rule_input_json jsonb NOT NULL CHECK (jsonb_typeof(derived_rule_input_json) = 'object'),
--   evidence_ids jsonb NOT NULL CHECK (jsonb_typeof(evidence_ids) = 'array' AND jsonb_array_length(evidence_ids) > 0),
--   deterministic_basis jsonb NOT NULL CHECK (jsonb_typeof(deterministic_basis) = 'object'),
--   confidence_factors jsonb NOT NULL CHECK (jsonb_typeof(confidence_factors) = 'object'),
--   content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
--   created_at timestamptz NOT NULL DEFAULT now()
-- );

-- Existing-table staged repair candidate for recoup_evidence_documents.
-- Review the current table shape first; keep these nullable until approved backfill proof exists.
-- ALTER TABLE recoup_evidence_documents ADD COLUMN IF NOT EXISTS evidence_id text;
-- ALTER TABLE recoup_evidence_documents ADD COLUMN IF NOT EXISTS content_hash text;
-- ALTER TABLE recoup_evidence_documents ADD COLUMN IF NOT EXISTS retrieved_at timestamptz;
`;
}

function main(): void {
  const artifact = buildReconciliationCutoverSchemaRepairSqlArtifact();
  process.stdout.write(formatReconciliationCutoverSchemaRepairSqlArtifact(artifact));
  process.stderr.write("Blocked until human approval; SQL was generated for review only and was not applied.\n");
  process.exitCode = 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : "Reconciliation schema repair SQL generation failed."}\n`);
    process.exitCode = 1;
  }
}
