import { loadLocalRuntimeEnvFiles } from "../../../../../../../config/localRuntimeEnv.ts";
import { buildVerifiedHumanAuthHeaders } from "../../../../human-auth.ts";

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const { orderId } = await context.params;
  const upstreamPath = `/credit/v2/orders/${encodeURIComponent(orderId)}/deals`;
  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["david"],
    proxyPurpose: "read",
    proxyRequest: { body: "", method: "GET", path: upstreamPath }
  });
  if (authHeaders === undefined) {
    return Response.json({ error: "Verified human cockpit auth required." }, { headers: noStoreHeaders(), status: 401 });
  }

  try {
    const upstream = await fetch(`${runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317"}${upstreamPath}`, {
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
    return Response.json({ error: "Credit deal optimizer service unavailable." }, { headers: noStoreHeaders(), status: 502 });
  }
}

function noStoreHeaders(): HeadersInit {
  return { "cache-control": "no-store" };
}
