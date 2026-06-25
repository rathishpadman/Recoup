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
import type { AgentHookAuditReceipt } from "./conductor.js";
import type { ServiceInvocationContext } from "./serviceLayer.js";

export type { ForensicsQueryTraceEvent, ForensicsQueryTracePhase };

type ForensicsQueryTraceSourceKind = "agent_trace" | "derived_backend" | "operator_session" | "sap_odata" | "supabase";
type ForensicsQueryTraceRetrievalSource = "agent_trace" | "sap_odata" | "source_backed" | "supabase";
type SourceAnnotatedForensicsQueryTraceEvent = ForensicsQueryTraceEvent & {
  retrievalSource?: ForensicsQueryTraceRetrievalSource;
  sourceKind?: ForensicsQueryTraceSourceKind;
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
    input: buildLiveForensicsQueryInput(request)
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
    "Acknowledge the selected evidence scope, then hand off to Recovery Drafter for draft-only recovery context.",
    "Return only concise lifecycle status. Do not compute or state dollar amounts, verdicts, routings, approvals, or external actions."
  ].join("\n");
}

function buildLiveAgentQueryTrace(
  receipts: readonly AgentHookAuditReceipt[],
  scopedRecordIds: readonly string[]
): SourceAnnotatedForensicsQueryTraceEvent[] {
  return receipts.map((receipt, index) => {
    const phase = liveQueryTracePhaseForReceipt(receipt, index);
    const sourceMetadata = traceSourceMetadataForReceipt(receipt);
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
      sourceKind: sourceMetadata.sourceKind,
      ...(receipt.toolName === undefined ? {} : { toolName: receipt.toolName })
    };
  });
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
  sourceKind: ForensicsQueryTraceSourceKind;
} {
  const toolName = receipt.toolName?.toLowerCase() ?? "";
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

function dedupeRecordIds(recordIds: readonly string[]): string[] {
  return [...new Set(recordIds.map((recordId) => recordId.trim()).filter((recordId) => recordId.length > 0))];
}
