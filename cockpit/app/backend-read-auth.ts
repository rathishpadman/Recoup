import { loadLocalRuntimeEnvFiles } from "../../config/localRuntimeEnv.ts";
import { buildVerifiedHumanAuthHeaders } from "./api/human-auth.ts";

export async function requireMayaBackendReadAuthHeaders(): Promise<HeadersInit> {
  const { headers } = await import("next/headers.js");
  const requestHeaders = await headers();
  const authHeaders = buildVerifiedHumanAuthHeaders(loadLocalRuntimeEnvFiles(), requestHeaders, {
    allowDemoSessionRoles: ["maya"]
  });
  if (authHeaders === undefined) {
    throw new Error("Verified human cockpit auth required.");
  }

  return authHeaders;
}
