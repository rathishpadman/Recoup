import { loadLocalRuntimeEnvFiles } from "../../../../../../config/localRuntimeEnv.ts";
import { buildVerifiedHumanAuthHeaders } from "../../../human-auth.ts";

interface WorkItemRouteContext {
  params: { lineId: string } | Promise<{ lineId: string }>;
}

export async function GET(request: Request, context: WorkItemRouteContext): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const { lineId } = await context.params;
  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["maya"]
  });
  if (authHeaders === undefined) {
    return Response.json({ error: "Verified human cockpit auth required." }, { headers: noStoreHeaders(), status: 401 });
  }

  try {
    const upstream = await fetch(
      `${runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317"}/forensics/work-items/${encodeURIComponent(lineId)}`,
      {
        cache: "no-store",
        headers: authHeaders,
        method: "GET"
      }
    );

    return new Response(await upstream.text(), {
      headers: {
        "cache-control": "no-store",
        "content-type": upstream.headers.get("content-type") ?? "application/json"
      },
      status: upstream.status
    });
  } catch {
    return Response.json({ error: "Forensics work item detail service unavailable." }, { headers: noStoreHeaders(), status: 502 });
  }
}

function noStoreHeaders(): HeadersInit {
  return { "cache-control": "no-store" };
}
