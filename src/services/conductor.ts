import { z } from "zod";
import { RunControlConfigSchema, type RunControlConfig } from "../../config/releaseOwnerInputs.js";
export { RunControlConfigSchema, type RunControlConfig } from "../../config/releaseOwnerInputs.js";

export interface BlockedRunControlStatus {
  status: "blocked";
  reason: "appendix-g-run-control-unset";
  openDependencies: ["run-control-token-budget", "run-control-step-budget", "run-control-retry-cap"];
}

export interface PassingRunControlStatus {
  status: "pass";
  approvedBy: string;
  retryCapPhaseCount: number;
  stepBudgetPhaseCount: number;
  tokenBudgetPhaseCount: number;
}

export type RunControlStatus = BlockedRunControlStatus | PassingRunControlStatus;
export type RunControlPhase = keyof RunControlConfig["phases"];

export interface RunBudgetUsage {
  retryCount: number;
  stepCount: number;
  tokenCount: number;
}

export type RunBudgetUsageSnapshot = Record<RunControlPhase, RunBudgetUsage>;

export interface RunBudgetController {
  recordRetry(input: { phase: RunControlPhase }): void;
  recordStep(input: { count?: number; phase: RunControlPhase }): void;
  recordTokenUsage(input: { phase: RunControlPhase; tokens: number }): void;
  snapshot(): RunBudgetUsageSnapshot;
}

export interface ToolFailureInput {
  phase: string;
  toolName: string;
  error: unknown;
}

export interface ErrorEvent {
  eventType: "ErrorEvent";
  phase: string;
  toolName: string;
  message: string;
  recoverable: true;
}

export const supportedAgentHookEvents = [
  "agent_start",
  "agent_end",
  "agent_handoff",
  "agent_tool_start",
  "agent_tool_end"
] as const;
export const liveSdkAgentHookDeterministicBasis = "OpenAI Agents SDK RunHooks lifecycle event" as const;
export const deterministicForensicsHookAuditBasis = "Recoup deterministic forensics hook audit event" as const;

const AgentHookAuditReceiptSchema = z.object({
  eventType: z.literal("AgentHookAuditReceipt"),
  hook: z.enum(supportedAgentHookEvents),
  agentName: z.string().min(1),
  nextAgentName: z.string().min(1).optional(),
  toolName: z.string().min(1).optional(),
  toolInputRecordIds: z.array(z.string().min(1)).min(1).optional(),
  toolInputSelectedLineId: z.string().min(1).optional(),
  toolOutputCanonicalModel: z.string().min(1).optional(),
  toolOutputPrimarySourceLabel: z.string().min(1).optional(),
  toolOutputPrimarySourceSystem: z.string().min(1).optional(),
  toolOutputSapEvidenceRecordIds: z.array(z.string().min(1)).min(1).optional(),
  toolOutputSelectedEvidenceRecordIds: z.array(z.string().min(1)).min(1).optional(),
  toolOutputSelectedLineId: z.string().min(1).optional(),
  toolOutputSelectedRecordIds: z.array(z.string().min(1)).min(1).optional(),
  toolOutputSourceFreshness: z.string().min(1).optional(),
  toolOutputSourceReadStatus: z.string().min(1).optional(),
  toolOutputTransportLabel: z.string().min(1).optional(),
  toolOutputTransportLayer: z.string().min(1).optional(),
  recordIds: z.array(z.string().min(1)).min(1),
  deterministicBasis: z.enum([liveSdkAgentHookDeterministicBasis, deterministicForensicsHookAuditBasis])
});

export type AgentHookAuditReceipt = z.infer<typeof AgentHookAuditReceiptSchema>;

export interface AgentHookAuditReceiptInput {
  agentName: string;
  deterministicBasis?: AgentHookAuditReceipt["deterministicBasis"];
  hook: (typeof supportedAgentHookEvents)[number];
  nextAgentName?: string;
  recordIds: string[];
  toolName?: string;
  toolInputRecordIds?: string[];
  toolInputSelectedLineId?: string;
  toolOutputCanonicalModel?: string;
  toolOutputPrimarySourceLabel?: string;
  toolOutputPrimarySourceSystem?: string;
  toolOutputSapEvidenceRecordIds?: string[];
  toolOutputSelectedEvidenceRecordIds?: string[];
  toolOutputSelectedLineId?: string;
  toolOutputSelectedRecordIds?: string[];
  toolOutputSourceFreshness?: string;
  toolOutputSourceReadStatus?: string;
  toolOutputTransportLabel?: string;
  toolOutputTransportLayer?: string;
}

export interface AgentHookReceiptRegistrationOptions {
  recordIds: string[];
}

type SdkToolInputProof = Pick<AgentHookAuditReceiptInput, "toolInputRecordIds" | "toolInputSelectedLineId">;
type SdkToolOutputProof = Pick<
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
>;

interface RunHookEmitter {
  on(type: string, listener: (...args: unknown[]) => void): unknown;
}

export function parseRunControlConfig(config: unknown): RunControlConfig {
  return RunControlConfigSchema.parse(config);
}

export function buildRunControlStatus(config?: unknown): RunControlStatus {
  if (config !== undefined) {
    const parsedConfig = parseRunControlConfig(config);
    return {
      status: "pass",
      approvedBy: parsedConfig.approvedBy,
      retryCapPhaseCount: Object.keys(parsedConfig.phases).length,
      stepBudgetPhaseCount: Object.keys(parsedConfig.phases).length,
      tokenBudgetPhaseCount: Object.keys(parsedConfig.phases).length
    };
  }

  return {
    status: "blocked",
    reason: "appendix-g-run-control-unset",
    openDependencies: ["run-control-token-budget", "run-control-step-budget", "run-control-retry-cap"]
  };
}

export function createRunBudgetController(config: RunControlConfig): RunBudgetController {
  const parsedConfig = parseRunControlConfig(config);
  const usage = Object.fromEntries(
    Object.keys(parsedConfig.phases).map((phase) => [phase, { retryCount: 0, stepCount: 0, tokenCount: 0 }])
  ) as RunBudgetUsageSnapshot;

  return {
    recordRetry(input) {
      const budget = readPhaseBudget(parsedConfig, input.phase);
      const current = usage[input.phase];
      const nextRetryCount = current.retryCount + 1;
      if (nextRetryCount > budget.retryCap) {
        throw new Error(`Run retry cap exceeded for phase ${input.phase}.`);
      }
      current.retryCount = nextRetryCount;
    },
    recordStep(input) {
      const budget = readPhaseBudget(parsedConfig, input.phase);
      const count = readPositiveInteger(input.count ?? 1, "Run step count");
      const current = usage[input.phase];
      const nextStepCount = current.stepCount + count;
      if (nextStepCount > budget.stepBudget) {
        throw new Error(`Run step budget exceeded for phase ${input.phase}.`);
      }
      current.stepCount = nextStepCount;
    },
    recordTokenUsage(input) {
      const budget = readPhaseBudget(parsedConfig, input.phase);
      const tokens = readPositiveInteger(input.tokens, "Run token usage");
      const current = usage[input.phase];
      const nextTokenCount = current.tokenCount + tokens;
      if (nextTokenCount > budget.tokenBudget) {
        throw new Error(`Run token budget exceeded for phase ${input.phase}.`);
      }
      current.tokenCount = nextTokenCount;
    },
    snapshot() {
      return Object.fromEntries(
        Object.entries(usage).map(([phase, phaseUsage]) => [phase, { ...phaseUsage }])
      ) as RunBudgetUsageSnapshot;
    }
  };
}

export function toErrorEvent(input: ToolFailureInput): ErrorEvent {
  return {
    eventType: "ErrorEvent",
    phase: input.phase,
    toolName: input.toolName,
    message: input.error instanceof Error ? input.error.message : "Unknown tool failure",
    recoverable: true
  };
}

export function createAgentHookAuditReceipt(input: AgentHookAuditReceiptInput): AgentHookAuditReceipt {
  if (input.recordIds.length === 0) {
    throw new Error("Agent hook audit receipt requires cited recordIds.");
  }

  const receipt = {
    eventType: "AgentHookAuditReceipt",
    hook: input.hook,
    agentName: input.agentName,
    ...(input.nextAgentName === undefined ? {} : { nextAgentName: input.nextAgentName }),
    ...(input.toolName === undefined ? {} : { toolName: input.toolName }),
    ...(input.toolInputRecordIds === undefined ? {} : { toolInputRecordIds: [...input.toolInputRecordIds] }),
    ...(input.toolInputSelectedLineId === undefined ? {} : { toolInputSelectedLineId: input.toolInputSelectedLineId }),
    ...(input.toolOutputCanonicalModel === undefined ? {} : { toolOutputCanonicalModel: input.toolOutputCanonicalModel }),
    ...(input.toolOutputPrimarySourceLabel === undefined
      ? {}
      : { toolOutputPrimarySourceLabel: input.toolOutputPrimarySourceLabel }),
    ...(input.toolOutputPrimarySourceSystem === undefined
      ? {}
      : { toolOutputPrimarySourceSystem: input.toolOutputPrimarySourceSystem }),
    ...(input.toolOutputSapEvidenceRecordIds === undefined
      ? {}
      : { toolOutputSapEvidenceRecordIds: [...input.toolOutputSapEvidenceRecordIds] }),
    ...(input.toolOutputSelectedEvidenceRecordIds === undefined
      ? {}
      : { toolOutputSelectedEvidenceRecordIds: [...input.toolOutputSelectedEvidenceRecordIds] }),
    ...(input.toolOutputSelectedLineId === undefined ? {} : { toolOutputSelectedLineId: input.toolOutputSelectedLineId }),
    ...(input.toolOutputSelectedRecordIds === undefined
      ? {}
      : { toolOutputSelectedRecordIds: [...input.toolOutputSelectedRecordIds] }),
    ...(input.toolOutputSourceFreshness === undefined ? {} : { toolOutputSourceFreshness: input.toolOutputSourceFreshness }),
    ...(input.toolOutputSourceReadStatus === undefined ? {} : { toolOutputSourceReadStatus: input.toolOutputSourceReadStatus }),
    ...(input.toolOutputTransportLabel === undefined ? {} : { toolOutputTransportLabel: input.toolOutputTransportLabel }),
    ...(input.toolOutputTransportLayer === undefined ? {} : { toolOutputTransportLayer: input.toolOutputTransportLayer }),
    recordIds: [...input.recordIds],
    deterministicBasis: input.deterministicBasis ?? liveSdkAgentHookDeterministicBasis
  } as const;

  return AgentHookAuditReceiptSchema.parse(receipt);
}

export function registerRunHookAuditReceipts(
  hooks: RunHookEmitter,
  onReceipt: (receipt: AgentHookAuditReceipt) => void,
  options: AgentHookReceiptRegistrationOptions
): void {
  hooks.on("agent_start", (_context, agent) => {
    onReceipt(createAgentHookAuditReceipt({ hook: "agent_start", agentName: readName(agent), recordIds: options.recordIds }));
  });
  hooks.on("agent_end", (_context, agent) => {
    onReceipt(createAgentHookAuditReceipt({ hook: "agent_end", agentName: readName(agent), recordIds: options.recordIds }));
  });
  hooks.on("agent_handoff", (_context, fromAgent, toAgent) => {
    onReceipt(
      createAgentHookAuditReceipt({
        hook: "agent_handoff",
        agentName: readName(fromAgent),
        nextAgentName: readName(toAgent),
        recordIds: options.recordIds
      })
    );
  });
  hooks.on("agent_tool_start", (_context, agent, tool, details) => {
    const inputProof = selectedEvidenceToolInputProof(readToolCallStructuredPayload(details));
    onReceipt(
      createAgentHookAuditReceipt({
        hook: "agent_tool_start",
        agentName: readName(agent),
        recordIds: options.recordIds,
        toolName: readName(tool),
        ...(inputProof === undefined ? {} : inputProof)
      })
    );
  });
  hooks.on("agent_tool_end", (_context, agent, tool, result, details) => {
    const inputProof = selectedEvidenceToolInputProof(readToolCallStructuredPayload(details));
    const outputProof = selectedEvidenceToolOutputProof(normalizeStructuredPayload(result));
    onReceipt(
      createAgentHookAuditReceipt({
        hook: "agent_tool_end",
        agentName: readName(agent),
        recordIds: options.recordIds,
        toolName: readName(tool),
        ...(inputProof === undefined ? {} : inputProof),
        ...(outputProof === undefined ? {} : outputProof)
      })
    );
  });
}

function readName(value: unknown): string {
  return typeof value === "object" && value !== null && "name" in value && typeof value.name === "string"
    ? value.name
    : "unknown";
}

function readToolCallStructuredPayload(details: unknown): unknown {
  const toolCall = toRecord(toRecord(details)?.toolCall);
  if (toolCall === undefined) {
    return undefined;
  }

  const json = readToJsonRecord(toolCall);
  const records = [toolCall, toRecord(toolCall.rawItem), toRecord(json?.rawItem), json];
  for (const record of records) {
    if (record === undefined) {
      continue;
    }
    const payload = readStructuredPayloadFromRecord(record, ["arguments", "argumentsJson", "arguments_json", "args", "input", "params"]);
    if (payload !== undefined) {
      return payload;
    }
  }

  return undefined;
}

function readStructuredPayloadFromRecord(record: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (!(key in record)) {
      continue;
    }

    const payload = normalizeStructuredPayload(record[key]);
    if (payload !== undefined) {
      return payload;
    }
  }

  return undefined;
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
  const selectedEvidenceRecordIds = collectSelectedEvidenceRecordIds(sourceReads.selectedEvidence);
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
    ...(selectedEvidenceRecordIds.length === 0 ? {} : { toolOutputSelectedEvidenceRecordIds: selectedEvidenceRecordIds }),
    ...(selectedLineId === undefined ? {} : { toolOutputSelectedLineId: selectedLineId }),
    ...(selectedRecordIds === undefined ? {} : { toolOutputSelectedRecordIds: selectedRecordIds }),
    ...(sourceFreshness === undefined ? {} : { toolOutputSourceFreshness: sourceFreshness }),
    ...(sourceReadStatus === undefined ? {} : { toolOutputSourceReadStatus: sourceReadStatus }),
    ...(transportLabel === undefined ? {} : { toolOutputTransportLabel: transportLabel }),
    ...(transportLayer === undefined ? {} : { toolOutputTransportLayer: transportLayer })
  };

  return Object.keys(outputProof).length === 0 ? undefined : outputProof;
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

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = dedupeStrings(value.filter((entry): entry is string => typeof entry === "string"));
  return values.length === 0 ? undefined : values;
}

function collectSapEvidenceRecordIds(value: unknown): string[] {
  return collectEvidenceRecordIds(value);
}

function collectSelectedEvidenceRecordIds(value: unknown): string[] {
  return collectEvidenceRecordIds(value);
}

function collectEvidenceRecordIds(value: unknown): string[] {
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

  return dedupeStrings(recordIds);
}

function dedupeStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function readToJsonRecord(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const toJSON = value?.toJSON;
  if (typeof toJSON !== "function") {
    return undefined;
  }

  try {
    return toRecord(toJSON.call(value));
  } catch {
    return undefined;
  }
}

function readPhaseBudget(config: RunControlConfig, phase: RunControlPhase): RunControlConfig["phases"][RunControlPhase] {
  return config.phases[phase];
}

function readPositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return value;
}
