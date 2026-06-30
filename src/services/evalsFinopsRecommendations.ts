import { Decimal } from "decimal.js";
import type { AgentUsageRun, EvalFinopsCockpitModel, ModelPricing } from "./evalsFinopsTypes.js";

export interface BuildEvalsFinopsRecommendationsInput {
  contextPruningSignals?: ContextPruningSignal[];
  evalGates: EvalFinopsCockpitModel["evalGates"];
  hasTrustedCostBucket?: boolean;
  labelManifestBlocked?: boolean;
  modelRoutingSignals?: ModelRoutingSignal[];
  outputBudgetSignals?: OutputBudgetSignal[];
  pricingRows: ModelPricing[];
  promptCache?: {
    cachedInputTokens: number;
    savingsStatus: "computed_from_owner_pricing" | "pricing_not_configured_not_computed" | "no_cached_tokens_observed";
    status: string;
  };
  requestReductionSignals?: RequestReductionSignal[];
  tokenBudgetSignals?: TokenBudgetSignal[];
  toolSchemaSignals?: ToolSchemaSignal[];
  unitEconomicsSignals?: UnitEconomicsSignal[];
  usageRuns: AgentUsageRun[];
}

type Recommendation = EvalFinopsCockpitModel["recommendations"][number];

interface TokenBudgetSignal {
  agentName: string;
  budgetTokens: number;
  deterministicBasis: string;
  recordIds: string[];
  usedTokens: number;
  workflowName: string;
}

interface RequestReductionSignal {
  deterministicBasis: string;
  recordIds: string[];
  signalId: string;
}

interface OutputBudgetSignal {
  agentName: string;
  deterministicBasis: string;
  recordIds: string[];
  workflowName: string;
}

interface ContextPruningSignal {
  agentName: string;
  deterministicBasis: string;
  recordIds: string[];
  workflowName: string;
}

interface ModelRoutingSignal {
  deterministicBasis: string;
  fromModelId: string;
  recordIds: string[];
  toModelId: string;
  workflowName: string;
}

interface ToolSchemaSignal {
  deterministicBasis: string;
  recordIds: string[];
  toolName: string;
}

interface UnitEconomicsSignal {
  deterministicBasis: string;
  recordIds: string[];
  workflowName: string;
}

export function buildEvalsFinopsRecommendations(input: BuildEvalsFinopsRecommendationsInput): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const activePricingModelIds = new Set(input.pricingRows.filter((pricing) => pricing.active).map((pricing) => pricing.modelId));

  for (const gate of input.evalGates.filter((candidate) => candidate.status === "fail")) {
    recommendations.push({
      recommendationId: `quality-gate-failed:${gate.gate}`,
      severity: "critical",
      title: `Inspect failing ${gate.gate} gate`,
      recommendedAction: "Block release promotion and inspect failing case IDs and gate output.",
      requiresHumanApproval: false,
      deterministicBasis: "quality-gate-failed",
      recordIds: unique(gate.recordIds)
    });
  }

  if (input.labelManifestBlocked === true) {
    recommendations.push({
      recommendationId: "eval-labels-missing",
      severity: "critical",
      title: "Provide owner-approved eval labels",
      recommendedAction: "Request the release eval label manifest and complete expert labels; do not synthesize labels.",
      requiresHumanApproval: true,
      deterministicBasis: "eval-labels-missing",
      recordIds: ["release_eval_label_manifest"]
    });
  }

  if (input.hasTrustedCostBucket !== true) {
    if (activePricingModelIds.size === 0) {
      recommendations.push({
        recommendationId: "pricing-missing",
        severity: "critical",
        title: "Configure owner-approved model pricing",
        recommendedAction: "Add active recoup_model_pricing rows before showing dollar cost or unit economics.",
        requiresHumanApproval: true,
        deterministicBasis: "pricing-missing",
        recordIds: input.usageRuns.length === 0 ? ["recoup_model_pricing"] : unique(input.usageRuns.flatMap((run) => run.recordIds))
      });
    }

    for (const modelId of unique(input.usageRuns.map((run) => run.modelId).filter((modelId) => !activePricingModelIds.has(modelId)))) {
      recommendations.push({
        recommendationId: `pricing-missing:${modelId}`,
        severity: "critical",
        title: `Configure pricing for ${modelId}`,
        recommendedAction: `Add an active recoup_model_pricing row for observed model ${modelId} before showing complete dollar cost.`,
        requiresHumanApproval: true,
        deterministicBasis: "pricing-missing-for-observed-model",
        recordIds: unique(input.usageRuns.filter((run) => run.modelId === modelId).flatMap((run) => run.recordIds))
      });
    }
  }

  for (const group of groupUsageRuns(input.usageRuns)) {
    const recordIds = unique(group.runs.flatMap((run) => run.recordIds));
    const guardrailTrips = sum(group.runs.map((run) => run.guardrailTripCount));
    if (guardrailTrips > 0) {
      recommendations.push({
        recommendationId: `guardrail-regression:${group.agentName}:${group.workflowName}`,
        severity: "important",
        title: `Review guardrail trips for ${group.agentName}`,
        recommendedAction: "Investigate cited guardrail trips before making cost or model-routing changes.",
        requiresHumanApproval: false,
        deterministicBasis: "guardrail-regression",
        recordIds
      });
    }

    const inputTokens = sum(group.runs.map((run) => run.inputTokens));
    const cachedInputTokens = sum(group.runs.map((run) => run.cachedInputTokens));
    const hasStablePromptPrefix = group.runs.some(
      (run) => run.promptCacheKey !== undefined && run.promptPrefixVersion !== undefined
    );
    if (hasStablePromptPrefix && inputTokens > 0 && new Decimal(cachedInputTokens).div(inputTokens).lessThan(0.1)) {
      recommendations.push({
        recommendationId: `cache-opportunity:${group.agentName}:${group.workflowName}`,
        severity: "advisory",
        title: `Evaluate prompt-cache reuse for ${group.agentName}`,
        recommendedAction: "Review prompt-prefix ordering and cache-key versioning with eval proof before changing runtime prompts.",
        requiresHumanApproval: true,
        deterministicBasis: "cache-opportunity",
        recordIds
      });
    }
  }

  if (
    input.promptCache !== undefined &&
    input.promptCache.cachedInputTokens > 0 &&
    input.promptCache.savingsStatus === "pricing_not_configured_not_computed"
  ) {
    recommendations.push({
      recommendationId: "cache-savings-pricing-blocked",
      severity: "important",
      title: "Price prompt-cache savings after pricing approval",
      recommendedAction: "Cached tokens are present; compute avoided input cost only after owner-approved pricing exists.",
      requiresHumanApproval: true,
      deterministicBasis: "cache-savings-visible-without-pricing",
      recordIds: unique(input.usageRuns.flatMap((run) => run.recordIds))
    });
  }

  if (
    input.promptCache !== undefined &&
    input.promptCache.cachedInputTokens > 0 &&
    input.promptCache.savingsStatus === "computed_from_owner_pricing"
  ) {
    recommendations.push({
      recommendationId: "cache-savings-visible",
      severity: "advisory",
      title: "Review prompt-cache savings proof",
      recommendedAction: "Keep cached-token savings read-only and tied to observed cached input tokens plus owner-approved pricing.",
      requiresHumanApproval: false,
      deterministicBasis: "cache-savings-visible",
      recordIds: unique(input.usageRuns.flatMap((run) => run.recordIds))
    });
  }

  for (const workflowName of unique(
    input.usageRuns
      .map((run) => run.workflowName)
      .filter((workflowName) => /eval|release|backfill|enrichment/iu.test(workflowName))
  )) {
    recommendations.push({
      recommendationId: `batch-eval-candidate:${workflowName}`,
      severity: "advisory",
      title: `Review async processing for ${workflowName}`,
      recommendedAction: "Evaluate batch or lower-priority processing only for non-interactive eval, release, or backfill work.",
      requiresHumanApproval: true,
      deterministicBasis: "batch-eval-candidate",
      recordIds: unique(input.usageRuns.filter((run) => run.workflowName === workflowName).flatMap((run) => run.recordIds))
    });
  }

  for (const signal of input.tokenBudgetSignals ?? []) {
    if (signal.budgetTokens > 0 && new Decimal(signal.usedTokens).div(signal.budgetTokens).greaterThanOrEqualTo(0.8)) {
      recommendations.push({
        recommendationId: `budget-near-limit:${signal.agentName}:${signal.workflowName}`,
        severity: "important",
        title: `Inspect token budget for ${signal.agentName}`,
        recommendedAction: "Inspect context packing and repeated prompt prefixes before changing runtime budgets.",
        requiresHumanApproval: true,
        deterministicBasis: "budget-near-limit",
        recordIds: unique(signal.recordIds)
      });
    }
  }

  for (const signal of input.requestReductionSignals ?? []) {
    recommendations.push({
      recommendationId: `request-reduction-opportunity:${signal.signalId}`,
      severity: "advisory",
      title: "Evaluate deterministic request reuse",
      recommendedAction: "Move repeated answer/source preparation into deterministic read-model reuse only when record IDs and freshness match.",
      requiresHumanApproval: true,
      deterministicBasis: "request-reduction-opportunity",
      recordIds: unique(signal.recordIds)
    });
  }

  for (const signal of input.outputBudgetSignals ?? []) {
    recommendations.push({
      recommendationId: `output-budget-opportunity:${signal.agentName}:${signal.workflowName}`,
      severity: "advisory",
      title: `Review output budget for ${signal.agentName}`,
      recommendedAction: "Tune output or reasoning caps only when eval gates and citation completeness remain green.",
      requiresHumanApproval: true,
      deterministicBasis: "output-budget-opportunity",
      recordIds: unique(signal.recordIds)
    });
  }

  for (const signal of input.contextPruningSignals ?? []) {
    recommendations.push({
      recommendationId: `context-pruning-opportunity:${signal.agentName}:${signal.workflowName}`,
      severity: "advisory",
      title: `Review evidence context for ${signal.agentName}`,
      recommendedAction: "Narrow evidence excerpts and source payloads without removing required citations or deterministic basis.",
      requiresHumanApproval: true,
      deterministicBasis: "context-pruning-opportunity",
      recordIds: unique(signal.recordIds)
    });
  }

  for (const signal of input.modelRoutingSignals ?? []) {
    recommendations.push({
      recommendationId: `model-routing-opportunity:${signal.workflowName}:${signal.fromModelId}-to-${signal.toModelId}`,
      severity: "advisory",
      title: `Review model route for ${signal.workflowName}`,
      recommendedAction: "Propose model-tier routing only with before/after eval proof and owner approval.",
      requiresHumanApproval: true,
      deterministicBasis: "model-routing-opportunity",
      recordIds: unique(signal.recordIds)
    });
  }

  for (const signal of input.toolSchemaSignals ?? []) {
    recommendations.push({
      recommendationId: `tool-schema-opportunity:${signal.toolName}`,
      severity: "advisory",
      title: `Review tool schema for ${signal.toolName}`,
      recommendedAction: "Reduce unused tool schema surface while preserving required Zod guardrails and evidence fields.",
      requiresHumanApproval: true,
      deterministicBasis: "tool-schema-opportunity",
      recordIds: unique(signal.recordIds)
    });
  }

  for (const signal of input.unitEconomicsSignals ?? []) {
    recommendations.push({
      recommendationId: `unit-economics-regression:${signal.workflowName}`,
      severity: "important",
      title: `Review unit economics for ${signal.workflowName}`,
      recommendedAction: "Review agent and tool path before downgrading model when cost per approved draft rises and approval rate falls.",
      requiresHumanApproval: false,
      deterministicBasis: "unit-economics-regression",
      recordIds: unique(signal.recordIds)
    });
  }

  return recommendations.filter((recommendation) => recommendation.recordIds.length > 0);
}

function groupUsageRuns(usageRuns: AgentUsageRun[]): Array<{ agentName: string; runs: AgentUsageRun[]; workflowName: string }> {
  const groups = new Map<string, { agentName: string; runs: AgentUsageRun[]; workflowName: string }>();
  for (const run of usageRuns) {
    const key = [run.agentName, run.workflowName].join("\u0000");
    const group = groups.get(key) ?? { agentName: run.agentName, runs: [], workflowName: run.workflowName };
    group.runs.push(run);
    groups.set(key, group);
  }

  return [...groups.values()];
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}
