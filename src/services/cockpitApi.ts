import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import express, { type Express } from "express";
import { z } from "zod";
import { runForensicsInvestigation } from "../agents/forensics.js";
import { createAuditTrail } from "../audit/trail.js";
import { loadLocalRuntimeEnvFiles, type RuntimeEnv } from "../../config/env.js";
import { createRuntimeMemoryStore } from "../memory/runtime.js";
import { createInMemoryStore } from "../memory/store.js";
import { createSupabaseMemoryRepositoryFromEnv, type SupabaseMemoryFetch } from "../memory/supabaseStore.js";
import {
  assertApprovalActionOpen,
  assertApprovalReasonSafe,
  decideApproval,
  recordApprovalActionDecision
} from "./approvals.js";
import { requestRealtimeClientSecret } from "./realtimeSession.js";
import {
  buildAgentGraphModel,
  buildCfoSummaryCockpitModel,
  buildConnectorReadinessModel,
  buildCreditCockpitModel,
  buildForensicsCockpitModel,
  buildMemorySummaryModel,
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
const approvalAuditTrail = createAuditTrail();
const cockpitApproverId = "human:maya-lead";
const defaultAllowedCockpitOrigins = ["http://127.0.0.1:3000", "http://localhost:3000"];
const humanPrincipalHeader = "x-recoup-human-principal";
const humanTokenHeader = "x-recoup-human-token";

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
  app.use(express.json());

  app.get("/forensics", (_request, response) => {
    response.json(buildForensicsCockpitModel());
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
      response.json(buildMemorySummaryModel(await supabaseMemory.listAll()));
      return;
    }

    const memoryStore = createRuntimeMemoryStore(runtimeEnv);
    try {
      response.json(memoryStore.mode === "sqlite" ? buildMemorySummaryModel(memoryStore.listAll()) : buildMemorySummaryModel());
    } finally {
      memoryStore.close();
    }
  });

  app.get("/agents", (_request, response) => {
    response.json(buildAgentGraphModel());
  });

  app.get("/connectors", (_request, response) => {
    response.json(buildConnectorReadinessModel(readConfiguredEnvNames(runtimeEnv)));
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

  app.post("/approval", (request, response) => {
    const human = verifyHumanCockpitAuth(request, runtimeEnv);
    if (!human.success) {
      response.status(401).json({ error: human.error });
      return;
    }

    const parsed = approvalRequestSchema.safeParse(request.body as unknown);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid approval request." });
      return;
    }

    const action = runForensicsInvestigation().actions.find((candidate) => candidate.actionId === parsed.data.actionId);
    if (action === undefined) {
      response.status(404).json({ error: "Action not found." });
      return;
    }

    try {
      assertApprovalActionOpen(action.actionId);
      const approval = decideApproval(action, {
        approverId: human.principal,
        decision: parsed.data.decision,
        ...(parsed.data.reason === undefined ? {} : { reason: parsed.data.reason })
      });
      const auditEntry = approvalAuditTrail.append({
        entryType: "approval.decision",
        payload: {
          actionId: approval.actionId,
          approverId: approval.approverId,
          decision: approval.decision,
          ...(approval.reason === undefined ? {} : { reason: approval.reason }),
          status: approval.status
        },
        recordIds: [approval.actionId, action.lineId, ...action.recordIds]
      });
      recordApprovalActionDecision(action.actionId);
      response.json({
        actionId: approval.actionId,
        auditEntryHash: auditEntry.entryHash,
        approverId: approval.approverId,
        decision: approval.decision,
        ...(approval.reason === undefined ? {} : { reason: approval.reason }),
        status: approval.status
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Approval rejected.";
      response.status(message === "Action already has a human decision." ? 409 : 400).json({ error: message });
    }
  });

  app.post("/query/realtime-client-secret", async (request, response) => {
    const human = verifyHumanCockpitAuth(request, runtimeEnv);
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

function verifyHumanCockpitAuth(
  request: express.Request,
  env: RuntimeEnv
): { principal: string; success: true } | { error: string; success: false } {
  const expectedToken = env.RECOUP_COCKPIT_AUTH_TOKEN?.trim();
  const expectedPrincipal = env.RECOUP_COCKPIT_HUMAN_PRINCIPAL?.trim() ?? cockpitApproverId;
  const requestPrincipal = request.header(humanPrincipalHeader)?.trim();
  const requestToken = request.header(humanTokenHeader)?.trim();

  if (expectedToken === undefined || expectedToken.length === 0) {
    return { error: "Verified human cockpit auth required.", success: false };
  }

  if (
    requestPrincipal === undefined ||
    !requestPrincipal.startsWith("human:") ||
    requestPrincipal !== expectedPrincipal ||
    requestToken === undefined ||
    !constantTimeEqual(requestToken, expectedToken)
  ) {
    return { error: "Verified human cockpit auth required.", success: false };
  }

  return { principal: requestPrincipal, success: true };
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
  const port = Number(runtimeEnv.PORT ?? 4317);
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
