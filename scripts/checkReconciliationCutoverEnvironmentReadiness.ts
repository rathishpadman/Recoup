import { pathToFileURL } from "node:url";
import { loadLocalRuntimeEnvFiles, type RuntimeEnv } from "../config/env.js";

export type ReconciliationCutoverEnvironmentReadinessStatus = "blocked" | "ready_for_approval_sequence";

export interface ReconciliationCutoverEnvironmentReadinessReport {
  artifactType: "reconciliation_cutover_environment_readiness";
  blockers: string[];
  generatedAt: string;
  noMutation: true;
  previewProof: {
    previewHost?: string;
    previewUrlPresent: boolean;
    status: "blocked_invalid_preview_url" | "blocked_missing_preview_url" | "ready";
  };
  productionPreflight: {
    blockers: string[];
    expectedSupabaseHost?: string;
    productionProjectRefPresent: boolean;
    status: "blocked" | "ready";
    supabaseServiceRoleKeyPresent: boolean;
    supabaseUrlHost?: string;
    supabaseUrlPresent: boolean;
  };
  realEvidenceRefresh: {
    approved: boolean;
    status: "approved" | "blocked_pending_human_approval";
  };
  reconciliationMode: {
    canaryLinesPresent: boolean;
    safeForUnapprovedRuntime: boolean;
    value: "authoritative" | "canary" | "legacy" | "shadow" | "unset" | "unsupported";
  };
  status: ReconciliationCutoverEnvironmentReadinessStatus;
}

export interface BuildReconciliationCutoverEnvironmentReadinessReportOptions {
  env?: RuntimeEnv;
  generatedAt?: string;
}

const refreshApprovalValue = "approve-real-evidence-refresh";

export function buildReconciliationCutoverEnvironmentReadinessReport(
  options: BuildReconciliationCutoverEnvironmentReadinessReportOptions = {}
): ReconciliationCutoverEnvironmentReadinessReport {
  const env = options.env ?? loadLocalRuntimeEnvFiles();
  const productionPreflight = buildProductionPreflightReadiness(env);
  const realEvidenceRefresh = buildRefreshReadiness(env);
  const previewProof = buildPreviewProofReadiness(env);
  const reconciliationMode = buildReconciliationModeReadiness(env);
  const blockers = [
    ...productionPreflight.blockers,
    ...(realEvidenceRefresh.approved ? [] : ["RECOUP_REAL_EVIDENCE_REFRESH_APPROVED is not approved for real evidence refresh."]),
    ...previewProofBlockers(previewProof),
    ...(reconciliationMode.safeForUnapprovedRuntime
      ? []
      : [
          `RECOUP_RECONCILIATION_MODE=${reconciliationMode.value} requires completed production preflight and canary proof before provider promotion.`
        ])
  ];

  return {
    artifactType: "reconciliation_cutover_environment_readiness",
    blockers,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    noMutation: true,
    previewProof,
    productionPreflight,
    realEvidenceRefresh,
    reconciliationMode,
    status: blockers.length === 0 ? "ready_for_approval_sequence" : "blocked"
  };
}

export function formatReconciliationCutoverEnvironmentReadinessReport(
  report: ReconciliationCutoverEnvironmentReadinessReport
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function buildProductionPreflightReadiness(
  env: RuntimeEnv
): ReconciliationCutoverEnvironmentReadinessReport["productionPreflight"] {
  const supabaseUrl = readConfigured(env, "SUPABASE_URL");
  const projectRef = readConfigured(env, "RECOUP_PRODUCTION_SUPABASE_PROJECT_REF");
  const supabaseUrlParts = readUrlParts(supabaseUrl);
  const supabaseUrlHost = supabaseUrlParts?.host;
  const expectedSupabaseHost = projectRef === undefined ? undefined : `${projectRef}.supabase.co`;
  const blockers: string[] = [];

  if (supabaseUrl === undefined) {
    blockers.push("SUPABASE_URL is required for production cutover preflight.");
  }
  if (readConfigured(env, "SUPABASE_SERVICE_ROLE_KEY") === undefined) {
    blockers.push("SUPABASE_SERVICE_ROLE_KEY is required for production cutover preflight.");
  }
  if (projectRef === undefined) {
    blockers.push("RECOUP_PRODUCTION_SUPABASE_PROJECT_REF is required for production cutover preflight.");
  }
  if (supabaseUrl !== undefined && supabaseUrlHost === undefined) {
    blockers.push("SUPABASE_URL must be a valid URL before production cutover preflight.");
  }
  if (supabaseUrlParts !== undefined && supabaseUrlParts.protocol !== "https:") {
    blockers.push("SUPABASE_URL must use https before production cutover preflight.");
  }
  if (supabaseUrlHost !== undefined && expectedSupabaseHost !== undefined && supabaseUrlHost !== expectedSupabaseHost) {
    blockers.push("SUPABASE_URL host does not match RECOUP_PRODUCTION_SUPABASE_PROJECT_REF.");
  }

  return {
    blockers,
    ...(expectedSupabaseHost === undefined ? {} : { expectedSupabaseHost }),
    productionProjectRefPresent: projectRef !== undefined,
    status: blockers.length === 0 ? "ready" : "blocked",
    supabaseServiceRoleKeyPresent: readConfigured(env, "SUPABASE_SERVICE_ROLE_KEY") !== undefined,
    ...(supabaseUrlHost === undefined ? {} : { supabaseUrlHost }),
    supabaseUrlPresent: supabaseUrl !== undefined
  };
}

function buildPreviewProofReadiness(env: RuntimeEnv): ReconciliationCutoverEnvironmentReadinessReport["previewProof"] {
  const previewUrl = readConfigured(env, "RECOUP_PREVIEW_URL");
  const previewUrlParts = readUrlParts(previewUrl);
  const previewHost = previewUrlParts?.host;
  const previewUrlValid =
    previewUrl !== undefined && previewUrlParts !== undefined && (previewUrlParts.protocol === "http:" || previewUrlParts.protocol === "https:");

  return {
    ...(previewHost === undefined ? {} : { previewHost }),
    previewUrlPresent: previewUrl !== undefined,
    status: previewUrl === undefined ? "blocked_missing_preview_url" : previewUrlValid ? "ready" : "blocked_invalid_preview_url"
  };
}

function previewProofBlockers(
  previewProof: ReconciliationCutoverEnvironmentReadinessReport["previewProof"]
): string[] {
  if (previewProof.status === "ready") {
    return [];
  }
  if (previewProof.status === "blocked_invalid_preview_url") {
    return ["RECOUP_PREVIEW_URL must be a valid URL before preview/canary/browser proof can run."];
  }

  return ["RECOUP_PREVIEW_URL is required before preview/canary/browser proof can run."];
}

function buildRefreshReadiness(env: RuntimeEnv): ReconciliationCutoverEnvironmentReadinessReport["realEvidenceRefresh"] {
  const approved = readConfigured(env, "RECOUP_REAL_EVIDENCE_REFRESH_APPROVED") === refreshApprovalValue;

  return {
    approved,
    status: approved ? "approved" : "blocked_pending_human_approval"
  };
}

function buildReconciliationModeReadiness(
  env: RuntimeEnv
): ReconciliationCutoverEnvironmentReadinessReport["reconciliationMode"] {
  const rawMode = readConfigured(env, "RECOUP_RECONCILIATION_MODE");
  const value = readReconciliationMode(rawMode);

  return {
    canaryLinesPresent: readConfigured(env, "RECOUP_RECONCILIATION_CANARY_LINES") !== undefined,
    safeForUnapprovedRuntime: value === "unset" || value === "legacy" || value === "shadow",
    value
  };
}

function readConfigured(env: RuntimeEnv, key: string): string | undefined {
  const value = env[key];
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  return value.trim();
}

function readReconciliationMode(value: string | undefined): ReconciliationCutoverEnvironmentReadinessReport["reconciliationMode"]["value"] {
  if (value === undefined) {
    return "unset";
  }
  if (value === "legacy" || value === "shadow" || value === "canary" || value === "authoritative") {
    return value;
  }

  return "unsupported";
}

function readUrlParts(value: string | undefined): { host: string; protocol: string } | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    const url = new URL(value);

    return {
      host: url.host,
      protocol: url.protocol
    };
  } catch {
    return undefined;
  }
}

function main(): void {
  const report = buildReconciliationCutoverEnvironmentReadinessReport();
  process.stdout.write(formatReconciliationCutoverEnvironmentReadinessReport(report));
  if (report.status === "blocked") {
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : "Reconciliation cutover environment readiness check failed."}\n`);
    process.exitCode = 1;
  }
}
