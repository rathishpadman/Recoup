import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const cockpitHumanPrincipalByDemoRole = {
  cfo: "human:cfo-lead",
  david: "human:david-lead",
  maya: "human:maya-lead"
} as const;

export type CockpitDemoRole = keyof typeof cockpitHumanPrincipalByDemoRole;
export type CockpitHumanPrincipal = (typeof cockpitHumanPrincipalByDemoRole)[CockpitDemoRole];
export type CockpitHumanProxyPurpose = "approval" | "realtime";

export const cockpitHumanProxyBodyHashHeader = "x-recoup-demo-body-sha256";
export const cockpitHumanProxyIssuedAtHeader = "x-recoup-demo-issued-at";
export const cockpitHumanProxyNonceHeader = "x-recoup-demo-nonce";
export const cockpitHumanProxyProofHeader = "x-recoup-demo-proof";
export const cockpitHumanProxyRoleHeader = "x-recoup-demo-role";
export const defaultCockpitHumanPrincipal = cockpitHumanPrincipalByDemoRole.maya;

export interface CockpitHumanProxyRequestInput {
  body: string;
  method: string;
  path: string;
}

interface CockpitHumanProxySignatureFields extends CockpitHumanProxyRequestInput {
  bodySha256: string;
  issuedAt: string;
  nonce: string;
  principal: CockpitHumanPrincipal;
  purpose: CockpitHumanProxyPurpose;
  role: CockpitDemoRole;
}

export function cockpitHumanPrincipalForDemoRole(role: CockpitDemoRole): CockpitHumanPrincipal {
  return cockpitHumanPrincipalByDemoRole[role];
}

export function isRoleDerivedCockpitHumanPrincipal(principal: string): principal is CockpitHumanPrincipal {
  return Object.values(cockpitHumanPrincipalByDemoRole).includes(principal as CockpitHumanPrincipal);
}

export function buildCockpitHumanProxyHeaders(input: {
  principal: CockpitHumanPrincipal;
  purpose: CockpitHumanProxyPurpose;
  role: CockpitDemoRole;
  request: CockpitHumanProxyRequestInput;
  secret: string;
}): Record<string, string> {
  const fields = {
    ...normalizeProxyRequest(input.request),
    bodySha256: sha256(input.request.body),
    issuedAt: new Date().toISOString(),
    nonce: randomUUID(),
    principal: input.principal,
    purpose: input.purpose,
    role: input.role
  };

  return {
    [cockpitHumanProxyBodyHashHeader]: fields.bodySha256,
    [cockpitHumanProxyIssuedAtHeader]: fields.issuedAt,
    [cockpitHumanProxyNonceHeader]: fields.nonce,
    [cockpitHumanProxyProofHeader]: signCockpitHumanProxyPrincipal(fields, input.secret),
    [cockpitHumanProxyRoleHeader]: input.role
  };
}

export function signCockpitHumanProxyPrincipal(fields: CockpitHumanProxySignatureFields, secret: string): string {
  return createHmac("sha256", secret).update(cockpitHumanProxySignaturePayload(fields)).digest("base64url");
}

export function verifyCockpitHumanProxyPrincipal(
  input: {
    bodySha256: string | undefined;
    issuedAt: string | undefined;
    nonce: string | undefined;
    principal: string;
    proof: string | undefined;
    purpose: CockpitHumanProxyPurpose;
    request: CockpitHumanProxyRequestInput;
    role: string;
    secret: string;
  }
): boolean {
  if (
    !isCockpitDemoRole(input.role) ||
    input.principal !== cockpitHumanPrincipalForDemoRole(input.role) ||
    input.proof === undefined ||
    input.bodySha256 === undefined ||
    input.bodySha256 !== sha256(input.request.body) ||
    input.issuedAt === undefined ||
    !isFreshIssuedAt(input.issuedAt) ||
    input.nonce === undefined
  ) {
    return false;
  }

  const fields = {
    ...normalizeProxyRequest(input.request),
    bodySha256: input.bodySha256,
    issuedAt: input.issuedAt,
    nonce: input.nonce,
    principal: input.principal,
    purpose: input.purpose,
    role: input.role
  };

  return constantTimeEqual(input.proof, signCockpitHumanProxyPrincipal(fields, input.secret));
}

export function isCockpitDemoRole(value: string): value is CockpitDemoRole {
  return Object.hasOwn(cockpitHumanPrincipalByDemoRole, value);
}

function cockpitHumanProxySignaturePayload(fields: CockpitHumanProxySignatureFields): string {
  return [
    "v1",
    fields.purpose,
    fields.method.toUpperCase(),
    fields.path,
    fields.bodySha256,
    fields.issuedAt,
    fields.nonce,
    fields.role,
    fields.principal
  ].join("\n");
}

function normalizeProxyRequest(request: CockpitHumanProxyRequestInput): CockpitHumanProxyRequestInput {
  return {
    body: request.body,
    method: request.method.toUpperCase(),
    path: request.path
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isFreshIssuedAt(value: string): boolean {
  const issuedAt = new Date(value).valueOf();
  if (!Number.isFinite(issuedAt)) {
    return false;
  }

  const now = Date.now();
  return issuedAt <= now + 30_000 && now - issuedAt <= 5 * 60_000;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);

  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
