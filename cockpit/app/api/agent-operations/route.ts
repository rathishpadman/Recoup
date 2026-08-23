import { loadLocalRuntimeEnvFiles } from "../../../../config/localRuntimeEnv.ts";
import { buildVerifiedHumanAuthHeaders } from "../human-auth.ts";

/**
 * Proxies the Agent Operations snapshot from the backend.
 *
 * The cockpit holds no opinion about what is exposed. The backend decides that
 * from the rollout stage and the kill switch, and this route passes through
 * whatever it is given.
 */

export const dynamic = "force-dynamic";

/** Bounded, so a cold or wedged backend answers 502 rather than hanging. */
const UPSTREAM_TIMEOUT_MS = 2_500;

export async function GET(request: Request): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();

  // Refused before any upstream read: an unauthenticated caller must not be
  // able to learn whether the backend is up, let alone what it holds.
  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["maya", "cfo"],
    proxyPurpose: "read"
  });

  if (authHeaders === undefined) {
    return Response.json(
      { error: "Verified human cockpit auth required." },
      { headers: { "cache-control": "no-store" }, status: 401 }
    );
  }

  const apiBaseUrl = runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317";

  try {
    const upstream = await fetch(`${apiBaseUrl}/agent-operations`, {
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });

    if (!upstream.ok) {
      return Response.json(
        { error: "Agent operations unavailable." },
        { headers: { "cache-control": "no-store" }, status: 502 }
      );
    }

    return new Response(await upstream.text(), {
      headers: { "cache-control": "no-store", "content-type": "application/json" },
      status: 200
    });
  } catch {
    // Fail visibly. Returning an empty snapshot here would render as "no runs"
    // and hide a backend outage behind a plausible screen.
    return Response.json(
      { error: "Agent operations service unavailable." },
      { headers: { "cache-control": "no-store" }, status: 502 }
    );
  }
}
