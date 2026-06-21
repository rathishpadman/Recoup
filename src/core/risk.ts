export interface RiskObservationInput {
  customerId: string;
  recordIds: string[];
  observedSignals: {
    baselineDsoDays: number;
    currentDsoDays: number;
    disputeSpike: true;
    lienSignal: true;
  };
}

export interface BlockedRiskAssessment {
  customerId: string;
  status: "blocked";
  reason: "verify-runtime-config-loader-required";
  recordIds: string[];
  deterministicBasis: {
    rDriftTrigger: "owner-ratified-day-1-seed-present";
    rScoreWeights: "owner-ratified-day-1-seed-present";
    runtimeConfigLoader: "verify-runtime-config-loader-required";
    observedSignals: RiskObservationInput["observedSignals"];
  };
}

export function buildBlockedRiskAssessment(input: RiskObservationInput): BlockedRiskAssessment {
  return {
    customerId: input.customerId,
    status: "blocked",
    reason: "verify-runtime-config-loader-required",
    recordIds: input.recordIds,
    deterministicBasis: {
      rDriftTrigger: "owner-ratified-day-1-seed-present",
      rScoreWeights: "owner-ratified-day-1-seed-present",
      runtimeConfigLoader: "verify-runtime-config-loader-required",
      observedSignals: input.observedSignals
    }
  };
}
