import { loadLocalRuntimeEnvFiles } from "../../../../config/localRuntimeEnv.ts";
import { buildVerifiedHumanAuthHeaders } from "../human-auth.ts";
import {
  cachedCreditSignalsAgreeWithApprovals,
  davidCreditRiskReadModelKey,
  davidCreditRiskReadModelMaxAgeMs,
  proxyJsonResponse,
  readCachedReadModelPayload,
  readCommittedCreditRecommendationActionIds,
  readModelJsonResponse,
  refreshReadModelAfterResponse
} from "../read-model-cache.ts";

export async function GET(request: Request): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const apiBaseUrl = runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317";
  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["david"],
    proxyPurpose: "read",
    proxyRequest: { body: "", method: "POST", path: "/credit/v2/refresh" }
  });
  if (authHeaders === undefined) {
    return Response.json({ error: "Verified human cockpit auth required." }, { headers: noStoreHeaders(), status: 401 });
  }

  const cached = await readCachedReadModelPayload(
    runtimeEnv,
    davidCreditRiskReadModelKey,
    "credit-risk-review",
    { maxAgeMs: davidCreditRiskReadModelMaxAgeMs, persona: "david" }
  );
  // Age alone is not freshness here: a recommendation approved a moment ago must appear on the
  // next load, not whenever the cache happens to expire. When the approval store cannot be read we
  // keep serving the cache - this surface exists so the credit view survives a slow backend, and an
  // unreadable approval store is also one that could not have accepted a new approval.
  if (cached !== undefined) {
    const committedActionIds = await readCommittedCreditRecommendationActionIds(runtimeEnv);
    if (committedActionIds === undefined || cachedCreditSignalsAgreeWithApprovals(cached.payload, committedActionIds)) {
      return readModelJsonResponse(cached.payload, "hit", { sourceRefreshedAt: cached.sourceRefreshedAt });
    }
  }

  try {
    const upstream = await fetch(`${apiBaseUrl}/credit/v2`, {
      cache: "no-store",
      headers: authHeaders,
      method: "GET"
    });
    const body = await upstream.text();
    refreshReadModelAfterResponse(runtimeEnv, authHeaders, { method: "POST", path: "/credit/v2/refresh" });
    return proxyJsonResponse(upstream, body, "miss");
  } catch {
    return Response.json({ error: "Credit risk review service unavailable." }, { headers: noStoreHeaders(), status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const apiBaseUrl = runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317";
  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["david"],
    proxyPurpose: "read",
    proxyRequest: { body: "", method: "POST", path: "/credit/v2/refresh" }
  });
  if (authHeaders === undefined) {
    return Response.json({ error: "Verified human cockpit auth required." }, { headers: noStoreHeaders(), status: 401 });
  }

  try {
    const upstream = await fetch(`${apiBaseUrl}/credit/v2/refresh`, {
      cache: "no-store",
      headers: authHeaders,
      method: "POST"
    });

    return proxyJsonResponse(upstream, await upstream.text(), "refresh");
  } catch {
    return Response.json({ error: "Credit risk review refresh service unavailable." }, { headers: noStoreHeaders(), status: 502 });
  }
}

function noStoreHeaders(): HeadersInit {
  return { "cache-control": "no-store" };
}
