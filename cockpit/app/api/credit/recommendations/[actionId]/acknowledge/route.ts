import { loadLocalRuntimeEnvFiles } from "../../../../../../../config/localRuntimeEnv.ts";
import { buildVerifiedHumanAuthHeaders } from "../../../../human-auth.ts";

interface AcknowledgeRouteContext {
  params: { actionId: string } | Promise<{ actionId: string }>;
}

export async function POST(request: Request, context: AcknowledgeRouteContext): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const { actionId } = await context.params;
  const upstreamPath = `/credit/recommendations/${encodeURIComponent(actionId)}/acknowledge`;
  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["david"],
    proxyPurpose: "read",
    proxyRequest: { body: "", method: "POST", path: upstreamPath }
  });
  if (authHeaders === undefined) {
    return Response.json({ error: "Verified credit lead auth required." }, { headers: noStoreHeaders(), status: 401 });
  }

  try {
    const upstream = await fetch(`${runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317"}${upstreamPath}`, {
      cache: "no-store",
      headers: authHeaders,
      method: "POST"
    });

    return new Response(await upstream.text(), {
      headers: {
        "cache-control": "no-store",
        "content-type": upstream.headers.get("content-type") ?? "application/json"
      },
      status: upstream.status
    });
  } catch {
    return Response.json({ error: "Acknowledgement service unavailable." }, { headers: noStoreHeaders(), status: 502 });
  }
}

function noStoreHeaders(): HeadersInit {
  return { "cache-control": "no-store" };
}
