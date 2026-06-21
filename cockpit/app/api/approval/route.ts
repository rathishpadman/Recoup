import { loadLocalRuntimeEnvFiles } from "../../../../config/env.ts";
import { buildVerifiedHumanAuthHeaders } from "../human-auth.ts";

export async function POST(request: Request): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers);
  if (authHeaders === undefined) {
    return Response.json({ error: "Verified human cockpit auth required." }, { status: 401 });
  }

  try {
    const upstream = await fetch(`${runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317"}/approval`, {
      body: await request.text(),
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
