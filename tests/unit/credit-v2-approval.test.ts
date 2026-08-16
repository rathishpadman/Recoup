import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import { creditNegotiationPolicyCandidateRows } from "../../src/services/creditNegotiationPolicy.js";
import type { CreditNegotiationApprovalAction, CreditRiskApprovalAction } from "../../src/services/creditRiskModel.js";
import { prepareApprovalDecision } from "../../src/services/serviceLayer.js";
import { harborDealOptimizerRows } from "./fixtures/dealOptimizerFixture.js";
import { loadCreditRiskFixtureRows } from "./fixtures/creditRiskFixture.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import { retrieveBureau } from "../../src/tools/retrieval/bureau.js";
import { retrieveDocs } from "../../src/tools/retrieval/docs.js";
import { retrieveTpm } from "../../src/tools/retrieval/tpm.js";
import type { ServiceInvocationContext } from "../../src/services/serviceLayer.js";

function recoveryRecommendationContext(): ServiceInvocationContext {
  const source = new SyntheticSource({ seed: 42 });

  return {
    creditRiskRows: loadCreditRiskFixtureRows(),
    governedConfig: day1GovernedConfigSeed.values,
    requireSupabaseSapEvidence: true,
    requireSupabaseSyntheticEvidence: true,
    sapEvidenceSource: {
      readEvidence(line) {
        return line.recordIds
          .filter((recordId) => recordId.startsWith("INV-"))
          .map((recordId) => ({
            documentId: `SAP-${recordId}`,
            documentType: "invoice",
            recordIds: [line.lineId, recordId, `SAP-${recordId}`],
            source: "sap" as const,
            summary: `Supabase SAP source row for ${recordId}.`
          }));
      }
    },
    source,
    syntheticEvidenceSource: {
      readEvidence(connectorName, line) {
        if (connectorName === "bureau") {
          return retrieveBureau(line);
        }
        if (connectorName === "docs-repo") {
          return retrieveDocs(line);
        }

        return retrieveTpm(line);
      }
    },
    verifiedHumanPrincipal: "human:david-kim"
  };
}

describe("credit-v2 approval resolver", () => {
  it("resolves a governed credit-v2 packet into a replayable draft-only approval action", () => {
    const prepared = prepareApprovalDecision(
      {
        actionId: "credit-v2:ACC-CRE",
        decision: "approve"
      },
      {
        creditRiskRows: loadCreditRiskFixtureRows(),
        governedConfig: day1GovernedConfigSeed.values,
        verifiedHumanPrincipal: "human:maya-lead"
      }
    );

    expect(prepared.action).toMatchObject({
      actionId: "credit-v2:ACC-CRE",
      detail: "Contain exposure and keep every external send gated behind human review.",
      dispatchedExternally: false,
      proposedBy: "agent:credit-risk-review",
      requiresHumanApproval: true
    });
    const action = prepared.action as CreditRiskApprovalAction;
    expect(action.recordIds).toEqual(expect.arrayContaining(["ACC-CRE", "S6", "L15", "CTR CRE-PRC-24"]));
    expect(action.basis).toContain("is HIGH because Credit=ELEVATED");
    expect(action.basis).toContain("Collections=HIGH");
    expect(action.deterministicBasis).toMatchObject({
      collectionsRank: 3,
      creditRank: 2,
      routeLabel: "Contain",
      unsupportedAmount: "39700.00",
      verdict: "HIGH"
    });
    expect(action.deterministicBasis.utilisation).toBe("87.11");
    expect(prepared.approval).toMatchObject({
      actionId: "credit-v2:ACC-CRE",
      approverId: "human:maya-lead",
      decision: "approve",
      status: "human_decided"
    });
  });

  it("resolves a governed David negotiation round into a replayable draft-only approval action", () => {
    const rows = loadCreditRiskFixtureRows();
    rows.negotiationOrders = [
      {
        accountId: "ACC-HAR",
        orderAmount: "640010.00",
        orderId: "ORD-HARBOR-6534",
        sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
      }
    ];

    const prepared = prepareApprovalDecision(
      {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        decision: "approve"
      },
      {
        creditRiskRows: rows,
        governedConfig: day1GovernedConfigSeed.values,
        verifiedHumanPrincipal: "human:david-credit-lead"
      }
    );

    expect(prepared.action).toMatchObject({
      actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      detail: "Draft customer negotiation email for Harbor Foods order ORD-HARBOR-6534 round 1.",
      dispatchedExternally: false,
      proposedBy: "agent:credit-negotiation",
      requiresHumanApproval: true
    });
    expect(prepared.action.recordIds).toEqual(
      expect.arrayContaining(["ACC-HAR", "ORD-HARBOR-6534", "credit_orders:ORD-HARBOR-6534"])
    );
    expect(prepared.action.basis).toContain("Harbor Foods");
    expect(prepared.action.basis).toContain("round 1");
    const action = prepared.action as CreditNegotiationApprovalAction;
    expect(action.deterministicBasis).toMatchObject({
      accountId: "ACC-HAR",
      customer: "Harbor Foods",
      orderId: "ORD-HARBOR-6534",
      round: 1
    });
    expect(prepared.approval).toMatchObject({
      actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      approverId: "human:david-credit-lead",
      decision: "approve",
      status: "human_decided"
    });
  });

  it("grounds the David negotiation approved draft in the top deterministic deal candidate when optimizer rows are available", () => {
    const rows = loadCreditRiskFixtureRows();
    rows.negotiationOrders = [
      {
        accountId: "ACC-HAR",
        orderAmount: "640010.00",
        orderId: "ORD-HARBOR-6534",
        sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
      }
    ];

    const prepared = prepareApprovalDecision(
      {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        decision: "approve"
      },
      {
        creditRiskRows: rows,
        dealOptimizerRows: {
          policyRows: creditNegotiationPolicyCandidateRows,
          simRows: harborDealOptimizerRows
        },
        governedConfig: day1GovernedConfigSeed.values,
        verifiedHumanPrincipal: "human:david-credit-lead"
      }
    );

    const action = prepared.action as CreditNegotiationApprovalAction;
    expect(action.deterministicBasis).toMatchObject({
      selectedCandidateId: "max-release-85",
      selectedCandidateObjectiveValue: "75077.00",
      selectedCandidateObjectiveValueLabel: "$75,077.00"
    });
    expect(action.recordIds).toEqual(
      expect.arrayContaining([
        "credit_deal_candidate_grid:max-release-85",
        "sim_3pl_inventory:ORD-HARBOR-6534:base",
        "sim_pos_sellthrough:ORD-HARBOR-6534:base"
      ])
    );
    expect(action.approvedDraft.body).toContain("max-release-85");
    expect(action.approvedDraft.body).toContain("85% release");
    expect(action.approvedDraft.body).toContain("60% deposit");
    expect(action.approvedDraft.body).toContain("$75,077.00");
  });

  it("grounds a countered David negotiation round in the priced customer counter candidate", () => {
    const rows = loadCreditRiskFixtureRows();
    rows.negotiationOrders = [
      {
        accountId: "ACC-HAR",
        orderAmount: "640010.00",
        orderId: "ORD-HARBOR-6534",
        sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
      }
    ];
    rows.negotiationRounds = [
      {
        accountId: "ACC-HAR",
        orderId: "ORD-HARBOR-6534",
        round: 1,
        roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        status: "countered"
      }
    ];

    const prepared = prepareApprovalDecision(
      {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r2",
        decision: "approve"
      },
      {
        creditRiskRows: rows,
        dealOptimizerRows: {
          policyRows: creditNegotiationPolicyCandidateRows,
          simRows: {
            ...harborDealOptimizerRows,
            counterOffers: [
              {
                accountId: "ACC-HAR",
                counterOfferId: "counter-harbor-r1-customer-terms",
                extractedTerms: {
                  depositPct: "40",
                  releasePct: "75",
                  trancheCount: 2
                },
                orderId: "ORD-HARBOR-6534",
                roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
                source: "email",
                sourceRecordIds: ["credit_counter_offers:counter-harbor-r1-customer-terms"],
                status: "grammar_valid"
              }
            ]
          }
        },
        governedConfig: day1GovernedConfigSeed.values,
        verifiedHumanPrincipal: "human:david-credit-lead"
      }
    );

    const action = prepared.action as CreditNegotiationApprovalAction;
    expect(action.deterministicBasis).toMatchObject({
      selectedCandidateId: "counter-offer:counter-harbor-r1-customer-terms",
      selectedCandidateObjectiveValueLabel: "$62,680.44"
    });
    expect(action.recordIds).toEqual(
      expect.arrayContaining([
        "credit_counter_offers:counter-harbor-r1-customer-terms",
        "credit_deal_candidate_grid:max-release-85"
      ])
    );
    expect(action.approvedDraft.body).toContain("counter-offer:counter-harbor-r1-customer-terms");
    expect(action.approvedDraft.body).toContain("75% release");
    expect(action.approvedDraft.body).toContain("40% deposit");
    expect(action.approvedDraft.body).toContain("2 tranches");
    expect(action.approvedDraft.body).toContain("$62,680.44");
    expect(action.approvedDraft.body).not.toContain("Terms: 85% release; 60% deposit; 3 tranches");
  });

  it("fails closed when a countered David negotiation round has no priced customer counter candidate", () => {
    const rows = loadCreditRiskFixtureRows();
    rows.negotiationOrders = [
      {
        accountId: "ACC-HAR",
        orderAmount: "640010.00",
        orderId: "ORD-HARBOR-6534",
        sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
      }
    ];
    rows.negotiationRounds = [
      {
        accountId: "ACC-HAR",
        orderId: "ORD-HARBOR-6534",
        round: 1,
        roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        status: "countered"
      }
    ];

    expect(() =>
      prepareApprovalDecision(
        {
          actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r2",
          decision: "approve"
        },
        {
          creditRiskRows: rows,
          dealOptimizerRows: {
            policyRows: creditNegotiationPolicyCandidateRows,
            simRows: harborDealOptimizerRows
          },
          governedConfig: day1GovernedConfigSeed.values,
          verifiedHumanPrincipal: "human:david-credit-lead"
        }
      )
    ).toThrow("Credit negotiation approval requires a priced counter-offer for current round credit-v2:negotiation:ORD-HARBOR-6534:r1.");
  });

  it("fails closed when countered David negotiation approval lacks optimizer rows", () => {
    const rows = loadCreditRiskFixtureRows();
    rows.negotiationOrders = [
      {
        accountId: "ACC-HAR",
        orderAmount: "640010.00",
        orderId: "ORD-HARBOR-6534",
        sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
      }
    ];
    rows.negotiationRounds = [
      {
        accountId: "ACC-HAR",
        orderId: "ORD-HARBOR-6534",
        round: 1,
        roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        status: "countered"
      }
    ];

    expect(() =>
      prepareApprovalDecision(
        {
          actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r2",
          decision: "approve"
        },
        {
          creditRiskRows: rows,
          governedConfig: day1GovernedConfigSeed.values,
          verifiedHumanPrincipal: "human:david-credit-lead"
        }
      )
    ).toThrow("Credit negotiation approval requires a priced counter-offer for current round credit-v2:negotiation:ORD-HARBOR-6534:r1.");
  });

  it("ignores stale counter-offers from earlier David negotiation rounds", () => {
    const rows = loadCreditRiskFixtureRows();
    rows.negotiationOrders = [
      {
        accountId: "ACC-HAR",
        orderAmount: "640010.00",
        orderId: "ORD-HARBOR-6534",
        sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
      }
    ];
    rows.negotiationRounds = [
      {
        accountId: "ACC-HAR",
        orderId: "ORD-HARBOR-6534",
        round: 1,
        roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        status: "sent"
      },
      {
        accountId: "ACC-HAR",
        orderId: "ORD-HARBOR-6534",
        round: 2,
        roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r2",
        status: "countered"
      }
    ];

    const prepared = prepareApprovalDecision(
      {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r3",
        decision: "approve"
      },
      {
        creditRiskRows: rows,
        dealOptimizerRows: {
          policyRows: creditNegotiationPolicyCandidateRows,
          simRows: {
            ...harborDealOptimizerRows,
            counterOffers: [
              {
                accountId: "ACC-HAR",
                counterOfferId: "counter-harbor-stale-r1",
                extractedTerms: {
                  depositPct: "60",
                  releasePct: "85",
                  trancheCount: 3
                },
                orderId: "ORD-HARBOR-6534",
                roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
                source: "email",
                sourceRecordIds: ["credit_counter_offers:counter-harbor-stale-r1"],
                status: "grammar_valid"
              },
              {
                accountId: "ACC-HAR",
                counterOfferId: "counter-harbor-current-r2",
                extractedTerms: {
                  depositPct: "40",
                  releasePct: "75",
                  trancheCount: 2
                },
                orderId: "ORD-HARBOR-6534",
                roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r2",
                source: "email",
                sourceRecordIds: ["credit_counter_offers:counter-harbor-current-r2"],
                status: "grammar_valid"
              }
            ]
          }
        },
        governedConfig: day1GovernedConfigSeed.values,
        verifiedHumanPrincipal: "human:david-credit-lead"
      }
    );

    const action = prepared.action as CreditNegotiationApprovalAction;
    expect(action.deterministicBasis).toMatchObject({
      selectedCandidateId: "counter-offer:counter-harbor-current-r2",
      selectedCandidateObjectiveValueLabel: "$62,680.44"
    });
    expect(action.recordIds).toContain("credit_counter_offers:counter-harbor-current-r2");
    expect(action.recordIds).not.toContain("credit_counter_offers:counter-harbor-stale-r1");
    expect(action.approvedDraft.body).toContain("counter-offer:counter-harbor-current-r2");
    expect(action.approvedDraft.body).not.toContain("counter-offer:counter-harbor-stale-r1");
  });
});

describe("Maya recovery credit recommendation approval resolver", () => {
  it("resolves a recovery recommendation into a draft-only approval action carrying the card's values", () => {
    const prepared = prepareApprovalDecision(
      {
        actionId: "credit-recommendation:S5-L1:band-downgrade",
        decision: "approve"
      },
      recoveryRecommendationContext()
    );
    const action = prepared.action as CreditRiskApprovalAction;

    expect(action).toMatchObject({
      actionId: "credit-recommendation:S5-L1:band-downgrade",
      detail: "Downgrade risk band: WATCH -> ELEVATED",
      dispatchedExternally: false,
      proposedBy: "agent:credit-risk-review",
      requiresHumanApproval: true
    });
    expect(action.recordIds).toEqual(expect.arrayContaining(["ACC-VAL", "S5-L1"]));
    // 2026-01-26 is when the credit position was measured, not when Maya recommended anything.
    // The basis must attach the date to the credit position and must not claim it as a
    // recommendation date.
    expect(action.basis).toContain("Credit position as of 2026-01-26");
    expect(action.basis).not.toContain("Recommended by Maya on 2026-01-26");
    expect(action.basis).toContain("Raised by Maya");
    expect(prepared.approval).toMatchObject({ decision: "approve", status: "human_decided" });
  });

  it("refuses to resolve a credit recommendation for a line that does not route to recovery", () => {
    expect(() =>
      prepareApprovalDecision(
        {
          actionId: "credit-recommendation:S1-L1:band-downgrade",
          decision: "approve"
        },
        recoveryRecommendationContext()
      )
    ).toThrow("Action not found.");
  });
});
