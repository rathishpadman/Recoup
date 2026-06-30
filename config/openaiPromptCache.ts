export const openAiPromptCacheCapabilities = [
  "deduction_forensics",
  "credit_risk",
  "risk_mesh",
  "containment"
] as const;

export type OpenAiPromptCacheCapability = (typeof openAiPromptCacheCapabilities)[number];

export const openAiPromptCacheConfig = {
  deduction_forensics: {
    promptCacheKey: "recoup:v2:deduction-forensics:v1",
    promptPrefixVersion: "v1"
  },
  credit_risk: {
    promptCacheKey: "recoup:v2:credit-risk:v1",
    promptPrefixVersion: "v1"
  },
  risk_mesh: {
    promptCacheKey: "recoup:v2:risk-mesh:v1",
    promptPrefixVersion: "v1"
  },
  containment: {
    promptCacheKey: "recoup:v2:containment:v1",
    promptPrefixVersion: "v1"
  }
} as const satisfies Record<
  OpenAiPromptCacheCapability,
  {
    promptCacheKey: string;
    promptPrefixVersion: string;
  }
>;

export function openAiPromptCacheProviderData(capability: OpenAiPromptCacheCapability): { prompt_cache_key: string } {
  return {
    prompt_cache_key: openAiPromptCacheConfig[capability].promptCacheKey
  };
}
