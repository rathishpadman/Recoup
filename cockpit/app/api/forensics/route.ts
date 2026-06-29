import { loadLocalRuntimeEnvFiles } from "../../../../config/localRuntimeEnv.ts";
import { buildVerifiedHumanAuthHeaders } from "../human-auth.ts";
import {
  mayaForensicsReadModelKey,
  proxyJsonResponse,
  readCachedReadModelPayload,
  readModelJsonResponse,
  refreshReadModelAfterResponse
} from "../read-model-cache.ts";

export async function GET(request: Request): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const apiBaseUrl = runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317";
  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["maya"]
  });
  if (authHeaders === undefined) {
    return Response.json({ error: "Verified human cockpit auth required." }, { headers: noStoreHeaders(), status: 401 });
  }

  const cached = await readCachedReadModelPayload(runtimeEnv, mayaForensicsReadModelKey, "forensics-analyst");
  if (cached !== undefined) {
    refreshReadModelAfterResponse(runtimeEnv, authHeaders, { method: "POST", path: "/forensics/refresh" });
    return readModelJsonResponse(cached.payload, "hit", { sourceRefreshedAt: cached.sourceRefreshedAt });
  }

  try {
    const upstream = await fetch(`${apiBaseUrl}/forensics`, {
      cache: "no-store",
      headers: authHeaders,
      method: "GET"
    });

    return proxyJsonResponse(upstream, await upstream.text(), "miss");
  } catch {
    return Response.json({ error: "Forensics workbench service unavailable." }, { headers: noStoreHeaders(), status: 502 });
  }
}

function noStoreHeaders(): HeadersInit {
  return { "cache-control": "no-store" };
}
