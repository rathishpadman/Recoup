import { loadLocalRuntimeEnvFiles } from "../../../../config/env.ts";

export async function POST(request: Request): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const authHeaders = buildHumanAuthHeaders(runtimeEnv);
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

function buildHumanAuthHeaders(
  runtimeEnv: Partial<Record<string, string | undefined>>
): Record<"x-recoup-human-principal" | "x-recoup-human-token", string> | undefined {
  const principal = runtimeEnv.RECOUP_COCKPIT_HUMAN_PRINCIPAL?.trim();
  const token = runtimeEnv.RECOUP_COCKPIT_AUTH_TOKEN?.trim();
  if (principal === undefined || principal.length === 0 || token === undefined || token.length === 0) {
    return undefined;
  }

  return {
    "x-recoup-human-principal": principal,
    "x-recoup-human-token": token
  };
}
