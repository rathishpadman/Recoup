import { createHash } from "node:crypto";
import { after } from "next/server.js";

type RuntimeEnv = Partial<Record<string, string | undefined>>;
type ReadModelSurface = "connector-readiness" | "forensics-analyst";
type ReadModelPayloadSurface = ReadModelSurface | "forensics-work-item-detail";
type ReadModelCacheStatus = "hit" | "miss" | "refresh";

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
export const readModelCacheHeader = "x-recoup-read-model-cache";
export const readModelSourceRefreshedAtHeader = "x-recoup-read-model-source-refreshed-at";
const sourceHealthSnapshotTableName = "recoup_source_health_snapshots";

export function mayaForensicsWorkItemReadModelKey(lineId: string): string {
  return `maya:forensics:work-item:${lineId}:v1`;
}

export async function readCachedReadModelPayload(
  runtimeEnv: RuntimeEnv,
  modelKey: string,
  surface: ReadModelSurface,
  options: { payloadSurface?: ReadModelPayloadSurface } = {}
): Promise<{ payload: Record<string, unknown>; sourceRefreshedAt: string } | undefined> {
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
    if (
      row.model_key !== modelKey ||
      row.persona !== "maya" ||
      row.surface !== surface ||
      typeof row.payload_hash !== "string" ||
      !/^[a-f0-9]{64}$/u.test(row.payload_hash) ||
      !isNonEmptyStringArray(parseJsonCell(row.source_record_ids_json)) ||
      typeof row.source_refreshed_at !== "string" ||
      !isReadModelPayloadForSurface(payload, payloadSurface)
    ) {
      return undefined;
    }

    return {
      payload,
      sourceRefreshedAt: row.source_refreshed_at
    };
  } catch {
    return undefined;
  }
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
          persona: "maya",
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
  } catch {
    return;
  }
}

export function readModelJsonResponse(
  payload: Record<string, unknown>,
  cacheStatus: ReadModelCacheStatus,
  options: { sourceRefreshedAt?: string; status?: number } = {}
): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
      [readModelCacheHeader]: cacheStatus,
      ...(options.sourceRefreshedAt === undefined ? {} : { [readModelSourceRefreshedAtHeader]: options.sourceRefreshedAt })
    },
    status: options.status ?? 200
  });
}

export function proxyJsonResponse(upstream: Response, body: string, fallbackCacheStatus: "miss" | "refresh"): Response {
  return new Response(body, {
    headers: {
      "cache-control": "no-store",
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      [readModelCacheHeader]: upstream.headers.get(readModelCacheHeader) ?? fallbackCacheStatus
    },
    status: upstream.status
  });
}

export function refreshReadModelAfterResponse(
  runtimeEnv: RuntimeEnv,
  authHeaders: HeadersInit,
  target: { method: "GET" | "POST"; path: "/connectors" | "/forensics/refresh" | `/forensics/work-items/${string}` }
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
  return typeof value === "object" && value !== null && !Array.isArray(value) && "surface" in value && value.surface === surface;
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

function isNonEmptyStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.trim().length > 0);
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
