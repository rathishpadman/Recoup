import { Agent } from "@openai/agents";
import { runtimeModels } from "../../config/models.js";
import { loadAgentPrompt, type AgentPromptFileName } from "./prompts.js";

const promptFiles = {
  forensicsInvestigator: "forensics-investigator.md",
  recoveryDrafter: "recovery-drafter.md",
  riskMeshSupervisor: "risk-mesh-supervisor.md",
  sentinel: "sentinel.md",
  containmentIntent: "containment-intent.md",
  conversationalQuery: "conversational-query.md"
} as const satisfies Record<string, AgentPromptFileName>;

export const recoveryDrafterAgent = new Agent({
  name: "Recovery Drafter",
  model: runtimeModels.fast,
  instructions: loadAgentPrompt(promptFiles.recoveryDrafter)
});

export const forensicsInvestigatorAgent = new Agent({
  name: "Forensics Investigator",
  model: runtimeModels.reasoning,
  instructions: loadAgentPrompt(promptFiles.forensicsInvestigator),
  handoffs: [recoveryDrafterAgent]
});

export const sentinelAgent = new Agent({
  name: "Sentinel",
  model: runtimeModels.fast,
  instructions: loadAgentPrompt(promptFiles.sentinel)
});

export const containmentIntentAgent = new Agent({
  name: "Containment / Intent",
  model: runtimeModels.fast,
  instructions: loadAgentPrompt(promptFiles.containmentIntent)
});

export const riskMeshAgentTools = [
  sentinelAgent.asTool({
    toolName: "agent_tool_sentinel_position",
    toolDescription:
      "advisory-only agent-to-agent credit sentinel position. Returns narrative context only; deterministic Recoup services compute scores, amounts, decisions, and actions.",
    needsApproval: false
  }),
  containmentIntentAgent.asTool({
    toolName: "agent_tool_containment_intent_position",
    toolDescription:
      "advisory-only agent-to-agent containment and intent position. Returns narrative context only; deterministic Recoup services compute scores, amounts, decisions, and actions.",
    needsApproval: false
  })
];

export const riskMeshSupervisorAgent = new Agent({
  name: "Risk-Mesh Supervisor",
  model: runtimeModels.reasoning,
  instructions: loadAgentPrompt(promptFiles.riskMeshSupervisor),
  tools: riskMeshAgentTools
});

export const conversationalQueryAgent = new Agent({
  name: "Conversational Query",
  model: runtimeModels.realtime,
  instructions: loadAgentPrompt(promptFiles.conversationalQuery)
});

export const recoupAgentRoster = [
  {
    name: forensicsInvestigatorAgent.name,
    model: runtimeModels.reasoning,
    promptFile: promptFiles.forensicsInvestigator,
    capability: "B",
    modelExecution: "blocked: offline build does not invoke live model calls"
  },
  {
    name: recoveryDrafterAgent.name,
    model: runtimeModels.fast,
    promptFile: promptFiles.recoveryDrafter,
    capability: "B",
    modelExecution: "blocked: offline build does not invoke live model calls"
  },
  {
    name: riskMeshSupervisorAgent.name,
    model: runtimeModels.reasoning,
    promptFile: promptFiles.riskMeshSupervisor,
    capability: "A",
    modelExecution: "blocked: offline build does not invoke live model calls"
  },
  {
    name: sentinelAgent.name,
    model: runtimeModels.fast,
    promptFile: promptFiles.sentinel,
    capability: "C",
    modelExecution: "blocked: offline build does not invoke live model calls"
  },
  {
    name: containmentIntentAgent.name,
    model: runtimeModels.fast,
    promptFile: promptFiles.containmentIntent,
    capability: "D",
    modelExecution: "blocked: offline build does not invoke live model calls"
  },
  {
    name: conversationalQueryAgent.name,
    model: runtimeModels.realtime,
    promptFile: promptFiles.conversationalQuery,
    capability: "all",
    modelExecution: "blocked: offline build does not invoke live model calls"
  }
] as const;

export const s4AgentBoundary = {
  executionMode: "deterministic-local-harness",
  modelExecution: "blocked: offline build does not invoke live model calls",
  forensicsModel: runtimeModels.reasoning,
  recoveryModel: runtimeModels.fast,
  handoff: {
    from: forensicsInvestigatorAgent.name,
    to: recoveryDrafterAgent.name
  }
} as const;
