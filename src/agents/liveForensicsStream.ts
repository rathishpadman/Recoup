import type { RuntimeEnv } from "../../config/env.js";
import {
  registerRunHookAuditReceipts,
  type AgentHookAuditReceipt
} from "../services/conductor.js";
import { forensicsInvestigatorAgent } from "./agentRuntime.js";
import type { ForensicsTraceEvent } from "./forensics.js";
import { OpenAIProvider, Runner, type RunStreamEvent } from "./openAiAgentsSdk.js";

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
    agent: typeof forensicsInvestigatorAgent,
    input: string,
    options: { maxTurns: number; signal?: AbortSignal; stream: true }
  ): Promise<AsyncIterable<RunStreamEvent>>;
}

export interface StreamLiveForensicsTraceOptions {
  agentHookRecordIds?: string[];
  env?: RuntimeEnv;
  input?: string;
  maxTurns?: number;
  onRetry?: () => void;
  onTokenUsage?: (tokens: number) => void;
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
}

type ForensicsStatusKind = Extract<ForensicsTraceEvent, { type: "status" }>["payload"]["kind"];

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
  const sourceRunner = options.runner ?? runOpenAIForensicsAgentStream;
  const runner: LiveForensicsStreamRunner = async (request) => {
    if (request.agentHookAudit === undefined) {
      return sourceRunner(request);
    }

    const agentHookAudit = request.agentHookAudit;
    const capturedRequest: LiveForensicsStreamRequest = {
      apiKey: request.apiKey,
      input: request.input,
      maxTurns: request.maxTurns,
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

  return {
    events,
    hookReceipts,
    status,
    tokenUsage
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
      const request: LiveForensicsStreamRequest = {
        apiKey,
        input: options.input ?? liveAgentInput,
        maxTurns: options.maxTurns
      };
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

      const stream = await (options.runner ?? runOpenAIForensicsAgentStream)(request);
      for (const receiptEvent of drainAgentHookReceiptEvents(agentHookReceipts)) {
        yield receiptEvent;
      }
      for await (const event of stream) {
        for (const receiptEvent of drainAgentHookReceiptEvents(agentHookReceipts)) {
          yield receiptEvent;
        }
        const tokenTotal = readCumulativeTokenUsage(event);
        if (tokenTotal !== undefined && tokenTotal > recordedTokenTotal) {
          options.onTokenUsage?.(tokenTotal - recordedTokenTotal);
          recordedTokenTotal = tokenTotal;
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
  runner: LiveForensicsOpenAiRunner = createOpenAiForensicsRunner(request.apiKey)
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

  return runner.run(forensicsInvestigatorAgent, request.input, runOptions);
}

function createOpenAiForensicsRunner(apiKey: string): LiveForensicsOpenAiRunner {
  return new Runner({
    modelProvider: new OpenAIProvider({ apiKey }),
    traceIncludeSensitiveData: false,
    tracingDisabled: true,
    workflowName: "recoup-forensics-live-stream"
  });
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

function readCumulativeTokenUsage(event: unknown): number | undefined {
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
    const tokens = readTokenCount(candidate);
    if (tokens !== undefined) {
      return tokens;
    }
  }

  return undefined;
}

function readTokenCount(value: unknown): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const totalTokens = readNonNegativeInteger(value.total_tokens ?? value.totalTokens);
  if (totalTokens !== undefined) {
    return totalTokens;
  }

  const inputTokens = readNonNegativeInteger(value.input_tokens ?? value.inputTokens);
  const outputTokens = readNonNegativeInteger(value.output_tokens ?? value.outputTokens);
  if (inputTokens !== undefined && outputTokens !== undefined) {
    return inputTokens + outputTokens;
  }

  return undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
