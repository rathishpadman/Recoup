import { loadLocalRuntimeEnvFiles } from "../../../../../config/localRuntimeEnv.ts";
import { buildVerifiedHumanAuthHeaders } from "../../human-auth.ts";
import { proxyJsonResponse } from "../../read-model-cache.ts";

export async function POST(request: Request): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const apiBaseUrl = runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317";
  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["maya"]
  });
  if (authHeaders === undefined) {
    return Response.json({ error: "Verified human cockpit auth required." }, { headers: noStoreHeaders(), status: 401 });
  }

  try {
    const upstream = await fetch(`${apiBaseUrl}/forensics/refresh`, {
      cache: "no-store",
      headers: authHeaders,
      method: "POST"
    });

    return proxyJsonResponse(upstream, await upstream.text(), "refresh");
  } catch {
    return Response.json({ error: "Forensics source refresh service unavailable." }, { headers: noStoreHeaders(), status: 502 });
  }
}

function noStoreHeaders(): HeadersInit {
  return { "cache-control": "no-store" };
}
