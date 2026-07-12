import { describe, expect, it } from "vitest";
import type { EvalsFinopsRepository } from "../../src/services/evalsFinopsRepository.js";
import {
  buildEvalFinopsCockpitModel,
  buildPersonaFinopsCockpitModel as buildPersonaFinopsCockpitModelRaw,
  personaFinopsWorkflowScopes
} from "../../src/services/evalsFinopsModel.js";
import type {
  AgentUsageRun,
  EvalGateRun,
  FinopsDailyRollup,
  FinopsRecommendation,
  ModelPricing,
  OpenAiCostBucket
} from "../../src/services/evalsFinopsTypes.js";

const personaPeriod = { fromIso: "2026-06-01T00:00:00.000Z", toIso: "2026-08-01T00:00:00.000Z" };
function buildPersonaFinopsCockpitModel(
  input: Omit<Parameters<typeof buildPersonaFinopsCockpitModelRaw>[0], "period">
) {
  return buildPersonaFinopsCockpitModelRaw({ ...input, period: personaPeriod });
}

describe("evals FinOps cockpit model", () => {
  it("preserves the CFO model while persona models filter exact workflows before aggregation", async () => {
    const mayaRun = usageRun({ recordIds: ["maya-only"], usageRunId: "maya-run" });
    const davidRun = usageRun({
      agentName: "David Credit Risk",
      participatingAgentNames: ["David Credit Risk", "Credit Sentinel", "Action Packet Drafter"],
      recordIds: ["david-only"],
      usageRunId: "david-run",
      workflowName: "credit_risk"
    });
    const repository = repositoryFixture({ usageRuns: [mayaRun, davidRun] });

    const [cfo, maya, david] = await Promise.all([
      buildEvalFinopsCockpitModel({ repository }),
      buildPersonaFinopsCockpitModel({ persona: "maya", repository }),
      buildPersonaFinopsCockpitModel({ persona: "david", repository })
    ]);

    expect(personaFinopsWorkflowScopes).toEqual({
      cfo: ["credit_risk", "maya_forensics_query"],
      david: ["credit_risk"],
      maya: ["maya_forensics_query"]
    });
    expect(cfo.agentMetrics.map((metric) => metric.workflowName)).toEqual(["maya_forensics_query", "credit_risk"]);
    expect(maya.workflowMetrics).toEqual([expect.objectContaining({ recordIds: ["maya-only"], workflowName: "maya_forensics_query" })]);
    expect(david.workflowMetrics).toEqual([expect.objectContaining({
      participatingAgentNames: ["David Credit Risk", "Credit Sentinel", "Action Packet Drafter"],
      recordIds: ["david-only"],
      workflowLabel: "David Credit Risk",
      workflowName: "credit_risk"
    })]);
    expect(JSON.stringify(maya)).not.toContain("david-only");
    expect(JSON.stringify(david)).not.toContain("maya-only");
  });

  it("builds workflow KPIs, daily cache trend, and evidence-backed persona recommendations on the backend", async () => {
    const first = usageRun({
      agentName: "Credit Sentinel",
      cachedInputTokens: 400,
      createdAt: "2026-06-30T10:00:00.000Z",
      inputTokens: 1000,
      latencyMs: 120,
      participatingAgentNames: ["Credit Sentinel"],
      recordIds: ["usage-1", "credit-record-1"],
      serviceTier: "default",
      sourceReceiptId: "receipt-1",
      status: "succeeded",
      uncachedInputTokens: 600,
      usageRunId: "usage-1",
      workflowName: "credit_risk"
    });
    const second = usageRun({
      agentName: "Action Packet Drafter",
      cachedInputTokens: 200,
      citedRecordIds: [],
      createdAt: "2026-07-01T10:00:00.000Z",
      inputTokens: 1000,
      latencyMs: 240,
      participatingAgentNames: ["Action Packet Drafter"],
      recordIds: ["usage-2", "credit-record-2"],
      serviceTier: "default",
      sourceReceiptId: "receipt-2",
      status: "blocked",
      uncachedInputTokens: 800,
      usageRunId: "usage-2",
      workflowName: "credit_risk"
    });
    const recommendation: FinopsRecommendation = {
      recommendationId: "recommendation-1",
      recommendationType: "prompt_cache",
      severity: "important",
      status: "open",
      title: "Review stable prefix",
      recommendedAction: "Inspect the governed prompt prefix before changing it.",
      affectedWorkflowName: "credit_risk",
      expectedImpact: {},
      evidenceRecordIds: ["receipt-1"],
      deterministicBasis: "Observed cache utilization in typed receipts.",
      requiresHumanApproval: true,
      createdAt: "2026-07-01T11:00:00.000Z"
    };
    const model = await buildPersonaFinopsCockpitModel({
      persona: "david",
      repository: repositoryFixture({ pricing: [pricing()], recommendations: [recommendation], usageRuns: [first, second] })
    });

    expect(model.period).toEqual({ fromIso: personaPeriod.fromIso, toIso: personaPeriod.toIso });
    expect(model.sourceAsOf).toEqual({ pricingIso: "2026-06-30T00:00:00.000Z", recommendationsIso: "2026-07-01T11:00:00.000Z", usageIso: "2026-07-01T10:00:00.000Z" });
    expect(model.summary).toMatchObject({
      cacheHitRateLabel: "30.0%",
      costPerOutcomeLabel: "Requires verified outcomes",
      latencyP95Label: "240 ms",
      runCount: 2,
      tokensPerRunLabel: "1,500"
    });
    expect(model.freshnessStatus).toBe("stale");
    expect(model.blockedInputs.find((input) => input.inputId === "freshness_threshold")).toBeUndefined();
    expect(model.workflowMetrics).toHaveLength(1);
    expect(model.workflowMetrics[0]).toMatchObject({
      citedAnswerRateLabel: "50.0%",
      humanReviewRateLabel: "Unavailable",
      participatingAgentNames: ["Credit Sentinel", "Action Packet Drafter"],
      successRateLabel: "50.0%",
      tokensPerRunLabel: "1,500",
      toolCallsPerRunLabel: "3.0",
      workflowLabel: "David Credit Risk"
    });
    expect(model.dailyTrend).toEqual([
      expect.objectContaining({ cachedInputTokens: 400, date: "2026-06-30", totalTokens: 1500 }),
      expect.objectContaining({ cachedInputTokens: 200, date: "2026-07-01", totalTokens: 1500 })
    ]);
    expect(model.recommendations).toEqual([expect.objectContaining({ recommendationId: "recommendation-1", recordIds: ["receipt-1"] })]);
  });

  it("does not equate a blocked run with human review", async () => {
    const model = await buildPersonaFinopsCockpitModel({
      persona: "maya",
      repository: repositoryFixture({ usageRuns: [usageRun({ status: "blocked" })] })
    });
    expect(model.workflowMetrics[0]?.humanReviewRateLabel).toBe("Unavailable");
  });

  it("fails pricing closed when provider provenance is incomplete", async () => {
    const incompletePricing = { ...pricing() };
    delete incompletePricing.providerSourceUrl;
    delete incompletePricing.sourceRetrievedAt;
    const model = await buildPersonaFinopsCockpitModel({
      persona: "maya",
      repository: repositoryFixture({
        pricing: [incompletePricing],
        usageRuns: [usageRun({ serviceTier: "default" })]
      })
    });
    expect(model.workflowMetrics[0]).toMatchObject({
      costStatus: "pricing_not_configured_not_computed",
      costUnavailableReason: "pricing_provenance_incomplete",
      pricingProvenance: []
    });
  });

  it("filters recommendations to the selected half-open period", async () => {
    const model = await buildPersonaFinopsCockpitModel({
      persona: "maya",
      repository: repositoryFixture({
        recommendations: [
          recommendation({ createdAt: "2026-05-31T23:59:59.999Z", recommendationId: "before" }),
          recommendation({ createdAt: personaPeriod.fromIso, recommendationId: "at-from" }),
          recommendation({ createdAt: personaPeriod.toIso, recommendationId: "at-to" })
        ]
      })
    });

    expect(model.recommendations.map((item) => item.recommendationId)).toEqual(["at-from"]);
    expect(model.sourceAsOf.recommendationsIso).toBe(personaPeriod.fromIso);
  });

  it("suppresses receipt rows without record IDs and exposes the fail-closed reason", async () => {
    const model = await buildPersonaFinopsCockpitModel({
      persona: "maya",
      repository: repositoryFixture({ usageRuns: [usageRun({ recordIds: [] })] })
    });

    expect(model.workflowMetrics).toEqual([]);
    const recordIdBlock = model.blockedInputs.find((input) => input.inputId === "record_ids");
    expect(recordIdBlock?.reason).toContain("suppressed");
  });

  it("suppresses inconsistent token breakdowns instead of estimating them", async () => {
    const model = await buildPersonaFinopsCockpitModel({
      persona: "maya",
      repository: repositoryFixture({ usageRuns: [usageRun({ cachedInputTokens: 1, inputTokens: 1000, uncachedInputTokens: 1000 })] })
    });

    expect(model.workflowMetrics).toEqual([]);
    expect(model.blockedInputs.find((input) => input.inputId === "token_breakdown")?.reason).toContain("suppressed");
  });

  it("exposes persona token components and returns unavailable cost for missing or ambiguous pricing", async () => {
    const run = usageRun({
      cachedInputTokens: 0,
      guardrailTripCount: 0,
      guardrailTripCountStatus: "unavailable",
      reasoningTokens: 0,
      reasoningTokensStatus: "unavailable",
      recordIds: ["maya-run-zero-valid"],
      uncachedInputTokens: 1000
    });
    const duplicatePricing = [pricing({ pricingId: "price-a" }), pricing({ pricingId: "price-b" })];

    const missing = await buildPersonaFinopsCockpitModel({
      persona: "maya",
      repository: repositoryFixture({ pricing: [], usageRuns: [run] })
    });
    const ambiguous = await buildPersonaFinopsCockpitModel({
      persona: "maya",
      repository: repositoryFixture({ pricing: duplicatePricing, usageRuns: [run] })
    });

    for (const model of [missing, ambiguous]) {
      expect(model.workflowMetrics).toEqual([
        expect.objectContaining({
          cachedInputTokens: 0,
          costStatus: "pricing_not_configured_not_computed",
          deterministicBasis: "typed usage run fixture",
          inputTokens: 1000,
          modelId: "gpt-5-mini",
          outputTokens: 500,
          reasoningTokens: 0,
          reasoningTokensStatus: "unavailable",
          guardrailTripCountStatus: "unavailable",
          recordIds: ["maya-run-zero-valid"],
          uncachedInputTokens: 1000
        })
      ]);
      expect(model.workflowMetrics[0]).not.toHaveProperty("computedCostAmount");
      expect(JSON.stringify(model)).not.toContain("$0");
    }
  });

  it("keeps provider-observed reasoning and guardrail counts distinct from unavailable sentinels", async () => {
    const model = await buildPersonaFinopsCockpitModel({
      persona: "maya",
      repository: repositoryFixture({
        usageRuns: [usageRun({ guardrailTripCount: 0, guardrailTripCountStatus: "observed", reasoningTokens: 25, reasoningTokensStatus: "observed" })]
      })
    });

    expect(model.workflowMetrics[0]).toMatchObject({
      guardrailTripCount: 0,
      guardrailTripCountStatus: "observed",
      reasoningTokens: 25,
      reasoningTokensStatus: "observed"
    });
  });

  it("prices each live run at its effective default-tier interval and treats effectiveTo as exclusive", async () => {
    const beforeBoundary = usageRun({
      createdAt: "2026-06-30T23:59:59.999Z",
      inputTokens: 1_000_000,
      outputTokens: 0,
      recordIds: ["run-before"],
      sourceReceiptId: "receipt-before",
      serviceTier: "default",
      totalTokens: 1_000_000,
      uncachedInputTokens: 1_000_000,
      usageRunId: "run-before"
    });
    const atBoundary = usageRun({
      createdAt: "2026-07-01T00:00:00.000Z",
      inputTokens: 1_000_000,
      outputTokens: 0,
      recordIds: ["run-at"],
      sourceReceiptId: "receipt-at",
      serviceTier: "default",
      totalTokens: 1_000_000,
      uncachedInputTokens: 1_000_000,
      usageRunId: "run-at"
    });
    const model = await buildPersonaFinopsCockpitModel({
      persona: "maya",
      repository: repositoryFixture({
        pricing: [
          pricing({
            active: false,
            effectiveFrom: "2026-06-01T00:00:00.000Z",
            effectiveTo: "2026-07-01T00:00:00.000Z",
            inputPer1mTokens: "1.00",
            pricingHash: "a".repeat(64),
            pricingId: "price-june"
          }),
          pricing({
            effectiveFrom: "2026-07-01T00:00:00.000Z",
            inputPer1mTokens: "2.00",
            pricingHash: "b".repeat(64),
            pricingId: "price-july"
          })
        ],
        usageRuns: [beforeBoundary, atBoundary]
      })
    });

    expect(model.workflowMetrics[0]).toMatchObject({
      computedCostAmount: "3.0000",
      computedCostCurrency: "USD",
      costCalculationBasis:
        "Sum per run: (uncached input * input price + cached input * cached price + max(output - reasoning, 0) * output price + reasoning * reasoning price) / 1,000,000 using effective default-tier pricing price-june, price-july.",
      costStatus: "computed_from_owner_pricing",
      pricingProvenance: [
        { pricingHash: "a".repeat(64), pricingId: "price-june" },
        { pricingHash: "b".repeat(64), pricingId: "price-july" }
      ],
      sourceReceiptIds: ["receipt-before", "receipt-at"],
      usageRunIds: ["run-before", "run-at"]
    });
  });

  it("fails cost closed when effective pricing overlaps or execution mode is unsupported", async () => {
    const overlapping = [
      pricing({ effectiveFrom: "2026-06-01T00:00:00.000Z", pricingId: "price-a" }),
      pricing({ active: false, effectiveFrom: "2026-06-15T00:00:00.000Z", pricingId: "price-b" })
    ];
    const overlapModel = await buildPersonaFinopsCockpitModel({
      persona: "maya",
      repository: repositoryFixture({ pricing: overlapping })
    });
    const unsupportedModel = await buildPersonaFinopsCockpitModel({
      persona: "maya",
      repository: repositoryFixture({
        pricing: [pricing()],
        usageRuns: [usageRun({ modelExecutionMode: "fixture" })]
      })
    });

    for (const model of [overlapModel, unsupportedModel]) {
      expect(model.workflowMetrics[0]).toMatchObject({ costStatus: "pricing_not_configured_not_computed" });
      expect(model.workflowMetrics[0]).not.toHaveProperty("computedCostAmount");
      expect(model.workflowMetrics[0]?.pricingProvenance).toEqual([]);
    }
  });

  it("fails historical unknown and mismatched service tiers closed", async () => {
    const historicalUnknown = await buildPersonaFinopsCockpitModel({
      persona: "maya",
      repository: repositoryFixture({ pricing: [pricing()], usageRuns: [usageRun()] })
    });
    const mismatched = await Promise.all(
      (["flex", "priority"] as const).map((serviceTier) =>
        buildPersonaFinopsCockpitModel({
          persona: "maya",
          repository: repositoryFixture({ pricing: [pricing()], usageRuns: [usageRun({ serviceTier })] })
        })
      )
    );

    for (const model of [historicalUnknown, ...mismatched]) {
      expect(model.workflowMetrics[0]).toMatchObject({ costStatus: "pricing_not_configured_not_computed" });
      expect(model.workflowMetrics[0]).not.toHaveProperty("computedCostAmount");
    }
  });

  it("reports the matched flex tier and keeps mixed tiers in separate agent rows", async () => {
    const defaultRun = usageRun({
      recordIds: ["default-run"],
      serviceTier: "default",
      usageRunId: "default-run"
    });
    const flexRun = usageRun({
      recordIds: ["flex-run"],
      serviceTier: "flex",
      usageRunId: "flex-run"
    });
    const model = await buildPersonaFinopsCockpitModel({
      persona: "maya",
      repository: repositoryFixture({
        pricing: [
          pricing({ pricingHash: "d".repeat(64), pricingId: "price-default", serviceTier: "default" }),
          pricing({ pricingHash: "f".repeat(64), pricingId: "price-flex", serviceTier: "flex" })
        ],
        usageRuns: [defaultRun, flexRun]
      })
    });

    expect(model.workflowMetrics).toHaveLength(2);
    const flexMetric = model.workflowMetrics.find((metric) => metric.serviceTier === "flex");
    expect(flexMetric).toMatchObject({
      costCalculationBasis:
        "Sum per run: (uncached input * input price + cached input * cached price + max(output - reasoning, 0) * output price + reasoning * reasoning price) / 1,000,000 using effective flex-tier pricing price-flex.",
      costStatus: "computed_from_owner_pricing",
      pricingProvenance: [
        { pricingHash: "f".repeat(64), pricingId: "price-flex", serviceTier: "flex" }
      ],
      recordIds: ["flex-run"],
      serviceTier: "flex",
      usageRunIds: ["flex-run"]
    });
    expect(model.workflowMetrics.find((metric) => metric.serviceTier === "default")?.recordIds).toEqual(["default-run"]);
  });

  it("requests only the persona workflows and requested period from the repository", async () => {
    const calls: unknown[] = [];
    const repository = repositoryFixture({ usageRuns: [] });
    repository.listAgentUsageRuns = (filter) => {
      calls.push(filter);
      return Promise.resolve([]);
    };

    await buildPersonaFinopsCockpitModelRaw({ persona: "maya", period: personaPeriod, repository });

    expect(calls).toEqual([
      { fromIso: personaPeriod.fromIso, toIso: personaPeriod.toIso, workflowNames: ["maya_forensics_query"] }
    ]);
  });

  it("conserves output tokens when reasoning is included in top-level output", async () => {
    const model = await buildPersonaFinopsCockpitModel({
      persona: "maya",
      repository: repositoryFixture({
        pricing: [
          pricing({ inputPer1mTokens: "0", outputPer1mTokens: "10", reasoningPer1mTokens: "20" })
        ],
        usageRuns: [
          usageRun({
            inputTokens: 0,
            outputTokens: 1_000_000,
            reasoningTokens: 250_000,
            serviceTier: "default",
            totalTokens: 1_000_000,
            uncachedInputTokens: 0
          })
        ]
      })
    });

    expect(model.workflowMetrics[0]).toMatchObject({
      computedCostAmount: "12.5000",
      costCalculationBasis:
        "Sum per run: (uncached input * input price + cached input * cached price + max(output - reasoning, 0) * output price + reasoning * reasoning price) / 1,000,000 using effective default-tier pricing pricing-1.",
      outputTokens: 1_000_000,
      reasoningTokens: 250_000
    });
    expect(model.workflowMetrics[0]?.pricingProvenance).toEqual([
      expect.objectContaining({
        cachedInputPer1mTokens: "0.000",
        currency: "USD",
        effectiveFrom: "2026-06-30T00:00:00.000Z",
        inputPer1mTokens: "0",
        outputPer1mTokens: "10",
        pricingHash: "b".repeat(64),
        pricingId: "pricing-1",
        reasoningPer1mTokens: "20",
        serviceTier: "default"
      })
    ]);
  });

  it("distinguishes repository failures from genuine empty persona sources", async () => {
    const failed = await buildPersonaFinopsCockpitModel({
      persona: "maya",
      repository: repositoryFixture({
        listActiveModelPricingError: new Error("pricing unavailable"),
        listAgentUsageRunsError: new Error("usage unavailable")
      })
    });
    const empty = await buildPersonaFinopsCockpitModel({
      persona: "maya",
      repository: repositoryFixture({ pricing: [], usageRuns: [] })
    });

    expect(failed.sourceStatus).toEqual({ pricing: "unavailable", recommendations: "available", usage: "unavailable" });
    expect(failed.blockedInputs).toEqual([
      expect.objectContaining({ inputId: "recoup_agent_usage_runs", reason: "Agent usage source read failed." }),
      expect.objectContaining({ inputId: "recoup_model_pricing", reason: "Model pricing source read failed." })
    ]);
    expect(failed.freshnessStatus).toBe("unavailable");
    expect(empty.sourceStatus).toEqual({ pricing: "available", recommendations: "available", usage: "available" });
    expect(empty.blockedInputs).toEqual([]);
    expect(empty.freshnessStatus).toBe("unavailable");
  });

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
    listModelPricingForPeriod: () =>
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
    providerSourceUrl: "https://openai.com/api/pricing/",
    reasoningPer1mTokens: "0.000",
    serviceTier: "default",
    sourceRetrievedAt: "2026-06-30T00:00:00.000Z",
    ...overrides
  };
}

function recommendation(overrides: Partial<FinopsRecommendation> = {}): FinopsRecommendation {
  return {
    recommendationId: "recommendation-1",
    recommendationType: "prompt_cache",
    severity: "important",
    status: "open",
    title: "Review stable prefix",
    recommendedAction: "Inspect the governed prompt prefix before changing it.",
    affectedWorkflowName: "maya_forensics_query",
    expectedImpact: {},
    evidenceRecordIds: ["receipt-1"],
    deterministicBasis: "Observed cache utilization in typed receipts.",
    requiresHumanApproval: true,
    createdAt: "2026-07-01T11:00:00.000Z",
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
