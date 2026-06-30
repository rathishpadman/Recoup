import { Decimal } from "decimal.js";
import { sha256CanonicalJson } from "../../config/governed.js";
import type { AgentUsageRun, FinopsDailyRollup, ModelPricing } from "./evalsFinopsTypes.js";

export interface BuildFinopsDailyRollupsInput {
  businessDenominators: FinopsBusinessDenominator[];
  createdAtIso?: string;
  pricingRows: ModelPricing[];
  rollupDate: string;
  usageRuns: AgentUsageRun[];
}

export interface FinopsBusinessDenominator {
  agentName: string;
  approvedDraftCount: number;
  casesProcessedCount: number;
  citedAnswerCount: number;
  deterministicBasis: string;
  disputedAmount: string;
  modelId: string;
  recordIds: string[];
  workflowName: string;
}

interface RollupGroup {
  agentName: string;
  modelId: string;
  runs: AgentUsageRun[];
  workflowName: string;
}

export function buildFinopsDailyRollups(input: BuildFinopsDailyRollupsInput): FinopsDailyRollup[] {
  const pricingByModel = new Map(input.pricingRows.filter((pricing) => pricing.active).map((pricing) => [pricing.modelId, pricing]));

  return groupUsageRuns(input.usageRuns).flatMap((group) => {
    const denominator = findBusinessDenominator(input.businessDenominators, group);
    if (denominator === undefined) {
      return [];
    }

    const pricing = pricingByModel.get(group.modelId);
    const inputTokens = sum(group.runs.map((run) => run.inputTokens));
    const outputTokens = sum(group.runs.map((run) => run.outputTokens));
    const cachedInputTokens = sum(group.runs.map((run) => run.cachedInputTokens));
    const uncachedInputTokens = sum(group.runs.map((run) => run.uncachedInputTokens));
    const reasoningTokens = sum(group.runs.map((run) => run.reasoningTokens));
    const totalTokens = sum(group.runs.map((run) => run.totalTokens));
    const computedCostAmount = pricing === undefined
      ? undefined
      : new Decimal(uncachedInputTokens)
          .mul(pricing.inputPer1mTokens)
          .plus(new Decimal(cachedInputTokens).mul(pricing.cachedInputPer1mTokens))
          .plus(new Decimal(outputTokens).mul(pricing.outputPer1mTokens))
          .plus(new Decimal(reasoningTokens).mul(pricing.reasoningPer1mTokens))
          .div(1_000_000);
    const promptCacheSavingsAmount =
      pricing === undefined || cachedInputTokens === 0
        ? undefined
        : new Decimal(cachedInputTokens)
            .mul(new Decimal(pricing.inputPer1mTokens).minus(pricing.cachedInputPer1mTokens))
            .div(1_000_000);
    const sourceRecordIds = unique([...group.runs.flatMap((run) => run.recordIds), ...denominator.recordIds]);
    if (sourceRecordIds.length === 0) {
      return [];
    }

    return [{
      agentName: group.agentName,
      approvedDraftCount: denominator.approvedDraftCount,
      blockedCount: group.runs.filter((run) => run.status === "blocked").length,
      cachedInputTokens,
      casesProcessedCount: denominator.casesProcessedCount,
      citedAnswerCount: denominator.citedAnswerCount,
      ...(computedCostAmount === undefined ? {} : { computedCostAmount: computedCostAmount.toFixed(4) }),
      ...(pricing === undefined ? {} : { computedCostCurrency: pricing.currency }),
      costStatus: pricing === undefined ? "pricing_not_configured_not_computed" : "computed_from_owner_pricing",
      createdAt: input.createdAtIso ?? new Date().toISOString(),
      deterministicBasis: `Daily rollup groups typed agent usage runs and business denominators by date, workflow, agent, and model. ${denominator.deterministicBasis}`,
      disputedAmount: new Decimal(denominator.disputedAmount).toFixed(2),
      failedCount: group.runs.filter((run) => run.status === "failed").length,
      inputTokens,
      modelId: group.modelId,
      outputTokens,
      ...(inputTokens === 0 ? {} : { promptCacheHitRate: new Decimal(cachedInputTokens).div(inputTokens).toFixed(4) }),
      ...(promptCacheSavingsAmount === undefined ? {} : { promptCacheSavingsAmount: promptCacheSavingsAmount.toFixed(4) }),
      ...(promptCacheSavingsAmount === undefined || pricing === undefined ? {} : { promptCacheSavingsCurrency: pricing.currency }),
      promptCacheSavingsStatus:
        cachedInputTokens === 0
          ? "no_cached_tokens_observed"
          : pricing === undefined
            ? "pricing_not_configured_not_computed"
            : "computed_from_owner_pricing",
      recordIds: sourceRecordIds,
      rollupDate: input.rollupDate,
      rollupId: `finops-rollup-${sha256CanonicalJson({
        agentName: group.agentName,
        modelId: group.modelId,
        rollupDate: input.rollupDate,
        workflowName: group.workflowName
      }).slice(0, 24)}`,
      runCount: group.runs.length,
      succeededCount: group.runs.filter((run) => run.status === "succeeded").length,
      totalTokens,
      uncachedInputTokens,
      unitEconomics: {
        tokensPerRun: group.runs.length === 0 ? "0" : new Decimal(totalTokens).div(group.runs.length).toFixed(4)
      },
      workflowName: group.workflowName
    }];
  });
}

function findBusinessDenominator(
  denominators: FinopsBusinessDenominator[],
  group: RollupGroup
): FinopsBusinessDenominator | undefined {
  return denominators.find(
    (denominator) =>
      denominator.workflowName === group.workflowName &&
      denominator.agentName === group.agentName &&
      denominator.modelId === group.modelId
  );
}

function groupUsageRuns(usageRuns: AgentUsageRun[]): RollupGroup[] {
  const groups = new Map<string, RollupGroup>();
  for (const run of usageRuns) {
    const key = [run.workflowName, run.agentName, run.modelId].join("\u0000");
    const group = groups.get(key) ?? {
      agentName: run.agentName,
      modelId: run.modelId,
      runs: [],
      workflowName: run.workflowName
    };
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
