import { pathToFileURL } from "node:url";
import { loadLocalRuntimeEnvFiles, type RuntimeEnv } from "../config/env.js";
import { materializeRealEvidenceDataset } from "../src/services/evidenceMaterializer.js";
import { reconcileDeductionClaim } from "../src/services/reconciliationEngine.js";

export type ReconciliationCutoverPreflightTarget = "local" | "production";
export type ReconciliationCutoverPreflightStatus = "fail" | "pass";
export type ReconciliationCutoverPreflightFetch = (url: string, init: RequestInit) => Promise<Response>;
export type ReconciliationCutoverPreflightSourceTable =
  | "recoup_deduction_claims"
  | "recoup_evidence_documents"
  | "recoup_reconciliation_receipts";
export type ReconciliationCutoverPreflightFailureKind =
  | "missing_table_or_schema_cache"
  | "non_array_response"
  | "read_failed"
  | "schema_mismatch";

export interface ReconciliationCutoverPreflightSourceReadFailure {
  failureKind: ReconciliationCutoverPreflightFailureKind;
  httpStatus?: number;
  missingColumns?: string[];
  postgrestCode?: string;
  table: ReconciliationCutoverPreflightSourceTable;
}

export interface ReconciliationCutoverPreflightReport {
  checkedAt: string;
  claims: number;
  documents: number;
  documentsMinimum: 114;
  evidenceHashCount: number;
  missingEvidenceIds: string[];
  missingReceiptIds: string[];
  mismatchedEvidenceHashIds: string[];
  mismatchedReceiptHashIds: string[];
  receipts: number;
  receiptHashCount: number;
  requiredEvidenceIdsPresent: boolean;
  requiredReceiptIdsPresent: boolean;
  sourceTables: Array<{
    count: number;
    latestTimestamp?: string;
    table: ReconciliationCutoverPreflightSourceTable;
  }>;
  status: ReconciliationCutoverPreflightStatus;
  target: ReconciliationCutoverPreflightTarget;
}

export interface ReconciliationCutoverPreflightFailureReport {
  checkedAt: string;
  error: string;
  sourceReadFailures?: ReconciliationCutoverPreflightSourceReadFailure[];
  status: "fail";
  target: ReconciliationCutoverPreflightTarget;
}

interface PreflightClaimRow {
  claim_id: string;
  created_at?: string | null;
  line_id: string;
}

interface PreflightEvidenceRow {
  content_hash: string;
  created_at?: string | null;
  evidence_id: string;
  retrieved_at: string;
}

interface PreflightReceiptRow {
  content_hash: string;
  created_at?: string | null;
  line_id: string;
  receipt_id: string;
}

const expectedClaimCount = 20;
const expectedDocumentMinimum = 114;
const expectedReceiptCount = 20;

class ReconciliationCutoverPreflightReadError extends Error {
  readonly sourceReadFailures: ReconciliationCutoverPreflightSourceReadFailure[];

  constructor(sourceReadFailures: readonly ReconciliationCutoverPreflightSourceReadFailure[]) {
    super(
      `Supabase preflight read failed for ${String(sourceReadFailures.length)} source ${
        sourceReadFailures.length === 1 ? "table" : "tables"
      }.`
    );
    this.name = "ReconciliationCutoverPreflightReadError";
    this.sourceReadFailures = [...sourceReadFailures];
  }
}

export async function buildReconciliationCutoverPreflightReport(input: {
  checkedAt?: string;
  env?: RuntimeEnv;
  fetcher?: ReconciliationCutoverPreflightFetch;
  target: ReconciliationCutoverPreflightTarget;
}): Promise<ReconciliationCutoverPreflightReport> {
  const env = input.env ?? loadLocalRuntimeEnvFiles();
  const baseUrl = readRequiredEnv(env, "SUPABASE_URL").replace(/\/+$/u, "");
  assertTargetMatchesSupabaseUrl(input.target, env, baseUrl);
  const serviceRoleKey = readRequiredEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  const fetcher = input.fetcher ?? fetch;
  const { claimRows, evidenceRows, receiptRows } = await requestCutoverSourceRows(fetcher, {
    baseUrl,
    serviceRoleKey
  });
  const expected = buildExpectedCutoverProof(evidenceRows);
  const evidenceIds = new Set(evidenceRows.map((row) => row.evidence_id));
  const receiptIds = new Set(receiptRows.map((row) => row.receipt_id));
  const missingEvidenceIds = expected.evidenceIds.filter((evidenceId) => !evidenceIds.has(evidenceId));
  const missingReceiptIds = expected.receiptIds.filter((receiptId) => !receiptIds.has(receiptId));
  const evidenceHashById = new Map(evidenceRows.map((row) => [row.evidence_id, row.content_hash]));
  const receiptHashById = new Map(receiptRows.map((row) => [row.receipt_id, row.content_hash]));
  const mismatchedEvidenceHashIds = [...expected.evidenceHashById.entries()]
    .filter(([evidenceId, expectedHash]) => evidenceHashById.get(evidenceId) !== expectedHash)
    .map(([evidenceId]) => evidenceId);
  const mismatchedReceiptHashIds = [...expected.receiptHashById.entries()]
    .filter(([receiptId, expectedHash]) => receiptHashById.get(receiptId) !== expectedHash)
    .map(([receiptId]) => receiptId);
  const requiredEvidenceIdsPresent = missingEvidenceIds.length === 0;
  const requiredReceiptIdsPresent = missingReceiptIds.length === 0;
  const status: ReconciliationCutoverPreflightStatus =
    claimRows.length === expectedClaimCount &&
    evidenceRows.length >= expectedDocumentMinimum &&
    receiptRows.length === expectedReceiptCount &&
    requiredEvidenceIdsPresent &&
    requiredReceiptIdsPresent &&
    mismatchedEvidenceHashIds.length === 0 &&
    mismatchedReceiptHashIds.length === 0
      ? "pass"
      : "fail";

  return {
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    claims: claimRows.length,
    documents: evidenceRows.length,
    documentsMinimum: expectedDocumentMinimum,
    evidenceHashCount: new Set(evidenceRows.map((row) => row.content_hash)).size,
    missingEvidenceIds,
    missingReceiptIds,
    mismatchedEvidenceHashIds,
    mismatchedReceiptHashIds,
    receipts: receiptRows.length,
    receiptHashCount: new Set(receiptRows.map((row) => row.content_hash)).size,
    requiredEvidenceIdsPresent,
    requiredReceiptIdsPresent,
    sourceTables: [
      sourceTableProof("recoup_deduction_claims", claimRows.length, latestTimestamp(claimRows.map((row) => row.created_at))),
      sourceTableProof(
        "recoup_evidence_documents",
        evidenceRows.length,
        latestTimestamp(evidenceRows.flatMap((row) => [row.created_at, row.retrieved_at]))
      ),
      sourceTableProof(
        "recoup_reconciliation_receipts",
        receiptRows.length,
        latestTimestamp(receiptRows.map((row) => row.created_at))
      )
    ],
    status,
    target: input.target
  };
}

export function assertReconciliationCutoverPreflight(report: ReconciliationCutoverPreflightReport): void {
  if (report.status === "pass") {
    return;
  }

  throw new Error(
    `Reconciliation cutover preflight failed: claims=${String(report.claims)}, documents=${String(
      report.documents
    )}, receipts=${String(report.receipts)}, missingEvidenceIds=${String(
      report.missingEvidenceIds.length
    )}, missingReceiptIds=${String(report.missingReceiptIds.length)}, mismatchedEvidenceHashIds=${String(
      report.mismatchedEvidenceHashIds.length
    )}, mismatchedReceiptHashIds=${String(report.mismatchedReceiptHashIds.length)}.`
  );
}

export function formatReconciliationCutoverPreflightReport(report: ReconciliationCutoverPreflightReport): string {
  return `${JSON.stringify(report)}\n`;
}

export function formatReconciliationCutoverPreflightFailureReport(input: {
  checkedAt?: string;
  error: unknown;
  target: ReconciliationCutoverPreflightTarget;
}): string {
  const report: ReconciliationCutoverPreflightFailureReport = {
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    error: sanitizePreflightErrorMessage(input.error instanceof Error ? input.error.message : "Reconciliation cutover preflight failed."),
    ...sourceReadFailuresProof(input.error),
    status: "fail",
    target: input.target
  };

  return `${JSON.stringify(report)}\n`;
}

function sanitizePreflightErrorMessage(message: string): string {
  return message
    .replace(/Bearer\s+[^\s,;]+/giu, "Bearer [redacted]")
    .replace(/(apikey|authorization|token|service[-_ ]?role[-_ ]?key)(\s*[=:]?\s*)[^\s,;]+/giu, "$1$2[redacted]");
}

async function requestRows<T>(
  fetcher: ReconciliationCutoverPreflightFetch,
  input: {
    baseUrl: string;
    orderBy: string;
    select: string;
    serviceRoleKey: string;
    tableName: ReconciliationCutoverPreflightSourceTable;
  }
): Promise<T[]> {
  const endpoint = new URL(`${input.baseUrl}/rest/v1/${input.tableName}`);
  endpoint.searchParams.set("select", input.select);
  endpoint.searchParams.set("order", input.orderBy);
  endpoint.searchParams.set("limit", "1000");

  const response = await fetcher(endpoint.toString(), {
    headers: {
      accept: "application/json",
      apikey: input.serviceRoleKey,
      authorization: `Bearer ${input.serviceRoleKey}`,
      prefer: "count=exact"
    },
    method: "GET"
  });
  if (!response.ok) {
    const postgrestCode = await readSafePostgrestCode(response);
    const failureKind = classifyPreflightReadFailure(response.status, postgrestCode);
    const missingColumns =
      failureKind === "schema_mismatch"
        ? await probeMissingSelectedColumns(fetcher, {
            baseUrl: input.baseUrl,
            selectedColumns: input.select.split(",").map((column) => column.trim()),
            serviceRoleKey: input.serviceRoleKey,
            tableName: input.tableName
          })
        : [];
    throw new ReconciliationCutoverPreflightReadError([
      {
        failureKind,
        httpStatus: response.status,
        ...(missingColumns.length === 0 ? {} : { missingColumns }),
        ...(postgrestCode === undefined ? {} : { postgrestCode }),
        table: input.tableName
      }
    ]);
  }

  const rows = (await response.json()) as unknown;
  if (!Array.isArray(rows)) {
    throw new ReconciliationCutoverPreflightReadError([
      {
        failureKind: "non_array_response",
        table: input.tableName
      }
    ]);
  }

  return rows as T[];
}

async function requestCutoverSourceRows(
  fetcher: ReconciliationCutoverPreflightFetch,
  input: {
    baseUrl: string;
    serviceRoleKey: string;
  }
): Promise<{
  claimRows: PreflightClaimRow[];
  evidenceRows: PreflightEvidenceRow[];
  receiptRows: PreflightReceiptRow[];
}> {
  const [claimResult, evidenceResult, receiptResult] = await Promise.allSettled([
    requestRows<PreflightClaimRow>(fetcher, {
      baseUrl: input.baseUrl,
      orderBy: "claim_id.asc",
      select: "claim_id,line_id,created_at",
      serviceRoleKey: input.serviceRoleKey,
      tableName: "recoup_deduction_claims"
    }),
    requestRows<PreflightEvidenceRow>(fetcher, {
      baseUrl: input.baseUrl,
      orderBy: "evidence_id.asc",
      select: "evidence_id,content_hash,retrieved_at,created_at",
      serviceRoleKey: input.serviceRoleKey,
      tableName: "recoup_evidence_documents"
    }),
    requestRows<PreflightReceiptRow>(fetcher, {
      baseUrl: input.baseUrl,
      orderBy: "receipt_id.asc",
      select: "receipt_id,line_id,content_hash,created_at",
      serviceRoleKey: input.serviceRoleKey,
      tableName: "recoup_reconciliation_receipts"
    })
  ]);
  const sourceReadFailures = [
    ...sourceReadFailuresForSettledResult("recoup_deduction_claims", claimResult),
    ...sourceReadFailuresForSettledResult("recoup_evidence_documents", evidenceResult),
    ...sourceReadFailuresForSettledResult("recoup_reconciliation_receipts", receiptResult)
  ];

  if (sourceReadFailures.length > 0) {
    throw new ReconciliationCutoverPreflightReadError(sourceReadFailures);
  }

  return {
    claimRows: readFulfilledRows("recoup_deduction_claims", claimResult),
    evidenceRows: readFulfilledRows("recoup_evidence_documents", evidenceResult),
    receiptRows: readFulfilledRows("recoup_reconciliation_receipts", receiptResult)
  };
}

function readFulfilledRows<T>(
  table: ReconciliationCutoverPreflightSourceTable,
  result: PromiseSettledResult<T[]>
): T[] {
  if (result.status === "fulfilled") {
    return result.value;
  }

  throw new ReconciliationCutoverPreflightReadError(sourceReadFailuresForSettledResult(table, result));
}

function sourceReadFailuresForSettledResult(
  table: ReconciliationCutoverPreflightSourceTable,
  result: PromiseSettledResult<unknown>
): ReconciliationCutoverPreflightSourceReadFailure[] {
  if (result.status === "fulfilled") {
    return [];
  }

  if (result.reason instanceof ReconciliationCutoverPreflightReadError) {
    return result.reason.sourceReadFailures;
  }

  return [{ failureKind: "read_failed", table }];
}

function sourceReadFailuresProof(error: unknown): {
  sourceReadFailures?: ReconciliationCutoverPreflightSourceReadFailure[];
} {
  if (!(error instanceof ReconciliationCutoverPreflightReadError)) {
    return {};
  }

  return {
    sourceReadFailures: error.sourceReadFailures.map((failure) => ({
      failureKind: failure.failureKind,
      ...(failure.httpStatus === undefined ? {} : { httpStatus: failure.httpStatus }),
      ...(failure.missingColumns === undefined ? {} : { missingColumns: failure.missingColumns }),
      ...(failure.postgrestCode === undefined ? {} : { postgrestCode: failure.postgrestCode }),
      table: failure.table
    }))
  };
}

async function readSafePostgrestCode(response: Response): Promise<string | undefined> {
  const bodyText = await response.text();
  try {
    const parsed = JSON.parse(bodyText) as {
      code?: unknown;
    };
    if (typeof parsed.code === "string" && /^[A-Z0-9_]+$/u.test(parsed.code)) {
      return parsed.code;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function classifyPreflightReadFailure(
  httpStatus: number,
  postgrestCode: string | undefined
): ReconciliationCutoverPreflightFailureKind {
  if (postgrestCode === "PGRST205" || postgrestCode === "42P01" || httpStatus === 404) {
    return "missing_table_or_schema_cache";
  }
  if (postgrestCode === "42703") {
    return "schema_mismatch";
  }

  return "read_failed";
}

async function probeMissingSelectedColumns(
  fetcher: ReconciliationCutoverPreflightFetch,
  input: {
    baseUrl: string;
    selectedColumns: readonly string[];
    serviceRoleKey: string;
    tableName: ReconciliationCutoverPreflightSourceTable;
  }
): Promise<string[]> {
  const missingColumns: string[] = [];
  for (const column of input.selectedColumns) {
    if (!/^[a-z_][a-z0-9_]*$/u.test(column)) {
      continue;
    }
    const endpoint = new URL(`${input.baseUrl}/rest/v1/${input.tableName}`);
    endpoint.searchParams.set("select", column);
    endpoint.searchParams.set("limit", "1");
    const response = await fetcher(endpoint.toString(), {
      headers: {
        accept: "application/json",
        apikey: input.serviceRoleKey,
        authorization: `Bearer ${input.serviceRoleKey}`
      },
      method: "GET"
    });
    const postgrestCode = response.ok ? undefined : await readSafePostgrestCode(response);
    if (postgrestCode === "42703") {
      missingColumns.push(column);
    }
  }

  return missingColumns;
}

function buildExpectedCutoverProof(evidenceRows: readonly PreflightEvidenceRow[]): {
  evidenceHashById: Map<string, string>;
  evidenceIds: string[];
  receiptHashById: Map<string, string>;
  receiptIds: string[];
} {
  const retrievedAt = readUniformRetrievedAt(evidenceRows);
  const dataset = materializeRealEvidenceDataset({ retrievedAt });
  const receipts = dataset.claims.map((claim) => reconcileDeductionClaim({ claim, documents: dataset.documents }));

  return {
    evidenceHashById: new Map(dataset.documents.map((document) => [document.evidenceId, document.contentHash])),
    evidenceIds: dataset.documents.map((document) => document.evidenceId).sort(),
    receiptHashById: new Map(receipts.map((receipt) => [receipt.receiptId, receipt.contentHash])),
    receiptIds: receipts.map((receipt) => receipt.receiptId).sort()
  };
}

function readUniformRetrievedAt(evidenceRows: readonly PreflightEvidenceRow[]): string {
  const retrievedAts = new Set(evidenceRows.map((row) => normalizeTimestampIso(row.retrieved_at)).filter((value) => value !== undefined));
  if (retrievedAts.size === 0) {
    return "2026-07-01T00:00:00.000Z";
  }
  if (retrievedAts.size !== 1) {
    throw new Error("Cutover preflight requires a single validated retrieved_at timestamp across expected evidence rows.");
  }
  const retrievedAt = [...retrievedAts][0];
  if (retrievedAt === undefined) {
    throw new Error("Cutover preflight requires evidence retrieved_at timestamps.");
  }

  return retrievedAt;
}

function normalizeTimestampIso(value: string): string | undefined {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  return new Date(timestamp).toISOString();
}

function assertTargetMatchesSupabaseUrl(
  target: ReconciliationCutoverPreflightTarget,
  env: RuntimeEnv,
  supabaseUrl: string
): void {
  if (target !== "production") {
    return;
  }

  const expectedProjectRef = env["RECOUP_PRODUCTION_SUPABASE_PROJECT_REF"];
  if (expectedProjectRef === undefined || expectedProjectRef.trim().length === 0) {
    throw new Error("RECOUP_PRODUCTION_SUPABASE_PROJECT_REF is required for production cutover preflight.");
  }
  const host = new URL(supabaseUrl).host;
  if (host !== `${expectedProjectRef}.supabase.co`) {
    throw new Error(
      `SUPABASE_URL host ${host} does not match RECOUP_PRODUCTION_SUPABASE_PROJECT_REF ${expectedProjectRef}.`
    );
  }
}

function latestTimestamp(values: readonly (string | null | undefined)[]): string | undefined {
  let latest: string | undefined;
  for (const value of values) {
    if (value === undefined || value === null || !Number.isFinite(Date.parse(value))) {
      continue;
    }
    if (latest === undefined || Date.parse(value) > Date.parse(latest)) {
      latest = value;
    }
  }

  return latest;
}

function sourceTableProof(
  table: ReconciliationCutoverPreflightReport["sourceTables"][number]["table"],
  count: number,
  latest: string | undefined
): ReconciliationCutoverPreflightReport["sourceTables"][number] {
  return {
    count,
    ...(latest === undefined ? {} : { latestTimestamp: latest }),
    table
  };
}

function readRequiredEnv(env: RuntimeEnv, name: "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_URL"): string {
  const value = env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required for reconciliation cutover preflight.`);
  }

  return value;
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
  try {
    const report = await buildReconciliationCutoverPreflightReport({ target });
    process.stdout.write(formatReconciliationCutoverPreflightReport(report));
    assertReconciliationCutoverPreflight(report);
  } catch (error: unknown) {
    process.stdout.write(formatReconciliationCutoverPreflightFailureReport({ error, target }));
    throw error;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Reconciliation cutover preflight failed."}\n`);
    process.exitCode = 1;
  });
}
