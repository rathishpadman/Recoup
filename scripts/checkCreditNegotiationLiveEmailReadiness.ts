import { pathToFileURL } from "node:url";
import { cockpitHumanPrincipalForDemoRole } from "../config/cockpitHumanPrincipals.ts";
import { loadLocalRuntimeEnvFiles, type RuntimeEnv } from "../config/localRuntimeEnv.ts";

export interface CreditNegotiationResendWebhook {
  endpoint: string;
  events: string[];
}

export type CreditNegotiationResendWebhookLookupStatus = "failed" | "skipped_missing_api_key" | "succeeded";

export interface CreditNegotiationResendWebhookLookupResult {
  lookupStatus: CreditNegotiationResendWebhookLookupStatus;
  webhooks: CreditNegotiationResendWebhook[];
}

export type CreditNegotiationInboundRouteStatus =
  | "blocked_lookup_failed"
  | "blocked_missing_route"
  | "blocked_protected_route"
  | "ready";

export interface CreditNegotiationInboundRouteLookupResult {
  endpoint: string;
  httpStatus?: number | undefined;
  lookupStatus: "failed" | "succeeded";
  status: CreditNegotiationInboundRouteStatus;
}

export type CreditNegotiationLiveEmailReadinessStatus = "blocked" | "ready_for_live_email_test";

export interface CreditNegotiationLiveEmailNextAction {
  action: string;
  configKeys: string[];
  noMutation: true;
  owner: "operator" | "owner";
}

export interface CreditNegotiationLiveEmailReadinessReport {
  artifactType: "credit_negotiation_live_email_readiness";
  blockers: string[];
  catchAllSafety: {
    approved: boolean;
    status: "approved" | "blocked_pending_owner_confirmation";
  };
  env: {
    invalid: string[];
    missing: string[];
    present: string[];
    status: "blocked" | "ready";
  };
  generatedAt: string;
  localQaReset: {
    enabled: boolean;
    requiredForLiveEmail: false;
    status: "optional_enabled" | "optional_not_enabled";
  };
  nextActions: CreditNegotiationLiveEmailNextAction[];
  noMutation: true;
  resendWebhook: {
    emailReceivedWebhookPresent: boolean;
    recoupInboundEndpointPresent: boolean;
    lookupStatus: CreditNegotiationResendWebhookLookupStatus;
    status: "blocked_lookup_failed" | "blocked_missing_email_received" | "blocked_wrong_endpoint" | "ready";
    webhookCount: number;
  };
  inboundRoute: CreditNegotiationInboundRouteLookupResult;
  status: CreditNegotiationLiveEmailReadinessStatus;
}

interface BuildCreditNegotiationLiveEmailReadinessReportOptions {
  env?: RuntimeEnv | undefined;
  generatedAt?: string | undefined;
  inboundRoute?: CreditNegotiationInboundRouteLookupResult | undefined;
  resendWebhookLookupStatus?: CreditNegotiationResendWebhookLookupStatus | undefined;
  resendWebhooks?: CreditNegotiationResendWebhook[] | undefined;
}

const davidDemoHumanPrincipal = cockpitHumanPrincipalForDemoRole("david");

const requiredEnvKeys = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "CREDIT_NEGOTIATION_FROM_EMAIL",
  "EMAIL_TO_BILLING",
  "EMAIL_TO_RECOVERY",
  "HARBOR_AP_CONTACT_EMAIL",
  "SENDER_EMAIL_ADDRESS",
  "RECOUP_COCKPIT_HUMAN_PRINCIPAL",
  "RECOUP_COCKPIT_AUTH_TOKEN",
  "OPENAI_API_KEY",
  "RECOUP_EMAIL_SEND_PRINCIPALS",
  "RESEND_INBOUND_SIGNING_SECRET",
  "RESEND_INBOUND_RATE_LIMIT_MAX_EVENTS",
  "RESEND_INBOUND_RATE_LIMIT_WINDOW_MS",
  "CREDIT_NEGOTIATION_INBOUND_RETRY_SECRET",
  "CREDIT_NEGOTIATION_INBOUND_RETRY_LIMIT",
  "RECOUP_CREDIT_NEGOTIATION_ROOT_CATCHALL_APPROVED"
] as const;

const recoupInboundPath = "/api/credit/negotiation/inbound";
const defaultInboundEndpoint = `https://recoup-self-eta.vercel.app${recoupInboundPath}`;

export function buildCreditNegotiationLiveEmailReadinessReport(
  options: BuildCreditNegotiationLiveEmailReadinessReportOptions = {}
): CreditNegotiationLiveEmailReadinessReport {
  const env = options.env ?? loadLocalRuntimeEnvFiles();
  const envReadiness = buildEnvReadiness(env);
  const catchAllSafety = buildCatchAllSafety(env);
  const localQaReset = buildLocalQaReset(env);
  const inboundEndpoint = readInboundEndpoint(env);
  const resendWebhook = buildResendWebhookReadiness(
    options.resendWebhooks ?? [],
    options.resendWebhookLookupStatus ?? "succeeded",
    inboundEndpoint
  );
  const inboundRoute = options.inboundRoute ?? {
    endpoint: inboundEndpoint,
    lookupStatus: "failed",
    status: "blocked_lookup_failed"
  };
  const blockers = [
    ...envReadiness.missing.map((key) => `${key} is required before David live email negotiation testing.`),
    ...envReadiness.invalid.map((key) => `${key} is malformed for David live email negotiation testing.`),
    ...(catchAllSafety.approved ? [] : ["north-bay.dev root catch-all owner/provider safety confirmation is required."]),
    ...resendWebhookBlockers(resendWebhook),
    ...inboundRouteBlockers(inboundRoute)
  ];
  const nextActions = buildNextActions(envReadiness, catchAllSafety, resendWebhook, inboundRoute);

  return {
    artifactType: "credit_negotiation_live_email_readiness",
    blockers,
    catchAllSafety,
    env: envReadiness,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    localQaReset,
    nextActions,
    noMutation: true,
    resendWebhook,
    inboundRoute,
    status: blockers.length === 0 ? "ready_for_live_email_test" : "blocked"
  };
}

function buildLocalQaReset(env: RuntimeEnv): CreditNegotiationLiveEmailReadinessReport["localQaReset"] {
  const enabled = env.RECOUP_CREDIT_NEGOTIATION_RESET_ENABLED === "enabled";
  return {
    enabled,
    requiredForLiveEmail: false,
    status: enabled ? "optional_enabled" : "optional_not_enabled"
  };
}

function buildNextActions(
  envReadiness: CreditNegotiationLiveEmailReadinessReport["env"],
  catchAllSafety: CreditNegotiationLiveEmailReadinessReport["catchAllSafety"],
  resendWebhook: CreditNegotiationLiveEmailReadinessReport["resendWebhook"],
  inboundRoute: CreditNegotiationInboundRouteLookupResult
): CreditNegotiationLiveEmailNextAction[] {
  const actions: CreditNegotiationLiveEmailNextAction[] = [];
  if (envReadiness.missing.length > 0) {
    actions.push({
      action: "Configure missing David live-email environment variables in local/Vercel without printing values.",
      configKeys: [...envReadiness.missing],
      noMutation: true,
      owner: "operator"
    });
  }
  if (envReadiness.invalid.length > 0) {
    actions.push({
      action: "Correct malformed David live-email environment variables without printing values.",
      configKeys: [...envReadiness.invalid],
      noMutation: true,
      owner: "operator"
    });
  }
  if (!catchAllSafety.approved) {
    actions.push({
      action:
        "Confirm north-bay.dev root catch-all can be dedicated to Resend receiving, then set RECOUP_CREDIT_NEGOTIATION_ROOT_CATCHALL_APPROVED=approved.",
      configKeys: ["RECOUP_CREDIT_NEGOTIATION_ROOT_CATCHALL_APPROVED"],
      noMutation: true,
      owner: "owner"
    });
  }
  if (resendWebhook.status !== "ready") {
    if (resendWebhook.status === "blocked_lookup_failed") {
      actions.push({
        action: "Retry the read-only Resend webhook readiness lookup.",
        configKeys: ["RESEND_API_KEY"],
        noMutation: true,
        owner: "operator"
      });
      return actions;
    }
    actions.push({
      action: "Register Resend email.received webhook to /api/credit/negotiation/inbound on the deployed Recoup app and store its signing secret.",
      configKeys: ["RESEND_INBOUND_SIGNING_SECRET"],
      noMutation: true,
      owner: "operator"
    });
  }
  if (inboundRoute.status !== "ready") {
    if (inboundRoute.status === "blocked_lookup_failed") {
      actions.push({
        action: "Retry the no-mutation Recoup David inbound route readiness lookup.",
        configKeys: ["RECOUP_CREDIT_NEGOTIATION_INBOUND_URL"],
        noMutation: true,
        owner: "operator"
      });
    } else {
      actions.push({
        action: "Deploy or expose the Recoup David inbound route before registering live Resend traffic.",
        configKeys: ["RECOUP_CREDIT_NEGOTIATION_INBOUND_URL"],
        noMutation: true,
        owner: "operator"
      });
    }
  }

  return actions;
}

export function formatCreditNegotiationLiveEmailReadinessReport(report: CreditNegotiationLiveEmailReadinessReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

async function main(): Promise<void> {
  const env = loadLocalRuntimeEnvFiles();
  const resendLookup = await fetchCreditNegotiationResendWebhooksForReadiness(env);
  const inboundRoute = await fetchCreditNegotiationInboundRouteForReadiness(readInboundEndpoint(env));
  const report = buildCreditNegotiationLiveEmailReadinessReport({
    env,
    inboundRoute,
    resendWebhookLookupStatus: resendLookup.lookupStatus,
    resendWebhooks: resendLookup.webhooks
  });
  process.stdout.write(formatCreditNegotiationLiveEmailReadinessReport(report));
  if (report.status === "blocked") {
    process.exitCode = 1;
  }
}

function buildEnvReadiness(env: RuntimeEnv): CreditNegotiationLiveEmailReadinessReport["env"] {
  const missing = requiredEnvKeys.filter((key) => !isConfiguredValue(env[key]));
  const present = requiredEnvKeys.filter((key) => isConfiguredValue(env[key]));
  const invalid = present.filter((key) => !isValidConfiguredValue(key, env[key], env));

  return {
    invalid: [...invalid],
    missing: [...missing],
    present: [...present],
    status: missing.length === 0 && invalid.length === 0 ? "ready" : "blocked"
  };
}

function buildCatchAllSafety(env: RuntimeEnv): CreditNegotiationLiveEmailReadinessReport["catchAllSafety"] {
  const approved = env.RECOUP_CREDIT_NEGOTIATION_ROOT_CATCHALL_APPROVED === "approved";

  return {
    approved,
    status: approved ? "approved" : "blocked_pending_owner_confirmation"
  };
}

function buildResendWebhookReadiness(
  webhooks: readonly CreditNegotiationResendWebhook[],
  lookupStatus: CreditNegotiationResendWebhookLookupStatus,
  inboundEndpoint: string
): CreditNegotiationLiveEmailReadinessReport["resendWebhook"] {
  if (lookupStatus === "failed") {
    return {
      emailReceivedWebhookPresent: false,
      lookupStatus,
      recoupInboundEndpointPresent: false,
      status: "blocked_lookup_failed",
      webhookCount: 0
    };
  }
  const emailReceivedWebhooks = webhooks.filter((webhook) => webhook.events.includes("email.received"));
  const expectedEndpoint = normalizeEndpointOriginAndPath(inboundEndpoint);
  const recoupInboundEndpointPresent = emailReceivedWebhooks.some((webhook) => {
    const endpoint = normalizeEndpointOriginAndPath(webhook.endpoint);
    return endpoint !== undefined && expectedEndpoint !== undefined && endpoint.origin === expectedEndpoint.origin && endpoint.pathname === expectedEndpoint.pathname;
  });
  const emailReceivedWebhookPresent = emailReceivedWebhooks.length > 0;

  return {
    emailReceivedWebhookPresent,
    lookupStatus,
    recoupInboundEndpointPresent,
    status: recoupInboundEndpointPresent
      ? "ready"
      : emailReceivedWebhookPresent
        ? "blocked_wrong_endpoint"
        : "blocked_missing_email_received",
    webhookCount: webhooks.length
  };
}

function resendWebhookBlockers(report: CreditNegotiationLiveEmailReadinessReport["resendWebhook"]): string[] {
  if (report.status === "ready") {
    return [];
  }
  if (report.status === "blocked_lookup_failed") {
    return ["Resend webhook lookup failed; rerun readiness check before live email testing."];
  }
  if (report.status === "blocked_wrong_endpoint") {
    return ["Resend email.received webhook is not registered to the Recoup David inbound route."];
  }

  return ["Resend email.received webhook is not registered."];
}

function inboundRouteBlockers(report: CreditNegotiationInboundRouteLookupResult): string[] {
  if (report.status === "ready") {
    return [];
  }
  if (report.status === "blocked_missing_route") {
    return ["Recoup David inbound route is not deployed at the configured public endpoint."];
  }
  if (report.status === "blocked_protected_route") {
    return ["Recoup David inbound route is protected or redirecting; Resend must reach it directly."];
  }

  return ["Recoup David inbound route readiness lookup failed; rerun before live email testing."];
}

export async function fetchCreditNegotiationInboundRouteForReadiness(
  endpoint: string,
  fetchImpl: typeof fetch = fetch
): Promise<CreditNegotiationInboundRouteLookupResult> {
  try {
    const response = await fetchImpl(endpoint, {
      method: "GET",
      redirect: "manual"
    });
    const httpStatus = response.status;
    return {
      endpoint,
      httpStatus,
      lookupStatus: "succeeded",
      status: inboundRouteStatusFromHttpStatus(httpStatus)
    };
  } catch {
    return {
      endpoint,
      lookupStatus: "failed",
      status: "blocked_lookup_failed"
    };
  }
}

function inboundRouteStatusFromHttpStatus(status: number): CreditNegotiationInboundRouteStatus {
  if ((status >= 200 && status < 300) || status === 405) {
    return "ready";
  }
  if (status === 401 || status === 403 || (status >= 300 && status < 400)) {
    return "blocked_protected_route";
  }
  if (status === 404) {
    return "blocked_missing_route";
  }
  return "blocked_lookup_failed";
}

export async function fetchCreditNegotiationResendWebhooksForReadiness(
  env: RuntimeEnv,
  fetchImpl: typeof fetch = fetch
): Promise<CreditNegotiationResendWebhookLookupResult> {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    return { lookupStatus: "skipped_missing_api_key", webhooks: [] };
  }

  try {
    const response = await fetchImpl("https://api.resend.com/webhooks", {
      headers: {
        authorization: `Bearer ${apiKey}`
      },
      method: "GET"
    });
    if (!response.ok) {
      return { lookupStatus: "failed", webhooks: [] };
    }

    return { lookupStatus: "succeeded", webhooks: parseResendWebhookPayload((await response.json()) as unknown) };
  } catch {
    return { lookupStatus: "failed", webhooks: [] };
  }
}

function parseResendWebhookPayload(payload: unknown): CreditNegotiationResendWebhook[] {
  const rows = readWebhookRows(payload);

  return rows.flatMap((row) => {
    const endpoint = readString(row.endpoint) ?? readString(row.url) ?? readString(row.webhook_url);
    const events = Array.isArray(row.events) ? row.events.filter((event): event is string => typeof event === "string") : [];
    return endpoint === undefined ? [] : [{ endpoint, events }];
  });
}

function readWebhookRows(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (!isRecord(payload)) {
    return [];
  }
  if (Array.isArray(payload.data)) {
    return payload.data.filter(isRecord);
  }
  if (Array.isArray(payload.webhooks)) {
    return payload.webhooks.filter(isRecord);
  }

  return [];
}

function isConfiguredValue(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function readInboundEndpoint(env: RuntimeEnv): string {
  const configured = env.RECOUP_CREDIT_NEGOTIATION_INBOUND_URL?.trim();
  return configured === undefined || configured.length === 0 ? defaultInboundEndpoint : configured;
}

function isValidConfiguredValue(key: (typeof requiredEnvKeys)[number], value: string | undefined, env: RuntimeEnv): boolean {
  if (!isConfiguredValue(value)) {
    return false;
  }
  if (
    key === "CREDIT_NEGOTIATION_FROM_EMAIL" ||
    key === "EMAIL_TO_BILLING" ||
    key === "EMAIL_TO_RECOVERY" ||
    key === "HARBOR_AP_CONTACT_EMAIL" ||
    key === "SENDER_EMAIL_ADDRESS"
  ) {
    return isBasicEmailAddress(value);
  }
  if (
    key === "RESEND_INBOUND_RATE_LIMIT_MAX_EVENTS" ||
    key === "RESEND_INBOUND_RATE_LIMIT_WINDOW_MS" ||
    key === "CREDIT_NEGOTIATION_INBOUND_RETRY_LIMIT"
  ) {
    return isPositiveInteger(value);
  }
  if (key === "RESEND_INBOUND_SIGNING_SECRET") {
    return isResendSigningSecret(value);
  }
  if (key === "RECOUP_CREDIT_NEGOTIATION_ROOT_CATCHALL_APPROVED") {
    return value.trim() === "approved";
  }
  if (key === "RECOUP_COCKPIT_HUMAN_PRINCIPAL") {
    return hasDavidPrincipalAuthenticationPath(env);
  }
  if (key === "RECOUP_COCKPIT_AUTH_TOKEN" || key === "OPENAI_API_KEY") {
    return isConfiguredValue(value);
  }
  if (key === "RECOUP_EMAIL_SEND_PRINCIPALS") {
    return hasAllowedDavidEmailSendPrincipal(value, env);
  }

  return true;
}

function isBasicEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.trim());
}

function isPositiveInteger(value: string): boolean {
  return /^[1-9]\d*$/u.test(value.trim());
}

function isResendSigningSecret(value: string): boolean {
  const secret = value.trim();
  if (!secret.startsWith("whsec_")) {
    return false;
  }
  const encoded = secret.slice("whsec_".length);
  if (encoded.length === 0 || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) {
    return false;
  }

  return Buffer.from(encoded, "base64").length > 0;
}

function hasAllowedDavidEmailSendPrincipal(value: string, env: RuntimeEnv): boolean {
  const configuredPrincipals = parseCsv(value);
  const acceptedPrincipals = acceptedDavidRoutePrincipals(env);
  if (acceptedPrincipals.length === 0) {
    return configuredPrincipals.some(isDavidHumanPrincipal);
  }

  return acceptedPrincipals.some((principal) => configuredPrincipals.includes(principal));
}

function hasDavidPrincipalAuthenticationPath(env: RuntimeEnv): boolean {
  const configuredPrincipal = env.RECOUP_COCKPIT_HUMAN_PRINCIPAL?.trim();
  if (configuredPrincipal === undefined || !configuredPrincipal.startsWith("human:")) {
    return false;
  }

  return isDavidHumanPrincipal(configuredPrincipal) || isConfiguredValue(env.RECOUP_DEMO_SESSION_SECRET);
}

function acceptedDavidRoutePrincipals(env: RuntimeEnv): string[] {
  const principals = new Set<string>();
  const configuredPrincipal = env.RECOUP_COCKPIT_HUMAN_PRINCIPAL?.trim();
  if (configuredPrincipal !== undefined && isDavidHumanPrincipal(configuredPrincipal)) {
    principals.add(configuredPrincipal);
  }
  if (isConfiguredValue(env.RECOUP_DEMO_SESSION_SECRET)) {
    principals.add(davidDemoHumanPrincipal);
  }

  return [...principals];
}

function isDavidHumanPrincipal(principal: string): boolean {
  return /^human:david(?:-|$)/u.test(principal.trim());
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeEndpointOriginAndPath(endpoint: string): { origin: string; pathname: string } | undefined {
  try {
    const url = new URL(endpoint);
    return {
      origin: url.origin.toLowerCase(),
      pathname: normalizePathname(url.pathname)
    };
  } catch {
    return undefined;
  }
}

function normalizePathname(pathname: string): string {
  const withoutTrailingSlash = pathname.replace(/\/+$/u, "");
  return withoutTrailingSlash.length === 0 ? "/" : withoutTrailingSlash;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Credit negotiation live email readiness check failed."}\n`);
    process.exitCode = 1;
  }
}
