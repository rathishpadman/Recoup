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

const harborCounterOffer = {
  accountId: "ACC-HAR",
  counterOfferId: "counter-harbor-r1-complete",
  extractedTerms: {
    collateralRatio: "1.10",
    depositPct: "20",
    financingSpreadBps: "150",
    releasePct: "55",
    trancheCount: 2
  },
  orderId: "ORD-HARBOR-6534",
  roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
  source: "manual",
  sourceRecordIds: ["credit_counter_offers:counter-harbor-r1-complete"],
  status: "grammar_valid"
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
    expect(model.rankedCandidates[0]).toMatchObject({
      objectiveValueLabel: "$75,077.00",
      terms: {
        collateralRatioLabel: "1.25x collateral",
        depositPctLabel: "60% deposit",
        financingSpreadLabel: "100 bps spread",
        releasePctLabel: "85% release",
        trancheCountLabel: "3 tranches"
      }
    });
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

  it("re-optimizes with complete grammar-valid counter-offer terms as a priced candidate", () => {
    const baseline = buildDealOptimizerModel({
      creditRiskRows: loadCreditRiskFixtureRows(),
      orderId: "ORD-HARBOR-6534",
      policyRows: creditNegotiationPolicyCandidateRows,
      seed: 42,
      simRows
    });

    const reoptimized = buildDealOptimizerModel({
      creditRiskRows: loadCreditRiskFixtureRows(),
      orderId: "ORD-HARBOR-6534",
      policyRows: creditNegotiationPolicyCandidateRows,
      seed: 42,
      simRows: {
        ...simRows,
        counterOffers: [harborCounterOffer]
      }
    });

    const counterCandidate = reoptimized.rankedCandidates.find(
      (candidate) => candidate.candidateId === "counter-offer:counter-harbor-r1-complete"
    );

    expect(reoptimized.sourceHash).not.toBe(baseline.sourceHash);
    expect(counterCandidate).toBeDefined();
    if (counterCandidate === undefined) {
      return;
    }
    expect(counterCandidate.sourceRecordIds.includes("credit_counter_offers:counter-harbor-r1-complete")).toBe(true);
    expect(counterCandidate.terms).toEqual({
      collateralRatioLabel: "1.1x collateral",
      depositPctLabel: "20% deposit",
      financingSpreadLabel: "150 bps spread",
      releasePctLabel: "55% release",
      trancheCountLabel: "2 tranches"
    });
    expect(counterCandidate.calculationHash).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/u));
    expect(counterCandidate.objectiveValue).toEqual(expect.stringMatching(/^-?\d+\.\d{2}$/u));
  });

  it("prices a customer counter with governed defaults for missing technical terms", () => {
    const model = buildDealOptimizerModel({
      creditRiskRows: loadCreditRiskFixtureRows(),
      orderId: "ORD-HARBOR-6534",
      policyRows: creditNegotiationPolicyCandidateRows,
      seed: 42,
      simRows: {
        ...simRows,
        counterOffers: [
          {
            ...harborCounterOffer,
            counterOfferId: "counter-harbor-r1-customer-terms",
            extractedTerms: {
              depositPct: "40",
              releasePct: "75",
              trancheCount: 2
            },
            source: "email",
            sourceRecordIds: ["credit_counter_offers:counter-harbor-r1-customer-terms"]
          }
        ]
      }
    });

    const counterCandidate = model.rankedCandidates.find(
      (candidate) => candidate.candidateId === "counter-offer:counter-harbor-r1-customer-terms"
    );

    expect(counterCandidate).toBeDefined();
    if (counterCandidate === undefined) {
      return;
    }
    expect(counterCandidate.terms).toEqual({
      collateralRatioLabel: "1.25x collateral",
      depositPctLabel: "40% deposit",
      financingSpreadLabel: "100 bps spread",
      releasePctLabel: "75% release",
      trancheCountLabel: "2 tranches"
    });
    expect(counterCandidate.sourceRecordIds).toEqual(
      expect.arrayContaining([
        "credit_counter_offers:counter-harbor-r1-customer-terms",
        "credit_deal_candidate_grid:max-release-85"
      ])
    );
    expect(model.rejectedCandidates.map((candidate) => candidate.candidateId)).not.toContain(
      "counter-offer:counter-harbor-r1-customer-terms"
    );
  });

  it("rejects malformed complete counter-offer terms without failing the whole optimizer", () => {
    const model = buildDealOptimizerModel({
      creditRiskRows: loadCreditRiskFixtureRows(),
      orderId: "ORD-HARBOR-6534",
      policyRows: creditNegotiationPolicyCandidateRows,
      seed: 42,
      simRows: {
        ...simRows,
        counterOffers: [
          {
            ...harborCounterOffer,
            counterOfferId: "counter-harbor-r1-malformed",
            extractedTerms: {
              collateralRatio: "not-a-number",
              depositPct: "20",
              financingSpreadBps: "150",
              releasePct: "55",
              trancheCount: 2
            },
            sourceRecordIds: ["credit_counter_offers:counter-harbor-r1-malformed"]
          }
        ]
      }
    });

    expect(model.rankedCandidates.map((candidate) => candidate.candidateId)).not.toContain("counter-offer:counter-harbor-r1-malformed");
    expect(model.rejectedCandidates).toContainEqual({
      candidateId: "counter-offer:counter-harbor-r1-malformed",
      reason: "Counter-offer collateralRatio must be a finite decimal.",
      sourceRecordIds: ["credit_counter_offers:counter-harbor-r1-malformed"]
    });
  });

  it("rejects incomplete grammar-valid counter-offers and ignores human-review counter-offers", () => {
    const baseline = buildDealOptimizerModel({
      creditRiskRows: loadCreditRiskFixtureRows(),
      orderId: "ORD-HARBOR-6534",
      policyRows: creditNegotiationPolicyCandidateRows,
      seed: 42,
      simRows
    });
    const model = buildDealOptimizerModel({
      creditRiskRows: loadCreditRiskFixtureRows(),
      orderId: "ORD-HARBOR-6534",
      policyRows: creditNegotiationPolicyCandidateRows,
      seed: 42,
      simRows: {
        ...simRows,
        counterOffers: [
          {
            ...harborCounterOffer,
            counterOfferId: "counter-harbor-r1-incomplete",
            extractedTerms: {
              depositPct: "20",
              releasePct: "55"
            },
            sourceRecordIds: ["credit_counter_offers:counter-harbor-r1-incomplete"]
          },
          {
            ...harborCounterOffer,
            counterOfferId: "counter-harbor-r1-human-review",
            sourceRecordIds: ["credit_counter_offers:counter-harbor-r1-human-review"],
            status: "human_review"
          }
        ]
      }
    });

    expect(model.rankedCandidates.map((candidate) => candidate.candidateId)).not.toContain("counter-offer:counter-harbor-r1-incomplete");
    expect(model.rankedCandidates.map((candidate) => candidate.candidateId)).not.toContain("counter-offer:counter-harbor-r1-human-review");
    expect(model.rejectedCandidates).toContainEqual({
      candidateId: "counter-offer:counter-harbor-r1-incomplete",
      reason: "Counter-offer is missing required customer terms: trancheCount.",
      sourceRecordIds: ["credit_counter_offers:counter-harbor-r1-incomplete"]
    });
    expect(model.rejectedCandidates.map((candidate) => candidate.candidateId)).not.toContain("counter-offer:counter-harbor-r1-human-review");
    expect(model.sourceHash).not.toBe(baseline.sourceHash);
    expect(model.sourceRecordIds).not.toContain("credit_counter_offers:counter-harbor-r1-human-review");
  });

  it("keeps unrelated order scenario rows out of replay hashes and cited source records", () => {
    const baseline = buildDealOptimizerModel({
      creditRiskRows: loadCreditRiskFixtureRows(),
      orderId: "ORD-HARBOR-6534",
      policyRows: creditNegotiationPolicyCandidateRows,
      seed: 42,
      simRows
    });
    const withUnrelatedRows = buildDealOptimizerModel({
      creditRiskRows: loadCreditRiskFixtureRows(),
      orderId: "ORD-HARBOR-6534",
      policyRows: creditNegotiationPolicyCandidateRows,
      seed: 42,
      simRows: {
        ...simRows,
        inventory: [
          ...simRows.inventory,
          {
            holdingCostPerUnitPerDay: "3.75",
            holdingDays: 99,
            orderId: "ORD-HARBOR-OTHER",
            scenarioId: "other-order-base",
            sourceRecordIds: ["sim_3pl_inventory:ORD-HARBOR-OTHER:base"]
          }
        ],
        posSellthrough: [
          ...simRows.posSellthrough,
          {
            orderId: "ORD-HARBOR-OTHER",
            probability: "1.00",
            scenarioId: "other-order-base",
            sellThroughPct: "0.10",
            sourceRecordIds: ["sim_pos_sellthrough:ORD-HARBOR-OTHER:base"]
          }
        ]
      }
    });

    expect(withUnrelatedRows.sourceHash).toBe(baseline.sourceHash);
    expect(withUnrelatedRows.sourceRecordIds).not.toContain("sim_3pl_inventory:ORD-HARBOR-OTHER:base");
    expect(withUnrelatedRows.sourceRecordIds).not.toContain("sim_pos_sellthrough:ORD-HARBOR-OTHER:base");
    expect(withUnrelatedRows.rankedCandidates.flatMap((candidate) => candidate.sourceRecordIds)).not.toEqual(
      expect.arrayContaining(["sim_3pl_inventory:ORD-HARBOR-OTHER:base", "sim_pos_sellthrough:ORD-HARBOR-OTHER:base"])
    );
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
