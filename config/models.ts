import type { ModelSettings } from "../src/agents/openAiAgentsSdk.js";
import { openAiPromptCacheProviderData } from "./openaiPromptCache.ts";

export const runtimeOpenAiServiceTier = "default" as const;

export const runtimeModels = {
  reasoning: "gpt-5.4",
  fast: "gpt-5.4",
  fastMini: "gpt-5.4-mini",
  fastNano: "gpt-5.4-nano",
  realtime: "gpt-realtime-2",
  transcription: "gpt-4o-mini-transcribe"
} as const;

export type RuntimeModelKey = keyof typeof runtimeModels;

export const runtimeModelSettings = {
  forensicsInvestigator: {
    providerData: openAiPromptCacheProviderData("deduction_forensics", runtimeOpenAiServiceTier),
    reasoning: { effort: "high" },
    text: { verbosity: "low" }
  },
  riskMeshSupervisor: {
    providerData: openAiPromptCacheProviderData("risk_mesh", runtimeOpenAiServiceTier),
    reasoning: { effort: "low" },
    text: { verbosity: "low" }
  },
  recoveryDrafter: {
    providerData: openAiPromptCacheProviderData("deduction_forensics", runtimeOpenAiServiceTier),
    reasoning: { effort: "low" },
    text: { verbosity: "low" }
  },
  actionPacketDrafter: {
    providerData: openAiPromptCacheProviderData("credit_risk", runtimeOpenAiServiceTier),
    reasoning: { effort: "low" },
    text: { verbosity: "low" }
  },
  sentinel: {
    providerData: openAiPromptCacheProviderData("credit_risk", runtimeOpenAiServiceTier),
    reasoning: { effort: "low" },
    text: { verbosity: "low" }
  },
  containmentIntent: {
    providerData: openAiPromptCacheProviderData("containment", runtimeOpenAiServiceTier),
    reasoning: { effort: "low" },
    text: { verbosity: "low" }
  },
  conversationalQuery: {}
} satisfies Record<string, ModelSettings>;

export type RuntimeModelSettingsKey = keyof typeof runtimeModelSettings;
