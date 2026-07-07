import { loadLocalRuntimeEnvFiles } from "../../../../../config/localRuntimeEnv.ts";

export async function GET(): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const apiBaseUrl = runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317";

  try {
    const upstream = await fetch(`${apiBaseUrl}/healthz`, {
      cache: "no-store",
      method: "GET"
    });
    if (!upstream.ok) {
      return jsonNoStore({ ok: false }, 504);
    }

    return jsonNoStore({ ok: true }, 200);
  } catch {
    return jsonNoStore({ ok: false }, 504);
  }
}

function jsonNoStore(body: { ok: boolean }, status: number): Response {
  return Response.json(body, {
    headers: { "cache-control": "no-store" },
    status
  });
}
