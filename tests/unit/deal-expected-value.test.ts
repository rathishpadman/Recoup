import { describe, expect, it } from "vitest";
import { calculateDealExpectedValue, type DealExpectedValueInput } from "../../src/core/dealExpectedValue.js";

const baseInput: DealExpectedValueInput = {
  candidate: {
    candidateId: "partial-release-55",
    collateralRatio: "1.00",
    depositPct: "25",
    financingSpreadBps: "200",
    releasePct: "55"
  },
  economics: {
    costOfCapitalAnnualBps: "900",
    grossMarginPct: "0.18",
    holdingCostPerUnitPerDay: "0.75",
    sourceRecordIds: ["sim_cost_of_capital:harbor-2026-01"]
  },
  order: {
    orderAmount: "640010.00",
    orderId: "ORD-HARBOR-6534",
    sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"],
    units: "1000"
  },
  risk: {
    annualDefaultProbability: "0.12",
    exposureAmount: "3920000.00",
    sourceRecordIds: ["ACC-HAR", "credit_negotiation_policy:default_prob_by_verdict_high:v1"],
    verdict: "HIGH"
  },
  scenarios: [
    {
      holdingDays: 30,
      probability: "0.60",
      scenarioId: "base-sellthrough",
      sellThroughPct: "0.80",
      sourceRecordIds: ["sim_pos_sellthrough:harbor-base", "sim_3pl_inventory:harbor-base"]
    },
    {
      holdingDays: 21,
      probability: "0.40",
      scenarioId: "upside-sellthrough",
      sellThroughPct: "0.95",
      sourceRecordIds: ["sim_pos_sellthrough:harbor-upside", "sim_3pl_inventory:harbor-upside"]
    }
  ],
  seed: 42
};

describe("deal expected value core", () => {
  it("calculates the deterministic scenario-grid objective with Decimal money", () => {
    const result = calculateDealExpectedValue(baseInput);

    expect(result).toMatchObject({
      basis: {
        formula: "revenueCaptured - costOfCapital - holdingCost - expectedDefaultLoss",
        scenarioCount: 2
      },
      candidateId: "partial-release-55",
      objectiveValue: "7407.23"
    });
    expect(result.calculationHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.sourceRecordIds).toEqual(
      expect.arrayContaining([
        "credit_orders:ORD-HARBOR-6534",
        "sim_cost_of_capital:harbor-2026-01",
        "sim_pos_sellthrough:harbor-base",
        "sim_3pl_inventory:harbor-upside",
        "credit_negotiation_policy:default_prob_by_verdict_high:v1"
      ])
    );
    expect(result.scenarioResults).toEqual([
      {
        costOfCapital: "2386.89",
        expectedDefaultLoss: "40971.25",
        holdingCost: "10125.00",
        objectiveValue: "-2794.34",
        probability: "0.60",
        revenueCaptured: "50688.79",
        scenarioId: "base-sellthrough"
      },
      {
        costOfCapital: "1670.82",
        expectedDefaultLoss: "28725.04",
        holdingCost: "7087.50",
        objectiveValue: "22709.58",
        probability: "0.40",
        revenueCaptured: "60192.94",
        scenarioId: "upside-sellthrough"
      }
    ]);
  });

  it("is deterministic for the same seed and source rows", () => {
    const first = calculateDealExpectedValue(baseInput);
    const second = calculateDealExpectedValue(structuredClone(baseInput));

    expect(second).toEqual(first);
  });

  it("reduces objective value when the source cost of capital rises", () => {
    const base = calculateDealExpectedValue(baseInput);
    const higherCost = calculateDealExpectedValue({
      ...baseInput,
      economics: {
        ...baseInput.economics,
        costOfCapitalAnnualBps: "1400"
      }
    });

    expect(Number(higherCost.objectiveValue)).toBeLessThan(Number(base.objectiveValue));
  });

  it("fails closed when the scenario grid is empty", () => {
    expect(() =>
      calculateDealExpectedValue({
        ...baseInput,
        scenarios: []
      })
    ).toThrow(/Deal expected value requires at least one scenario row/u);
  });
});
