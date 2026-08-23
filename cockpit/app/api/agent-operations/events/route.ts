import { loadLocalRuntimeEnvFiles } from "../../../../../config/localRuntimeEnv.ts";
import { buildVerifiedHumanAuthHeaders } from "../../human-auth.ts";

/**
 * Cursor-based event stream for Agent Operations (FR-OPS-07).
 *
 * A pass-through. The cursor travels to the backend and the backend decides
 * what to replay; holding a position here would put a second, weaker answer in
 * front of the durable one.
 *
 * The upstream body is piped rather than buffered, because buffering a stream
 * is the same as not having one.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();

  // Refused before a single frame is written, never after.
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
  const cursor = new URL(request.url).searchParams.get("cursor");
  const lastEventId = request.headers.get("last-event-id");
  const query = cursor === null ? "" : `?cursor=${encodeURIComponent(cursor)}`;

  try {
    const upstream = await fetch(`${apiBaseUrl}/agent-operations/events${query}`, {
      cache: "no-store",
      headers: {
        ...authHeaders,
        ...(lastEventId === null ? {} : { "last-event-id": lastEventId })
      },
      signal: request.signal
    });

    if (!upstream.ok || upstream.body === null) {
      return Response.json(
        { error: "Agent operations stream unavailable." },
        { headers: { "cache-control": "no-store" }, status: 502 }
      );
    }

    return new Response(upstream.body, {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/event-stream",
        connection: "keep-alive"
      },
      status: 200
    });
  } catch {
    return Response.json(
      { error: "Agent operations stream unavailable." },
      { headers: { "cache-control": "no-store" }, status: 502 }
    );
  }
}
