import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import { creditNegotiationPolicyCandidateRows } from "../../src/services/creditNegotiationPolicy.js";
import type { CreditNegotiationApprovalAction, CreditRiskApprovalAction } from "../../src/services/creditRiskModel.js";
import { prepareApprovalDecision } from "../../src/services/serviceLayer.js";
import { harborDealOptimizerRows } from "./fixtures/dealOptimizerFixture.js";
import { loadCreditRiskFixtureRows } from "./fixtures/creditRiskFixture.js";

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
});
