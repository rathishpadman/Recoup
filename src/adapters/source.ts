import type { SyntheticDatasetCore } from "../types/entities.js";

export type SourceRiskScoreComponentName =
  | "agingConcentration"
  | "disputeRate"
  | "dsoAdp"
  | "overLimitFrequency";

export interface SourceRiskScoreComponentScores {
  agingConcentration: number;
  disputeRate: number;
  dsoAdp: number;
  overLimitFrequency: number;
}

export interface SourceRiskDriftObservations {
  baselineDsoDays: number;
  currentDsoDays: number;
  baselineDisputeRate?: number;
  baselineRiskTierRank?: number;
  cooldownDaysSinceLastReview?: number;
  currentDisputeRate?: number;
  currentRiskTierRank?: number;
}

export interface SourceObservedRiskSignals {
  baselineDsoDays: number;
  currentDsoDays: number;
  disputeSpike: true;
  lienSignal: true;
}

export interface SourceRiskObservationSnapshot {
  customerId: string;
  observedSignals: SourceObservedRiskSignals;
  rDriftObservations?: SourceRiskDriftObservations;
  recordIds: string[];
  rScoreComponentScores?: SourceRiskScoreComponentScores;
  sourceNormalization: {
    missingFields: string[];
    sourcePort: "SourcePort.loadRiskObservationSnapshot";
  };
}

export interface SourcePort {
  loadSettlementRun(): SyntheticDatasetCore;
  loadRiskObservationSnapshot(customerId: string): SourceRiskObservationSnapshot | undefined;
}
