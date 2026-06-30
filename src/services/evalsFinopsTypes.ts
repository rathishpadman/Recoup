export type EvalsFinopsStatus = "pass" | "fail" | "blocked";
export type UsageRunStatus = "succeeded" | "blocked" | "failed";
export type EvalGateName =
  | "run-control"
  | "deduction-validity"
  | "intent-precision"
  | "arbitration-agreement"
  | "detection-fp"
  | "decision-fp"
  | "gold-set-parity";

export type CostStatus =
  | "computed_from_owner_pricing"
  | "reconciled_from_provider_cost_api"
  | "pricing_not_configured_not_computed";

export type PromptCacheSavingsStatus =
  | "computed_from_owner_pricing"
  | "pricing_not_configured_not_computed"
  | "no_cached_tokens_observed";

export interface EvalFinopsProvenance {
  deterministicBasis: string;
  recordIds: string[];
}

export interface AgentUsageRun extends EvalFinopsProvenance {
  usageRunId: string;
  correlationId: string;
  workflowName: string;
  agentName: string;
  modelId: string;
  modelExecutionMode: string;
  cacheCapability?: string;
  promptCacheKey?: string;
  promptPrefixVersion?: string;
  status: UsageRunStatus;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  latencyMs?: number;
  handoffCount: number;
  toolCallCount: number;
  guardrailTripCount: number;
  citedRecordIds: string[];
  sourceReceiptId?: string;
  createdAt: string;
}

export interface EvalGateRun extends EvalFinopsProvenance {
  evalRunId: string;
  releaseStatus: EvalsFinopsStatus;
  sourceMode: "live_supabase" | "local_fixture" | "blocked";
  branchName?: string;
  commitSha?: string;
  startedAt: string;
  completedAt: string;
  reportHash: string;
  reportJson: Record<string, unknown>;
}

export interface EvalGateResult extends EvalFinopsProvenance {
  evalGateResultId: string;
  evalRunId: string;
  gate: EvalGateName;
  status: EvalsFinopsStatus;
  score?: string;
  threshold?: string;
  blockerReason?: string;
  openDependencies: string[];
}

export interface ModelPricing {
  pricingId: string;
  modelId: string;
  serviceTier: string;
  inputPer1mTokens: string;
  outputPer1mTokens: string;
  cachedInputPer1mTokens: string;
  reasoningPer1mTokens: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo?: string;
  approvedBy: string;
  pricingHash: string;
  active: boolean;
}

export interface OpenAiCostBucket {
  costBucketId: string;
  bucketStart: string;
  bucketEnd: string;
  projectId?: string;
  modelId?: string;
  lineItem: string;
  amount: string;
  currency: string;
  sourceResponseHash: string;
  importedAt: string;
  provenance: "openai_org_cost_api";
}

export interface FinopsDailyRollup extends EvalFinopsProvenance {
  rollupId: string;
  rollupDate: string;
  workflowName: string;
  agentName: string;
  modelId: string;
  runCount: number;
  succeededCount: number;
  blockedCount: number;
  failedCount: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  computedCostAmount?: string;
  computedCostCurrency?: string;
  costStatus: CostStatus;
  promptCacheHitRate?: string;
  promptCacheSavingsAmount?: string;
  promptCacheSavingsCurrency?: string;
  promptCacheSavingsStatus: PromptCacheSavingsStatus;
  casesProcessedCount: number;
  citedAnswerCount: number;
  approvedDraftCount: number;
  disputedAmount: string;
  unitEconomics: Record<string, unknown>;
  createdAt: string;
}

export type FinopsRecommendationType =
  | "quality_gate"
  | "pricing_config"
  | "token_budget"
  | "prompt_cache"
  | "batch_eval"
  | "guardrail_regression"
  | "model_routing"
  | "source_gap";

export interface FinopsRecommendation {
  recommendationId: string;
  recommendationType: FinopsRecommendationType;
  severity: "critical" | "important" | "advisory";
  status: "open" | "accepted" | "dismissed" | "superseded";
  title: string;
  recommendedAction: string;
  affectedAgentName?: string;
  affectedWorkflowName?: string;
  expectedImpact: Record<string, unknown>;
  evidenceRecordIds: string[];
  deterministicBasis: string;
  requiresHumanApproval: boolean;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface EvalFinopsCockpitModel {
  surface: "evals-finops";
  generatedAtIso: string;
  provenance: {
    sourceKind: "supabase" | "derived_backend";
    sourceName: string;
    deterministicBasis: string;
    recordIds: string[];
  };
  releaseReadiness: {
    status: EvalsFinopsStatus;
    latestEvalRunId?: string;
    blockers: Array<{
      gate: string;
      reason: string;
      score?: string;
      threshold?: string;
      openDependencies: string[];
    }>;
  };
  evalGates: Array<{
    gate: string;
    status: EvalsFinopsStatus;
    scoreLabel: string;
    thresholdLabel: string;
    deterministicBasis: string;
    recordIds: string[];
  }>;
  agentMetrics: Array<{
    agentName: string;
    workflowName: string;
    modelId: string;
    statusLabel: string;
    runCount: number;
    blockedCount: number;
    failedCount: number;
    totalTokens: number;
    averageTokensPerRun: string;
    handoffCount: number;
    toolCallCount: number;
    guardrailTripCount: number;
    citedAnswerRateLabel: string;
    deterministicBasis: string;
    recordIds: string[];
  }>;
  unitEconomics: Array<{
    metric: string;
    valueLabel: string;
    costStatus: CostStatus;
    deterministicBasis: string;
    recordIds: string[];
  }>;
  promptCache: {
    status: "active" | "no_cached_tokens_observed" | "pricing_not_configured_not_computed" | "usage_unavailable";
    cachedInputTokens: number;
    uncachedInputTokens: number;
    cacheHitRateLabel: string;
    savingsLabel: string;
    savingsStatus: PromptCacheSavingsStatus;
    deterministicBasis: string;
    recordIds: string[];
  };
  recommendations: Array<{
    recommendationId: string;
    severity: "critical" | "important" | "advisory";
    title: string;
    recommendedAction: string;
    requiresHumanApproval: boolean;
    deterministicBasis: string;
    recordIds: string[];
  }>;
  blockedInputs: Array<{
    inputId: string;
    reason: string;
    requiredFor: string[];
  }>;
}
