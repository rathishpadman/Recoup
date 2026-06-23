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

const AgentHookAuditReceiptSchema = z.object({
  eventType: z.literal("AgentHookAuditReceipt"),
  hook: z.enum(supportedAgentHookEvents),
  agentName: z.string().min(1),
  nextAgentName: z.string().min(1).optional(),
  toolName: z.string().min(1).optional(),
  recordIds: z.array(z.string().min(1)).min(1),
  deterministicBasis: z.literal("OpenAI Agents SDK RunHooks lifecycle event")
});

export type AgentHookAuditReceipt = z.infer<typeof AgentHookAuditReceiptSchema>;

export interface AgentHookAuditReceiptInput {
  agentName: string;
  hook: (typeof supportedAgentHookEvents)[number];
  nextAgentName?: string;
  recordIds: string[];
  toolName?: string;
}

export interface AgentHookReceiptRegistrationOptions {
  recordIds: string[];
}

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
    recordIds: [...input.recordIds],
    deterministicBasis: "OpenAI Agents SDK RunHooks lifecycle event"
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
  hooks.on("agent_tool_start", (_context, agent, tool) => {
    onReceipt(
      createAgentHookAuditReceipt({
        hook: "agent_tool_start",
        agentName: readName(agent),
        recordIds: options.recordIds,
        toolName: readName(tool)
      })
    );
  });
  hooks.on("agent_tool_end", (_context, agent, tool) => {
    onReceipt(
      createAgentHookAuditReceipt({
        hook: "agent_tool_end",
        agentName: readName(agent),
        recordIds: options.recordIds,
        toolName: readName(tool)
      })
    );
  });
}

function readName(value: unknown): string {
  return typeof value === "object" && value !== null && "name" in value && typeof value.name === "string"
    ? value.name
    : "unknown";
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
