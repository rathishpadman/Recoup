import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import type { CreditRiskApprovalAction } from "../../src/services/creditRiskModel.js";
import { prepareApprovalDecision } from "../../src/services/serviceLayer.js";
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
});
