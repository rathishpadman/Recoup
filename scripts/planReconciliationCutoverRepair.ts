import { pathToFileURL } from "node:url";
import {
  buildReconciliationCutoverPreflightReport,
  formatReconciliationCutoverPreflightFailureReport,
  type ReconciliationCutoverPreflightFailureReport,
  type ReconciliationCutoverPreflightReport,
  type ReconciliationCutoverPreflightSourceReadFailure,
  type ReconciliationCutoverPreflightTarget
} from "./preflightReconciliationCutover.js";

export type ReconciliationCutoverRepairPlanStatus = "blocked" | "ready_for_refresh_approval";

export interface ReconciliationCutoverRepairAction {
  approvalRequired: boolean;
  command?: string;
  missingColumns?: string[];
  reason: string;
  tables?: string[];
  title: string;
}

export interface ReconciliationCutoverRepairPlan {
  checkedAt: string;
  noMutation: true;
  preflightError?: string;
  preflightStatus: "fail" | "pass";
  remainingGates: string[];
  repairActions: ReconciliationCutoverRepairAction[];
  sourceReadFailures?: ReconciliationCutoverPreflightSourceReadFailure[];
  status: ReconciliationCutoverRepairPlanStatus;
  target: ReconciliationCutoverPreflightTarget;
}

const canonicalSchemaPath = "docs/supabase-memory-schema.sql";

export function buildReconciliationCutoverRepairPlanFromPreflight(
  preflight: ReconciliationCutoverPreflightFailureReport | ReconciliationCutoverPreflightReport
): ReconciliationCutoverRepairPlan {
  if (!isPreflightFailureReport(preflight) && preflight.status === "pass") {
    return {
      checkedAt: preflight.checkedAt,
      noMutation: true,
      preflightStatus: "pass",
      remainingGates: [
        "Run npm.cmd run refresh:real-evidence only after explicit RECOUP_REAL_EVIDENCE_REFRESH_APPROVED=approve-real-evidence-refresh approval.",
        "Run npm.cmd run preflight:reconciliation-cutover -- --target=production after RECOUP_PRODUCTION_SUPABASE_PROJECT_REF is configured.",
        "Capture preview/canary/browser/POD-media proof before public production alias promotion."
      ],
      repairActions: [],
      status: "ready_for_refresh_approval",
      target: preflight.target
    };
  }

  const sourceReadFailures = readSourceReadFailures(preflight);

  return {
    checkedAt: preflight.checkedAt,
    noMutation: true,
    preflightError: readPreflightError(preflight),
    preflightStatus: "fail",
    remainingGates: [
      "Re-run npm.cmd run preflight:reconciliation-cutover after approved schema repair.",
      "Run npm.cmd run refresh:real-evidence only after explicit RECOUP_REAL_EVIDENCE_REFRESH_APPROVED=approve-real-evidence-refresh approval.",
      "Run npm.cmd run preflight:reconciliation-cutover -- --target=production after RECOUP_PRODUCTION_SUPABASE_PROJECT_REF is configured.",
      "Capture preview/canary/browser/POD-media proof before public production alias promotion."
    ],
    repairActions: buildRepairActions(sourceReadFailures),
    ...(sourceReadFailures.length === 0 ? {} : { sourceReadFailures }),
    status: "blocked",
    target: preflight.target
  };
}

export function formatReconciliationCutoverRepairPlan(report: ReconciliationCutoverRepairPlan): string {
  return `${JSON.stringify(report)}\n`;
}

export async function buildLiveRepairPlan(target: ReconciliationCutoverPreflightTarget): Promise<ReconciliationCutoverRepairPlan> {
  try {
    const preflight = await buildReconciliationCutoverPreflightReport({ target });

    return buildReconciliationCutoverRepairPlanFromPreflight(preflight);
  } catch (error: unknown) {
    const failure = JSON.parse(formatReconciliationCutoverPreflightFailureReport({ error, target })) as ReconciliationCutoverPreflightFailureReport;

    return buildReconciliationCutoverRepairPlanFromPreflight(failure);
  }
}

function buildRepairActions(
  sourceReadFailures: readonly ReconciliationCutoverPreflightSourceReadFailure[]
): ReconciliationCutoverRepairAction[] {
  const actions: ReconciliationCutoverRepairAction[] = [];
  const missingOrCachedTables = sourceReadFailures
    .filter((failure) => failure.failureKind === "missing_table_or_schema_cache")
    .map((failure) => failure.table);
  if (missingOrCachedTables.length > 0) {
    actions.push({
      approvalRequired: true,
      command: `Review and apply the canonical schema from ${canonicalSchemaPath}; then refresh the PostgREST schema cache for the approved Supabase project.`,
      reason: "Preflight cannot verify required cutover rows until every canonical source table is visible through PostgREST.",
      tables: [...new Set(missingOrCachedTables)].sort(),
      title: "Apply canonical cutover tables"
    });
  }

  for (const failure of sourceReadFailures.filter((item) => item.failureKind === "schema_mismatch")) {
    actions.push({
      approvalRequired: true,
      command: `Review and repair ${failure.table} to match ${canonicalSchemaPath}; avoid relying on CREATE TABLE IF NOT EXISTS when the table already exists with the wrong shape.`,
      ...(failure.missingColumns === undefined ? {} : { missingColumns: failure.missingColumns }),
      reason: "Preflight selected columns are missing from the existing table shape.",
      tables: [failure.table],
      title: "Repair existing table schema"
    });
  }

  if (actions.length === 0) {
    actions.push({
      approvalRequired: true,
      reason: "Preflight failed before exposing a source-table schema diagnosis. Inspect the sanitized preflightError first.",
      title: "Inspect preflight runtime/configuration failure"
    });
  }

  return actions;
}

function isPreflightFailureReport(
  preflight: ReconciliationCutoverPreflightFailureReport | ReconciliationCutoverPreflightReport
): preflight is ReconciliationCutoverPreflightFailureReport {
  return "error" in preflight;
}

function readSourceReadFailures(
  preflight: ReconciliationCutoverPreflightFailureReport | ReconciliationCutoverPreflightReport
): ReconciliationCutoverPreflightSourceReadFailure[] {
  if (!isPreflightFailureReport(preflight)) {
    return [];
  }

  return [...(preflight.sourceReadFailures ?? [])];
}

function readPreflightError(
  preflight: ReconciliationCutoverPreflightFailureReport | ReconciliationCutoverPreflightReport
): string {
  if (!isPreflightFailureReport(preflight)) {
    return "Reconciliation cutover preflight returned fail status.";
  }

  return preflight.error;
}

function readTarget(argv: readonly string[]): ReconciliationCutoverPreflightTarget {
  const targetArg = argv.find((arg) => arg.startsWith("--target="))?.slice("--target=".length) ?? "local";
  if (targetArg === "local" || targetArg === "production") {
    return targetArg;
  }

  throw new Error("--target must be local or production.");
}

async function main(): Promise<void> {
  const target = readTarget(process.argv.slice(2));
  const report = await buildLiveRepairPlan(target);
  process.stdout.write(formatReconciliationCutoverRepairPlan(report));
  if (report.status === "blocked") {
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Reconciliation cutover repair planning failed."}\n`);
    process.exitCode = 1;
  });
}
