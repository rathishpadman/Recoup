import { after } from "next/server.js";

type RuntimeEnv = Partial<Record<string, string | undefined>>;
type ReadModelSurface = "connector-readiness" | "forensics-analyst";
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

export async function readCachedReadModelPayload(
  runtimeEnv: RuntimeEnv,
  modelKey: string,
  surface: ReadModelSurface
): Promise<{ payload: Record<string, unknown>; sourceRefreshedAt: string } | undefined> {
  if (runtimeEnv.SUPABASE_SERVICE_ROLE_KEY === undefined || runtimeEnv.SUPABASE_URL === undefined) {
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
    if (
      row.model_key !== modelKey ||
      row.persona !== "maya" ||
      row.surface !== surface ||
      typeof row.payload_hash !== "string" ||
      !/^[a-f0-9]{64}$/u.test(row.payload_hash) ||
      !isNonEmptyStringArray(parseJsonCell(row.source_record_ids_json)) ||
      typeof row.source_refreshed_at !== "string" ||
      !isReadModelPayloadForSurface(payload, surface)
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
  target: { method: "GET" | "POST"; path: "/connectors" | "/forensics/refresh" }
): void {
  if (runtimeEnv.RECOUP_READ_MODEL_BACKGROUND_REFRESH === "disabled") {
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
  surface: ReadModelSurface
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

function isSafeTableName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(value);
}

function normalizeSupabaseUrl(value: string): string {
  return value.replace(/\/+$/u, "");
}
