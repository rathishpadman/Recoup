import { loadLocalRuntimeEnvFiles } from "../../../../../config/localRuntimeEnv.ts";

const defaultWarmBackendTimeoutMs = 5_000;

export async function GET(): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const apiBaseUrl = runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317";
  const timeoutMs = resolveWarmBackendTimeoutMs(runtimeEnv.RECOUP_WARM_BACKEND_TIMEOUT_MS);

  try {
    const upstream = await fetchWithTimeout(
      `${apiBaseUrl}/healthz`,
      {
        cache: "no-store",
        method: "GET"
      },
      timeoutMs
    );
    if (upstream === undefined || !upstream.ok) {
      return jsonNoStore({ ok: false }, 504);
    }

    return jsonNoStore({ ok: true }, 200);
  } catch {
    return jsonNoStore({ ok: false }, 504);
  }
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
