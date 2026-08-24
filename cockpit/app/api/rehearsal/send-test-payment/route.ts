import { loadLocalRuntimeEnvFiles } from "../../../../../config/localRuntimeEnv.ts";
import { buildVerifiedHumanAuthHeaders } from "../../human-auth.ts";

/**
 * Pass-through for the send control. The cockpit proves who is asking and the
 * backend does the work, so the shared secret never reaches the browser.
 */

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const body = request.method === "POST" ? await request.text() : "";

  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["cfo", "maya"],
    proxyPurpose: request.method === "POST" ? "admin-reset" : "read",
    proxyRequest: { body, method: request.method, path: "/rehearsal/send-test-payment" }
  });

  if (authHeaders === undefined) {
    return Response.json(
      { error: "Verified cockpit auth required." },
      { headers: noStore, status: 401 }
    );
  }

  try {
    const upstream = await fetch(
      `${runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317"}/rehearsal/send-test-payment`,
      {
        method: request.method,
        cache: "no-store",
        headers: { ...authHeaders, "content-type": "application/json" },
        ...(request.method === "POST" ? { body } : {})
      }
    );

    return new Response(await upstream.text(), {
      headers: { ...noStore, "content-type": "application/json" },
      status: upstream.status
    });
  } catch {
    return Response.json({ error: "Send service unavailable." }, { headers: noStore, status: 502 });
  }
}
