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
  reason: "r-score-weights-unset";
  recordIds: string[];
  deterministicBasis: {
    rScoreWeights: "unset";
    driftThreshold: "unset";
    observedSignals: RiskObservationInput["observedSignals"];
  };
}

export function buildBlockedRiskAssessment(input: RiskObservationInput): BlockedRiskAssessment {
  return {
    customerId: input.customerId,
    status: "blocked",
    reason: "r-score-weights-unset",
    recordIds: input.recordIds,
    deterministicBasis: {
      rScoreWeights: "unset",
      driftThreshold: "unset",
      observedSignals: input.observedSignals
    }
  };
}
