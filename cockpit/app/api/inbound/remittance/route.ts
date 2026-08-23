import { loadLocalRuntimeEnvFiles } from "../../../../../config/localRuntimeEnv.ts";

/**
 * Public inbound endpoint for remittance mail.
 *
 * A pass-through only. Every decision — shared secret, sender allowlist,
 * approved recipient, scan, mapping — belongs to the backend, and this route
 * holds no opinion about any of them. It forwards the raw body byte for byte
 * because the signature is computed over exactly those bytes; re-serialising
 * the JSON here would invalidate every signature.
 *
 * Deliberately unauthenticated in the cockpit sense: the caller is a mail
 * provider, not a signed-in human. The shared secret is what stands in for
 * identity, and the backend is what checks it.
 */

export const dynamic = "force-dynamic";

const UPSTREAM_TIMEOUT_MS = 10_000;

const FORWARDED_HEADERS = ["x-recoup-signature", "resend-signature", "svix-signature"];

export async function POST(request: Request): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const apiBaseUrl = runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317";
  const rawBody = await request.text();

  const headers: Record<string, string> = { "content-type": "application/json" };
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) {
      headers[name] = value;
    }
  }

  try {
    const upstream = await fetch(`${apiBaseUrl}/inbound/remittance`, {
      method: "POST",
      cache: "no-store",
      headers,
      body: rawBody,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });

    return new Response(await upstream.text(), {
      headers: { "cache-control": "no-store", "content-type": "application/json" },
      status: upstream.status
    });
  } catch {
    // Fail visibly. A mail provider retries on 502, which is what we want.
    return Response.json(
      { error: "Inbound remittance service unavailable." },
      { headers: { "cache-control": "no-store" }, status: 502 }
    );
  }
}
