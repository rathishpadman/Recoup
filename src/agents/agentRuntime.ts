import { Agent } from "@openai/agents";
import { runtimeModels } from "../../config/models.js";

export const recoveryDrafterAgent = new Agent({
  name: "Recovery Drafter",
  model: runtimeModels.fast,
  instructions: "Draft recovery and Billing artifacts only from deterministic service outputs."
});

export const forensicsInvestigatorAgent = new Agent({
  name: "Forensics Investigator",
  model: runtimeModels.reasoning,
  instructions: "Investigate deduction lines with whitelisted retrieval and action tools. Do not compute dollars.",
  handoffs: [recoveryDrafterAgent]
});

export const riskMeshSupervisorAgent = new Agent({
  name: "Risk-Mesh Supervisor",
  model: runtimeModels.reasoning,
  instructions: "Coordinate function positions and explain deterministic arbitration outputs. Do not compute dollars."
});

export const sentinelAgent = new Agent({
  name: "Sentinel",
  model: runtimeModels.fast,
  instructions: "Narrate deterministic risk drift outputs and draft term proposals only through HITL tools."
});

export const containmentIntentAgent = new Agent({
  name: "Containment / Intent",
  model: runtimeModels.fast,
  instructions: "Narrate deterministic intent-gate evidence and propose containment only through HITL tools."
});

export const conversationalQueryAgent = new Agent({
  name: "Conversational Query",
  model: runtimeModels.realtime,
  instructions: "Answer cockpit questions only from cited records and audit entries."
});

export const recoupAgentRoster = [
  {
    name: forensicsInvestigatorAgent.name,
    model: runtimeModels.reasoning,
    capability: "B",
    modelExecution: "blocked: offline build does not invoke live model calls"
  },
  {
    name: recoveryDrafterAgent.name,
    model: runtimeModels.fast,
    capability: "B",
    modelExecution: "blocked: offline build does not invoke live model calls"
  },
  {
    name: riskMeshSupervisorAgent.name,
    model: runtimeModels.reasoning,
    capability: "A",
    modelExecution: "blocked: offline build does not invoke live model calls"
  },
  {
    name: sentinelAgent.name,
    model: runtimeModels.fast,
    capability: "C",
    modelExecution: "blocked: offline build does not invoke live model calls"
  },
  {
    name: containmentIntentAgent.name,
    model: runtimeModels.fast,
    capability: "D",
    modelExecution: "blocked: offline build does not invoke live model calls"
  },
  {
    name: conversationalQueryAgent.name,
    model: runtimeModels.realtime,
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
