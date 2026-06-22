import { loadLocalRuntimeEnvFiles } from "../../../../config/localRuntimeEnv.ts";
import { buildVerifiedHumanAuthHeaders } from "../human-auth.ts";

export async function POST(request: Request): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const body = await request.text();
  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["maya", "david"],
    proxyPurpose: "approval",
    proxyRequest: { body, method: "POST", path: "/approval" }
  });
  if (authHeaders === undefined) {
    return Response.json({ error: "Verified human cockpit auth required." }, { status: 401 });
  }

  try {
    const upstream = await fetch(`${runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317"}/approval`, {
      body,
      headers: {
        "content-type": request.headers.get("content-type") ?? "application/json",
        ...authHeaders
      },
      method: "POST"
    });

    return new Response(await upstream.text(), {
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
      status: upstream.status
    });
  } catch {
    return Response.json({ error: "Approval service unavailable." }, { status: 502 });
  }
}
