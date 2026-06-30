import type { RuntimeEnv } from "../../config/env.js";
import {
  createAgentHookAuditReceipt,
  registerRunHookAuditReceipts,
  type AgentHookAuditReceipt
} from "../services/conductor.js";
import type { ServiceInvocationContext } from "../services/serviceLayer.js";
import { createForensicsInvestigatorAgent, forensicsInvestigatorAgent } from "./agentRuntime.js";
import type { ForensicsTraceEvent } from "./forensics.js";
import { Agent, OpenAIProvider, Runner, type RunStreamEvent } from "./openAiAgentsSdk.js";
import { createMayaMcpGateway, mayaAgentMcpAllowedToolNames, type MayaMcpGateway } from "./mcpGateway.js";

const liveAgentInput =
  "Stream concise operator-visible status for the Recoup forensics run. Do not compute or state dollar amounts, verdicts, routings, approvals, or external actions. Those are produced only by deterministic Recoup code.";
const liveModelSkippedText = "Live Agents SDK stream skipped: OPENAI_API_KEY is not configured.";
const liveModelStartedText = "Live Agents SDK stream started for Forensics Investigator.";
const liveModelCompletedText = "Live Agents SDK stream completed.";
const liveModelFailedText = "Live Agents SDK stream failed closed; deterministic forensics run continued.";
const liveModelDeltaSuppressedText = "Live model text delta received; content suppressed by Recoup output guard.";

export interface LiveForensicsStreamRequest {
  agentHookAudit?: LiveForensicsAgentHookAuditOptions;
  apiKey: string;
  input: string;
  maxTurns: number;
  mcpServiceContext?: ServiceInvocationContext;
  signal?: AbortSignal;
}

type MaybePromise<T> = T | Promise<T>;

export type LiveForensicsStreamRunner = (
  request: LiveForensicsStreamRequest
) => MaybePromise<AsyncIterable<unknown>>;

export interface LiveForensicsAgentHookAuditOptions {
  onReceipt: (receipt: AgentHookAuditReceipt) => void;
  recordIds: string[];
}

export interface LiveForensicsOpenAiRunner {
  on(type: string, listener: (...args: unknown[]) => void): unknown;
  run(
    agent: Agent,
    input: string,
    options: { maxTurns: number; signal?: AbortSignal; stream: true }
  ): Promise<AsyncIterable<RunStreamEvent>>;
}

export type LiveForensicsMcpGateway = MayaMcpGateway;

export interface OpenAIForensicsAgentStreamOptions {
  env?: RuntimeEnv;
  mcpGatewayFactory?: () => MaybePromise<LiveForensicsMcpGateway | undefined>;
  mcpServiceContext?: ServiceInvocationContext;
}

export interface StreamLiveForensicsTraceOptions {
  agentHookRecordIds?: string[];
  env?: RuntimeEnv;
  input?: string;
  maxTurns?: number;
  mcpServiceContext?: ServiceInvocationContext;
  onAgentHookReceipt?: (receipt: AgentHookAuditReceipt) => void;
  onRetry?: () => void;
  onTokenUsage?: (tokens: number) => void;
  onTokenUsageSnapshot?: (snapshot: OpenAiTokenUsageSnapshot) => void;
  retryCap?: number;
  runner?: LiveForensicsStreamRunner;
  signal?: AbortSignal;
}

export type LiveForensicsAgentRunStatus = "blocked_missing_credentials" | "completed" | "failed";

export interface LiveForensicsAgentRunResult {
  events: ForensicsTraceEvent[];
  hookReceipts: AgentHookAuditReceipt[];
  status: LiveForensicsAgentRunStatus;
  tokenUsage: number;
  tokenUsageSnapshot?: OpenAiTokenUsageSnapshot;
}

export interface OpenAiTokenUsageSnapshot {
  cachedTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens: number;
}

type ForensicsStatusKind = Extract<ForensicsTraceEvent, { type: "status" }>["payload"]["kind"];
type SdkToolInputProof = {
  toolInputRecordIds?: string[];
  toolInputSelectedLineId?: string;
};
type SdkToolOutputProof = {
  toolOutputCanonicalModel?: string;
  toolOutputPrimarySourceLabel?: string;
  toolOutputPrimarySourceSystem?: string;
  toolOutputSapEvidenceRecordIds?: string[];
  toolOutputSelectedLineId?: string;
  toolOutputSelectedRecordIds?: string[];
  toolOutputSourceFreshness?: string;
  toolOutputSourceReadStatus?: string;
  toolOutputTransportLabel?: string;
  toolOutputTransportLayer?: string;
};

export const forensicsQueryTracePhases = ["supervisor", "query", "retrieval", "decision"] as const;
export type ForensicsQueryTracePhase = (typeof forensicsQueryTracePhases)[number];

export interface ForensicsQueryTraceEvent {
  agentName: string;
  deterministicBasis: string;
  hook: AgentHookAuditReceipt["hook"];
  label: string;
  message: string;
  nextAgentName?: string;
  phase: ForensicsQueryTracePhase;
  receiptDeterministicBasis: AgentHookAuditReceipt["deterministicBasis"];
  recordIds: string[];
  toolName?: string;
}

export async function collectLiveForensicsAgentRun(
  options: StreamLiveForensicsTraceOptions = {}
): Promise<LiveForensicsAgentRunResult> {
  const events: ForensicsTraceEvent[] = [];
  const hookReceipts: AgentHookAuditReceipt[] = [];
  let status: LiveForensicsAgentRunStatus = "failed";
  let tokenUsage = 0;
  let completedAttemptTokenUsageSnapshot: OpenAiTokenUsageSnapshot | undefined;
  let currentAttemptTokenUsageSnapshot: OpenAiTokenUsageSnapshot | undefined;
  const sourceRunner =
    options.runner ??
    ((request: LiveForensicsStreamRequest) =>
      runOpenAIForensicsAgentStream(request, undefined, openAiForensicsStreamOptionsFromEnv(options.env)));
  const runner: LiveForensicsStreamRunner = async (request) => {
    if (request.agentHookAudit === undefined) {
      return sourceRunner(request);
    }

    const agentHookAudit = request.agentHookAudit;
    const capturedRequest: LiveForensicsStreamRequest = {
      apiKey: request.apiKey,
      input: request.input,
      maxTurns: request.maxTurns,
      ...(request.mcpServiceContext === undefined ? {} : { mcpServiceContext: request.mcpServiceContext }),
      agentHookAudit: {
        onReceipt(receipt) {
          hookReceipts.push(receipt);
          agentHookAudit.onReceipt(receipt);
        },
        recordIds: agentHookAudit.recordIds
      },
      ...(request.signal === undefined ? {} : { signal: request.signal })
    };

    return sourceRunner(capturedRequest);
  };

  for await (const event of streamLiveForensicsTraceEvents({
    ...options,
    onTokenUsage(tokens) {
      tokenUsage += tokens;
      options.onTokenUsage?.(tokens);
    },
    onRetry() {
      completedAttemptTokenUsageSnapshot = sumOpenAiTokenUsageSnapshots(
        completedAttemptTokenUsageSnapshot,
        currentAttemptTokenUsageSnapshot
      );
      currentAttemptTokenUsageSnapshot = undefined;
      options.onRetry?.();
    },
    onTokenUsageSnapshot(snapshot) {
      currentAttemptTokenUsageSnapshot = mergeOpenAiTokenUsageSnapshots(currentAttemptTokenUsageSnapshot, snapshot);
      options.onTokenUsageSnapshot?.(snapshot);
    },
    onAgentHookReceipt(receipt) {
      hookReceipts.push(receipt);
    },
    runner
  })) {
    events.push(event);
    if (event.type === "status") {
      if (event.payload.text === liveModelSkippedText) {
        status = "blocked_missing_credentials";
      }
      if (event.payload.text === liveModelCompletedText) {
        status = "completed";
      }
      if (event.payload.text === liveModelFailedText) {
        status = "failed";
      }
    }
  }

  const tokenUsageSnapshot = sumOpenAiTokenUsageSnapshots(
    completedAttemptTokenUsageSnapshot,
    currentAttemptTokenUsageSnapshot
  );
  const aggregateTokenUsageSnapshot =
    tokenUsageSnapshot === undefined
      ? undefined
      : {
          ...tokenUsageSnapshot,
          totalTokens: tokenUsage
        };

  return {
    events,
    hookReceipts,
    status,
    tokenUsage,
    ...(aggregateTokenUsageSnapshot === undefined ? {} : { tokenUsageSnapshot: aggregateTokenUsageSnapshot })
  };
}

function sumOpenAiTokenUsageSnapshots(
  current: OpenAiTokenUsageSnapshot | undefined,
  next: OpenAiTokenUsageSnapshot | undefined
): OpenAiTokenUsageSnapshot | undefined {
  if (current === undefined && next === undefined) {
    return undefined;
  }

  return {
    ...(current?.cachedTokens === undefined && next?.cachedTokens === undefined
      ? {}
      : { cachedTokens: (current?.cachedTokens ?? 0) + (next?.cachedTokens ?? 0) }),
    ...(current?.inputTokens === undefined && next?.inputTokens === undefined
      ? {}
      : { inputTokens: (current?.inputTokens ?? 0) + (next?.inputTokens ?? 0) }),
    ...(current?.outputTokens === undefined && next?.outputTokens === undefined
      ? {}
      : { outputTokens: (current?.outputTokens ?? 0) + (next?.outputTokens ?? 0) }),
    totalTokens: (current?.totalTokens ?? 0) + (next?.totalTokens ?? 0)
  };
}

function mergeOpenAiTokenUsageSnapshots(
  current: OpenAiTokenUsageSnapshot | undefined,
  next: OpenAiTokenUsageSnapshot
): OpenAiTokenUsageSnapshot {
  return {
    ...(current?.cachedTokens === undefined && next.cachedTokens === undefined
      ? {}
      : { cachedTokens: Math.max(current?.cachedTokens ?? 0, next.cachedTokens ?? 0) }),
    ...(current?.inputTokens === undefined && next.inputTokens === undefined
      ? {}
      : { inputTokens: Math.max(current?.inputTokens ?? 0, next.inputTokens ?? 0) }),
    ...(current?.outputTokens === undefined && next.outputTokens === undefined
      ? {}
      : { outputTokens: Math.max(current?.outputTokens ?? 0, next.outputTokens ?? 0) }),
    totalTokens: Math.max(current?.totalTokens ?? 0, next.totalTokens)
  };
}

export async function* streamLiveForensicsTraceEvents(
  options: StreamLiveForensicsTraceOptions = {}
): AsyncGenerator<ForensicsTraceEvent> {
  const apiKey = options.env?.OPENAI_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    yield statusEvent("model-context", liveModelSkippedText);
    return;
  }

  yield statusEvent("agent-boundary", liveModelStartedText);
  if (options.maxTurns === undefined || !Number.isInteger(options.maxTurns) || options.maxTurns <= 0) {
    yield statusEvent("agent-boundary", "Live Agents SDK stream failed closed; DB-backed run-control maxTurns is not configured.");
    return;
  }
  if (options.retryCap === undefined) {
    yield statusEvent("agent-boundary", "Live Agents SDK stream failed closed; DB-backed run-control retryCap is not configured.");
    return;
  }
  if (!Number.isInteger(options.retryCap) || options.retryCap < 0) {
    yield statusEvent("agent-boundary", "Live Agents SDK stream failed closed; DB-backed run-control retryCap is invalid.");
    return;
  }

  const agentHookReceipts: AgentHookAuditReceipt[] = [];
  const retryCap = options.retryCap;
  let retryCount = 0;

  for (;;) {
    let recordedTokenTotal = 0;
    try {
      const agentHookRecordIds = dedupeRecordIds(options.agentHookRecordIds ?? []);
      const sdkToolInputProofs = new Map<string, SdkToolInputProof>();
      const request: LiveForensicsStreamRequest = {
        apiKey,
        input: options.input ?? liveAgentInput,
        maxTurns: options.maxTurns
      };
      if (options.mcpServiceContext !== undefined) {
        request.mcpServiceContext = options.mcpServiceContext;
      }
      if (agentHookRecordIds.length > 0) {
        request.agentHookAudit = {
          onReceipt(receipt) {
            agentHookReceipts.push(receipt);
          },
          recordIds: agentHookRecordIds
        };
      }
      if (options.signal !== undefined) {
        request.signal = options.signal;
      }

      const stream = await (
        options.runner ??
        ((liveRequest) => runOpenAIForensicsAgentStream(liveRequest, undefined, openAiForensicsStreamOptionsFromEnv(options.env)))
      )(request);
      for (const receiptEvent of drainAgentHookReceiptEvents(agentHookReceipts)) {
        yield receiptEvent;
      }
      for await (const event of stream) {
        for (const receiptEvent of drainAgentHookReceiptEvents(agentHookReceipts)) {
          yield receiptEvent;
        }
        const tokenUsageSnapshot = readTokenUsageSnapshot(event);
        if (tokenUsageSnapshot !== undefined) {
          options.onTokenUsageSnapshot?.(tokenUsageSnapshot);
          if (tokenUsageSnapshot.totalTokens > recordedTokenTotal) {
            options.onTokenUsage?.(tokenUsageSnapshot.totalTokens - recordedTokenTotal);
            recordedTokenTotal = tokenUsageSnapshot.totalTokens;
          }
        }
        const sdkToolReceipt =
          agentHookRecordIds.length > 0
            ? sdkToolReceiptFromRunItemEvent(event, agentHookRecordIds, sdkToolInputProofs)
            : undefined;
        if (sdkToolReceipt !== undefined) {
          agentHookReceipts.push(sdkToolReceipt);
          options.onAgentHookReceipt?.(sdkToolReceipt);
        }
        const traceEvent = mapRunStreamEvent(event);
        if (traceEvent !== undefined) {
          yield traceEvent;
        }
        for (const receiptEvent of drainAgentHookReceiptEvents(agentHookReceipts)) {
          yield receiptEvent;
        }
      }
      for (const receiptEvent of drainAgentHookReceiptEvents(agentHookReceipts)) {
        yield receiptEvent;
      }
      yield statusEvent("agent-boundary", liveModelCompletedText);
      return;
    } catch {
      for (const receiptEvent of drainAgentHookReceiptEvents(agentHookReceipts)) {
        yield receiptEvent;
      }
      if (retryCount < retryCap) {
        retryCount += 1;
        options.onRetry?.();
        yield statusEvent("agent-boundary", "Live Agents SDK stream retrying after recoverable failure.");
        continue;
      }
      yield statusEvent("agent-boundary", liveModelFailedText);
      return;
    }
  }
}

export async function runOpenAIForensicsAgentStream(
  request: LiveForensicsStreamRequest,
  runner: LiveForensicsOpenAiRunner = createOpenAiForensicsRunner(request.apiKey),
  options: OpenAIForensicsAgentStreamOptions = {}
): Promise<AsyncIterable<RunStreamEvent>> {
  if (request.agentHookAudit !== undefined) {
    registerRunHookAuditReceipts(runner, request.agentHookAudit.onReceipt, {
      recordIds: request.agentHookAudit.recordIds
    });
  }

  const runOptions =
    request.signal === undefined
      ? {
          maxTurns: request.maxTurns,
          stream: true as const
        }
      : {
          maxTurns: request.maxTurns,
          signal: request.signal,
          stream: true as const
        };

  const mcpGateway = await resolveLiveMcpGateway({
    ...options,
    ...(request.mcpServiceContext === undefined ? {} : { mcpServiceContext: request.mcpServiceContext })
  });
  try {
    if (mcpGateway !== undefined) {
      await mcpGateway.connect();
    }
    const agent =
      mcpGateway === undefined
        ? forensicsInvestigatorAgent
        : createForensicsInvestigatorAgent({ mcpServers: mcpGateway.mcpServers });
    const stream = await runner.run(agent, request.input, runOptions);

    return mcpGateway === undefined ? stream : closeMcpGatewayAfterStream(stream, mcpGateway);
  } catch (error) {
    await mcpGateway?.close();
    throw error;
  }
}

async function resolveLiveMcpGateway(
  options: OpenAIForensicsAgentStreamOptions
): Promise<LiveForensicsMcpGateway | undefined> {
  if (options.mcpGatewayFactory !== undefined) {
    return options.mcpGatewayFactory();
  }

  return options.env === undefined
    ? undefined
    : createMayaMcpGateway({
        env: options.env,
        ...(options.mcpServiceContext === undefined ? {} : { serviceContext: options.mcpServiceContext })
      });
}

function closeMcpGatewayAfterStream<T>(
  stream: AsyncIterable<T>,
  mcpGateway: LiveForensicsMcpGateway
): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      try {
        for await (const event of stream) {
          yield event;
        }
      } finally {
        await mcpGateway.close();
      }
    }
  };
}

function createOpenAiForensicsRunner(apiKey: string): LiveForensicsOpenAiRunner {
  return new Runner({
    modelProvider: new OpenAIProvider({ apiKey }),
    traceIncludeSensitiveData: false,
    tracingDisabled: true,
    workflowName: "recoup-forensics-live-stream"
  });
}

function openAiForensicsStreamOptionsFromEnv(
  env: RuntimeEnv | undefined
): OpenAIForensicsAgentStreamOptions {
  return env === undefined ? {} : { env };
}

function mapRunStreamEvent(event: unknown): ForensicsTraceEvent | undefined {
  if (!isRecord(event)) {
    return undefined;
  }

  if (event.type === "raw_model_stream_event" && isRecord(event.data)) {
    const data = event.data;
    if ((data.type === "response.output_text.delta" || data.type === "output_text_delta") && typeof data.delta === "string") {
      return data.delta.trim().length === 0 ? undefined : statusEvent("model-text-delta", liveModelDeltaSuppressedText);
    }
  }

  if (event.type === "agent_updated_stream_event") {
    const agentName = readAgentName(event.agent);
    return statusEvent("agent-boundary", `Live Agents SDK active agent: ${agentName}.`);
  }

  if (event.type === "run_item_stream_event" && typeof event.name === "string") {
    if (event.name === "handoff_requested" || event.name === "handoff_occurred") {
      return statusEvent("handoff", `Live Agents SDK ${humanizeRunItemEventName(event.name)}.`);
    }

    if (event.name === "tool_called" || event.name === "tool_output" || event.name === "tool_approval_requested") {
      return statusEvent("service-tool", `Live Agents SDK ${humanizeRunItemEventName(event.name)}.`);
    }
  }

  return undefined;
}

function sdkToolReceiptFromRunItemEvent(
  event: unknown,
  recordIds: readonly string[],
  inputProofs: Map<string, SdkToolInputProof>
): AgentHookAuditReceipt | undefined {
  if (!isRecord(event) || event.type !== "run_item_stream_event") {
    return undefined;
  }
  if (event.name !== "tool_called" && event.name !== "tool_output") {
    return undefined;
  }

  const toolName = normalizeSdkToolName(readRunItemToolName(event.item));
  if (toolName === undefined || !mayaAgentMcpAllowedToolNames.includes(toolName as (typeof mayaAgentMcpAllowedToolNames)[number])) {
    return undefined;
  }
  const toolCallKey = readRunItemToolCallKey(event.item, toolName);
  const inputProof =
    event.name === "tool_called"
      ? selectedEvidenceToolInputProof(readRunItemStructuredPayload(event.item, [
          "arguments",
          "argumentsJson",
          "arguments_json",
          "args",
          "input",
          "params"
        ]))
      : (inputProofs.get(toolCallKey) ?? inputProofs.get(toolName));
  if (event.name === "tool_called" && inputProof !== undefined) {
    inputProofs.set(toolCallKey, inputProof);
    inputProofs.set(toolName, inputProof);
  }
  const outputProof =
    event.name === "tool_output"
      ? selectedEvidenceToolOutputProof(readRunItemStructuredPayload(event.item, ["output", "result", "content"]))
      : undefined;

  return createAgentHookAuditReceipt({
    agentName: readRunItemAgentName(event.item) ?? "Forensics Investigator",
    hook: event.name === "tool_called" ? "agent_tool_start" : "agent_tool_end",
    recordIds: [...recordIds],
    toolName,
    ...(inputProof === undefined ? {} : inputProof),
    ...(outputProof === undefined ? {} : outputProof)
  });
}

function selectedEvidenceToolInputProof(payload: unknown): SdkToolInputProof | undefined {
  const payloadRecord = toRecord(payload);
  if (payloadRecord === undefined) {
    return undefined;
  }

  const selectedLineId = readNonEmptyString(payloadRecord.selectedLineId);
  const recordIds = readStringArray(payloadRecord.recordIds);
  if (selectedLineId === undefined && recordIds === undefined) {
    return undefined;
  }

  return {
    ...(recordIds === undefined ? {} : { toolInputRecordIds: recordIds }),
    ...(selectedLineId === undefined ? {} : { toolInputSelectedLineId: selectedLineId })
  };
}

function selectedEvidenceToolOutputProof(payload: unknown): SdkToolOutputProof | undefined {
  const payloadRecord = toRecord(payload);
  const sourceReads = toRecord(payloadRecord?.sourceReads);
  if (payloadRecord === undefined || sourceReads === undefined) {
    return undefined;
  }

  const canonicalModel = readNonEmptyString(sourceReads.canonicalModel);
  const primarySourceLabel = readNonEmptyString(sourceReads.primarySourceLabel);
  const primarySourceSystem = readNonEmptyString(sourceReads.primarySourceSystem);
  const sapEvidenceRecordIds = collectSapEvidenceRecordIds(sourceReads.sapEvidence);
  const selectedLineId = readNonEmptyString(sourceReads.selectedLineId);
  const selectedRecordIds = readStringArray(sourceReads.selectedRecordIds);
  const sourceFreshness = readNonEmptyString(sourceReads.sourceFreshness);
  const sourceReadStatus = readNonEmptyString(payloadRecord.sourceReadStatus);
  const transportLabel = readNonEmptyString(sourceReads.transportLabel);
  const transportLayer = readNonEmptyString(sourceReads.transportLayer);
  const outputProof: SdkToolOutputProof = {
    ...(canonicalModel === undefined ? {} : { toolOutputCanonicalModel: canonicalModel }),
    ...(primarySourceLabel === undefined ? {} : { toolOutputPrimarySourceLabel: primarySourceLabel }),
    ...(primarySourceSystem === undefined ? {} : { toolOutputPrimarySourceSystem: primarySourceSystem }),
    ...(sapEvidenceRecordIds.length === 0 ? {} : { toolOutputSapEvidenceRecordIds: sapEvidenceRecordIds }),
    ...(selectedLineId === undefined ? {} : { toolOutputSelectedLineId: selectedLineId }),
    ...(selectedRecordIds === undefined ? {} : { toolOutputSelectedRecordIds: selectedRecordIds }),
    ...(sourceFreshness === undefined ? {} : { toolOutputSourceFreshness: sourceFreshness }),
    ...(sourceReadStatus === undefined ? {} : { toolOutputSourceReadStatus: sourceReadStatus }),
    ...(transportLabel === undefined ? {} : { toolOutputTransportLabel: transportLabel }),
    ...(transportLayer === undefined ? {} : { toolOutputTransportLayer: transportLayer })
  };

  return Object.keys(outputProof).length === 0 ? undefined : outputProof;
}

function normalizeSdkToolName(toolName: string | undefined): string | undefined {
  if (toolName === undefined) {
    return undefined;
  }

  return toolName.replaceAll("_", ".");
}

function readRunItemToolName(item: unknown): string | undefined {
  const itemRecord = toRecord(item);
  const rawItem = toRecord(itemRecord?.rawItem);
  if (typeof rawItem?.name === "string" && rawItem.name.length > 0) {
    return rawItem.name;
  }
  if (typeof itemRecord?.name === "string" && itemRecord.name.length > 0) {
    return itemRecord.name;
  }

  const json = readRunItemJson(itemRecord);
  const jsonRawItem = toRecord(json?.rawItem);
  if (typeof jsonRawItem?.name === "string" && jsonRawItem.name.length > 0) {
    return jsonRawItem.name;
  }

  return undefined;
}

function readRunItemAgentName(item: unknown): string | undefined {
  const itemRecord = toRecord(item);
  const agent = toRecord(itemRecord?.agent);
  if (typeof agent?.name === "string" && agent.name.length > 0) {
    return agent.name;
  }

  const json = readRunItemJson(itemRecord);
  const jsonAgent = toRecord(json?.agent);
  return typeof jsonAgent?.name === "string" && jsonAgent.name.length > 0 ? jsonAgent.name : undefined;
}

function readRunItemToolCallKey(item: unknown, fallbackToolName: string): string {
  const itemRecord = toRecord(item);
  const rawItem = toRecord(itemRecord?.rawItem);
  const json = readRunItemJson(itemRecord);
  const jsonRawItem = toRecord(json?.rawItem);
  const candidates = [
    rawItem?.callId,
    rawItem?.call_id,
    rawItem?.id,
    itemRecord?.callId,
    itemRecord?.call_id,
    itemRecord?.id,
    jsonRawItem?.callId,
    jsonRawItem?.call_id,
    jsonRawItem?.id,
    json?.callId,
    json?.call_id,
    json?.id
  ];

  for (const candidate of candidates) {
    const value = readNonEmptyString(candidate);
    if (value !== undefined) {
      return value;
    }
  }

  return fallbackToolName;
}

function readRunItemStructuredPayload(item: unknown, keys: readonly string[]): unknown {
  const itemRecord = toRecord(item);
  const rawItem = toRecord(itemRecord?.rawItem);
  const json = readRunItemJson(itemRecord);
  const jsonRawItem = toRecord(json?.rawItem);
  const records = [rawItem, itemRecord, jsonRawItem, json];

  for (const record of records) {
    if (record === undefined) {
      continue;
    }
    for (const key of keys) {
      if (key in record) {
        const normalizedPayload = normalizeStructuredPayload(record[key]);
        if (normalizedPayload !== undefined) {
          return normalizedPayload;
        }
      }
    }
  }

  return undefined;
}

function normalizeStructuredPayload(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return normalizeStructuredPayload(JSON.parse(value) as unknown);
    } catch {
      return undefined;
    }
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const entryRecord = toRecord(entry);
      if (typeof entryRecord?.text === "string") {
        const parsedText = normalizeStructuredPayload(entryRecord.text);
        if (parsedText !== undefined) {
          return parsedText;
        }
      }
      const normalizedEntry = normalizeStructuredPayload(entry);
      if (isRecord(normalizedEntry)) {
        return normalizedEntry;
      }
    }

    return undefined;
  }
  const valueRecord = toRecord(value);
  if (valueRecord === undefined) {
    return undefined;
  }
  if (typeof valueRecord.text === "string") {
    const textPayload = normalizeStructuredPayload(valueRecord.text);
    if (textPayload !== undefined) {
      return textPayload;
    }
  }
  if (Array.isArray(valueRecord.content)) {
    const contentPayload = normalizeStructuredPayload(valueRecord.content);
    if (contentPayload !== undefined) {
      return contentPayload;
    }
  }
  if (valueRecord.structuredContent !== undefined) {
    const structuredContent = normalizeStructuredPayload(valueRecord.structuredContent);
    if (structuredContent !== undefined) {
      return structuredContent;
    }
  }

  return valueRecord;
}

function readRunItemJson(item: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const toJSON = item?.toJSON;
  if (typeof toJSON !== "function") {
    return undefined;
  }

  try {
    return toRecord(toJSON.call(item));
  } catch {
    return undefined;
  }
}

function statusEvent(kind: ForensicsStatusKind, text: string): ForensicsTraceEvent {
  return {
    type: "status",
    payload: {
      kind,
      text
    }
  };
}

function drainAgentHookReceiptEvents(receipts: AgentHookAuditReceipt[]): ForensicsTraceEvent[] {
  return receipts.splice(0).map((receipt) =>
    statusEvent("agent-boundary", `Agent hook audit receipt recorded: ${receipt.hook} ${receipt.agentName}.`)
  );
}

function dedupeRecordIds(recordIds: readonly string[]): string[] {
  return [...new Set(recordIds.filter((recordId) => recordId.trim().length > 0))];
}

function humanizeRunItemEventName(name: string): string {
  return name.replaceAll("_", " ");
}

function readAgentName(agent: unknown): string {
  return isRecord(agent) && typeof agent.name === "string" && agent.name.length > 0 ? agent.name : "unknown";
}

function readTokenUsageSnapshot(event: unknown): OpenAiTokenUsageSnapshot | undefined {
  if (!isRecord(event)) {
    return undefined;
  }

  const candidates = [
    event.usage,
    isRecord(event.data) ? event.data.usage : undefined,
    isRecord(event.data) && isRecord(event.data.response) ? event.data.response.usage : undefined,
    isRecord(event.response) ? event.response.usage : undefined
  ];

  for (const candidate of candidates) {
    const snapshot = readTokenUsage(candidate);
    if (snapshot !== undefined) {
      return snapshot;
    }
  }

  return undefined;
}

function readTokenUsage(value: unknown): OpenAiTokenUsageSnapshot | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const totalTokens = readNonNegativeInteger(value.total_tokens ?? value.totalTokens);
  if (totalTokens !== undefined) {
    return {
      totalTokens,
      ...readOptionalTokenUsageDetails(value)
    };
  }

  const inputTokens = readNonNegativeInteger(value.input_tokens ?? value.inputTokens);
  const outputTokens = readNonNegativeInteger(value.output_tokens ?? value.outputTokens);
  if (inputTokens !== undefined && outputTokens !== undefined) {
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      ...readOptionalTokenUsageDetails(value)
    };
  }

  return undefined;
}

function readOptionalTokenUsageDetails(value: Record<string, unknown>): Omit<OpenAiTokenUsageSnapshot, "totalTokens"> {
  const inputTokens = readNonNegativeInteger(value.input_tokens ?? value.inputTokens);
  const outputTokens = readNonNegativeInteger(value.output_tokens ?? value.outputTokens);
  const inputTokenDetails = value.input_tokens_details ?? value.inputTokensDetails;
  const cachedTokens = isRecord(inputTokenDetails)
    ? readNonNegativeInteger(inputTokenDetails.cached_tokens ?? inputTokenDetails.cachedTokens)
    : undefined;

  return {
    ...(cachedTokens === undefined ? {} : { cachedTokens }),
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens })
  };
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = dedupeRecordIds(value.filter((entry): entry is string => typeof entry === "string"));
  return values.length === 0 ? undefined : values;
}

function collectSapEvidenceRecordIds(value: unknown): string[] {
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

  return dedupeRecordIds(recordIds);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}
