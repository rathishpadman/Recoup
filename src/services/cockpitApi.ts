import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import type { GovernedConfigValues } from "../../config/governed.js";
import { runForensicsInvestigation } from "../agents/forensics.js";
import {
  streamLiveForensicsTraceEvents,
  type LiveForensicsStreamRunner
} from "../agents/liveForensicsStream.js";
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
  createSupabaseGovernedConfigRepositoryFromEnv,
  createSupabaseMemoryRepositoryFromEnv,
  createSupabaseReleaseOwnerInputRepositoryFromEnv,
  createSupabaseTableReadinessProbeFromEnv,
  type SupabaseMemoryFetch
} from "../memory/supabaseStore.js";
import {
  createSupabaseAuditChainRepositoryFromEnv,
  isSupabaseAuditTailMismatch
} from "../audit/supabaseTrail.js";
import {
  createSapODataConnectionFromEnv,
  parseSapODataMetadata,
  SapODataReadOnlyAdapter,
  SapODataReadOnlyClient,
  type SapODataConnection
} from "../adapters/sapOData.js";
import type { SourcePort } from "../adapters/source.js";
import {
  createSupabaseSettlementRunReaderFromEnv,
  createSupabaseRiskObservationSnapshotReaderFromEnv,
  createSupabaseSapEvidenceReaderFromEnv,
  createSupabaseSyntheticSourceReaderFromEnv,
  sourcePortFromSupabaseSnapshots,
  type SupabaseRiskObservationSourceConfig
} from "../adapters/supabaseSyntheticSource.js";
import { buildRunBudgetMiddlewareStatus } from "../middleware/budgets.js";
import { createRunBudgetController, type RunControlConfig, type RunControlStatus } from "./conductor.js";
import type { DecisionConfidenceThreshold, ReleaseOwnerInputSnapshot } from "../../config/releaseOwnerInputs.js";
import { createJsonBodyErrorHandler } from "../middleware/errors.js";
import { createCorrelationIdMiddleware, recoupCorrelationIdHeader } from "../middleware/logging.js";
import { assertApprovalReasonSafe } from "./approvals.js";
import { handleRealtimeToolCall, requestRealtimeClientSecret } from "./realtimeSession.js";
import {
  assertR1SourceReadInput,
  buildPreparedApprovalAuditEntry,
  buildSupabaseServiceSapEvidenceSource,
  buildSupabaseServiceSyntheticEvidenceSource,
  invokeServiceTool,
  prepareApprovalDecision,
  type PreparedApprovalDecision,
  type ServiceInvocationContext
} from "./serviceLayer.js";
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
const runRequestSchema = z.object({
  runType: z.literal("forensics"),
  seed: z.literal(42).optional()
}).strict();
const defaultAllowedCockpitOrigins = ["http://127.0.0.1:3000", "http://localhost:3000"];
const humanPrincipalHeader = "x-recoup-human-principal";
const humanTokenHeader = "x-recoup-human-token";
const cockpitApiDefaultPort = 4317;
const cockpitApiVersion = "0.1.0";
const approvalAlreadyDecidedMessage = "Action already has a human decision.";
const durableAuditTrailUnavailableMessage = "Durable audit trail is unavailable.";
const liveForensicsAuthRequiredMessage = "Live Agents SDK stream skipped: verified human cockpit auth is required.";
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
  "GET /sources/r1/:need",
  "GET /run",
  "POST /run",
  "POST /approval",
  "POST /query/realtime-client-secret",
  "POST /query/realtime-tool"
] as const;

export interface CockpitApiOptions {
  env?: RuntimeEnv;
  forensicsStreamRunner?: LiveForensicsStreamRunner;
  memoryFetcher?: SupabaseMemoryFetch;
  realtimeFetcher?: typeof fetch;
  sapFetcher?: typeof fetch;
}

interface LoadedRunControl {
  config: RunControlConfig;
  decisionConfidenceThreshold?: DecisionConfidenceThreshold;
  status: RunControlStatus;
}

export function createCockpitApi(options: CockpitApiOptions = {}): Express {
  const app = express();
  const runtimeEnv = options.env ?? process.env;
  const allowedOrigins = readAllowedOrigins(runtimeEnv);
  app.use(createCorrelationIdMiddleware());
  app.use((request, response, next) => {
    const requestOrigin = request.headers.origin;
    if (requestOrigin !== undefined && allowedOrigins.has(requestOrigin)) {
      response.setHeader("access-control-allow-origin", requestOrigin);
      response.setHeader("vary", "origin");
    } else if (request.method === "GET" || request.method === "HEAD" || requestOrigin === undefined) {
      response.setHeader("access-control-allow-origin", "*");
    }
    response.setHeader(
      "access-control-allow-headers",
      `content-type,${humanPrincipalHeader},${humanTokenHeader},${recoupCorrelationIdHeader}`
    );
    response.setHeader("access-control-expose-headers", recoupCorrelationIdHeader);
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
  app.use(
    createJsonBodyErrorHandler([
      {
        message: "Invalid run request.",
        method: "POST",
        path: "/run"
      }
    ])
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

  app.get("/healthz", async (_request, response) => {
    const runControl = await loadRunBudgetMiddlewareStatus();

    response.status(runControl.status === "pass" ? 200 : 503).json({
      ok: runControl.status === "pass",
      runControl,
      surface: "cockpit-api",
      version: cockpitApiVersion
    });
  });

  app.get("/forensics", async (_request, response) => {
    const governedConfig = await loadRequiredGovernedConfig(response);
    if (governedConfig === undefined) {
      return;
    }

    const runContext = await loadRequiredSupabaseRunContext(response, governedConfig);
    if (runContext === undefined) {
      return;
    }
    const { serviceContext, source } = runContext;

    response.json(buildForensicsCockpitModel({ governedConfig, serviceContext, settlementSource: source }));
  });

  app.get("/login", (_request, response) => {
    response.json(buildLoginModel());
  });

  app.get("/credit", async (_request, response) => {
    const governedConfig = await loadRequiredGovernedConfig(response);
    if (governedConfig === undefined) {
      return;
    }

    const source = await loadRequiredSupabaseSource(response, governedConfig, { riskObservationRequired: true });
    if (source === undefined) {
      return;
    }

    response.json(buildCreditCockpitModel({ governedConfig, riskObservationSource: source, settlementSource: source }));
  });

  app.get("/cfo", async (_request, response) => {
    const governedConfig = await loadRequiredGovernedConfig(response);
    if (governedConfig === undefined) {
      return;
    }

    const source = await loadRequiredSupabaseSource(response, governedConfig, { riskObservationRequired: true });
    if (source === undefined) {
      return;
    }

    response.json(buildCfoSummaryCockpitModel({ governedConfig, riskObservationSource: source, settlementSource: source }));
  });

  app.get("/trace", async (_request, response) => {
    const governedConfig = await loadRequiredGovernedConfig(response);
    if (governedConfig === undefined) {
      return;
    }

    const source = await loadRequiredSupabaseSource(response, governedConfig, { riskObservationRequired: true });
    if (source === undefined) {
      return;
    }

    response.json(buildTraceModel({ governedConfig, riskObservationSource: source, settlementSource: source }));
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

  app.get("/sources/r1/:need", async (request, response) => {
    try {
      const input = buildR1SourceReadRequest(request);
      assertR1SourceReadInput(input);
      const serviceContext = await buildR1SourceReadServiceContext(input, runtimeEnv, options.sapFetcher);

      response.json(invokeServiceTool("sources.r1Read", input, serviceContext));
    } catch (error) {
      response.status(isInvalidR1SourceReadRequest(error) ? 400 : 503).json({
        error: isInvalidR1SourceReadRequest(error)
          ? "Invalid R1 source read request."
          : error instanceof Error
            ? error.message
            : "R1 source read failed."
      });
    }
  });

  async function streamForensicsRun(request: Request, response: Response): Promise<void> {
    const runControl = await loadRequiredRunControl(response);
    if (runControl === undefined) {
      return;
    }
    const runBudget = createRunBudgetController(runControl.config);

    const governedConfig = await loadRequiredGovernedConfig(response);
    if (governedConfig === undefined) {
      return;
    }
    const runContext = await loadRequiredSupabaseRunContext(response, governedConfig);
    if (runContext === undefined) {
      return;
    }
    const { serviceContext, source } = runContext;
    const supabaseMemory = createSupabaseMemoryRepositoryFromEnv(runtimeEnv, options.memoryFetcher);
    const memoryStore = supabaseMemory === undefined ? createRuntimeMemoryStore(runtimeEnv) : createInMemoryStore();
    let events: ForensicsSseEvent[];
    try {
      runBudget.recordStep({ phase: "forensics" });
      const run = runForensicsInvestigation({
        ...(runControl.decisionConfidenceThreshold === undefined
          ? {}
          : { decisionConfidenceThreshold: runControl.decisionConfidenceThreshold }),
        governedConfig,
        memoryStore,
        serviceContext,
        sessionId: "cockpit-run",
        source
      });
      runBudget.recordStep({ phase: "containment" });
      if (run.actions.some((action) => action.actionType === "draft-rebill")) {
        runBudget.recordStep({ phase: "recovery" });
      }
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

    const abortController = new AbortController();
    response.on("close", () => {
      abortController.abort();
    });

    const liveTraceOptions =
      options.forensicsStreamRunner === undefined
        ? {
            agentHookRecordIds: collectForensicsTraceRecordIds(events),
            env: runtimeEnv,
            maxTurns: runControl.config.phases.forensics.stepBudget,
            onRetry() {
              runBudget.recordRetry({ phase: "forensics" });
            },
            onTokenUsage(tokens: number) {
              runBudget.recordTokenUsage({ phase: "forensics", tokens });
            },
            retryCap: runControl.config.phases.forensics.retryCap,
            signal: abortController.signal
          }
        : {
            agentHookRecordIds: collectForensicsTraceRecordIds(events),
            env: runtimeEnv,
            maxTurns: runControl.config.phases.forensics.stepBudget,
            onRetry() {
              runBudget.recordRetry({ phase: "forensics" });
            },
            onTokenUsage(tokens: number) {
              runBudget.recordTokenUsage({ phase: "forensics", tokens });
            },
            retryCap: runControl.config.phases.forensics.retryCap,
            runner: options.forensicsStreamRunner,
            signal: abortController.signal
          };

    if (shouldAttemptLiveForensicsStream(request, runtimeEnv)) {
      for await (const event of streamLiveForensicsTraceEvents(liveTraceOptions)) {
        if (response.destroyed) {
          return;
        }
        writeSseEvent(response, event);
      }
    } else {
      writeSseEvent(response, buildLiveForensicsAuthRequiredEvent());
    }

    let index = 0;
    const interval = setInterval(() => {
      if (response.destroyed) {
        clearInterval(interval);
        return;
      }
      const event = events[index];
      if (event === undefined) {
        clearInterval(interval);
        response.end();
        return;
      }

      writeSseEvent(response, event);
      index += 1;
    }, 5);
  }

  async function loadRequiredRunControl(response: Response): Promise<LoadedRunControl | undefined> {
    const loadedReleaseOwnerInputs = await loadReleaseOwnerInputs();
    const config = loadedReleaseOwnerInputs?.runControlConfig;
    const status = buildRunBudgetMiddlewareStatus(config);
    if (loadedReleaseOwnerInputs !== undefined && status.status === "pass") {
      return {
        config: loadedReleaseOwnerInputs.runControlConfig,
        ...(loadedReleaseOwnerInputs.decisionConfidenceThreshold === undefined
          ? {}
          : { decisionConfidenceThreshold: loadedReleaseOwnerInputs.decisionConfidenceThreshold }),
        status
      };
    }

    response.status(503).json({
      error: "Supabase release owner-input recoup_config rows are required for run-control.",
      runControl: status
    });
    return undefined;
  }

  async function loadRunBudgetMiddlewareStatus(): Promise<RunControlStatus> {
    return buildRunBudgetMiddlewareStatus(await loadRunControlConfig());
  }

  async function loadRunControlConfig(): Promise<RunControlConfig | undefined> {
    return (await loadReleaseOwnerInputs())?.runControlConfig;
  }

  async function loadReleaseOwnerInputs(): Promise<ReleaseOwnerInputSnapshot | undefined> {
    const repository = createSupabaseReleaseOwnerInputRepositoryFromEnv(runtimeEnv, options.memoryFetcher);
    if (repository === undefined) {
      return undefined;
    }

    try {
      return await repository.loadActive();
    } catch {
      return undefined;
    }
  }

  async function loadRequiredGovernedConfig(response: Response): Promise<GovernedConfigValues | undefined> {
    const repository = createSupabaseGovernedConfigRepositoryFromEnv(runtimeEnv, options.memoryFetcher);
    if (repository === undefined) {
      response.status(503).json({
        error: "Supabase recoup_config is required for governed runtime values."
      });
      return undefined;
    }

    try {
      return (await repository.loadActive()).values;
    } catch {
      response.status(503).json({
        error: "Supabase governed recoup_config rows are unavailable or failed validation."
      });
      return undefined;
    }
  }

  async function loadRequiredSupabaseRunContext(
    response: Response,
    governedConfig: GovernedConfigValues,
    sourceOptions: { riskObservationRequired?: boolean } = {}
  ): Promise<{ serviceContext: ServiceInvocationContext; source: SourcePort } | undefined> {
    const settlementReader = createSupabaseSettlementRunReaderFromEnv(runtimeEnv, governedConfig.seed, options.memoryFetcher);
    const sapEvidenceReader = createSupabaseSapEvidenceReaderFromEnv(runtimeEnv, options.memoryFetcher);
    const syntheticEvidenceReader = createSupabaseSyntheticSourceReaderFromEnv(runtimeEnv, options.memoryFetcher);
    if (settlementReader === undefined || sapEvidenceReader === undefined || syntheticEvidenceReader === undefined) {
      response.status(503).json({
        error: "Supabase settlement and source evidence rows are required for Forensics."
      });
      return undefined;
    }

    try {
      const settlementRun = await settlementReader.loadSettlementRun();
      let source = sourcePortFromSupabaseSnapshots({ settlementRun });
      if (sourceOptions.riskObservationRequired === true) {
        const reader = createSupabaseRiskObservationSnapshotReaderFromEnv(
          runtimeEnv,
          riskObservationSourcesFromGovernedConfig(governedConfig),
          options.memoryFetcher
        );
        if (reader === undefined) {
          response.status(503).json({
            error: "Supabase Tools_data risk observation rows are unavailable or failed validation."
          });
          return undefined;
        }

        const riskObservationSnapshot = await reader.loadRiskObservationSnapshot(governedConfig.riskMeshCases.harbor.customerId);
        if (riskObservationSnapshot === undefined) {
          response.status(503).json({
            error: "Supabase Tools_data risk observation rows are unavailable or failed validation."
          });
          return undefined;
        }

        source = sourcePortFromSupabaseSnapshots({ riskObservationSnapshot, settlementRun });
      }
      const [sapEvidenceSource, syntheticEvidenceSource] = await Promise.all([
        buildSupabaseServiceSapEvidenceSource({
          reader: sapEvidenceReader,
          settlementRun
        }),
        buildSupabaseServiceSyntheticEvidenceSource({
          reader: syntheticEvidenceReader,
          settlementRun
        })
      ]);

      return {
        serviceContext: {
          governedConfig,
          requireSupabaseSapEvidence: true,
          requireSupabaseSyntheticEvidence: true,
          sapEvidenceSource,
          source,
          syntheticEvidenceSource
        },
        source
      };
    } catch {
      if (sourceOptions.riskObservationRequired === true) {
        response.status(503).json({
          error: "Supabase Tools_data risk observation rows are unavailable or failed validation."
        });
        return undefined;
      }

      response.status(503).json({
        error: "Supabase source evidence rows are unavailable or failed validation."
      });
      return undefined;
    }
  }

  async function loadRequiredSupabaseSource(
    response: Response,
    governedConfig: GovernedConfigValues,
    sourceOptions: { riskObservationRequired?: boolean } = {}
  ): Promise<SourcePort | undefined> {
    const settlementReader = createSupabaseSettlementRunReaderFromEnv(runtimeEnv, governedConfig.seed, options.memoryFetcher);
    if (settlementReader === undefined) {
      response.status(503).json({
        error: "Supabase settlement source rows are unavailable or failed validation."
      });
      return undefined;
    }

    try {
      const settlementRun = await settlementReader.loadSettlementRun();
      if (sourceOptions.riskObservationRequired === true) {
        const reader = createSupabaseRiskObservationSnapshotReaderFromEnv(
          runtimeEnv,
          riskObservationSourcesFromGovernedConfig(governedConfig),
          options.memoryFetcher
        );
        if (reader === undefined) {
          response.status(503).json({
            error: "Supabase Tools_data risk observation rows are unavailable or failed validation."
          });
          return undefined;
        }

        const riskObservationSnapshot = await reader.loadRiskObservationSnapshot(governedConfig.riskMeshCases.harbor.customerId);
        if (riskObservationSnapshot === undefined) {
          response.status(503).json({
            error: "Supabase Tools_data risk observation rows are unavailable or failed validation."
          });
          return undefined;
        }

        return sourcePortFromSupabaseSnapshots({ riskObservationSnapshot, settlementRun });
      }

      return sourcePortFromSupabaseSnapshots({ settlementRun });
    } catch {
      if (sourceOptions.riskObservationRequired === true) {
        response.status(503).json({
          error: "Supabase Tools_data risk observation rows are unavailable or failed validation."
        });
        return undefined;
      }

      response.status(503).json({
        error: "Supabase settlement source rows are unavailable or failed validation."
      });
      return undefined;
    }
  }

  app.get("/run", streamForensicsRun);

  app.post("/run", async (request, response) => {
    const parsed = runRequestSchema.safeParse(request.body as unknown);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid run request." });
      return;
    }

    await streamForensicsRun(request, response);
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
      const governedConfig = await loadRequiredGovernedConfig(response);
      if (governedConfig === undefined) {
        return;
      }
      const runContext = await loadRequiredSupabaseRunContext(response, governedConfig, { riskObservationRequired: true });
      if (runContext === undefined) {
        return;
      }
      const { serviceContext, source } = runContext;
      const approvalInput = {
        actionId: parsed.data.actionId,
        decision: parsed.data.decision,
        ...(parsed.data.approverId === undefined ? {} : { approverId: parsed.data.approverId }),
        ...(parsed.data.reason === undefined ? {} : { reason: parsed.data.reason })
      };
      const supabaseAuditChain =
        runtimeEnv.RECOUP_MEMORY_BACKEND === "supabase"
          ? createSupabaseAuditChainRepositoryFromEnv(runtimeEnv, options.memoryFetcher)
          : undefined;
      if (supabaseAuditChain !== undefined) {
        const prepared = prepareApprovalDecision(approvalInput, {
          ...serviceContext,
          governedConfig,
          source,
          verifiedHumanPrincipal: human.principal
        });
        response.json(await commitSupabaseApprovalDecision(runtimeEnv, options.memoryFetcher, prepared));
        return;
      }

      throw new Error(durableAuditTrailUnavailableMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Approval rejected.";
      response
        .status(
          message === approvalAlreadyDecidedMessage
            ? 409
            : message === "Action not found."
              ? 404
              : message === durableAuditTrailUnavailableMessage
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

  app.post("/query/realtime-tool", async (request, response) => {
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
      const governedConfig = await loadRequiredGovernedConfig(response);
      if (governedConfig === undefined) {
        return;
      }
      const source = await loadRequiredSupabaseSource(response, governedConfig, { riskObservationRequired: true });
      if (source === undefined) {
        return;
      }
      const result = handleRealtimeToolCall(parsedRequest.data, (name, input) =>
        invokeServiceTool(name, input, { governedConfig, source })
      );
      response.status(result.status === "blocked_tool" ? 403 : 200).json(result);
    } catch {
      response.status(400).json({ error: "Invalid Realtime tool request." });
    }
  });

  return app;
}

function writeSseEvent(response: Response, event: ForensicsSseEvent): void {
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
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

function shouldAttemptLiveForensicsStream(request: express.Request, env: RuntimeEnv): boolean {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    return true;
  }

  return verifyHumanCockpitAuth(request, env, {
    allowProxyDemoRoles: ["maya"],
    proxyPurpose: "realtime"
  }).success;
}

function buildLiveForensicsAuthRequiredEvent(): ForensicsSseEvent {
  return {
    type: "status",
    payload: {
      kind: "model-context",
      text: liveForensicsAuthRequiredMessage
    }
  };
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

function approvalMemoryScope(actionId: string): string {
  return `approval:${actionId}`;
}

async function commitSupabaseApprovalDecision(
  env: RuntimeEnv,
  memoryFetcher: SupabaseMemoryFetch | undefined,
  prepared: PreparedApprovalDecision
): Promise<ApprovalDecisionResponse> {
  const supabaseAuditChain = createSupabaseAuditChainRepositoryFromEnv(env, memoryFetcher);
  if (supabaseAuditChain === undefined) {
    throw new Error(durableAuditTrailUnavailableMessage);
  }

  for (const attempt of [0, 1]) {
    try {
      const tail = await supabaseAuditChain.readTail();
      const previousHash = tail?.entryHash ?? "GENESIS";
      const auditEntry = buildPreparedApprovalAuditEntry(prepared, {
        previousHash,
        sequence: (tail?.sequence ?? 0) + 1
      });
      const approval = {
        ...prepared.approval,
        auditEntryHash: auditEntry.entryHash
      };

      await supabaseAuditChain.commitApprovalDecision({
        auditEntry,
        expectedPreviousHash: previousHash,
        memoryRecord: buildApprovalMemoryRecord(approval, prepared.action.recordIds),
        memoryTableName: env.RECOUP_SUPABASE_MEMORY_TABLE ?? "recoup_memory_records"
      });

      return approval;
    } catch (error) {
      if (isSupabaseAuditTailMismatch(error) && attempt === 0) {
        continue;
      }
      if (error instanceof Error && error.message === "Supabase approval decision already committed.") {
        throw new Error(approvalAlreadyDecidedMessage);
      }
      throw new Error(durableAuditTrailUnavailableMessage);
    }
  }

  throw new Error(durableAuditTrailUnavailableMessage);
}

function riskObservationSourcesFromGovernedConfig(
  governedConfig: GovernedConfigValues
): Record<string, SupabaseRiskObservationSourceConfig> {
  const harbor = governedConfig.riskMeshCases.harbor;

  return {
    [harbor.customerId]: {
      baselinePaymentRefs: [...harbor.riskObservationSource.baselinePaymentRefs],
      criticalAlertSeverity: harbor.riskObservationSource.criticalAlertSeverity,
      criticalAlertType: harbor.riskObservationSource.criticalAlertType,
      citedDeductionVerdicts: [...harbor.riskObservationSource.citedDeductionVerdicts],
      currentPaymentRef: harbor.riskObservationSource.currentPaymentRef,
      sourceCustomerId: harbor.riskObservationSource.sourceCustomerId
    }
  };
}

function buildApprovalMemoryRecord(approval: ApprovalDecisionResponse, actionRecordIds: readonly string[]): MemoryRecord {
  return {
    category: "approval_records",
    createdAt: new Date().toISOString(),
    id: `approval:${approval.actionId}`,
    payload: {
      actionId: approval.actionId,
      approverId: approval.approverId,
      auditEntryHash: approval.auditEntryHash,
      decision: approval.decision,
      ...(approval.reason === undefined ? {} : { reason: approval.reason }),
      status: approval.status
    },
    recordIds: uniqueRecordIds([approval.actionId, ...actionRecordIds]),
    scope: approvalMemoryScope(approval.actionId),
    trustLevel: "trusted"
  };
}

function uniqueRecordIds(recordIds: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const recordId of recordIds) {
    unique.add(recordId);
  }
  return [...unique];
}

type R1SourceReadRouteInput =
  | { need: "invoice"; billingDocument: string }
  | { need: "sales-order"; salesOrder: string }
  | { need: "credit-account-dso"; businessPartner: string; creditSegment: string }
  | { need: "credit-exposure"; businessPartner: string }
  | { need: "dispute-case"; disputeCaseId: string }
  | { need: "accrual-cap"; accrualObject: string }
  | { need: "outbound-delivery"; deliveryRef: string }
  | { need: "credit-memo"; billingDocument: string; disputeCaseId?: string }
  | { need: "carrier-damage"; customerId: string; invoiceRef?: string }
  | { need: "payment-history"; customerId: string };

const sapServiceByR1SourceNeed: Partial<Record<R1SourceReadRouteInput["need"], string>> = {
  "accrual-cap": "ZUI_ACCRUALS_MANAGE_0001",
  "credit-account-dso": "ZUI_CREDITACCOUNT_DISPLAY_0001",
  "credit-exposure": "ZUI_CREDITEXPOSURE_DISPLAY_0001",
  "dispute-case": "ZUI_DISPUTECASE_MANAGE_0001",
  invoice: "ZUI_BILLINGDOCUMENTFS_0001",
  "sales-order": "ZAPI_SALES_ORDER_SRV_0001"
};

const r1SourceReadQueryKeysByNeed: Record<R1SourceReadRouteInput["need"], readonly string[]> = {
  "accrual-cap": ["accrualObject"],
  "carrier-damage": ["customerId", "invoiceRef"],
  "credit-account-dso": ["businessPartner", "creditSegment"],
  "credit-exposure": ["businessPartner"],
  "credit-memo": ["billingDocument", "disputeCaseId"],
  "dispute-case": ["disputeCaseId"],
  invoice: ["billingDocument"],
  "outbound-delivery": ["deliveryRef"],
  "payment-history": ["customerId"],
  "sales-order": ["salesOrder"]
};

function buildR1SourceReadRequest(request: Request): R1SourceReadRouteInput {
  assertAllowedR1SourceReadQueryKeys(request);

  switch (request.params.need) {
    case "invoice":
      return { need: "invoice", billingDocument: readRequiredQueryString(request, "billingDocument") };
    case "sales-order":
      return { need: "sales-order", salesOrder: readRequiredQueryString(request, "salesOrder") };
    case "credit-account-dso":
      return {
        need: "credit-account-dso",
        businessPartner: readRequiredQueryString(request, "businessPartner"),
        creditSegment: readRequiredQueryString(request, "creditSegment")
      };
    case "credit-exposure":
      return { need: "credit-exposure", businessPartner: readRequiredQueryString(request, "businessPartner") };
    case "dispute-case":
      return { need: "dispute-case", disputeCaseId: readRequiredQueryString(request, "disputeCaseId") };
    case "accrual-cap":
      return { need: "accrual-cap", accrualObject: readRequiredQueryString(request, "accrualObject") };
    case "outbound-delivery":
      return { need: "outbound-delivery", deliveryRef: readRequiredQueryString(request, "deliveryRef") };
    case "credit-memo": {
      const disputeCaseId = readOptionalQueryString(request, "disputeCaseId");
      return {
        need: "credit-memo",
        billingDocument: readRequiredQueryString(request, "billingDocument"),
        ...(disputeCaseId === undefined ? {} : { disputeCaseId })
      };
    }
    case "carrier-damage": {
      const invoiceRef = readOptionalQueryString(request, "invoiceRef");
      return {
        need: "carrier-damage",
        customerId: readRequiredQueryString(request, "customerId"),
        ...(invoiceRef === undefined ? {} : { invoiceRef })
      };
    }
    case "payment-history":
      return { need: "payment-history", customerId: readRequiredQueryString(request, "customerId") };
    default:
      throw new Error("Invalid R1 source read request.");
  }
}

async function buildR1SourceReadServiceContext(
  input: R1SourceReadRouteInput,
  env: RuntimeEnv,
  sapFetcher: typeof fetch | undefined
): Promise<ServiceInvocationContext> {
  const serviceName = sapServiceByR1SourceNeed[input.need];
  if (serviceName === undefined) {
    return {};
  }

  const connection = createSapODataConnectionFromEnv(env);
  if (connection === undefined) {
    return {};
  }

  const metadata = await fetchSapR1Metadata(connection, serviceName, sapFetcher);
  return {
    r1SapMetadata: { [serviceName]: metadata },
    r1SapReadAdapter: new SapODataReadOnlyAdapter(connection)
  };
}

async function fetchSapR1Metadata(
  connection: SapODataConnection,
  serviceName: string,
  sapFetcher: typeof fetch | undefined
): Promise<ReturnType<typeof parseSapODataMetadata>> {
  const client = new SapODataReadOnlyClient(connection, sapFetcher);
  return parseSapODataMetadata(await client.fetchMetadata(serviceName));
}

function assertAllowedR1SourceReadQueryKeys(request: Request): void {
  const need = request.params.need;
  if (!isR1SourceReadNeed(need)) {
    throw new Error("Invalid R1 source read request.");
  }

  const allowed = r1SourceReadQueryKeysByNeed[need];
  for (const key of Object.keys(request.query)) {
    if (!allowed.includes(key)) {
      throw new Error("Invalid R1 source read request.");
    }
  }
}

function isR1SourceReadNeed(value: unknown): value is R1SourceReadRouteInput["need"] {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(r1SourceReadQueryKeysByNeed, value);
}

function readRequiredQueryString(request: Request, name: string): string {
  const value = readOptionalQueryString(request, name);
  if (value === undefined) {
    throw new Error("Invalid R1 source read request.");
  }

  return value;
}

function readOptionalQueryString(request: Request, name: string): string | undefined {
  const value = request.query[name];
  if (Array.isArray(value)) {
    throw new Error("Invalid R1 source read request.");
  }

  const raw = value;
  if (typeof raw !== "string") {
    return undefined;
  }

  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function isInvalidR1SourceReadRequest(error: unknown): boolean {
  return error instanceof z.ZodError || (error instanceof Error && error.message === "Invalid R1 source read request.");
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

function collectForensicsTraceRecordIds(events: readonly ForensicsSseEvent[]): string[] {
  return [
    ...new Set(
      events.flatMap((event) => ("recordIds" in event.payload && Array.isArray(event.payload.recordIds) ? event.payload.recordIds : []))
    )
  ];
}

function readConfiguredEnvNames(env: RuntimeEnv): string[] {
  return Object.entries(env)
    .filter(([, value]) => value !== undefined && value.trim().length > 0)
    .map(([key]) => key);
}
