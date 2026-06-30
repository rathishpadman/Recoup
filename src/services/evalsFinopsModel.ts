import { Decimal } from "decimal.js";
import {
  buildCurrentReleaseReadinessReport,
  buildReleaseLabelManifestRequirement,
  type CurrentReleaseReadinessInput
} from "../../evals/releaseReadiness.js";
import type { EvalsFinopsRepository } from "./evalsFinopsRepository.js";
import { buildEvalsFinopsRecommendations } from "./evalsFinopsRecommendations.js";
import type {
  AgentUsageRun,
  CostStatus,
  EvalFinopsCockpitModel,
  EvalGateResult,
  FinopsRecommendation,
  FinopsDailyRollup,
  ModelPricing,
  OpenAiCostBucket,
  PromptCacheSavingsStatus
} from "./evalsFinopsTypes.js";

export interface BuildEvalFinopsCockpitModelInput {
  generatedAtIso?: string;
  labelManifest?: unknown;
  releaseReadinessInput?: CurrentReleaseReadinessInput;
  repository: EvalsFinopsRepository;
}

interface AgentGroup {
  agentName: string;
  blockedCount: number;
  citedRunCount: number;
  deterministicBases: string[];
  failedCount: number;
  guardrailTripCount: number;
  handoffCount: number;
  modelId: string;
  recordIds: string[];
  runCount: number;
  statusLabels: Set<string>;
  succeededCount: number;
  toolCallCount: number;
  totalTokens: number;
  workflowName: string;
}

interface CostSummary {
  amount: Decimal;
  currency?: string;
  missingModelIds: string[];
  recordIds: string[];
  status: CostStatus;
}

interface PromptCacheSummary {
  cachedInputTokens: number;
  currency?: string;
  hitRateLabel: string;
  savingsAmount?: Decimal;
  savingsStatus: PromptCacheSavingsStatus;
  status: EvalFinopsCockpitModel["promptCache"]["status"];
  uncachedInputTokens: number;
}

export async function buildEvalFinopsCockpitModel(
  input: BuildEvalFinopsCockpitModelInput
): Promise<EvalFinopsCockpitModel> {
  const [usageRunsResult, latestEvalRunResult, pricingRowsResult, rollupsResult, storedRecommendationsResult, costBucketsResult] =
    await Promise.allSettled([
    input.repository.listAgentUsageRuns(),
    input.repository.loadLatestEvalRun(),
    input.repository.listActiveModelPricing(),
    input.repository.listDailyRollups(),
    input.repository.listOpenRecommendations(),
    input.repository.listOpenAiCostBuckets()
  ]);
  const usageRuns = settledValue(usageRunsResult, []);
  const latestEvalRun = settledValue(latestEvalRunResult, undefined);
  const pricingRows = settledValue(pricingRowsResult, []);
  const rollups = settledValue(rollupsResult, []);
  const storedRecommendations = settledValue(storedRecommendationsResult, []);
  const costBuckets = settledValue(costBucketsResult, []);
  const evalGateResultsResult =
    latestEvalRun === undefined ? undefined : await Promise.allSettled([input.repository.listEvalGateResults(latestEvalRun.evalRunId)]);
  const evalGateResults = evalGateResultsResult === undefined ? [] : settledValue(evalGateResultsResult[0], []);
  const evalGateResultsReadFailed = evalGateResultsResult?.[0]?.status === "rejected";
  const labelRequirement = buildReleaseLabelManifestRequirement(input.labelManifest);
  const currentReleaseReadiness = buildCurrentReleaseReadinessReport({
    ...(input.releaseReadinessInput ?? {}),
    ...(input.labelManifest === undefined ? {} : { labelManifest: input.labelManifest })
  });
  const storedEvalEvidenceUnavailable = latestEvalRun !== undefined && evalGateResultsReadFailed;
  const releaseStatus =
    latestEvalRunResult.status === "rejected" || storedEvalEvidenceUnavailable
      ? "blocked"
      : latestEvalRun?.releaseStatus ??
        (labelRequirement.status === "blocked" ? "blocked" : currentReleaseReadiness.status === "pass" ? "pass" : "fail");
  const pricingByModel = buildPricingByModel(pricingRows);
  const costSummary = computeCostSummary(usageRuns, pricingByModel, costBuckets);
  const promptCache = computePromptCacheSummary(usageRuns, pricingByModel);
  const blockedInputs = buildBlockedInputs({
    costBucketReadFailed: costBucketsResult.status === "rejected",
    evalGateResultsReadFailed,
    hasCostBucket: costBuckets.length > 0 && costSummary.status === "reconciled_from_provider_cost_api",
    hasPricing: pricingRows.length > 0,
    hasUsage: usageRuns.length > 0,
    labelRequirementStatus: labelRequirement.status,
    latestEvalRunReadFailed: latestEvalRunResult.status === "rejected",
    rollupsReadFailed: rollupsResult.status === "rejected",
    missingPricingModelIds: costSummary.missingModelIds,
    pricingReadFailed: pricingRowsResult.status === "rejected",
    recommendationsReadFailed: storedRecommendationsResult.status === "rejected",
    usageReadFailed: usageRunsResult.status === "rejected"
  });
  const evalGates = evalGateResults.length > 0 ? evalGateResults.map(mapStoredEvalGate) : mapCurrentReadinessGates(currentReleaseReadiness);
  const releaseBlockers =
    evalGateResults.length > 0
      ? evalGateResults.filter((gate) => gate.status === "blocked" || gate.status === "fail").map(mapEvalGateBlocker)
      : currentReleaseReadiness.status === "pass"
      ? []
      : currentReleaseReadiness.blockers.map((blocker) => ({
          gate: blocker.gate,
          reason: blocker.reason,
          ...(blocker.score === undefined ? {} : { score: blocker.score.toFixed(4) }),
          ...(blocker.threshold === undefined ? {} : { threshold: blocker.threshold.toFixed(4) }),
          openDependencies: blocker.openDependencies ?? []
        }));

  return {
    surface: "evals-finops",
    generatedAtIso: input.generatedAtIso ?? new Date().toISOString(),
    provenance: {
      sourceKind: "derived_backend",
      sourceName: "evals-finops-model",
      deterministicBasis: "EvalFinopsCockpitModel derived from release readiness, typed usage runs, pricing, rollups, and recommendations.",
      recordIds: unique([
        ...(latestEvalRun?.recordIds ?? []),
        ...evalGateResults.flatMap((gate) => gate.recordIds),
        ...usageRuns.flatMap((run) => run.recordIds),
        ...costSummary.recordIds,
        ...rollups.flatMap((rollup) => rollup.recordIds),
        ...storedRecommendations.flatMap((recommendation) => recommendation.evidenceRecordIds)
      ])
    },
    releaseReadiness: {
      status: releaseStatus,
      ...(latestEvalRun === undefined ? {} : { latestEvalRunId: latestEvalRun.evalRunId }),
      blockers: releaseBlockers
    },
    evalGates,
    agentMetrics: buildAgentMetrics(usageRuns),
    unitEconomics: buildUnitEconomics({ costSummary, promptCache, rollups, usageRuns }),
    promptCache: {
      status: promptCache.status,
      cachedInputTokens: promptCache.cachedInputTokens,
      uncachedInputTokens: promptCache.uncachedInputTokens,
      cacheHitRateLabel: promptCache.hitRateLabel,
      savingsLabel:
        promptCache.savingsAmount === undefined || promptCache.currency === undefined
          ? promptCache.savingsStatus === "no_cached_tokens_observed"
            ? "No cached tokens observed"
            : "Pricing not configured"
          : formatMoney(promptCache.currency, promptCache.savingsAmount),
      savingsStatus: promptCache.savingsStatus,
      deterministicBasis:
        "Prompt-cache savings use cached_input_tokens * (input_per_1m_tokens - cached_input_per_1m_tokens) / 1_000_000.",
      recordIds: unique(usageRuns.flatMap((run) => run.recordIds))
    },
    recommendations: dedupeRecommendations([
      ...storedRecommendations.map(mapStoredRecommendation),
      ...buildEvalsFinopsRecommendations({
        labelManifestBlocked: labelRequirement.status === "blocked",
        evalGates,
        hasTrustedCostBucket: costSummary.status === "reconciled_from_provider_cost_api",
        pricingRows,
        promptCache: {
          cachedInputTokens: promptCache.cachedInputTokens,
          savingsStatus: promptCache.savingsStatus,
          status: promptCache.status
        },
        usageRuns
      })
    ]),
    blockedInputs
  };
}

function buildAgentMetrics(usageRuns: AgentUsageRun[]): EvalFinopsCockpitModel["agentMetrics"] {
  const groups = new Map<string, AgentGroup>();

  for (const run of usageRuns) {
    const key = [run.agentName, run.workflowName, run.modelId].join("\u0000");
    const group =
      groups.get(key) ??
      ({
        agentName: run.agentName,
        blockedCount: 0,
        citedRunCount: 0,
        deterministicBases: [],
        failedCount: 0,
        guardrailTripCount: 0,
        handoffCount: 0,
        modelId: run.modelId,
        recordIds: [],
        runCount: 0,
        statusLabels: new Set<string>(),
        succeededCount: 0,
        toolCallCount: 0,
        totalTokens: 0,
        workflowName: run.workflowName
      } satisfies AgentGroup);
    group.runCount += 1;
    group.totalTokens += run.totalTokens;
    group.handoffCount += run.handoffCount;
    group.toolCallCount += run.toolCallCount;
    group.guardrailTripCount += run.guardrailTripCount;
    group.recordIds.push(...run.recordIds);
    group.deterministicBases.push(run.deterministicBasis);
    group.statusLabels.add(run.status);
    if (run.status === "blocked") {
      group.blockedCount += 1;
    }
    if (run.status === "failed") {
      group.failedCount += 1;
    }
    if (run.status === "succeeded") {
      group.succeededCount += 1;
    }
    if (run.citedRecordIds.length > 0) {
      group.citedRunCount += 1;
    }
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => ({
    agentName: group.agentName,
    workflowName: group.workflowName,
    modelId: group.modelId,
    statusLabel: [...group.statusLabels].sort().join(", "),
    runCount: group.runCount,
    blockedCount: group.blockedCount,
    failedCount: group.failedCount,
    totalTokens: group.totalTokens,
    averageTokensPerRun: formatInteger(Math.round(group.totalTokens / group.runCount)),
    handoffCount: group.handoffCount,
    toolCallCount: group.toolCallCount,
    guardrailTripCount: group.guardrailTripCount,
    citedAnswerRateLabel: formatPercent(group.citedRunCount, group.runCount),
    deterministicBasis: unique(group.deterministicBases).join("; "),
    recordIds: unique(group.recordIds)
  }));
}

function buildUnitEconomics(input: {
  costSummary: CostSummary;
  promptCache: PromptCacheSummary;
  rollups: FinopsDailyRollup[];
  usageRuns: AgentUsageRun[];
}): EvalFinopsCockpitModel["unitEconomics"] {
  const successfulRuns = input.usageRuns.filter((run) => run.status === "succeeded").length;
  const usageRecordIds = unique(input.usageRuns.flatMap((run) => run.recordIds));
  const costRecordIds = input.costSummary.recordIds.length === 0 ? usageRecordIds : input.costSummary.recordIds;
  const costBasis =
    input.costSummary.status === "reconciled_from_provider_cost_api"
      ? "Cost is reconciled from trusted OpenAI provider cost buckets."
      : "Token cost uses owner-approved model pricing and observed typed usage rows.";
  const costValue =
    input.costSummary.currency === undefined
      ? "Pricing not configured"
      : formatMoney(input.costSummary.currency, input.costSummary.amount);
  const perRunValue =
    input.costSummary.currency === undefined || successfulRuns === 0
      ? input.costSummary.currency === undefined
        ? "Pricing not configured"
        : "No successful runs"
      : formatMoney(input.costSummary.currency, input.costSummary.amount.div(successfulRuns));

  const rows: EvalFinopsCockpitModel["unitEconomics"] = [
    {
      metric: "Computed token cost",
      valueLabel: costValue,
      costStatus: input.costSummary.status,
      deterministicBasis: costBasis,
      recordIds: costRecordIds
    },
    {
      metric: "Cost per successful run",
      valueLabel: perRunValue,
      costStatus: input.costSummary.status,
      deterministicBasis:
        input.costSummary.status === "reconciled_from_provider_cost_api"
          ? "Trusted provider cost divided by succeeded usage run count."
          : "Computed token cost divided by succeeded usage run count.",
      recordIds: unique([...costRecordIds, ...usageRecordIds])
    },
    {
      metric: "Tokens per run",
      valueLabel:
        input.usageRuns.length === 0
          ? "Usage unavailable"
          : formatInteger(Math.round(sumNumbers(input.usageRuns.map((run) => run.totalTokens)) / input.usageRuns.length)),
      costStatus: input.costSummary.status,
      deterministicBasis: "Total observed tokens divided by typed usage run count.",
      recordIds: usageRecordIds
    },
    {
      metric: "Cached-token savings",
      valueLabel:
        input.promptCache.savingsAmount === undefined || input.promptCache.currency === undefined
          ? input.promptCache.savingsStatus === "no_cached_tokens_observed"
            ? "No cached tokens observed"
            : "Pricing not configured"
          : formatMoney(input.promptCache.currency, input.promptCache.savingsAmount),
      costStatus:
        input.promptCache.savingsStatus === "computed_from_owner_pricing"
          ? "computed_from_owner_pricing"
          : "pricing_not_configured_not_computed",
      deterministicBasis:
        "Cached-token savings use observed cached input tokens and approved full-input/cached-input pricing deltas.",
      recordIds: usageRecordIds
    }
  ];

  const rollupRecordIds = unique(input.rollups.flatMap((rollup) => rollup.recordIds));
  const casesProcessed = sumNumbers(input.rollups.map((rollup) => rollup.casesProcessedCount));
  const citedAnswers = sumNumbers(input.rollups.map((rollup) => rollup.citedAnswerCount));
  const approvedDrafts = sumNumbers(input.rollups.map((rollup) => rollup.approvedDraftCount));
  const disputedAmount = input.rollups.reduce((total, rollup) => total.plus(rollup.disputedAmount), new Decimal(0));

  if (input.rollups.length > 0) {
    rows.push(
      {
          metric: "Cost per case",
          valueLabel: formatPerUnitCost(input.costSummary, casesProcessed, "No cases processed"),
          costStatus: input.costSummary.status,
          deterministicBasis: "Computed token/provider cost divided by rollup cases_processed_count.",
          recordIds: unique([...rollupRecordIds, ...costRecordIds])
        },
      {
          metric: "Cost per cited answer",
          valueLabel: formatPerUnitCost(input.costSummary, citedAnswers, "No cited answers"),
          costStatus: input.costSummary.status,
          deterministicBasis: "Computed token/provider cost divided by rollup cited_answer_count.",
          recordIds: unique([...rollupRecordIds, ...costRecordIds])
        },
      {
          metric: "Cost per approved draft",
          valueLabel: formatPerUnitCost(input.costSummary, approvedDrafts, "No approved drafts"),
          costStatus: input.costSummary.status,
          deterministicBasis: "Computed token/provider cost divided by rollup approved_draft_count.",
          recordIds: unique([...rollupRecordIds, ...costRecordIds])
        },
      {
        metric: "Disputed amount denominator",
        valueLabel: disputedAmount.toFixed(2),
        costStatus: input.costSummary.status,
        deterministicBasis: "Disputed amount denominator is summed from finops daily rollup disputed_amount.",
        recordIds: rollupRecordIds
      }
    );
  }

  return rows;
}

function computeCostSummary(
  usageRuns: AgentUsageRun[],
  pricingByModel: Map<string, ModelPricing>,
  costBuckets: OpenAiCostBucket[]
): CostSummary {
  if (costBuckets.length > 0) {
    const providerCost = computeProviderCostSummary(costBuckets);
    if (providerCost !== undefined) {
      return providerCost;
    }
  }

  if (pricingByModel.size === 0 || usageRuns.length === 0) {
    return { amount: new Decimal(0), missingModelIds: [], recordIds: [], status: "pricing_not_configured_not_computed" };
  }

  const missingModelIds = findMissingPricingModelIds(usageRuns, pricingByModel);
  if (missingModelIds.length > 0) {
    return {
      amount: new Decimal(0),
      missingModelIds,
      recordIds: unique(usageRuns.filter((run) => missingModelIds.includes(run.modelId)).flatMap((run) => run.recordIds)),
      status: "pricing_not_configured_not_computed"
    };
  }

  let currency: string | undefined;
  const amount = usageRuns.reduce((total, run) => {
    const pricing = pricingByModel.get(run.modelId);
    if (pricing === undefined) {
      return total;
    }
    currency = pricing.currency;
    const uncachedInputTokens = new Decimal(run.uncachedInputTokens);
    const cachedInputTokens = new Decimal(run.cachedInputTokens);
    const outputTokens = new Decimal(run.outputTokens);
    const reasoningTokens = new Decimal(run.reasoningTokens);

    const runAmount = uncachedInputTokens
      .mul(pricing.inputPer1mTokens)
      .plus(cachedInputTokens.mul(pricing.cachedInputPer1mTokens))
      .plus(outputTokens.mul(pricing.outputPer1mTokens))
      .plus(reasoningTokens.mul(pricing.reasoningPer1mTokens))
      .div(1_000_000);

    return total.plus(runAmount);
  }, new Decimal(0));

  return currency === undefined
    ? { amount: new Decimal(0), missingModelIds: [], recordIds: [], status: "pricing_not_configured_not_computed" }
    : {
        amount,
        currency,
        missingModelIds: [],
        recordIds: unique(usageRuns.flatMap((run) => run.recordIds)),
        status: "computed_from_owner_pricing"
      };
}

function computePromptCacheSummary(usageRuns: AgentUsageRun[], pricingByModel: Map<string, ModelPricing>): PromptCacheSummary {
  if (usageRuns.length === 0) {
    return {
      cachedInputTokens: 0,
      hitRateLabel: "Usage unavailable",
      savingsStatus: "pricing_not_configured_not_computed",
      status: "usage_unavailable",
      uncachedInputTokens: 0
    };
  }

  const cachedInputTokens = sumNumbers(usageRuns.map((run) => run.cachedInputTokens));
  const inputTokens = sumNumbers(usageRuns.map((run) => run.inputTokens));
  const uncachedInputTokens = sumNumbers(usageRuns.map((run) => run.uncachedInputTokens));

  if (cachedInputTokens === 0) {
    return {
      cachedInputTokens,
      hitRateLabel: formatPercent(cachedInputTokens, inputTokens),
      savingsStatus: "no_cached_tokens_observed",
      status: "no_cached_tokens_observed",
      uncachedInputTokens
    };
  }

  if (pricingByModel.size === 0) {
    return {
      cachedInputTokens,
      hitRateLabel: formatPercent(cachedInputTokens, inputTokens),
      savingsStatus: "pricing_not_configured_not_computed",
      status: "pricing_not_configured_not_computed",
      uncachedInputTokens
    };
  }

  const missingCachedPricingModelIds = findMissingPricingModelIds(
    usageRuns.filter((run) => run.cachedInputTokens > 0),
    pricingByModel
  );
  if (missingCachedPricingModelIds.length > 0) {
    return {
      cachedInputTokens,
      hitRateLabel: formatPercent(cachedInputTokens, inputTokens),
      savingsStatus: "pricing_not_configured_not_computed",
      status: "pricing_not_configured_not_computed",
      uncachedInputTokens
    };
  }

  let currency: string | undefined;
  const savingsAmount = usageRuns.reduce((total, run) => {
    const pricing = pricingByModel.get(run.modelId);
    if (pricing === undefined) {
      return total;
    }
    currency = pricing.currency;
    return total.plus(
      new Decimal(run.cachedInputTokens)
        .mul(new Decimal(pricing.inputPer1mTokens).minus(pricing.cachedInputPer1mTokens))
        .div(1_000_000)
    );
  }, new Decimal(0));

  if (currency === undefined) {
    return {
      cachedInputTokens,
      hitRateLabel: formatPercent(cachedInputTokens, inputTokens),
      savingsStatus: "pricing_not_configured_not_computed",
      status: "pricing_not_configured_not_computed",
      uncachedInputTokens
    };
  }

  return {
    cachedInputTokens,
    currency,
    hitRateLabel: formatPercent(cachedInputTokens, inputTokens),
    savingsAmount,
    savingsStatus: "computed_from_owner_pricing",
    status: "active",
    uncachedInputTokens
  };
}

function computeProviderCostSummary(costBuckets: OpenAiCostBucket[]): CostSummary | undefined {
  const currencies = unique(costBuckets.map((bucket) => bucket.currency));
  if (currencies.length !== 1) {
    return undefined;
  }
  const currency = currencies[0];
  if (currency === undefined) {
    return undefined;
  }

  return {
    amount: costBuckets.reduce((total, bucket) => total.plus(bucket.amount), new Decimal(0)),
    currency,
    missingModelIds: [],
    recordIds: unique(costBuckets.flatMap((bucket) => [bucket.costBucketId, bucket.sourceResponseHash])),
    status: "reconciled_from_provider_cost_api"
  };
}

function findMissingPricingModelIds(usageRuns: AgentUsageRun[], pricingByModel: Map<string, ModelPricing>): string[] {
  return unique(usageRuns.map((run) => run.modelId).filter((modelId) => !pricingByModel.has(modelId)));
}

function buildPricingByModel(pricingRows: ModelPricing[]): Map<string, ModelPricing> {
  const pricingByModel = new Map<string, ModelPricing>();
  for (const pricing of pricingRows) {
    if (pricing.active) {
      pricingByModel.set(pricing.modelId, pricing);
    }
  }

  return pricingByModel;
}

function mapStoredEvalGate(gate: EvalGateResult): EvalFinopsCockpitModel["evalGates"][number] {
  return {
    gate: gate.gate,
    status: gate.status,
    scoreLabel: gate.score ?? "unavailable",
    thresholdLabel: gate.threshold ?? "unavailable",
    deterministicBasis: gate.deterministicBasis,
    recordIds: gate.recordIds
  };
}

function mapEvalGateBlocker(gate: EvalGateResult): EvalFinopsCockpitModel["releaseReadiness"]["blockers"][number] {
  return {
    gate: gate.gate,
    reason: gate.blockerReason ?? (gate.status === "fail" ? "release-blocking metric below threshold" : "blocked"),
    ...(gate.score === undefined ? {} : { score: gate.score }),
    ...(gate.threshold === undefined ? {} : { threshold: gate.threshold }),
    openDependencies: gate.openDependencies
  };
}

function mapCurrentReadinessGates(
  report: ReturnType<typeof buildCurrentReleaseReadinessReport>
): EvalFinopsCockpitModel["evalGates"] {
  if (report.status === "pass") {
    return [
      {
        gate: "release-readiness",
        status: "pass",
        scoreLabel: "pass",
        thresholdLabel: "owner-approved",
        deterministicBasis: "Current release readiness returned pass.",
        recordIds: ["release-readiness"]
      }
    ];
  }

  return report.blockers.map((blocker) => ({
    gate: blocker.gate,
    status: blocker.reason.includes("unavailable") || blocker.reason.includes("unset") ? "blocked" : "fail",
    scoreLabel: blocker.score === undefined ? "unavailable" : blocker.score.toFixed(4),
    thresholdLabel: blocker.threshold === undefined ? "unavailable" : blocker.threshold.toFixed(4),
    deterministicBasis: blocker.reason,
    recordIds: blocker.openDependencies ?? [blocker.gate]
  }));
}

function buildBlockedInputs(input: {
  costBucketReadFailed: boolean;
  evalGateResultsReadFailed: boolean;
  hasCostBucket: boolean;
  hasPricing: boolean;
  hasUsage: boolean;
  labelRequirementStatus: "blocked" | "pass";
  latestEvalRunReadFailed: boolean;
  missingPricingModelIds: string[];
  pricingReadFailed: boolean;
  recommendationsReadFailed: boolean;
  rollupsReadFailed: boolean;
  usageReadFailed: boolean;
}): EvalFinopsCockpitModel["blockedInputs"] {
  const blockedInputs: EvalFinopsCockpitModel["blockedInputs"] = [];

  if (input.labelRequirementStatus === "blocked") {
    blockedInputs.push({
      inputId: "release_eval_label_manifest",
      reason: "Owner-approved eval label manifest is unavailable.",
      requiredFor: ["release readiness", "intent precision", "arbitration agreement"]
    });
  }

  if (!input.hasUsage) {
    blockedInputs.push({
      inputId: "recoup_agent_usage_runs",
      reason: input.usageReadFailed
        ? "Source unavailable: typed agent usage rows could not be read."
        : "Source unavailable: no typed agent usage rows were returned.",
      requiredFor: ["agent metrics", "token usage", "unit economics"]
    });
  }

  if (!input.hasPricing && !input.hasCostBucket) {
    blockedInputs.push({
      inputId: "recoup_model_pricing",
      reason: "Owner-approved model pricing is unavailable.",
      requiredFor: ["computed cost", "cost per successful run", "prompt-cache dollar savings"]
    });
  }

  for (const modelId of input.missingPricingModelIds) {
    blockedInputs.push({
      inputId: `recoup_model_pricing:${modelId}`,
      reason: `Owner-approved pricing is unavailable for observed model ${modelId}.`,
      requiredFor: ["computed cost", "cost per successful run", "prompt-cache dollar savings"]
    });
  }

  if (input.costBucketReadFailed) {
    blockedInputs.push({
      inputId: "recoup_openai_cost_buckets",
      reason: "Trusted OpenAI provider cost import could not be read.",
      requiredFor: ["provider cost reconciliation"]
    });
  }

  if (input.evalGateResultsReadFailed) {
    blockedInputs.push({
      inputId: "recoup_eval_gate_results",
      reason: "Stored eval gate results could not be read.",
      requiredFor: ["release readiness", "quality gates"]
    });
  }

  if (input.latestEvalRunReadFailed) {
    blockedInputs.push({
      inputId: "recoup_eval_gate_runs",
      reason: "Stored eval run snapshots could not be read.",
      requiredFor: ["release readiness", "quality gates"]
    });
  }

  if (input.rollupsReadFailed) {
    blockedInputs.push({
      inputId: "recoup_finops_daily_rollups",
      reason: "FinOps daily rollups could not be read.",
      requiredFor: ["unit economics", "cost efficiency"]
    });
  }

  if (input.recommendationsReadFailed) {
    blockedInputs.push({
      inputId: "recoup_finops_recommendations",
      reason: "Stored FinOps recommendations could not be read.",
      requiredFor: ["recommended actions"]
    });
  }

  return blockedInputs;
}

function mapStoredRecommendation(
  recommendation: FinopsRecommendation
): EvalFinopsCockpitModel["recommendations"][number] {
  return {
    recommendationId: recommendation.recommendationId,
    severity: recommendation.severity,
    title: recommendation.title,
    recommendedAction: recommendation.recommendedAction,
    requiresHumanApproval: recommendation.requiresHumanApproval,
    deterministicBasis: recommendation.deterministicBasis,
    recordIds: recommendation.evidenceRecordIds
  };
}

function dedupeRecommendations(
  recommendations: EvalFinopsCockpitModel["recommendations"]
): EvalFinopsCockpitModel["recommendations"] {
  const byId = new Map<string, EvalFinopsCockpitModel["recommendations"][number]>();
  for (const recommendation of recommendations) {
    if (!byId.has(recommendation.recommendationId)) {
      byId.set(recommendation.recommendationId, recommendation);
    }
  }

  return [...byId.values()];
}

function formatMoney(currency: string, amount: Decimal): string {
  return `${currency} ${amount.toFixed(4)}`;
}

function formatPerUnitCost(costSummary: CostSummary, denominator: number, emptyLabel: string): string {
  if (costSummary.currency === undefined) {
    return "Pricing not configured";
  }
  if (denominator === 0) {
    return emptyLabel;
  }

  return formatMoney(costSummary.currency, costSummary.amount.div(denominator));
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) {
    return "0.0%";
  }

  return `${new Decimal(numerator).div(denominator).mul(100).toFixed(1)}%`;
}

function sumNumbers(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function settledValue<T, F>(result: PromiseSettledResult<T> | undefined, fallback: F): T | F {
  return result?.status === "fulfilled" ? result.value : fallback;
}
