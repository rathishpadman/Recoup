import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Server } from "node:http";
import { pathToFileURL } from "node:url";
import express, { type Express, type Request, type Response } from "express";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { runtimeModels, runtimeOpenAiServiceTier } from "../../config/models.js";
import { day1GovernedConfigSeed, sha256CanonicalJson, type GovernedConfigValues } from "../../config/governed.js";
import { readCanaryLines, readReconciliationMode } from "../../config/reconciliationRollout.js";
import { runForensicsInvestigation, type ForensicsReconciliationOptions } from "../agents/forensics.js";
import {
  runOpenAICreditRiskAgentStream,
  streamLiveForensicsTraceEvents,
  type LiveForensicsStreamRunner
} from "../agents/liveForensicsStream.js";
import { loadLocalRuntimeEnvFiles, type RuntimeEnv } from "../../config/env.js";
import {
  cockpitHumanProxyBodyHashHeader,
  cockpitHumanProxyIssuedAtFreshnessWindowMs,
  cockpitHumanProxyIssuedAtHeader,
  cockpitHumanProxyNonceHeader,
  cockpitHumanProxyProofHeader,
  cockpitHumanProxyRoleHeader,
  cockpitHumanPrincipalByDemoRole,
  defaultCockpitHumanPrincipal,
  verifyCockpitHumanProxyPrincipal,
  type CockpitDemoRole,
  type CockpitHumanProxyPurpose
} from "../../config/cockpitHumanPrincipals.js";
import { loadAgentOperationsSnapshot } from "./agentOperationsReadModel.js";
import {
  isAllowedInboundSender,
  parseInboundRequest
} from "../adapters/inboundRemittance.js";
import { acceptInboundRemittance } from "./remittanceIntake.js";
import { createDemoAttachmentSecurityService } from "./attachmentSecurity.js";
import { startCashApplicationRun } from "./cashApplicationRun.js";
import { isCashCapabilityEnabled } from "../../config/cashRollout.js";
import { createSupabaseCashReceiptSource } from "../adapters/supabaseCashReceipt.js";
import { persistRemittanceEvidence } from "../adapters/remittanceEvidenceStore.js";
import { resolveWorkflowRepository } from "./workflowRepositoryFactory.js";
import type { WorkflowRepository } from "./workflowRepository.js";
import { createRuntimeMemoryStore } from "../memory/runtime.js";
import { createInMemoryStore } from "../memory/store.js";
import type { MemoryRecord } from "../memory/schema.js";
import {
  buildMayaQueryMemoryRecallContext,
  readMayaCaseRecallMemories,
  writeMayaCaseRecallMemory,
  writeMayaQueryScopeMemory,
  type MayaQueryMemoryRecallContext
} from "../memory/session.js";
import {
  createSupabaseGovernedConfigRepositoryFromEnv,
  createSupabaseMemoryRepositoryFromEnv,
  createSupabaseReadModelRepositoryFromEnv,
  createSupabaseReleaseOwnerInputRepositoryFromEnv,
  createSupabaseSourceHealthSnapshotRepositoryFromEnv,
  createSupabaseTableReadinessProbeFromEnv,
  type SupabaseMemoryFetch,
  type SupabaseReadModelRecord
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
import { createLegacySupabaseSettlementRunReaderFromEnv } from "../adapters/legacySupabaseSettlementRunReader.js";
import type { SourcePort } from "../adapters/source.js";
import {
  createSupabaseSettlementRunReaderFromEnv,
  loadDealOptimizerSourceRows,
  loadCreditRiskRows,
  MissingCreditNegotiationSourceError,
  MissingCreditRiskSourceError,
  createSupabaseRiskObservationSnapshotReaderFromEnv,
  createSupabaseSapEvidenceReaderFromEnv,
  createSupabaseSyntheticSourceReaderFromEnv,
  sourcePortFromSupabaseSnapshots,
  type SupabaseRiskObservationSourceConfig
} from "../adapters/supabaseSyntheticSource.js";
import {
  createOpenAiVectorStoreEvidenceReader,
  type OpenAiVectorStoreFetch
} from "../adapters/openAiVectorStore.js";
import { createOpenAiCreditNegotiationPolicyRationaleReader } from "../adapters/openAiPolicyVectorStore.js";
import { SyntheticSource } from "../adapters/synthetic.js";
import { buildRunBudgetMiddlewareStatus } from "../middleware/budgets.js";
import { createRunBudgetController, type RunControlConfig, type RunControlStatus } from "./conductor.js";
import type { DecisionConfidenceThreshold, ReleaseOwnerInputSnapshot } from "../../config/releaseOwnerInputs.js";
import { createJsonBodyErrorHandler } from "../middleware/errors.js";
import { createCorrelationIdMiddleware, readRequestCorrelationId, recoupCorrelationIdHeader } from "../middleware/logging.js";
import { assertApprovalReasonSafe } from "./approvals.js";
import { handleRealtimeToolCall, requestRealtimeClientSecret } from "./realtimeSession.js";
import {
  ForensicsQueryLineNotFoundError,
  ForensicsWorkspaceSettlementRunMismatchError,
  runForensicsWorkspaceQuerySessionWithLiveAgents,
  runForensicsQuerySessionWithLiveAgents,
  type ForensicsQuerySessionResponse
} from "./forensicsQuerySession.js";
import { buildOpenAiUsageReceiptPayload } from "./openAiUsageReceipt.js";
import { buildDealOptimizerModel, type DealOptimizerModel } from "./dealOptimizer.js";
import {
  buildForensicsReadModelFreshnessRecordIds,
  isForensicsReadModelFresh
} from "./evidenceFreshness.js";
import { buildCreditSimulationModel, CreditSimulationMissingSourceError } from "./creditSimulationModel.js";
import {
  assertR1SourceReadInput,
  buildOpenAiVectorStoreEvidenceSource,
  buildPreparedApprovalAuditEntry,
  buildSupabaseServiceSapEvidenceSource,
  buildSupabaseServiceSyntheticEvidenceSource,
  invokeServiceTool,
  prepareApprovalDecision,
  type PreparedApprovalDecision,
  type ServiceInvocationContext,
  type ServiceSyntheticEvidenceConnectorName
} from "./serviceLayer.js";
import {
  buildAgentGraphModel,
  buildCfoSummaryCockpitModel,
  buildConnectorReadinessModel,
  buildCreditCockpitModel,
  buildForensicsCockpitModel,
  buildForensicsWorkItemDetailCockpitModel,
  buildMemorySummaryModel,
  buildLoginModel,
  buildTraceModel,
  ForensicsWorkItemNotFoundError,
  type ApprovalRecordSourceMetadata,
  type ForensicsSseEvent
} from "./cockpitModel.js";
import {
  buildCreditRiskReviewModel,
  type ApprovedCreditRecommendationRow,
  type CreditNegotiationApprovalAction,
  type CreditRiskApprovalReceipt,
  type CreditRiskRows
} from "./creditRiskModel.js";
import {
  buildCreditRecommendationCores,
  creditRecommendationActionIdPrefix,
  creditRecommendationScenarioId,
  findCreditAccountForLine,
  parseCreditRecommendationActionId
} from "./creditRecommendation.js";
import {
  runCreditRiskQuerySessionWithLiveAgents,
  type CreditRiskQuerySessionResponse
} from "./creditRiskQuerySession.js";
import {
  buildSourceHealthResultsFromSnapshots,
  type SourceHealthResult,
  type SourceHealthSnapshotStore
} from "./sourceHealth.js";
import { createSupabaseEvalsFinopsRepositoryFromEnv, type EvalsFinopsRepository } from "./evalsFinopsRepository.js";
import { buildEvalFinopsCockpitModel, buildPersonaFinopsCockpitModel } from "./evalsFinopsModel.js";
import {
  createToolDataSchemaProbeLoader,
  startSourceHealthPoller,
  type SourceHealthPollerHandle,
  type SourceHealthPollerOptions
} from "./sourceHealthPoller.js";
import {
  startMcpHttpServer,
  type StartMcpHttpServerInput,
  type StartedMcpHttpServer
} from "../mcp/server.js";
import { retrieveBureau } from "../tools/retrieval/bureau.js";
import { retrieveDocs, type EvidenceDocument } from "../tools/retrieval/docs.js";
import { retrieveTpm } from "../tools/retrieval/tpm.js";
import type { DeductionLine } from "../types/entities.js";

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
const demoLifecycleResetRequestSchema = z
  .object({
    actionId: z.string().min(1),
    reason: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() || undefined : value),
      z.string().min(8).max(500).optional()
    )
  })
  .strict()
  .superRefine((value, context) => {
    if (value.reason !== undefined) {
      try {
        assertApprovalReasonSafe(value.reason);
      } catch (error) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: error instanceof Error ? error.message : "Reset reason rejected.",
          path: ["reason"]
        });
      }
    }
  });

const realtimeSelectedClientSecretRequestSchema = z
  .object({
    question: z.string().trim().min(1, "Realtime query question is required.").max(500, "Realtime query question is too long."),
    recordIds: z.array(z.string().trim().min(1)).min(1, "Realtime query selected recordIds are required."),
    selectedLineId: z.string().trim().min(1, "Realtime query selectedLineId is required.")
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.recordIds.includes(value.selectedLineId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Realtime query selected evidence scope must include selectedLineId in recordIds.",
        path: ["recordIds"]
      });
    }
  });
const realtimeTranscriptionClientSecretRequestSchema = z
  .object({
    mode: z.literal("transcription_only"),
    question: z.string().trim().min(1, "Realtime transcription prompt is required.").max(500, "Realtime transcription prompt is too long.")
  })
  .strict();
const forensicsSelectedQueryRequestSchema = z
  .object({
    question: z.string().trim().min(1, "Forensics query question is required.").max(500, "Forensics query question is too long."),
    recordIds: z.array(z.string().trim().min(1)).min(1, "Forensics query selected recordIds are required."),
    selectedLineId: z.string().trim().min(1, "Forensics query selectedLineId is required.")
  })
  .strict();
const forensicsWorkspaceQueryRequestSchema = z
  .object({
    question: z.string().trim().min(1, "Forensics query question is required.").max(500, "Forensics query question is too long."),
    scope: z.literal("workspace"),
    settlementRunId: z.string().trim().min(1, "Forensics query settlementRunId is required.")
  })
  .strict();
const forensicsQueryRequestSchema = z.union([forensicsWorkspaceQueryRequestSchema, forensicsSelectedQueryRequestSchema]);
type ForensicsSelectedQueryRequest = z.infer<typeof forensicsSelectedQueryRequestSchema>;
const creditRiskQueryRequestSchema = z
  .object({
    accountId: z.string().trim().min(1, "Credit risk query accountId is required."),
    question: z.string().trim().min(1, "Credit risk query question is required.").max(500, "Credit risk query question is too long."),
    recordIds: z.array(z.string().trim().min(1)).min(1, "Credit risk query selected recordIds are required.")
  })
  .strict();
const personaFinopsPeriodSchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true })
  })
  .superRefine((period, context) => {
    const from = new Date(period.from).valueOf();
    const to = new Date(period.to).valueOf();
    if (from >= to) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Persona FinOps from must precede to.", path: ["from"] });
    }
    if (to - from > 366 * 24 * 60 * 60 * 1000) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Persona FinOps period cannot exceed 366 days.", path: ["to"] });
    }
  });
const partialHoldSimulationCriterionSchema = z.enum([
  "orderValueVsExposure",
  "customerStrategicValue",
  "dsoPaymentDrift",
  "orderMargin",
  "revenueForecast",
  "paymentPattern"
]);
const creditSimulationRequestSchema = z
  .object({
    accountId: z.string().trim().min(1, "Credit simulation accountId is required."),
    scoreOverrides: z.record(partialHoldSimulationCriterionSchema, z.number().finite()).optional(),
    weightOverrides: z.record(partialHoldSimulationCriterionSchema, z.number().finite()).optional()
  })
  .strict();
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
const consumedHumanProxyNonces = new Map<string, number>();
const cockpitRunSessionIdHeader = "x-recoup-session-id";
const defaultCockpitRunSessionId = "cockpit-run";
const safeCockpitRunSessionIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const secretLikeCockpitRunSessionIdPattern = /(?:bearer|secret|token|api[-_]?key|sk-)/iu;
const safeMayaQueryMemoryRecordIdPattern = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}$/;
const unsafeMayaQueryMemoryRecordIdPattern =
  /(?:@|bearer|secret|token|api[-_]?key|password|client[_-]?secret|sk-|\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b)/iu;
const liveForensicsQueryRequiredBasis = "OpenAI Agents SDK live trace required for Maya query answers." as const;
// Runtime freshness only; this is not a business threshold or policy constant.
const defaultForensicsSourceContextCacheTtlMs = 30_000;
const defaultCreditReadModelRefreshTimeoutMs = 40_000;
const mayaForensicsReadModelKey = "maya:forensics:v1";
const mayaConnectorsReadModelKey = "maya:connectors:v1";
export const davidCreditRiskReadModelKey = "david:credit-risk-review:v1";
const readModelCacheHeader = "x-recoup-read-model-cache";
const readModelReceiptHashHeader = "x-recoup-read-model-receipt-hash";
const readModelSourceHashHeader = "x-recoup-read-model-source-hash";
const cockpitRateLimitMaxRequestsEnv = "RECOUP_COCKPIT_RATE_LIMIT_MAX_REQUESTS";
const cockpitRateLimitWindowMsEnv = "RECOUP_COCKPIT_RATE_LIMIT_WINDOW_MS";
const forensicsSourceContextTableIdentity = [
  "recoup_customers",
  "recoup_deduction_claims",
  "recoup_reconciliation_receipts",
  "recoup_src_bureau",
  "recoup_src_docs",
  "recoup_src_sap",
  "recoup_src_tpm"
] as const;
type RecoupDataMode = "fixture" | "real-backend";
type CockpitRateLimitedRoute =
  | "GET /run"
  | "POST /admin/demo-reset"
  | "POST /approval"
  | "POST /credit/query"
  | "POST /credit/recommendations/:actionId/acknowledge"
  | "POST /credit/v2/refresh"
  | "POST /credit/v2/simulate"
  | "POST /forensics/refresh"
  | "POST /forensics/query"
  | "POST /run";
const cockpitApiRoutes = [
  "GET /",
  "GET /healthz",
  "GET /forensics",
  "GET /forensics/work-items/:lineId",
  "GET /login",
  "GET /credit",
  "GET /credit/v2",
  "GET /credit/v2/orders/:orderId/deals",
  "GET /cfo",
  "GET /trace",
  "GET /memory",
  "GET /agents",
  "GET /connectors",
  "GET /evals-finops",
  "GET /persona-finops",
  "GET /sources/r1/:need",
  "GET /run",
  "POST /run",
  "POST /admin/demo-reset",
  "POST /approval",
  "POST /credit/query",
  "POST /credit/recommendations/:actionId/acknowledge",
  "POST /credit/v2/refresh",
  "POST /credit/v2/simulate",
  "POST /forensics/refresh",
  "POST /forensics/query",
  "POST /query/realtime-client-secret",
  "POST /query/realtime-tool"
] as const;

export interface CockpitApiOptions {
  creditRiskStreamRunner?: LiveForensicsStreamRunner;
  env?: RuntimeEnv;
  forensicsStreamRunner?: LiveForensicsStreamRunner;
  memoryFetcher?: SupabaseMemoryFetch;
  mcpHealthFetcher?: typeof fetch;
  openAiVectorStoreFetcher?: OpenAiVectorStoreFetch;
  realtimeFetcher?: typeof fetch;
  sapFetcher?: typeof fetch;
  /** Test seam. Production posts the rehearsal receipt straight to Supabase. */
  cashReceiptWriteFetcher?: typeof fetch;
  /** Test seam. Production resolves the repository from the environment. */
  workflowRepository?: WorkflowRepository;
}

export type CockpitSourceHealthPollerFactory = (options: SourceHealthPollerOptions) => SourceHealthPollerHandle;
export type CockpitMcpServerStarter = (input?: StartMcpHttpServerInput) => Promise<StartedMcpHttpServer>;

export interface CockpitApiRuntimeOptions extends CockpitApiOptions {
  onError?: (error: unknown) => void;
  port?: number;
  sourceHealthPollerFactory?: CockpitSourceHealthPollerFactory;
  startMcpServer?: CockpitMcpServerStarter;
}

export interface StartedCockpitApiRuntime {
  baseUrl: string;
  close(): Promise<void>;
  mcpServer?: StartedMcpHttpServer;
  runtimeEnv: RuntimeEnv;
  server: Server;
  sourceHealthPoller?: SourceHealthPollerHandle;
}

interface LoadedRunControl {
  config: RunControlConfig;
  decisionConfidenceThreshold?: DecisionConfidenceThreshold;
  status: RunControlStatus;
}

interface ForensicsSourceContextCacheKey {
  dataMode: RecoupDataMode;
  governedConfigHash: string;
  governedSeed: 42;
  openAiEvidenceVectorStoreIdentity: string;
  reconciliationCanaryLines: string[];
  reconciliationMode: string;
  riskObservationRequired: boolean;
  sourceTableIdentity: typeof forensicsSourceContextTableIdentity;
  supabaseSourceIdentity: string;
}

interface ForensicsRunContext {
  reconciliation?: ForensicsReconciliationOptions | undefined;
  serviceContext: ServiceInvocationContext;
  source: SourcePort;
}

type GovernedForensicsRunContext = ForensicsRunContext & { governedConfig: GovernedConfigValues };

type MayaSelectedQueryScope =
  | { status: "blocked" }
  | {
      hasOutOfScopeSubmittedRecordId: boolean;
      normalizedRequest: ForensicsSelectedQueryRequest;
      status: "ready";
      trustedEvidencePackRecordIds: string[];
    };

interface CachedForensicsRunContext extends ForensicsRunContext {
  cachedAtMs: number;
  key: ForensicsSourceContextCacheKey;
}

type CockpitRateLimitConfig =
  | { status: "disabled" }
  | { status: "enabled"; maxRequests: number; windowMs: number }
  | { status: "invalid" };

interface CockpitRateLimitBucket {
  count: number;
  resetAtMs: number;
}

export function createCockpitApi(options: CockpitApiOptions = {}): Express {
  const CashDemoResetSchema = z.object({ confirm: z.literal("reset-cash-demo-data") }).strict();

  const RehearsalCashReceiptSchema = z
    .object({
      amountReceived: z.string().min(1),
      currency: z.string().min(1),
      customerReference: z.string().min(1),
      legalEntityReference: z.string().min(1),
      paymentReference: z.string().min(1),
      settlementStatus: z.enum(["settled", "pending", "reversed", "unknown"])
    })
    .passthrough();

  const app = express();
  const runtimeEnv = options.env ?? process.env;
  const dataMode = readRecoupDataMode(runtimeEnv);
  const allowedOrigins = readAllowedOrigins(runtimeEnv);
  const forensicsSourceContextCacheTtlMs = readForensicsSourceContextCacheTtlMs(runtimeEnv);
  const readModelRepository = createSupabaseReadModelRepositoryFromEnv(runtimeEnv, options.memoryFetcher);
  const rateLimitConfig = readCockpitRateLimitConfig(runtimeEnv);
  const rateLimitBuckets = new Map<string, CockpitRateLimitBucket>();
  const rateLimitAuditEndpoint = (route: CockpitRateLimitedRoute) =>
    createCockpitRateLimitMiddleware(route, rateLimitConfig, rateLimitBuckets, runtimeEnv);
  let cachedForensicsRunContext: CachedForensicsRunContext | undefined;
  let cachedForensicsRunContextGeneration = 0;
  let latestForensicsRefreshRequestId = 0;
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
      `content-type,${humanPrincipalHeader},${humanTokenHeader},${recoupCorrelationIdHeader},${cockpitRunSessionIdHeader}`
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
      dataMode,
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

  app.get("/forensics", async (request, response) => {
    if (!requireProtectedReadAuth(request, response)) {
      return;
    }

    const cachedReadModel = await loadReadModelRecord(mayaForensicsReadModelKey, "forensics-analyst");
    const runContext = await loadRequiredForensicsRunContext(request, response, { bypassCache: true });
    if (runContext === undefined) {
      return;
    }
    const { governedConfig, reconciliation, serviceContext, source } = runContext;
    const approvalRecordsSnapshot = await loadApprovalRecordsOrFailClosed(request, response, runtimeEnv, options.memoryFetcher);
    if (approvalRecordsSnapshot === undefined) {
      return;
    }
    const sourceRecordIds = buildForensicsReadModelFreshnessRecordIds({
      approvalRecords: approvalRecordsSnapshot.records,
      canaryLines: [...readCanaryLines(runtimeEnv)].sort(),
      reconciliation,
      reconciliationMode: readReconciliationMode(runtimeEnv),
      serviceContext,
      source,
      sourceTableIdentity: forensicsSourceContextTableIdentity
    });
    if (cachedReadModel !== undefined && isForensicsReadModelFresh(cachedReadModel.sourceRecordIds, sourceRecordIds)) {
      response.setHeader(readModelCacheHeader, "hit");
      setForensicsReadModelHashHeaders(response, sourceRecordIds);
      response.json(cachedReadModel.payload);
      return;
    }

    const model = buildForensicsCockpitModel({
      approvalRecordSource: approvalRecordsSnapshot.source,
      approvalRecords: approvalRecordsSnapshot.records,
      governedConfig,
      reconciliation,
      serviceContext,
      settlementSource: source
    });
    await publishReadModel(mayaForensicsReadModelKey, "forensics-analyst", model, { sourceRecordIds });
    response.setHeader(readModelCacheHeader, cachedReadModel === undefined ? "miss" : "stale");
    setForensicsReadModelHashHeaders(response, sourceRecordIds);
    response.json(model);
  });

  app.get("/forensics/work-items/:lineId", async (request, response) => {
    if (!requireProtectedReadAuth(request, response)) {
      return;
    }

    const lineId = request.params.lineId.trim();
    const runContext = await loadRequiredForensicsRunContext(request, response);
    if (runContext === undefined) {
      return;
    }
    const { governedConfig, reconciliation, serviceContext, source } = runContext;
    const approvalRecordsSnapshot = await loadApprovalRecordsOrFailClosed(request, response, runtimeEnv, options.memoryFetcher);
    if (approvalRecordsSnapshot === undefined) {
      return;
    }
    const creditRiskRows = await loadOptionalCreditRiskRows();

    try {
      response.json(
        buildForensicsWorkItemDetailCockpitModel(
          {
            approvalRecordSource: approvalRecordsSnapshot.source,
            approvalRecords: approvalRecordsSnapshot.records,
            ...(creditRiskRows === undefined ? {} : { creditRiskRows }),
            governedConfig,
            reconciliation,
            serviceContext,
            settlementSource: source
          },
          lineId
        )
      );
    } catch (error) {
      if (error instanceof ForensicsWorkItemNotFoundError) {
        response.status(404).json({
          error: "Forensics work item not found.",
          lineId: error.lineId
        });
        return;
      }

      sendFailClosedJson(request, response, 503, {
        error: "Forensics work item detail is unavailable from governed backend sources.",
        missingSource: "supabase-forensics-work-item-detail"
      });
    }
  });

  app.post("/forensics/refresh", rateLimitAuditEndpoint("POST /forensics/refresh"), async (request, response) => {
    response.setHeader("cache-control", "no-store");
    if (!requireProtectedReadAuth(request, response)) {
      return;
    }

    const runContext = await loadRequiredForensicsRunContext(request, response, { bypassCache: true });
    if (runContext === undefined) {
      return;
    }
    const { governedConfig, reconciliation, serviceContext, source } = runContext;
    const approvalRecordsSnapshot = await loadApprovalRecordsOrFailClosed(request, response, runtimeEnv, options.memoryFetcher);
    if (approvalRecordsSnapshot === undefined) {
      return;
    }

    const model = buildForensicsCockpitModel({
      approvalRecordSource: approvalRecordsSnapshot.source,
      approvalRecords: approvalRecordsSnapshot.records,
      governedConfig,
      reconciliation,
      serviceContext,
      settlementSource: source
    });
    const sourceRecordIds = buildForensicsReadModelFreshnessRecordIds({
      approvalRecords: approvalRecordsSnapshot.records,
      canaryLines: [...readCanaryLines(runtimeEnv)].sort(),
      reconciliation,
      reconciliationMode: readReconciliationMode(runtimeEnv),
      serviceContext,
      source,
      sourceTableIdentity: forensicsSourceContextTableIdentity
    });
    await publishReadModel(mayaForensicsReadModelKey, "forensics-analyst", model, { sourceRecordIds });
    response.setHeader(readModelCacheHeader, "refresh");
    setForensicsReadModelHashHeaders(response, sourceRecordIds);
    response.json(model);
  });

  app.get("/login", (_request, response) => {
    response.json(buildLoginModel());
  });

  app.get("/credit", async (_request, response) => {
    const governedConfig = await loadRequiredGovernedConfig(_request, response);
    if (governedConfig === undefined) {
      return;
    }

    const source = await loadRequiredSupabaseSource(_request, response, governedConfig, { riskObservationRequired: true });
    if (source === undefined) {
      return;
    }

    response.json(buildCreditCockpitModel({ governedConfig, riskObservationSource: source, settlementSource: source }));
  });

  app.get("/credit/v2", async (request, response) => {
    const model = await loadRequiredCreditRiskReviewModel(request, response);
    if (model === undefined) {
      return;
    }

    response.json(model);
  });

  let davidCreditReadModelRefreshTail: Promise<void> = Promise.resolve();
  app.post("/credit/v2/refresh", rateLimitAuditEndpoint("POST /credit/v2/refresh"), async (request, response) => {
    response.setHeader("cache-control", "no-store");
    if (
      !requireProtectedReadAuth(request, response, {
        allowProxyDemoRoles: ["david"],
        proxyPurpose: "read"
      })
    ) {
      return;
    }

    const previousRefresh = davidCreditReadModelRefreshTail;
    let releaseRefresh: (() => void) | undefined;
    davidCreditReadModelRefreshTail = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    await previousRefresh.catch(() => undefined);

    const refreshStartedAtIso = new Date().toISOString();
    const refreshLeaseController = new AbortController();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const refreshOperation = (async () => {
        const model = await loadRequiredCreditRiskReviewModel(request, response, { dealOptimizerRequired: true });
        if (model === undefined || refreshLeaseController.signal.aborted) {
          return;
        }
        const published = await publishReadModel(davidCreditRiskReadModelKey, "credit-risk-review", model, {
          persona: "david",
          sourceRefreshedAt: refreshStartedAtIso
        });
        if (isAbortSignalAborted(refreshLeaseController.signal)) {
          return;
        }
        if (!published) {
          sendFailClosedJson(request, response, 503, {
            error: "David credit read-model cache is unavailable from governed backend sources.",
            missingSource: "recoup-cockpit-read-models"
          });
          return;
        }

        response.setHeader(readModelCacheHeader, "refresh");
        response.json(model);
      })();
      const timeoutMs = resolveCreditReadModelRefreshTimeoutMs(runtimeEnv.RECOUP_CREDIT_READ_MODEL_REFRESH_TIMEOUT_MS);
      const refreshTimeout = new Promise<void>((resolve) => {
        refreshTimer = setTimeout(() => {
          refreshLeaseController.abort();
          sendFailClosedJson(request, response, 504, {
            error: "David credit read-model refresh exceeded its governed lease.",
            missingSource: "credit-read-model-refresh-timeout"
          });
          resolve();
        }, timeoutMs);
      });

      await Promise.race([refreshOperation, refreshTimeout]);
    } finally {
      if (refreshTimer !== undefined) {
        clearTimeout(refreshTimer);
      }
      releaseRefresh?.();
    }
  });

  app.post("/credit/v2/simulate", rateLimitAuditEndpoint("POST /credit/v2/simulate"), async (request, response) => {
    if (
      !requireProtectedReadAuth(request, response, {
        allowProxyDemoRoles: ["david"],
        proxyPurpose: "read"
      })
    ) {
      return;
    }

    const parsedRequest = creditSimulationRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      response.status(400).json({ error: "Invalid credit simulation request.", issues: parsedRequest.error.issues });
      return;
    }

    const rows = await loadRequiredCreditRiskRows(request, response);
    if (rows === undefined) {
      return;
    }

    try {
      response.setHeader("cache-control", "no-store");
      response.json(buildCreditSimulationModel(parsedRequest.data, rows));
    } catch (error) {
      if (error instanceof CreditSimulationMissingSourceError) {
        sendFailClosedJson(request, response, 503, {
          error: "David credit simulation is unavailable from governed backend sources.",
          missingSource: error.missingSource
        });
        return;
      }

      throw error;
    }
  });

  app.get("/credit/v2/orders/:orderId/deals", async (request, response) => {
    if (
      !requireProtectedReadAuth(request, response, {
        allowProxyDemoRoles: ["david"],
        proxyPurpose: "read"
      })
    ) {
      return;
    }

    const orderId = request.params.orderId;
    if (orderId.trim().length === 0) {
      response.status(400).json({ error: "Credit deal optimizer orderId is required." });
      return;
    }

    const rows = await loadRequiredCreditRiskRows(request, response);
    if (rows === undefined) {
      return;
    }

    const dealRows = await loadRequiredDealOptimizerRows(request, response);
    if (dealRows === undefined) {
      return;
    }

    try {
      const model = buildDealOptimizerModel({
        creditRiskRows: rows,
        orderId,
        policyRows: dealRows.policyRows,
        seed: 42,
        simRows: dealRows.simRows
      });
      await persistCreditDealScenarios(model);
      response.setHeader("cache-control", "no-store");
      response.json(model);
    } catch {
      sendFailClosedJson(request, response, 503, {
        error: "David deal optimizer is unavailable from governed backend sources.",
        missingSource: "credit-deal-optimizer"
      });
    }
  });

  app.post("/credit/query", rateLimitAuditEndpoint("POST /credit/query"), async (request, response) => {
    if (
      !requireProtectedReadAuth(request, response, {
        allowProxyDemoRoles: ["david"],
        proxyPurpose: "realtime"
      })
    ) {
      return;
    }

    const parsedRequest = creditRiskQueryRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      response.status(400).json({ error: "Invalid credit risk query request.", issues: parsedRequest.error.issues });
      return;
    }

    const rows = await loadRequiredCreditRiskRows(request, response);
    if (rows === undefined) {
      return;
    }

    const approvalRecordsSnapshot = await loadApprovalRecordsOrFailClosed(request, response, runtimeEnv, options.memoryFetcher);
    if (approvalRecordsSnapshot === undefined) {
      return;
    }
    const dealOptimizerRows = await loadOptionalDealOptimizerRows();

    const runControl = await loadRequiredRunControl(request, response);
    if (runControl === undefined) {
      return;
    }
    const runBudget = createRunBudgetController(runControl.config);
    runBudget.recordStep({ phase: "query" });

    try {
      const model = buildCreditRiskReviewModel({
        ...rows,
        approvalReceipts: buildCreditRiskApprovalReceipts(approvalRecordsSnapshot.records),
        approvedCreditRecommendations: buildApprovedCreditRecommendationRows(approvalRecordsSnapshot.records, rows),
        ...(dealOptimizerRows === undefined
          ? {}
          : {
              negotiationOrders: dealOptimizerRows.simRows.orders.map((order) => ({
                accountId: order.accountId,
                orderAmount: order.orderAmount,
                orderId: order.orderId,
                sourceRecordIds: [...order.sourceRecordIds]
              }))
            })
      });
      const runner =
        options.creditRiskStreamRunner ??
        ((liveRequest) => runOpenAICreditRiskAgentStream(liveRequest, undefined, { env: runtimeEnv }));
      const policyRationaleReader = createOptionalCreditNegotiationPolicyRationaleReader(runtimeEnv, options.openAiVectorStoreFetcher);
      const queryResponse = await runCreditRiskQuerySessionWithLiveAgents({
        accountId: parsedRequest.data.accountId,
        liveAgentTrace: {
          env: runtimeEnv,
          maxTurns: runControl.config.phases.query.stepBudget,
          onRetry() {
            runBudget.recordRetry({ phase: "query" });
          },
          onTokenUsage(tokens: number) {
            runBudget.recordTokenUsage({ phase: "query", tokens });
          },
          retryCap: runControl.config.phases.query.retryCap,
          runner
        },
        model,
        ...(dealOptimizerRows === undefined ? {} : { dealOptimizerRows }),
        ...(policyRationaleReader === undefined ? {} : { policyRationaleReader }),
        question: parsedRequest.data.question,
        recordIds: parsedRequest.data.recordIds,
        rows
      });

      const correlationId = readRequestCorrelationId(request) ?? randomUUID();
      await awaitBoundedDavidCreditQueryOptionalPersistence({
        correlationId,
        env: runtimeEnv,
        memoryFetcher: options.memoryFetcher,
        queryResponse
      });

      response.setHeader("cache-control", "no-store");
      response.json(queryResponse);
    } catch {
      sendFailClosedJson(request, response, 503, {
        error: "David credit risk live investigation is unavailable from governed backend sources.",
        missingSource: "supabase-credit-risk-query-session"
      });
    }
  });

  app.get("/cfo", async (_request, response) => {
    const governedConfig = await loadRequiredGovernedConfig(_request, response);
    if (governedConfig === undefined) {
      return;
    }

    const runContext = await loadRequiredSupabaseRunContext(_request, response, governedConfig, { riskObservationRequired: true });
    if (runContext === undefined) {
      return;
    }
    const { reconciliation, serviceContext, source } = runContext;

    response.json(
      buildCfoSummaryCockpitModel({
        governedConfig,
        reconciliation,
        riskObservationSource: source,
        serviceContext,
        settlementSource: source
      })
    );
  });

  app.get("/trace", async (_request, response) => {
    const governedConfig = await loadRequiredGovernedConfig(_request, response);
    if (governedConfig === undefined) {
      return;
    }

    const source = await loadRequiredSupabaseSource(_request, response, governedConfig, { riskObservationRequired: true });
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

  /**
   * The Agent Operations snapshot. The gate lives in the loader, so this route
   * asks for the snapshot and returns whatever it is given: below the exposing
   * stage that is the empty snapshot, and the route cannot accidentally leak
   * rows by forgetting a check of its own.
   */
  /**
   * Inbound remittance acceptance.
   *
   * Nothing deployed could start a cash run before this: every caller of the
   * intake and the run lived in tests. The order of the gates is the security
   * property — capability, then shared secret, then sender, then recipient,
   * then scan, then map — and each refuses on its own.
   */
  const inboundSeenEventKeys = new Set<string>();

  app.post("/inbound/remittance", async (request, response) => {
    // Off by stage or by kill switch means the route does not exist at all.
    if (!isCashCapabilityEnabled(runtimeEnv, "inbound_acceptance")) {
      response.status(404).json({ error: "Inbound acceptance is not enabled." });
      return;
    }

    const rawBody = (request as express.Request & { rawBody?: string }).rawBody ?? "";
    const parsed = parseInboundRequest({
      env: runtimeEnv,
      rawBody,
      headers: request.headers as Record<string, string | undefined>
    });

    if (!parsed.ok) {
      const status = parsed.reason === "signature_invalid" ? 401 : 422;
      response.status(status).json({ error: "Inbound rejected.", reason: parsed.reason });
      return;
    }

    if (!isAllowedInboundSender(parsed.message.sender, runtimeEnv)) {
      response.status(403).json({ error: "Inbound rejected.", reason: "sender_not_allowed" });
      return;
    }

    const approvedRecipient = runtimeEnv.RECOUP_INBOUND_APPROVED_RECIPIENT?.trim() ?? "";
    const scanner = createDemoAttachmentSecurityService({
      attachments: new Map([[parsed.message.attachmentRef, parsed.attachment]])
    });

    const intake = await acceptInboundRemittance(parsed.message, {
      env: runtimeEnv,
      scanner,
      attachmentBody: (ref) => (ref === parsed.message.attachmentRef ? parsed.attachment.bytes : undefined),
      approvedRecipient,
      // The transport already proved the shared secret over the raw body.
      verifySignature: () => true,
      seenEventKeys: inboundSeenEventKeys,
      provenanceMode: "live"
    });

    if (intake.status !== "accepted") {
      // The reason is a safe enum, never the attachment or its contents.
      const status = intake.reason === "replay_detected" ? 409 : 422;
      response.status(status).json({ error: "Inbound rejected.", reason: intake.reason });
      return;
    }

    /**
     * REHEARSAL CANDIDATE INVOICES - ASSUMED, NOT AN AR SOURCE.
     *
     * A real open-item source is required for AC-14, because candidates built
     * from the advice can never disagree with the advice and so can never
     * surface a receipt/remittance mismatch. This exists so a rehearsal run has
     * something to match against, and is reachable only behind the rehearsal
     * flag.
     */
    const invoices = intake.advice.lines.map((line) => ({
      invoiceRecordId: line.invoiceReference,
      invoiceReference: line.invoiceReference,
      balance: new Decimal(line.instructedAmount).plus(line.claimedDeductionAmount).toFixed(2),
      currency: intake.advice.currency
    }));

    const supabaseUrl = runtimeEnv.SUPABASE_URL?.replace(/\/$/u, "");
    const supabaseKey = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseConfigured = supabaseUrl !== undefined && supabaseKey !== undefined;

    try {
      /**
       * The canonical evidence set, before the run. A live case references the
       * remittance, so without these rows the run allocates and then fails on
       * the foreign key with the money already worked out.
       */
      if (supabaseConfigured) {
        await persistRemittanceEvidence({
          url: supabaseUrl,
          serviceRoleKey: supabaseKey,
          inboxId: intake.inboxId,
          advice: intake.advice,
          message: parsed.message,
          attachmentContentHash: intake.attachmentContentHash
        });
      }

      /**
       * REHEARSAL SETTLEMENT - NOT AUTHORITATIVE.
       *
       * D-02 is unsigned, so there is no SAP source. The run reads the proxy
       * receipts table that POST /rehearsal/cash-receipt writes. Every row
       * there is stamped rehearsal-proxy, so the allocation stays
       * non-authoritative and AC-01 stays blocked.
       */
      const receiptSource = supabaseConfigured
        ? createSupabaseCashReceiptSource({
            url: supabaseUrl,
            serviceRoleKey: supabaseKey,
            freshnessMaxAgeSeconds: 86_400,
            freshnessPolicyVersion: "rehearsal-freshness-v1"
          })
        : undefined;

      const outcome = await startCashApplicationRun({
        advice: intake.advice,
        invoices,
        env: runtimeEnv,
        repository: options.workflowRepository ?? resolveWorkflowRepository(runtimeEnv).repository,
        ...(receiptSource === undefined ? {} : { source: receiptSource })
      });

      response.status(202).json({
        accepted: true,
        runId: outcome.runId,
        state: outcome.state,
        caseId: outcome.caseId ?? null
      });
    } catch {
      response.status(502).json({ error: "Cash application run could not be started." });
    }
  });

  /**
   * Rehearsal cash receipt, standing in for an SAP posting.
   *
   * D-02 is unsigned: the configured SAP probe returned 401, so no authoritative
   * settlement source exists. This writes the proxy row the CashReceipt adapter
   * reads so a rehearsal run can reach an allocation.
   *
   * It cannot launder itself into authority. source_system is stamped
   * rehearsal-proxy whatever the caller sends, so every allocation citing it
   * still reads as non-authoritative and D-02 stays open.
   */
  app.post("/rehearsal/cash-receipt", async (request, response) => {
    if (!isCashCapabilityEnabled(runtimeEnv, "inbound_acceptance")) {
      response.status(404).json({ error: "Rehearsal receipt posting is not enabled." });
      return;
    }

    const secret = runtimeEnv.RECOUP_INBOUND_SHARED_SECRET?.trim();
    const rawBody = (request as express.Request & { rawBody?: string }).rawBody ?? "";
    const presented = request.headers["x-recoup-signature"];

    if (secret === undefined || secret.length === 0) {
      response.status(404).json({ error: "Rehearsal receipt posting is not configured." });
      return;
    }

    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

    if (typeof presented !== "string" || presented.trim() !== expected) {
      response.status(401).json({ error: "Rehearsal receipt rejected." });
      return;
    }

    const parsed = RehearsalCashReceiptSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(422).json({ error: "Rehearsal receipt is not the expected shape." });
      return;
    }

    // SUPABASE_URL is the name every other adapter reads.
    const supabaseUrl = (runtimeEnv.SUPABASE_URL ?? runtimeEnv.RECOUP_SUPABASE_URL ?? "").replace(/\/$/u, "");
    const serviceRoleKey = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const observedAt = new Date().toISOString();
    const receiptId = `REH-${parsed.data.paymentReference}`;

    const row = {
      receipt_id: receiptId,
      // Never the caller's claim. D-02 is unsigned.
      source_system: "rehearsal-proxy",
      source_record_id: receiptId,
      payment_reference: parsed.data.paymentReference,
      customer_reference: parsed.data.customerReference,
      legal_entity_reference: parsed.data.legalEntityReference,
      amount_received: parsed.data.amountReceived,
      currency: parsed.data.currency,
      settlement_status: parsed.data.settlementStatus,
      value_date: observedAt.slice(0, 10),
      observed_at: observedAt,
      retrieved_at: observedAt,
      freshness_policy_version: "rehearsal-freshness-v1",
      freshness_status: "fresh",
      // Hash of what was actually posted, so the row can be tied back to it.
      source_payload_hash: createHash("sha256").update(rawBody).digest("hex"),
      record_ids: [receiptId]
    };

    const fetcher = options.cashReceiptWriteFetcher ?? fetch;

    try {
      const upstream = await fetcher(`${supabaseUrl}/rest/v1/recoup_cash_receipts`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify(row)
      });

      // The cash tables are append-only: service_role holds INSERT and neither
      // UPDATE nor DELETE. A repeat post therefore collides on the primary key,
      // and saying so is more honest than upserting over history.
      if (upstream.status === 409) {
        response.status(409).json({ error: "A receipt for that payment reference already exists.", receiptId });
        return;
      }

      if (!upstream.ok) {
        response.status(502).json({ error: "Rehearsal receipt could not be written." });
        return;
      }

      response.status(201).json({ written: true, receiptId, sourceSystem: "rehearsal-proxy" });
    } catch {
      response.status(502).json({ error: "Rehearsal receipt could not be written." });
    }
  });

  /**
   * Durable event stream for Agent Operations (FR-OPS-07).
   *
   * The cursor is the persisted event cursor, not a position held in memory,
   * so a client that reconnects — across a restart, a redeploy or a dropped
   * connection — resumes exactly where it stopped. Nothing is replayed twice
   * and nothing is skipped.
   *
   * The stream reports only what the log already holds. It never emits a
   * progress frame of its own, because a reconnecting client would read that
   * as work that happened while it was away.
   *
   * This is separate from read-model invalidation SSE and does not replace it.
   */
  app.get("/agent-operations/events", async (request, response) => {
    if (!isCashCapabilityEnabled(runtimeEnv, "agent_operations_exposure")) {
      response.status(404).json({ error: "Agent operations is not enabled." });
      return;
    }

    // Authenticated before a single header is written, never after.
    if (
      !requireProtectedReadAuth(request, response, {
        allowProxyDemoRoles: ["maya", "cfo"],
        proxyPurpose: "read"
      })
    ) {
      return;
    }

    const repository =
      options.workflowRepository ?? resolveWorkflowRepository(runtimeEnv).repository;

    // A browser resends Last-Event-ID automatically; an explicit cursor wins
    // so a caller can choose where to resume.
    const requestedCursor = typeof request.query.cursor === "string" ? request.query.cursor : undefined;
    const lastEventId = request.headers["last-event-id"];
    let cursor =
      requestedCursor ?? (typeof lastEventId === "string" ? lastEventId : undefined) ?? "0";

    const pollMs = Number(runtimeEnv.RECOUP_AGENT_OPERATIONS_SSE_POLL_MS ?? "1000");

    response.setHeader("content-type", "text/event-stream");
    response.setHeader("cache-control", "no-store");
    response.setHeader("connection", "keep-alive");
    response.flushHeaders();

    // The socket's own state, rather than a flag a closure sets: the compiler
    // cannot see that assignment and narrows the flag to a constant.
    const stillOpen = (): boolean => !response.destroyed && !response.writableEnded;

    while (stillOpen()) {
      let batch;

      try {
        batch = await repository.readEventsSince(cursor);
      } catch {
        // A read failure ends the stream rather than looping silently, so the
        // client reconnects and tries again from the same cursor.
        break;
      }

      for (const event of batch) {
        if (!stillOpen()) {
          break;
        }

        // The id is the cursor the client resumes from.
        response.write(`id: ${event.cursor}
`);
        response.write(`data: ${JSON.stringify(event)}

`);
        cursor = event.cursor;
      }

      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }

    response.end();
  });

  /**
   * Demo reset for the cash slice.
   *
   * MVP affordance: between test cycles the screen has to start empty again.
   * The deletion itself is a SECURITY DEFINER function in Postgres, so the cash
   * tables stay append-only for every other caller and this is the only way
   * out. That keeps the audit guarantee intact everywhere except one named,
   * guarded door.
   *
   * The guards, in order: rehearsal must be on, the caller must be signed, and
   * the request must spell out what it is doing. A stray signed POST must not
   * be able to wipe the slice by accident.
   */
  app.post("/admin/cash-demo-reset", async (request, response) => {
    // A deployment that is not running demo data has no demo reset.
    if (!isCashCapabilityEnabled(runtimeEnv, "inbound_acceptance")) {
      response.status(404).json({ error: "Cash demo reset is not enabled." });
      return;
    }

    /**
     * The same admin auth the approval-lifecycle reset uses. A shared secret
     * was the wrong choice here: it would have to live on the cockpit
     * deployment as well so the browser path could sign, spreading the secret
     * for no gain. A verified admin principal is what actually identifies the
     * person clicking.
     */
    const human = verifyHumanCockpitAuth(request, runtimeEnv, {
      allowProxyDemoRoles: ["cfo", "maya"],
      proxyPurpose: "admin-reset"
    });

    if (!human.success) {
      response.status(401).json({ error: human.error });
      return;
    }

    // Deliberately not a boolean. Typing the phrase is what separates an
    // intentional reset from a stray request that happens to be signed.
    const parsed = CashDemoResetSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(422).json({
        error: 'Confirm with {"confirm":"reset-cash-demo-data"}.'
      });
      return;
    }

    const supabaseUrl = (runtimeEnv.SUPABASE_URL ?? "").replace(/\/$/u, "");
    const serviceRoleKey = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const fetcher = options.cashReceiptWriteFetcher ?? fetch;

    try {
      const upstream = await fetcher(`${supabaseUrl}/rest/v1/rpc/reset_cash_application_demo_data`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`
        },
        body: "{}"
      });

      if (!upstream.ok) {
        // Never report a reset that did not happen.
        response.status(502).json({ error: "Cash demo reset failed." });
        return;
      }

      response.json({ reset: true, deleted: (await upstream.json()) as unknown });
    } catch {
      response.status(502).json({ error: "Cash demo reset failed." });
    }
  });

  app.get("/agent-operations", async (_request, response) => {
    const repository =
      options.workflowRepository ?? resolveWorkflowRepository(runtimeEnv).repository;

    try {
      response.json(await loadAgentOperationsSnapshot({ repository, env: runtimeEnv }));
    } catch {
      // A read failure must not render as "no runs", which would look like a
      // quiet system rather than a broken one.
      response.status(502).json({ error: "Agent operations read model unavailable." });
    }
  });

  app.get("/connectors", async (_request, response) => {
    if (
      !requireProtectedReadAuth(_request, response, {
        allowProxyDemoRoles: ["cfo"],
        proxyPurpose: "read"
      })
    ) {
      return;
    }

    const sourceHealthSnapshotStore = createSupabaseSourceHealthSnapshotRepositoryFromEnv(runtimeEnv, options.memoryFetcher);
    const sourceHealthSnapshots = await loadLatestSourceHealthSnapshots(sourceHealthSnapshotStore);
    const cachedReadModel = await loadReadModelRecord(mayaConnectorsReadModelKey, "connector-readiness");
    if (
      cachedReadModel !== undefined &&
      isConnectorReadModelFreshForSnapshots(cachedReadModel, sourceHealthSnapshots)
    ) {
      response.setHeader(readModelCacheHeader, "hit");
      response.json(cachedReadModel.payload);
      return;
    }

    const availableCredentialEnvNames = readConfiguredEnvNames(runtimeEnv);
    const sourceHealth = await buildSourceHealthResultsFromSnapshots({
      availableCredentialEnvNames,
      env: runtimeEnv,
      fetcher: options.sapFetcher,
      snapshotStore: sourceHealthSnapshots === undefined
        ? sourceHealthSnapshotStore
        : sourceHealthSnapshotStoreFromRows(sourceHealthSnapshots)
    });

    const model = buildConnectorReadinessModel(availableCredentialEnvNames, undefined, sourceHealth);
    await publishReadModel(mayaConnectorsReadModelKey, "connector-readiness", model);
    response.setHeader(readModelCacheHeader, cachedReadModel === undefined ? "miss" : "refresh");
    response.json(model);
  });

  app.get("/evals-finops", async (request, response) => {
    if (
      !requireProtectedReadAuth(request, response, {
        allowProxyDemoRoles: ["cfo"],
        proxyPurpose: "read"
      })
    ) {
      return;
    }

    const repository =
      createSupabaseEvalsFinopsRepositoryFromEnv(runtimeEnv, options.memoryFetcher) ?? createUnavailableEvalsFinopsRepository();

    try {
      response.json(await buildEvalFinopsCockpitModel({ repository }));
    } catch (error) {
      sendFailClosedJson(request, response, 503, {
        error: error instanceof Error ? error.message : "Evals and FinOps governance model is unavailable.",
        missingSource: "supabase-evals-finops"
      });
    }
  });

  app.get("/persona-finops", async (request, response) => {
    const authenticated = verifyHumanCockpitAuth(request, runtimeEnv, {
      allowProxyDemoRoles: ["maya", "david", "cfo"],
      proxyPurpose: "read"
    });
    const role = authenticated.success ? cockpitDemoRoleForPrincipal(authenticated.principal) : undefined;
    if (!authenticated.success) {
      response.status(401).json({ error: authenticated.error });
      return;
    }
    if (role !== "maya" && role !== "david" && role !== "cfo") {
      response.status(403).json({ error: "Persona FinOps requires a Maya, David, or CFO principal." });
      return;
    }

    const period = personaFinopsPeriodSchema.safeParse({ from: request.query["from"], to: request.query["to"] });
    if (!period.success) {
      response.status(400).json({ error: "Invalid persona FinOps period.", issues: period.error.issues });
      return;
    }

    const repository = createSupabaseEvalsFinopsRepositoryFromEnv(runtimeEnv, options.memoryFetcher);
    if (repository === undefined) {
      sendFailClosedJson(request, response, 503, {
        error: "Persona FinOps requires configured Supabase usage and pricing sources.",
        missingSource: "supabase-persona-finops"
      });
      return;
    }
    response.setHeader("cache-control", "no-store");
    response.json(await buildPersonaFinopsCockpitModel({
      period: { fromIso: period.data.from, toIso: period.data.to },
      persona: role,
      repository
    }));
  });

  app.get("/sources/r1/:need", async (request, response) => {
    if (!requireProtectedReadAuth(request, response)) {
      return;
    }

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
    const sessionId = readCockpitRunSessionId(request);
    const runControl = await loadRequiredRunControl(request, response);
    if (runControl === undefined) {
      return;
    }
    const runBudget = createRunBudgetController(runControl.config);

    const runContext = await loadRequiredForensicsRunContext(request, response);
    if (runContext === undefined) {
      return;
    }
    const { governedConfig, reconciliation, serviceContext, source } = runContext;
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
        ...(reconciliation === undefined ? {} : { reconciliation }),
        serviceContext,
        sessionId,
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

  async function loadRequiredRunControl(request: Request, response: Response): Promise<LoadedRunControl | undefined> {
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

    sendFailClosedJson(request, response, 503, {
      error: "Supabase release owner-input recoup_config rows are required for run-control.",
      missingSource: "supabase-release-owner-run-control",
      runControl: status
    });
    return undefined;
  }

  function requireProtectedReadAuth(request: Request, response: Response, options: CockpitHumanAuthOptions = {}): boolean {
    if (dataMode === "fixture") {
      return true;
    }

    const human = verifyHumanCockpitAuth(request, runtimeEnv, options);
    if (human.success) {
      return true;
    }

    response.status(401).json({ error: human.error });
    return false;
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

  async function loadRequiredForensicsRunContext(
    request: Request,
    response: Response,
    sourceOptions: { bypassCache?: boolean; riskObservationRequired?: boolean } = {}
  ): Promise<(ForensicsRunContext & { governedConfig: GovernedConfigValues }) | undefined> {
    if (dataMode === "fixture") {
      return buildFixtureForensicsRunContext();
    }

    const governedConfig = await loadRequiredGovernedConfig(request, response);
    if (governedConfig === undefined) {
      return undefined;
    }

    const runContext = await loadRequiredSupabaseRunContext(request, response, governedConfig, sourceOptions);
    if (runContext === undefined) {
      return undefined;
    }

    return {
      governedConfig,
      ...runContext
    };
  }

  async function loadRequiredGovernedConfig(request: Request, response: Response): Promise<GovernedConfigValues | undefined> {
    const repository = createSupabaseGovernedConfigRepositoryFromEnv(runtimeEnv, options.memoryFetcher);
    if (repository === undefined) {
      sendFailClosedJson(request, response, 503, {
        error: "Supabase recoup_config is required for governed runtime values.",
        missingSource: "supabase-recoup-config"
      });
      return undefined;
    }

    try {
      return (await repository.loadActive()).values;
    } catch {
      sendFailClosedJson(request, response, 503, {
        error: "Supabase governed recoup_config rows are unavailable or failed validation.",
        missingSource: "supabase-recoup-config-rows"
      });
      return undefined;
    }
  }

  async function loadRequiredCreditRiskReviewModel(
    request: Request,
    response: Response,
    modelOptions: { dealOptimizerRequired?: boolean } = {}
  ) {
    const [governedConfig, rows, approvalRecordsSnapshot, dealOptimizerRows] = await Promise.all([
      loadRequiredGovernedConfig(request, response),
      loadRequiredCreditRiskRows(request, response),
      loadApprovalRecordsOrFailClosed(request, response, runtimeEnv, options.memoryFetcher),
      modelOptions.dealOptimizerRequired ? loadRequiredDealOptimizerRows(request, response) : loadOptionalDealOptimizerRows()
    ]);
    if (
      governedConfig === undefined ||
      rows === undefined ||
      approvalRecordsSnapshot === undefined ||
      (modelOptions.dealOptimizerRequired && dealOptimizerRows === undefined)
    ) {
      return undefined;
    }

    try {
      return buildCreditRiskReviewModel({
        ...rows,
        approvalReceipts: buildCreditRiskApprovalReceipts(approvalRecordsSnapshot.records),
        approvedCreditRecommendations: buildApprovedCreditRecommendationRows(approvalRecordsSnapshot.records, rows),
        ...(dealOptimizerRows === undefined
          ? {}
          : {
              negotiationOrders: dealOptimizerRows.simRows.orders.map((order) => ({
                accountId: order.accountId,
                orderAmount: order.orderAmount,
                orderId: order.orderId,
                sourceRecordIds: [...order.sourceRecordIds]
              }))
            })
      });
    } catch {
      sendFailClosedJson(request, response, 503, {
        error: "Credit approval receipt state is unavailable from governed backend sources.",
        missingSource: "approval_records"
      });
      return undefined;
    }
  }

  async function loadRequiredCreditRiskRows(request: Request, response: Response) {
    try {
      return await loadCreditRiskRows(runtimeEnv, options.memoryFetcher);
    } catch (error) {
      if (error instanceof MissingCreditRiskSourceError) {
        sendFailClosedJson(request, response, 503, {
          error: `Supabase credit risk ${error.sourceTableName} rows are unavailable or failed validation.`,
          missingSource: error.missingSource
        });
        return undefined;
      }
      if (error instanceof MissingCreditNegotiationSourceError) {
        sendFailClosedJson(request, response, 503, {
          error: `Supabase credit negotiation ${error.sourceTableName} rows are unavailable or failed validation.`,
          missingSource: error.missingSource
        });
        return undefined;
      }

      sendFailClosedJson(request, response, 503, {
        error: "Supabase credit risk rows are unavailable from governed backend sources.",
        missingSource: "credit-risk-source"
      });
      return undefined;
    }
  }

  async function loadRequiredDealOptimizerRows(request: Request, response: Response) {
    try {
      return await loadDealOptimizerSourceRows(runtimeEnv, options.memoryFetcher);
    } catch (error) {
      if (error instanceof MissingCreditNegotiationSourceError) {
        sendFailClosedJson(request, response, 503, {
          error: "David deal optimizer is unavailable from governed backend sources.",
          missingSource: error.missingSource
        });
        return undefined;
      }

      sendFailClosedJson(request, response, 503, {
        error: "David deal optimizer is unavailable from governed backend sources.",
        missingSource: "credit-negotiation-source"
      });
      return undefined;
    }
  }

  // Credit rows only add advisory recommendations to a Maya case, so an unavailable credit source
  // must not fail the case detail closed the way it does on David's own surface.
  async function loadOptionalCreditRiskRows() {
    try {
      return await loadCreditRiskRows(runtimeEnv, options.memoryFetcher);
    } catch {
      return undefined;
    }
  }

  async function loadOptionalDealOptimizerRows() {
    try {
      return await loadDealOptimizerSourceRows(runtimeEnv, options.memoryFetcher);
    } catch {
      return undefined;
    }
  }

  async function persistCreditDealScenarios(model: DealOptimizerModel): Promise<void> {
    const baseUrl = runtimeEnv.SUPABASE_URL?.replace(/\/+$/u, "");
    const serviceRoleKey = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY;
    if (baseUrl === undefined || serviceRoleKey === undefined) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for credit deal scenario persistence.");
    }

    const rows = model.rankedCandidates.map((candidate) => ({
      candidate_json: {
        calculationHash: candidate.calculationHash,
        candidateId: candidate.candidateId,
        objectiveValue: candidate.objectiveValue,
        objectiveValueLabel: candidate.objectiveValueLabel,
        rank: candidate.rank,
        scenarioCount: candidate.scenarioCount,
        ...(candidate.sourceRoundId === undefined ? {} : { sourceRoundId: candidate.sourceRoundId }),
        terms: candidate.terms
      },
      candidate_id: candidate.candidateId,
      objective_value: candidate.objectiveValue,
      optimizer_run_id: model.optimizerRunId,
      order_id: model.orderId,
      payload_json: {
        calculationHash: candidate.calculationHash,
        candidateId: candidate.candidateId,
        objectiveValue: candidate.objectiveValue,
        objectiveValueLabel: candidate.objectiveValueLabel,
        rank: candidate.rank,
        scenarioCount: candidate.scenarioCount,
        ...(candidate.sourceRoundId === undefined ? {} : { sourceRoundId: candidate.sourceRoundId }),
        terms: candidate.terms
      },
      policy_hash: model.policyHash,
      ranked_position: candidate.rank,
      scenario_id: `${model.optimizerRunId}:rank-${candidate.rank.toString()}:${candidate.candidateId}`,
      seed: model.seed,
      source_hash: model.sourceHash,
      source_record_ids: candidate.sourceRecordIds
    }));
    if (rows.length === 0) {
      return;
    }

    const response = await (options.memoryFetcher ?? fetch)(`${baseUrl}/rest/v1/credit_deal_scenarios?on_conflict=scenario_id`, {
      body: JSON.stringify(rows),
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=representation"
      },
      method: "POST"
    });
    if (!response.ok) {
      throw new Error(`Credit deal scenario persistence failed with HTTP ${response.status.toString()}.`);
    }
  }

  function buildForensicsSourceContextCacheKey(
    governedConfig: GovernedConfigValues,
    riskObservationRequired: boolean
  ): ForensicsSourceContextCacheKey {
    return {
      dataMode,
      governedConfigHash: sha256CanonicalJson(governedConfig),
      governedSeed: governedConfig.seed,
      openAiEvidenceVectorStoreIdentity: readOpenAiEvidenceVectorStoreIdentity(runtimeEnv),
      reconciliationCanaryLines: [...readCanaryLines(runtimeEnv)].sort(),
      reconciliationMode: readReconciliationMode(runtimeEnv),
      riskObservationRequired,
      sourceTableIdentity: forensicsSourceContextTableIdentity,
      supabaseSourceIdentity: readSupabaseSourceIdentity(runtimeEnv)
    };
  }

  function isReusableForensicsRunContext(
    cachedContext: CachedForensicsRunContext | undefined,
    cacheKey: ForensicsSourceContextCacheKey,
    nowMs: number
  ): cachedContext is CachedForensicsRunContext {
    return (
      cachedContext !== undefined &&
      forensicsSourceContextCacheTtlMs > 0 &&
      nowMs - cachedContext.cachedAtMs < forensicsSourceContextCacheTtlMs &&
      JSON.stringify(cachedContext.key) === JSON.stringify(cacheKey)
    );
  }

  function publishCacheableForensicsRunContext(
    governedConfig: GovernedConfigValues,
    runContext: ForensicsRunContext,
    cacheKey: ForensicsSourceContextCacheKey,
    cacheGenerationAtLoadStart: number,
    refreshRequestId: number | undefined
  ): void {
    validateCacheableForensicsRunContext(governedConfig, runContext);
    const nextCachedContext: CachedForensicsRunContext = {
      cachedAtMs: Date.now(),
      key: cacheKey,
      ...runContext
    };
    if (refreshRequestId !== undefined) {
      if (latestForensicsRefreshRequestId === refreshRequestId) {
        cachedForensicsRunContext = nextCachedContext;
        cachedForensicsRunContextGeneration += 1;
      }
      return;
    }
    if (cacheGenerationAtLoadStart === cachedForensicsRunContextGeneration) {
      cachedForensicsRunContext = nextCachedContext;
      cachedForensicsRunContextGeneration += 1;
    }
  }

  async function loadReadModelRecord(
    modelKey: string,
    surface: "connector-readiness" | "forensics-analyst"
  ): Promise<SupabaseReadModelRecord | undefined> {
    if (readModelRepository === undefined) {
      return undefined;
    }

    try {
      const record = await readModelRepository.load(modelKey);
      if (record === undefined || record.surface !== surface || !isReadModelPayloadForSurface(record.payload, surface)) {
        return undefined;
      }

      return record;
    } catch {
      return undefined;
    }
  }

  async function publishReadModel(
    modelKey: string,
    surface: "connector-readiness" | "credit-risk-review" | "forensics-analyst",
    model: unknown,
    options: { persona?: "david" | "maya"; sourceRecordIds?: readonly string[]; sourceRefreshedAt?: string } = {}
  ): Promise<boolean> {
    if (readModelRepository === undefined || !isReadModelPayloadForSurface(model, surface)) {
      return false;
    }

    try {
      await readModelRepository.upsert({
        modelKey,
        payload: model,
        payloadHash: sha256CanonicalJson(model),
        persona: options.persona ?? "maya",
        sourceRecordIds: [...(options.sourceRecordIds ?? collectReadModelSourceRecordIds(model, surface))],
        sourceRefreshedAt: options.sourceRefreshedAt ?? new Date().toISOString(),
        surface
      });
      return true;
    } catch {
      return false;
    }
  }

  async function loadLatestSourceHealthSnapshots(
    snapshotStore: SourceHealthSnapshotStore | undefined
  ): Promise<SourceHealthResult[] | undefined> {
    if (snapshotStore === undefined) {
      return undefined;
    }

    try {
      return await snapshotStore.loadLatest();
    } catch {
      return undefined;
    }
  }

  function isConnectorReadModelFreshForSnapshots(
    record: SupabaseReadModelRecord,
    snapshots: readonly SourceHealthResult[] | undefined
  ): boolean {
    if (snapshots === undefined || snapshots.length === 0) {
      return true;
    }

    const latestSnapshotCheckedAt = mostRecentCheckedAtIso(snapshots);
    if (latestSnapshotCheckedAt === undefined) {
      return true;
    }

    const cachedCheckedAt = readConnectorModelCheckedAt(record.payload);
    return cachedCheckedAt !== undefined && Date.parse(cachedCheckedAt) >= Date.parse(latestSnapshotCheckedAt);
  }

  function readConnectorModelCheckedAt(payload: Record<string, unknown>): string | undefined {
    if (isValidTimestamp(payload.checkedAtIso)) {
      return payload.checkedAtIso;
    }

    return Array.isArray(payload.sourceHealth) ? mostRecentCheckedAtIso(payload.sourceHealth) : undefined;
  }

  function mostRecentCheckedAtIso(rows: readonly unknown[]): string | undefined {
    let latest: string | undefined;
    for (const row of rows) {
      const checkedAtIso = readCheckedAtIso(row);
      if (checkedAtIso === undefined) {
        continue;
      }

      if (latest === undefined || Date.parse(checkedAtIso) > Date.parse(latest)) {
        latest = checkedAtIso;
      }
    }

    return latest;
  }

  function readCheckedAtIso(value: unknown): string | undefined {
    if (typeof value !== "object" || value === null || Array.isArray(value) || !("checkedAtIso" in value)) {
      return undefined;
    }

    const checkedAtIso = (value as { checkedAtIso?: unknown }).checkedAtIso;
    return isValidTimestamp(checkedAtIso) ? checkedAtIso : undefined;
  }

  function isValidTimestamp(value: unknown): value is string {
    return typeof value === "string" && Number.isFinite(Date.parse(value));
  }

  function sourceHealthSnapshotStoreFromRows(snapshots: readonly SourceHealthResult[]): SourceHealthSnapshotStore {
    return {
      loadLatest() {
        return Promise.resolve([...snapshots]);
      },
      upsert() {
        return Promise.resolve();
      }
    };
  }

  async function loadRequiredSupabaseRunContext(
    request: Request,
    response: Response,
    governedConfig: GovernedConfigValues,
    sourceOptions: { bypassCache?: boolean; riskObservationRequired?: boolean } = {}
  ): Promise<ForensicsRunContext | undefined> {
    const cacheKey = buildForensicsSourceContextCacheKey(governedConfig, sourceOptions.riskObservationRequired === true);
    const cacheableForensicsContext = !cacheKey.riskObservationRequired;
    const refreshRequestId =
      sourceOptions.bypassCache === true && cacheableForensicsContext ? latestForensicsRefreshRequestId + 1 : undefined;
    if (refreshRequestId !== undefined) {
      latestForensicsRefreshRequestId = refreshRequestId;
    }
    const cacheGenerationAtLoadStart = cachedForensicsRunContextGeneration;
    const nowMs = Date.now();
    if (
      sourceOptions.bypassCache !== true &&
      cacheableForensicsContext &&
      isReusableForensicsRunContext(cachedForensicsRunContext, cacheKey, nowMs)
    ) {
      return {
        reconciliation: cachedForensicsRunContext.reconciliation,
        serviceContext: cachedForensicsRunContext.serviceContext,
        source: cachedForensicsRunContext.source
      };
    }

    const reconciliationMode = readReconciliationMode(runtimeEnv);
    const settlementReader =
      reconciliationMode === "legacy"
        ? createLegacySupabaseSettlementRunReaderFromEnv(runtimeEnv, governedConfig.seed, options.memoryFetcher)
        : createSupabaseSettlementRunReaderFromEnv(runtimeEnv, governedConfig.seed, options.memoryFetcher);
    const sapEvidenceReader = createSupabaseSapEvidenceReaderFromEnv(runtimeEnv, options.memoryFetcher);
    const syntheticEvidenceReader = createSupabaseSyntheticSourceReaderFromEnv(runtimeEnv, options.memoryFetcher);
    if (settlementReader === undefined || sapEvidenceReader === undefined || syntheticEvidenceReader === undefined) {
      sendFailClosedJson(request, response, 503, {
        error: "Supabase settlement and source evidence rows are required for Forensics.",
        missingSource: "supabase-forensics-source-credentials"
      });
      return undefined;
    }

    let reconciliation: ForensicsReconciliationOptions | undefined;
    let settlementRun: ReturnType<SourcePort["loadSettlementRun"]>;
    try {
      settlementRun = await settlementReader.loadSettlementRun();
      if (hasReconciliationReceipts(settlementReader)) {
        if (!hasRealEvidenceDataset(settlementReader)) {
          throw new Error("Supabase canonical evidence dataset is required for reconciliation receipts.");
        }
        const [receipts, evidenceDataset] = await Promise.all([
          settlementReader.loadReconciliationReceipts(),
          settlementReader.loadRealEvidenceDataset()
        ]);
        reconciliation = {
          canaryLines: readCanaryLines(runtimeEnv),
          evidenceDataset,
          mode: reconciliationMode,
          receipts
        };
      }
    } catch {
      sendFailClosedJson(request, response, 503, {
        error: "Supabase settlement source rows are unavailable or failed validation.",
        missingSource: "supabase-settlement-source-rows"
      });
      return undefined;
    }

    let source = sourcePortFromSupabaseSnapshots({ settlementRun });
    if (sourceOptions.riskObservationRequired === true) {
      try {
        const reader = createSupabaseRiskObservationSnapshotReaderFromEnv(
          runtimeEnv,
          riskObservationSourcesFromGovernedConfig(governedConfig),
          options.memoryFetcher
        );
        if (reader === undefined) {
          sendFailClosedJson(request, response, 503, {
            error: "Supabase Tools_data risk observation rows are unavailable or failed validation.",
            missingSource: "supabase-tools-data-risk-observation-rows"
          });
          return undefined;
        }

        const riskObservationSnapshot = await reader.loadRiskObservationSnapshot(governedConfig.riskMeshCases.harbor.customerId);
        if (riskObservationSnapshot === undefined) {
          sendFailClosedJson(request, response, 503, {
            error: "Supabase Tools_data risk observation rows are unavailable or failed validation.",
            missingSource: "supabase-tools-data-risk-observation-rows"
          });
          return undefined;
        }

        source = sourcePortFromSupabaseSnapshots({ riskObservationSnapshot, settlementRun });
      } catch {
        sendFailClosedJson(request, response, 503, {
          error: "Supabase Tools_data risk observation rows are unavailable or failed validation.",
          missingSource: "supabase-tools-data-risk-observation-rows"
        });
        return undefined;
      }
    }

    let sapEvidenceSource: Awaited<ReturnType<typeof buildSupabaseServiceSapEvidenceSource>>;
    try {
      sapEvidenceSource = await buildSupabaseServiceSapEvidenceSource({
        reader: sapEvidenceReader,
        settlementRun
      });
    } catch {
      sendFailClosedJson(request, response, 503, {
        error: "Supabase SAP source evidence rows are unavailable or failed validation.",
        missingSource: "supabase-sap-source-evidence-rows",
        sourceTableName: "recoup_src_sap"
      });
      return undefined;
    }

    try {
      const syntheticEvidenceSource = await buildSupabaseServiceSyntheticEvidenceSource({
        reader: syntheticEvidenceReader,
        settlementRun
      });
      const vectorStoreEvidenceSource = await buildOptionalOpenAiVectorStoreEvidenceSource(settlementRun);

      const runContext = {
        ...(reconciliation === undefined ? {} : { reconciliation }),
        serviceContext: {
          governedConfig,
          requireSupabaseSapEvidence: true,
          requireSupabaseSyntheticEvidence: true,
          sapEvidenceSource,
          source,
          syntheticEvidenceSource,
          ...(vectorStoreEvidenceSource === undefined ? {} : { vectorStoreEvidenceSource })
        },
        source
      };
      if (cacheableForensicsContext) {
        publishCacheableForensicsRunContext(
          governedConfig,
          runContext,
          cacheKey,
          cacheGenerationAtLoadStart,
          refreshRequestId
        );
      }

      return runContext;
    } catch {
      sendFailClosedJson(request, response, 503, {
        error: "Supabase source evidence rows are unavailable or failed validation.",
        missingSource: "supabase-source-evidence-rows"
      });
      return undefined;
    }
  }

  function hasReconciliationReceipts(
    reader: unknown
  ): reader is { loadReconciliationReceipts(): Promise<NonNullable<ForensicsReconciliationOptions["receipts"]>> } {
    return (
      typeof reader === "object" &&
      reader !== null &&
      "loadReconciliationReceipts" in reader &&
      typeof (reader as { loadReconciliationReceipts?: unknown }).loadReconciliationReceipts === "function"
    );
  }

  function hasRealEvidenceDataset(
    reader: unknown
  ): reader is { loadRealEvidenceDataset(): Promise<NonNullable<ForensicsReconciliationOptions["evidenceDataset"]>> } {
    return (
      typeof reader === "object" &&
      reader !== null &&
      "loadRealEvidenceDataset" in reader &&
      typeof (reader as { loadRealEvidenceDataset?: unknown }).loadRealEvidenceDataset === "function"
    );
  }

  async function buildOptionalOpenAiVectorStoreEvidenceSource(
    settlementRun: ReturnType<SourcePort["loadSettlementRun"]>
  ): Promise<Awaited<ReturnType<typeof buildOpenAiVectorStoreEvidenceSource>> | undefined> {
    const apiKey = runtimeEnv.OPENAI_API_KEY?.trim();
    const vectorStoreId = runtimeEnv.OPENAI_EVIDENCE_VECTOR_STORE_ID?.trim();
    if (apiKey === undefined || apiKey.length === 0 || vectorStoreId === undefined || vectorStoreId.length === 0) {
      return undefined;
    }

    return buildOpenAiVectorStoreEvidenceSource({
      reader: createOpenAiVectorStoreEvidenceReader({
        apiKey,
        ...(options.openAiVectorStoreFetcher === undefined ? {} : { fetcher: options.openAiVectorStoreFetcher }),
        vectorStoreId
      }),
      settlementRun
    });
  }

  function createOptionalCreditNegotiationPolicyRationaleReader(env: RuntimeEnv, fetcher: OpenAiVectorStoreFetch | undefined) {
    const apiKey = env.OPENAI_API_KEY?.trim();
    const vectorStoreId = env.OPENAI_CREDIT_NEGOTIATION_POLICY_VECTOR_STORE_ID?.trim();
    if (apiKey === undefined || apiKey.length === 0 || vectorStoreId === undefined || vectorStoreId.length === 0) {
      return undefined;
    }

    return createOpenAiCreditNegotiationPolicyRationaleReader({
      apiKey,
      ...(fetcher === undefined ? {} : { fetcher }),
      vectorStoreId
    });
  }

  function validateCacheableForensicsRunContext(
    governedConfig: GovernedConfigValues,
    runContext: ForensicsRunContext
  ): void {
    runForensicsInvestigation({
      governedConfig,
      ...(runContext.reconciliation === undefined ? {} : { reconciliation: runContext.reconciliation }),
      serviceContext: runContext.serviceContext,
      source: runContext.source
    });
  }

  async function loadRequiredSupabaseSource(
    request: Request,
    response: Response,
    governedConfig: GovernedConfigValues,
    sourceOptions: { riskObservationRequired?: boolean } = {}
  ): Promise<SourcePort | undefined> {
    const settlementReader =
      readReconciliationMode(runtimeEnv) === "legacy"
        ? createLegacySupabaseSettlementRunReaderFromEnv(runtimeEnv, governedConfig.seed, options.memoryFetcher)
        : createSupabaseSettlementRunReaderFromEnv(runtimeEnv, governedConfig.seed, options.memoryFetcher);
    if (settlementReader === undefined) {
      sendFailClosedJson(request, response, 503, {
        error: "Supabase settlement source rows are unavailable or failed validation.",
        missingSource: "supabase-settlement-source-credentials"
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
          sendFailClosedJson(request, response, 503, {
            error: "Supabase Tools_data risk observation rows are unavailable or failed validation.",
            missingSource: "supabase-tools-data-risk-observation-rows"
          });
          return undefined;
        }

        const riskObservationSnapshot = await reader.loadRiskObservationSnapshot(governedConfig.riskMeshCases.harbor.customerId);
        if (riskObservationSnapshot === undefined) {
          sendFailClosedJson(request, response, 503, {
            error: "Supabase Tools_data risk observation rows are unavailable or failed validation.",
            missingSource: "supabase-tools-data-risk-observation-rows"
          });
          return undefined;
        }

        return sourcePortFromSupabaseSnapshots({ riskObservationSnapshot, settlementRun });
      }

      return sourcePortFromSupabaseSnapshots({ settlementRun });
    } catch {
      if (sourceOptions.riskObservationRequired === true) {
        sendFailClosedJson(request, response, 503, {
          error: "Supabase Tools_data risk observation rows are unavailable or failed validation.",
          missingSource: "supabase-tools-data-risk-observation-rows"
        });
        return undefined;
      }

      sendFailClosedJson(request, response, 503, {
        error: "Supabase settlement source rows are unavailable or failed validation.",
        missingSource: "supabase-settlement-source-rows"
      });
      return undefined;
    }
  }

  function readCockpitRunSessionId(request: Request): string {
    const rawSessionId = request.headers[cockpitRunSessionIdHeader];
    if (typeof rawSessionId !== "string") {
      return defaultCockpitRunSessionId;
    }

    // Technical request-scoping only: reject path/space/secret-shaped values by allowlist, then fall back.
    if (!safeCockpitRunSessionIdPattern.test(rawSessionId) || secretLikeCockpitRunSessionIdPattern.test(rawSessionId)) {
      return defaultCockpitRunSessionId;
    }

    return rawSessionId;
  }

  app.get("/run", rateLimitAuditEndpoint("GET /run"), streamForensicsRun);

  app.post("/run", rateLimitAuditEndpoint("POST /run"), async (request, response) => {
    const parsed = runRequestSchema.safeParse(request.body as unknown);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid run request." });
      return;
    }

    await streamForensicsRun(request, response);
  });

  app.post("/approval", rateLimitAuditEndpoint("POST /approval"), async (request, response) => {
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
      const governedConfig = await loadRequiredGovernedConfig(request, response);
      if (governedConfig === undefined) {
        return;
      }
      const runContext = await loadRequiredSupabaseRunContext(request, response, governedConfig, { riskObservationRequired: true });
      if (runContext === undefined) {
        return;
      }
      const { reconciliation, serviceContext, source } = runContext;
      const approvalInput = {
        actionId: parsed.data.actionId,
        decision: parsed.data.decision,
        ...(parsed.data.approverId === undefined ? {} : { approverId: parsed.data.approverId }),
        ...(parsed.data.reason === undefined ? {} : { reason: parsed.data.reason })
      };
      const isCreditV2Action = parsed.data.actionId.startsWith("credit-v2:");
      const isCreditNegotiationAction = parsed.data.actionId.startsWith("credit-v2:negotiation:");
      // A Maya recovery credit recommendation is resolved against the credit account it moves, so
      // it needs the same rows a credit-v2 action does.
      const isCreditRecommendationAction = parsed.data.actionId.startsWith(creditRecommendationActionIdPrefix);
      const requiresCreditRiskRows = isCreditV2Action || isCreditRecommendationAction;
      let creditRiskRows = requiresCreditRiskRows ? await loadRequiredCreditRiskRows(request, response) : undefined;
      if (requiresCreditRiskRows && creditRiskRows === undefined) {
        return;
      }
      let dealOptimizerRows: Awaited<ReturnType<typeof loadRequiredDealOptimizerRows>> = undefined;
      if (isCreditNegotiationAction) {
        dealOptimizerRows = await loadRequiredDealOptimizerRows(request, response);
        if (dealOptimizerRows === undefined) {
          return;
        }
        creditRiskRows =
          creditRiskRows === undefined
            ? undefined
            : {
                ...creditRiskRows,
                negotiationOrders: dealOptimizerRows.simRows.orders.map((order) => ({
                  accountId: order.accountId,
                  orderAmount: order.orderAmount,
                  orderId: order.orderId,
                  sourceRecordIds: [...order.sourceRecordIds]
                }))
              };
      }
      const supabaseAuditChain =
        runtimeEnv.RECOUP_MEMORY_BACKEND === "supabase"
          ? createSupabaseAuditChainRepositoryFromEnv(runtimeEnv, options.memoryFetcher)
          : undefined;
      if (supabaseAuditChain !== undefined) {
        const prepared = prepareApprovalDecision(approvalInput, {
          ...(creditRiskRows === undefined ? {} : { creditRiskRows }),
          ...(dealOptimizerRows === undefined ? {} : { dealOptimizerRows }),
          ...serviceContext,
          governedConfig,
          ...(reconciliation === undefined ? {} : { reconciliation }),
          source,
          verifiedHumanPrincipal: human.principal
        });
        const negotiationRecipientProof = parsed.data.actionId.startsWith("credit-v2:negotiation:")
          ? readCreditNegotiationRecipientProof(runtimeEnv)
          : undefined;
        response.json(
          await commitSupabaseApprovalDecision(runtimeEnv, options.memoryFetcher, prepared, {
            ...(negotiationRecipientProof === undefined ? {} : { negotiationRecipientProof })
          })
        );
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

  app.post(
    "/credit/recommendations/:actionId/acknowledge",
    rateLimitAuditEndpoint("POST /credit/recommendations/:actionId/acknowledge"),
    async (request, response) => {
      const human = verifyHumanCockpitAuth(request, runtimeEnv, {
        allowProxyDemoRoles: ["david"],
        proxyPurpose: "read"
      });
      if (!human.success) {
        response.status(401).json({ error: human.error });
        return;
      }

      const rawActionId = request.params.actionId;
      const actionId = (typeof rawActionId === "string" ? rawActionId : "").trim();
      if (!actionId.startsWith(creditRecommendationActionIdPrefix) || parseCreditRecommendationActionId(actionId) === undefined) {
        response.status(400).json({ error: "Unknown credit recommendation." });
        return;
      }

      const approvalRecordsSnapshot = await loadApprovalRecordsOrFailClosed(request, response, runtimeEnv, options.memoryFetcher);
      if (approvalRecordsSnapshot === undefined) {
        return;
      }

      // Acknowledgement confirms receipt of a decision a human already made. Without an approval
      // there is nothing to acknowledge, and accepting one would fabricate a closed loop.
      if (!hasCommittedCreditRecommendationApproval(approvalRecordsSnapshot.records, actionId)) {
        response.status(409).json({ error: "This recommendation has not been approved yet." });
        return;
      }

      if (readCreditRecommendationAcknowledgedAt(approvalRecordsSnapshot.records, actionId) !== undefined) {
        response.status(409).json({ error: "This recommendation is already acknowledged." });
        return;
      }

      const supabaseMemory = createSupabaseMemoryRepositoryFromEnv(runtimeEnv, options.memoryFetcher);
      if (supabaseMemory === undefined) {
        sendFailClosedJson(request, response, 503, {
          error: "Acknowledgement is unavailable from governed backend sources.",
          missingSource: "recoup_memory_records"
        });
        return;
      }

      const acknowledgedAt = new Date().toISOString();
      try {
        await supabaseMemory.append({
          category: "case_state",
          createdAt: acknowledgedAt,
          id: creditRecommendationAcknowledgementScope(actionId),
          payload: { acknowledgedAt, acknowledgedBy: human.principal, actionId },
          recordIds: [actionId],
          scope: creditRecommendationAcknowledgementScope(actionId),
          trustLevel: "trusted"
        });
      } catch {
        sendFailClosedJson(request, response, 503, {
          error: "Acknowledgement is unavailable from governed backend sources.",
          missingSource: "recoup_memory_records"
        });
        return;
      }

      response.setHeader("cache-control", "no-store");
      response.json({ acknowledgedAt, acknowledgedBy: human.principal, actionId });
    }
  );

  app.post("/admin/demo-reset", rateLimitAuditEndpoint("POST /admin/demo-reset"), async (request, response) => {
    const human = verifyHumanCockpitAuth(request, runtimeEnv, {
      allowProxyDemoRoles: ["cfo"],
      proxyPurpose: "admin-reset"
    });
    if (!human.success) {
      response.status(401).json({ error: human.error });
      return;
    }

    if (!isAdminResetPrincipal(human.principal, runtimeEnv)) {
      response.status(403).json({ error: "Admin reset principal required." });
      return;
    }

    const parsed = demoLifecycleResetRequestSchema.safeParse(request.body as unknown);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid demo reset request." });
      return;
    }

    try {
      response.json(
        await resetDemoLifecycleRecords({
          actionId: parsed.data.actionId,
          env: runtimeEnv,
          memoryFetcher: options.memoryFetcher,
          operatorPrincipal: human.principal,
          ...(parsed.data.reason === undefined ? {} : { reason: parsed.data.reason })
        })
      );
    } catch {
      sendFailClosedJson(request, response, 503, {
        error: "Demo lifecycle reset is unavailable from governed backend sources.",
        missingSource: "approval_records"
      });
    }
  });

  app.post("/forensics/query", rateLimitAuditEndpoint("POST /forensics/query"), async (request, response) => {
    response.setHeader("cache-control", "no-store");
    const human = verifyHumanCockpitAuth(request, runtimeEnv, {
      allowProxyDemoRoles: ["maya"],
      proxyPurpose: "realtime"
    });
    if (!human.success) {
      response.status(401).json({ error: human.error });
      return;
    }

    const parsedRequest = forensicsQueryRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      response.status(400).json({ error: parsedRequest.error.issues[0]?.message ?? "Forensics query question is required." });
      return;
    }

    if ("scope" in parsedRequest.data) {
      try {
        const runContext = await loadRequiredForensicsRunContext(request, response, { bypassCache: true });
        if (runContext === undefined) {
          return;
        }
        const runControl = await loadRequiredRunControl(request, response);
        if (runControl === undefined) {
          return;
        }
        const runBudget = createRunBudgetController(runControl.config);
        runBudget.recordStep({ phase: "query" });
        const liveAgentTrace =
          options.forensicsStreamRunner === undefined
            ? {
                env: runtimeEnv,
                maxTurns: runControl.config.phases.query.stepBudget,
                onRetry() {
                  runBudget.recordRetry({ phase: "query" });
                },
                onTokenUsage(tokens: number) {
                  runBudget.recordTokenUsage({ phase: "query", tokens });
                },
                retryCap: runControl.config.phases.query.retryCap
              }
            : {
                env: runtimeEnv,
                maxTurns: runControl.config.phases.query.stepBudget,
                onRetry() {
                  runBudget.recordRetry({ phase: "query" });
                },
                onTokenUsage(tokens: number) {
                  runBudget.recordTokenUsage({ phase: "query", tokens });
                },
                retryCap: runControl.config.phases.query.retryCap,
                runner: options.forensicsStreamRunner
              };
        response.json(
          await runForensicsWorkspaceQuerySessionWithLiveAgents({
            governedConfig: runContext.governedConfig,
            liveAgentTrace,
            question: parsedRequest.data.question,
            ...(runContext.reconciliation === undefined ? {} : { reconciliation: runContext.reconciliation }),
            serviceContext: runContext.serviceContext,
            settlementRunId: parsedRequest.data.settlementRunId,
            source: runContext.source
          })
        );
      } catch (error) {
        if (error instanceof ForensicsWorkspaceSettlementRunMismatchError) {
          response.status(409).json({ error: error.message });
          return;
        }

        throw error;
      }
      return;
    }

    const runContext = await loadRequiredForensicsRunContext(request, response);
    if (runContext === undefined) {
      return;
    }
    const selectedQueryRequest = forensicsSelectedQueryRequestSchema.parse(parsedRequest.data);
    if (!isSafeMayaQueryMemoryRecordId(selectedQueryRequest.selectedLineId)) {
      response.json(blockedForensicsSelectedScopeQueryResponse());
      return;
    }
    const runControl = await loadRequiredRunControl(request, response);
    if (runControl === undefined) {
      return;
    }
    const runBudget = createRunBudgetController(runControl.config);
    runBudget.recordStep({ phase: "query" });
    const liveAgentTrace =
      options.forensicsStreamRunner === undefined
        ? {
            env: runtimeEnv,
            maxTurns: runControl.config.phases.query.stepBudget,
            onRetry() {
              runBudget.recordRetry({ phase: "query" });
            },
            onTokenUsage(tokens: number) {
              runBudget.recordTokenUsage({ phase: "query", tokens });
            },
            retryCap: runControl.config.phases.query.retryCap
          }
        : {
            env: runtimeEnv,
            maxTurns: runControl.config.phases.query.stepBudget,
            onRetry() {
              runBudget.recordRetry({ phase: "query" });
            },
            onTokenUsage(tokens: number) {
              runBudget.recordTokenUsage({ phase: "query", tokens });
            },
            retryCap: runControl.config.phases.query.retryCap,
            runner: options.forensicsStreamRunner
          };

    try {
      const sessionId = readCockpitRunSessionId(request);
      const memoryRecall = await loadMayaForensicsQueryRecallContext({
        env: runtimeEnv,
        memoryFetcher: options.memoryFetcher,
        selectedLineId: selectedQueryRequest.selectedLineId
      });
      const selectedScope = buildMayaSelectedQueryScope(runContext, selectedQueryRequest);
      if (selectedScope.status === "blocked") {
        response.json(blockedForensicsSelectedScopeQueryResponse());
        return;
      }
      const queryResponse = await runForensicsQuerySessionWithLiveAgents({
        governedConfig: runContext.governedConfig,
        liveAgentTrace,
        ...(memoryRecall === undefined ? {} : { memoryRecall }),
        question: selectedScope.normalizedRequest.question,
        ...(runContext.reconciliation === undefined ? {} : { reconciliation: runContext.reconciliation }),
        recordIds: selectedScope.normalizedRequest.recordIds,
        selectedLineId: selectedScope.normalizedRequest.selectedLineId,
        serviceContext: runContext.serviceContext,
        source: runContext.source,
        trustedEvidencePackRecordIds: selectedScope.trustedEvidencePackRecordIds
      });
      const queryCorrelationId = readRequestCorrelationId(request) ?? String(response.getHeader(recoupCorrelationIdHeader) ?? "");
      if (!selectedScope.hasOutOfScopeSubmittedRecordId) {
        await Promise.all([
          awaitBoundedForensicsQueryOptionalPersistence({
            correlationId: queryCorrelationId,
            selectedLineId: selectedQueryRequest.selectedLineId,
            task: persistMayaForensicsQueryScopeMemory({
              env: runtimeEnv,
              memoryFetcher: options.memoryFetcher,
              queryResponse,
              request: selectedScope.normalizedRequest,
              sessionId
            }),
            taskName: "maya_query_scope_memory"
          }),
          awaitBoundedForensicsQueryOptionalPersistence({
            correlationId: queryCorrelationId,
            selectedLineId: selectedQueryRequest.selectedLineId,
            task: persistMayaForensicsCaseRecallMemory({
              env: runtimeEnv,
              memoryFetcher: options.memoryFetcher,
              queryResponse,
              request: selectedScope.normalizedRequest,
              sessionId
            }),
            taskName: "maya_query_case_recall_memory"
          }),
          awaitBoundedForensicsQueryOptionalPersistence({
            correlationId: queryCorrelationId,
            selectedLineId: selectedQueryRequest.selectedLineId,
            task: persistForensicsQueryTokenUsageReceipt({
              correlationId: queryCorrelationId,
              env: runtimeEnv,
              memoryFetcher: options.memoryFetcher,
              queryResponse,
              request: selectedScope.normalizedRequest
            }),
            taskName: "maya_query_token_usage_receipt"
          })
        ]);
      }
      // facts is the value set the grounded answer guard verifies against, not something a client
      // needs; it can carry every cited record id, so it is stripped rather than shipped.
      const clientQueryResponse = { ...queryResponse };
      delete (clientQueryResponse as { facts?: unknown }).facts;
      response.json(clientQueryResponse);
    } catch (error) {
      if (error instanceof ForensicsQueryLineNotFoundError) {
        response.status(404).json({
          error: "Forensics query selected line not found.",
          ...(isSafeMayaQueryMemoryRecordId(error.lineId) ? { lineId: error.lineId } : {})
        });
        return;
      }
      if (error instanceof ForensicsWorkItemNotFoundError) {
        response.status(404).json({
          error: "Forensics query selected line not found.",
          ...(isSafeMayaQueryMemoryRecordId(error.lineId) ? { lineId: error.lineId } : {})
        });
        return;
      }

      sendFailClosedJson(request, response, 503, {
        error: "Forensics query is unavailable from governed backend sources.",
        missingSource: "supabase-forensics-query-session"
      });
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

    const realtimeRequestSchema =
      isRecord(request.body) && request.body["mode"] === "transcription_only"
        ? realtimeTranscriptionClientSecretRequestSchema
        : realtimeSelectedClientSecretRequestSchema;
    const parsedRequest = realtimeRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      response.status(400).json({ error: parsedRequest.error.issues[0]?.message ?? "Realtime query question is required." });
      return;
    }

    try {
      if ("mode" in parsedRequest.data) {
        const result = await requestRealtimeClientSecret({
          env: runtimeEnv,
          ...(options.realtimeFetcher === undefined ? {} : { fetcher: options.realtimeFetcher }),
          question: parsedRequest.data.question,
          safetyIdentifier: human.principal,
          transcriptionOnly: true
        });
        response.status(result.status === "blocked_missing_credentials" ? 503 : 200).json(result);
        return;
      }

      const runContext = await loadRequiredForensicsRunContext(request, response);
      if (runContext === undefined) {
        return;
      }
      const selectedRequest = realtimeSelectedClientSecretRequestSchema.parse(parsedRequest.data);
      const selectedScope = buildMayaSelectedQueryScope(runContext, selectedRequest);
      if (selectedScope.status === "blocked") {
        response.status(400).json({ error: "Realtime query selected evidence scope is not current." });
        return;
      }
      const result = await requestRealtimeClientSecret({
        env: runtimeEnv,
        ...(options.realtimeFetcher === undefined ? {} : { fetcher: options.realtimeFetcher }),
        question: selectedScope.normalizedRequest.question,
        recordIds: selectedScope.normalizedRequest.recordIds,
        selectedLineId: selectedScope.normalizedRequest.selectedLineId,
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
      const runContext = await loadRequiredForensicsRunContext(request, response, { riskObservationRequired: true });
      if (runContext === undefined) {
        return;
      }
      const result = handleRealtimeToolCall(parsedRequest.data, (name, input) =>
        name === "query.answer"
          ? invokeRealtimeQueryAnswerTool(runContext, input)
          : invokeServiceTool(name, input, { governedConfig: runContext.governedConfig, source: runContext.source })
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

function sendFailClosedJson(
  request: Request,
  response: Response,
  status: number,
  body: { error: string; missingSource: string } & Record<string, unknown>
): void {
  if (response.headersSent) {
    return;
  }

  response.status(status).json({
    ...body,
    correlationId: readRequestCorrelationId(request) ?? String(response.getHeader(recoupCorrelationIdHeader) ?? "")
  });
}

function createUnavailableEvalsFinopsRepository(): EvalsFinopsRepository {
  return {
    listActiveModelPricing: () => Promise.resolve([]),
    listModelPricingForPeriod: () => Promise.resolve([]),
    listAgentUsageRuns: () => Promise.resolve([]),
    listDailyRollups: () => Promise.resolve([]),
    listEvalGateResults: () => Promise.resolve([]),
    listOpenAiCostBuckets: () => Promise.resolve([]),
    listOpenRecommendations: () => Promise.resolve([]),
    loadLatestEvalRun: () => Promise.resolve(undefined),
    upsertAgentUsageRun: () => Promise.reject(new Error("Evals FinOps repository is unavailable.")),
    upsertEvalGateResults: () => Promise.reject(new Error("Evals FinOps repository is unavailable.")),
    upsertEvalGateRun: () => Promise.reject(new Error("Evals FinOps repository is unavailable."))
  };
}

async function persistForensicsQueryTokenUsageReceipt(input: {
  correlationId: string;
  env: RuntimeEnv;
  memoryFetcher: SupabaseMemoryFetch | undefined;
  queryResponse: ForensicsQuerySessionResponse;
  request: ForensicsSelectedQueryRequest;
}): Promise<void> {
  try {
    const supabaseMemory = createSupabaseMemoryRepositoryFromEnv(input.env, input.memoryFetcher);
    const evalsFinopsRepository = createSupabaseEvalsFinopsRepositoryFromEnv(input.env, input.memoryFetcher);
    const modelExecution = input.queryResponse.modelExecution;
    const tokenUsageSnapshot =
      modelExecution?.mode === "live_openai_agents" && modelExecution.tokenUsageSnapshot !== undefined
        ? modelExecution.tokenUsageSnapshot
        : modelExecution?.mode === "live_openai_agents" && modelExecution.tokenUsage !== undefined
          ? { totalTokens: modelExecution.tokenUsage }
          : undefined;
    if (
      (supabaseMemory === undefined && evalsFinopsRepository === undefined) ||
      input.queryResponse.answer === undefined ||
      modelExecution === undefined ||
      modelExecution.mode !== "live_openai_agents" ||
      tokenUsageSnapshot === undefined ||
      !Number.isSafeInteger(tokenUsageSnapshot.totalTokens) ||
      tokenUsageSnapshot.totalTokens <= 0
    ) {
      return;
    }

    const selectedLineId = input.request.selectedLineId;
    const submittedRecordIds = uniqueRecordIds(input.request.recordIds);
    const citedRecordIds = uniqueRecordIds(input.queryResponse.citations.map((citation) => citation.recordId));
    const receiptRecordIds = uniqueRecordIds([selectedLineId, ...submittedRecordIds, ...citedRecordIds]);
    const receiptPayload = buildOpenAiUsageReceiptPayload({
      agentName: "Forensics Investigator",
      capability: "deduction_forensics",
      correlationId: input.correlationId,
      deterministicBasis: input.queryResponse.deterministicBasis,
      modelExecutionMode: modelExecution.mode,
      rawModelTextPolicy: modelExecution.rawModelTextPolicy,
      recordIds: receiptRecordIds,
      usage: tokenUsageSnapshot
    });
    const mayaReceiptPayload = {
      ...receiptPayload,
      citedRecordIds,
      selectedLineId,
      submittedRecordIds
    };
    const receiptHash = sha256CanonicalJson(mayaReceiptPayload);
    const receiptId = `audit:forensics-query-token-usage:${receiptHash}`;

    await Promise.all([
      ...(supabaseMemory === undefined
        ? []
        : [
            supabaseMemory.append({
              category: "audit_refs",
              createdAt: new Date().toISOString(),
              id: receiptId,
              payload: mayaReceiptPayload,
              recordIds: receiptRecordIds,
              scope: `forensics-query:${selectedLineId}`,
              trustLevel: "trusted"
            })
          ]),
      ...(evalsFinopsRepository === undefined
        ? []
        : [
            evalsFinopsRepository.upsertAgentUsageRun({
              agentName: "Forensics Investigator",
              cachedInputTokens: tokenUsageSnapshot.cachedTokens ?? 0,
              cacheCapability: "deduction_forensics",
              citedRecordIds,
              correlationId: input.correlationId,
              createdAt: new Date().toISOString(),
              deterministicBasis: input.queryResponse.deterministicBasis,
              guardrailTripCount: 0,
              handoffCount: modelExecution.handoffCount,
              inputTokens: tokenUsageSnapshot.inputTokens ?? 0,
              modelExecutionMode: modelExecution.mode,
              modelId: runtimeModels.reasoning,
              serviceTier: runtimeOpenAiServiceTier,
              outputTokens: tokenUsageSnapshot.outputTokens ?? 0,
              promptCacheKey: receiptPayload.promptCacheKey,
              promptPrefixVersion: receiptPayload.promptPrefixVersion,
              reasoningTokens: 0,
              recordIds: receiptRecordIds,
              sourceReceiptId: receiptId,
              status: "succeeded",
              toolCallCount: input.queryResponse.trace.filter((event) => event.hook === "agent_tool_end").length,
              totalTokens: tokenUsageSnapshot.totalTokens,
              uncachedInputTokens:
                tokenUsageSnapshot.inputTokens === undefined
                  ? 0
                  : Math.max(0, tokenUsageSnapshot.inputTokens - (tokenUsageSnapshot.cachedTokens ?? 0)),
              usageRunId: `usage:maya-forensics-query:${receiptHash}`,
              workflowName: "maya_forensics_query"
            })
          ])
    ]);
  } catch (error) {
    const reason = sanitizeForensicsQueryTokenReceiptError(error);
    console.warn(
      JSON.stringify({
        correlationId: input.correlationId,
        event: "maya_forensics_query_token_usage_receipt_write_failed",
        ...(reason === "Supabase memory token-usage receipt write failed."
          ? { persistenceTask: "maya_query_token_usage_receipt" }
          : {}),
        reason,
        selectedLineId: input.request.selectedLineId
      })
    );
    return;
  }
}

async function persistDavidCreditQueryTokenUsageReceipt(input: {
  correlationId: string;
  env: RuntimeEnv;
  memoryFetcher: SupabaseMemoryFetch | undefined;
  queryResponse: CreditRiskQuerySessionResponse;
}): Promise<void> {
  try {
    const repository = createSupabaseEvalsFinopsRepositoryFromEnv(input.env, input.memoryFetcher);
    const memoryRepository = createSupabaseMemoryRepositoryFromEnv(input.env, input.memoryFetcher);
    const modelExecution = input.queryResponse.modelExecution;
    const deterministicBasis = input.queryResponse.deterministicBasis;
    const usage = modelExecution?.mode === "live_openai_agents" ? modelExecution.tokenUsageSnapshot : undefined;
    if (
      repository === undefined ||
      input.queryResponse.answer === undefined ||
      deterministicBasis === undefined ||
      modelExecution?.mode !== "live_openai_agents" ||
      usage === undefined ||
      !Number.isSafeInteger(usage.totalTokens) ||
      usage.totalTokens <= 0
    ) {
      return;
    }

    const citedRecordIds = uniqueRecordIds(input.queryResponse.citations.map((citation) => citation.recordId));
    const traceRecordIds = uniqueRecordIds(input.queryResponse.trace.flatMap((event) => event.recordIds));
    const recordIds = uniqueRecordIds([...citedRecordIds, ...traceRecordIds]);
    const completedToolNames = uniqueRecordIds(
      input.queryResponse.trace
        .filter((event) => event.hook === "agent_tool_end" && event.toolName !== undefined)
        .map((event) => event.toolName as string)
    );
    const receiptPayload = buildOpenAiUsageReceiptPayload({
      agentName: "David credit query workflow",
      capability: "credit_risk",
      correlationId: input.correlationId,
      deterministicBasis,
      modelExecutionMode: modelExecution.mode,
      rawModelTextPolicy: modelExecution.rawModelTextPolicy,
      recordIds,
      usage
    });
    const receiptHash = sha256CanonicalJson({
      ...receiptPayload,
      citedRecordIds,
      handoffCount: modelExecution.handoffCount,
      toolCallCount: completedToolNames.length
    });
    const sourceReceiptId = `audit:credit-query-token-usage:${receiptHash}`;
    const createdAt = new Date().toISOString();

    const usageRun = {
      agentName: "David credit query workflow",
      cachedInputTokens: usage.cachedTokens ?? 0,
      cacheCapability: "credit_risk",
      citedRecordIds,
      correlationId: input.correlationId,
      createdAt,
      deterministicBasis:
        `${deterministicBasis} Token totals are the successful aggregate workflow snapshot; handoffs and tools are counted from the governed trace.`,
      guardrailTripCount: 0,
      guardrailTripCountStatus: "unavailable",
      handoffCount: modelExecution.handoffCount,
      inputTokens: usage.inputTokens ?? 0,
      modelExecutionMode: modelExecution.mode,
      modelId: runtimeModels.fast,
      serviceTier: runtimeOpenAiServiceTier,
      outputTokens: usage.outputTokens ?? 0,
      participatingAgentNames: modelExecution.agentNames,
      promptCacheKey: receiptPayload.promptCacheKey,
      promptPrefixVersion: receiptPayload.promptPrefixVersion,
      reasoningTokens: 0,
      reasoningTokensStatus: "unavailable",
      recordIds,
      status: "succeeded",
      toolCallCount: completedToolNames.length,
      totalTokens: usage.totalTokens,
      uncachedInputTokens:
        usage.inputTokens === undefined ? 0 : Math.max(0, usage.inputTokens - (usage.cachedTokens ?? 0)),
      usageRunId: `usage:david-credit-query:${receiptHash}`,
      workflowName: "credit_risk"
    } as const;
    let durableSourceReceiptId: string | undefined;
    if (memoryRepository !== undefined) {
      try {
        await memoryRepository.append({
            category: "audit_refs",
            createdAt,
            id: sourceReceiptId,
            payload: {
              ...receiptPayload,
              citedRecordIds,
              handoffCount: modelExecution.handoffCount,
              toolCallCount: completedToolNames.length,
              workflowName: "credit_risk"
            },
            recordIds,
            scope: "credit-query:workflow",
            trustLevel: "trusted"
          });
        durableSourceReceiptId = sourceReceiptId;
      } catch (error) {
        console.warn(JSON.stringify({
          correlationId: input.correlationId,
          event: "david_credit_query_audit_receipt_write_failed",
          reason: error instanceof Error ? error.message : "Unknown audit persistence failure."
        }));
      }
    }
    await repository.upsertAgentUsageRun({
      ...usageRun,
      ...(durableSourceReceiptId === undefined ? {} : { sourceReceiptId: durableSourceReceiptId })
    });
  } catch (error) {
    console.warn(JSON.stringify({
      correlationId: input.correlationId,
      event: "david_credit_query_token_usage_receipt_write_failed",
      reason: error instanceof Error ? error.message : "Unknown persistence failure."
    }));
  }
}

const davidCreditQueryOptionalPersistenceTimeoutMs = 2_000;

async function awaitBoundedDavidCreditQueryOptionalPersistence(input: {
  correlationId: string;
  env: RuntimeEnv;
  memoryFetcher: SupabaseMemoryFetch | undefined;
  queryResponse: CreditRiskQuerySessionResponse;
}): Promise<void> {
  const controller = new AbortController();
  const fetcher = input.memoryFetcher ?? fetch;
  const signalAwareFetcher: SupabaseMemoryFetch = (url, init) =>
    controller.signal.aborted
      ? Promise.reject(new DOMException("Aborted", "AbortError"))
      : fetcher(url, { ...init, signal: controller.signal });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    persistDavidCreditQueryTokenUsageReceipt({
      correlationId: input.correlationId,
      env: input.env,
      memoryFetcher: signalAwareFetcher,
      queryResponse: input.queryResponse
    }).then(() => "completed" as const),
    new Promise<"timed_out">((resolve) => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve("timed_out");
      }, davidCreditQueryOptionalPersistenceTimeoutMs);
    })
  ]);
  if (timeout !== undefined) {
    clearTimeout(timeout);
  }
  if (result === "timed_out") {
    console.warn(JSON.stringify({
      correlationId: input.correlationId,
      event: "david_credit_query_optional_persistence_timeout",
      timeoutMs: davidCreditQueryOptionalPersistenceTimeoutMs
    }));
  }
}

const forensicsQueryOptionalPersistenceTimeoutMs = 2_000;

async function awaitBoundedForensicsQueryOptionalPersistence(input: {
  correlationId: string;
  selectedLineId: string;
  task: Promise<void>;
  taskName: "maya_query_case_recall_memory" | "maya_query_scope_memory" | "maya_query_token_usage_receipt";
}): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    input.task
      .then(() => "completed" as const)
      .catch((error: unknown) => {
        console.warn(
          JSON.stringify({
            correlationId: input.correlationId,
            event: "maya_forensics_query_optional_persistence_failed",
            persistenceTask: input.taskName,
            reason: error instanceof Error ? error.message : "Unknown persistence failure.",
            selectedLineId: input.selectedLineId
          })
        );
        return "failed" as const;
      }),
    new Promise<"timed_out">((resolve) => {
      timeout = setTimeout(() => {
        resolve("timed_out");
      }, forensicsQueryOptionalPersistenceTimeoutMs);
    })
  ]);

  if (timeout !== undefined) {
    clearTimeout(timeout);
  }
  if (result === "timed_out") {
    console.warn(
      JSON.stringify({
        correlationId: input.correlationId,
        event: "maya_forensics_query_optional_persistence_timeout",
        persistenceTask: input.taskName,
        selectedLineId: input.selectedLineId,
        timeoutMs: forensicsQueryOptionalPersistenceTimeoutMs
      })
    );
  }
}

async function loadMayaForensicsQueryRecallContext(input: {
  env: RuntimeEnv;
  memoryFetcher: SupabaseMemoryFetch | undefined;
  selectedLineId: string;
}): Promise<MayaQueryMemoryRecallContext | undefined> {
  if (input.env.RECOUP_MAYA_QUERY_MEMORY_RECALL !== "enabled" || !isSafeMayaQueryMemoryRecordId(input.selectedLineId)) {
    return undefined;
  }

  try {
    const supabaseMemory = createSupabaseMemoryRepositoryFromEnv(input.env, input.memoryFetcher);
    if (supabaseMemory !== undefined) {
      return buildMayaQueryMemoryRecallContext(await supabaseMemory.list(`case:${input.selectedLineId}`), input.selectedLineId);
    }

    const dbPath = input.env.RECOUP_MEMORY_DB_PATH?.trim();
    if (dbPath === undefined || dbPath.length === 0) {
      return undefined;
    }

    const memoryStore = createRuntimeMemoryStore(input.env);
    try {
      return buildMayaQueryMemoryRecallContext(readMayaCaseRecallMemories(memoryStore, input.selectedLineId), input.selectedLineId);
    } finally {
      memoryStore.close();
    }
  } catch {
    return undefined;
  }
}

async function persistMayaForensicsQueryScopeMemory(input: {
  env: RuntimeEnv;
  memoryFetcher: SupabaseMemoryFetch | undefined;
  queryResponse: ForensicsQuerySessionResponse;
  request: ForensicsSelectedQueryRequest;
  sessionId: string;
}): Promise<void> {
  try {
    const requestedScopeRecordIds = uniqueRecordIds([input.request.selectedLineId, ...input.request.recordIds]);
    if (!requestedScopeRecordIds.every(isSafeMayaQueryMemoryRecordId)) {
      return;
    }

    const scopeRecordIds = uniqueRecordIds([
      ...requestedScopeRecordIds,
      ...input.queryResponse.citations.map((citation) => citation.recordId),
      ...input.queryResponse.trace.flatMap((event) => event.recordIds)
    ]);
    if (!scopeRecordIds.every(isSafeMayaQueryMemoryRecordId)) {
      return;
    }

    const memoryRecord = writeMayaQueryScopeMemory(createInMemoryStore(), {
      deterministicBasis: "POST /forensics/query selected evidence scope",
      recordIds: scopeRecordIds,
      selectedLineId: input.request.selectedLineId,
      sessionId: input.sessionId,
      status: input.queryResponse.answer === undefined ? "blocked" : "answered"
    });

    const supabaseMemory = createSupabaseMemoryRepositoryFromEnv(input.env, input.memoryFetcher);
    if (supabaseMemory !== undefined) {
      await supabaseMemory.append(memoryRecord);
      return;
    }

    const dbPath = input.env.RECOUP_MEMORY_DB_PATH?.trim();
    if (dbPath === undefined || dbPath.length === 0) {
      return;
    }

    const memoryStore = createRuntimeMemoryStore(input.env);
    try {
      memoryStore.append(memoryRecord);
    } finally {
      memoryStore.close();
    }
  } catch {
    return;
  }
}

async function persistMayaForensicsCaseRecallMemory(input: {
  env: RuntimeEnv;
  memoryFetcher: SupabaseMemoryFetch | undefined;
  queryResponse: ForensicsQuerySessionResponse;
  request: ForensicsSelectedQueryRequest;
  sessionId: string;
}): Promise<void> {
  try {
    if (input.queryResponse.answer === undefined) {
      return;
    }

    const requestedScopeRecordIds = uniqueRecordIds([input.request.selectedLineId, ...input.request.recordIds]);
    if (!requestedScopeRecordIds.every(isSafeMayaQueryMemoryRecordId)) {
      return;
    }

    const scopeRecordIds = uniqueRecordIds([
      ...requestedScopeRecordIds,
      ...input.queryResponse.citations.map((citation) => citation.recordId),
      ...input.queryResponse.trace.flatMap((event) => event.recordIds)
    ]);
    if (!scopeRecordIds.every(isSafeMayaQueryMemoryRecordId)) {
      return;
    }

    const memoryRecord = writeMayaCaseRecallMemory(createInMemoryStore(), {
      caseId: input.request.selectedLineId,
      deterministicBasis: "POST /forensics/query cited records + deterministic query basis",
      recordIds: scopeRecordIds,
      selectedLineId: input.request.selectedLineId,
      sessionId: input.sessionId,
      status: "answered"
    });

    const supabaseMemory = createSupabaseMemoryRepositoryFromEnv(input.env, input.memoryFetcher);
    if (supabaseMemory !== undefined) {
      await supabaseMemory.append(memoryRecord);
      return;
    }

    const dbPath = input.env.RECOUP_MEMORY_DB_PATH?.trim();
    if (dbPath === undefined || dbPath.length === 0) {
      return;
    }

    const memoryStore = createRuntimeMemoryStore(input.env);
    try {
      memoryStore.append(memoryRecord);
    } finally {
      memoryStore.close();
    }
  } catch {
    return;
  }
}

interface ApprovalRecordsSnapshot {
  records: MemoryRecord[];
  source: ApprovalRecordSourceMetadata;
}

function buildCreditRiskApprovalReceipts(records: readonly MemoryRecord[]): CreditRiskApprovalReceipt[] {
  const receipts: CreditRiskApprovalReceipt[] = [];

  for (const record of records) {
    if (record.category !== "approval_records" || record.trustLevel !== "trusted") {
      continue;
    }

    const actionId = readApprovalPayloadString(record, "actionId");
    if (!looksLikeCreditRiskApprovalRecord(record, actionId)) {
      continue;
    }

    if (actionId === undefined || !actionId.startsWith("credit-v2:")) {
      throw new Error("Malformed credit approval receipt.");
    }

    const approverId = readApprovalPayloadString(record, "approverId");
    const auditEntryHash = readApprovalPayloadString(record, "auditEntryHash");
    const status = readApprovalPayloadString(record, "status");

    const expectedScope = `approval:${actionId}`;
    if (
      record.id !== expectedScope ||
      record.scope !== expectedScope ||
      approverId === undefined ||
      !approverId.startsWith("human:") ||
      status !== "human_decided" ||
      auditEntryHash === undefined ||
      !/^[a-f0-9]{64}$/u.test(auditEntryHash) ||
      !record.recordIds.includes(actionId)
    ) {
      throw new Error("Malformed credit approval receipt.");
    }

    receipts.push({
      actionId,
      approvalStatus: "committed",
      auditEntryHash
    });
  }

  return receipts;
}

/**
 * Approved Maya recovery recommendations, rebuilt from the governed credit rows so David's signal
 * carries the values that were approved rather than anything a client supplied. Rejected and
 * modified decisions never become signals.
 */
/** Whether a human approval for this recommendation is committed. Mirrors the row builder's checks. */
function hasCommittedCreditRecommendationApproval(records: readonly MemoryRecord[], actionId: string): boolean {
  const expectedScope = `approval:${actionId}`;

  return records.some(
    (record) =>
      record.category === "approval_records" &&
      record.trustLevel === "trusted" &&
      record.id === expectedScope &&
      record.scope === expectedScope &&
      record.recordIds.includes(actionId) &&
      readApprovalPayloadString(record, "actionId") === actionId &&
      readApprovalPayloadString(record, "approverId")?.startsWith("human:") === true &&
      readApprovalPayloadString(record, "status") === "human_decided" &&
      readApprovalPayloadString(record, "decision") === "approve"
  );
}

/** Scope and id for a credit-lead acknowledgement of an approved recommendation. */
function creditRecommendationAcknowledgementScope(actionId: string): string {
  return `acknowledgement:${actionId}`;
}

/** When the credit lead confirmed receipt, if they have. */
function readCreditRecommendationAcknowledgedAt(
  records: readonly MemoryRecord[],
  actionId: string
): string | undefined {
  const scope = creditRecommendationAcknowledgementScope(actionId);
  for (const record of records) {
    if (
      record.category !== "case_state" ||
      record.trustLevel !== "trusted" ||
      record.id !== scope ||
      record.scope !== scope ||
      !record.recordIds.includes(actionId)
    ) {
      continue;
    }

    const payload = record.payload as Record<string, unknown> | undefined;
    const acknowledgedAt = payload?.["acknowledgedAt"];
    const acknowledgedBy = payload?.["acknowledgedBy"];
    if (typeof acknowledgedAt === "string" && typeof acknowledgedBy === "string" && acknowledgedBy.startsWith("human:")) {
      return acknowledgedAt;
    }
  }

  return undefined;
}

function buildApprovedCreditRecommendationRows(
  records: readonly MemoryRecord[],
  rows: CreditRiskRows
): ApprovedCreditRecommendationRow[] {
  const approved: ApprovedCreditRecommendationRow[] = [];

  for (const record of records) {
    if (record.category !== "approval_records" || record.trustLevel !== "trusted") {
      continue;
    }

    const actionId = readApprovalPayloadString(record, "actionId");
    if (actionId === undefined || !actionId.startsWith(creditRecommendationActionIdPrefix)) {
      continue;
    }

    const approverId = readApprovalPayloadString(record, "approverId");
    const expectedScope = `approval:${actionId}`;
    if (
      record.id !== expectedScope ||
      record.scope !== expectedScope ||
      approverId?.startsWith("human:") !== true ||
      readApprovalPayloadString(record, "status") !== "human_decided" ||
      readApprovalPayloadString(record, "decision") !== "approve" ||
      !record.recordIds.includes(actionId)
    ) {
      continue;
    }

    const acknowledgedAt = readCreditRecommendationAcknowledgedAt(records, actionId);
    const parsed = parseCreditRecommendationActionId(actionId);
    const account = parsed === undefined ? undefined : findCreditAccountForLine(rows, parsed.lineId);
    if (parsed === undefined || account === undefined) {
      continue;
    }

    const core = buildCreditRecommendationCores({
      account,
      asOfDate: rows.snapshot.asOfDate,
      lineId: parsed.lineId,
      recordIds: record.recordIds.filter((recordId) => recordId !== actionId)
    }).find((candidate) => candidate.actionId === actionId);
    if (core === undefined) {
      continue;
    }

    const scenarioId = creditRecommendationScenarioId(parsed.lineId);
    approved.push({
      accountId: core.accountId,
      actionId: core.actionId,
      amount: core.amount,
      basis: core.basis,
      ...(acknowledgedAt === undefined ? {} : { acknowledgedAt }),
      caseLabel: parsed.lineId,
      decidedAt: record.createdAt,
      currentLabel: core.currentLabel,
      kind: core.kind,
      proposedLabel: core.proposedLabel,
      recordIds: core.recordIds,
      scenarioId: scenarioId ?? parsed.lineId
    });
  }

  return approved;
}

function looksLikeCreditRiskApprovalRecord(record: MemoryRecord, actionId: string | undefined): boolean {
  if (
    actionId?.startsWith("credit-v2:negotiation:") === true ||
    record.id.startsWith("approval:credit-v2:negotiation:") ||
    record.scope.startsWith("approval:credit-v2:negotiation:")
  ) {
    return false;
  }

  return (
    actionId?.startsWith("credit-v2:") === true ||
    record.id.startsWith("approval:credit-v2:") ||
    record.scope.startsWith("approval:credit-v2:")
  );
}

async function loadApprovalRecords(
  env: RuntimeEnv,
  memoryFetcher: SupabaseMemoryFetch | undefined
): Promise<ApprovalRecordsSnapshot> {
  const supabaseMemory = createSupabaseMemoryRepositoryFromEnv(env, memoryFetcher);
  if (supabaseMemory !== undefined) {
    return {
      records: await supabaseMemory.listAll(),
      source: {
        sourceKind: "supabase",
        sourceName: "Supabase approval receipt memory"
      }
    };
  }

  const memoryStore = createRuntimeMemoryStore(env);
  try {
    return {
      records: memoryStore.listAll(),
      source: {
        sourceKind: "derived_backend",
        sourceName:
          memoryStore.mode === "sqlite"
            ? "SQLite approval receipt memory projection"
            : "In-memory approval receipt fallback projection"
      }
    };
  } finally {
    memoryStore.close();
  }
}

function readApprovalPayloadString(record: MemoryRecord, key: string): string | undefined {
  const value = record.payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

async function loadApprovalRecordsOrFailClosed(
  request: Request,
  response: Response,
  env: RuntimeEnv,
  memoryFetcher: SupabaseMemoryFetch | undefined
): Promise<ApprovalRecordsSnapshot | undefined> {
  try {
    return await loadApprovalRecords(env, memoryFetcher);
  } catch {
    sendFailClosedJson(request, response, 503, {
      error: "Maya approval receipt state is unavailable from governed backend sources.",
      missingSource: "approval_records"
    });
    return undefined;
  }
}

function sanitizeForensicsQueryTokenReceiptError(error: unknown): string {
  if (error instanceof Error && /^Supabase memory request failed with HTTP \d{3}\.$/u.test(error.message)) {
    return error.message;
  }

  return "Supabase memory token-usage receipt write failed.";
}

function isSafeMayaQueryMemoryRecordId(recordId: string): boolean {
  return safeMayaQueryMemoryRecordIdPattern.test(recordId) && !unsafeMayaQueryMemoryRecordIdPattern.test(recordId);
}

export function buildTrustedMayaSelectedEvidencePackRecordIds(input: {
  selectedEvidencePackRecordIds: readonly string[];
  selectedWorkItemLineIds?: readonly string[];
  selectedWorkItemProvenanceRecordIds?: readonly string[];
}): string[] {
  void input.selectedWorkItemLineIds;
  void input.selectedWorkItemProvenanceRecordIds;
  return uniqueRecordIds([...input.selectedEvidencePackRecordIds]);
}

function buildMayaSelectedQueryScope(
  runContext: GovernedForensicsRunContext,
  request: ForensicsSelectedQueryRequest
): MayaSelectedQueryScope {
  if (
    !isSafeMayaQueryMemoryRecordId(request.selectedLineId) ||
    request.recordIds.some((recordId) => !isSafeMayaQueryMemoryRecordId(recordId))
  ) {
    return { status: "blocked" };
  }

  const queryModelOptions = {
    governedConfig: runContext.governedConfig,
    ...(runContext.reconciliation === undefined ? {} : { reconciliation: runContext.reconciliation }),
    serviceContext: runContext.serviceContext,
    settlementSource: runContext.source
  };
  const selectedDetail = buildForensicsWorkItemDetailCockpitModel(
    queryModelOptions,
    request.selectedLineId
  );
  const selectedWorklistItem = buildForensicsCockpitModel(queryModelOptions).worklist.find(
    (item) =>
      item.lineId === request.selectedLineId ||
      item.lineIds.includes(request.selectedLineId)
  );
  const backendEvidencePackRecordIds = buildTrustedMayaSelectedEvidencePackRecordIds({
    selectedEvidencePackRecordIds: selectedDetail.selected.evidencePack.recordIds,
    ...(selectedWorklistItem?.lineIds === undefined ? {} : { selectedWorkItemLineIds: selectedWorklistItem.lineIds }),
    ...(selectedWorklistItem?.provenance.recordIds === undefined
      ? {}
      : { selectedWorkItemProvenanceRecordIds: selectedWorklistItem.provenance.recordIds })
  });
  const selectedQueryScopedRecordIds = uniqueRecordIds([
    request.selectedLineId,
    ...request.recordIds.filter((recordId) => backendEvidencePackRecordIds.includes(recordId))
  ]);

  return {
    hasOutOfScopeSubmittedRecordId: request.recordIds.some(
      (recordId) =>
        recordId !== request.selectedLineId &&
        !backendEvidencePackRecordIds.includes(recordId)
    ),
    normalizedRequest: {
      ...request,
      recordIds: selectedQueryScopedRecordIds
    },
    status: "ready",
    trustedEvidencePackRecordIds: selectedQueryScopedRecordIds
  };
}

function invokeRealtimeQueryAnswerTool(runContext: GovernedForensicsRunContext, input: unknown): unknown {
  const parsed = forensicsSelectedQueryRequestSchema.parse(input);
  const selectedScope = buildMayaSelectedQueryScope(runContext, parsed);
  if (selectedScope.status === "blocked") {
    throw new Error("query.answer input is outside the selected evidence scope.");
  }

  const scopedRecordIds = uniqueRecordIds([
    selectedScope.normalizedRequest.selectedLineId,
    ...selectedScope.normalizedRequest.recordIds
  ]);
  return invokeServiceTool("query.answer", selectedScope.normalizedRequest, {
    ...runContext.serviceContext,
    governedConfig: runContext.governedConfig,
    ...(runContext.reconciliation === undefined ? {} : { reconciliation: runContext.reconciliation }),
    queryAnswerScope: {
      recordIds: scopedRecordIds,
      selectedLineId: selectedScope.normalizedRequest.selectedLineId
    },
    source: runContext.source
  });
}

function blockedForensicsSelectedScopeQueryResponse(): ForensicsQuerySessionResponse {
  return {
    citations: [],
    modelExecution: {
      deterministicBasis: liveForensicsQueryRequiredBasis,
      mode: "blocked_live_agent_trace",
      reason: "Selected evidence scope is not current for this Maya case."
    },
    trace: []
  };
}

function buildFixtureForensicsRunContext(): {
  governedConfig: GovernedConfigValues;
  serviceContext: ServiceInvocationContext;
  source: SourcePort;
} {
  const governedConfig = day1GovernedConfigSeed.values;
  const source = new SyntheticSource({ seed: governedConfig.seed });

  return {
    governedConfig,
    serviceContext: {
      governedConfig,
      requireSupabaseSapEvidence: true,
      requireSupabaseSyntheticEvidence: true,
      sapEvidenceSource: {
        readEvidence(line) {
          return line.recordIds
            .filter((recordId) => recordId.startsWith("INV-"))
            .map((recordId): EvidenceDocument => ({
              documentId: `SAP-${recordId}`,
              documentType: "invoice",
              recordIds: [line.lineId, recordId, `SAP-${recordId}`],
              source: "sap",
              summary: `Fixture SAP source row for ${recordId}.`
            }));
        }
      },
      source,
      syntheticEvidenceSource: {
        readEvidence(connectorName, line) {
          return retrieveFixtureSyntheticEvidence(connectorName, line);
        }
      }
    },
    source
  };
}

function retrieveFixtureSyntheticEvidence(
  connectorName: ServiceSyntheticEvidenceConnectorName,
  line: DeductionLine
): readonly EvidenceDocument[] {
  if (connectorName === "bureau") {
    return retrieveBureau(line);
  }
  if (connectorName === "tpm") {
    return retrieveTpm(line);
  }

  return retrieveDocs(line);
}

function readRecoupDataMode(env: RuntimeEnv): RecoupDataMode {
  return env.RECOUP_DATA_MODE?.trim() === "fixture" ? "fixture" : "real-backend";
}

function isReadModelPayloadForSurface(
  value: unknown,
  surface: "connector-readiness" | "credit-risk-review" | "forensics-analyst"
): value is Record<string, unknown> {
  if (!isRecord(value) || value.surface !== surface) {
    return false;
  }

  if (surface === "forensics-analyst") {
    return typeof value.settlementRunId === "string" && value.settlementRunId.trim().length > 0;
  }

  if (surface === "credit-risk-review") {
    return Array.isArray(value.accounts) && value.accounts.length > 0;
  }

  return true;
}

function collectReadModelSourceRecordIds(
  model: Record<string, unknown>,
  surface: "connector-readiness" | "credit-risk-review" | "forensics-analyst"
): string[] {
  const recordIds = new Set<string>(surface === "credit-risk-review" ? [] : forensicsSourceContextTableIdentity);
  collectRecordIdsFromUnknown(model, recordIds, false);

  return [...recordIds].sort();
}

function collectRecordIdsFromUnknown(value: unknown, recordIds: Set<string>, acceptStringArray: boolean): void {
  if (Array.isArray(value)) {
    if (acceptStringArray && value.every((item) => typeof item === "string")) {
      for (const item of value) {
        if (item.trim().length > 0) {
          recordIds.add(item);
        }
      }
      return;
    }

    for (const item of value) {
      collectRecordIdsFromUnknown(item, recordIds, false);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === "recordIds") {
      collectRecordIdsFromUnknown(child, recordIds, true);
      continue;
    }

    collectRecordIdsFromUnknown(child, recordIds, false);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readForensicsSourceContextCacheTtlMs(env: RuntimeEnv): number {
  const configured = env.RECOUP_FORENSICS_SOURCE_CONTEXT_CACHE_TTL_MS?.trim();
  if (configured === undefined || configured.length === 0) {
    return defaultForensicsSourceContextCacheTtlMs;
  }

  const parsed = Number(configured);
  if (!Number.isFinite(parsed)) {
    return defaultForensicsSourceContextCacheTtlMs;
  }
  if (parsed <= 0) {
    return 0;
  }

  return Math.min(Math.floor(parsed), defaultForensicsSourceContextCacheTtlMs);
}

function readCockpitRateLimitConfig(env: RuntimeEnv): CockpitRateLimitConfig {
  const configuredMaxRequests = readOptionalPositiveIntegerEnv(env, cockpitRateLimitMaxRequestsEnv);
  const configuredWindowMs = readOptionalPositiveIntegerEnv(env, cockpitRateLimitWindowMsEnv);
  if (configuredMaxRequests.status === "missing" && configuredWindowMs.status === "missing") {
    return { status: "disabled" };
  }
  if (configuredMaxRequests.status !== "present" || configuredWindowMs.status !== "present") {
    return { status: "invalid" };
  }

  return {
    maxRequests: configuredMaxRequests.value,
    status: "enabled",
    windowMs: configuredWindowMs.value
  };
}

function readOptionalPositiveIntegerEnv(
  env: RuntimeEnv,
  name: string
): { status: "missing" } | { status: "present"; value: number } | { status: "invalid" } {
  const configured = env[name]?.trim();
  if (configured === undefined || configured.length === 0) {
    return { status: "missing" };
  }

  const parsed = Number(configured);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return { status: "invalid" };
  }

  return { status: "present", value: parsed };
}

function createCockpitRateLimitMiddleware(
  route: CockpitRateLimitedRoute,
  config: CockpitRateLimitConfig,
  buckets: Map<string, CockpitRateLimitBucket>,
  env: RuntimeEnv
): express.RequestHandler {
  return (request, response, next) => {
    if (config.status === "disabled") {
      next();
      return;
    }

    if (config.status === "invalid") {
      response.status(503).json({
        error: "Cockpit request rate limit configuration invalid.",
        route
      });
      return;
    }

    const nowMs = Date.now();
    const bucketKey = cockpitRateLimitBucketKey(route, readCockpitRateLimitClientIdentity(request, env));
    const bucket = buckets.get(bucketKey);
    if (bucket === undefined || bucket.resetAtMs <= nowMs) {
      buckets.set(bucketKey, {
        count: 1,
        resetAtMs: nowMs + config.windowMs
      });
      next();
      return;
    }

    if (bucket.count >= config.maxRequests) {
      response.status(429).json({
        error: "Cockpit request rate limit exceeded.",
        route
      });
      return;
    }

    bucket.count += 1;
    next();
  };
}

function cockpitRateLimitBucketKey(route: CockpitRateLimitedRoute, clientIdentity: string): string {
  return `${route}:${clientIdentity}`;
}

function readCockpitRateLimitClientIdentity(request: Request, env: RuntimeEnv): string {
  const directPrincipal = verifyDirectHumanCockpitPrincipal(request, env);
  if (directPrincipal !== undefined) {
    return `principal:${directPrincipal}`;
  }

  return `ip:${readSocketClientAddress(request)}`;
}

function readSocketClientAddress(request: Request): string {
  return request.socket.remoteAddress ?? request.ip ?? "unknown";
}

function readSupabaseSourceIdentity(env: RuntimeEnv): string {
  const configured = env.SUPABASE_URL?.trim();
  if (configured === undefined || configured.length === 0) {
    return "missing-supabase-url";
  }

  try {
    const parsed = new URL(configured);
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/u, "")}`;
  } catch {
    return configured.replace(/\/+$/u, "");
  }
}

function readOpenAiEvidenceVectorStoreIdentity(env: RuntimeEnv): string {
  const apiKey = env.OPENAI_API_KEY?.trim();
  const vectorStoreId = env.OPENAI_EVIDENCE_VECTOR_STORE_ID?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    return "missing-openai-api-key";
  }
  if (vectorStoreId === undefined || vectorStoreId.length === 0) {
    return "missing-openai-evidence-vector-store-id";
  }

  return `openai-vector-store:${vectorStoreId}`;
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

  if (expectedToken === undefined || expectedToken.length === 0) {
    return { error: "Verified human cockpit auth required.", success: false };
  }

  const directPrincipal = verifyDirectHumanCockpitPrincipal(request, env);
  if (directPrincipal !== undefined) {
    return { principal: directPrincipal, success: true };
  }

  const proxyPrincipal = verifyHumanProxyAuth(request, env, expectedToken, options);
  if (proxyPrincipal !== undefined) {
    return { principal: proxyPrincipal, success: true };
  }

  return { error: "Verified human cockpit auth required.", success: false };
}

function cockpitDemoRoleForPrincipal(principal: string): CockpitDemoRole | undefined {
  return (Object.entries(cockpitHumanPrincipalByDemoRole) as Array<[CockpitDemoRole, string]>).find(
    ([, configuredPrincipal]) => configuredPrincipal === principal
  )?.[0];
}

function resolveCreditReadModelRefreshTimeoutMs(value: string | undefined): number {
  if (value === undefined) {
    return defaultCreditReadModelRefreshTimeoutMs;
  }
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultCreditReadModelRefreshTimeoutMs;
}

function isAbortSignalAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

function verifyDirectHumanCockpitPrincipal(request: express.Request, env: RuntimeEnv): string | undefined {
  const expectedToken = env.RECOUP_COCKPIT_AUTH_TOKEN?.trim();
  const expectedPrincipal = env.RECOUP_COCKPIT_HUMAN_PRINCIPAL?.trim() ?? defaultCockpitHumanPrincipal;
  const requestPrincipal = request.header(humanPrincipalHeader)?.trim();
  const requestToken = request.header(humanTokenHeader)?.trim();

  if (
    expectedToken !== undefined &&
    expectedToken.length > 0 &&
    requestPrincipal !== undefined &&
    requestPrincipal.startsWith("human:") &&
    requestPrincipal === expectedPrincipal &&
    requestToken !== undefined &&
    constantTimeEqual(requestToken, expectedToken)
  ) {
    return requestPrincipal;
  }

  return undefined;
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
    issuedAt === undefined ||
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

  consumeHumanProxyNonce(options.proxyPurpose, role, nonce, issuedAt);
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
  evictExpiredHumanProxyNonces(Date.now());
  return consumedHumanProxyNonces.has(humanProxyNonceKey(purpose, role, nonce));
}

function consumeHumanProxyNonce(purpose: CockpitHumanProxyPurpose, role: string, nonce: string, issuedAt: string): void {
  const now = Date.now();
  evictExpiredHumanProxyNonces(now);
  consumedHumanProxyNonces.set(
    humanProxyNonceKey(purpose, role, nonce),
    new Date(issuedAt).valueOf() + cockpitHumanProxyIssuedAtFreshnessWindowMs
  );
}

function humanProxyNonceKey(purpose: CockpitHumanProxyPurpose, role: string, nonce: string): string {
  return `${purpose}:${role}:${nonce}`;
}

function evictExpiredHumanProxyNonces(now: number): void {
  for (const [key, expiresAt] of consumedHumanProxyNonces.entries()) {
    if (expiresAt < now) {
      consumedHumanProxyNonces.delete(key);
    }
  }
}

interface ApprovalDecisionResponse {
  actionId: string;
  approverId: string;
  auditEntryHash: string;
  decision: "approve" | "modify" | "reject";
  reason?: string;
  status: "human_decided";
}

interface DemoLifecycleResetResponse {
  actionId: string;
  adminAuditId: string;
  deletedRecordCount: number;
  preservedSourceData: true;
  resetScope: string;
  status: "reset_recorded";
}

function approvalMemoryScope(actionId: string): string {
  return `approval:${actionId}`;
}

function isAdminResetPrincipal(principal: string, env: RuntimeEnv): boolean {
  const configured = env.RECOUP_COCKPIT_ADMIN_PRINCIPAL?.trim();
  if (configured !== undefined && configured.length > 0) {
    return principal === configured;
  }

  return principal === "human:cfo-lead";
}

async function resetDemoLifecycleRecords(input: {
  actionId: string;
  env: RuntimeEnv;
  memoryFetcher: SupabaseMemoryFetch | undefined;
  operatorPrincipal: string;
  reason?: string;
}): Promise<DemoLifecycleResetResponse> {
  const resetScope = approvalMemoryScope(input.actionId);
  const supabaseMemory = createSupabaseMemoryRepositoryFromEnv(input.env, input.memoryFetcher);
  const adminAuditId = `admin-reset:${input.actionId}:${randomUUID()}`;
  const auditRecord = buildAdminDemoResetAuditRecord({
    actionId: input.actionId,
    adminAuditId,
    operatorPrincipal: input.operatorPrincipal,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    resetScope
  });
  let deletedRecordCount: number;

  if (supabaseMemory !== undefined) {
    deletedRecordCount = await supabaseMemory.resetApprovalLifecycle({
      approvalRecordId: resetScope,
      approvalScope: resetScope,
      auditRecord
    });

    return {
      actionId: input.actionId,
      adminAuditId,
      deletedRecordCount,
      preservedSourceData: true,
      resetScope,
      status: "reset_recorded"
    };
  }

  const memoryStore = createRuntimeMemoryStore(input.env);
  try {
    deletedRecordCount = memoryStore.resetApprovalLifecycle({
      approvalRecordId: resetScope,
      approvalScope: resetScope,
      auditRecord
    });
  } finally {
    memoryStore.close();
  }

  return {
    actionId: input.actionId,
    adminAuditId,
    deletedRecordCount,
    preservedSourceData: true,
    resetScope,
    status: "reset_recorded"
  };
}

function buildAdminDemoResetAuditRecord(input: {
  actionId: string;
  adminAuditId: string;
  operatorPrincipal: string;
  reason?: string;
  resetScope: string;
}): MemoryRecord {
  return {
    category: "audit_refs",
    createdAt: new Date().toISOString(),
    id: input.adminAuditId,
    payload: {
      actionId: input.actionId,
      lifecycleCategories: ["approval_records"],
      operation: "demo_lifecycle_reset",
      operatorPrincipal: input.operatorPrincipal,
      preservedSourceData: true,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      resetScope: input.resetScope
    },
    recordIds: [input.actionId],
    scope: `admin-reset:${input.actionId}`,
    trustLevel: "trusted"
  };
}

async function commitSupabaseApprovalDecision(
  env: RuntimeEnv,
  memoryFetcher: SupabaseMemoryFetch | undefined,
  prepared: PreparedApprovalDecision,
  options: {
    negotiationRecipientProof?: { configKey: "HARBOR_AP_CONTACT_EMAIL"; recipientHash: string } | undefined;
  } = {}
): Promise<ApprovalDecisionResponse> {
  if (isCreditNegotiationApprovalAction(prepared.action)) {
    await persistCreditNegotiationApprovedDraft(
      env,
      memoryFetcher,
      prepared.action,
      options.negotiationRecipientProof
    );
  }

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
        memoryRecord: buildApprovalMemoryRecord(approval, prepared.action, options.negotiationRecipientProof),
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

function buildApprovalMemoryRecord(
  approval: ApprovalDecisionResponse,
  action: PreparedApprovalDecision["action"],
  negotiationRecipientProof: { configKey: "HARBOR_AP_CONTACT_EMAIL"; recipientHash: string } | undefined
): MemoryRecord {
  const negotiationDraftPayload = negotiationApprovalPayload(action, negotiationRecipientProof);
  return {
    category: "approval_records",
    createdAt: new Date().toISOString(),
    id: `approval:${approval.actionId}`,
    payload: {
      actionId: approval.actionId,
      approverId: approval.approverId,
      auditEntryHash: approval.auditEntryHash,
      ...negotiationDraftPayload,
      decision: approval.decision,
      ...(approval.reason === undefined ? {} : { reason: approval.reason }),
      status: approval.status
    },
    recordIds: uniqueRecordIds([approval.actionId, ...action.recordIds]),
    scope: approvalMemoryScope(approval.actionId),
    trustLevel: "trusted"
  };
}

function negotiationApprovalPayload(
  action: PreparedApprovalDecision["action"],
  negotiationRecipientProof: { configKey: "HARBOR_AP_CONTACT_EMAIL"; recipientHash: string } | undefined
):
  | {
      approvedBodyHash: string;
      approvedDraftRecordId: string;
      approvedRecipientConfigKey: "HARBOR_AP_CONTACT_EMAIL";
      approvedSubjectHash: string;
      approvedToHash: string;
    }
  | Record<string, never> {
  if (!isCreditNegotiationApprovalAction(action)) {
    return {};
  }
  if (negotiationRecipientProof === undefined) {
    throw new Error("Credit negotiation approval recipient is unavailable.");
  }

  return {
    approvedBodyHash: action.approvedDraft.bodyHash,
    approvedDraftRecordId: creditNegotiationApprovedDraftRecordId(action.actionId),
    approvedRecipientConfigKey: negotiationRecipientProof.configKey,
    approvedSubjectHash: sha256Hex(action.approvedDraft.subject),
    approvedToHash: negotiationRecipientProof.recipientHash
  };
}

async function persistCreditNegotiationApprovedDraft(
  env: RuntimeEnv,
  fetcher: SupabaseMemoryFetch | undefined,
  action: CreditNegotiationApprovalAction,
  negotiationRecipientProof: { configKey: "HARBOR_AP_CONTACT_EMAIL"; recipientHash: string } | undefined
): Promise<void> {
  if (negotiationRecipientProof === undefined) {
    throw new Error("Credit negotiation approval recipient is unavailable.");
  }
  const baseUrl = readConfiguredRuntimeValue(env.SUPABASE_URL)?.replace(/\/+$/u, "");
  const serviceRoleKey = readConfiguredRuntimeValue(env.SUPABASE_SERVICE_ROLE_KEY);
  if (baseUrl === undefined || serviceRoleKey === undefined) {
    throw new Error("Credit negotiation approved draft store is unavailable.");
  }

  const coordinates = creditNegotiationActionCoordinates(action);
  const approvedSubjectHash = sha256Hex(action.approvedDraft.subject);
  const response = await (fetcher ?? fetch)(`${baseUrl}/rest/v1/credit_negotiation_rounds?on_conflict=round_id`, {
    body: JSON.stringify({
      account_id: coordinates.accountId,
      approved_action_id: action.actionId,
      order_id: coordinates.orderId,
      our_proposal_json: {
        approvedBody: action.approvedDraft.body,
        approvedBodyHash: action.approvedDraft.bodyHash,
        approvedSubject: action.approvedDraft.subject,
        approvedSubjectHash,
        approvedToHash: negotiationRecipientProof.recipientHash
      },
      round_id: action.actionId,
      round_no: coordinates.round,
      status: "drafted"
    }),
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=representation"
    },
    method: "POST"
  });
  if (!response.ok) {
    throw new Error("Credit negotiation approved draft store write failed.");
  }
}

function creditNegotiationActionCoordinates(action: CreditNegotiationApprovalAction): {
  accountId: string;
  orderId: string;
  round: number;
} {
  const match = /^credit-v2:negotiation:([^:]+):r([1-9]\d*)$/u.exec(action.actionId);
  const accountId = readStringFromDeterministicBasis(action.deterministicBasis.accountId);
  if (match === null || accountId === undefined) {
    throw new Error("Credit negotiation approval action is malformed.");
  }
  const [, orderId, roundText] = match;
  if (orderId === undefined || roundText === undefined) {
    throw new Error("Credit negotiation approval action is malformed.");
  }

  return {
    accountId,
    orderId,
    round: Number.parseInt(roundText, 10)
  };
}

function creditNegotiationApprovedDraftRecordId(actionId: string): string {
  return `credit_negotiation_rounds:${actionId}`;
}

function readStringFromDeterministicBasis(value: string | number | boolean | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readCreditNegotiationRecipientProof(
  env: RuntimeEnv
): { configKey: "HARBOR_AP_CONTACT_EMAIL"; recipientHash: string } | undefined {
  const approvedTo = readConfiguredRuntimeValue(env.HARBOR_AP_CONTACT_EMAIL);
  return approvedTo === undefined
    ? undefined
    : {
        configKey: "HARBOR_AP_CONTACT_EMAIL",
        recipientHash: createHash("sha256").update(approvedTo).digest("hex")
      };
}

function isCreditNegotiationApprovalAction(
  action: PreparedApprovalDecision["action"]
): action is CreditNegotiationApprovalAction {
  return action.proposedBy === "agent:credit-negotiation";
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

function setForensicsReadModelHashHeaders(response: Response, sourceRecordIds: readonly string[]): void {
  const hashes = buildForensicsReadModelBusinessHashes(sourceRecordIds);
  response.setHeader(readModelReceiptHashHeader, hashes.receiptHash);
  response.setHeader(readModelSourceHashHeader, hashes.sourceHash);
}

function buildForensicsReadModelBusinessHashes(sourceRecordIds: readonly string[]): {
  receiptHash: string;
  sourceHash: string;
} {
  const normalizedRecordIds = normalizeRecordIds(sourceRecordIds);
  const receiptRecordIds = normalizedRecordIds.filter(isReceiptFreshnessRecordId);
  const sourceRecordIdsWithoutReceipts = normalizedRecordIds.filter((recordId) => !isReceiptFreshnessRecordId(recordId));

  return {
    receiptHash: sha256CanonicalJson(receiptRecordIds),
    sourceHash: sha256CanonicalJson(sourceRecordIdsWithoutReceipts)
  };
}

function isReceiptFreshnessRecordId(recordId: string): boolean {
  return recordId === "receipt-set:absent" || recordId.startsWith("receipt:") || recordId.startsWith("receipt-set:");
}

function normalizeRecordIds(recordIds: readonly string[]): string[] {
  return [...new Set(recordIds.map((recordId) => recordId.trim()).filter((recordId) => recordId.length > 0))].sort();
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export async function startCockpitApiRuntime(options: CockpitApiRuntimeOptions = {}): Promise<StartedCockpitApiRuntime> {
  const baseRuntimeEnv = options.env ?? loadLocalRuntimeEnvFiles();
  const mcpRuntime = await startPrivateMcpRuntime(baseRuntimeEnv, options.startMcpServer ?? startMcpHttpServer, options.onError);
  const runtimeEnv = mcpRuntime.runtimeEnv;
  const port = options.port ?? Number(runtimeEnv.PORT ?? cockpitApiDefaultPort);
  const sourceHealthSnapshotStore = createSupabaseSourceHealthSnapshotRepositoryFromEnv(runtimeEnv, options.memoryFetcher);
  const sourceHealthSupabaseProbe = createSupabaseTableReadinessProbeFromEnv(runtimeEnv);
  const sourceHealthToolDataSchemaProbeLoader = createToolDataSchemaProbeLoader(sourceHealthSupabaseProbe);
  const sourceHealthPoller =
    sourceHealthSnapshotStore === undefined
      ? undefined
      : (options.sourceHealthPollerFactory ?? startSourceHealthPoller)({
          availableCredentialEnvNames: readConfiguredEnvNames(runtimeEnv),
          env: runtimeEnv,
          onError(error) {
            options.onError?.(error);
          },
          snapshotStore: sourceHealthSnapshotStore,
          ...(options.mcpHealthFetcher === undefined ? {} : { mcpHealthFetcher: options.mcpHealthFetcher }),
          ...(options.sapFetcher === undefined ? {} : { fetcher: options.sapFetcher }),
          ...(sourceHealthToolDataSchemaProbeLoader === undefined
            ? {}
            : { toolDataSchemaProbeLoader: sourceHealthToolDataSchemaProbeLoader })
        });
  const appOptions: CockpitApiOptions = {
    ...(options.creditRiskStreamRunner === undefined ? {} : { creditRiskStreamRunner: options.creditRiskStreamRunner }),
    env: runtimeEnv,
    ...(options.forensicsStreamRunner === undefined ? {} : { forensicsStreamRunner: options.forensicsStreamRunner }),
    ...(options.memoryFetcher === undefined ? {} : { memoryFetcher: options.memoryFetcher }),
    ...(options.mcpHealthFetcher === undefined ? {} : { mcpHealthFetcher: options.mcpHealthFetcher }),
    ...(options.openAiVectorStoreFetcher === undefined ? {} : { openAiVectorStoreFetcher: options.openAiVectorStoreFetcher }),
    ...(options.realtimeFetcher === undefined ? {} : { realtimeFetcher: options.realtimeFetcher }),
    ...(options.sapFetcher === undefined ? {} : { sapFetcher: options.sapFetcher })
  };
  const server = await listenCockpitServer(createCockpitApi(appOptions), port);
  const address = server.address();
  const baseUrl =
    address !== null && typeof address !== "string"
      ? `http://127.0.0.1:${String(address.port)}`
      : `http://127.0.0.1:${String(port)}`;

  return {
    baseUrl,
    close: async () => {
      sourceHealthPoller?.stop();
      await closeCockpitServer(server);
      await mcpRuntime.mcpServer?.close();
    },
    ...(mcpRuntime.mcpServer === undefined ? {} : { mcpServer: mcpRuntime.mcpServer }),
    runtimeEnv,
    server,
    ...(sourceHealthPoller === undefined ? {} : { sourceHealthPoller })
  };
}

async function startPrivateMcpRuntime(
  runtimeEnv: RuntimeEnv,
  startMcpServer: CockpitMcpServerStarter,
  onError: ((error: unknown) => void) | undefined
): Promise<{ mcpServer?: StartedMcpHttpServer; runtimeEnv: RuntimeEnv }> {
  if (readConfiguredRuntimeValue(runtimeEnv.RECOUP_MCP_URL) !== undefined) {
    return { runtimeEnv };
  }

  const privateMcpRuntimeEnv = buildPrivateMcpRuntimeEnv(runtimeEnv);
  try {
    const mcpServer = await startMcpServer({ env: privateMcpRuntimeEnv, port: 0 });
    return {
      mcpServer,
      runtimeEnv: {
        ...privateMcpRuntimeEnv,
        RECOUP_MCP_URL: `${mcpServer.baseUrl}${mcpServer.endpoint}`
      }
    };
  } catch (error) {
    onError?.(error);
    return { runtimeEnv };
  }
}

function buildPrivateMcpRuntimeEnv(runtimeEnv: RuntimeEnv): RuntimeEnv {
  return {
    ...runtimeEnv,
    RECOUP_MCP_AUTH_TOKEN: readConfiguredRuntimeValue(runtimeEnv.RECOUP_MCP_AUTH_TOKEN) ?? `loopback-${randomUUID()}`,
    RECOUP_MCP_CLIENT_CAPABILITIES: readConfiguredRuntimeValue(runtimeEnv.RECOUP_MCP_CLIENT_CAPABILITIES) ?? "read",
    RECOUP_MCP_CLIENT_PRINCIPAL:
      readConfiguredRuntimeValue(runtimeEnv.RECOUP_MCP_CLIENT_PRINCIPAL) ??
      readConfiguredRuntimeValue(runtimeEnv.RECOUP_COCKPIT_HUMAN_PRINCIPAL) ??
      defaultCockpitHumanPrincipal
  };
}

function readConfiguredRuntimeValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function listenCockpitServer(app: Express, port: number): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      resolve(server);
    });
  });
}

function closeCockpitServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  void startCockpitApiRuntime({
    env: runtimeEnv,
    onError(error) {
      console.warn(error instanceof Error ? error.message : "Runtime background service failed.");
    }
  }).then((runtime) => {
    console.log(`Recoup cockpit API listening on ${runtime.baseUrl}`);
    process.once("SIGTERM", () => {
      void runtime.close();
    });
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Recoup cockpit API failed to start.");
    process.exitCode = 1;
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
