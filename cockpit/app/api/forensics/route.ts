import { loadLocalRuntimeEnvFiles } from "../../../../config/localRuntimeEnv.ts";
import { buildVerifiedHumanAuthHeaders } from "../human-auth.ts";

export async function GET(request: Request): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const apiBaseUrl = runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317";
  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["maya"]
  });
  if (authHeaders === undefined) {
    return Response.json({ error: "Verified human cockpit auth required." }, { headers: noStoreHeaders(), status: 401 });
  }

  try {
    const upstream = await fetch(`${apiBaseUrl}/forensics`, {
      cache: "no-store",
      headers: authHeaders,
      method: "GET"
    });

    return new Response(await upstream.text(), {
      headers: {
        "cache-control": "no-store",
        "content-type": upstream.headers.get("content-type") ?? "application/json"
      },
      status: upstream.status
    });
  } catch {
    return Response.json({ error: "Forensics workbench service unavailable." }, { headers: noStoreHeaders(), status: 502 });
  }
}

function noStoreHeaders(): HeadersInit {
  return { "cache-control": "no-store" };
}
