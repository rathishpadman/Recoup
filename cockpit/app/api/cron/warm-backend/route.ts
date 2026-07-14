import { timingSafeEqual } from "node:crypto";
import { loadLocalRuntimeEnvFiles } from "../../../../../config/localRuntimeEnv.ts";

const defaultWarmBackendTimeoutMs = 120_000;

export async function GET(request: Request): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  if (!hasBearerSecret(request.headers.get("authorization"), runtimeEnv.RECOUP_WARM_BACKEND_SECRET)) {
    return jsonNoStore({ ok: false }, 401);
  }

  const apiBaseUrl = runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317";
  const timeoutMs = resolveWarmBackendTimeoutMs(runtimeEnv.RECOUP_WARM_BACKEND_TIMEOUT_MS);
  const authHeaders = readBackendRefreshAuthHeaders(runtimeEnv);
  if (authHeaders === undefined) {
    return jsonNoStore({ ok: false }, 504);
  }

  try {
    const refreshResponses = await Promise.all([
      fetchWithTimeout(
        `${apiBaseUrl}/forensics/refresh`,
        { cache: "no-store", headers: authHeaders, method: "POST" },
        timeoutMs
      ),
      fetchWithTimeout(
        `${apiBaseUrl}/connectors`,
        { cache: "no-store", headers: authHeaders, method: "GET" },
        timeoutMs
      ),
      fetchWithTimeout(
        `${apiBaseUrl}/credit/v2/refresh`,
        { cache: "no-store", headers: authHeaders, method: "POST" },
        timeoutMs
      )
    ]);
    if (refreshResponses.some((refreshResponse) => refreshResponse === undefined || !refreshResponse.ok)) {
      return jsonNoStore({ ok: false }, 504);
    }

    return jsonNoStore({ ok: true }, 200);
  } catch {
    return jsonNoStore({ ok: false }, 504);
  }
}

function hasBearerSecret(value: string | null, expectedSecret: string | undefined): boolean {
  const token = value?.trim().replace(/^Bearer\s+/iu, "");
  const expected = expectedSecret?.trim();
  if (token === undefined || token.length === 0 || expected === undefined || expected.length === 0) {
    return false;
  }
  const tokenBytes = Buffer.from(token);
  const expectedBytes = Buffer.from(expected);

  return tokenBytes.length === expectedBytes.length && timingSafeEqual(tokenBytes, expectedBytes);
}

function readBackendRefreshAuthHeaders(runtimeEnv: Partial<Record<string, string | undefined>>): HeadersInit | undefined {
  const principal = runtimeEnv.RECOUP_COCKPIT_HUMAN_PRINCIPAL?.trim();
  const token = runtimeEnv.RECOUP_COCKPIT_AUTH_TOKEN?.trim();
  if (principal === undefined || !principal.startsWith("human:") || token === undefined || token.length === 0) {
    return undefined;
  }

  return {
    "x-recoup-human-principal": principal,
    "x-recoup-human-token": token
  };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response | undefined> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(undefined);
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      fetch(input, {
        ...init,
        signal: controller.signal
      }),
      timeout
    ]);
  } catch {
    return undefined;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function jsonNoStore(body: { ok: boolean }, status: number): Response {
  return Response.json(body, {
    headers: { "cache-control": "no-store" },
    status
  });
}

function resolveWarmBackendTimeoutMs(value: string | undefined): number {
  if (value === undefined) {
    return defaultWarmBackendTimeoutMs;
  }
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultWarmBackendTimeoutMs;
}
