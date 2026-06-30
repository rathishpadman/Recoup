import {
  openAiPromptCacheConfig,
  type OpenAiPromptCacheCapability
} from "../../config/openaiPromptCache.js";
import type { OpenAiTokenUsageSnapshot } from "../agents/liveForensicsStream.js";

export const openAiUsageReceiptType = "openai_agent_usage" as const;
export const openAiUsageCostStatus = "pricing_not_configured_not_computed" as const;
export const openAiUsageCostBasis = "No owner-approved pricing config is configured; dollar cost is not computed." as const;

export interface BuildOpenAiUsageReceiptInput {
  agentName: string;
  capability: OpenAiPromptCacheCapability;
  correlationId: string;
  deterministicBasis: string;
  modelExecutionMode: string;
  rawModelTextPolicy: string;
  recordIds: string[];
  usage: OpenAiTokenUsageSnapshot;
}

export function buildOpenAiUsageReceiptPayload(input: BuildOpenAiUsageReceiptInput) {
  const cacheConfig = openAiPromptCacheConfig[input.capability];

  return {
    agentName: input.agentName,
    ...(input.usage.cachedTokens === undefined ? {} : { cachedTokens: input.usage.cachedTokens }),
    capability: input.capability,
    correlationId: input.correlationId,
    costDeterministicBasis: openAiUsageCostBasis,
    costStatus: openAiUsageCostStatus,
    deterministicBasis: input.deterministicBasis,
    ...(input.usage.inputTokens === undefined ? {} : { inputTokens: input.usage.inputTokens }),
    modelExecutionMode: input.modelExecutionMode,
    ...(input.usage.outputTokens === undefined ? {} : { outputTokens: input.usage.outputTokens }),
    promptCacheKey: cacheConfig.promptCacheKey,
    promptPrefixVersion: cacheConfig.promptPrefixVersion,
    rawModelTextPolicy: input.rawModelTextPolicy,
    recordIds: input.recordIds,
    receiptType: openAiUsageReceiptType,
    tokenCount: input.usage.totalTokens,
    totalTokens: input.usage.totalTokens
  };
}
