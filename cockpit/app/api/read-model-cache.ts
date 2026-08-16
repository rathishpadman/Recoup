import { createHash } from "node:crypto";
import { after } from "next/server.js";
import { z } from "zod";

type RuntimeEnv = Partial<Record<string, string | undefined>>;
type ReadModelSurface = "connector-readiness" | "credit-risk-review" | "forensics-analyst";
type ReadModelPayloadSurface = ReadModelSurface | "forensics-work-item-detail";
type ReadModelCacheStatus = "hit" | "miss" | "refresh" | "stale";
type ForensicsReadModelEventListener = (event: ForensicsReadModelEvent) => void;

export type ForensicsReadModelEvent =
  | {
      status: "connected";
      type: "connected";
    }
  | {
      generatedAt: string;
      receiptHash: string;
      sourceHash: string;
      type: "forensics-read-model-invalidated";
    };

export interface ForensicsReadModelBusinessHashes {
  receiptHash: string;
  sourceHash: string;
}

interface SupabaseReadModelRow {
  generated_at: unknown;
  model_key: unknown;
  payload_hash: unknown;
  payload_json: unknown;
  persona: unknown;
  source_record_ids_json: unknown;
  source_refreshed_at: unknown;
  surface: unknown;
}

export const mayaForensicsReadModelKey = "maya:forensics:v1";
export const mayaConnectorsReadModelKey = "maya:connectors:v1";
export const davidCreditRiskReadModelKey = "david:credit-risk-review:v1";
// Demo resilience allowance; the scheduled job still attempts a refresh every 10 minutes.
export const scheduledReadModelMaxAgeMs = 24 * 60 * 60 * 1_000;
export const davidCreditRiskReadModelMaxAgeMs = scheduledReadModelMaxAgeMs;
const readModelFutureSkewMs = 30_000;
export const readModelCacheHeader = "x-recoup-read-model-cache";
export const readModelSourceRefreshedAtHeader = "x-recoup-read-model-source-refreshed-at";
export const readModelSourceHashHeader = "x-recoup-read-model-source-hash";
export const readModelReceiptHashHeader = "x-recoup-read-model-receipt-hash";
const sourceHealthSnapshotTableName = "recoup_source_health_snapshots";
const forensicsReadModelEventSubscribers = new Set<ForensicsReadModelEventListener>();
let lastForwardedForensicsBusinessHashes: ForensicsReadModelBusinessHashes | undefined;
const nonEmptyStringSchema = z.string().min(1);
const finiteNumberSchema = z.number().finite();
const recordIdsSchema = z.array(nonEmptyStringSchema).min(1);
const creditRiskToneSchema = z.enum(["clear", "watch", "elevated", "high"]);
const creditRiskVerdictSchema = z.enum(["HIGH", "ELEVATED", "WATCH", "CLEAR"]);
const creditRiskPacketRowSchema = z.object({
  amountLabel: nonEmptyStringSchema,
  amountValue: finiteNumberSchema,
  detail: nonEmptyStringSchema,
  kind: z.enum(["hold", "limit", "monitor", "reduce", "release"]),
  label: nonEmptyStringSchema
}).passthrough();
const creditRiskAssessmentStepSchema = z.object({
  agentName: nonEmptyStringSchema,
  didLine: nonEmptyStringSchema,
  foundLine: nonEmptyStringSchema,
  isFinal: z.boolean(),
  key: nonEmptyStringSchema,
  phase: z.literal("overnight"),
  recordIds: recordIdsSchema,
  sourceLabel: nonEmptyStringSchema,
  toolLabel: nonEmptyStringSchema.optional(),
  verdict: creditRiskVerdictSchema.optional(),
  verdictLabel: nonEmptyStringSchema.optional()
}).passthrough();
const creditRiskEvidenceDocumentSchema = z.object({
  contentHash: nonEmptyStringSchema,
  deterministicBasis: nonEmptyStringSchema,
  documentId: nonEmptyStringSchema,
  recordIds: recordIdsSchema,
  sourceModeLabel: nonEmptyStringSchema,
  synthetic: z.boolean(),
  title: nonEmptyStringSchema
}).passthrough();
const creditRiskFactSchema = z.object({
  key: z.enum(["days-beyond-terms", "dso", "open-disputes", "payment-trend"]),
  label: nonEmptyStringSchema,
  tone: creditRiskToneSchema,
  valueLabel: nonEmptyStringSchema
}).passthrough();
const creditRiskMeshPositionSchema = z.object({
  contractGap: z.boolean(),
  contractGapReason: nonEmptyStringSchema.optional(),
  deterministicBasis: nonEmptyStringSchema.nullable(),
  driverSignals: z.string(),
  interpretation: nonEmptyStringSchema,
  keyMetric: nonEmptyStringSchema,
  position: z.enum(["Credit", "Fulfilment", "Billing", "Collections"]),
  recordIds: recordIdsSchema,
  status: z.enum(["OK", "WATCH", "ELEVATED", "HIGH"]),
  statusRank: z.number().int().nonnegative(),
  statusTone: creditRiskToneSchema
}).passthrough();
const creditNegotiationRoundSchema = z.object({
  actionId: nonEmptyStringSchema,
  round: z.number().int().positive(),
  status: z.enum(["accepted", "countered", "drafted", "rejected", "sent", "withdrawn"])
}).passthrough();
const creditNegotiationOrderSchema = z.object({
  currentRound: creditNegotiationRoundSchema.optional(),
  latestSentRound: creditNegotiationRoundSchema.extend({ status: z.literal("sent") }).optional(),
  nextRound: z.number().int().positive(),
  orderAmount: finiteNumberSchema,
  orderAmountLabel: nonEmptyStringSchema,
  orderId: nonEmptyStringSchema,
  sourceModeLabel: z.literal("governed Supabase negotiation source"),
  sourceRecordIds: recordIdsSchema
}).passthrough();
const creditRiskSignalSchema = z.object({
  basis: nonEmptyStringSchema,
  feedsMesh: nonEmptyStringSchema,
  gamingFlag: z.boolean(),
  meshPosition: nonEmptyStringSchema,
  note: nonEmptyStringSchema,
  recordIds: recordIdsSchema,
  routeLabel: nonEmptyStringSchema,
  scenarioId: nonEmptyStringSchema,
  tone: creditRiskToneSchema,
  verdict: z.enum(["VALID", "INVALID", "PARTIAL"])
}).passthrough();
const creditSourceConnectorSchema = z.object({
  checkedAtLabel: nonEmptyStringSchema,
  connectorKey: z.enum(["bureau-payment-history", "contract-tpm", "sap-odata", "supabase-tools"]),
  label: nonEmptyStringSchema,
  proofItems: z.array(nonEmptyStringSchema).min(1),
  recordIds: recordIdsSchema,
  sourceModeLabel: nonEmptyStringSchema,
  statusLabel: nonEmptyStringSchema,
  synthetic: z.boolean()
}).passthrough();
const creditRiskPacketSchema = z.object({
  actionId: nonEmptyStringSchema,
  approvalStatus: z.enum(["awaiting", "committed"]),
  basis: nonEmptyStringSchema,
  detail: nonEmptyStringSchema,
  deterministicBasis: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  dispatchedExternally: z.boolean(),
  recordIds: recordIdsSchema,
  requiresHumanApproval: z.boolean(),
  routeLabel: nonEmptyStringSchema,
  rows: z.array(creditRiskPacketRowSchema),
  title: nonEmptyStringSchema
}).passthrough();
const creditRiskAccountSchema = z.object({
  accountId: nonEmptyStringSchema,
  actionPacket: z.array(creditRiskPacketRowSchema),
  assessmentSteps: z.array(creditRiskAssessmentStepSchema).min(1),
  channel: nonEmptyStringSchema,
  copilotConductorLine: nonEmptyStringSchema,
  creditLimitAmount: finiteNumberSchema,
  creditLimitLabel: nonEmptyStringSchema,
  customer: nonEmptyStringSchema,
  daysBeyondTerms: finiteNumberSchema,
  daysBeyondTermsLabel: nonEmptyStringSchema,
  dsoDays: finiteNumberSchema,
  dsoLabel: nonEmptyStringSchema,
  evidenceDocuments: z.array(creditRiskEvidenceDocumentSchema),
  exposureAmount: finiteNumberSchema,
  exposureLabel: nonEmptyStringSchema,
  facts: z.array(creditRiskFactSchema).min(1),
  gamingFlag: z.boolean(),
  leadLabel: nonEmptyStringSchema,
  meshPositions: z.array(creditRiskMeshPositionSchema).min(1),
  negotiationOrders: z.array(creditNegotiationOrderSchema),
  openDisputeAmount: finiteNumberSchema,
  openDisputeAmountLabel: nonEmptyStringSchema,
  openDisputeCount: z.number().int().nonnegative(),
  packet: creditRiskPacketSchema,
  paymentTrend: nonEmptyStringSchema,
  paymentTrendLabel: nonEmptyStringSchema,
  paymentTrendTone: creditRiskToneSchema,
  priorAvgDaysToPay: finiteNumberSchema,
  priorAvgDaysToPayLabel: nonEmptyStringSchema,
  recentAvgDaysToPay: finiteNumberSchema,
  recentAvgDaysToPayLabel: nonEmptyStringSchema,
  recordIds: recordIdsSchema,
  relationshipOwner: nonEmptyStringSchema,
  routeLabel: nonEmptyStringSchema,
  routeLine: nonEmptyStringSchema,
  segment: nonEmptyStringSchema,
  signals: z.array(creditRiskSignalSchema),
  termsDays: finiteNumberSchema,
  termsLabel: nonEmptyStringSchema,
  totalSalesAmount: finiteNumberSchema,
  totalSalesLabel: nonEmptyStringSchema,
  unsupportedAmount: finiteNumberSchema,
  unsupportedAmountLabel: nonEmptyStringSchema,
  utilisationLabel: nonEmptyStringSchema,
  utilisationPercent: finiteNumberSchema,
  utilisationRatio: finiteNumberSchema,
  verdict: creditRiskVerdictSchema,
  verdictBasis: nonEmptyStringSchema,
  verdictTone: creditRiskToneSchema
}).passthrough();
export const creditRiskReviewPayloadSchema = z.object({
  accounts: z.array(creditRiskAccountSchema).min(1),
  asOfDate: nonEmptyStringSchema,
  asOfLabel: nonEmptyStringSchema,
  copilot: z.object({
    conductorLabel: nonEmptyStringSchema,
    note: nonEmptyStringSchema,
    readinessLabel: nonEmptyStringSchema,
    suggestions: z.array(z.object({ question: nonEmptyStringSchema, suggestionId: nonEmptyStringSchema }).passthrough()).min(1),
    title: nonEmptyStringSchema
  }).passthrough(),
  navCounts: z.object({
    actionPackets: z.number().int().nonnegative(),
    riskReview: z.number().int().nonnegative(),
    watchlist: z.number().int().nonnegative()
  }),
  portfolio: z.object({ totalExposureAmount: finiteNumberSchema, totalExposureLabel: nonEmptyStringSchema }).passthrough(),
  queueStats: z.array(z.object({ key: nonEmptyStringSchema, label: nonEmptyStringSchema, tone: nonEmptyStringSchema, valueLabel: nonEmptyStringSchema }).passthrough()).min(1),
  sourceLabel: nonEmptyStringSchema,
  sources: z.object({
    auditTrailLabel: nonEmptyStringSchema,
    connectors: z.array(creditSourceConnectorSchema).min(1),
    externalActionsLabel: nonEmptyStringSchema,
    topbarLabel: nonEmptyStringSchema
  }).passthrough(),
  surface: z.literal("credit-risk-review")
}).passthrough();

export function mayaForensicsWorkItemReadModelKey(lineId: string): string {
  return `maya:forensics:work-item:${lineId}:v3`;
}

export async function readCachedReadModelPayload(
  runtimeEnv: RuntimeEnv,
  modelKey: string,
  surface: ReadModelSurface,
  options: { maxAgeMs?: number; payloadSurface?: ReadModelPayloadSurface; persona?: "david" | "maya" } = {}
): Promise<{ payload: Record<string, unknown>; sourceRecordIds: string[]; sourceRefreshedAt: string } | undefined> {
  if (isReadModelCacheDisabled(runtimeEnv) || runtimeEnv.SUPABASE_SERVICE_ROLE_KEY === undefined || runtimeEnv.SUPABASE_URL === undefined) {
    return undefined;
  }

  try {
    const tableName = runtimeEnv.RECOUP_SUPABASE_READ_MODEL_TABLE ?? "recoup_cockpit_read_models";
    if (!isSafeTableName(tableName)) {
      return undefined;
    }
    const url = new URL(`${normalizeSupabaseUrl(runtimeEnv.SUPABASE_URL)}/rest/v1/${tableName}`);
    url.searchParams.set(
      "select",
      "model_key,surface,persona,payload_json,source_record_ids_json,payload_hash,source_refreshed_at,generated_at"
    );
    url.searchParams.set("model_key", `eq.${modelKey}`);
    url.searchParams.set("limit", "1");
    const response = await fetch(url.href, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        apikey: runtimeEnv.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${runtimeEnv.SUPABASE_SERVICE_ROLE_KEY}`
      },
      method: "GET"
    });
    if (!response.ok) {
      return undefined;
    }

    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows) || rows.length === 0 || !isReadModelRow(rows[0])) {
      return undefined;
    }
    const row = rows[0];
    const payload = parsePayloadRecord(row.payload_json);
    const payloadSurface = options.payloadSurface ?? surface;
    const persona = options.persona ?? "maya";
    const sourceRecordIds = parseJsonCell(row.source_record_ids_json);
    if (
      row.model_key !== modelKey ||
      row.persona !== persona ||
      row.surface !== surface ||
      typeof row.payload_hash !== "string" ||
      !/^[a-f0-9]{64}$/u.test(row.payload_hash) ||
      (surface === "credit-risk-review" && row.payload_hash !== sha256CanonicalJson(payload)) ||
      !isNonEmptyStringArray(sourceRecordIds) ||
      typeof row.source_refreshed_at !== "string" ||
      !isReadModelFresh(row.source_refreshed_at, options.maxAgeMs) ||
      !isReadModelPayloadForSurface(payload, payloadSurface)
    ) {
      return undefined;
    }

    return {
      payload,
      sourceRecordIds,
      sourceRefreshedAt: row.source_refreshed_at
    };
  } catch {
    return undefined;
  }
}

export function subscribeForensicsReadModelEvents(listener: ForensicsReadModelEventListener): () => void {
  forensicsReadModelEventSubscribers.add(listener);

  return () => {
    forensicsReadModelEventSubscribers.delete(listener);
  };
}

export function buildForensicsReadModelBusinessHashes(sourceRecordIds: readonly string[]): ForensicsReadModelBusinessHashes {
  const normalizedRecordIds = normalizeRecordIds(sourceRecordIds);
  const receiptRecordIds = normalizedRecordIds.filter(isReceiptFreshnessRecordId);
  const sourceRecordIdsWithoutReceipts = normalizedRecordIds.filter((recordId) => !isReceiptFreshnessRecordId(recordId));

  return {
    receiptHash: sha256CanonicalJson(receiptRecordIds),
    sourceHash: sha256CanonicalJson(sourceRecordIdsWithoutReceipts)
  };
}

export async function readLatestSourceHealthSnapshotCheckedAt(runtimeEnv: RuntimeEnv): Promise<string | undefined> {
  if (isReadModelCacheDisabled(runtimeEnv) || runtimeEnv.SUPABASE_SERVICE_ROLE_KEY === undefined || runtimeEnv.SUPABASE_URL === undefined) {
    return undefined;
  }

  try {
    const url = new URL(`${normalizeSupabaseUrl(runtimeEnv.SUPABASE_URL)}/rest/v1/${sourceHealthSnapshotTableName}`);
    url.searchParams.set("select", "checked_at");
    url.searchParams.set("order", "checked_at.desc");
    url.searchParams.set("limit", "1");
    const response = await fetch(url.href, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        apikey: runtimeEnv.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${runtimeEnv.SUPABASE_SERVICE_ROLE_KEY}`
      },
      method: "GET"
    });
    if (!response.ok) {
      return undefined;
    }

    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows)) {
      return undefined;
    }
    const checkedAt = rows
      .map((row) => (typeof row === "object" && row !== null && !Array.isArray(row) ? (row as { checked_at?: unknown }).checked_at : undefined))
      .find(isValidTimestamp);

    return checkedAt;
  } catch {
    return undefined;
  }
}

export function isConnectorReadModelFreshForSourceHealth(
  payload: Record<string, unknown>,
  latestSourceHealthCheckedAt: string | undefined
): boolean {
  if (latestSourceHealthCheckedAt === undefined) {
    return true;
  }

  const cachedCheckedAt = readConnectorModelCheckedAt(payload);
  return cachedCheckedAt !== undefined && Date.parse(cachedCheckedAt) >= Date.parse(latestSourceHealthCheckedAt);
}

export async function publishCachedReadModelPayload(
  runtimeEnv: RuntimeEnv,
  input: {
    modelKey: string;
    payload: Record<string, unknown>;
    payloadSurface: ReadModelPayloadSurface;
    persona?: "david" | "maya";
    previousSourceRecordIds?: readonly string[];
    rowSurface: ReadModelSurface;
    sourceRecordIds: string[];
    sourceRefreshedAt?: string;
  }
): Promise<void> {
  if (
    isReadModelCacheDisabled(runtimeEnv) ||
    runtimeEnv.SUPABASE_SERVICE_ROLE_KEY === undefined ||
    runtimeEnv.SUPABASE_URL === undefined ||
    !isReadModelPayloadForSurface(input.payload, input.payloadSurface) ||
    !isNonEmptyStringArray(input.sourceRecordIds)
  ) {
    return;
  }

  try {
    const tableName = runtimeEnv.RECOUP_SUPABASE_READ_MODEL_TABLE ?? "recoup_cockpit_read_models";
    if (!isSafeTableName(tableName)) {
      return;
    }
    const previousSourceRecordIds = input.previousSourceRecordIds ?? (isForensicsReadModelPublish(input)
      ? await readCachedReadModelSourceRecordIds(runtimeEnv, input.modelKey, input.rowSurface)
      : undefined);
    const now = new Date().toISOString();
    const url = new URL(`${normalizeSupabaseUrl(runtimeEnv.SUPABASE_URL)}/rest/v1/${tableName}`);
    url.searchParams.set("on_conflict", "model_key");
    const response = await fetch(url.href, {
      body: JSON.stringify([
        {
          generated_at: now,
          model_key: input.modelKey,
          payload_hash: sha256CanonicalJson(input.payload),
          payload_json: input.payload,
          persona: input.persona ?? "maya",
          source_record_ids_json: input.sourceRecordIds,
          source_refreshed_at: input.sourceRefreshedAt ?? now,
          surface: input.rowSurface
        }
      ]),
      cache: "no-store",
      headers: {
        accept: "application/json",
        apikey: runtimeEnv.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${runtimeEnv.SUPABASE_SERVICE_ROLE_KEY}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal"
      },
      method: "POST"
    });
    if (!response.ok) {
      return;
    }
    publishForensicsReadModelInvalidationIfChanged(previousSourceRecordIds, input.sourceRecordIds);
  } catch {
    return;
  }
}

export function readModelJsonResponse(
  payload: Record<string, unknown>,
  cacheStatus: ReadModelCacheStatus,
  options: { businessHashes?: ForensicsReadModelBusinessHashes; sourceRefreshedAt?: string; status?: number } = {}
): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
      [readModelCacheHeader]: cacheStatus,
      ...(options.businessHashes === undefined
        ? {}
        : {
            [readModelReceiptHashHeader]: options.businessHashes.receiptHash,
            [readModelSourceHashHeader]: options.businessHashes.sourceHash
          }),
      ...(options.sourceRefreshedAt === undefined ? {} : { [readModelSourceRefreshedAtHeader]: options.sourceRefreshedAt })
    },
    status: options.status ?? 200
  });
}

export function proxyJsonResponse(upstream: Response, body: string, fallbackCacheStatus: "miss" | "refresh"): Response {
  publishForwardedForensicsInvalidationIfChanged(readForwardedBusinessHashes(upstream));

  return new Response(body, {
    headers: {
      "cache-control": "no-store",
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      [readModelCacheHeader]: upstream.headers.get(readModelCacheHeader) ?? fallbackCacheStatus,
      ...forwardOptionalHeader(upstream, readModelReceiptHashHeader),
      ...forwardOptionalHeader(upstream, readModelSourceHashHeader)
    },
    status: upstream.status
  });
}

function readForwardedBusinessHashes(response: Response): ForensicsReadModelBusinessHashes | undefined {
  const receiptHash = response.headers.get(readModelReceiptHashHeader);
  const sourceHash = response.headers.get(readModelSourceHashHeader);
  if (receiptHash === null || sourceHash === null || !isSha256Hex(receiptHash) || !isSha256Hex(sourceHash)) {
    return undefined;
  }

  return { receiptHash, sourceHash };
}

function publishForwardedForensicsInvalidationIfChanged(next: ForensicsReadModelBusinessHashes | undefined): void {
  if (next === undefined) {
    return;
  }

  const previous = lastForwardedForensicsBusinessHashes;
  lastForwardedForensicsBusinessHashes = next;
  if (previous === undefined || (previous.sourceHash === next.sourceHash && previous.receiptHash === next.receiptHash)) {
    return;
  }

  publishForensicsReadModelInvalidation(next);
}

async function readCachedReadModelSourceRecordIds(
  runtimeEnv: RuntimeEnv,
  modelKey: string,
  surface: ReadModelSurface
): Promise<string[] | undefined> {
  const cached = await readCachedReadModelPayload(runtimeEnv, modelKey, surface);

  return cached?.sourceRecordIds;
}

function publishForensicsReadModelInvalidationIfChanged(
  previousSourceRecordIds: readonly string[] | undefined,
  nextSourceRecordIds: readonly string[]
): void {
  const next = buildForensicsReadModelBusinessHashes(nextSourceRecordIds);
  const previous = previousSourceRecordIds === undefined ? undefined : buildForensicsReadModelBusinessHashes(previousSourceRecordIds);
  if (previous !== undefined && previous.sourceHash === next.sourceHash && previous.receiptHash === next.receiptHash) {
    return;
  }

  publishForensicsReadModelInvalidation(next);
}

function publishForensicsReadModelInvalidation(next: ForensicsReadModelBusinessHashes): void {
  const event: ForensicsReadModelEvent = {
    generatedAt: new Date().toISOString(),
    receiptHash: next.receiptHash,
    sourceHash: next.sourceHash,
    type: "forensics-read-model-invalidated"
  };
  for (const listener of forensicsReadModelEventSubscribers) {
    listener(event);
  }
}

function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/u.test(value);
}

function isForensicsReadModelPublish(input: {
  modelKey: string;
  payloadSurface: ReadModelPayloadSurface;
  rowSurface: ReadModelSurface;
}): boolean {
  return input.rowSurface === "forensics-analyst" && input.modelKey.startsWith("maya:forensics:");
}

function forwardOptionalHeader(response: Response, name: string): Record<string, string> {
  const value = response.headers.get(name);

  return value === null ? {} : { [name]: value };
}

export function refreshReadModelAfterResponse(
  runtimeEnv: RuntimeEnv,
  authHeaders: HeadersInit,
  target: {
    method: "GET" | "POST";
    path: "/connectors" | "/credit/v2/refresh" | "/forensics/refresh" | `/forensics/work-items/${string}`;
  }
): void {
  if (isReadModelCacheDisabled(runtimeEnv) || runtimeEnv.RECOUP_READ_MODEL_BACKGROUND_REFRESH === "disabled") {
    return;
  }

  const apiBaseUrl = runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317";
  const run = (): void => {
    void fetch(`${apiBaseUrl}${target.path}`, {
      cache: "no-store",
      headers: authHeaders,
      method: target.method
    }).catch(() => undefined);
  };

  try {
    after(run);
  } catch {
    run();
  }
}

function isReadModelPayloadForSurface(
  value: unknown,
  surface: ReadModelPayloadSurface
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !("surface" in value) || value.surface !== surface) {
    return false;
  }

  return surface !== "credit-risk-review" || isCreditRiskReviewPayload(value);
}

function isCreditRiskReviewPayload(value: Record<string, unknown>): boolean {
  return creditRiskReviewPayloadSchema.safeParse(value).success;
}

function isReadModelFresh(sourceRefreshedAt: string, maxAgeMs: number | undefined): boolean {
  if (maxAgeMs === undefined) {
    return true;
  }
  const refreshedAtMs = Date.parse(sourceRefreshedAt);
  const nowMs = Date.now();

  return Number.isFinite(refreshedAtMs) && refreshedAtMs <= nowMs + readModelFutureSkewMs && nowMs - refreshedAtMs <= maxAgeMs;
}

function isReadModelRow(value: unknown): value is SupabaseReadModelRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePayloadRecord(value: unknown): Record<string, unknown> | undefined {
  const parsed = parseJsonCell(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  return parsed as Record<string, unknown>;
}

function parseJsonCell(value: unknown): unknown {
  return typeof value === "string" ? (JSON.parse(value) as unknown) : value;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

function isReceiptFreshnessRecordId(recordId: string): boolean {
  return recordId === "receipt-set:absent" || recordId.startsWith("receipt:") || recordId.startsWith("receipt-set:");
}

function readConnectorModelCheckedAt(payload: Record<string, unknown>): string | undefined {
  if (isValidTimestamp(payload.checkedAtIso)) {
    return payload.checkedAtIso;
  }

  return Array.isArray(payload.sourceHealth) ? mostRecentCheckedAtIso(payload.sourceHealth) : undefined;
}

function mostRecentCheckedAtIso(rows: readonly unknown[]): string | undefined {
  let latest: string | undefined;
  for (const row of rows) {
    const checkedAtIso = readCheckedAtIso(row);
    if (checkedAtIso === undefined) {
      continue;
    }

    if (latest === undefined || Date.parse(checkedAtIso) > Date.parse(latest)) {
      latest = checkedAtIso;
    }
  }

  return latest;
}

function readCheckedAtIso(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !("checkedAtIso" in value)) {
    return undefined;
  }

  const checkedAtIso = (value as { checkedAtIso?: unknown }).checkedAtIso;
  return isValidTimestamp(checkedAtIso) ? checkedAtIso : undefined;
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isSafeTableName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(value);
}

function normalizeSupabaseUrl(value: string): string {
  return value.replace(/\/+$/u, "");
}

function isReadModelCacheDisabled(runtimeEnv: RuntimeEnv): boolean {
  return runtimeEnv.RECOUP_READ_MODEL_CACHE === "disabled";
}

function normalizeRecordIds(recordIds: readonly string[]): string[] {
  return [...new Set(recordIds.map((recordId) => recordId.trim()).filter((recordId) => recordId.length > 0))].sort();
}

function sha256CanonicalJson(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

/**
 * A cached read model bakes in each credit recommendation's approval status, and nothing evicts it
 * when an approval commits. Without this check an approved recommendation kept re-offering its
 * approve control, and the credit surface kept serving a snapshot taken before the decision.
 */
export function cachedCreditRecommendationActionIds(payload: Record<string, unknown>): string[] {
  const recommendations = payload["creditRecommendations"];
  if (!Array.isArray(recommendations)) {
    return [];
  }

  const actionIds: string[] = [];
  for (const entry of recommendations) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const actionId = (entry as Record<string, unknown>)["actionId"];
    if (typeof actionId === "string" && actionId.length > 0) {
      actionIds.push(actionId);
    }
  }

  return actionIds;
}

export function cachedCreditRecommendationStateIsFresh(
  payload: Record<string, unknown>,
  committedApprovalActionIds: ReadonlySet<string>
): boolean {
  const recommendations = payload["creditRecommendations"];
  if (!Array.isArray(recommendations)) {
    return true;
  }

  return recommendations.every((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return true;
    }
    const record = entry as Record<string, unknown>;
    const actionId = record["actionId"];
    if (typeof actionId !== "string" || actionId.length === 0) {
      return true;
    }

    const cachedAsDecided = record["status"] === "human_decided";

    return cachedAsDecided === committedApprovalActionIds.has(actionId);
  });
}

/** Signals carry the recommendation action ID as their scenario ID. */
export function cachedCreditRecommendationSignalActionIds(payload: Record<string, unknown>): string[] {
  const accounts = payload["accounts"];
  if (!Array.isArray(accounts)) {
    return [];
  }

  const actionIds: string[] = [];
  for (const account of accounts) {
    if (typeof account !== "object" || account === null) {
      continue;
    }
    const signals = (account as Record<string, unknown>)["signals"];
    if (!Array.isArray(signals)) {
      continue;
    }
    for (const signal of signals) {
      if (typeof signal !== "object" || signal === null) {
        continue;
      }
      const scenarioId = (signal as Record<string, unknown>)["scenarioId"];
      if (typeof scenarioId === "string" && scenarioId.startsWith("credit-recommendation:")) {
        actionIds.push(scenarioId);
      }
    }
  }

  return actionIds;
}

/**
 * Every committed Maya credit-recommendation approval. Returns undefined when the store cannot be
 * read, so callers fail closed onto a fresh build rather than trusting a possibly stale cache.
 */
export async function readCommittedCreditRecommendationActionIds(
  runtimeEnv: RuntimeEnv
): Promise<ReadonlySet<string> | undefined> {
  if (runtimeEnv.SUPABASE_SERVICE_ROLE_KEY === undefined || runtimeEnv.SUPABASE_URL === undefined) {
    return undefined;
  }

  const tableName = runtimeEnv.RECOUP_SUPABASE_MEMORY_TABLE ?? "recoup_memory_records";
  if (!/^[A-Za-z0-9_]+$/u.test(tableName)) {
    return undefined;
  }

  try {
    const url = new URL(`${runtimeEnv.SUPABASE_URL.replace(/\/+$/u, "")}/rest/v1/${tableName}`);
    url.searchParams.set("select", "id,category,trust_level");
    url.searchParams.set("category", "eq.approval_records");
    url.searchParams.set("id", "like.approval:credit-recommendation:*");

    const response = await fetch(url.href, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        apikey: runtimeEnv.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${runtimeEnv.SUPABASE_SERVICE_ROLE_KEY}`
      },
      method: "GET"
    });
    if (!response.ok) {
      return undefined;
    }

    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows)) {
      return undefined;
    }

    const actionIds = new Set<string>();
    for (const row of rows) {
      if (typeof row !== "object" || row === null) {
        continue;
      }
      const record = row as Record<string, unknown>;
      if (record["trust_level"] !== "trusted" || typeof record["id"] !== "string") {
        continue;
      }
      actionIds.add(record["id"].replace(/^approval:/u, ""));
    }

    return actionIds;
  } catch {
    return undefined;
  }
}

/**
 * The credit surface caches its whole account list, so a recommendation approved a moment ago stays
 * invisible until the cache ages out. A cached payload is stale when its recommendation signals do
 * not match the committed approvals exactly.
 */
export function cachedCreditSignalsAgreeWithApprovals(
  payload: Record<string, unknown>,
  committedActionIds: ReadonlySet<string>
): boolean {
  const cachedActionIds = new Set(cachedCreditRecommendationSignalActionIds(payload));

  return (
    cachedActionIds.size === committedActionIds.size &&
    [...committedActionIds].every((actionId) => cachedActionIds.has(actionId))
  );
}
