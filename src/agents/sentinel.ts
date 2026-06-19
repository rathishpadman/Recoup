import { buildBlockedRiskAssessment, type BlockedRiskAssessment } from "../core/risk.js";

export function assessHarborSentinel(): BlockedRiskAssessment {
  return buildBlockedRiskAssessment({
    customerId: "CUST-HARBOR",
    recordIds: ["CUST-HARBOR", "ORDER-HARBOR-640K", "LEDGER-6-PARTIAL-HOLD"],
    observedSignals: {
      baselineDsoDays: 32,
      currentDsoDays: 51,
      disputeSpike: true,
      lienSignal: true
    }
  });
}
