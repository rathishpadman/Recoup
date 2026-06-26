import type { GovernedConfigValues } from "../../config/governed.js";
import type { SourcePort } from "../adapters/source.js";
import { buildDeterministicForensicsQueryAnswer } from "../agents/query.js";
import {
  collectLiveForensicsAgentRun,
  forensicsQueryTracePhases,
  type ForensicsQueryTraceEvent,
  type ForensicsQueryTracePhase,
  type StreamLiveForensicsTraceOptions
} from "../agents/liveForensicsStream.js";
import {
  runForensicsInvestigation,
  type DeductionDecision,
  type ForensicsRun,
  type RunForensicsInvestigationOptions
} from "../agents/forensics.js";
import { liveSdkAgentHookDeterministicBasis, type AgentHookAuditReceipt } from "./conductor.js";
import type { ServiceInvocationContext } from "./serviceLayer.js";

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

export const forensicsQueryDeterministicBasis =
  "runForensicsInvestigation + evidence source reads + deterministic hook audit trace" as const;
export const liveForensicsQueryAnswerGuardBasis =
  "OpenAI Agents SDK live trace + Recoup deterministic query answer guard" as const;
const liveForensicsQueryRequiredBasis = "OpenAI Agents SDK live trace required for Maya query answers." as const;
const liveForensicsQuerySessionBasis =
  "runForensicsInvestigation + evidence source reads + deterministic hook audit trace + OpenAI Agents SDK live trace" as const;

export type ForensicsQueryLiveAgentTraceOptions = Pick<
  StreamLiveForensicsTraceOptions,
  "env" | "maxTurns" | "onRetry" | "onTokenUsage" | "retryCap" | "runner" | "signal"
>;

export type ForensicsQueryModelExecution =
  | {
      agentNames: string[];
      deterministicBasis: typeof liveForensicsQueryAnswerGuardBasis;
      handoffCount: number;
      mode: "live_openai_agents";
      rawModelTextPolicy: "suppressed";
      tokenUsage?: number;
    }
  | {
      deterministicBasis: typeof liveForensicsQueryRequiredBasis;
      mode: "blocked_live_agent_trace" | "blocked_missing_credentials";
      reason: string;
    };

export interface ForensicsQuerySessionInput {
  governedConfig: GovernedConfigValues;
  liveAgentTrace?: ForensicsQueryLiveAgentTraceOptions;
  question: string;
  recordIds: string[];
  runForensics?: (options: RunForensicsInvestigationOptions) => ForensicsRun;
  selectedLineId: string;
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
      deterministicBasis: typeof forensicsQueryDeterministicBasis | typeof liveForensicsQuerySessionBasis;
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

export function runForensicsQuerySession(input: ForensicsQuerySessionInput): ForensicsQuerySessionResponse {
  const request = normalizeForensicsQueryRequest(input);
  const run = (input.runForensics ?? runForensicsInvestigation)({
    agentHookRecordIds: dedupeRecordIds([request.selectedLineId, ...request.recordIds]),
    governedConfig: input.governedConfig,
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

  const citations = buildQueryCitations(decision, request.recordIds);
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
    recordIds: request.recordIds
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

  const liveAgentRecordIds = dedupeRecordIds([request.selectedLineId, ...request.recordIds]);
  const liveRun = await collectLiveForensicsAgentRun({
    ...liveAgentTrace,
    agentHookRecordIds: liveAgentRecordIds,
    input: buildLiveForensicsQueryInput(request),
    mcpServiceContext: {
      ...input.serviceContext,
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
  return {
    ...deterministicResponse,
    deterministicBasis: liveForensicsQuerySessionBasis,
    modelExecution: {
      agentNames: dedupeRecordIds(liveRun.hookReceipts.map((receipt) => receipt.agentName)),
      deterministicBasis: liveForensicsQueryAnswerGuardBasis,
      handoffCount,
      mode: "live_openai_agents",
      rawModelTextPolicy: "suppressed",
      ...tokenUsage
    },
    trace: [...liveTrace, ...deterministicResponse.trace]
  };
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

function buildQueryCitations(
  decision: DeductionDecision,
  requestedRecordIds: readonly string[]
): ForensicsQueryCitation[] {
  const availableRecordIds = new Set([
    decision.lineId,
    ...decision.recordIds,
    ...decision.evidenceDocuments.flatMap((document) => document.recordIds)
  ]);
  const submittedRecordIds = dedupeRecordIds(requestedRecordIds);
  const matchedSubmittedRecordIds = submittedRecordIds.filter((recordId) => availableRecordIds.has(recordId));
  if (matchedSubmittedRecordIds.length !== submittedRecordIds.length) {
    return [];
  }
  const selectedRecordIds = dedupeRecordIds([decision.lineId, ...matchedSubmittedRecordIds]).filter((recordId) =>
    availableRecordIds.has(recordId)
  );

  return selectedRecordIds.map((recordId) => {
    const document = decision.evidenceDocuments.find((candidate) => candidate.recordIds.includes(recordId));
    return {
      deterministicBasis: forensicsQueryDeterministicBasis,
      ...(document === undefined ? {} : { documentId: document.documentId }),
      recordId,
      ...(document === undefined ? {} : { source: document.source }),
      ...(document === undefined ? {} : { summary: document.summary })
    };
  });
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
  question: string;
  recordIds: readonly string[];
  selectedLineId: string;
}): string {
  return [
    "Selected Maya forensics query.",
    `Question: ${input.question}`,
    `Selected line: ${input.selectedLineId}`,
    `Selected record IDs: ${dedupeRecordIds([input.selectedLineId, ...input.recordIds]).join(", ")}.`,
    "Step 1: call the SDK-visible governed MCP function tool query_answer (Recoup service query.answer) exactly once with this question, selectedLineId, and selected record IDs.",
    "Step 2: after query_answer returns any result: Do not call query_answer again. Immediately call the Agents SDK handoff function transfer_to_Recovery_Drafter to hand off to Recovery Drafter.",
    "Do not call actions.*, decisions.*, approvals.*, or core.* tools.",
    "Acknowledge the selected evidence scope, then hand off to Recovery Drafter for draft-only recovery context.",
    "Return only concise lifecycle status. Do not compute or state dollar amounts, verdicts, routings, approvals, or external actions."
  ].join("\n");
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
      receipt.deterministicBasis === liveSdkAgentHookDeterministicBasis &&
      receipt.hook === "agent_tool_end" &&
      normalizeLiveMcpToolName(receipt.toolName) === "query.answer" &&
      receipt.toolInputSelectedLineId === selectedLineId &&
      receipt.toolOutputSelectedLineId === selectedLineId &&
      hasSameRecordScope(receipt.toolInputRecordIds, scopedRecordIds) &&
      hasSameRecordScope(receipt.toolOutputSelectedRecordIds, scopedRecordIds) &&
      receipt.toolOutputSourceReadStatus === "source_backed_selected_scope" &&
      receipt.toolOutputCanonicalModel === "EvidenceDocument" &&
      hasSapEvidenceForSelectedScope(receipt.toolOutputSapEvidenceRecordIds, selectedLineId, scopedRecordIds)
  );
}

function hasSameRecordScope(actual: readonly string[] | undefined, expected: readonly string[]): boolean {
  if (actual === undefined) {
    return false;
  }

  const actualIds = dedupeRecordIds(actual);
  const expectedIds = dedupeRecordIds(expected);
  return actualIds.length === expectedIds.length && expectedIds.every((recordId) => actualIds.includes(recordId));
}

function hasSapEvidenceForSelectedScope(
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
  if (toolName.includes("sap")) {
    return { retrievalSource: "sap_odata", sourceKind: "sap_odata" };
  }
  if (toolName.includes("supabase")) {
    return { retrievalSource: "supabase", sourceKind: "supabase" };
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

function dedupeRecordIds(recordIds: readonly string[]): string[] {
  return [...new Set(recordIds.map((recordId) => recordId.trim()).filter((recordId) => recordId.length > 0))];
}
