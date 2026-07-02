import { loadLocalRuntimeEnvFiles } from "../../config/localRuntimeEnv.ts";
import type { CockpitHumanProxyRequestInput } from "../../config/cockpitHumanPrincipals.ts";
import { buildVerifiedHumanAuthHeaders } from "./api/human-auth.ts";
import type { DemoRole } from "./demo-auth.ts";

export async function requireBackendReadAuthHeaders(
  allowDemoSessionRoles: readonly DemoRole[],
  proxyRequest?: CockpitHumanProxyRequestInput
): Promise<HeadersInit> {
  const { headers } = await import("next/headers.js");
  const requestHeaders = await headers();
  const authHeaders = buildVerifiedHumanAuthHeaders(loadLocalRuntimeEnvFiles(), requestHeaders, {
    allowDemoSessionRoles,
    ...(proxyRequest === undefined
      ? {}
      : {
          proxyPurpose: "read" as const,
          proxyRequest
        })
  });
  if (authHeaders === undefined) {
    throw new Error("Verified human cockpit auth required.");
  }

  return authHeaders;
}

export function requireMayaBackendReadAuthHeaders(): Promise<HeadersInit> {
  return requireBackendReadAuthHeaders(["maya"]);
}
