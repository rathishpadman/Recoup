import { describe, expect, it } from "vitest";
import { buildCreditSimulationModel } from "../../src/services/creditSimulationModel.js";
import { loadCreditRiskFixtureRows } from "./fixtures/creditRiskFixture.js";

describe("credit simulation model", () => {
  it("wraps the governed partial-hold core and terms proposal for Harbor", () => {
    const model = buildCreditSimulationModel({ accountId: "ACC-HAR" }, loadCreditRiskFixtureRows());

    expect(model).toMatchObject({
      accountId: "ACC-HAR",
      amountSplit: {
        amountSource: "partial-hold-core",
        orderAmountLabel: "$640,010.00",
        proposedBackOrderAmountLabel: "$288,004.50",
        proposedReleaseAmountLabel: "$352,005.50"
      },
      compositeScoreLabel: "51.25",
      externalActionDispatched: false,
      releaseRatioPercentLabel: "55%",
      sensitivityLine: "Composite score would need to rise from 51.25 to above 60.00 before full release.",
      terms: {
        actionType: "propose-terms",
        dispatchedExternally: false,
        requiresHumanApproval: true,
        status: "pending_human",
        terms: "2/10 Net-30 + 25% deposit"
      }
    });
    expect(model.recordIds).toEqual(expect.arrayContaining(["ACC-HAR", "6534", "CUST-HARBOR"]));
    expect(model.deterministicBasis).toMatchObject({
      partialHoldCore: "computePartialHold + computePartialHoldAmountSplit",
      termsTool: "proposeTerms draft-only"
    });
  });

  it("recomputes the split when bounded score inputs change", () => {
    const model = buildCreditSimulationModel(
      {
        accountId: "ACC-HAR",
        scoreOverrides: {
          dsoPaymentDrift: 90
        }
      },
      loadCreditRiskFixtureRows()
    );

    expect(model.compositeScoreLabel).toBe("63.25");
    expect(model.releaseRatioPercentLabel).toBe("100%");
    expect(model.amountSplit.proposedReleaseAmountLabel).toBe("$640,010.00");
    expect(model.amountSplit.proposedBackOrderAmountLabel).toBe("$0.00");
    expect(model.appliedOverrides.scoreOverrides).toEqual({ dsoPaymentDrift: 90 });
  });

  it("clamps slider overrides to governed score and weight bounds before recomputing", () => {
    const model = buildCreditSimulationModel(
      {
        accountId: "ACC-HAR",
        scoreOverrides: {
          paymentPattern: -40
        },
        weightOverrides: {
          orderMargin: 2
        }
      },
      loadCreditRiskFixtureRows()
    );

    expect(model.appliedOverrides.scoreOverrides).toEqual({ paymentPattern: 0 });
    expect(model.appliedOverrides.weightOverrides).toEqual({ orderMargin: 1 });
    expect(model.compositeScoreLabel).toBe("111.75");
  });

  it("fails closed when an account has no governed partial-hold simulation scores", () => {
    expect(() => buildCreditSimulationModel({ accountId: "ACC-CRE" }, loadCreditRiskFixtureRows())).toThrow(
      /Credit simulation missing partial-hold scores for account ACC-CRE/u
    );
  });
});
