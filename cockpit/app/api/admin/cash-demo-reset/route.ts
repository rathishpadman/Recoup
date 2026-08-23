import { createHmac } from "node:crypto";

import { loadLocalRuntimeEnvFiles } from "../../../../../config/localRuntimeEnv.ts";
import { buildVerifiedHumanAuthHeaders } from "../../human-auth.ts";

/**
 * Cash demo reset, for the operator in the browser.
 *
 * Two independent checks, because this is the one call that can delete cash
 * rows. The cockpit proves a signed-in CFO is asking, and the backend proves
 * the request carries the shared secret. Neither alone is enough, and the
 * browser never holds the secret: it is added here, server-side.
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

  const secret = runtimeEnv.RECOUP_INBOUND_SHARED_SECRET?.trim();

  if (secret === undefined || secret.length === 0) {
    return Response.json(
      { error: "Cash demo reset is not configured." },
      { headers: noStore, status: 404 }
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
          "content-type": "application/json",
          // Signed over the exact bytes forwarded, never re-serialised.
          "x-recoup-signature": createHmac("sha256", secret).update(body).digest("hex")
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
