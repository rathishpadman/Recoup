import { timingSafeEqual } from "node:crypto";

type HumanAuthHeaders = Record<"x-recoup-human-principal" | "x-recoup-human-token", string>;

export function buildVerifiedHumanAuthHeaders(
  runtimeEnv: Partial<Record<string, string | undefined>>,
  requestHeaders: Headers
): HumanAuthHeaders | undefined {
  const expectedPrincipal = runtimeEnv.RECOUP_COCKPIT_HUMAN_PRINCIPAL?.trim();
  const expectedToken = runtimeEnv.RECOUP_COCKPIT_AUTH_TOKEN?.trim();
  if (expectedPrincipal === undefined || expectedPrincipal.length === 0 || expectedToken === undefined || expectedToken.length === 0) {
    return undefined;
  }

  const cookies = parseCookieHeader(requestHeaders.get("cookie"));
  const requestPrincipal = requestHeaders.get("x-recoup-human-principal")?.trim() ?? cookies["recoup_human_principal"];
  const requestToken = requestHeaders.get("x-recoup-human-token")?.trim() ?? cookies["recoup_human_token"];
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
    cookies[name] = decodeURIComponent(value);
  }

  return cookies;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);

  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
