import { describe, expect, it } from "vitest";
import { buildEvalsFinopsRecommendations } from "../../src/services/evalsFinopsRecommendations.js";
import type { AgentUsageRun, ModelPricing } from "../../src/services/evalsFinopsTypes.js";

describe("evals FinOps recommendations", () => {
  it("emits deterministic actions with evidence for quality, pricing, cache, guardrail, and batch candidates", () => {
    const recommendations = buildEvalsFinopsRecommendations({
      evalGates: [
        {
          deterministicBasis: "stored intent precision gate",
          gate: "intent-precision",
          recordIds: ["q1", "q2"],
          scoreLabel: "0.8200",
          status: "fail",
          thresholdLabel: "0.9000"
        }
      ],
      labelManifestBlocked: true,
      hasTrustedCostBucket: false,
      pricingRows: [pricing({ modelId: "gpt-5-mini" })],
      promptCache: {
        cachedInputTokens: 150,
        savingsStatus: "pricing_not_configured_not_computed",
        status: "pricing_not_configured_not_computed"
      },
      requestReductionSignals: [
        {
          deterministicBasis: "duplicate deterministic basis and record IDs observed",
          recordIds: ["usage-1", "usage-repeat"],
          signalId: "maya-repeat"
        }
      ],
      outputBudgetSignals: [
        {
          agentName: "Maya Forensics",
          deterministicBasis: "owner-approved output budget exceeded",
          recordIds: ["usage-1"],
          workflowName: "maya_forensics_query"
        }
      ],
      contextPruningSignals: [
        {
          agentName: "Maya Forensics",
          deterministicBasis: "input tokens per cited answer rose without more citations",
          recordIds: ["usage-1"],
          workflowName: "maya_forensics_query"
        }
      ],
      modelRoutingSignals: [
        {
          deterministicBasis: "lower-cost pinned model passed the same eval gate",
          fromModelId: "gpt-5-mini",
          recordIds: ["gate-route-proof"],
          toModelId: "gpt-5-nano",
          workflowName: "release_readiness"
        }
      ],
      tokenBudgetSignals: [
        {
          agentName: "Maya Forensics",
          budgetTokens: 10_000,
          deterministicBasis: "run-control budget usage is above eighty percent",
          recordIds: ["run-control-budget", "usage-1"],
          usedTokens: 8_500,
          workflowName: "maya_forensics_query"
        }
      ],
      toolSchemaSignals: [
        {
          deterministicBasis: "unused optional tool fields observed across eval traces",
          recordIds: ["tool-schema-proof"],
          toolName: "evidence_pack"
        }
      ],
      unitEconomicsSignals: [
        {
          deterministicBasis: "cost per approved draft rose while approval rate fell",
          recordIds: ["rollup-current", "rollup-prior"],
          workflowName: "maya_forensics_query"
        }
      ],
      usageRuns: [
        usageRun({
          guardrailTripCount: 2,
          inputTokens: 10_000,
          modelId: "gpt-5-mini",
          promptCacheKey: "recoup:v2:deduction-forensics:v1",
          promptPrefixVersion: "v1",
          workflowName: "release_readiness"
        }),
        usageRun({
          modelId: "gpt-5-nano",
          recordIds: ["usage-unpriced"],
          usageRunId: "usage-unpriced"
        })
      ]
    });

    expect(recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deterministicBasis: "quality-gate-failed",
          recommendationId: "quality-gate-failed:intent-precision"
        }),
        expect.objectContaining({
          deterministicBasis: "eval-labels-missing",
          recommendationId: "eval-labels-missing",
          requiresHumanApproval: true
        }),
        expect.objectContaining({
          deterministicBasis: "pricing-missing-for-observed-model",
          recommendationId: "pricing-missing:gpt-5-nano",
          requiresHumanApproval: true
        }),
        expect.objectContaining({
          deterministicBasis: "guardrail-regression",
          recommendationId: "guardrail-regression:Maya Forensics:release_readiness"
        }),
        expect.objectContaining({
          deterministicBasis: "cache-opportunity",
          recommendationId: "cache-opportunity:Maya Forensics:release_readiness",
          requiresHumanApproval: true
        }),
        expect.objectContaining({
          deterministicBasis: "batch-eval-candidate",
          recommendationId: "batch-eval-candidate:release_readiness",
          requiresHumanApproval: true
        }),
        expect.objectContaining({
          deterministicBasis: "budget-near-limit",
          recommendationId: "budget-near-limit:Maya Forensics:maya_forensics_query"
        }),
        expect.objectContaining({
          deterministicBasis: "cache-savings-visible-without-pricing",
          recommendationId: "cache-savings-pricing-blocked"
        }),
        expect.objectContaining({
          deterministicBasis: "request-reduction-opportunity",
          recommendationId: "request-reduction-opportunity:maya-repeat"
        }),
        expect.objectContaining({
          deterministicBasis: "output-budget-opportunity",
          recommendationId: "output-budget-opportunity:Maya Forensics:maya_forensics_query"
        }),
        expect.objectContaining({
          deterministicBasis: "context-pruning-opportunity",
          recommendationId: "context-pruning-opportunity:Maya Forensics:maya_forensics_query"
        }),
        expect.objectContaining({
          deterministicBasis: "model-routing-opportunity",
          recommendationId: "model-routing-opportunity:release_readiness:gpt-5-mini-to-gpt-5-nano"
        }),
        expect.objectContaining({
          deterministicBasis: "tool-schema-opportunity",
          recommendationId: "tool-schema-opportunity:evidence_pack"
        }),
        expect.objectContaining({
          deterministicBasis: "unit-economics-regression",
          recommendationId: "unit-economics-regression:maya_forensics_query"
        })
      ])
    );
    const failedGateRecommendation = recommendations.find(
      (recommendation) => recommendation.recommendationId === "quality-gate-failed:intent-precision"
    );
    const pricingRecommendation = recommendations.find(
      (recommendation) => recommendation.recommendationId === "pricing-missing:gpt-5-nano"
    );
    expect(failedGateRecommendation?.recordIds).toEqual(expect.arrayContaining(["q1", "q2"]));
    expect(pricingRecommendation?.recordIds).toEqual(expect.arrayContaining(["usage-unpriced"]));
    expect(recommendations.every((recommendation) => recommendation.recordIds.length > 0)).toBe(true);
  });

  it("suppresses pricing-missing recommendations when trusted provider cost buckets are available", () => {
    const recommendations = buildEvalsFinopsRecommendations({
      evalGates: [],
      hasTrustedCostBucket: true,
      labelManifestBlocked: false,
      pricingRows: [],
      usageRuns: [usageRun({ modelId: "gpt-5-nano", recordIds: ["usage-unpriced"] })]
    });

    expect(recommendations.some((recommendation) => recommendation.recommendationId.startsWith("pricing-missing"))).toBe(false);
  });

  it("does not treat whitespace-only record IDs as recommendation evidence", () => {
    const recommendations = buildEvalsFinopsRecommendations({
      evalGates: [
        {
          deterministicBasis: "stored gate",
          gate: "intent-precision",
          recordIds: [" ", "\t"],
          scoreLabel: "0.8200",
          status: "fail",
          thresholdLabel: "0.9000"
        }
      ],
      hasTrustedCostBucket: true,
      labelManifestBlocked: false,
      pricingRows: [pricing()],
      tokenBudgetSignals: [
        {
          agentName: "Maya Forensics",
          budgetTokens: 10_000,
          deterministicBasis: "budget signal without usable evidence IDs",
          recordIds: [" "],
          usedTokens: 9_000,
          workflowName: "maya_forensics_query"
        }
      ],
      usageRuns: [usageRun({ recordIds: [" ", "usage-1 "] })]
    });

    expect(recommendations.some((recommendation) => recommendation.recordIds.some((recordId) => recordId.trim().length === 0))).toBe(false);
    expect(recommendations.some((recommendation) => recommendation.recommendationId === "quality-gate-failed:intent-precision")).toBe(
      false
    );
  });
});

function usageRun(overrides: Partial<AgentUsageRun> = {}): AgentUsageRun {
  return {
    agentName: "Maya Forensics",
    cachedInputTokens: 0,
    citedRecordIds: ["S3-L1"],
    correlationId: "corr-1",
    createdAt: "2026-06-30T00:00:00.000Z",
    deterministicBasis: "typed usage run fixture",
    guardrailTripCount: 0,
    handoffCount: 1,
    inputTokens: 1000,
    modelExecutionMode: "live_openai_agents",
    modelId: "gpt-5-mini",
    outputTokens: 500,
    reasoningTokens: 0,
    recordIds: ["usage-1", "S3-L1"],
    status: "succeeded",
    toolCallCount: 2,
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
