import { describe, expect, it } from "vitest";
import {
  evaluateCreditNegotiationDraftEval,
  type CreditNegotiationDraftEvalCase
} from "../../evals/creditNegotiationDraftEval.js";
import { creditNegotiationPolicyCandidateRows } from "../../src/services/creditNegotiationPolicy.js";
import { loadCreditRiskFixtureRows } from "./fixtures/creditRiskFixture.js";

const simRows = {
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

const allowedCitationRecordIds = [
  "ACC-HAR",
  "ORD-HARBOR-6534",
  "credit_orders:ORD-HARBOR-6534",
  "sim_cost_of_capital:ACC-HAR:2026-01",
  "sim_3pl_inventory:ORD-HARBOR-6534:base",
  "sim_3pl_inventory:ORD-HARBOR-6534:upside",
  "sim_pos_sellthrough:ORD-HARBOR-6534:base",
  "sim_pos_sellthrough:ORD-HARBOR-6534:upside"
] as const;

const equivalentDraftOutput = {
  structures: [
    {
      candidateId: "agent-balanced-release",
      collateralRatio: "1.25",
      depositPct: "60",
      financingSpreadBps: "100",
      releasePct: "85",
      trancheCount: 3
    }
  ]
} as const;

describe("credit negotiation LLM draft eval harness", () => {
  it("passes grammar, no-dollar, citation-scope, rejection, and deterministic phrasing checks", () => {
    const equivalentCases: CreditNegotiationDraftEvalCase[] = Array.from({ length: 5 }, (_, index) => ({
      allowedCitationRecordIds,
      caseId: `harbor-equivalent-${String(index + 1)}`,
      citedRecordIds: ["credit_orders:ORD-HARBOR-6534", "sim_pos_sellthrough:ORD-HARBOR-6534:base"],
      equivalenceGroup: "harbor-balanced-structure",
      prompt: `Draft Harbor option variant ${String(index + 1)}.`,
      rawModelOutput: equivalentDraftOutput
    }));
    const report = evaluateCreditNegotiationDraftEval({
      cases: [
        ...equivalentCases,
        {
          allowedCitationRecordIds,
          caseId: "harbor-rejects-95-deposit",
          citedRecordIds: ["credit_orders:ORD-HARBOR-6534"],
          expectEngineRejection: true,
          prompt: "Draft an aggressive structure so the policy rejection path is exercised.",
          rawModelOutput: {
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
          }
        }
      ],
      pricingContext: {
        creditRiskRows: loadCreditRiskFixtureRows(),
        orderId: "ORD-HARBOR-6534",
        policyRows: creditNegotiationPolicyCandidateRows,
        seed: 42,
        simRows
      }
    });

    expect(report.status).toBe("pass");
    expect(report.summary).toMatchObject({
      deterministicGroupsChecked: 1,
      failedCases: 0,
      passedCases: 6,
      totalCases: 6
    });
    expect(Object.keys(report.caseResults[0] ?? {})).not.toContain("rawModelOutput");
    expect(report.caseResults.find((result) => result.caseId === "harbor-rejects-95-deposit")).toMatchObject({
      checks: {
        engineRejection: "pass",
        grammarAdherence: "pass",
        noDollarLeakage: "pass"
      },
      status: "pass"
    });
  });

  it("fails closed for model dollars and citations outside the selected evidence packet", () => {
    const report = evaluateCreditNegotiationDraftEval({
      cases: [
        {
          allowedCitationRecordIds,
          caseId: "harbor-dollar-leak",
          citedRecordIds: ["credit_orders:ORD-HARBOR-6534"],
          prompt: "Draft Harbor option but leak an objective value.",
          rawModelOutput: {
            structures: [
              {
                candidateId: "agent-leaked-money",
                collateralRatio: "1.25",
                depositPct: "60",
                financingSpreadBps: "100",
                objectiveValue: "75077.00",
                releasePct: "85",
                trancheCount: 3
              }
            ]
          }
        },
        {
          allowedCitationRecordIds,
          caseId: "harbor-foreign-citation",
          citedRecordIds: ["credit_orders:ORD-HARBOR-6534", "FOREIGN-CREDIT-RECORD"],
          prompt: "Draft Harbor option but cite another account.",
          rawModelOutput: equivalentDraftOutput
        }
      ],
      pricingContext: {
        creditRiskRows: loadCreditRiskFixtureRows(),
        orderId: "ORD-HARBOR-6534",
        policyRows: creditNegotiationPolicyCandidateRows,
        seed: 42,
        simRows
      }
    });

    expect(report.status).toBe("fail");
    expect(report.summary.failedCases).toBe(2);
    const dollarLeakResult = report.caseResults.find((result) => result.caseId === "harbor-dollar-leak");
    expect(dollarLeakResult).toMatchObject({
      checks: {
        grammarAdherence: "fail",
        noDollarLeakage: "fail"
      }
    });
    expect(dollarLeakResult?.failures).toContain("raw model output included a forbidden dollar, price, cost, or objective field");

    const foreignCitationResult = report.caseResults.find((result) => result.caseId === "harbor-foreign-citation");
    expect(foreignCitationResult).toMatchObject({
      checks: {
        citationScope: "fail",
        grammarAdherence: "pass",
        noDollarLeakage: "pass"
      }
    });
    expect(foreignCitationResult?.failures).toContain(
      "citations included record IDs outside the selected evidence packet: FOREIGN-CREDIT-RECORD"
    );
  });
});
