import type { DealOptimizerRows } from "../../../src/services/dealOptimizer.js";

export const harborDealOptimizerRows = {
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
} as const satisfies DealOptimizerRows;
