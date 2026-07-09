import { describe, expect, it } from "vitest";
import { creditNegotiationPolicyCandidateRows } from "../../src/services/creditNegotiationPolicy.js";
import {
  parseCreditNegotiationDraftStructures,
  priceAgentDraftedDealStructures
} from "../../src/services/creditNegotiationDrafts.js";
import { loadCreditRiskFixtureRows } from "./fixtures/creditRiskFixture.js";

const baseSimRows = {
  candidateStructures: [],
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

describe("credit negotiation LLM draft structures", () => {
  it("parses structure-only model output and adds source record ids without dollars", () => {
    const drafts = parseCreditNegotiationDraftStructures({
      structures: [
        {
          candidateId: "agent-max-release-85",
          collateralRatio: "1.25",
          depositPct: "60",
          financingSpreadBps: "100",
          releasePct: "85",
          trancheCount: 3
        }
      ]
    });

    expect(drafts).toEqual([
      {
        candidateId: "agent-max-release-85",
        collateralRatio: "1.25",
        depositPct: "60",
        financingSpreadBps: "100",
        releasePct: "85",
        sourceRecordIds: ["credit_negotiation.draft_structures:agent-max-release-85"],
        trancheCount: 3
      }
    ]);
  });

  it("rejects any model-emitted dollar or objective fields before pricing", () => {
    expect(() =>
      parseCreditNegotiationDraftStructures({
        structures: [
          {
            candidateId: "bad-dollar-draft",
            collateralRatio: "1.00",
            depositPct: "50",
            financingSpreadBps: "100",
            objectiveValue: "75077.00",
            releasePct: "80",
            trancheCount: 2
          }
        ]
      })
    ).toThrow(/LLM draft structures must not include dollar, cost, price, or objective fields/u);
  });

  it("prices an agent-drafted structure through the deterministic engine", () => {
    const drafts = parseCreditNegotiationDraftStructures({
      structures: [
        {
          candidateId: "agent-max-release-85",
          collateralRatio: "1.25",
          depositPct: "60",
          financingSpreadBps: "100",
          releasePct: "85",
          trancheCount: 3
        }
      ]
    });
    const priced = priceAgentDraftedDealStructures({
      creditRiskRows: loadCreditRiskFixtureRows(),
      drafts,
      orderId: "ORD-HARBOR-6534",
      policyRows: creditNegotiationPolicyCandidateRows,
      seed: 42,
      simRows: baseSimRows
    });

    expect(priced.rankedCandidates).toHaveLength(1);
    expect(priced.rankedCandidates[0]).toMatchObject({
      candidateId: "agent-max-release-85",
      objectiveValue: "75077.00",
      objectiveValueLabel: "$75,077.00"
    });
  });

  it("returns an engine rejection for out-of-bounds agent structures", () => {
    const drafts = parseCreditNegotiationDraftStructures({
      structures: [
        {
          candidateId: "agent-over-deposit",
          collateralRatio: "1.00",
          depositPct: "95",
          financingSpreadBps: "100",
          releasePct: "80",
          trancheCount: 2
        }
      ]
    });
    const priced = priceAgentDraftedDealStructures({
      creditRiskRows: loadCreditRiskFixtureRows(),
      drafts,
      orderId: "ORD-HARBOR-6534",
      policyRows: creditNegotiationPolicyCandidateRows,
      seed: 42,
      simRows: baseSimRows
    });

    expect(priced.rankedCandidates).toEqual([]);
    expect(priced.rejectedCandidates).toEqual([
      {
        candidateId: "agent-over-deposit",
        reason: "depositPct 95 exceeds policy max_deposit_pct 60.",
        sourceRecordIds: ["credit_negotiation.draft_structures:agent-over-deposit"]
      }
    ]);
  });
});
