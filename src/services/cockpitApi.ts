import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import express, { type Express } from "express";
import { z } from "zod";
import { runForensicsInvestigation } from "../agents/forensics.js";
import { loadLocalRuntimeEnvFiles, type RuntimeEnv } from "../../config/env.js";
import {
  cockpitHumanProxyBodyHashHeader,
  cockpitHumanProxyIssuedAtHeader,
  cockpitHumanProxyNonceHeader,
  cockpitHumanProxyProofHeader,
  cockpitHumanProxyRoleHeader,
  defaultCockpitHumanPrincipal,
  verifyCockpitHumanProxyPrincipal,
  type CockpitHumanProxyPurpose
} from "../../config/cockpitHumanPrincipals.js";
import { ALL_TOOLS_DATA_TABLE_NAMES } from "../adapters/connectorRegistry.js";
import { createRuntimeMemoryStore } from "../memory/runtime.js";
import { createInMemoryStore } from "../memory/store.js";
import type { MemoryRecord } from "../memory/schema.js";
import {
  createSupabaseMemoryRepositoryFromEnv,
  createSupabaseTableReadinessProbeFromEnv,
  type SupabaseMemoryFetch
} from "../memory/supabaseStore.js";
import { assertApprovalReasonSafe } from "./approvals.js";
import { handleRealtimeToolCall, requestRealtimeClientSecret } from "./realtimeSession.js";
import { invokeServiceTool, prepareApprovalDecision } from "./serviceLayer.js";
import {
  buildAgentGraphModel,
  buildCfoSummaryCockpitModel,
  buildConnectorReadinessModel,
  buildCreditCockpitModel,
  buildForensicsCockpitModel,
  buildMemorySummaryModel,
  buildLoginModel,
  buildTraceModel,
  type ForensicsSseEvent
} from "./cockpitModel.js";

const approvalRequestSchema = z.object({
  actionId: z.string().min(1),
  approverId: z.string().startsWith("human:").optional(),
  decision: z.enum(["approve", "modify", "reject"]),
  reason: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : value),
    z.string().min(8).max(500).optional()
  )
}).superRefine((value, context) => {
  if (value.decision !== "approve" && value.reason === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Reason required for modify or reject decisions.",
      path: ["reason"]
    });
  }

  if (value.reason !== undefined) {
    try {
      assertApprovalReasonSafe(value.reason);
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "Approval reason rejected.",
        path: ["reason"]
      });
    }
  }
});

const realtimeClientSecretRequestSchema = z.object({
  question: z.string().trim().min(1, "Realtime query question is required.")
});
const realtimeToolCallRequestSchema = z.object({
  argumentsJson: z.string().max(4000),
  name: z.string().min(1)
});
const defaultAllowedCockpitOrigins = ["http://127.0.0.1:3000", "http://localhost:3000"];
const humanPrincipalHeader = "x-recoup-human-principal";
const humanTokenHeader = "x-recoup-human-token";
const cockpitApiDefaultPort = 4317;
const cockpitApiVersion = "0.1.0";
const approvalAlreadyDecidedMessage = "Action already has a human decision.";
const durableApprovalUnavailableMessage = "Durable approval finality is unavailable.";
const consumedHumanProxyNonces = new Set<string>();
const cockpitApiRoutes = [
  "GET /",
  "GET /healthz",
  "GET /forensics",
  "GET /login",
  "GET /credit",
  "GET /cfo",
  "GET /trace",
  "GET /memory",
  "GET /agents",
  "GET /connectors",
  "GET /run",
  "POST /approval",
  "POST /query/realtime-client-secret",
  "POST /query/realtime-tool"
] as const;

export interface CockpitApiOptions {
  env?: RuntimeEnv;
  memoryFetcher?: SupabaseMemoryFetch;
  realtimeFetcher?: typeof fetch;
}

export function createCockpitApi(options: CockpitApiOptions = {}): Express {
  const app = express();
  const runtimeEnv = options.env ?? process.env;
  const allowedOrigins = readAllowedOrigins(runtimeEnv);
  app.use((request, response, next) => {
    const requestOrigin = request.headers.origin;
    if (requestOrigin !== undefined && allowedOrigins.has(requestOrigin)) {
      response.setHeader("access-control-allow-origin", requestOrigin);
      response.setHeader("vary", "origin");
    } else if (request.method === "GET" || request.method === "HEAD" || requestOrigin === undefined) {
      response.setHeader("access-control-allow-origin", "*");
    }
    response.setHeader("access-control-allow-headers", `content-type,${humanPrincipalHeader},${humanTokenHeader}`);
    response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");

    if (isUnsafeMethod(request.method) && requestOrigin !== undefined && !allowedOrigins.has(requestOrigin)) {
      response.status(403).json({ error: "Cockpit origin rejected." });
      return;
    }

    if (request.method === "OPTIONS") {
      response.sendStatus(204);
      return;
    }

    next();
  });
  app.use(
    express.json({
      verify(request, _response, body) {
        (request as express.Request & { rawBody?: string }).rawBody = body.toString("utf8");
      }
    })
  );

  app.get("/", (_request, response) => {
    response.json({
      cockpitHint: "Run npm run dev:cockpit and open the Next.js URL.",
      defaultPort: cockpitApiDefaultPort,
      routes: cockpitApiRoutes,
      service: "recoup-cockpit-api",
      surface: "api",
      version: cockpitApiVersion
    });
  });

  app.get("/healthz", (_request, response) => {
    response.json({
      ok: true,
      surface: "cockpit-api",
      version: cockpitApiVersion
    });
  });

  app.get("/forensics", (_request, response) => {
    response.json(buildForensicsCockpitModel());
  });

  app.get("/login", (_request, response) => {
    response.json(buildLoginModel());
  });

  app.get("/credit", (_request, response) => {
    response.json(buildCreditCockpitModel());
  });

  app.get("/cfo", (_request, response) => {
    response.json(buildCfoSummaryCockpitModel());
  });

  app.get("/trace", (_request, response) => {
    response.json(buildTraceModel());
  });

  app.get("/memory", async (_request, response) => {
    const supabaseMemory = createSupabaseMemoryRepositoryFromEnv(runtimeEnv, options.memoryFetcher);
    if (supabaseMemory !== undefined) {
      response.json(buildMemorySummaryModel(await supabaseMemory.listAll(), { backend: "supabase" }));
      return;
    }

    const memoryStore = createRuntimeMemoryStore(runtimeEnv);
    try {
      response.json(
        memoryStore.mode === "sqlite"
          ? buildMemorySummaryModel(memoryStore.listAll(), { backend: "sqlite" })
          : buildMemorySummaryModel()
      );
    } finally {
      memoryStore.close();
    }
  });

  app.get("/agents", (_request, response) => {
    response.json(buildAgentGraphModel());
  });

  app.get("/connectors", async (_request, response) => {
    const supabaseProbe = createSupabaseTableReadinessProbeFromEnv(runtimeEnv, options.memoryFetcher);
    const toolDataSchemaProbe = supabaseProbe === undefined ? undefined : await supabaseProbe.probeTables(ALL_TOOLS_DATA_TABLE_NAMES);

    response.json(buildConnectorReadinessModel(readConfiguredEnvNames(runtimeEnv), toolDataSchemaProbe));
  });

  app.get("/run", async (request, response) => {
    const supabaseMemory = createSupabaseMemoryRepositoryFromEnv(runtimeEnv, options.memoryFetcher);
    const memoryStore = supabaseMemory === undefined ? createRuntimeMemoryStore(runtimeEnv) : createInMemoryStore();
    let events: ForensicsSseEvent[];
    try {
      const run = runForensicsInvestigation({
        memoryStore,
        sessionId: "cockpit-run"
      });
      events = run.trace;
      if (supabaseMemory !== undefined) {
        await Promise.all(memoryStore.listAll().map((record) => supabaseMemory.append(record)));
      }
    } finally {
      if (isClosableMemoryStore(memoryStore)) {
        memoryStore.close();
      }
    }

    response.setHeader("content-type", "text/event-stream");
    response.setHeader("cache-control", "no-cache");
    response.setHeader("connection", "keep-alive");
    response.flushHeaders();
    let index = 0;
    const interval = setInterval(() => {
      const event = events[index];
      if (event === undefined) {
        clearInterval(interval);
        response.end();
        return;
      }

      response.write(`event: ${event.type}\n`);
      response.write(`data: ${JSON.stringify(event)}\n\n`);
      index += 1;
    }, 5);

    request.on("close", () => {
      clearInterval(interval);
    });
  });

  app.post("/approval", async (request, response) => {
    const human = verifyHumanCockpitAuth(request, runtimeEnv, {
      allowProxyDemoRoles: ["maya", "david"],
      proxyPurpose: "approval"
    });
    if (!human.success) {
      response.status(401).json({ error: human.error });
      return;
    }

    const parsed = approvalRequestSchema.safeParse(request.body as unknown);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid approval request." });
      return;
    }

    try {
      const approvalInput = {
        actionId: parsed.data.actionId,
        decision: parsed.data.decision,
        ...(parsed.data.approverId === undefined ? {} : { approverId: parsed.data.approverId }),
        ...(parsed.data.reason === undefined ? {} : { reason: parsed.data.reason })
      };
      const prepared = prepareApprovalDecision(approvalInput, { verifiedHumanPrincipal: human.principal });
      const durableClaim = await claimDurableApprovalDecision(runtimeEnv, options.memoryFetcher, prepared.approval);
      if (durableClaim === "duplicate") {
        response.status(409).json({ error: approvalAlreadyDecidedMessage });
        return;
      }

      const approval = invokeServiceTool("approvals.decide", approvalInput, {
        verifiedHumanPrincipal: human.principal
      });
      await persistDurableApprovalDecision(runtimeEnv, options.memoryFetcher, approval as ApprovalDecisionResponse);
      response.json(approval);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Approval rejected.";
      response
        .status(
          message === approvalAlreadyDecidedMessage
            ? 409
            : message === "Action not found."
              ? 404
              : message === durableApprovalUnavailableMessage
                ? 503
                : 400
        )
        .json({ error: message });
    }
  });

  app.post("/query/realtime-client-secret", async (request, response) => {
    response.setHeader("cache-control", "no-store");
    const human = verifyHumanCockpitAuth(request, runtimeEnv, {
      allowProxyDemoRoles: ["maya"],
      proxyPurpose: "realtime"
    });
    if (!human.success) {
      response.status(401).json({ error: human.error });
      return;
    }

    const parsedRequest = realtimeClientSecretRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      response.status(400).json({ error: parsedRequest.error.issues[0]?.message ?? "Realtime query question is required." });
      return;
    }

    try {
      const result = await requestRealtimeClientSecret({
        env: runtimeEnv,
        ...(options.realtimeFetcher === undefined ? {} : { fetcher: options.realtimeFetcher }),
        question: parsedRequest.data.question,
        safetyIdentifier: human.principal
      });
      response.status(result.status === "blocked_missing_credentials" ? 503 : 200).json(result);
    } catch (error) {
      response
        .status(502)
        .json({ error: error instanceof Error ? error.message : "Realtime session request failed." });
    }
  });

  app.post("/query/realtime-tool", (request, response) => {
    response.setHeader("cache-control", "no-store");
    const human = verifyHumanCockpitAuth(request, runtimeEnv, {
      allowProxyDemoRoles: ["maya"],
      proxyPurpose: "realtime"
    });
    if (!human.success) {
      response.status(401).json({ error: human.error });
      return;
    }

    const parsedRequest = realtimeToolCallRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      response.status(400).json({ error: "Invalid Realtime tool request." });
      return;
    }

    try {
      const result = handleRealtimeToolCall(parsedRequest.data);
      response.status(result.status === "blocked_tool" ? 403 : 200).json(result);
    } catch {
      response.status(400).json({ error: "Invalid Realtime tool request." });
    }
  });

  return app;
}

function readAllowedOrigins(env: RuntimeEnv): Set<string> {
  const configured = env.RECOUP_COCKPIT_ALLOWED_ORIGINS;
  const origins =
    configured === undefined
      ? defaultAllowedCockpitOrigins
      : configured
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value.length > 0);

  return new Set(origins);
}

function isUnsafeMethod(method: string): boolean {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

interface CockpitHumanAuthOptions {
  allowProxyDemoRoles?: readonly string[];
  proxyPurpose?: CockpitHumanProxyPurpose;
}

function verifyHumanCockpitAuth(
  request: express.Request,
  env: RuntimeEnv,
  options: CockpitHumanAuthOptions = {}
): { principal: string; success: true } | { error: string; success: false } {
  const expectedToken = env.RECOUP_COCKPIT_AUTH_TOKEN?.trim();
  const expectedPrincipal = env.RECOUP_COCKPIT_HUMAN_PRINCIPAL?.trim() ?? defaultCockpitHumanPrincipal;
  const requestPrincipal = request.header(humanPrincipalHeader)?.trim();
  const requestToken = request.header(humanTokenHeader)?.trim();

  if (expectedToken === undefined || expectedToken.length === 0) {
    return { error: "Verified human cockpit auth required.", success: false };
  }

  if (
    requestPrincipal !== undefined &&
    requestPrincipal.startsWith("human:") &&
    requestPrincipal === expectedPrincipal &&
    requestToken !== undefined &&
    constantTimeEqual(requestToken, expectedToken)
  ) {
    return { principal: requestPrincipal, success: true };
  }

  const proxyPrincipal = verifyHumanProxyAuth(request, env, expectedToken, options);
  if (proxyPrincipal !== undefined) {
    return { principal: proxyPrincipal, success: true };
  }

  return { error: "Verified human cockpit auth required.", success: false };
}

function verifyHumanProxyAuth(
  request: express.Request,
  env: RuntimeEnv,
  expectedToken: string,
  options: CockpitHumanAuthOptions
): string | undefined {
  if (options.proxyPurpose === undefined || options.allowProxyDemoRoles === undefined || options.allowProxyDemoRoles.length === 0) {
    return undefined;
  }

  const requestPrincipal = request.header(humanPrincipalHeader)?.trim();
  const requestToken = request.header(humanTokenHeader)?.trim();
  const role = request.header(cockpitHumanProxyRoleHeader)?.trim();
  const proof = request.header(cockpitHumanProxyProofHeader)?.trim();
  const bodySha256 = request.header(cockpitHumanProxyBodyHashHeader)?.trim();
  const issuedAt = request.header(cockpitHumanProxyIssuedAtHeader)?.trim();
  const nonce = request.header(cockpitHumanProxyNonceHeader)?.trim();
  const secret = resolveDemoProxySecret(env);
  if (
    requestPrincipal === undefined ||
    !requestPrincipal.startsWith("human:") ||
    requestToken === undefined ||
    !constantTimeEqual(requestToken, expectedToken) ||
    role === undefined ||
    !options.allowProxyDemoRoles.includes(role) ||
    secret === undefined ||
    nonce === undefined ||
    isHumanProxyNonceConsumed(options.proxyPurpose, role, nonce) ||
    !verifyCockpitHumanProxyPrincipal({
      bodySha256,
      issuedAt,
      nonce,
      principal: requestPrincipal,
      proof,
      purpose: options.proxyPurpose,
      request: {
        body: readRawRequestBody(request),
        method: request.method,
        path: request.path
      },
      role,
      secret
    })
  ) {
    return undefined;
  }

  consumeHumanProxyNonce(options.proxyPurpose, role, nonce);
  return requestPrincipal;
}

function resolveDemoProxySecret(env: RuntimeEnv): string | undefined {
  const configured = env.RECOUP_DEMO_SESSION_SECRET?.trim();
  if (configured !== undefined && configured.length > 0) {
    return configured;
  }

  return undefined;
}

function readRawRequestBody(request: express.Request): string {
  const rawBody = (request as express.Request & { rawBody?: unknown }).rawBody;
  return typeof rawBody === "string" ? rawBody : "";
}

function isHumanProxyNonceConsumed(purpose: CockpitHumanProxyPurpose, role: string, nonce: string): boolean {
  return consumedHumanProxyNonces.has(humanProxyNonceKey(purpose, role, nonce));
}

function consumeHumanProxyNonce(purpose: CockpitHumanProxyPurpose, role: string, nonce: string): void {
  consumedHumanProxyNonces.add(humanProxyNonceKey(purpose, role, nonce));
}

function humanProxyNonceKey(purpose: CockpitHumanProxyPurpose, role: string, nonce: string): string {
  return `${purpose}:${role}:${nonce}`;
}

interface ApprovalDecisionResponse {
  actionId: string;
  approverId: string;
  auditEntryHash: string;
  decision: "approve" | "modify" | "reject";
  reason?: string;
  status: "human_decided";
}

type DurableApprovalClaimResult = "claimed" | "duplicate" | "unconfigured";

function approvalMemoryScope(actionId: string): string {
  return `approval:${actionId}`;
}

async function claimDurableApprovalDecision(
  env: RuntimeEnv,
  memoryFetcher: SupabaseMemoryFetch | undefined,
  approval: Omit<ApprovalDecisionResponse, "auditEntryHash">
): Promise<DurableApprovalClaimResult> {
  const record = buildApprovalMemoryClaim(approval);
  const supabaseMemory = createSupabaseMemoryRepositoryFromEnv(env, memoryFetcher);
  if (supabaseMemory !== undefined) {
    try {
      return (await supabaseMemory.appendIfAbsent(record)) === undefined ? "duplicate" : "claimed";
    } catch {
      throw new Error(durableApprovalUnavailableMessage);
    }
  }

  const dbPath = env.RECOUP_MEMORY_DB_PATH?.trim();
  if (dbPath === undefined || dbPath.length === 0) {
    return "unconfigured";
  }

  let memoryStore: ReturnType<typeof createRuntimeMemoryStore> | undefined;
  try {
    memoryStore = createRuntimeMemoryStore(env);
    return memoryStore.appendIfAbsent(record) === undefined ? "duplicate" : "claimed";
  } catch {
    throw new Error(durableApprovalUnavailableMessage);
  } finally {
    memoryStore?.close();
  }
}

async function persistDurableApprovalDecision(
  env: RuntimeEnv,
  memoryFetcher: SupabaseMemoryFetch | undefined,
  approval: ApprovalDecisionResponse
): Promise<void> {
  const supabaseMemory = createSupabaseMemoryRepositoryFromEnv(env, memoryFetcher);
  const record = buildApprovalMemoryRecord(approval);
  if (supabaseMemory !== undefined) {
    try {
      await supabaseMemory.append(record);
    } catch {
      throw new Error(durableApprovalUnavailableMessage);
    }
    return;
  }

  const dbPath = env.RECOUP_MEMORY_DB_PATH?.trim();
  if (dbPath === undefined || dbPath.length === 0) {
    return;
  }

  let memoryStore: ReturnType<typeof createRuntimeMemoryStore> | undefined;
  try {
    memoryStore = createRuntimeMemoryStore(env);
    memoryStore.append(record);
  } catch {
    throw new Error(durableApprovalUnavailableMessage);
  } finally {
    memoryStore?.close();
  }
}

function buildApprovalMemoryClaim(approval: Omit<ApprovalDecisionResponse, "auditEntryHash">): MemoryRecord {
  return {
    category: "approval_records",
    createdAt: new Date(0).toISOString(),
    id: `approval:${approval.actionId}`,
    payload: {
      actionId: approval.actionId,
      approverId: approval.approverId,
      decision: approval.decision,
      ...(approval.reason === undefined ? {} : { reason: approval.reason }),
      status: approval.status
    },
    recordIds: [approval.actionId],
    scope: approvalMemoryScope(approval.actionId),
    trustLevel: "trusted"
  };
}

function buildApprovalMemoryRecord(approval: ApprovalDecisionResponse): MemoryRecord {
  return {
    category: "approval_records",
    createdAt: new Date(0).toISOString(),
    id: `approval:${approval.actionId}`,
    payload: {
      actionId: approval.actionId,
      approverId: approval.approverId,
      auditEntryHash: approval.auditEntryHash,
      decision: approval.decision,
      ...(approval.reason === undefined ? {} : { reason: approval.reason }),
      status: approval.status
    },
    recordIds: [approval.actionId],
    scope: approvalMemoryScope(approval.actionId),
    trustLevel: "trusted"
  };
}

function isClosableMemoryStore(memoryStore: unknown): memoryStore is { close: () => void } {
  return (
    typeof memoryStore === "object" &&
    memoryStore !== null &&
    "close" in memoryStore &&
    typeof (memoryStore as { close?: unknown }).close === "function"
  );
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const port = Number(runtimeEnv.PORT ?? cockpitApiDefaultPort);
  const server = createCockpitApi({ env: runtimeEnv }).listen(port, () => {
    console.log(`Recoup cockpit API listening on http://127.0.0.1:${String(port)}`);
  });

  process.once("SIGTERM", () => {
    server.close();
  });
}

function readConfiguredEnvNames(env: RuntimeEnv): string[] {
  return Object.entries(env)
    .filter(([, value]) => value !== undefined && value.trim().length > 0)
    .map(([key]) => key);
}
