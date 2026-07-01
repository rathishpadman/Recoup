import { loadLocalRuntimeEnvFiles } from "../../../../config/localRuntimeEnv.ts";
import { buildVerifiedHumanAuthHeaders } from "../human-auth.ts";
import {
  isConnectorReadModelFreshForSourceHealth,
  mayaConnectorsReadModelKey,
  proxyJsonResponse,
  readCachedReadModelPayload,
  readLatestSourceHealthSnapshotCheckedAt,
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

  const cached = await readCachedReadModelPayload(runtimeEnv, mayaConnectorsReadModelKey, "connector-readiness");
  if (cached !== undefined) {
    const latestSourceHealthCheckedAt = await readLatestSourceHealthSnapshotCheckedAt(runtimeEnv);
    if (isConnectorReadModelFreshForSourceHealth(cached.payload, latestSourceHealthCheckedAt)) {
      refreshReadModelAfterResponse(runtimeEnv, authHeaders, { method: "GET", path: "/connectors" });
      return readModelJsonResponse(cached.payload, "hit", { sourceRefreshedAt: cached.sourceRefreshedAt });
    }
  }

  try {
    const upstream = await fetch(`${apiBaseUrl}/connectors`, {
      cache: "no-store",
      headers: authHeaders,
      method: "GET"
    });

    return proxyJsonResponse(upstream, await upstream.text(), cached === undefined ? "miss" : "refresh");
  } catch {
    return Response.json({ error: "Connector readiness service unavailable." }, { headers: noStoreHeaders(), status: 502 });
  }
}

function noStoreHeaders(): HeadersInit {
  return { "cache-control": "no-store" };
}
