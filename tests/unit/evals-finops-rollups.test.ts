import { describe, expect, it } from "vitest";
import { buildFinopsDailyRollups } from "../../src/services/evalsFinopsRollups.js";
import type { AgentUsageRun, ModelPricing } from "../../src/services/evalsFinopsTypes.js";

describe("evals FinOps rollups", () => {
  it("aggregates daily usage by workflow, agent, and model with Decimal cost and prompt-cache savings", () => {
    const rollups = buildFinopsDailyRollups({
      pricingRows: [
        pricing({
          cachedInputPer1mTokens: "0.125",
          inputPer1mTokens: "1.250",
          outputPer1mTokens: "10.000",
          reasoningPer1mTokens: "0.000"
        })
      ],
      rollupDate: "2026-06-30",
      businessDenominators: [
        {
          agentName: "Maya Forensics",
          approvedDraftCount: 1,
          casesProcessedCount: 4,
          citedAnswerCount: 3,
          deterministicBasis: "recoup_deduction_lines plus approval audit receipts",
          disputedAmount: "9200.00",
          modelId: "gpt-5-mini",
          recordIds: ["S3-L1", "approval-1"],
          workflowName: "maya_forensics_query"
        }
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
    });

    expect(rollups).toEqual([
      expect.objectContaining({
        approvedDraftCount: 1,
        cachedInputTokens: 200_000,
        casesProcessedCount: 4,
        computedCostAmount: "2.0250",
        computedCostCurrency: "USD",
        costStatus: "computed_from_owner_pricing",
        disputedAmount: "9200.00",
        promptCacheHitRate: "0.2000",
        promptCacheSavingsAmount: "0.2250",
        promptCacheSavingsCurrency: "USD",
        promptCacheSavingsStatus: "computed_from_owner_pricing",
        recordIds: ["usage-1", "S3-L1", "approval-1"],
        runCount: 1,
        rollupDate: "2026-06-30"
      })
    ]);
  });

  it("blocks cost and savings when pricing for an observed model is missing", () => {
    const rollups = buildFinopsDailyRollups({
      pricingRows: [],
      rollupDate: "2026-06-30",
      businessDenominators: [
        {
          agentName: "Maya Forensics",
          approvedDraftCount: 0,
          casesProcessedCount: 1,
          citedAnswerCount: 1,
          deterministicBasis: "recoup_deduction_lines without approved draft receipts",
          disputedAmount: "125.00",
          modelId: "gpt-5-mini",
          recordIds: ["S3-L1"],
          workflowName: "maya_forensics_query"
        }
      ],
      usageRuns: [
        usageRun({
          cachedInputTokens: 100,
          inputTokens: 1000,
          totalTokens: 1500,
          uncachedInputTokens: 900
        })
      ]
    });

    expect(rollups).toEqual([
      expect.objectContaining({
        costStatus: "pricing_not_configured_not_computed",
        promptCacheHitRate: "0.1000",
        promptCacheSavingsStatus: "pricing_not_configured_not_computed"
      })
    ]);
    expect(rollups[0]).not.toHaveProperty("computedCostAmount");
    expect(rollups[0]).not.toHaveProperty("computedCostCurrency");
    expect(rollups[0]).not.toHaveProperty("promptCacheSavingsAmount");
  });

  it("does not emit a daily rollup when business denominator sources are unavailable", () => {
    const rollups = buildFinopsDailyRollups({
      businessDenominators: [],
      pricingRows: [pricing()],
      rollupDate: "2026-06-30",
      usageRuns: [usageRun()]
    });

    expect(rollups).toEqual([]);
  });

  it("does not emit a daily rollup when source record IDs are whitespace only", () => {
    const rollups = buildFinopsDailyRollups({
      businessDenominators: [
        {
          agentName: "Maya Forensics",
          approvedDraftCount: 1,
          casesProcessedCount: 1,
          citedAnswerCount: 1,
          deterministicBasis: "business denominator without usable evidence IDs",
          disputedAmount: "125.00",
          modelId: "gpt-5-mini",
          recordIds: [" "],
          workflowName: "maya_forensics_query"
        }
      ],
      pricingRows: [pricing()],
      rollupDate: "2026-06-30",
      usageRuns: [usageRun({ recordIds: [" "] })]
    });

    expect(rollups).toEqual([]);
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
