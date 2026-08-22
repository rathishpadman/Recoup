import { loadLocalRuntimeEnvFiles } from "../../../../config/localRuntimeEnv.ts";

/**
 * Proxies the Agent Operations snapshot from the backend.
 *
 * The cockpit holds no opinion about what is exposed. The backend decides that
 * from the rollout stage and the kill switch, and this route passes through
 * whatever it is given.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const apiBaseUrl = runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317";

  try {
    const upstream = await fetch(`${apiBaseUrl}/agent-operations`, { cache: "no-store" });

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
