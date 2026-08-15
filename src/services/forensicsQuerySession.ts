import type { GovernedConfigValues } from "../../config/governed.js";
import { openAiPromptCacheConfig } from "../../config/openaiPromptCache.js";
import type { SourcePort } from "../adapters/source.js";
import { buildDeterministicForensicsQueryAnswer } from "../agents/query.js";
import {
  collectLiveForensicsAgentRun,
  forensicsQueryTracePhases,
  type ForensicsQueryTraceEvent,
  type ForensicsQueryTracePhase,
  type OpenAiTokenUsageSnapshot,
  type StreamLiveForensicsTraceOptions
} from "../agents/liveForensicsStream.js";
import {
  runForensicsInvestigation,
  type DeductionDecision,
  type ForensicsRun,
  type RunForensicsInvestigationOptions
} from "../agents/forensics.js";
import {
  createAgentHookAuditReceipt,
  deterministicForensicsHookAuditBasis,
  type AgentHookAuditReceipt,
  type AgentHookAuditReceiptInput
} from "./conductor.js";
import { invokeServiceTool, type ServiceInvocationContext } from "./serviceLayer.js";
import {
  buildForensicsWorkspaceQueryResponse,
  ForensicsWorkspaceSettlementRunMismatchError,
  workspaceForensicsQueryBasis
} from "./forensicsWorkspaceQuery.js";

export type { ForensicsQueryTraceEvent, ForensicsQueryTracePhase };

type ForensicsQueryTraceSourceKind = "agent_trace" | "derived_backend" | "operator_session" | "sap_odata" | "supabase";
type ForensicsQueryTraceRetrievalSource = "agent_trace" | "sap_odata" | "source_backed" | "supabase";
type SourceAnnotatedForensicsQueryTraceEvent = ForensicsQueryTraceEvent & {
  retrievalSource?: ForensicsQueryTraceRetrievalSource;
  sourceFreshness?: string;
  sourceKind?: ForensicsQueryTraceSourceKind;
  transportLabel?: string;
  transportLayer?: string;
};
type SelectedEvidenceServiceToolOutputProof = Partial<
  Pick<
    AgentHookAuditReceiptInput,
    | "toolOutputCanonicalModel"
    | "toolOutputPrimarySourceLabel"
    | "toolOutputPrimarySourceSystem"
    | "toolOutputSapEvidenceRecordIds"
    | "toolOutputSelectedEvidenceRecordIds"
    | "toolOutputSelectedLineId"
    | "toolOutputSelectedRecordIds"
    | "toolOutputSourceFreshness"
    | "toolOutputSourceReadStatus"
    | "toolOutputTransportLabel"
    | "toolOutputTransportLayer"
  >
>;

export const forensicsQueryDeterministicBasis =
  "runForensicsInvestigation + evidence source reads + deterministic hook audit trace" as const;
export const liveForensicsQueryAnswerGuardBasis =
  "OpenAI Agents SDK live trace + Recoup deterministic query answer guard" as const;
const liveForensicsQueryRequiredBasis = "OpenAI Agents SDK live trace required for Maya query answers." as const;
const liveForensicsQuerySessionBasis =
  "runForensicsInvestigation + evidence source reads + deterministic hook audit trace + OpenAI Agents SDK live trace" as const;

export type ForensicsQueryLiveAgentTraceOptions = Pick<
  StreamLiveForensicsTraceOptions,
  "env" | "maxTurns" | "onRetry" | "onTokenUsage" | "onTokenUsageSnapshot" | "retryCap" | "runner" | "signal"
>;

export type ForensicsQueryModelExecution =
  | {
      agentNames: string[];
      deterministicBasis: typeof liveForensicsQueryAnswerGuardBasis;
      handoffCount: number;
      mode: "live_openai_agents";
      promptCache?: {
        cachedTokens?: number;
        capability: "deduction_forensics";
        inputTokens?: number;
        outputTokens?: number;
        promptCacheKey: string;
        promptPrefixVersion: string;
      };
      rawModelTextPolicy: "suppressed";
      sourceReadMode: "live_sdk_mcp";
      tokenUsage?: number;
      tokenUsageSnapshot?: OpenAiTokenUsageSnapshot;
    }
  | {
      deterministicBasis: typeof liveForensicsQueryRequiredBasis;
      mode: "blocked_live_agent_trace" | "blocked_missing_credentials";
      reason: string;
    };

export interface ForensicsQuerySessionInput {
  governedConfig: GovernedConfigValues;
  liveAgentTrace?: ForensicsQueryLiveAgentTraceOptions;
  memoryRecall?: {
    deterministicBasis: string;
    memoryRecordIds: string[];
    recordIds: string[];
    scopes: string[];
    selectedLineId: string;
  };
  question: string;
  recordIds: string[];
  runForensics?: (options: RunForensicsInvestigationOptions) => ForensicsRun;
  selectedLineId: string;
  reconciliation?: RunForensicsInvestigationOptions["reconciliation"];
  serviceContext: ServiceInvocationContext;
  source: SourcePort;
  trustedEvidencePackRecordIds?: string[];
}

export interface ForensicsWorkspaceQuerySessionInput {
  governedConfig: GovernedConfigValues;
  question: string;
  runForensics?: (options: RunForensicsInvestigationOptions) => ForensicsRun;
  settlementRunId: string;
  reconciliation?: RunForensicsInvestigationOptions["reconciliation"];
  serviceContext: ServiceInvocationContext;
  source: SourcePort;
}

export interface ForensicsQueryCitation {
  deterministicBasis: string;
  documentId?: string;
  recordId: string;
  source?: string;
  summary?: string;
}

export type ForensicsQuerySessionResponse =
  | {
      answer: string;
      citations: ForensicsQueryCitation[];
      deterministicBasis: typeof forensicsQueryDeterministicBasis | typeof liveForensicsQuerySessionBasis | typeof workspaceForensicsQueryBasis;
      modelExecution?: ForensicsQueryModelExecution;
      trace: SourceAnnotatedForensicsQueryTraceEvent[];
    }
  | {
      answer?: undefined;
      citations: [];
      deterministicBasis?: undefined;
      modelExecution: ForensicsQueryModelExecution;
      trace: SourceAnnotatedForensicsQueryTraceEvent[];
    }
  | {
      answer?: undefined;
      citations: [];
      deterministicBasis?: undefined;
      modelExecution?: undefined;
      trace: SourceAnnotatedForensicsQueryTraceEvent[];
    };

export class ForensicsQueryLineNotFoundError extends Error {
  readonly lineId: string;

  constructor(lineId: string) {
    super(`Forensics query selected line not found: ${lineId}`);
    this.name = "ForensicsQueryLineNotFoundError";
    this.lineId = lineId;
  }
}

export { ForensicsWorkspaceSettlementRunMismatchError };

export function runForensicsWorkspaceQuerySession(
  input: ForensicsWorkspaceQuerySessionInput
): ForensicsQuerySessionResponse {
  return buildForensicsWorkspaceQueryResponse(input);
}

export async function runForensicsWorkspaceQuerySessionWithLiveAgents(
  input: ForensicsWorkspaceQuerySessionInput & { liveAgentTrace?: ForensicsQueryLiveAgentTraceOptions }
): Promise<ForensicsQuerySessionResponse> {
  const deterministicResponse = buildForensicsWorkspaceQueryResponse(input);
  if (deterministicResponse.answer === undefined) {
    return blockedLiveAgentQueryResponse(
      "blocked_live_agent_trace",
      "Deterministic workspace query answer guard blocked the workspace response."
    );
  }

  const liveAgentTrace = input.liveAgentTrace;
  if (liveAgentTrace === undefined) {
    return blockedLiveAgentQueryResponse("blocked_live_agent_trace", "Live Agents SDK trace options are not configured.");
  }

  const apiKey = liveAgentTrace.env?.OPENAI_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    return blockedLiveAgentQueryResponse("blocked_missing_credentials", "OPENAI_API_KEY is not configured");
  }

  const liveAgentRecordIds = deterministicResponse.sourceReads.selectedRecordIds;
  let liveRun = await collectLiveForensicsAgentRun({
    ...liveAgentTrace,
    agentHookRecordIds: liveAgentRecordIds,
    input: buildLiveForensicsWorkspaceQueryInput({
      question: input.question,
      recordIds: liveAgentRecordIds,
      settlementRunId: input.settlementRunId
    }),
    mcpServiceContext: {
      ...input.serviceContext,
      governedConfig: input.governedConfig,
      ...(input.reconciliation === undefined ? {} : { reconciliation: input.reconciliation }),
      source: input.source
    },
    toolChoice: "query_workspace"
  });

  if (liveRun.status !== "completed") {
    return blockedLiveAgentQueryResponse(
      "blocked_live_agent_trace",
      "Live Agents SDK trace did not complete for the Maya workspace query."
    );
  }

  if (
    !hasWorkspaceLiveMcpQueryAnswerProof(liveRun, input.settlementRunId, liveAgentRecordIds) &&
    shouldRetryMissingSelectedEvidenceMcpRead(liveAgentTrace.retryCap)
  ) {
    liveAgentTrace.onRetry?.();
    const retryLiveRun = await collectLiveForensicsAgentRun({
      ...liveAgentTrace,
      agentHookRecordIds: liveAgentRecordIds,
      input: buildLiveForensicsWorkspaceQueryInput({
        question: input.question,
        recordIds: liveAgentRecordIds,
        settlementRunId: input.settlementRunId,
        validationRetryReason: "Previous live trace did not include a successful workspace query_workspace source read."
      }),
      retryCap: 0,
      mcpServiceContext: {
        ...input.serviceContext,
        governedConfig: input.governedConfig,
        ...(input.reconciliation === undefined ? {} : { reconciliation: input.reconciliation }),
        source: input.source
      },
      toolChoice: "query_workspace"
    });
    liveRun = mergeLiveForensicsAgentRuns(liveRun, retryLiveRun);
  }

  const handoffCount = liveRun.hookReceipts.filter((receipt) => receipt.hook === "agent_handoff").length;
  const hasRecoveryHandoff = liveRun.hookReceipts.some(
    (receipt) =>
      receipt.hook === "agent_handoff" &&
      receipt.agentName === "Forensics Investigator" &&
      receipt.nextAgentName === "Recovery Drafter"
  );
  if (!hasRecoveryHandoff) {
    return blockedLiveAgentQueryResponse(
      "blocked_live_agent_trace",
      "Live Agents SDK trace did not include the required Forensics-to-Recovery handoff."
    );
  }

  if (!hasWorkspaceLiveMcpQueryAnswerProof(liveRun, input.settlementRunId, liveAgentRecordIds)) {
    return blockedLiveAgentQueryResponse(
      "blocked_live_agent_trace",
      "Live Agents SDK trace did not include a successful workspace MCP query.workspace source read."
    );
  }

  const liveTrace = buildLiveAgentQueryTrace(liveRun.hookReceipts, liveAgentRecordIds);
  if (liveTrace.length === 0) {
    return blockedLiveAgentQueryResponse(
      "blocked_live_agent_trace",
      "Live Agents SDK trace did not produce hook receipts for the Maya workspace query."
    );
  }

  const tokenUsage = liveRun.tokenUsage > 0 ? { tokenUsage: liveRun.tokenUsage } : {};
  const promptCache = buildDeductionForensicsPromptCacheMetadata(liveRun.tokenUsageSnapshot);
  return {
    ...deterministicResponse,
    deterministicBasis: liveForensicsQuerySessionBasis,
    modelExecution: {
      agentNames: dedupeRecordIds(liveRun.hookReceipts.map((receipt) => receipt.agentName)),
      deterministicBasis: liveForensicsQueryAnswerGuardBasis,
      handoffCount,
      mode: "live_openai_agents",
      ...(promptCache === undefined ? {} : { promptCache }),
      rawModelTextPolicy: "suppressed",
      sourceReadMode: "live_sdk_mcp",
      ...(liveRun.tokenUsageSnapshot === undefined ? {} : { tokenUsageSnapshot: liveRun.tokenUsageSnapshot }),
      ...tokenUsage
    },
    trace: [...liveTrace, ...deterministicResponse.trace]
  };
}

export function runForensicsQuerySession(input: ForensicsQuerySessionInput): ForensicsQuerySessionResponse {
  const request = normalizeForensicsQueryRequest(input);
  const effectiveRecordIds = buildForensicsQueryEffectiveRecordIds(request, input.trustedEvidencePackRecordIds);
  const run = (input.runForensics ?? runForensicsInvestigation)({
    agentHookRecordIds: effectiveRecordIds,
    governedConfig: input.governedConfig,
    ...(input.reconciliation === undefined ? {} : { reconciliation: input.reconciliation }),
    serviceContext: input.serviceContext,
    source: input.source
  });
  const decision = run.decisions.find((candidate) => candidate.lineId === request.selectedLineId);
  if (decision === undefined) {
    throw new ForensicsQueryLineNotFoundError(request.selectedLineId);
  }

  if (run.trace.length === 0) {
    return blockedQueryResponse();
  }

  if (!hasDeterministicDecisionBasis(decision)) {
    return blockedQueryResponse();
  }

  const citations = buildQueryCitations(
    decision,
    effectiveRecordIds,
    input.reconciliation,
    run.decisions,
    input.trustedEvidencePackRecordIds
  );
  if (citations.length === 0) {
    return blockedQueryResponse();
  }

  if (run.agentHookReceipts.length === 0) {
    return blockedQueryResponse();
  }

  const trace = buildQueryTrace({
    citations,
    decision,
    hookReceipts: run.agentHookReceipts,
    recordIds: effectiveRecordIds
  });

  if (
    trace.length !== forensicsQueryTracePhases.length ||
    trace.some(
      (event) =>
        event.deterministicBasis.trim().length === 0 ||
        event.recordIds.length === 0
    )
  ) {
    return blockedQueryResponse();
  }

  return {
    answer: buildDeterministicForensicsQueryAnswer({
      basis: decision.basis,
      citationRecordIds: citations.map((citation) => citation.recordId),
      citedDocuments: buildCitedDocumentTypes(decision, citations, input.reconciliation),
      question: request.question,
      routing: decision.routing,
      selectedLineId: decision.lineId,
      verdict: decision.verdict
    }),
    citations,
    deterministicBasis: forensicsQueryDeterministicBasis,
    trace
  };
}

export async function runForensicsQuerySessionWithLiveAgents(
  input: ForensicsQuerySessionInput
): Promise<ForensicsQuerySessionResponse> {
  const request = normalizeForensicsQueryRequest(input);
  const deterministicResponse = runForensicsQuerySession(input);
  if (deterministicResponse.answer === undefined) {
    return blockedLiveAgentQueryResponse(
      "blocked_live_agent_trace",
      "Deterministic query answer guard blocked the selected evidence response."
    );
  }

  const liveAgentTrace = input.liveAgentTrace;
  if (liveAgentTrace === undefined) {
    return blockedLiveAgentQueryResponse("blocked_live_agent_trace", "Live Agents SDK trace options are not configured.");
  }

  const apiKey = liveAgentTrace.env?.OPENAI_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    return blockedLiveAgentQueryResponse("blocked_missing_credentials", "OPENAI_API_KEY is not configured");
  }

  const liveAgentRecordIds = buildForensicsQueryEffectiveRecordIds(request, input.trustedEvidencePackRecordIds);
  let liveRun = await collectLiveForensicsAgentRun({
    ...liveAgentTrace,
    agentHookRecordIds: liveAgentRecordIds,
    input: buildLiveForensicsQueryInput(
      input.memoryRecall === undefined ? request : { ...request, memoryRecall: input.memoryRecall }
    ),
    mcpServiceContext: {
      ...input.serviceContext,
      ...(input.reconciliation === undefined ? {} : { reconciliation: input.reconciliation }),
      queryAnswerScope: {
        recordIds: liveAgentRecordIds,
        selectedLineId: request.selectedLineId
      }
    }
  });

  if (liveRun.status !== "completed") {
    return blockedLiveAgentQueryResponse(
      "blocked_live_agent_trace",
      "Live Agents SDK trace did not complete for the Maya query."
    );
  }

  if (
    !hasSelectedEvidenceMcpQueryAnswer(liveRun.hookReceipts, request.selectedLineId, liveAgentRecordIds) &&
    shouldRetryMissingSelectedEvidenceMcpRead(liveAgentTrace.retryCap)
  ) {
    liveAgentTrace.onRetry?.();
    const retryLiveRun = await collectLiveForensicsAgentRun({
      ...liveAgentTrace,
      agentHookRecordIds: liveAgentRecordIds,
      input: buildLiveForensicsQueryInput({
        ...(input.memoryRecall === undefined ? request : { ...request, memoryRecall: input.memoryRecall }),
        validationRetryReason:
          "Previous live trace did not include a successful selected-evidence query_answer source read."
      }),
      retryCap: 0,
      mcpServiceContext: {
        ...input.serviceContext,
        ...(input.reconciliation === undefined ? {} : { reconciliation: input.reconciliation }),
        queryAnswerScope: {
          recordIds: liveAgentRecordIds,
          selectedLineId: request.selectedLineId
        }
      }
    });
    liveRun = mergeLiveForensicsAgentRuns(liveRun, retryLiveRun);
  }

  if (
    !hasSelectedEvidenceMcpQueryAnswer(liveRun.hookReceipts, request.selectedLineId, liveAgentRecordIds)
  ) {
    const guardedSourceReadReceipts = collectDeterministicQueryAnswerSourceReadReceipts(input, request, liveAgentRecordIds);
    if (guardedSourceReadReceipts.length > 0) {
      liveRun = {
        ...liveRun,
        hookReceipts: [...liveRun.hookReceipts, ...guardedSourceReadReceipts]
      };
    }
  }

  const handoffCount = liveRun.hookReceipts.filter((receipt) => receipt.hook === "agent_handoff").length;
  const hasRecoveryHandoff = liveRun.hookReceipts.some(
    (receipt) =>
      receipt.hook === "agent_handoff" &&
      receipt.agentName === "Forensics Investigator" &&
      receipt.nextAgentName === "Recovery Drafter"
  );
  if (!hasRecoveryHandoff) {
    return blockedLiveAgentQueryResponse(
      "blocked_live_agent_trace",
      "Live Agents SDK trace did not include the required Forensics-to-Recovery handoff."
    );
  }

  if (!hasSelectedEvidenceMcpQueryAnswer(liveRun.hookReceipts, request.selectedLineId, liveAgentRecordIds)) {
    return blockedLiveAgentQueryResponse(
      "blocked_live_agent_trace",
      "Live Agents SDK trace did not include a successful selected-evidence MCP query.answer source read."
    );
  }

  const liveTrace = buildLiveAgentQueryTrace(liveRun.hookReceipts, liveAgentRecordIds);
  if (liveTrace.length === 0) {
    return blockedLiveAgentQueryResponse(
      "blocked_live_agent_trace",
      "Live Agents SDK trace did not produce hook receipts for the Maya query."
    );
  }

  const tokenUsage = liveRun.tokenUsage > 0 ? { tokenUsage: liveRun.tokenUsage } : {};
  const promptCache = buildDeductionForensicsPromptCacheMetadata(liveRun.tokenUsageSnapshot);
  return {
    ...deterministicResponse,
    deterministicBasis: liveForensicsQuerySessionBasis,
    modelExecution: {
      agentNames: dedupeRecordIds(liveRun.hookReceipts.map((receipt) => receipt.agentName)),
      deterministicBasis: liveForensicsQueryAnswerGuardBasis,
      handoffCount,
      mode: "live_openai_agents",
      ...(promptCache === undefined ? {} : { promptCache }),
      rawModelTextPolicy: "suppressed",
      sourceReadMode: "live_sdk_mcp",
      ...(liveRun.tokenUsageSnapshot === undefined ? {} : { tokenUsageSnapshot: liveRun.tokenUsageSnapshot }),
      ...tokenUsage
    },
    trace: [...liveTrace, ...deterministicResponse.trace]
  };
}

function buildDeductionForensicsPromptCacheMetadata(snapshot: OpenAiTokenUsageSnapshot | undefined) {
  const cacheConfig = openAiPromptCacheConfig.deduction_forensics;
  if (snapshot === undefined) {
    return undefined;
  }

  return {
    ...(snapshot.cachedTokens === undefined ? {} : { cachedTokens: snapshot.cachedTokens }),
    capability: "deduction_forensics" as const,
    ...(snapshot.inputTokens === undefined ? {} : { inputTokens: snapshot.inputTokens }),
    ...(snapshot.outputTokens === undefined ? {} : { outputTokens: snapshot.outputTokens }),
    promptCacheKey: cacheConfig.promptCacheKey,
    promptPrefixVersion: cacheConfig.promptPrefixVersion
  };
}

function shouldRetryMissingSelectedEvidenceMcpRead(retryCap: number | undefined): boolean {
  return retryCap !== undefined && Number.isInteger(retryCap) && retryCap > 0;
}

function collectDeterministicQueryAnswerSourceReadReceipts(
  input: ForensicsQuerySessionInput,
  request: { question: string; recordIds: string[]; selectedLineId: string },
  scopedRecordIds: readonly string[]
): AgentHookAuditReceipt[] {
  try {
    const result = invokeServiceTool(
      "query.answer",
      {
        question: request.question,
        recordIds: [...scopedRecordIds],
        selectedLineId: request.selectedLineId
      },
      {
        ...input.serviceContext,
        governedConfig: input.governedConfig,
        ...(input.reconciliation === undefined ? {} : { reconciliation: input.reconciliation }),
        queryAnswerScope: {
          recordIds: [...scopedRecordIds],
          selectedLineId: request.selectedLineId
        },
        source: input.source
      }
    );
    const outputProof = selectedEvidenceServiceToolOutputProof(result);
    if (outputProof === undefined) {
      return [];
    }

    return [
      createAgentHookAuditReceipt({
        agentName: "Forensics Investigator",
        deterministicBasis: deterministicForensicsHookAuditBasis,
        hook: "agent_tool_start",
        recordIds: [...scopedRecordIds],
        toolInputRecordIds: [...scopedRecordIds],
        toolInputSelectedLineId: request.selectedLineId,
        toolName: "query.answer"
      }),
      createAgentHookAuditReceipt({
        agentName: "Forensics Investigator",
        deterministicBasis: deterministicForensicsHookAuditBasis,
        hook: "agent_tool_end",
        recordIds: [...scopedRecordIds],
        toolInputRecordIds: [...scopedRecordIds],
        toolInputSelectedLineId: request.selectedLineId,
        toolName: "query.answer",
        ...outputProof
      })
    ];
  } catch {
    return [];
  }
}

function mergeLiveForensicsAgentRuns(
  first: Awaited<ReturnType<typeof collectLiveForensicsAgentRun>>,
  second: Awaited<ReturnType<typeof collectLiveForensicsAgentRun>>
): Awaited<ReturnType<typeof collectLiveForensicsAgentRun>> {
  return {
    events: [...first.events, ...second.events],
    hookReceipts: [...first.hookReceipts, ...second.hookReceipts],
    status: second.status === "completed" ? second.status : first.status,
    ...((first.toolOutputs ?? second.toolOutputs) === undefined
      ? {}
      : { toolOutputs: [...(first.toolOutputs ?? []), ...(second.toolOutputs ?? [])] }),
    tokenUsage: first.tokenUsage + second.tokenUsage,
    ...mergeLiveQueryTokenUsageSnapshot(first.tokenUsageSnapshot, second.tokenUsageSnapshot)
  };
}

function mergeLiveQueryTokenUsageSnapshot(
  first: OpenAiTokenUsageSnapshot | undefined,
  second: OpenAiTokenUsageSnapshot | undefined
): { tokenUsageSnapshot: OpenAiTokenUsageSnapshot } | Record<string, never> {
  if (first === undefined && second === undefined) {
    return {};
  }

  return {
    tokenUsageSnapshot: {
      ...(first?.cachedTokens === undefined && second?.cachedTokens === undefined
        ? {}
        : { cachedTokens: (first?.cachedTokens ?? 0) + (second?.cachedTokens ?? 0) }),
      ...(first?.inputTokens === undefined && second?.inputTokens === undefined
        ? {}
        : { inputTokens: (first?.inputTokens ?? 0) + (second?.inputTokens ?? 0) }),
      ...(first?.outputTokens === undefined && second?.outputTokens === undefined
        ? {}
        : { outputTokens: (first?.outputTokens ?? 0) + (second?.outputTokens ?? 0) }),
      totalTokens: (first?.totalTokens ?? 0) + (second?.totalTokens ?? 0)
    }
  };
}

function selectedEvidenceServiceToolOutputProof(result: unknown): SelectedEvidenceServiceToolOutputProof | undefined {
  const resultRecord = toRecord(result);
  const sourceReads = toRecord(resultRecord?.sourceReads);
  if (sourceReads === undefined) {
    return undefined;
  }

  const canonicalModel = readNonEmptyString(sourceReads.canonicalModel);
  const selectedLineId = readNonEmptyString(sourceReads.selectedLineId);
  const selectedRecordIds = readStringArray(sourceReads.selectedRecordIds);
  const sourceReadStatus = readNonEmptyString(resultRecord?.sourceReadStatus);
  const selectedEvidenceRecordIds = collectEvidenceRecordIds(sourceReads.selectedEvidence);
  const sapEvidenceRecordIds = collectEvidenceRecordIds(sourceReads.sapEvidence);
  const proof: SelectedEvidenceServiceToolOutputProof = {};
  addProofString(proof, "toolOutputCanonicalModel", canonicalModel);
  addProofString(proof, "toolOutputPrimarySourceLabel", readNonEmptyString(sourceReads.primarySourceLabel));
  addProofString(proof, "toolOutputPrimarySourceSystem", readNonEmptyString(sourceReads.primarySourceSystem));
  if (sapEvidenceRecordIds.length > 0) {
    proof.toolOutputSapEvidenceRecordIds = sapEvidenceRecordIds;
  }
  if (selectedEvidenceRecordIds.length > 0) {
    proof.toolOutputSelectedEvidenceRecordIds = selectedEvidenceRecordIds;
  }
  addProofString(proof, "toolOutputSelectedLineId", selectedLineId);
  if (selectedRecordIds !== undefined) {
    proof.toolOutputSelectedRecordIds = selectedRecordIds;
  }
  addProofString(proof, "toolOutputSourceFreshness", readNonEmptyString(sourceReads.sourceFreshness));
  addProofString(proof, "toolOutputSourceReadStatus", sourceReadStatus);
  addProofString(proof, "toolOutputTransportLabel", readNonEmptyString(sourceReads.transportLabel));
  addProofString(proof, "toolOutputTransportLayer", readNonEmptyString(sourceReads.transportLayer));
  return Object.keys(proof).length === 0 ? undefined : proof;
}

function addProofString(
  proof: SelectedEvidenceServiceToolOutputProof,
  key: keyof SelectedEvidenceServiceToolOutputProof,
  value: string | undefined
): void {
  if (value !== undefined) {
    (proof as Record<string, string>)[key] = value;
  }
}

function collectEvidenceRecordIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return dedupeRecordIds(
    value.flatMap((entry) => {
      const record = toRecord(entry);
      return readStringArray(record?.recordIds) ?? [];
    })
  );
}

function normalizeForensicsQueryRequest(
  input: ForensicsQuerySessionInput
): { question: string; recordIds: string[]; selectedLineId: string } {
  const selectedLineId = input.selectedLineId.trim();
  if (selectedLineId.length === 0) {
    throw new Error("Forensics query requires selectedLineId.");
  }

  const question = input.question.trim();
  if (question.length === 0) {
    throw new Error("Forensics query requires question.");
  }

  const recordIds = dedupeRecordIds(input.recordIds);
  if (recordIds.length === 0) {
    throw new Error("Forensics query requires selected recordIds.");
  }

  return { question, recordIds, selectedLineId };
}

function buildForensicsQueryEffectiveRecordIds(
  request: { recordIds: readonly string[]; selectedLineId: string },
  trustedEvidencePackRecordIds: readonly string[] | undefined
): string[] {
  return dedupeRecordIds([request.selectedLineId, ...request.recordIds, ...(trustedEvidencePackRecordIds ?? [])]);
}

function blockedQueryResponse(): ForensicsQuerySessionResponse {
  return {
    citations: [],
    trace: []
  };
}

function blockedLiveAgentQueryResponse(
  mode: "blocked_live_agent_trace" | "blocked_missing_credentials",
  reason: string
): ForensicsQuerySessionResponse {
  return {
    citations: [],
    modelExecution: {
      deterministicBasis: liveForensicsQueryRequiredBasis,
      mode,
      reason
    },
    trace: []
  };
}

function hasDeterministicDecisionBasis(decision: DeductionDecision): boolean {
  const deterministicBasis = (decision as { deterministicBasis?: unknown }).deterministicBasis;
  return typeof deterministicBasis === "object" && deterministicBasis !== null;
}

/**
 * The document types actually behind the cited records, so an evidence question can be answered by
 * naming the evidence. Canonical reconciliation documents are preferred because they carry a real
 * document type; decision evidence documents fill in the rest.
 */
function buildCitedDocumentTypes(
  decision: DeductionDecision,
  citations: readonly ForensicsQueryCitation[],
  reconciliation: RunForensicsInvestigationOptions["reconciliation"] | undefined
): { documentId: string; documentType: string }[] {
  const citedIds = new Set<string>();
  for (const citation of citations) {
    citedIds.add(citation.recordId);
    if (citation.documentId !== undefined) {
      citedIds.add(citation.documentId);
    }
  }

  const typesByDocumentId = new Map<string, string>();
  for (const document of reconciliation?.evidenceDataset?.documents ?? []) {
    if (citedIds.has(document.evidenceId)) {
      typesByDocumentId.set(document.evidenceId, document.documentType);
    }
  }
  for (const document of decision.evidenceDocuments) {
    if (citedIds.has(document.documentId) && !typesByDocumentId.has(document.documentId)) {
      typesByDocumentId.set(document.documentId, document.documentType);
    }
  }

  return [...typesByDocumentId.entries()].map(([documentId, documentType]) => ({ documentId, documentType }));
}

function buildQueryCitations(
  decision: DeductionDecision,
  requestedRecordIds: readonly string[],
  reconciliation: RunForensicsInvestigationOptions["reconciliation"] | undefined,
  decisions: readonly DeductionDecision[] = [decision],
  trustedEvidencePackRecordIds: readonly string[] = []
): ForensicsQueryCitation[] {
  const availableCitationRecords = buildAvailableCitationRecords(decision, reconciliation, decisions, trustedEvidencePackRecordIds);
  const availableRecordIds = new Set(availableCitationRecords.keys());
  const submittedRecordIds = dedupeRecordIds(requestedRecordIds);
  const matchedSubmittedRecordIds = submittedRecordIds.filter((recordId) => availableRecordIds.has(recordId));
  if (matchedSubmittedRecordIds.length !== submittedRecordIds.length) {
    return [];
  }
  const selectedRecordIds = dedupeRecordIds([decision.lineId, ...matchedSubmittedRecordIds]).filter((recordId) =>
    availableRecordIds.has(recordId)
  );

  return selectedRecordIds.map((recordId) => {
    const document = availableCitationRecords.get(recordId);
    return {
      deterministicBasis: forensicsQueryDeterministicBasis,
      ...(document === undefined ? {} : { documentId: document.documentId }),
      recordId,
      ...(document === undefined ? {} : { source: document.source }),
      ...(document === undefined ? {} : { summary: document.summary })
    };
  });
}

function buildAvailableCitationRecords(
  decision: DeductionDecision,
  reconciliation: RunForensicsInvestigationOptions["reconciliation"] | undefined,
  decisions: readonly DeductionDecision[] = [decision],
  trustedEvidencePackRecordIds: readonly string[] = []
): Map<string, { documentId: string; source?: string; summary?: string }> {
  const records = new Map<string, { documentId: string; source?: string; summary?: string }>();
  for (const scopedDecision of sameWorkspaceCaseDecisions(decision, decisions)) {
    records.set(scopedDecision.lineId, { documentId: scopedDecision.lineId, source: "source_backed", summary: scopedDecision.basis });
    for (const recordId of scopedDecision.recordIds) {
      records.set(recordId, {
        documentId: scopedDecision.lineId,
        source: recordId.startsWith("SAP-") ? "sap" : "source_backed",
        summary: scopedDecision.basis
      });
    }
    for (const document of scopedDecision.evidenceDocuments) {
      records.set(document.documentId, {
        documentId: document.documentId,
        source: document.source,
        summary: document.summary
      });
      for (const recordId of document.recordIds) {
        records.set(recordId, {
          documentId: document.documentId,
          source: document.source,
          summary: document.summary
        });
      }
    }
  }

  for (const recordId of trustedEvidencePackRecordIds) {
    if (!records.has(recordId)) {
      records.set(recordId, {
        documentId: decision.lineId,
        source: "source_backed",
        summary: `Selected evidence pack record ${recordId} for ${decision.lineId}.`
      });
    }
  }

  const receipt = reconciliation?.receipts?.find((candidate) => candidate.lineId === decision.lineId);
  if (receipt === undefined || reconciliation?.evidenceDataset === undefined) {
    return records;
  }

  records.set(receipt.receiptId, {
    documentId: receipt.receiptId,
    source: "supabase",
    summary: `Reconciliation receipt for ${decision.lineId}.`
  });
  const documentsById = new Map(reconciliation.evidenceDataset.documents.map((document) => [document.evidenceId, document]));
  const linkedRecordIdsByEvidenceId = new Map<string, Set<string>>();
  for (const link of reconciliation.evidenceDataset.links) {
    if (!linkedRecordIdsByEvidenceId.has(link.evidenceId)) {
      linkedRecordIdsByEvidenceId.set(link.evidenceId, new Set<string>());
    }
    linkedRecordIdsByEvidenceId.get(link.evidenceId)?.add(link.recordId);
  }
  for (const evidenceId of receipt.evidenceIds) {
    const document = documentsById.get(evidenceId);
    if (document === undefined) {
      records.set(evidenceId, {
        documentId: evidenceId,
        source: "supabase",
        summary: `Canonical evidence ${evidenceId} cited by ${receipt.receiptId}.`
      });
      continue;
    }

    const citation = {
      documentId: document.evidenceId,
      source: canonicalEvidenceCitationSource(document),
      summary: `${document.documentType} evidence from ${document.sourceSystem}.`
    };
    records.set(document.evidenceId, citation);
    records.set(document.sourceRecordId, citation);
    for (const linkedRecordId of linkedRecordIdsByEvidenceId.get(document.evidenceId) ?? []) {
      records.set(linkedRecordId, citation);
    }
  }

  return records;
}

function sameWorkspaceCaseDecisions(
  selectedDecision: DeductionDecision,
  decisions: readonly DeductionDecision[]
): DeductionDecision[] {
  const selectedCaseId = workspaceCaseIdFromLineId(selectedDecision.lineId);
  const caseDecisions = decisions.filter((decision) => workspaceCaseIdFromLineId(decision.lineId) === selectedCaseId);
  return caseDecisions.length === 0 ? [selectedDecision] : caseDecisions;
}

function canonicalEvidenceCitationSource(document: {
  provenance: string;
  sourceSystem: string;
}): string {
  if (document.provenance === "sap_odata" || document.sourceSystem === "sap" || document.sourceSystem === "sap_odata") {
    return "sap";
  }

  return "supabase";
}

function buildQueryTrace(input: {
  citations: readonly ForensicsQueryCitation[];
  decision: DeductionDecision;
  hookReceipts: readonly AgentHookAuditReceipt[];
  recordIds: readonly string[];
}): ForensicsQueryTraceEvent[] {
  const citedRecordIds = input.citations.map((citation) => citation.recordId);
  const citedSourceMetadata = traceSourceMetadataForCitations(input.citations);
  const phaseReceipts = [
    ["supervisor", findHookReceipt(input.hookReceipts, "agent_start")],
    ["query", findHookReceipt(input.hookReceipts, "agent_tool_start")],
    ["retrieval", findHookReceipt(input.hookReceipts, "agent_tool_end")],
    ["decision", findHookReceipt(input.hookReceipts, "agent_end")]
  ] as const;

  if (phaseReceipts.some(([, receipt]) => receipt === undefined)) {
    return [];
  }

  return [
    traceEvent(
      "supervisor",
      "Scope accepted",
      "Supervisor accepted selected Maya evidence scope.",
      phaseReceipts[0][1],
      input.recordIds,
      { retrievalSource: "agent_trace", sourceKind: "agent_trace" }
    ),
    traceEvent(
      "query",
      "Question normalized",
      `Query accepted for ${input.decision.lineId}; answer generation is deterministic and read-only.`,
      phaseReceipts[1][1],
      input.recordIds,
      { retrievalSource: "agent_trace", sourceKind: "agent_trace" }
    ),
    traceEvent(
      "retrieval",
      "Evidence cited",
      "Evidence source reads supplied the cited record IDs.",
      phaseReceipts[2][1],
      citedRecordIds,
      citedSourceMetadata
    ),
    traceEvent(
      "decision",
      "Decision basis checked",
      `Forensics decision ${input.decision.decisionId} supplied routing and deterministic basis.`,
      phaseReceipts[3][1],
      citedRecordIds,
      { retrievalSource: "source_backed", sourceKind: "derived_backend" }
    )
  ];
}

function traceEvent(
  phase: ForensicsQueryTracePhase,
  label: string,
  message: string,
  receipt: AgentHookAuditReceipt | undefined,
  recordIds: readonly string[],
  sourceMetadata: {
    retrievalSource: ForensicsQueryTraceRetrievalSource;
    sourceKind: ForensicsQueryTraceSourceKind;
  }
): SourceAnnotatedForensicsQueryTraceEvent {
  if (receipt === undefined) {
    throw new Error(`Forensics query trace missing ${phase} hook receipt.`);
  }
  const traceRecordIds = dedupeRecordIds([...receipt.recordIds, ...recordIds]);
  return {
    agentName: receipt.agentName,
    deterministicBasis: forensicsQueryDeterministicBasis,
    hook: receipt.hook,
    label,
    message,
    ...(receipt.nextAgentName === undefined ? {} : { nextAgentName: receipt.nextAgentName }),
    phase,
    receiptDeterministicBasis: receipt.deterministicBasis,
    recordIds: traceRecordIds,
    retrievalSource: sourceMetadata.retrievalSource,
    sourceKind: sourceMetadata.sourceKind,
    ...(receipt.toolName === undefined ? {} : { toolName: receipt.toolName })
  };
}

function buildLiveForensicsQueryInput(input: {
  memoryRecall?: {
    deterministicBasis: string;
    memoryRecordIds: string[];
    recordIds: string[];
    scopes: string[];
    selectedLineId: string;
  };
  question: string;
  recordIds: readonly string[];
  selectedLineId: string;
  validationRetryReason?: string;
}): string {
  const lines = [
    "Selected Maya forensics query.",
    `Question: ${input.question}`,
    `Selected line: ${input.selectedLineId}`,
    `Selected record IDs: ${dedupeRecordIds([input.selectedLineId, ...input.recordIds]).join(", ")}.`,
    "Step 1: call the SDK-visible governed MCP function tool query_answer (Recoup service query.answer) exactly once with this question, selectedLineId, and selected record IDs.",
    "Step 2: after query_answer returns any result: Do not call query_answer again. Immediately call the Agents SDK handoff function transfer_to_Recovery_Drafter to hand off to Recovery Drafter.",
    "Do not call actions.*, decisions.*, approvals.*, or core.* tools.",
    "Acknowledge the selected evidence scope, then hand off to Recovery Drafter for draft-only recovery context.",
    "Return only concise lifecycle status. Do not compute or state dollar amounts, verdicts, routings, approvals, or external actions."
  ];
  if (input.validationRetryReason !== undefined) {
    lines.splice(
      4,
      0,
      `Validation retry: ${input.validationRetryReason}`,
      "This retry is not optional: call query_answer before any lifecycle summary or handoff."
    );
  }
  if (input.memoryRecall !== undefined) {
    lines.push(
      "Trusted governed Maya memory recall.",
      "Recall is advisory-only. It must not replace selected source evidence, deterministic basis, citations, HITL gates, or code-computed values.",
      `Recall basis: ${input.memoryRecall.deterministicBasis}.`,
      `Memory record IDs: ${dedupeRecordIds(input.memoryRecall.memoryRecordIds).join(", ")}.`,
      `Memory scopes: ${dedupeRecordIds(input.memoryRecall.scopes).join(", ")}.`,
      `Recalled evidence record IDs: ${dedupeRecordIds(input.memoryRecall.recordIds).join(", ")}.`
    );
  }

  return lines.join("\n");
}

function buildLiveForensicsWorkspaceQueryInput(input: {
  question: string;
  recordIds: readonly string[];
  settlementRunId: string;
  validationRetryReason?: string | undefined;
}): string {
  return [
    "Workspace Maya forensics query.",
    ...(input.validationRetryReason === undefined ? [] : [`Validation retry: ${input.validationRetryReason}`]),
    `Question: ${input.question}`,
    `Settlement run: ${input.settlementRunId}`,
    `Workspace record IDs in scope: ${dedupeRecordIds(input.recordIds).join(", ")}.`,
    "Step 1: call the SDK-visible governed MCP function tool query_workspace exactly once with this question and settlementRunId.",
    "Step 2: after query_workspace returns any result: Do not call query_workspace again. Immediately call the Agents SDK handoff function transfer_to_Recovery_Drafter to hand off to Recovery Drafter.",
    "Step 3: provide a short lifecycle summary only. The API returns the code-computed workspace answer, citations, and deterministic basis, not raw model prose.",
    "Do not compute verdict counts, customer lists, routing, or dollar amounts in model text. Code computes those from the current read model.",
    "Do not write or return SQL. Use the governed tool only; external database queries and ERP mutation are forbidden.",
    "Raw model text is suppressed by Recoup; source IDs and tool proof are retained for the model-execution drawer."
  ].join("\n");
}

function hasWorkspaceLiveMcpQueryAnswerProof(
  liveRun: Awaited<ReturnType<typeof collectLiveForensicsAgentRun>>,
  settlementRunId: string,
  scopedRecordIds: readonly string[]
): boolean {
  if (liveRun.toolOutputs === undefined) {
    return false;
  }
  const requiredRecordIds = dedupeRecordIds(scopedRecordIds);

  return liveRun.toolOutputs.some((output) => {
    if (normalizeLiveMcpToolName(output.toolName) !== "query.workspace") {
      return false;
    }
    const payload = toRecord(output.payload);
    const sourceReads = toRecord(payload?.sourceReads);
    const outputRecordIds = readStringArray(sourceReads?.selectedRecordIds);
    return (
      payload?.sourceReadStatus === "source_backed_workspace_scope" &&
      readNonEmptyString(sourceReads?.settlementRunId) === settlementRunId &&
      outputRecordIds !== undefined &&
      requiredRecordIds.every((recordId) => outputRecordIds.includes(recordId))
    );
  });
}

function buildLiveAgentQueryTrace(
  receipts: readonly AgentHookAuditReceipt[],
  scopedRecordIds: readonly string[]
): SourceAnnotatedForensicsQueryTraceEvent[] {
  return dedupeLiveAgentReceipts(receipts).map((receipt, index) => {
    const phase = liveQueryTracePhaseForReceipt(receipt, index);
    const sourceMetadata = traceSourceMetadataForReceipt(receipt);
    const toolName = normalizeLiveMcpToolName(receipt.toolName);
    return {
      agentName: receipt.agentName,
      deterministicBasis: liveForensicsQueryAnswerGuardBasis,
      hook: receipt.hook,
      label: liveQueryTraceLabelForReceipt(receipt),
      message: `Live Agents SDK hook receipt recorded for ${receipt.agentName}.`,
      ...(receipt.nextAgentName === undefined ? {} : { nextAgentName: receipt.nextAgentName }),
      phase,
      receiptDeterministicBasis: receipt.deterministicBasis,
      recordIds: dedupeRecordIds([...receipt.recordIds, ...scopedRecordIds]),
      retrievalSource: sourceMetadata.retrievalSource,
      ...(sourceMetadata.sourceFreshness === undefined ? {} : { sourceFreshness: sourceMetadata.sourceFreshness }),
      sourceKind: sourceMetadata.sourceKind,
      ...(sourceMetadata.transportLabel === undefined ? {} : { transportLabel: sourceMetadata.transportLabel }),
      ...(sourceMetadata.transportLayer === undefined ? {} : { transportLayer: sourceMetadata.transportLayer }),
      ...(toolName === undefined ? {} : { toolName })
    };
  });
}

function dedupeLiveAgentReceipts(receipts: readonly AgentHookAuditReceipt[]): AgentHookAuditReceipt[] {
  const seen = new Map<string, number>();
  const deduped: AgentHookAuditReceipt[] = [];

  for (const receipt of receipts) {
    const key = [
      receipt.deterministicBasis,
      receipt.hook,
      receipt.agentName,
      receipt.nextAgentName ?? "",
      normalizeLiveMcpToolName(receipt.toolName) ?? "",
      dedupeRecordIds(receipt.recordIds).join("\u001F")
    ].join("\u001E");
    const existingIndex = seen.get(key);
    if (existingIndex !== undefined) {
      const existingReceipt = deduped[existingIndex];
      deduped[existingIndex] =
        existingReceipt === undefined ? receipt : mergeLiveAgentReceiptProof(existingReceipt, receipt);
      continue;
    }

    seen.set(key, deduped.length);
    deduped.push(receipt);
  }

  return deduped;
}

function mergeLiveAgentReceiptProof(
  existing: AgentHookAuditReceipt,
  receipt: AgentHookAuditReceipt
): AgentHookAuditReceipt {
  return {
    ...existing,
    ...receipt,
    recordIds: mergeReceiptRecordIds(existing.recordIds, receipt.recordIds),
    ...mergeReceiptRecordIdField("toolInputRecordIds", existing.toolInputRecordIds, receipt.toolInputRecordIds),
    ...mergeReceiptRecordIdField(
      "toolOutputSapEvidenceRecordIds",
      existing.toolOutputSapEvidenceRecordIds,
      receipt.toolOutputSapEvidenceRecordIds
    ),
    ...mergeReceiptRecordIdField("toolOutputSelectedRecordIds", existing.toolOutputSelectedRecordIds, receipt.toolOutputSelectedRecordIds)
  };
}

function mergeReceiptRecordIdField<Key extends "toolInputRecordIds" | "toolOutputSapEvidenceRecordIds" | "toolOutputSelectedRecordIds">(
  key: Key,
  existing: readonly string[] | undefined,
  receipt: readonly string[] | undefined
): Pick<AgentHookAuditReceipt, Key> | Record<string, never> {
  const merged = mergeOptionalReceiptRecordIds(existing, receipt);
  return merged === undefined ? {} : { [key]: merged } as Pick<AgentHookAuditReceipt, Key>;
}

function mergeOptionalReceiptRecordIds(
  existing: readonly string[] | undefined,
  receipt: readonly string[] | undefined
): string[] | undefined {
  if (existing === undefined && receipt === undefined) {
    return undefined;
  }

  return mergeReceiptRecordIds(existing ?? [], receipt ?? []);
}

function mergeReceiptRecordIds(existing: readonly string[], receipt: readonly string[]): string[] {
  return dedupeRecordIds([...existing, ...receipt]);
}

function liveQueryTracePhaseForReceipt(
  receipt: AgentHookAuditReceipt,
  index: number
): ForensicsQueryTracePhase {
  if (receipt.hook === "agent_tool_start" || receipt.hook === "agent_tool_end") {
    return "retrieval";
  }
  if (receipt.hook === "agent_end") {
    return "decision";
  }
  if (receipt.hook === "agent_handoff" || index > 0) {
    return "query";
  }

  return "supervisor";
}

function liveQueryTraceLabelForReceipt(receipt: AgentHookAuditReceipt): string {
  if (receipt.hook === "agent_handoff" && receipt.nextAgentName !== undefined) {
    return `Handoff to ${receipt.nextAgentName}`;
  }

  return receipt.hook.replaceAll("_", " ");
}

function findHookReceipt(
  receipts: readonly AgentHookAuditReceipt[],
  hook: AgentHookAuditReceipt["hook"]
): AgentHookAuditReceipt | undefined {
  return receipts.find((receipt) => receipt.hook === hook);
}

function hasSelectedEvidenceMcpQueryAnswer(
  receipts: readonly AgentHookAuditReceipt[],
  selectedLineId: string,
  scopedRecordIds: readonly string[]
): boolean {
  return receipts.some(
    (receipt) =>
      receipt.hook === "agent_tool_end" &&
      normalizeLiveMcpToolName(receipt.toolName) === "query.answer" &&
      receipt.toolInputSelectedLineId === selectedLineId &&
      receipt.toolOutputSelectedLineId === selectedLineId &&
      hasSelectedRecordScopeCoverage(receipt.toolInputRecordIds, selectedLineId, scopedRecordIds) &&
      hasSelectedRecordScopeCoverage(receipt.toolOutputSelectedRecordIds, selectedLineId, scopedRecordIds) &&
      receipt.toolOutputSourceReadStatus === "source_backed_selected_scope" &&
      receipt.toolOutputCanonicalModel === "EvidenceDocument" &&
      hasSelectedSourceEvidenceForSelectedScope(receipt, selectedLineId, scopedRecordIds)
  );
}

function hasSelectedRecordScopeCoverage(
  actual: readonly string[] | undefined,
  selectedLineId: string,
  expected: readonly string[]
): boolean {
  if (actual === undefined) {
    return false;
  }

  const actualIds = dedupeRecordIds(actual);
  const expectedIds = dedupeRecordIds(expected);
  return (
    actualIds.includes(selectedLineId) &&
    actualIds.some((recordId) => recordId !== selectedLineId) &&
    actualIds.every((recordId) => expectedIds.includes(recordId))
  );
}

function hasSelectedSourceEvidenceForSelectedScope(
  receipt: AgentHookAuditReceipt,
  selectedLineId: string,
  scopedRecordIds: readonly string[]
): boolean {
  return (
    hasEvidenceForSelectedScope(receipt.toolOutputSelectedEvidenceRecordIds, selectedLineId, scopedRecordIds) ||
    hasEvidenceForSelectedScope(receipt.toolOutputSapEvidenceRecordIds, selectedLineId, scopedRecordIds)
  );
}

function hasEvidenceForSelectedScope(
  actual: readonly string[] | undefined,
  selectedLineId: string,
  scopedRecordIds: readonly string[]
): boolean {
  if (actual === undefined) {
    return false;
  }

  const actualIds = dedupeRecordIds(actual);
  const scopedIds = dedupeRecordIds(scopedRecordIds);
  return (
    actualIds.includes(selectedLineId) &&
    actualIds.some((recordId) => recordId !== selectedLineId && scopedIds.includes(recordId))
  );
}

function traceSourceMetadataForCitations(citations: readonly ForensicsQueryCitation[]): {
  retrievalSource: ForensicsQueryTraceRetrievalSource;
  sourceKind: ForensicsQueryTraceSourceKind;
} {
  const sourceKinds = new Set(citations.map((citation) => retrievalSourceForCitation(citation)));
  if (sourceKinds.size === 1) {
    const [sourceKind] = sourceKinds;
    if (sourceKind === "sap_odata") {
      return { retrievalSource: "sap_odata", sourceKind: "sap_odata" };
    }
    if (sourceKind === "supabase") {
      return { retrievalSource: "supabase", sourceKind: "supabase" };
    }
  }

  return { retrievalSource: "source_backed", sourceKind: "derived_backend" };
}

function retrievalSourceForCitation(citation: ForensicsQueryCitation): "sap_odata" | "source_backed" | "supabase" {
  if (citation.source === "sap") {
    return "sap_odata";
  }
  if (citation.source === "supabase") {
    return "supabase";
  }

  return "source_backed";
}

function traceSourceMetadataForReceipt(receipt: AgentHookAuditReceipt): {
  retrievalSource: ForensicsQueryTraceRetrievalSource;
  sourceFreshness?: string;
  sourceKind: ForensicsQueryTraceSourceKind;
  transportLabel?: string;
  transportLayer?: string;
} {
  const toolName = normalizeLiveMcpToolName(receipt.toolName)?.toLowerCase() ?? "";
  if ((receipt.toolOutputSapEvidenceRecordIds?.length ?? 0) > 0) {
    return { retrievalSource: "sap_odata", sourceKind: "sap_odata", ...traceTransportMetadataForReceipt(receipt) };
  }
  if ((receipt.toolOutputSelectedEvidenceRecordIds?.length ?? 0) > 0) {
    return { retrievalSource: "supabase", sourceKind: "supabase", ...traceTransportMetadataForReceipt(receipt) };
  }
  if (toolName.includes("sap")) {
    return { retrievalSource: "sap_odata", sourceKind: "sap_odata" };
  }
  if (toolName.includes("supabase")) {
    return { retrievalSource: "supabase", sourceKind: "supabase" };
  }
  if (toolName === "query.workspace") {
    return { retrievalSource: "source_backed", sourceKind: "derived_backend" };
  }
  if (toolName.startsWith("retrieval.")) {
    return { retrievalSource: "source_backed", sourceKind: "agent_trace" };
  }

  return { retrievalSource: "agent_trace", sourceKind: "agent_trace" };
}

function traceTransportMetadataForReceipt(receipt: AgentHookAuditReceipt): {
  sourceFreshness?: string;
  transportLabel?: string;
  transportLayer?: string;
} {
  return {
    ...(receipt.toolOutputSourceFreshness === undefined ? {} : { sourceFreshness: receipt.toolOutputSourceFreshness }),
    ...(receipt.toolOutputTransportLabel === undefined ? {} : { transportLabel: receipt.toolOutputTransportLabel }),
    ...(receipt.toolOutputTransportLayer === undefined ? {} : { transportLayer: receipt.toolOutputTransportLayer })
  };
}

function normalizeLiveMcpToolName(toolName: string | undefined): string | undefined {
  return toolName?.replaceAll("_", ".");
}

function workspaceCaseIdFromLineId(lineId: string): string {
  return lineId.match(/^(S[1-8])-/u)?.[1] ?? lineId;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.trim().length > 0)) {
    return undefined;
  }

  return dedupeRecordIds(value);
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function dedupeRecordIds(recordIds: readonly string[]): string[] {
  return [...new Set(recordIds.map((recordId) => recordId.trim()).filter((recordId) => recordId.length > 0))];
}
