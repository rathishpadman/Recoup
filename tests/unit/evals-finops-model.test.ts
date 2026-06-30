import { describe, expect, it } from "vitest";
import type { EvalsFinopsRepository } from "../../src/services/evalsFinopsRepository.js";
import { buildEvalFinopsCockpitModel } from "../../src/services/evalsFinopsModel.js";
import type {
  AgentUsageRun,
  EvalGateRun,
  FinopsDailyRollup,
  FinopsRecommendation,
  ModelPricing,
  OpenAiCostBucket
} from "../../src/services/evalsFinopsTypes.js";

describe("evals FinOps cockpit model", () => {
  it("fails closed when pricing, labels, and usage rows are missing", async () => {
    const model = await buildEvalFinopsCockpitModel({
      repository: repositoryFixture({
        usageRuns: []
      })
    });

    expect(model.surface).toBe("evals-finops");
    expect(model.releaseReadiness.status).toBe("blocked");
    expect(model.agentMetrics).toEqual([]);
    expect(model.unitEconomics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          costStatus: "pricing_not_configured_not_computed",
          metric: "Cost per successful run",
          valueLabel: "Pricing not configured"
        })
      ])
    );
    expect(model.promptCache).toMatchObject({
      cachedInputTokens: 0,
      cacheHitRateLabel: "Usage unavailable",
      savingsLabel: "Pricing not configured",
      savingsStatus: "pricing_not_configured_not_computed",
      status: "usage_unavailable"
    });
    expect(model.blockedInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inputId: "release_eval_label_manifest",
          reason: "Owner-approved eval label manifest is unavailable."
        }),
        expect.objectContaining({
          inputId: "recoup_agent_usage_runs",
          reason: "Source unavailable: no typed agent usage rows were returned."
        }),
        expect.objectContaining({
          inputId: "recoup_model_pricing",
          reason: "Owner-approved model pricing is unavailable."
        })
      ])
    );
    expect(JSON.stringify(model)).not.toContain("$0");
  });

  it("aggregates existing token rows into agent metrics and prompt-cache hit rate without pricing", async () => {
    const model = await buildEvalFinopsCockpitModel({
      repository: repositoryFixture({
        usageRuns: [usageRun({ cachedInputTokens: 250, inputTokens: 1000, totalTokens: 1500, uncachedInputTokens: 750 })]
      })
    });

    expect(model.agentMetrics).toEqual([
      expect.objectContaining({
        agentName: "Maya Forensics",
        averageTokensPerRun: "1,500",
        runCount: 1,
        totalTokens: 1500
      })
    ]);
    expect(model.promptCache).toMatchObject({
      cachedInputTokens: 250,
      cacheHitRateLabel: "25.0%",
      savingsLabel: "Pricing not configured",
      savingsStatus: "pricing_not_configured_not_computed",
      status: "pricing_not_configured_not_computed",
      uncachedInputTokens: 750
    });
  });

  it("computes costs and unit economics with Decimal math when active pricing exists", async () => {
    const model = await buildEvalFinopsCockpitModel({
      repository: repositoryFixture({
        pricing: [
          pricing({
            cachedInputPer1mTokens: "0.125",
            inputPer1mTokens: "1.250",
            outputPer1mTokens: "10.000",
            reasoningPer1mTokens: "0.000"
          })
        ],
        usageRuns: [
          usageRun({
            cachedInputTokens: 200_000,
            inputTokens: 1_000_000,
            outputTokens: 100_000,
            totalTokens: 1_100_000,
            uncachedInputTokens: 800_000
          })
        ]
      })
    });

    expect(model.unitEconomics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          costStatus: "computed_from_owner_pricing",
          metric: "Computed token cost",
          valueLabel: "USD 2.0250"
        }),
        expect.objectContaining({
          costStatus: "computed_from_owner_pricing",
          metric: "Cost per successful run",
          valueLabel: "USD 2.0250"
        })
      ])
    );
  });

  it("fails closed instead of undercounting when pricing is missing for any observed model", async () => {
    const model = await buildEvalFinopsCockpitModel({
      repository: repositoryFixture({
        pricing: [
          pricing({
            modelId: "gpt-5-mini",
            cachedInputPer1mTokens: "0.125",
            inputPer1mTokens: "1.250",
            outputPer1mTokens: "10.000",
            reasoningPer1mTokens: "0.000"
          })
        ],
        usageRuns: [
          usageRun({
            modelId: "gpt-5-mini",
            totalTokens: 1_100_000
          }),
          usageRun({
            modelId: "gpt-5-nano",
            usageRunId: "usage-unpriced",
            recordIds: ["usage-unpriced"],
            totalTokens: 1_000
          })
        ]
      })
    });

    expect(model.unitEconomics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          costStatus: "pricing_not_configured_not_computed",
          metric: "Computed token cost",
          valueLabel: "Pricing not configured"
        })
      ])
    );
    expect(model.blockedInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inputId: "recoup_model_pricing:gpt-5-nano",
          reason: "Owner-approved pricing is unavailable for observed model gpt-5-nano."
        })
      ])
    );
    expect(model.recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recommendationId: "pricing-missing:gpt-5-nano"
        })
      ])
    );
    const pricingMissingRecommendation = model.recommendations.find(
      (recommendation) => recommendation.recommendationId === "pricing-missing:gpt-5-nano"
    );
    expect(pricingMissingRecommendation?.recordIds).toEqual(expect.arrayContaining(["usage-unpriced"]));
    expect(JSON.stringify(model)).not.toContain("USD 2.0250");
  });

  it("uses trusted provider cost buckets as aggregate cost provenance when pricing is missing", async () => {
    const model = await buildEvalFinopsCockpitModel({
      repository: repositoryFixture({
        costBuckets: [
          costBucket({ amount: "1.2500", costBucketId: "bucket-1", sourceResponseHash: "a".repeat(64) }),
          costBucket({ amount: "2.2500", costBucketId: "bucket-2", sourceResponseHash: "b".repeat(64) })
        ],
        pricing: [],
        usageRuns: [usageRun({ cachedInputTokens: 250, inputTokens: 1000, uncachedInputTokens: 750 })]
      })
    });

    expect(model.unitEconomics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          costStatus: "reconciled_from_provider_cost_api",
          metric: "Computed token cost",
          valueLabel: "USD 3.5000"
        })
      ])
    );
    expect(model.provenance.recordIds).toEqual(expect.arrayContaining(["bucket-1", "bucket-2", "a".repeat(64), "b".repeat(64)]));
    const providerCostMetric = model.unitEconomics.find((metric) => metric.metric === "Computed token cost");
    expect(providerCostMetric).toMatchObject({
      deterministicBasis: "Cost is reconciled from trusted OpenAI provider cost buckets.",
      metric: "Computed token cost"
    });
    expect(providerCostMetric?.recordIds).toEqual(expect.arrayContaining(["bucket-1", "bucket-2", "a".repeat(64), "b".repeat(64)]));
    expect(model.promptCache).toMatchObject({
      cachedInputTokens: 250,
      savingsLabel: "Pricing not configured",
      savingsStatus: "pricing_not_configured_not_computed",
      status: "pricing_not_configured_not_computed"
    });
    expect(model.unitEconomics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          costStatus: "pricing_not_configured_not_computed",
          metric: "Cached-token savings",
          valueLabel: "Pricing not configured"
        })
      ])
    );
  });

  it("ties unit economics to daily rollup business denominators", async () => {
    const model = await buildEvalFinopsCockpitModel({
      repository: repositoryFixture({
        costBuckets: [costBucket({ amount: "4.0000" })],
        dailyRollups: [
          dailyRollup({
            approvedDraftCount: 1,
            casesProcessedCount: 4,
            citedAnswerCount: 2,
            disputedAmount: "9200.00",
            recordIds: ["rollup-usage-1"]
          })
        ],
        pricing: [],
        usageRuns: [usageRun()]
      })
    });

    expect(model.unitEconomics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: "Cost per case",
          valueLabel: "USD 1.0000"
        }),
        expect.objectContaining({
          metric: "Cost per cited answer",
          valueLabel: "USD 2.0000"
        }),
        expect.objectContaining({
          metric: "Cost per approved draft",
          valueLabel: "USD 4.0000"
        }),
        expect.objectContaining({
          metric: "Disputed amount denominator",
          valueLabel: "9200.00"
        })
      ])
    );
    const costPerCaseMetric = model.unitEconomics.find((metric) => metric.metric === "Cost per case");
    expect(costPerCaseMetric?.recordIds).toEqual(expect.arrayContaining(["rollup-usage-1"]));
  });

  it("computes prompt-cache savings only when cached tokens and approved pricing exist", async () => {
    const model = await buildEvalFinopsCockpitModel({
      repository: repositoryFixture({
        pricing: [
          pricing({
            cachedInputPer1mTokens: "0.125",
            inputPer1mTokens: "1.250"
          })
        ],
        usageRuns: [
          usageRun({
            cachedInputTokens: 200_000,
            inputTokens: 1_000_000,
            outputTokens: 0,
            totalTokens: 1_000_000,
            uncachedInputTokens: 800_000
          })
        ]
      })
    });

    expect(model.promptCache).toMatchObject({
      cachedInputTokens: 200_000,
      cacheHitRateLabel: "20.0%",
      savingsLabel: "USD 0.2250",
      savingsStatus: "computed_from_owner_pricing",
      status: "active"
    });
  });

  it("uses stored eval gate rows when latest eval snapshots exist", async () => {
    const latestEvalRun: EvalGateRun = {
      completedAt: "2026-06-30T00:01:00.000Z",
      deterministicBasis: "release-readiness persisted snapshot",
      evalRunId: "eval-run-1",
      recordIds: ["cfg-run-control"],
      releaseStatus: "blocked",
      reportHash: "a".repeat(64),
      reportJson: { status: "blocked" },
      sourceMode: "live_supabase",
      startedAt: "2026-06-30T00:00:00.000Z"
    };
    const model = await buildEvalFinopsCockpitModel({
      repository: repositoryFixture({
        evalGateResults: [
          {
            blockerReason: "label manifest missing",
            deterministicBasis: "stored intent precision gate",
            evalGateResultId: "gate-result-1",
            evalRunId: "eval-run-1",
            gate: "intent-precision",
            openDependencies: ["release_eval_label_manifest"],
            recordIds: ["release-label-manifest"],
            status: "blocked"
          }
        ],
        latestEvalRun,
        usageRuns: [usageRun()]
      })
    });

    expect(model.releaseReadiness).toMatchObject({
      latestEvalRunId: "eval-run-1",
      status: "blocked"
    });
    expect(model.evalGates).toEqual([
      expect.objectContaining({
        deterministicBasis: "stored intent precision gate",
        gate: "intent-precision",
        status: "blocked"
      })
    ]);
    expect(model.provenance.recordIds).toEqual(expect.arrayContaining(["cfg-run-control", "release-label-manifest"]));
  });

  it("returns blocked inputs instead of throwing when repository feeds fail", async () => {
    const model = await buildEvalFinopsCockpitModel({
      repository: repositoryFixture({
        listAgentUsageRunsError: new Error("usage table unavailable"),
        listActiveModelPricingError: new Error("pricing table unavailable"),
        listDailyRollupsError: new Error("rollup table unavailable"),
        listOpenAiCostBucketsError: new Error("cost import unavailable"),
        listOpenRecommendationsError: new Error("recommendation table unavailable"),
        loadLatestEvalRunError: new Error("eval run table unavailable")
      })
    });

    expect(model.surface).toBe("evals-finops");
    expect(model.agentMetrics).toEqual([]);
    expect(model.blockedInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inputId: "recoup_agent_usage_runs",
          reason: "Source unavailable: typed agent usage rows could not be read."
        }),
        expect.objectContaining({
          inputId: "recoup_model_pricing",
          reason: "Owner-approved model pricing is unavailable."
        }),
        expect.objectContaining({
          inputId: "recoup_openai_cost_buckets",
          reason: "Trusted OpenAI provider cost import could not be read."
        }),
        expect.objectContaining({
          inputId: "recoup_eval_gate_runs",
          reason: "Stored eval run snapshots could not be read."
        }),
        expect.objectContaining({
          inputId: "recoup_finops_daily_rollups",
          reason: "FinOps daily rollups could not be read."
        }),
        expect.objectContaining({
          inputId: "recoup_finops_recommendations",
          reason: "Stored FinOps recommendations could not be read."
        })
      ])
    );
  });

  it("blocks release readiness when a stored eval snapshot exists but gate evidence cannot be read", async () => {
    const model = await buildEvalFinopsCockpitModel({
      repository: repositoryFixture({
        latestEvalRun: {
          completedAt: "2026-06-30T00:01:00.000Z",
          deterministicBasis: "release-readiness persisted snapshot",
          evalRunId: "eval-run-1",
          recordIds: ["cfg-run-control"],
          releaseStatus: "pass",
          reportHash: "a".repeat(64),
          reportJson: { status: "pass" },
          sourceMode: "live_supabase",
          startedAt: "2026-06-30T00:00:00.000Z"
        },
        listEvalGateResultsError: new Error("gate table unavailable"),
        usageRuns: [usageRun()]
      })
    });

    expect(model.releaseReadiness.status).toBe("blocked");
    expect(model.blockedInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inputId: "recoup_eval_gate_results",
          reason: "Stored eval gate results could not be read."
        })
      ])
    );
  });

  it("derives recommendations from failing gates, guardrail trips, and low cache reuse", async () => {
    const latestEvalRun: EvalGateRun = {
      completedAt: "2026-06-30T00:01:00.000Z",
      deterministicBasis: "release-readiness persisted snapshot",
      evalRunId: "eval-run-1",
      recordIds: ["cfg-run-control"],
      releaseStatus: "fail",
      reportHash: "a".repeat(64),
      reportJson: { status: "fail" },
      sourceMode: "live_supabase",
      startedAt: "2026-06-30T00:00:00.000Z"
    };
    const model = await buildEvalFinopsCockpitModel({
      repository: repositoryFixture({
        evalGateResults: [
          {
            blockerReason: "intent precision below threshold",
            deterministicBasis: "stored intent precision gate",
            evalGateResultId: "gate-result-1",
            evalRunId: "eval-run-1",
            gate: "intent-precision",
            openDependencies: [],
            recordIds: ["q1", "q2"],
            score: "0.82",
            status: "fail",
            threshold: "0.90"
          }
        ],
        latestEvalRun,
        pricing: [pricing()],
        usageRuns: [
          usageRun({
            cachedInputTokens: 0,
            guardrailTripCount: 2,
            inputTokens: 10_000,
            promptCacheKey: "recoup:v2:deduction-forensics:v1",
            promptPrefixVersion: "v1",
            totalTokens: 11_000
          })
        ]
      })
    });

    expect(model.recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recommendationId: "quality-gate-failed:intent-precision"
        }),
        expect.objectContaining({
          recommendationId: "guardrail-regression:Maya Forensics:maya_forensics_query"
        }),
        expect.objectContaining({
          recommendationId: "cache-opportunity:Maya Forensics:maya_forensics_query",
          requiresHumanApproval: true
        })
      ])
    );
    const failedGateRecommendation = model.recommendations.find(
      (recommendation) => recommendation.recommendationId === "quality-gate-failed:intent-precision"
    );
    const guardrailRecommendation = model.recommendations.find(
      (recommendation) => recommendation.recommendationId === "guardrail-regression:Maya Forensics:maya_forensics_query"
    );
    expect(failedGateRecommendation?.recordIds).toEqual(expect.arrayContaining(["q1", "q2"]));
    expect(guardrailRecommendation?.recordIds).toEqual(expect.arrayContaining(["usage-1"]));
  });
});

function repositoryFixture(input: {
  costBuckets?: OpenAiCostBucket[];
  dailyRollups?: FinopsDailyRollup[];
  evalGateResults?: Awaited<ReturnType<EvalsFinopsRepository["listEvalGateResults"]>>;
  listActiveModelPricingError?: Error;
  listAgentUsageRunsError?: Error;
  listDailyRollupsError?: Error;
  listEvalGateResultsError?: Error;
  listOpenAiCostBucketsError?: Error;
  listOpenRecommendationsError?: Error;
  latestEvalRun?: Awaited<ReturnType<EvalsFinopsRepository["loadLatestEvalRun"]>>;
  loadLatestEvalRunError?: Error;
  pricing?: ModelPricing[];
  recommendations?: FinopsRecommendation[];
  usageRuns?: AgentUsageRun[];
}): EvalsFinopsRepository {
  return {
    listActiveModelPricing: () =>
      input.listActiveModelPricingError === undefined ? Promise.resolve(input.pricing ?? []) : Promise.reject(input.listActiveModelPricingError),
    listAgentUsageRuns: () =>
      input.listAgentUsageRunsError === undefined ? Promise.resolve(input.usageRuns ?? [usageRun()]) : Promise.reject(input.listAgentUsageRunsError),
    listDailyRollups: () =>
      input.listDailyRollupsError === undefined ? Promise.resolve(input.dailyRollups ?? []) : Promise.reject(input.listDailyRollupsError),
    listEvalGateResults: () =>
      input.listEvalGateResultsError === undefined
        ? Promise.resolve(input.evalGateResults ?? [])
        : Promise.reject(input.listEvalGateResultsError),
    listOpenAiCostBuckets: () =>
      input.listOpenAiCostBucketsError === undefined ? Promise.resolve(input.costBuckets ?? []) : Promise.reject(input.listOpenAiCostBucketsError),
    listOpenRecommendations: () =>
      input.listOpenRecommendationsError === undefined
        ? Promise.resolve(input.recommendations ?? [])
        : Promise.reject(input.listOpenRecommendationsError),
    loadLatestEvalRun: () =>
      input.loadLatestEvalRunError === undefined ? Promise.resolve(input.latestEvalRun) : Promise.reject(input.loadLatestEvalRunError),
    upsertAgentUsageRun: () => Promise.resolve(),
    upsertEvalGateResults: () => Promise.resolve(),
    upsertEvalGateRun: () => Promise.resolve()
  };
}

function usageRun(overrides: Partial<AgentUsageRun> = {}): AgentUsageRun {
  return {
    agentName: "Maya Forensics",
    cachedInputTokens: 0,
    citedRecordIds: ["S3-L1"],
    correlationId: "corr-1",
    createdAt: "2026-06-30T00:00:00.000Z",
    deterministicBasis: "typed usage run fixture",
    guardrailTripCount: 1,
    handoffCount: 2,
    inputTokens: 1000,
    modelExecutionMode: "live_openai_agents",
    modelId: "gpt-5-mini",
    outputTokens: 500,
    reasoningTokens: 0,
    recordIds: ["usage-1", "S3-L1"],
    status: "succeeded",
    toolCallCount: 3,
    totalTokens: 1500,
    uncachedInputTokens: 1000,
    usageRunId: "usage-1",
    workflowName: "maya_forensics_query",
    ...overrides
  };
}

function pricing(overrides: Partial<ModelPricing> = {}): ModelPricing {
  return {
    active: true,
    approvedBy: "human:rathish-owner",
    cachedInputPer1mTokens: "0.000",
    currency: "USD",
    effectiveFrom: "2026-06-30T00:00:00.000Z",
    inputPer1mTokens: "0.000",
    modelId: "gpt-5-mini",
    outputPer1mTokens: "0.000",
    pricingHash: "b".repeat(64),
    pricingId: "pricing-1",
    reasoningPer1mTokens: "0.000",
    serviceTier: "default",
    ...overrides
  };
}

function costBucket(overrides: Partial<OpenAiCostBucket> = {}): OpenAiCostBucket {
  return {
    amount: "1.0000",
    bucketEnd: "2026-06-30T01:00:00.000Z",
    bucketStart: "2026-06-30T00:00:00.000Z",
    costBucketId: "bucket-1",
    currency: "USD",
    importedAt: "2026-06-30T01:05:00.000Z",
    lineItem: "model_usage",
    modelId: "gpt-5-mini",
    projectId: "proj-recoup",
    provenance: "openai_org_cost_api",
    sourceResponseHash: "c".repeat(64),
    ...overrides
  };
}

function dailyRollup(overrides: Partial<FinopsDailyRollup> = {}): FinopsDailyRollup {
  return {
    agentName: "Maya Forensics",
    approvedDraftCount: 0,
    blockedCount: 0,
    cachedInputTokens: 0,
    casesProcessedCount: 0,
    citedAnswerCount: 0,
    costStatus: "pricing_not_configured_not_computed",
    createdAt: "2026-06-30T02:00:00.000Z",
    deterministicBasis: "typed rollup fixture",
    disputedAmount: "0.00",
    failedCount: 0,
    inputTokens: 1000,
    modelId: "gpt-5-mini",
    outputTokens: 500,
    promptCacheSavingsStatus: "pricing_not_configured_not_computed",
    recordIds: ["rollup-1"],
    rollupDate: "2026-06-30",
    rollupId: "rollup-1",
    runCount: 1,
    succeededCount: 1,
    totalTokens: 1500,
    uncachedInputTokens: 1000,
    unitEconomics: {},
    workflowName: "maya_forensics_query",
    ...overrides
  };
}
