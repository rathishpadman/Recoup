import { runtimeModelSettings, runtimeModels } from "../../config/models.js";
import { Agent, type MCPServer } from "./openAiAgentsSdk.js";
import { assembleRecoupPrompt } from "./promptAssembly.js";
import { loadAgentPrompt, type AgentPromptFileName } from "./prompts.js";

const promptFiles = {
  forensicsInvestigator: "forensics-investigator.md",
  recoveryDrafter: "recovery-drafter.md",
  riskMeshSupervisor: "risk-mesh-supervisor.md",
  sentinel: "sentinel.md",
  containmentIntent: "containment-intent.md",
  conversationalQuery: "conversational-query.md"
} as const satisfies Record<string, AgentPromptFileName>;

export interface AgentMcpServerOptions {
  mcpServers?: MCPServer[];
}

export function createRecoveryDrafterAgent(options: AgentMcpServerOptions = {}) {
  return new Agent({
    name: "Recovery Drafter",
    model: runtimeModels.fast,
    modelSettings: runtimeModelSettings.recoveryDrafter,
    instructions: assembleRecoupPrompt({
      agentPrompt: loadAgentPrompt(promptFiles.recoveryDrafter),
      capability: "deduction_forensics"
    }).prompt,
    ...(options.mcpServers === undefined ? {} : { mcpServers: options.mcpServers })
  });
}

export function createForensicsInvestigatorAgent(options: AgentMcpServerOptions = {}) {
  const recoveryAgent = createRecoveryDrafterAgent(options);

  return new Agent({
    name: "Forensics Investigator",
    model: runtimeModels.reasoning,
    modelSettings: runtimeModelSettings.forensicsInvestigator,
    instructions: assembleRecoupPrompt({
      agentPrompt: loadAgentPrompt(promptFiles.forensicsInvestigator),
      capability: "deduction_forensics"
    }).prompt,
    handoffs: [recoveryAgent],
    ...(options.mcpServers === undefined ? {} : { mcpServers: options.mcpServers })
  });
}

export const recoveryDrafterAgent = createRecoveryDrafterAgent();

export const forensicsInvestigatorAgent = createForensicsInvestigatorAgent();

export const sentinelAgent = new Agent({
  name: "Sentinel",
  model: runtimeModels.fast,
  modelSettings: runtimeModelSettings.sentinel,
  instructions: assembleRecoupPrompt({
    agentPrompt: loadAgentPrompt(promptFiles.sentinel),
    capability: "credit_risk"
  }).prompt
});

export const containmentIntentAgent = new Agent({
  name: "Containment / Intent",
  model: runtimeModels.fast,
  modelSettings: runtimeModelSettings.containmentIntent,
  instructions: assembleRecoupPrompt({
    agentPrompt: loadAgentPrompt(promptFiles.containmentIntent),
    capability: "containment"
  }).prompt
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
  modelSettings: runtimeModelSettings.riskMeshSupervisor,
  instructions: assembleRecoupPrompt({
    agentPrompt: loadAgentPrompt(promptFiles.riskMeshSupervisor),
    capability: "risk_mesh"
  }).prompt,
  tools: riskMeshAgentTools
});

export const conversationalQueryAgent = new Agent({
  name: "Conversational Query",
  model: runtimeModels.realtime,
  modelSettings: runtimeModelSettings.conversationalQuery,
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
