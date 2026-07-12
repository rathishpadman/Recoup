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
  PersonaFinopsCaptureCoverage,
  PersonaFinopsCockpitModel,
  PersonaFinopsPersona,
  PromptCacheSavingsStatus
} from "./evalsFinopsTypes.js";

export interface BuildEvalFinopsCockpitModelInput {
  generatedAtIso?: string;
  labelManifest?: unknown;
  releaseReadinessInput?: CurrentReleaseReadinessInput;
  repository: EvalsFinopsRepository;
}

export const personaFinopsWorkflowScopes = {
  cfo: ["credit_risk", "maya_forensics_query"],
  david: ["credit_risk"],
  maya: ["maya_forensics_query"]
} as const satisfies Record<PersonaFinopsPersona, readonly string[]>;

const personaFinopsWorkflowLabels: Record<(typeof personaFinopsWorkflowScopes)[PersonaFinopsPersona][number], string> = {
  credit_risk: "David Credit Risk",
  maya_forensics_query: "Maya Forensics Query"
};

export const openAiWorkloadCaptureCoverage: readonly PersonaFinopsCaptureCoverage[] = [
  {
    workloadLabel: "Maya Copilot query",
    workflowName: "maya_forensics_query",
    models: ["gpt-5.4"],
    persona: "maya",
    captureStatus: "typed_receipts",
    note: "Typed usage receipts are persisted per successful live query."
  },
  {
    workloadLabel: "David credit query",
    workflowName: "credit_risk",
    models: ["gpt-5.4"],
    persona: "david",
    captureStatus: "typed_receipts",
    note: "Typed usage receipts are persisted per successful live query."
  },
  {
    workloadLabel: "Forensics Investigator settlement runs",
    workflowName: "deduction_forensics",
    models: ["gpt-5.4"],
    persona: "maya",
    captureStatus: "not_captured",
    note: "Agent SDK settlement runs do not persist typed usage receipts yet."
  },
  {
    workloadLabel: "Recovery Drafter",
    workflowName: "deduction_forensics",
    models: ["gpt-5.4"],
    persona: "maya",
    captureStatus: "not_captured",
    note: "Agent SDK drafting runs do not persist typed usage receipts yet."
  },
  {
    workloadLabel: "Credit Sentinel",
    workflowName: "credit_risk",
    models: ["gpt-5.4"],
    persona: "david",
    captureStatus: "not_captured",
    note: "Agent SDK monitoring runs do not persist typed usage receipts yet."
  },
  {
    workloadLabel: "Risk Mesh arbitration",
    workflowName: "risk_mesh",
    models: ["gpt-5.4"],
    persona: "david",
    captureStatus: "not_captured",
    note: "Agent SDK arbitration runs do not persist typed usage receipts yet."
  },
  {
    workloadLabel: "Behavioural Containment",
    workflowName: "containment",
    models: ["gpt-5.4"],
    persona: "david",
    captureStatus: "not_captured",
    note: "Agent SDK containment runs do not persist typed usage receipts yet."
  },
  {
    workloadLabel: "Action Packet Drafter",
    workflowName: "credit_risk",
    models: ["gpt-5.4"],
    persona: "david",
    captureStatus: "not_captured",
    note: "Agent SDK drafting runs do not persist typed usage receipts yet."
  },
  {
    workloadLabel: "Negotiation counter extractor",
    workflowName: "credit_risk",
    models: ["gpt-5.4-mini"],
    persona: "david",
    captureStatus: "not_captured",
    note: "Structured extraction calls do not persist typed usage receipts yet; gpt-5.4-mini also has no owner-approved pricing row."
  },
  {
    workloadLabel: "Realtime voice query",
    models: ["gpt-realtime-2", "gpt-4o-mini-transcribe"],
    persona: "shared",
    captureStatus: "not_captured",
    note: "Realtime audio sessions do not persist typed usage receipts; audio token pricing is not configured."
  }
];

function personaCaptureCoverage(persona: PersonaFinopsPersona): PersonaFinopsCaptureCoverage[] {
  if (persona === "cfo") {
    return [...openAiWorkloadCaptureCoverage];
  }

  return openAiWorkloadCaptureCoverage.filter((entry) => entry.persona === persona || entry.persona === "shared");
}

export interface BuildPersonaFinopsCockpitModelInput {
  generatedAtIso?: string;
  period: {
    fromIso: string;
    toIso: string;
  };
  persona: PersonaFinopsPersona;
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

export async function buildPersonaFinopsCockpitModel(
  input: BuildPersonaFinopsCockpitModelInput
): Promise<PersonaFinopsCockpitModel> {
  const generatedAtIso = input.generatedAtIso ?? new Date().toISOString();
  const generatedAtMs = new Date(generatedAtIso).getTime();
  const [usageRunsResult, pricingRowsResult, recommendationsResult] = await Promise.allSettled([
    input.repository.listAgentUsageRuns({
      fromIso: input.period.fromIso,
      toIso: input.period.toIso,
      workflowNames: [...personaFinopsWorkflowScopes[input.persona]]
    }),
    input.repository.listModelPricingForPeriod(input.period),
    input.repository.listOpenRecommendations()
  ]);
  const allowedWorkflows: readonly string[] = personaFinopsWorkflowScopes[input.persona];
  const scopedUsageRuns = settledValue(usageRunsResult, []).filter((run) => allowedWorkflows.includes(run.workflowName));
  const futureUsageRuns = scopedUsageRuns.filter((run) => new Date(run.createdAt).getTime() > generatedAtMs + 30_000);
  const usageRuns = scopedUsageRuns.filter(
    (run) => !futureUsageRuns.includes(run) && run.recordIds.length > 0 && hasCompleteTokenBreakdown(run)
  );
  const pricingRows = settledValue(pricingRowsResult, []);
  const recommendations = settledValue(recommendationsResult, []).filter(
    (recommendation) =>
      recommendation.affectedWorkflowName !== undefined &&
      allowedWorkflows.includes(recommendation.affectedWorkflowName) &&
      new Date(recommendation.createdAt) >= new Date(input.period.fromIso) &&
      new Date(recommendation.createdAt) < new Date(input.period.toIso) &&
      recommendation.evidenceRecordIds.length > 0
  );
  const blockedInputs: PersonaFinopsCockpitModel["blockedInputs"] = [];
  if (usageRunsResult.status === "rejected") {
    blockedInputs.push({ inputId: "recoup_agent_usage_runs", reason: "Agent usage source read failed." });
  }
  if (pricingRowsResult.status === "rejected") {
    blockedInputs.push({ inputId: "recoup_model_pricing", reason: "Model pricing source read failed." });
  }
  if (recommendationsResult.status === "rejected") {
    blockedInputs.push({ inputId: "recoup_finops_recommendations", reason: "FinOps recommendation source read failed." });
  }
  if (scopedUsageRuns.some((run) => run.recordIds.length === 0)) {
    blockedInputs.push({ inputId: "record_ids", reason: "Usage metrics without record IDs were suppressed." });
  }
  if (scopedUsageRuns.some((run) => !hasCompleteTokenBreakdown(run))) {
    blockedInputs.push({ inputId: "token_breakdown", reason: "Usage metrics with a missing or inconsistent token breakdown were suppressed." });
  }
  if (futureUsageRuns.length > 0) {
    blockedInputs.push({ inputId: "usage_timestamp", reason: "Usage metrics with future timestamps were suppressed." });
  }
  const workflowMetrics = buildPersonaWorkflowMetrics(usageRuns, pricingRows);
  const usageAsOf = maxIso(usageRuns.map((run) => run.createdAt));
  const freshnessStatus = personaFreshnessStatus(usageAsOf, generatedAtIso, usageRunsResult.status === "rejected");
  const pricingAsOf = maxIso(pricingRows.flatMap((row) => row.sourceRetrievedAt === undefined ? [] : [row.sourceRetrievedAt]));
  const recommendationsAsOf = maxIso(recommendations.map((row) => row.createdAt));

  return {
    surface: "persona-finops",
    persona: input.persona,
    generatedAtIso,
    period: input.period,
    freshnessStatus,
    sourceAsOf: {
      ...(usageAsOf === undefined ? {} : { usageIso: usageAsOf }),
      ...(pricingAsOf === undefined ? {} : { pricingIso: pricingAsOf }),
      ...(recommendationsAsOf === undefined ? {} : { recommendationsIso: recommendationsAsOf })
    },
    provenance: {
      sourceKind: "derived_backend",
      sourceName: "persona-finops-model",
      deterministicBasis: `Persona FinOps filters exact ${input.persona} workflow identifiers before aggregation.`,
      recordIds: unique(usageRuns.flatMap((run) => run.recordIds))
    },
    sourceStatus: {
      usage: usageRunsResult.status === "rejected" ? "unavailable" : "available",
      pricing: pricingRowsResult.status === "rejected" ? "unavailable" : "available",
      recommendations: recommendationsResult.status === "rejected" ? "unavailable" : "available"
    },
    blockedInputs,
    captureCoverage: personaCaptureCoverage(input.persona),
    summary: {
      ...buildPersonaSummary(usageRuns),
      ...buildPersonaCostRollup(workflowMetrics, usageRuns, pricingRows)
    },
    dailyTrend: buildPersonaDailyTrend(usageRuns, pricingRows),
    recommendations: recommendations.map((recommendation) => ({
      recommendationId: recommendation.recommendationId,
      severity: recommendation.severity,
      title: recommendation.title,
      recommendedAction: recommendation.recommendedAction,
      requiresHumanApproval: recommendation.requiresHumanApproval,
      deterministicBasis: recommendation.deterministicBasis,
      recordIds: recommendation.evidenceRecordIds
    })),
    workflowMetrics
  };
}

const personaCostFormula =
  "Sum per run: (uncached input * input price + cached input * cached price + max(output - reasoning, 0) * output price + reasoning * reasoning price) / 1,000,000";

const personaFinopsFreshnessThresholdHours = 48;

function personaFreshnessStatus(
  usageAsOf: string | undefined,
  generatedAtIso: string,
  usageSourceRejected: boolean
): PersonaFinopsCockpitModel["freshnessStatus"] {
  if (usageSourceRejected) {
    return "unavailable";
  }
  if (usageAsOf === undefined) {
    return "unavailable";
  }
  const ageMs = new Date(generatedAtIso).getTime() - new Date(usageAsOf).getTime();
  return ageMs <= personaFinopsFreshnessThresholdHours * 60 * 60 * 1000 ? "fresh" : "stale";
}

function buildPersonaCostRollup(
  workflowMetrics: PersonaFinopsCockpitModel["workflowMetrics"],
  usageRuns: AgentUsageRun[],
  pricingRows: ModelPricing[]
): Partial<PersonaFinopsCockpitModel["summary"]> {
  if (workflowMetrics.length === 0) {
    return {};
  }
  const allPriced = workflowMetrics.every(
    (metric) =>
      metric.costStatus === "computed_from_owner_pricing" &&
      metric.computedCostAmount !== undefined &&
      metric.computedCostCurrency !== undefined
  );
  const currencies = unique(workflowMetrics.flatMap((metric) => metric.computedCostCurrency === undefined ? [] : [metric.computedCostCurrency]));
  const rollup: Partial<PersonaFinopsCockpitModel["summary"]> = {};
  if (allPriced && currencies.length === 1 && currencies[0] !== undefined) {
    const currency = currencies[0];
    const total = workflowMetrics.reduce((sum, metric) => sum.plus(metric.computedCostAmount ?? "0"), new Decimal(0));
    const runCount = usageRuns.length;
    rollup.totalCostLabel = `${currency} ${total.toFixed(4)}`;
    if (runCount > 0) {
      rollup.averageCostPerRunLabel = `${currency} ${total.div(runCount).toFixed(4)}`;
    }
    const citedRunCount = usageRuns.filter((run) => run.citedRecordIds.length > 0).length;
    if (citedRunCount > 0) {
      rollup.costPerCitedAnswerLabel = `${currency} ${total.div(citedRunCount).toFixed(4)}`;
    }
  }
  const savings = computePersonaCacheSavings(usageRuns, pricingRows);
  if (savings.status === "computed_from_owner_pricing") {
    rollup.cacheSavingsLabel = savings.label;
  }
  return rollup;
}

function buildPersonaWorkflowMetrics(
  usageRuns: AgentUsageRun[],
  pricingRows: ModelPricing[]
): PersonaFinopsCockpitModel["workflowMetrics"] {
  const groups = new Map<string, AgentUsageRun[]>();
  for (const run of usageRuns) {
    const key = [run.workflowName, run.modelId, run.serviceTier ?? "unknown"].join("\u0000");
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }

  return [...groups.values()].map((runs) => {
    const first = runs[0];
    if (first === undefined) {
      throw new Error("Persona FinOps cannot aggregate an empty usage group.");
    }
    const cost = computePersonaCostSummary(runs, pricingRows);

    return {
      workflowLabel: personaFinopsWorkflowLabels[first.workflowName as keyof typeof personaFinopsWorkflowLabels],
      workflowName: first.workflowName,
      participatingAgentNames: unique(runs.flatMap((run) => [run.agentName, ...(run.participatingAgentNames ?? [])])),
      modelId: first.modelId,
      ...(first.serviceTier === undefined ? {} : { serviceTier: first.serviceTier }),
      runCount: runs.length,
      successRateLabel: formatPercent(runs.filter((run) => run.status === "succeeded").length, runs.length),
      tokensPerRunLabel: formatInteger(Math.round(sumNumbers(runs.map((run) => run.totalTokens)) / runs.length)),
      toolCallsPerRunLabel: new Decimal(sumNumbers(runs.map((run) => run.toolCallCount))).div(runs.length).toFixed(1),
      citedAnswerRateLabel: formatPercent(runs.filter((run) => run.citedRecordIds.length > 0).length, runs.length),
      humanReviewRateLabel: "Unavailable",
      inputTokens: sumNumbers(runs.map((run) => run.inputTokens)),
      cachedInputTokens: sumNumbers(runs.map((run) => run.cachedInputTokens)),
      uncachedInputTokens: sumNumbers(runs.map((run) => run.uncachedInputTokens)),
      outputTokens: sumNumbers(runs.map((run) => run.outputTokens)),
      reasoningTokens: sumNumbers(runs.map((run) => run.reasoningTokens)),
      reasoningTokensStatus: runs.every((run) => run.reasoningTokensStatus === "observed") ? "observed" : "unavailable",
      totalTokens: sumNumbers(runs.map((run) => run.totalTokens)),
      guardrailTripCount: sumNumbers(runs.map((run) => run.guardrailTripCount)),
      guardrailTripCountStatus: runs.every((run) => run.guardrailTripCountStatus === "observed") ? "observed" : "unavailable",
      costStatus: cost.status,
      ...(cost.currency === undefined
        ? {}
        : { computedCostAmount: cost.amount.toFixed(4), computedCostCurrency: cost.currency }),
      costCalculationBasis: buildPersonaCostCalculationBasis(cost),
      ...(cost.unavailableReason === undefined ? {} : { costUnavailableReason: cost.unavailableReason }),
      pricingProvenance: cost.pricingProvenance,
      usageRunIds: runs.map((run) => run.usageRunId),
      sourceReceiptIds: unique(runs.flatMap((run) => (run.sourceReceiptId === undefined ? [] : [run.sourceReceiptId]))),
      deterministicBasis: unique(runs.map((run) => run.deterministicBasis)).join("; "),
      recordIds: unique(runs.flatMap((run) => run.recordIds))
    };
  });
}

interface PersonaCostSummary extends CostSummary {
  unavailableReason?: PersonaFinopsCockpitModel["workflowMetrics"][number]["costUnavailableReason"];
  pricingProvenance: Array<{
    cachedInputPer1mTokens: string;
    currency: string;
    effectiveFrom: string;
    effectiveTo?: string;
    inputPer1mTokens: string;
    outputPer1mTokens: string;
    pricingHash: string;
    pricingId: string;
    reasoningPer1mTokens: string;
    serviceTier: "default" | "flex" | "priority";
    approvedBy: string;
    providerSourceUrl: string;
    sourceRetrievedAt: string;
  }>;
}

function computePersonaCostSummary(usageRuns: AgentUsageRun[], pricingRows: ModelPricing[]): PersonaCostSummary {
  let amount = new Decimal(0);
  let currency: string | undefined;
  const pricingProvenance: PersonaCostSummary["pricingProvenance"] = [];

  for (const run of usageRuns) {
    if (run.modelExecutionMode !== "live_openai_agents") {
      return unavailablePersonaCostSummary(usageRuns, "non_live_execution");
    }
    const serviceTier = run.serviceTier;
    if (serviceTier === undefined) {
      return unavailablePersonaCostSummary(usageRuns, "missing_service_tier");
    }
    const runAt = new Date(run.createdAt).getTime();
    const matches = pricingRows.filter((row) => {
      if (row.modelId !== run.modelId || row.serviceTier !== serviceTier) {
        return false;
      }
      const startsAt = new Date(row.effectiveFrom).getTime();
      const endsAt = row.effectiveTo === undefined ? undefined : new Date(row.effectiveTo).getTime();
      return startsAt <= runAt && (endsAt === undefined || runAt < endsAt);
    });
    if (matches.length !== 1 || matches[0] === undefined) {
      const modelRows = pricingRows.filter((row) => row.modelId === run.modelId && row.serviceTier === serviceTier);
      return unavailablePersonaCostSummary(usageRuns, modelRows.length === 0 ? "unknown_model" : matches.length > 1 ? "ambiguous_pricing" : "pricing_period_mismatch");
    }
    const pricing = matches[0];
    if (!hasVerifiedPricingProvenance(pricing)) {
      return unavailablePersonaCostSummary(usageRuns, "pricing_provenance_incomplete");
    }
    const runCost = computeCostSummary([run], new Map([[run.modelId, pricing]]), []);
    if (runCost.currency === undefined || (currency !== undefined && currency !== runCost.currency)) {
      return unavailablePersonaCostSummary(usageRuns);
    }
    currency = runCost.currency;
    amount = amount.plus(runCost.amount);
    if (!pricingProvenance.some((item) => item.pricingId === pricing.pricingId && item.pricingHash === pricing.pricingHash)) {
      pricingProvenance.push({
        approvedBy: pricing.approvedBy,
        cachedInputPer1mTokens: pricing.cachedInputPer1mTokens,
        currency: pricing.currency,
        effectiveFrom: pricing.effectiveFrom,
        ...(pricing.effectiveTo === undefined ? {} : { effectiveTo: pricing.effectiveTo }),
        inputPer1mTokens: pricing.inputPer1mTokens,
        outputPer1mTokens: pricing.outputPer1mTokens,
        pricingHash: pricing.pricingHash,
        pricingId: pricing.pricingId,
        reasoningPer1mTokens: pricing.reasoningPer1mTokens,
        serviceTier,
        providerSourceUrl: pricing.providerSourceUrl,
        sourceRetrievedAt: pricing.sourceRetrievedAt
      });
    }
  }

  return currency === undefined
    ? unavailablePersonaCostSummary(usageRuns)
    : {
        amount,
        currency,
        missingModelIds: [],
        pricingProvenance,
        recordIds: unique(usageRuns.flatMap((run) => run.recordIds)),
        status: "computed_from_owner_pricing"
      };
}

function buildPersonaCostCalculationBasis(cost: PersonaCostSummary): string {
  if (cost.status !== "computed_from_owner_pricing" || cost.pricingProvenance.length === 0) {
    return "Cost unavailable: every usage receipt requires exactly one effective model and service-tier pricing row.";
  }
  const tiers = unique(cost.pricingProvenance.map((pricing) => pricing.serviceTier));
  const pricingIds = unique(cost.pricingProvenance.map((pricing) => pricing.pricingId));
  return `${personaCostFormula} using effective ${tiers.join(", ")}-tier pricing ${pricingIds.join(", ")}.`;
}

function unavailablePersonaCostSummary(
  usageRuns: AgentUsageRun[],
  unavailableReason: NonNullable<PersonaCostSummary["unavailableReason"]> = "unknown_model"
): PersonaCostSummary {
  return {
    amount: new Decimal(0),
    missingModelIds: unique(usageRuns.map((run) => run.modelId)),
    pricingProvenance: [],
    recordIds: unique(usageRuns.flatMap((run) => run.recordIds)),
    status: "pricing_not_configured_not_computed",
    unavailableReason
  };
}

function hasCompleteTokenBreakdown(run: AgentUsageRun): boolean {
  return run.inputTokens === run.cachedInputTokens + run.uncachedInputTokens &&
    [run.inputTokens, run.cachedInputTokens, run.uncachedInputTokens, run.outputTokens, run.reasoningTokens, run.totalTokens]
      .every((value) => Number.isInteger(value) && value >= 0);
}

function hasVerifiedPricingProvenance(
  pricing: ModelPricing
): pricing is ModelPricing & { providerSourceUrl: string; sourceRetrievedAt: string } {
  if (pricing.providerSourceUrl === undefined || pricing.sourceRetrievedAt === undefined) return false;
  try {
    const url = new URL(pricing.providerSourceUrl);
    return (url.protocol === "https:" || url.protocol === "http:") && Number.isFinite(new Date(pricing.sourceRetrievedAt).valueOf());
  } catch {
    return false;
  }
}

function buildPersonaSummary(usageRuns: AgentUsageRun[]): PersonaFinopsCockpitModel["summary"] {
  const runCount = usageRuns.length;
  const totalTokens = sumNumbers(usageRuns.map((run) => run.totalTokens));
  const totalInput = sumNumbers(usageRuns.map((run) => run.inputTokens));
  const cachedInput = sumNumbers(usageRuns.map((run) => run.cachedInputTokens));
  const latencies = usageRuns.flatMap((run) => run.latencyMs === undefined ? [] : [run.latencyMs]).sort((left, right) => left - right);
  const p95Index = latencies.length === 0 || latencies.length !== usageRuns.length
    ? undefined
    : Math.max(Math.ceil(latencies.length * 0.95) - 1, 0);
  return {
    runCount,
    tokensPerRunLabel: runCount === 0 ? "Unavailable" : formatInteger(Math.round(totalTokens / runCount)),
    cacheHitRateLabel: totalInput === 0 ? "Unavailable" : formatPercent(cachedInput, totalInput),
    latencyP95Label: p95Index === undefined ? "Unavailable" : `${formatInteger(latencies[p95Index] ?? 0)} ms`,
    costPerOutcomeLabel: "Requires verified outcomes"
  };
}

function buildPersonaDailyTrend(
  usageRuns: AgentUsageRun[],
  pricingRows: ModelPricing[]
): PersonaFinopsCockpitModel["dailyTrend"] {
  const byDate = new Map<string, AgentUsageRun[]>();
  for (const run of usageRuns) {
    const date = run.createdAt.slice(0, 10);
    byDate.set(date, [...(byDate.get(date) ?? []), run]);
  }
  return [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, runs]) => {
    const savings = computePersonaCacheSavings(runs, pricingRows);
    return {
      date,
      totalTokens: sumNumbers(runs.map((run) => run.totalTokens)),
      cachedInputTokens: sumNumbers(runs.map((run) => run.cachedInputTokens)),
      uncachedInputTokens: sumNumbers(runs.map((run) => run.uncachedInputTokens)),
      cacheSavingsLabel: savings.label,
      cacheSavingsStatus: savings.status,
      recordIds: unique(runs.flatMap((run) => run.recordIds))
    };
  });
}

function computePersonaCacheSavings(
  runs: AgentUsageRun[],
  pricingRows: ModelPricing[]
): { label: string; status: PromptCacheSavingsStatus } {
  if (sumNumbers(runs.map((run) => run.cachedInputTokens)) === 0) {
    return { label: "No cached tokens observed", status: "no_cached_tokens_observed" };
  }
  let currency: string | undefined;
  let amount = new Decimal(0);
  for (const run of runs) {
    const tier = run.serviceTier;
    const matches = tier === undefined ? [] : pricingRows.filter((row) => row.modelId === run.modelId && row.serviceTier === tier && new Date(row.effectiveFrom) <= new Date(run.createdAt) && (row.effectiveTo === undefined || new Date(run.createdAt) < new Date(row.effectiveTo)));
    const price = matches.length === 1 ? matches[0] : undefined;
    if (price === undefined || !hasVerifiedPricingProvenance(price) || (currency !== undefined && currency !== price.currency)) {
      return { label: "Pricing unavailable", status: "pricing_not_configured_not_computed" };
    }
    currency = price.currency;
    amount = amount.plus(new Decimal(run.cachedInputTokens).mul(new Decimal(price.inputPer1mTokens).minus(price.cachedInputPer1mTokens)).div(1_000_000));
  }
  return currency === undefined
    ? { label: "Pricing unavailable", status: "pricing_not_configured_not_computed" }
    : { label: `${currency} ${amount.toFixed(4)}`, status: "computed_from_owner_pricing" };
}

function maxIso(values: string[]): string | undefined {
  return values.length === 0 ? undefined : values.reduce((latest, value) => new Date(value) > new Date(latest) ? value : latest);
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
    const outputTokens = new Decimal(Math.max(run.outputTokens - run.reasoningTokens, 0));
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
