import { timingSafeEqual } from "node:crypto";
import {
  buildCockpitHumanProxyHeaders,
  cockpitHumanPrincipalForDemoRole,
  type CockpitHumanProxyRequestInput,
  type CockpitHumanProxyPurpose
} from "../../../config/cockpitHumanPrincipals.ts";
import { demoSessionCookieName, verifyDemoSessionValue, type DemoRole } from "../demo-auth.ts";

type HumanAuthHeaders = Record<"x-recoup-human-principal" | "x-recoup-human-token", string> & Record<string, string>;

interface VerifiedHumanAuthOptions {
  allowDemoSessionRoles?: readonly DemoRole[];
  proxyPurpose?: CockpitHumanProxyPurpose;
  proxyRequest?: CockpitHumanProxyRequestInput;
}

export function buildVerifiedHumanAuthHeaders(
  runtimeEnv: Partial<Record<string, string | undefined>>,
  requestHeaders: Headers,
  options: VerifiedHumanAuthOptions = {}
): HumanAuthHeaders | undefined {
  const expectedPrincipal = runtimeEnv.RECOUP_COCKPIT_HUMAN_PRINCIPAL?.trim();
  const expectedToken = runtimeEnv.RECOUP_COCKPIT_AUTH_TOKEN?.trim();
  if (expectedPrincipal === undefined || expectedPrincipal.length === 0 || expectedToken === undefined || expectedToken.length === 0) {
    return undefined;
  }

  const cookies = parseCookieHeader(requestHeaders.get("cookie"));
  const requestPrincipal = requestHeaders.get("x-recoup-human-principal")?.trim() ?? cookies["recoup_human_principal"];
  const requestToken = requestHeaders.get("x-recoup-human-token")?.trim() ?? cookies["recoup_human_token"];
  const directAuthHeaders = buildDirectHumanAuthHeaders(requestPrincipal, requestToken, expectedPrincipal, expectedToken);
  if (directAuthHeaders !== undefined) {
    return directAuthHeaders;
  }

  const demoSession = verifyDemoHumanSession(cookies, runtimeEnv, options.allowDemoSessionRoles ?? []);
  if (demoSession !== undefined) {
    const principal = cockpitHumanPrincipalForDemoRole(demoSession.role);
    const headers: HumanAuthHeaders = {
      "x-recoup-human-principal": principal,
      "x-recoup-human-token": expectedToken
    };
    if (options.proxyPurpose !== undefined && options.proxyRequest !== undefined) {
      Object.assign(
        headers,
        buildCockpitHumanProxyHeaders({
          principal,
          purpose: options.proxyPurpose,
          request: options.proxyRequest,
          role: demoSession.role,
          secret: demoSession.secret
        })
      );
    } else if (options.proxyPurpose !== undefined) {
      return undefined;
    }

    return headers;
  }

  return undefined;
}

function parseCookieHeader(header: string | null): Record<string, string> {
  if (header === null) {
    return {};
  }

  const cookies: Record<string, string> = {};
  for (const cookie of header.split(";")) {
    const trimmed = cookie.trim();
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const name = trimmed.slice(0, separatorIndex);
    const value = trimmed.slice(separatorIndex + 1);
    const decoded = decodeCookieValue(value);
    if (decoded !== undefined) {
      cookies[name] = decoded;
    }
  }

  return cookies;
}

function buildDirectHumanAuthHeaders(
  requestPrincipal: string | undefined,
  requestToken: string | undefined,
  expectedPrincipal: string,
  expectedToken: string
): HumanAuthHeaders | undefined {
  if (
    requestPrincipal === undefined ||
    requestToken === undefined ||
    !requestPrincipal.startsWith("human:") ||
    requestPrincipal !== expectedPrincipal ||
    !constantTimeEqual(requestToken, expectedToken)
  ) {
    return undefined;
  }

  return {
    "x-recoup-human-principal": requestPrincipal,
    "x-recoup-human-token": requestToken
  };
}

function verifyDemoHumanSession(
  cookies: Readonly<Record<string, string>>,
  runtimeEnv: Partial<Record<string, string | undefined>>,
  allowedRoles: readonly DemoRole[]
): { role: DemoRole; secret: string } | undefined {
  if (allowedRoles.length === 0) {
    return undefined;
  }

  const secret = resolveDemoSessionSecret(runtimeEnv);
  if (secret === undefined) {
    return undefined;
  }

  const session = verifyDemoSessionValue(cookies[demoSessionCookieName], secret);

  if (session === undefined || !allowedRoles.includes(session.role)) {
    return undefined;
  }

  return { role: session.role, secret };
}

function resolveDemoSessionSecret(runtimeEnv: Partial<Record<string, string | undefined>>): string | undefined {
  const configured = runtimeEnv.RECOUP_DEMO_SESSION_SECRET?.trim();
  if (configured !== undefined && configured.length > 0) {
    return configured;
  }

  return undefined;
}

function decodeCookieValue(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);

  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
