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
