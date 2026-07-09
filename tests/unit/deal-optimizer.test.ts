import { describe, expect, it } from "vitest";
import { creditNegotiationPolicyCandidateRows } from "../../src/services/creditNegotiationPolicy.js";
import { buildDealOptimizerModel } from "../../src/services/dealOptimizer.js";
import { loadCreditRiskFixtureRows } from "./fixtures/creditRiskFixture.js";

const simRows = {
  candidateStructures: [
    {
      candidateId: "partial-release-55",
      collateralRatio: "1.00",
      depositPct: "25",
      financingSpreadBps: "200",
      releasePct: "55",
      sourceRecordIds: ["credit_deal_candidate_grid:partial-release-55"],
      trancheCount: 2
    },
    {
      candidateId: "max-release-85",
      collateralRatio: "1.25",
      depositPct: "60",
      financingSpreadBps: "100",
      releasePct: "85",
      sourceRecordIds: ["credit_deal_candidate_grid:max-release-85"],
      trancheCount: 3
    },
    {
      candidateId: "low-release-10",
      collateralRatio: "0.75",
      depositPct: "0",
      financingSpreadBps: "500",
      releasePct: "10",
      sourceRecordIds: ["credit_deal_candidate_grid:low-release-10"],
      trancheCount: 1
    },
    {
      candidateId: "invalid-deposit-95",
      collateralRatio: "1.00",
      depositPct: "95",
      financingSpreadBps: "200",
      releasePct: "55",
      sourceRecordIds: ["credit_deal_candidate_grid:invalid-deposit-95"],
      trancheCount: 2
    }
  ],
  costOfCapital: [
    {
      accountId: "ACC-HAR",
      annualBps: "900",
      sourceRecordIds: ["sim_cost_of_capital:ACC-HAR:2026-01"]
    }
  ],
  inventory: [
    {
      holdingCostPerUnitPerDay: "0.75",
      holdingDays: 30,
      orderId: "ORD-HARBOR-6534",
      scenarioId: "base-sellthrough",
      sourceRecordIds: ["sim_3pl_inventory:ORD-HARBOR-6534:base"]
    },
    {
      holdingCostPerUnitPerDay: "0.75",
      holdingDays: 21,
      orderId: "ORD-HARBOR-6534",
      scenarioId: "upside-sellthrough",
      sourceRecordIds: ["sim_3pl_inventory:ORD-HARBOR-6534:upside"]
    }
  ],
  orders: [
    {
      accountId: "ACC-HAR",
      grossMarginPct: "0.18",
      orderAmount: "640010.00",
      orderId: "ORD-HARBOR-6534",
      sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"],
      units: "1000"
    }
  ],
  posSellthrough: [
    {
      orderId: "ORD-HARBOR-6534",
      probability: "0.60",
      scenarioId: "base-sellthrough",
      sellThroughPct: "0.80",
      sourceRecordIds: ["sim_pos_sellthrough:ORD-HARBOR-6534:base"]
    },
    {
      orderId: "ORD-HARBOR-6534",
      probability: "0.40",
      scenarioId: "upside-sellthrough",
      sellThroughPct: "0.95",
      sourceRecordIds: ["sim_pos_sellthrough:ORD-HARBOR-6534:upside"]
    }
  ]
} as const;

describe("deal optimizer", () => {
  it("ranks valid deal candidates deterministically and rejects out-of-policy structures", () => {
    const model = buildDealOptimizerModel({
      creditRiskRows: loadCreditRiskFixtureRows(),
      orderId: "ORD-HARBOR-6534",
      policyRows: creditNegotiationPolicyCandidateRows,
      seed: 42,
      simRows
    });

    expect(model.optimizerRunId).toMatch(/^credit-deal-optimizer:ORD-HARBOR-6534:[a-f0-9]{12}:[a-f0-9]{12}:seed-42$/u);
    expect(model.policyHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(model.sourceHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(model.rankedCandidates.map((candidate) => `${String(candidate.rank)}:${candidate.candidateId}:${candidate.objectiveValue}`)).toEqual([
      "1:max-release-85:75077.00",
      "2:partial-release-55:38888.38",
      "3:low-release-10:-13152.34"
    ]);
    expect(model.rankedCandidates[0]?.sourceRecordIds).toEqual(
      expect.arrayContaining([
        "credit_orders:ORD-HARBOR-6534",
        "credit_deal_candidate_grid:max-release-85",
        "sim_cost_of_capital:ACC-HAR:2026-01",
        "sim_pos_sellthrough:ORD-HARBOR-6534:base",
        "credit_negotiation_policy:default_prob_by_verdict_elevated:v1"
      ])
    );
    expect(model.rejectedCandidates).toEqual([
      {
        candidateId: "invalid-deposit-95",
        reason: "depositPct 95 exceeds policy max_deposit_pct 60.",
        sourceRecordIds: ["credit_deal_candidate_grid:invalid-deposit-95"]
      }
    ]);
  });

  it("replays the same ranking for identical seed, source hash, and policy hash", () => {
    const first = buildDealOptimizerModel({
      creditRiskRows: loadCreditRiskFixtureRows(),
      orderId: "ORD-HARBOR-6534",
      policyRows: creditNegotiationPolicyCandidateRows,
      seed: 42,
      simRows
    });
    const second = buildDealOptimizerModel({
      creditRiskRows: loadCreditRiskFixtureRows(),
      orderId: "ORD-HARBOR-6534",
      policyRows: creditNegotiationPolicyCandidateRows,
      seed: 42,
      simRows: structuredClone(simRows)
    });

    expect(second).toEqual(first);
  });

  it("fails closed when any required simulated feed is empty", () => {
    expect(() =>
      buildDealOptimizerModel({
        creditRiskRows: loadCreditRiskFixtureRows(),
        orderId: "ORD-HARBOR-6534",
        policyRows: creditNegotiationPolicyCandidateRows,
        seed: 42,
        simRows: {
          ...simRows,
          posSellthrough: []
        }
      })
    ).toThrow(/Deal optimizer missing required source: sim_pos_sellthrough/u);
  });
});
