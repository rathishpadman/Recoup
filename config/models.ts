import type { ModelSettings } from "../src/agents/openAiAgentsSdk.js";

export const runtimeModels = {
  reasoning: "gpt-5.5",
  fast: "gpt-5.4",
  fastMini: "gpt-5.4-mini",
  fastNano: "gpt-5.4-nano",
  realtime: "gpt-realtime-2"
} as const;

export type RuntimeModelKey = keyof typeof runtimeModels;

export const runtimeModelSettings = {
  forensicsInvestigator: { reasoning: { effort: "high" }, text: { verbosity: "low" } },
  riskMeshSupervisor: { reasoning: { effort: "low" }, text: { verbosity: "low" } },
  recoveryDrafter: { reasoning: { effort: "low" }, text: { verbosity: "low" } },
  sentinel: { reasoning: { effort: "low" }, text: { verbosity: "low" } },
  containmentIntent: { reasoning: { effort: "low" }, text: { verbosity: "low" } },
  conversationalQuery: {}
} satisfies Record<string, ModelSettings>;

export type RuntimeModelSettingsKey = keyof typeof runtimeModelSettings;
