import { loadLocalRuntimeEnvFiles } from "../../../../../config/localRuntimeEnv.ts";
import { buildVerifiedHumanAuthHeaders } from "../../human-auth.ts";

/**
 * Cash demo reset, for the operator in the browser.
 *
 * A pass-through that proves a signed-in operator is asking. The proxy headers
 * it mints are what the backend verifies, so no shared secret has to be copied
 * onto this deployment just so the browser path can sign.
 */

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const body = await request.text();

  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["cfo", "maya"],
    proxyPurpose: "admin-reset",
    proxyRequest: { body, method: "POST", path: "/admin/cash-demo-reset" }
  });

  if (authHeaders === undefined) {
    return Response.json(
      { error: "Verified admin cockpit auth required." },
      { headers: noStore, status: 401 }
    );
  }

  try {
    const upstream = await fetch(
      `${runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317"}/admin/cash-demo-reset`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          ...authHeaders,
          "content-type": "application/json"
        },
        body
      }
    );

    return new Response(await upstream.text(), {
      headers: { ...noStore, "content-type": "application/json" },
      status: upstream.status
    });
  } catch {
    return Response.json({ error: "Cash demo reset unavailable." }, { headers: noStore, status: 502 });
  }
}
