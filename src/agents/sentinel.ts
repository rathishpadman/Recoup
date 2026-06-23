import type { SourcePort, SourceRiskObservationSnapshot } from "../adapters/source.js";
import type { RDriftTrigger, RScoreWeights } from "../../config/governed.js";
import {
  buildBlockedRiskAssessment,
  computeRiskScore,
  evaluateRiskDrift,
  type BlockedRiskAssessment,
  type RiskDriftAssessment,
  type RiskScoreAssessment
} from "../core/risk.js";

export interface SourceNormalizedSentinelAssessment extends BlockedRiskAssessment {
  riskDrift?: RiskDriftAssessment;
  riskScore?: RiskScoreAssessment;
  sourceNormalization: {
    missingFields: string[];
    sourcePort: "SourcePort.loadRiskObservationSnapshot";
    status: "blocked_missing_source_fields" | "computed";
  };
}

export interface SentinelGovernedConfig {
  customerId: string;
  rDriftTrigger: RDriftTrigger;
  rScoreWeights: RScoreWeights;
}

const rScoreComponentFields = [
  "rScoreComponentScores.agingConcentration",
  "rScoreComponentScores.disputeRate",
  "rScoreComponentScores.dsoAdp",
  "rScoreComponentScores.overLimitFrequency"
] as const;

const rDriftObservationFields = [
  "rDriftObservations.baselineDsoDays",
  "rDriftObservations.currentDsoDays"
] as const;

export function assessHarborSentinel(
  governedConfig: SentinelGovernedConfig,
  source: SourcePort
): SourceNormalizedSentinelAssessment {
  const snapshot = source.loadRiskObservationSnapshot(governedConfig.customerId);
  if (snapshot === undefined) {
    throw new Error("Harbor Sentinel requires a cited source risk observation snapshot.");
  }
  if (snapshot.customerId !== governedConfig.customerId) {
    throw new Error("Harbor Sentinel source snapshot customer mismatch.");
  }

  return assessSentinelFromSourceSnapshot(snapshot, governedConfig);
}

export function assessSentinelFromSourceSnapshot(
  snapshot: SourceRiskObservationSnapshot,
  governedConfig: SentinelGovernedConfig
): SourceNormalizedSentinelAssessment {
  assertSourceRecordIds(snapshot.recordIds);
  const baseAssessment = buildBlockedRiskAssessment({
    customerId: snapshot.customerId,
    observedSignals: snapshot.observedSignals,
    recordIds: snapshot.recordIds
  });
  const missingRScoreFields = missingSourceRiskScoreFields(snapshot);
  const missingRDriftFields = missingSourceRiskDriftFields(snapshot);
  const missingFields = dedupeFields([...snapshot.sourceNormalization.missingFields, ...missingRScoreFields, ...missingRDriftFields]);
  const riskScore =
    missingRScoreFields.length > 0 || snapshot.rScoreComponentScores === undefined
      ? undefined
      : computeRiskScore({
          componentScores: snapshot.rScoreComponentScores,
          customerId: snapshot.customerId,
          recordIds: snapshot.recordIds,
          weights: governedConfig.rScoreWeights
        });
  const riskDrift =
    missingRDriftFields.length > 0 || snapshot.rDriftObservations === undefined
      ? undefined
      : evaluateRiskDrift({
          ...snapshot.rDriftObservations,
          customerId: snapshot.customerId,
          recordIds: snapshot.recordIds,
          trigger: governedConfig.rDriftTrigger
        });
  const sourceNormalization = {
    missingFields,
    sourcePort: snapshot.sourceNormalization.sourcePort,
    status:
      missingFields.length === 0 && riskScore !== undefined && riskDrift !== undefined
        ? "computed"
        : "blocked_missing_source_fields"
  } as const;

  return {
    ...baseAssessment,
    ...(riskDrift === undefined ? {} : { riskDrift }),
    ...(riskScore === undefined ? {} : { riskScore }),
    sourceNormalization
  };
}

function missingSourceRiskScoreFields(snapshot: SourceRiskObservationSnapshot): string[] {
  return missingObjectFields(snapshot.rScoreComponentScores, rScoreComponentFields);
}

function missingSourceRiskDriftFields(snapshot: SourceRiskObservationSnapshot): string[] {
  const observations = snapshot.rDriftObservations;
  if (observations === undefined) {
    return missingObjectFields(observations, rDriftObservationFields);
  }

  const missing = missingObjectFields(observations, rDriftObservationFields);
  if (observations.baselineDisputeRate !== undefined && observations.currentDisputeRate === undefined) {
    missing.push("rDriftObservations.currentDisputeRate");
  }
  if (observations.currentDisputeRate !== undefined && observations.baselineDisputeRate === undefined) {
    missing.push("rDriftObservations.baselineDisputeRate");
  }
  if (observations.baselineRiskTierRank !== undefined && observations.currentRiskTierRank === undefined) {
    missing.push("rDriftObservations.currentRiskTierRank");
  }
  if (observations.currentRiskTierRank !== undefined && observations.baselineRiskTierRank === undefined) {
    missing.push("rDriftObservations.baselineRiskTierRank");
  }

  return missing;
}

function dedupeFields(fields: readonly string[]): string[] {
  return [...new Set(fields)];
}

function missingObjectFields(
  value: object | undefined,
  fieldNames: readonly string[]
): string[] {
  if (value === undefined) {
    return [...fieldNames];
  }

  return fieldNames.filter((fieldName) => !Object.hasOwn(value, fieldName.split(".").at(-1) ?? fieldName));
}

function assertSourceRecordIds(recordIds: readonly string[]): void {
  if (recordIds.length === 0 || recordIds.some((recordId) => recordId.trim().length === 0)) {
    throw new Error("Sentinel source snapshots require cited recordIds.");
  }
}
