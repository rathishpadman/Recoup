import { describe, expect, it } from "vitest";
import { arbitrationPnlWeights } from "../../config/weights.js";
import { arbitrateRiskMesh } from "../../src/core/arbitration.js";

describe("S6 arbitration core", () => {
  it("blocks ranked arbitration while expert P&L weights are unset", () => {
    const result = arbitrateRiskMesh({
      caseId: "ARB-HARBOR-ORDER-640K",
      positions: [
        {
          functionName: "credit",
          optionId: "partial-hold",
          position: "Limit breach requires controlled release.",
          recordIds: ["CUST-HARBOR", "ORDER-HARBOR-640K"]
        },
        {
          functionName: "fulfillment",
          optionId: "ship-now",
          position: "Holiday mix has high margin and customer value.",
          recordIds: ["ORDER-HARBOR-640K", "FORECAST-HARBOR-12M"]
        }
      ],
      weights: arbitrationPnlWeights
    });

    expect(result).toEqual({
      caseId: "ARB-HARBOR-ORDER-640K",
      status: "blocked",
      reason: "expert-arbitration-weights-unset",
      recordIds: ["CUST-HARBOR", "ORDER-HARBOR-640K", "FORECAST-HARBOR-12M"],
      deterministicBasis: {
        positionCount: 2,
        weightSource: "<TO BE SET BY EXPERT>"
      }
    });
  });
});
