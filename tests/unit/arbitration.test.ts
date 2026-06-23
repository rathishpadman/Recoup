import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import { arbitrateRiskMesh } from "../../src/core/arbitration.js";

const arbitrationPnlWeights = day1GovernedConfigSeed.values.arbitrationWeights;

describe("S6 arbitration core", () => {
  it("ranks options by supplied option values and expert weights", () => {
    const result = arbitrateRiskMesh({
      caseId: "ARB-HARBOR-ORDER-640K",
      positions: [
        {
          functionName: "credit",
          optionId: "partial-hold",
          optionValue: "100.00",
          position: "Controlled release protects the credit position.",
          recordIds: ["CREDIT-PARTIAL"]
        },
        {
          functionName: "fulfillment",
          optionId: "partial-hold",
          optionValue: "80.00",
          position: "Partial release captures serviceable demand.",
          recordIds: ["FULFILLMENT-PARTIAL"]
        },
        {
          functionName: "billing",
          optionId: "partial-hold",
          optionValue: "70.00",
          position: "Billing controls preserve continuity.",
          recordIds: ["BILLING-PARTIAL"]
        },
        {
          functionName: "collections",
          optionId: "partial-hold",
          optionValue: "90.00",
          position: "Deposit improves collectability.",
          recordIds: ["COLLECTIONS-PARTIAL"]
        },
        {
          functionName: "credit",
          optionId: "ship-now",
          optionValue: "50.00",
          position: "Shipping now leaves more exposure open.",
          recordIds: ["CREDIT-SHIP"]
        },
        {
          functionName: "fulfillment",
          optionId: "ship-now",
          optionValue: "120.00",
          position: "Shipping now maximizes near-term fulfillment value.",
          recordIds: ["FULFILLMENT-SHIP"]
        },
        {
          functionName: "billing",
          optionId: "ship-now",
          optionValue: "60.00",
          position: "Shipping now helps billing continuity.",
          recordIds: ["BILLING-SHIP"]
        },
        {
          functionName: "collections",
          optionId: "ship-now",
          optionValue: "40.00",
          position: "Collections remains exposed.",
          recordIds: ["COLLECTIONS-SHIP"]
        }
      ],
      weights: arbitrationPnlWeights
    });

    expect(result).toMatchObject({
      caseId: "ARB-HARBOR-ORDER-640K",
      status: "ranked",
      resolution: "partial-hold",
      deterministicBasis: {
        formula: "sum(optionValue * expertWeight)",
        positionCount: 8,
        weightSource: arbitrationPnlWeights
      }
    });
    if (result.status !== "ranked") {
      throw new Error("Expected arbitration result to rank supplied options.");
    }
    expect(result.rankedOptions.map((option) => [option.optionId, option.weightedValue])).toEqual([
      ["partial-hold", "87.5000"],
      ["ship-now", "70.5000"]
    ]);
    expect(result.rankedOptions[0]?.contributions).toContainEqual({
      functionName: "credit",
      optionValue: "100.00",
      recordIds: ["CREDIT-PARTIAL"],
      weight: 0.35,
      weightedContribution: "35.0000"
    });
  });

  it("blocks ranked arbitration while using supplied Day-1 weights as inactive deterministic input", () => {
    const result = arbitrateRiskMesh({
      caseId: "ARB-HARBOR-ORDER-640K",
      positions: [
        {
          functionName: "credit",
          optionId: "partial-hold",
          position: "Limit breach requires controlled release.",
          recordIds: ["CUST-HARBOR", "6534"]
        },
        {
          functionName: "fulfillment",
          optionId: "ship-now",
          position: "Holiday mix has high margin and customer value.",
          recordIds: ["6534", "FORECAST-HARBOR-12M"]
        }
      ],
      weights: arbitrationPnlWeights
    });

    expect(result).toEqual({
      caseId: "ARB-HARBOR-ORDER-640K",
      status: "blocked",
      reason: "verify-prod-calibration-required",
      recordIds: ["CUST-HARBOR", "6534", "FORECAST-HARBOR-12M"],
      deterministicBasis: {
        positionCount: 2,
        weightSource: arbitrationPnlWeights
      }
    });
  });
});
