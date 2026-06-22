import { createHmac, timingSafeEqual } from "node:crypto";
import {
  cockpitDemoProfiles,
  isCockpitDemoLoginId,
  type CockpitDemoLoginId
} from "../../config/cockpitDemoProfiles.ts";
import type { CockpitDemoRole } from "../../config/cockpitHumanPrincipals.ts";
import { loadDemoRuntimeEnv, type DemoRuntimeEnv } from "./demo-runtime-env.ts";

type RuntimeEnv = DemoRuntimeEnv;

export type DemoRole = CockpitDemoRole;
export type DemoLoginId = CockpitDemoLoginId;

export interface DemoSession {
  allowedRoutes: readonly string[];
  defaultRoute: string;
  displayName: string;
  loginId: DemoLoginId;
  role: DemoRole;
}

export const demoSessionCookieName = "recoup_demo_session";

export const demoProfiles = cockpitDemoProfiles.map((profile) => ({
  allowedRoutes: [...profile.allowedRoutes],
  defaultRoute: profile.defaultRoute,
  displayName: profile.displayName,
  loginId: profile.loginId,
  role: profile.role
})) as readonly DemoSession[];

const profilesByRole = Object.fromEntries(demoProfiles.map((profile) => [profile.role, profile])) as Record<
  DemoRole,
  DemoSession
>;

const profilesByLoginId = Object.fromEntries(demoProfiles.map((profile) => [profile.loginId, profile])) as Record<
  DemoLoginId,
  DemoSession
>;

export function roleHomeRoute(role: DemoRole): string {
  return profilesByRole[role].defaultRoute;
}

export function roleAllowedRoutes(role: DemoRole): string[] {
  return [...profilesByRole[role].allowedRoutes];
}

export function isKnownDemoLoginId(loginId: string): loginId is DemoLoginId {
  return isCockpitDemoLoginId(loginId);
}

export function isDemoRouteAllowed(routePath: string, allowedRoutes: readonly string[]): boolean {
  return allowedRoutes.some((allowedRoute) => routePath === allowedRoute || routePath.startsWith(`${allowedRoute}/`));
}

export function signDemoSession(session: DemoSession, secret: string): string {
  return createSignedDemoSessionValue(session, secret);
}

export function createSignedDemoSessionValue(session: DemoSession, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const signature = signPayload(payload, secret);

  return `${payload}.${signature}`;
}

export function verifyDemoSessionValue(value: string | undefined, secret: string): DemoSession | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parts = value.split(".");
  if (parts.length !== 2) {
    return undefined;
  }

  const [payload, signature] = parts;
  if (payload === undefined || signature === undefined || !constantTimeEqual(signature, signPayload(payload, secret))) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;

    return normalizeDemoSession(parsed);
  } catch {
    return undefined;
  }
}

export async function verifyDemoSession(env: RuntimeEnv = process.env): Promise<DemoSession | undefined> {
  const runtimeEnv = loadDemoRuntimeEnv(env);
  const secret = resolveDemoSessionSecret(runtimeEnv);
  if (secret === undefined) {
    return undefined;
  }

  const { cookies } = await import("next/headers.js");
  const cookieStore = await cookies();
  const signedSession = cookieStore.get(demoSessionCookieName)?.value;

  return verifyDemoSessionValue(signedSession, secret);
}

export async function getDemoSessionOrNull(env: RuntimeEnv = process.env): Promise<DemoSession | undefined> {
  return verifyDemoSession(env);
}

export async function requireDemoSession(env: RuntimeEnv = process.env): Promise<DemoSession> {
  const session = await verifyDemoSession(env);
  if (session === undefined) {
    const { redirect } = await import("next/navigation.js");
    redirect("/login");
    throw new Error("Unreachable after login redirect.");
  }

  return session;
}

export async function requireRouteAccess(routePath: string, env: RuntimeEnv = process.env): Promise<DemoSession> {
  const session = await requireDemoSession(env);
  if (!isDemoRouteAllowed(routePath, session.allowedRoutes)) {
    const { redirect } = await import("next/navigation.js");
    redirect(session.defaultRoute);
    throw new Error("Unreachable after route redirect.");
  }

  return session;
}

export function createDemoSessionCookie(session: DemoSession, env: RuntimeEnv = process.env) {
  const runtimeEnv = loadDemoRuntimeEnv(env);

  return {
    name: demoSessionCookieName,
    options: demoSessionCookieOptions(runtimeEnv),
    value: signDemoSession(session, requireDemoSessionSecret(runtimeEnv))
  };
}

export function clearDemoSessionCookie(env: RuntimeEnv = process.env) {
  const runtimeEnv = loadDemoRuntimeEnv(env);

  return {
    name: demoSessionCookieName,
    options: {
      ...demoSessionCookieOptions(runtimeEnv),
      maxAge: 0
    },
    value: ""
  };
}

export function demoSessionFromSupabaseRecord(record: unknown): DemoSession | undefined {
  if (!isRecord(record)) {
    return undefined;
  }

  const candidate = {
    allowedRoutes: Array.isArray(record.allowed_routes) ? record.allowed_routes : [],
    defaultRoute: record.default_route,
    displayName: record.display_name,
    loginId: record.login_id,
    role: record.role
  };

  return normalizeDemoSession(candidate);
}

function demoSessionCookieOptions(env: RuntimeEnv) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production"
  };
}

function requireDemoSessionSecret(env: RuntimeEnv): string {
  const secret = resolveDemoSessionSecret(env);
  if (secret === undefined) {
    throw new Error("Demo session signing secret is not configured.");
  }

  return secret;
}

function resolveDemoSessionSecret(env: RuntimeEnv): string | undefined {
  const configured = env.RECOUP_DEMO_SESSION_SECRET?.trim();
  if (configured !== undefined && configured.length > 0) {
    return configured;
  }

  const localFallback = env.RECOUP_COCKPIT_AUTH_TOKEN?.trim();
  if (env.NODE_ENV !== "production" && localFallback !== undefined && localFallback.length > 0) {
    return localFallback;
  }

  return undefined;
}

function normalizeDemoSession(value: unknown): DemoSession | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const { allowedRoutes, defaultRoute, displayName, loginId, role } = value;
  if (
    !Array.isArray(allowedRoutes) ||
    !allowedRoutes.every((route): route is string => typeof route === "string") ||
    typeof defaultRoute !== "string" ||
    typeof displayName !== "string" ||
    typeof loginId !== "string" ||
    typeof role !== "string" ||
    !isKnownDemoLoginId(loginId) ||
    !isDemoRole(role)
  ) {
    return undefined;
  }

  const canonical = profilesByLoginId[loginId];
  if (
    canonical.role !== role ||
    canonical.displayName !== displayName ||
    canonical.defaultRoute !== defaultRoute ||
    !sameRoutes(canonical.allowedRoutes, allowedRoutes)
  ) {
    return undefined;
  }

  return {
    allowedRoutes: [...canonical.allowedRoutes],
    defaultRoute: canonical.defaultRoute,
    displayName: canonical.displayName,
    loginId: canonical.loginId,
    role: canonical.role
  };
}

function isDemoRole(value: string): value is DemoRole {
  return value === "maya" || value === "david" || value === "cfo";
}

function sameRoutes(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((route, index) => route === right[index]);
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);

  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
