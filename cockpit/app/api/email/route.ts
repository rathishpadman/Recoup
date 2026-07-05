import { z } from "zod";
import { loadLocalRuntimeEnvFiles } from "../../../../config/localRuntimeEnv.ts";
import {
  EmailGatewayError,
  emailSendCapabilitiesForPrincipal,
  emailStatusSecret,
  readRecoupEmailConfig,
  readResendEmailStatus,
  sendResendEmail,
  verifyApprovedEmailSendPolicy,
  type EmailFetch,
  type EmailRecipientGroup,
  type RuntimeEmailEnv
} from "../../../../src/services/emailGateway.ts";
import { evaluateToolPermission } from "../../../../src/services/permissionEngine.ts";
import { buildVerifiedHumanAuthHeaders } from "../human-auth.ts";

interface EmailRouteTestOptions {
  env?: RuntimeEmailEnv;
  fetchImpl?: EmailFetch;
}

const emailSendSchema = z
  .object({
    actionId: z.string().min(1),
    body: z.string().min(1).max(20_000),
    lineId: z.string().min(1),
    recipientGroup: z.enum(["billing", "recovery"]),
    subject: z.string().min(1).max(300)
  })
  .strict();

const emailStatusSchema = z
  .object({
    actionId: z.string().min(1),
    lineId: z.string().min(1),
    providerEmailId: z.string().min(1),
    recipientGroup: z.enum(["billing", "recovery"]),
    statusToken: z.string().min(1)
  })
  .strict();

const routeEmailEnvKeys = [
  "RESEND_API_KEY",
  "EMAIL_TO_BILLING",
  "EMAIL_TO_RECOVERY",
  "SENDER_EMAIL_ADDRESS",
  "RECOUP_EMAIL_SEND_PRINCIPALS"
] as const;
void routeEmailEnvKeys;

const emailSendPermissionMetadata = {
  riskClass: "communication",
  sideEffectClass: "external_correspondence",
  visibility: "mcp"
} as const;

export async function POST(request: Request): Promise<Response> {
  return handleEmailPostForTest(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleEmailGetForTest(request);
}

export async function handleEmailGetForTest(request: Request, options: EmailRouteTestOptions = {}): Promise<Response> {
  const runtimeEnv = options.env ?? loadLocalRuntimeEnvFiles();
  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["maya"],
    proxyPurpose: "read",
    proxyRequest: { body: "", method: "GET", path: "/email/status" }
  });
  if (authHeaders === undefined) {
    return Response.json({ error: "Verified human cockpit auth required." }, { status: 401 });
  }

  const configResult = readRecoupEmailConfig(runtimeEnv);
  if (!configResult.ok) {
    return Response.json({ error: "Email service is not configured.", missing: configResult.missing }, { status: 503 });
  }

  const url = new URL(request.url);
  const parsed = emailStatusSchema.safeParse({
    actionId: url.searchParams.get("actionId") ?? undefined,
    lineId: url.searchParams.get("lineId") ?? undefined,
    providerEmailId: url.searchParams.get("providerEmailId") ?? undefined,
    recipientGroup: url.searchParams.get("recipientGroup") ?? undefined,
    statusToken: request.headers.get("x-recoup-email-status-token") ?? undefined
  });
  if (!parsed.success) {
    return Response.json({ error: "Invalid email status request." }, { status: 400 });
  }

  try {
    const principal = authHeaders["x-recoup-human-principal"];
    const status = await readResendEmailStatus({
      actionId: parsed.data.actionId,
      config: configResult.config,
      fetchImpl: options.fetchImpl,
      lineId: parsed.data.lineId,
      principal,
      providerEmailId: parsed.data.providerEmailId,
      recipientGroup: parsed.data.recipientGroup,
      statusSecret: emailStatusSecret(runtimeEnv, configResult.config),
      statusToken: parsed.data.statusToken
    });
    return Response.json(status);
  } catch (error) {
    return Response.json({ error: emailErrorMessage(error, "Email status read failed.") }, { status: emailErrorStatus(error) });
  }
}

export async function handleEmailPostForTest(request: Request, options: EmailRouteTestOptions = {}): Promise<Response> {
  const runtimeEnv = options.env ?? loadLocalRuntimeEnvFiles();
  const bodyText = await request.text();
  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["maya"],
    proxyPurpose: "approval",
    proxyRequest: { body: bodyText, method: "POST", path: "/email" }
  });
  if (authHeaders === undefined) {
    return Response.json({ error: "Verified human cockpit auth required." }, { status: 401 });
  }

  const configResult = readRecoupEmailConfig(runtimeEnv);
  if (!configResult.ok) {
    return Response.json({ error: "Email service is not configured.", missing: configResult.missing }, { status: 503 });
  }

  const parsed = emailSendSchema.safeParse(parseJson(bodyText));
  if (!parsed.success) {
    return Response.json({ error: "Invalid email send request." }, { status: 400 });
  }

  const principal = authHeaders["x-recoup-human-principal"];
  const permission = evaluateToolPermission(emailSendPermissionMetadata, {
    actorCapabilities: emailSendCapabilitiesForPrincipal(runtimeEnv, principal),
    actorId: principal
  });
  if (permission.decision === "deny") {
    return Response.json({ error: permission.reason ?? "Email send is not permitted." }, { status: 403 });
  }

  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const detail = await fetchApprovedWorkItemDetail({
      authHeaders,
      fetchImpl,
      lineId: parsed.data.lineId,
      runtimeEnv
    });
    const policyCheck = verifyApprovedEmailSendPolicy(detail, parsed.data);
    if (!policyCheck.ok) {
      return Response.json({ error: policyCheck.error }, { status: policyCheck.status });
    }

    const sendResult = await sendResendEmail({
      config: configResult.config,
      draft: parsed.data,
      fetchImpl,
      principal,
      statusSecret: emailStatusSecret(runtimeEnv, configResult.config)
    });
    return Response.json(sendResult);
  } catch (error) {
    return Response.json({ error: emailErrorMessage(error, "Email send failed.") }, { status: emailErrorStatus(error) });
  }
}

async function fetchApprovedWorkItemDetail(input: {
  authHeaders: Record<string, string>;
  fetchImpl: EmailFetch;
  lineId: string;
  runtimeEnv: RuntimeEmailEnv;
}): Promise<unknown> {
  const baseUrl = input.runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317";
  const response = await input.fetchImpl(`${baseUrl}/forensics/work-items/${encodeURIComponent(input.lineId)}`, {
    headers: {
      accept: "application/json",
      ...input.authHeaders
    },
    method: "GET"
  });
  if (!response.ok) {
    throw new EmailGatewayError("Approved case detail unavailable.", response.status);
  }

  return response.json();
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function emailErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function emailErrorStatus(error: unknown): number {
  if (error instanceof EmailGatewayError) {
    return error.status >= 400 && error.status < 600 ? error.status : 502;
  }

  return 502;
}

export type { EmailRecipientGroup };
