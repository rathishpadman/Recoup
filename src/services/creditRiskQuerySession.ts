import { openAiPromptCacheConfig } from "../../config/openaiPromptCache.js";
import {
  collectLiveForensicsAgentRun,
  type ForensicsQueryTraceEvent,
  type LiveForensicsSdkToolOutput,
  type OpenAiTokenUsageSnapshot,
  type StreamLiveForensicsTraceOptions
} from "../agents/liveForensicsStream.js";
import type { OpenAiCreditNegotiationPolicyRationaleReader } from "../adapters/openAiPolicyVectorStore.js";
import { davidCreditAgentMcpAllowedToolNames } from "../agents/mcpGateway.js";
import {
  createAgentHookAuditReceipt,
  deterministicForensicsHookAuditBasis,
  type AgentHookAuditReceipt,
  type AgentHookAuditReceiptInput
} from "./conductor.js";
import type { CreditRiskAccountModel, CreditRiskReviewModel, CreditRiskRows } from "./creditRiskModel.js";
import type { DealOptimizerModel, DealOptimizerRows } from "./dealOptimizer.js";
import {
  parseActiveCreditNegotiationPolicyRows,
  resolveCreditNegotiationPolicyRationale,
  type CreditNegotiationPolicyKey,
  type CreditNegotiationPolicyRow
} from "./creditNegotiationPolicy.js";
import { invokeServiceTool } from "./serviceLayer.js";

export const creditRiskQueryDeterministicBasis =
  "CreditRiskReviewModel + Supabase credit evidence documents + deterministic credit_risk.answer guard" as const;
export const liveCreditRiskQueryAnswerGuardBasis =
  "OpenAI Agents SDK live trace + Recoup deterministic credit_risk.answer guard" as const;
const liveCreditRiskQueryRequiredBasis = "OpenAI Agents SDK live trace required for David credit risk query answers." as const;
const liveCreditRiskQuerySessionBasis =
  "CreditRiskReviewModel + Supabase credit evidence documents + deterministic credit_risk.answer guard + OpenAI Agents SDK live trace" as const;
const creditNegotiationDraftBasis = "credit_negotiation.draft_structures + deterministic deal optimizer" as const;
const creditPolicyRationaleBasis =
  "credit_negotiation_policy exact rows + OpenAI vector policy rationale search" as const;

export type CreditRiskQueryLiveAgentTraceOptions = Pick<
  StreamLiveForensicsTraceOptions,
  "env" | "maxTurns" | "onRetry" | "onSdkToolOutput" | "onTokenUsage" | "onTokenUsageSnapshot" | "retryCap" | "runner" | "signal"
>;

export type CreditRiskQueryModelExecution =
  | {
      agentNames: string[];
      deterministicBasis: typeof liveCreditRiskQueryAnswerGuardBasis;
      handoffCount: number;
      mode: "live_openai_agents";
      promptCache?: {
        cachedTokens?: number;
        capability: "credit_risk";
        inputTokens?: number;
        outputTokens?: number;
        promptCacheKey: string;
        promptPrefixVersion: string;
      };
      rawModelTextPolicy: "suppressed";
      sourceReadMode: "governed_backend_fallback" | "live_sdk_mcp";
      tokenUsage?: number;
      tokenUsageSnapshot?: OpenAiTokenUsageSnapshot;
    }
  | {
      deterministicBasis: typeof liveCreditRiskQueryRequiredBasis;
      mode: "blocked_live_agent_trace" | "blocked_missing_credentials";
      reason: string;
    };

export interface CreditRiskQueryCitation {
  deterministicBasis: string;
  recordId: string;
  sourceLabel: string;
  title: string;
}

export interface CreditRiskQuerySessionInput {
  accountId: string;
  dealOptimizerRows?: {
    policyRows: readonly CreditNegotiationPolicyRow[];
    simRows: DealOptimizerRows;
  };
  liveAgentTrace?: CreditRiskQueryLiveAgentTraceOptions;
  model: CreditRiskReviewModel;
  policyRationaleReader?: OpenAiCreditNegotiationPolicyRationaleReader;
  question: string;
  recordIds: string[];
  rows: CreditRiskRows;
}

export interface CreditRiskQuerySessionResponse {
  answer?: string;
  citations: CreditRiskQueryCitation[];
  deterministicBasis?: string;
  modelExecution?: CreditRiskQueryModelExecution;
  negotiationDraft?: CreditRiskNegotiationDraftResult;
  policyRationale?: CreditRiskPolicyRationaleResult;
  trace: ForensicsQueryTraceEvent[];
}

export interface CreditRiskNegotiationDraftResult {
  deterministicBasis: typeof creditNegotiationDraftBasis;
  model: DealOptimizerModel;
  toolName: "credit_negotiation.draft_structures";
}

export interface CreditRiskPolicyRationaleResult {
  citations: Array<{
    content: string;
    deterministicBasis: typeof creditPolicyRationaleBasis;
    recordId: string;
    source: "vector-policy-rationale";
  }>;
  deterministicBasis: typeof creditPolicyRationaleBasis;
  executablePolicySource: "credit_negotiation_policy";
  message: "Policy rationale available." | "Policy rationale conflict" | "Policy rationale unavailable.";
  policyHash: string;
  policyKey: CreditNegotiationPolicyKey;
  policyValueText: string;
  policyVersion: 1;
  status: "available" | "human_review_required" | "unavailable";
}

interface NormalizedCreditRiskQueryRequest {
  account: CreditRiskAccountModel;
  effectiveRecordIds: string[];
  negotiationOrders: Array<{
    currentRound?: {
      round: number;
      status: string;
    };
    nextRound: number;
    orderAmountLabel: string;
    orderId: string;
    sourceRecordIds: string[];
  }>;
  question: string;
}

export async function runCreditRiskQuerySessionWithLiveAgents(
  input: CreditRiskQuerySessionInput
): Promise<CreditRiskQuerySessionResponse> {
  const request = normalizeCreditRiskQueryRequest(input);
  if (request === undefined) {
    return blockedCreditRiskQueryResponse(
      "blocked_live_agent_trace",
      "Selected David credit account or cited credit evidence documents are unavailable from governed backend sources."
    );
  }

  const deterministicResponse = buildDeterministicCreditRiskQueryResponse(request);
  const liveAgentTrace = input.liveAgentTrace;
  if (liveAgentTrace === undefined) {
    return blockedCreditRiskQueryResponse("blocked_live_agent_trace", "Live Agents SDK trace options are not configured.");
  }

  const apiKey = liveAgentTrace.env?.OPENAI_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    return blockedCreditRiskQueryResponse("blocked_missing_credentials", "OPENAI_API_KEY is not configured");
  }

  let liveRun = await collectLiveForensicsAgentRun({
    ...liveAgentTrace,
    agentHookRecordIds: request.effectiveRecordIds,
    allowedToolNames: davidCreditAgentMcpAllowedToolNames,
    input: buildLiveCreditRiskQueryInput(request),
    mcpServiceContext: {
      creditRiskAnswerScope: {
        accountId: request.account.accountId,
        recordIds: request.effectiveRecordIds
      },
      ...(input.dealOptimizerRows === undefined ? {} : { dealOptimizerRows: input.dealOptimizerRows }),
      creditRiskRows: input.rows
    }
  });

  if (liveRun.status !== "completed") {
    return blockedCreditRiskQueryResponse(
      "blocked_live_agent_trace",
      "Live Agents SDK trace did not complete for the David credit risk query."
    );
  }

  let validationRetryUsed = false;
  if (
    !hasCreditRiskQueryAnswerSourceRead(liveRun.hookReceipts, request.account.accountId, request.effectiveRecordIds) &&
    shouldRetryMissingCreditRiskMcpRead(liveAgentTrace.retryCap)
  ) {
    validationRetryUsed = true;
    liveAgentTrace.onRetry?.();
    const retryLiveRun = await collectLiveForensicsAgentRun({
      ...liveAgentTrace,
      agentHookRecordIds: request.effectiveRecordIds,
      allowedToolNames: davidCreditAgentMcpAllowedToolNames,
      input: buildLiveCreditRiskQueryInput(
        request,
        "Previous live trace did not include a successful governed credit_risk_answer source read."
      ),
      retryCap: 0,
      mcpServiceContext: {
        creditRiskAnswerScope: {
          accountId: request.account.accountId,
          recordIds: request.effectiveRecordIds
        },
        ...(input.dealOptimizerRows === undefined ? {} : { dealOptimizerRows: input.dealOptimizerRows }),
        creditRiskRows: input.rows
      }
    });
    liveRun = mergeLiveCreditRiskAgentRuns(liveRun, retryLiveRun);
  }

  if (
    wantsCreditNegotiationDraft(request) &&
    !hasCreditNegotiationDraftSourceRead(liveRun.hookReceipts, request.account.accountId) &&
    !validationRetryUsed &&
    shouldRetryMissingCreditRiskMcpRead(liveAgentTrace.retryCap)
  ) {
    validationRetryUsed = true;
    liveAgentTrace.onRetry?.();
    const retryLiveRun = await collectLiveForensicsAgentRun({
      ...liveAgentTrace,
      agentHookRecordIds: request.effectiveRecordIds,
      allowedToolNames: davidCreditAgentMcpAllowedToolNames,
      input: buildLiveCreditRiskQueryInput(
        request,
        "Previous live trace did not include a successful governed credit_negotiation_draft_structures source read for the requested draft."
      ),
      retryCap: 0,
      mcpServiceContext: {
        creditRiskAnswerScope: {
          accountId: request.account.accountId,
          recordIds: request.effectiveRecordIds
        },
        ...(input.dealOptimizerRows === undefined ? {} : { dealOptimizerRows: input.dealOptimizerRows }),
        creditRiskRows: input.rows
      }
    });
    liveRun = mergeLiveCreditRiskAgentRuns(liveRun, retryLiveRun);
  }

  let sourceReadMode: "governed_backend_fallback" | "live_sdk_mcp" | undefined =
    hasCreditRiskQueryAnswerSourceRead(liveRun.hookReceipts, request.account.accountId, request.effectiveRecordIds)
      ? "live_sdk_mcp"
      : undefined;

  if (sourceReadMode === undefined) {
    const guardedSourceReadReceipts = collectDeterministicCreditRiskAnswerSourceReadReceipts(
      input,
      request,
      request.effectiveRecordIds
    );
    if (guardedSourceReadReceipts.length > 0) {
      liveRun = {
        ...liveRun,
        hookReceipts: [...liveRun.hookReceipts, ...guardedSourceReadReceipts]
      };
      sourceReadMode = "governed_backend_fallback";
    }
  }

  const handoffCount = liveRun.hookReceipts.filter((receipt) => receipt.hook === "agent_handoff").length;
  const hasActionPacketHandoff = liveRun.hookReceipts.some(
    (receipt) =>
      receipt.hook === "agent_handoff" &&
      receipt.agentName === "Credit Sentinel" &&
      receipt.nextAgentName === "Action Packet Drafter"
  );
  if (!hasActionPacketHandoff) {
    return blockedCreditRiskQueryResponse(
      "blocked_live_agent_trace",
      "Live Agents SDK trace did not include the required Credit Sentinel-to-Action Packet Drafter handoff."
    );
  }

  if (!hasCreditRiskQueryAnswerSourceRead(liveRun.hookReceipts, request.account.accountId, request.effectiveRecordIds)) {
    return blockedCreditRiskQueryResponse(
      "blocked_live_agent_trace",
      "Live Agents SDK trace did not include a successful governed credit_risk.answer source read."
    );
  }

  const liveTrace = buildCreditRiskLiveTrace(liveRun.hookReceipts, request.effectiveRecordIds);
  if (liveTrace.length === 0) {
    return blockedCreditRiskQueryResponse(
      "blocked_live_agent_trace",
      "Live Agents SDK trace did not produce hook receipts for the David credit risk query."
    );
  }

  const negotiationDraft = buildCreditNegotiationDraftResult(
    liveRun.toolOutputs,
    liveRun.hookReceipts,
    request.account.accountId
  );
  const policyRationale = await buildCreditPolicyRationaleResult(input, request);

  return {
    ...deterministicResponse,
    deterministicBasis: liveCreditRiskQuerySessionBasis,
    modelExecution: {
      agentNames: dedupe(liveRun.hookReceipts.map((receipt) => receipt.agentName)),
      deterministicBasis: liveCreditRiskQueryAnswerGuardBasis,
      handoffCount,
      mode: "live_openai_agents",
      ...(liveRun.tokenUsageSnapshot === undefined
        ? {}
        : { promptCache: buildCreditRiskPromptCacheMetadata(liveRun.tokenUsageSnapshot) }),
      rawModelTextPolicy: "suppressed",
      sourceReadMode: sourceReadMode ?? "live_sdk_mcp",
      ...(liveRun.tokenUsage === 0 ? {} : { tokenUsage: liveRun.tokenUsage }),
      ...(liveRun.tokenUsageSnapshot === undefined ? {} : { tokenUsageSnapshot: liveRun.tokenUsageSnapshot })
    },
    ...(negotiationDraft === undefined ? {} : { negotiationDraft }),
    ...(policyRationale === undefined ? {} : { policyRationale }),
    trace: [...liveTrace, ...deterministicResponse.trace]
  };
}

function normalizeCreditRiskQueryRequest(
  input: CreditRiskQuerySessionInput
): NormalizedCreditRiskQueryRequest | undefined {
  const question = input.question.trim();
  if (question.length === 0) {
    return undefined;
  }

  const account = input.model.accounts.find((candidate) => candidate.accountId === input.accountId);
  if (account === undefined || account.evidenceDocuments.length === 0) {
    return undefined;
  }

  const creditEvidenceRecordIds = [
    account.accountId,
    ...account.signals.flatMap((signal) => signal.recordIds),
    ...account.evidenceDocuments.flatMap((document) => [document.documentId, ...document.recordIds])
  ];
  const allowedRecordIds = new Set(creditEvidenceRecordIds);
  const submittedInScopeRecordIds = input.recordIds.filter((recordId) => allowedRecordIds.has(recordId));
  const effectiveRecordIds = dedupe([
    account.accountId,
    ...submittedInScopeRecordIds,
    ...account.evidenceDocuments.flatMap((document) => [document.documentId, ...document.recordIds])
  ]);
  if (effectiveRecordIds.length === 0) {
    return undefined;
  }

  const negotiationOrders = account.negotiationOrders.map((order) => ({
    ...(order.currentRound === undefined
      ? {}
      : {
          currentRound: {
            round: order.currentRound.round,
            status: order.currentRound.status
          }
        }),
    nextRound: order.nextRound,
    orderAmountLabel: order.orderAmountLabel,
    orderId: order.orderId,
    sourceRecordIds: [...order.sourceRecordIds]
  }));

  return { account, effectiveRecordIds, negotiationOrders, question };
}

function buildDeterministicCreditRiskQueryResponse(
  request: NormalizedCreditRiskQueryRequest
): CreditRiskQuerySessionResponse {
  const citedRecords = dedupe([
    request.account.accountId,
    ...request.account.signals.flatMap((signal) => signal.recordIds),
    ...request.account.evidenceDocuments.flatMap((document) => [document.documentId, ...document.recordIds])
  ]).filter((recordId) => request.effectiveRecordIds.includes(recordId));

  return {
    answer: [
      `${request.account.customer} is ${request.account.verdict} risk.`,
      request.account.verdictBasis,
      `${request.account.packet.routeLabel}: ${request.account.packet.detail}`,
      ...negotiationStatusAnswerLines(request),
      `The packet is draft-only and needs David approval before any external action.`
    ].join(" "),
    citations: citedRecords.map((recordId) => ({
      deterministicBasis: creditRiskQueryDeterministicBasis,
      recordId,
      sourceLabel: sourceLabelForRecordId(request.account, recordId),
      title: titleForRecordId(request.account, recordId)
    })),
    deterministicBasis: creditRiskQueryDeterministicBasis,
    trace: [
      {
        agentName: "CreditRiskReviewModel",
        deterministicBasis: creditRiskQueryDeterministicBasis,
        hook: "agent_tool_end",
        label: "Deterministic credit read-model answer",
        message: "Credit query answer was assembled from selected account evidence and code-computed risk model fields.",
        phase: "retrieval",
        receiptDeterministicBasis: deterministicForensicsHookAuditBasis,
        recordIds: request.effectiveRecordIds,
        toolName: "credit_risk.answer"
      }
    ]
  };
}

function hasCreditRiskQueryAnswerSourceRead(
  receipts: readonly AgentHookAuditReceipt[],
  accountId: string,
  scopedRecordIds: readonly string[]
): boolean {
  return receipts.some((receipt) => {
    return (
      receipt.hook === "agent_tool_end" &&
      normalizeCreditRiskLiveMcpToolName(receipt.toolName) === "credit_risk.answer" &&
      receipt.toolOutputSourceReadStatus === "source_backed_selected_scope" &&
      receipt.toolOutputCanonicalModel === "CreditRiskEvidenceDocument" &&
      hasCreditRiskSelectedRecordScope(receipt.recordIds, accountId, scopedRecordIds) &&
      hasCreditRiskSelectedRecordScope(receipt.toolInputRecordIds, accountId, scopedRecordIds) &&
      hasCreditRiskSelectedRecordScope(receipt.toolOutputSelectedRecordIds, accountId, scopedRecordIds) &&
      hasCreditRiskSelectedEvidenceForScope(receipt.toolOutputSelectedEvidenceRecordIds, accountId, scopedRecordIds)
    );
  });
}

function hasCreditNegotiationDraftSourceRead(
  receipts: readonly AgentHookAuditReceipt[],
  accountId: string
): boolean {
  return receipts.some((receipt) => {
    const selectedRecordIds = dedupe([
      ...(receipt.toolOutputSelectedRecordIds ?? []),
      ...(receipt.toolOutputSelectedEvidenceRecordIds ?? [])
    ]);
    return (
      receipt.hook === "agent_tool_end" &&
      normalizeCreditRiskLiveMcpToolName(receipt.toolName) === "credit_negotiation.draft_structures" &&
      receipt.toolOutputSourceReadStatus === "source_backed_selected_scope" &&
      receipt.toolOutputCanonicalModel === "CreditNegotiationDraftDealModel" &&
      receipt.toolOutputTransportLayer === "supabase_credit_negotiation" &&
      receipt.recordIds.includes(accountId) &&
      selectedRecordIds.includes(accountId) &&
      selectedRecordIds.some((recordId) => recordId !== accountId)
    );
  });
}

function wantsCreditNegotiationDraft(request: NormalizedCreditRiskQueryRequest): boolean {
  return (
    request.negotiationOrders.length > 0 &&
    /\b(?:counter|deal|draft|negotiate|negotiation|option|price|simulate|structure|terms)\b/iu.test(request.question)
  );
}

async function buildCreditPolicyRationaleResult(
  input: CreditRiskQuerySessionInput,
  request: NormalizedCreditRiskQueryRequest
): Promise<CreditRiskPolicyRationaleResult | undefined> {
  const policyKey = policyKeyForQuestion(request.question);
  if (policyKey === undefined || input.dealOptimizerRows === undefined) {
    return undefined;
  }

  const policy = parseActiveCreditNegotiationPolicyRows(input.dealOptimizerRows.policyRows);
  const policyValueText = policy.canonicalValueText[policyKey];
  if (input.policyRationaleReader === undefined) {
    return {
      citations: [],
      deterministicBasis: creditPolicyRationaleBasis,
      executablePolicySource: "credit_negotiation_policy",
      message: "Policy rationale unavailable.",
      policyHash: policy.policyHash,
      policyKey,
      policyValueText,
      policyVersion: policy.policyVersion,
      status: "unavailable"
    };
  }

  try {
    const rationaleResults = await input.policyRationaleReader.searchPolicyRationale({
      canonicalValueText: policyValueText,
      policyHash: policy.policyHash,
      policyKey,
      policyVersion: policy.policyVersion,
      question: request.question
    });
    const resolution = resolveCreditNegotiationPolicyRationale(policy, rationaleResults);
    return {
      citations: rationaleResults.map((result) => ({
        content: result.content,
        deterministicBasis: creditPolicyRationaleBasis,
        recordId: result.recordId,
        source: "vector-policy-rationale"
      })),
      deterministicBasis: creditPolicyRationaleBasis,
      executablePolicySource: "credit_negotiation_policy",
      message: resolution.message,
      policyHash: policy.policyHash,
      policyKey,
      policyValueText,
      policyVersion: policy.policyVersion,
      status: resolution.status
    };
  } catch {
    return {
      citations: [],
      deterministicBasis: creditPolicyRationaleBasis,
      executablePolicySource: "credit_negotiation_policy",
      message: "Policy rationale unavailable.",
      policyHash: policy.policyHash,
      policyKey,
      policyValueText,
      policyVersion: policy.policyVersion,
      status: "unavailable"
    };
  }
}

function policyKeyForQuestion(question: string): CreditNegotiationPolicyKey | undefined {
  const normalized = question.toLowerCase();
  if (/\bmax[_\s-]*deposit[_\s-]*pct\b/u.test(normalized) || /(?:max|maximum|cap|capped|ceiling).{0,32}deposit/u.test(normalized)) {
    return "max_deposit_pct";
  }
  if (/\bmin[_\s-]*deposit[_\s-]*pct\b/u.test(normalized) || /(?:min|minimum|floor).{0,32}deposit/u.test(normalized)) {
    return "min_deposit_pct";
  }
  if (/\bmax[_\s-]*release[_\s-]*pct\b/u.test(normalized) || /(?:max|maximum|cap|capped|ceiling).{0,32}release/u.test(normalized)) {
    return "max_release_pct";
  }
  if (/\bmin[_\s-]*release[_\s-]*pct\b/u.test(normalized) || /(?:min|minimum|floor).{0,32}release/u.test(normalized)) {
    return "min_release_pct";
  }
  if (/\bmax[_\s-]*tranches\b/u.test(normalized) || /(?:max|maximum|cap|capped|ceiling).{0,32}tranches?/u.test(normalized)) {
    return "max_tranches";
  }
  if (/\bmax[_\s-]*collateral[_\s-]*ratio\b/u.test(normalized) || /(?:max|maximum|cap|capped|ceiling).{0,32}collateral/u.test(normalized)) {
    return "max_collateral_ratio";
  }
  if (
    /\bmax[_\s-]*financing[_\s-]*spread[_\s-]*bps\b/u.test(normalized) ||
    /(?:max|maximum|cap|capped|ceiling).{0,32}(?:financing|spread)/u.test(normalized)
  ) {
    return "max_financing_spread_bps";
  }

  return undefined;
}

function buildCreditNegotiationDraftResult(
  toolOutputs: readonly LiveForensicsSdkToolOutput[] | undefined,
  receipts: readonly AgentHookAuditReceipt[],
  accountId: string
): CreditRiskNegotiationDraftResult | undefined {
  if (!hasCreditNegotiationDraftSourceRead(receipts, accountId)) {
    return undefined;
  }

  const output = toolOutputs?.find(
    (candidate) => normalizeCreditRiskLiveMcpToolName(candidate.toolName) === "credit_negotiation.draft_structures"
  );
  const payload = toRecord(output?.payload);
  if (payload?.sourceReadStatus !== "source_backed_selected_scope") {
    return undefined;
  }
  const sourceReads = toRecord(payload.sourceReads);
  if (
    sourceReads?.canonicalModel !== "CreditNegotiationDraftDealModel" ||
    sourceReads.transportLayer !== "supabase_credit_negotiation"
  ) {
    return undefined;
  }

  const model = readDealOptimizerModel(payload.model);
  if (model === undefined) {
    return undefined;
  }

  return {
    deterministicBasis: creditNegotiationDraftBasis,
    model,
    toolName: "credit_negotiation.draft_structures"
  };
}

function negotiationStatusAnswerLines(request: NormalizedCreditRiskQueryRequest): string[] {
  return request.negotiationOrders.map((order) => {
    const orderPrefix = `Negotiation order ${order.orderId}: Order received ${order.orderAmountLabel}.`;
    if (order.currentRound === undefined) {
      return `${orderPrefix} No outbound round has been sent yet; next outbound round ${order.nextRound.toString()}.`;
    }

    return `${orderPrefix} Round ${order.currentRound.round.toString()} ${order.currentRound.status}; next outbound round ${order.nextRound.toString()}.`;
  });
}

function shouldRetryMissingCreditRiskMcpRead(retryCap: number | undefined): boolean {
  return retryCap !== undefined && Number.isInteger(retryCap) && retryCap > 0;
}

type CreditRiskServiceToolOutputProof = Partial<
  Pick<
    AgentHookAuditReceiptInput,
    | "toolOutputCanonicalModel"
    | "toolOutputPrimarySourceLabel"
    | "toolOutputPrimarySourceSystem"
    | "toolOutputSelectedEvidenceRecordIds"
    | "toolOutputSelectedRecordIds"
    | "toolOutputSourceFreshness"
    | "toolOutputSourceReadStatus"
    | "toolOutputTransportLabel"
    | "toolOutputTransportLayer"
  >
>;

function collectDeterministicCreditRiskAnswerSourceReadReceipts(
  input: CreditRiskQuerySessionInput,
  request: NormalizedCreditRiskQueryRequest,
  scopedRecordIds: readonly string[]
): AgentHookAuditReceipt[] {
  try {
    const result = invokeServiceTool(
      "credit_risk.answer",
      {
        accountId: request.account.accountId,
        question: request.question,
        recordIds: [...scopedRecordIds]
      },
      {
        creditRiskAnswerScope: {
          accountId: request.account.accountId,
          recordIds: [...scopedRecordIds]
        },
        creditRiskRows: input.rows
      }
    );
    const outputProof = creditRiskServiceToolOutputProof(result);
    if (outputProof === undefined) {
      return [];
    }

    return [
      createAgentHookAuditReceipt({
        agentName: "Credit Sentinel",
        deterministicBasis: deterministicForensicsHookAuditBasis,
        hook: "agent_tool_start",
        recordIds: [...scopedRecordIds],
        toolInputRecordIds: [...scopedRecordIds],
        toolName: "credit_risk.answer"
      }),
      createAgentHookAuditReceipt({
        agentName: "Credit Sentinel",
        deterministicBasis: deterministicForensicsHookAuditBasis,
        hook: "agent_tool_end",
        recordIds: [...scopedRecordIds],
        toolInputRecordIds: [...scopedRecordIds],
        toolName: "credit_risk.answer",
        ...outputProof
      })
    ];
  } catch {
    return [];
  }
}

function hasCreditRiskSelectedRecordScope(
  actual: readonly string[] | undefined,
  accountId: string,
  expected: readonly string[]
): boolean {
  if (actual === undefined) {
    return false;
  }

  const actualIds = dedupe(actual);
  const expectedIds = dedupe(expected);
  return (
    actualIds.includes(accountId) &&
    actualIds.some((recordId) => recordId !== accountId) &&
    expectedIds.every((recordId) => actualIds.includes(recordId))
  );
}

function hasCreditRiskSelectedEvidenceForScope(
  actual: readonly string[] | undefined,
  accountId: string,
  expected: readonly string[]
): boolean {
  if (actual === undefined) {
    return false;
  }

  const actualIds = dedupe(actual);
  const expectedIds = dedupe(expected);
  return (
    actualIds.includes(accountId) &&
    actualIds.some((recordId) => recordId !== accountId) &&
    actualIds.every((recordId) => expectedIds.includes(recordId))
  );
}

function mergeLiveCreditRiskAgentRuns(
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
    ...mergeCreditRiskTokenUsageSnapshot(first.tokenUsageSnapshot, second.tokenUsageSnapshot)
  };
}

function mergeCreditRiskTokenUsageSnapshot(
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

function buildLiveCreditRiskQueryInput(
  request: NormalizedCreditRiskQueryRequest,
  validationRetryReason?: string
): string {
  const evidenceLines = request.account.evidenceDocuments.map(
    (document) =>
      `Evidence document ${document.documentId}: ${document.title}; records ${document.recordIds.join(", ")}; source ${document.sourceModeLabel}.`
  );

  const lines = [
    "Selected David credit risk query.",
    `Question: ${request.question}`,
    `Selected account: ${request.account.accountId}`,
    `Selected record IDs: ${request.effectiveRecordIds.join(", ")}.`,
    "Step 1: call the SDK-visible governed MCP function tool credit_risk_answer (Recoup service credit_risk.answer) exactly once with accountId, question, and selected record IDs.",
    ...(request.negotiationOrders.length === 0
      ? []
      : [
          `Negotiation draft tool is available for order IDs: ${request.negotiationOrders.map((order) => `${order.orderId} (${order.sourceRecordIds.join(", ")})`).join("; ")}.`,
          ...request.negotiationOrders.map((order) =>
            [
              `Negotiation state for ${order.orderId}: order received ${order.orderAmountLabel};`,
              order.currentRound === undefined
                ? `no current outbound round; next outbound round ${order.nextRound.toString()}.`
                : `current round ${order.currentRound.round.toString()} is ${order.currentRound.status}; next outbound round ${order.nextRound.toString()}.`
            ].join(" ")
          ),
          ...request.negotiationOrders.map(
            (order) =>
              `When calling credit_negotiation_draft_structures for ${order.orderId}, recordIds must include ${request.account.accountId}, ${order.orderId}, and ${order.sourceRecordIds.join(", ")}.`
          ),
          "If the question asks to draft, simulate, negotiate, counter, or price a deal structure, call the SDK-visible governed MCP function tool credit_negotiation_draft_structures (Recoup service credit_negotiation.draft_structures) exactly once after credit_risk_answer.",
          "The credit_negotiation_draft_structures structures array must contain only candidateId, collateralRatio, depositPct, financingSpreadBps, releasePct, and trancheCount. Do not include amount, dollar, price, revenue, cost, loss, objective, or objectiveValue fields."
        ]),
    "Step 2: after any required source tools return: Do not call credit_risk_answer again. Immediately call the Agents SDK handoff function transfer_to_Action_Packet_Drafter to hand off to Action Packet Drafter.",
    "Do not call actions.*, decisions.*, approvals.*, or ERP mutation tools.",
    "Return only concise lifecycle status. Raw model text is suppressed; Recoup code produces the visible business answer.",
    ...evidenceLines
  ];
  if (validationRetryReason !== undefined) {
    lines.splice(
      4,
      0,
      `Validation retry: ${validationRetryReason}`,
      "This retry is not optional: call credit_risk_answer before any lifecycle summary or handoff."
    );
  }

  return lines.join("\n");
}

function buildCreditRiskLiveTrace(
  receipts: readonly AgentHookAuditReceipt[],
  scopedRecordIds: readonly string[]
): ForensicsQueryTraceEvent[] {
  return dedupeLiveAgentReceipts(receipts).map((receipt, index) => ({
    agentName: receipt.agentName,
    deterministicBasis: liveCreditRiskQueryAnswerGuardBasis,
    hook: receipt.hook,
    label: liveTraceLabelForReceipt(receipt),
    message: `Live Agents SDK hook receipt recorded for ${receipt.agentName}.`,
    ...(receipt.nextAgentName === undefined ? {} : { nextAgentName: receipt.nextAgentName }),
    phase: liveTracePhaseForReceipt(receipt, index),
    receiptDeterministicBasis: receipt.deterministicBasis,
    recordIds: dedupe([...receipt.recordIds, ...scopedRecordIds]),
    ...(receipt.toolName === undefined ? {} : { toolName: receipt.toolName })
  }));
}

function buildCreditRiskPromptCacheMetadata(snapshot: OpenAiTokenUsageSnapshot) {
  const cacheConfig = openAiPromptCacheConfig.credit_risk;

  return {
    ...(snapshot.cachedTokens === undefined ? {} : { cachedTokens: snapshot.cachedTokens }),
    capability: "credit_risk" as const,
    ...(snapshot.inputTokens === undefined ? {} : { inputTokens: snapshot.inputTokens }),
    ...(snapshot.outputTokens === undefined ? {} : { outputTokens: snapshot.outputTokens }),
    promptCacheKey: cacheConfig.promptCacheKey,
    promptPrefixVersion: cacheConfig.promptPrefixVersion
  };
}

function blockedCreditRiskQueryResponse(
  mode: "blocked_live_agent_trace" | "blocked_missing_credentials",
  reason: string
): CreditRiskQuerySessionResponse {
  return {
    citations: [],
    modelExecution: {
      deterministicBasis: liveCreditRiskQueryRequiredBasis,
      mode,
      reason
    },
    trace: []
  };
}

function sourceLabelForRecordId(account: CreditRiskAccountModel, recordId: string): string {
  const document = account.evidenceDocuments.find(
    (candidate) => candidate.documentId === recordId || candidate.recordIds.includes(recordId)
  );
  if (document !== undefined) {
    return document.sourceModeLabel;
  }

  return "credit-risk-read-model";
}

function titleForRecordId(account: CreditRiskAccountModel, recordId: string): string {
  const document = account.evidenceDocuments.find(
    (candidate) => candidate.documentId === recordId || candidate.recordIds.includes(recordId)
  );
  if (document !== undefined) {
    return document.title;
  }

  const signal = account.signals.find((candidate) => candidate.recordIds.includes(recordId));
  return signal?.note ?? account.customer;
}

function liveTracePhaseForReceipt(receipt: AgentHookAuditReceipt, index: number): ForensicsQueryTraceEvent["phase"] {
  if (receipt.hook === "agent_tool_start" || receipt.hook === "agent_tool_end") {
    return "retrieval";
  }
  if (receipt.hook === "agent_handoff") {
    return "query";
  }
  if (receipt.agentName === "Action Packet Drafter") {
    return "decision";
  }

  return index === 0 ? "supervisor" : "query";
}

function liveTraceLabelForReceipt(receipt: AgentHookAuditReceipt): string {
  if (receipt.hook === "agent_handoff" && receipt.nextAgentName !== undefined) {
    return `${receipt.agentName} handed off to ${receipt.nextAgentName}`;
  }
  if (receipt.toolName !== undefined) {
    return `${receipt.agentName} ${receipt.hook.replaceAll("_", " ")} ${receipt.toolName}`;
  }

  return `${receipt.agentName} ${receipt.hook.replaceAll("_", " ")}`;
}

function normalizeCreditRiskLiveMcpToolName(toolName: string | undefined): string | undefined {
  if (toolName === "credit_risk_answer") {
    return "credit_risk.answer";
  }
  if (toolName === "credit_negotiation_draft_structures") {
    return "credit_negotiation.draft_structures";
  }

  return toolName;
}

function dedupeLiveAgentReceipts(receipts: readonly AgentHookAuditReceipt[]): AgentHookAuditReceipt[] {
  const seen = new Set<string>();
  const deduped: AgentHookAuditReceipt[] = [];
  for (const receipt of receipts) {
    const key = JSON.stringify({
      agentName: receipt.agentName,
      hook: receipt.hook,
      nextAgentName: receipt.nextAgentName,
      toolName: receipt.toolName,
      recordIds: receipt.recordIds
    });
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(receipt);
  }

  return deduped;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function creditRiskServiceToolOutputProof(result: unknown): CreditRiskServiceToolOutputProof | undefined {
  const payloadRecord = toRecord(result);
  const sourceReads = toRecord(payloadRecord?.sourceReads);
  if (payloadRecord === undefined || sourceReads === undefined) {
    return undefined;
  }

  const canonicalModel = readNonEmptyString(sourceReads.canonicalModel);
  const primarySourceLabel = readNonEmptyString(sourceReads.primarySourceLabel);
  const primarySourceSystem = readNonEmptyString(sourceReads.primarySourceSystem);
  const selectedEvidenceRecordIds = collectSelectedEvidenceRecordIds(sourceReads.selectedEvidence);
  const selectedRecordIds = readStringArray(sourceReads.selectedRecordIds);
  const sourceFreshness = readNonEmptyString(sourceReads.sourceFreshness);
  const sourceReadStatus = readNonEmptyString(payloadRecord.sourceReadStatus);
  const transportLabel = readNonEmptyString(sourceReads.transportLabel);
  const transportLayer = readNonEmptyString(sourceReads.transportLayer);
  const outputProof: CreditRiskServiceToolOutputProof = {
    ...(canonicalModel === undefined ? {} : { toolOutputCanonicalModel: canonicalModel }),
    ...(primarySourceLabel === undefined ? {} : { toolOutputPrimarySourceLabel: primarySourceLabel }),
    ...(primarySourceSystem === undefined ? {} : { toolOutputPrimarySourceSystem: primarySourceSystem }),
    ...(selectedEvidenceRecordIds.length === 0 ? {} : { toolOutputSelectedEvidenceRecordIds: selectedEvidenceRecordIds }),
    ...(selectedRecordIds === undefined ? {} : { toolOutputSelectedRecordIds: selectedRecordIds }),
    ...(sourceFreshness === undefined ? {} : { toolOutputSourceFreshness: sourceFreshness }),
    ...(sourceReadStatus === undefined ? {} : { toolOutputSourceReadStatus: sourceReadStatus }),
    ...(transportLabel === undefined ? {} : { toolOutputTransportLabel: transportLabel }),
    ...(transportLayer === undefined ? {} : { toolOutputTransportLayer: transportLayer })
  };

  return Object.keys(outputProof).length === 0 ? undefined : outputProof;
}

function collectSelectedEvidenceRecordIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const recordIds: string[] = [];
  for (const evidence of value) {
    const evidenceRecord = toRecord(evidence);
    const evidenceRecordIds = readStringArray(evidenceRecord?.recordIds);
    if (evidenceRecordIds !== undefined) {
      recordIds.push(...evidenceRecordIds);
    }
  }

  return dedupe(recordIds);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = dedupe(value.filter((entry): entry is string => typeof entry === "string"));
  return values.length === 0 ? undefined : values;
}

function readDealOptimizerModel(value: unknown): DealOptimizerModel | undefined {
  const record = toRecord(value);
  if (record === undefined) {
    return undefined;
  }

  const optimizerRunId = readNonEmptyString(record.optimizerRunId);
  const orderId = readNonEmptyString(record.orderId);
  const policyHash = readNonEmptyString(record.policyHash);
  const sourceHash = readNonEmptyString(record.sourceHash);
  const sourceRecordIds = readStringArray(record.sourceRecordIds);
  if (
    optimizerRunId === undefined ||
    orderId === undefined ||
    policyHash === undefined ||
    sourceHash === undefined ||
    !Array.isArray(record.rankedCandidates) ||
    !Array.isArray(record.rejectedCandidates) ||
    sourceRecordIds === undefined
  ) {
    return undefined;
  }

  return record as unknown as DealOptimizerModel;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
