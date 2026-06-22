import { day1GovernedConfigSeed } from "../../config/governed.js";
import type { DeductionLine } from "../types/entities.js";
import { money } from "../types/money.js";

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

export interface GamingCandidateInput {
  customerId: string;
  deductionLines: DeductionLine[];
}

export interface GamingCandidateAssessment {
  customerId: string;
  candidate: boolean;
  intentLabel: "gaming" | "not-gaming";
  recordIds: string[];
  behavioralEvidenceIds: string[];
  deterministicBasis: {
    gamingThresholds: "owner-ratified-day-1-seed-present";
    noWrongfulContainment: true;
    rScoreComponents: {
      componentReadout: "deterministic-gaming-gate-basis";
      invalidLineCount: number;
      invalidPricingLineCount: number;
      invalidShortageLineCount: number;
      invalidValueAmount: string;
      invalidValueFloor: string;
      promoCorrelationCount: number;
      thresholdInvalidLineCount: number;
      thresholdPromoCorrelationCount: number;
      windowDays: number;
    };
  };
}

export function evaluateGamingCandidate(input: GamingCandidateInput): GamingCandidateAssessment {
  const gate = day1GovernedConfigSeed.values.gamingGate;
  const customerLines = input.deductionLines.filter((line) => line.customerId === input.customerId);
  const promoCorrelationLines = customerLines.filter((line) => line.ruleId === "promo-not-captured");
  const invalidShortageLines = customerLines.filter(
    (line) => line.routing === "recovery" && line.ruleId === "shortage-pod-mismatch"
  );
  const invalidPricingLines = customerLines.filter(
    (line) => line.routing === "recovery" && line.ruleId === "pricing-below-contract"
  );
  const invalidPatternLines = [...invalidShortageLines, ...invalidPricingLines];
  const invalidValueAmount = invalidPatternLines.reduce((total, line) => total.plus(line.amount), money("0.00"));
  const recordIds = uniqueRecordIds([
    ...promoCorrelationLines.flatMap((line) => line.recordIds),
    ...invalidPatternLines.flatMap((line) => line.recordIds)
  ]);
  const behavioralEvidenceIds = recordIds.filter(isBehavioralEvidenceId);
  const candidate =
    invalidPatternLines.length >= gate.invalidLineCount &&
    invalidValueAmount.greaterThanOrEqualTo(gate.invalidValueFloor) &&
    promoCorrelationLines.length >= gate.promoCorrelationCount &&
    invalidShortageLines.length > 0 &&
    invalidPricingLines.length > 0;

  return {
    customerId: input.customerId,
    candidate,
    intentLabel: candidate ? "gaming" : "not-gaming",
    recordIds,
    behavioralEvidenceIds,
    deterministicBasis: {
      gamingThresholds: "owner-ratified-day-1-seed-present",
      noWrongfulContainment: true,
      rScoreComponents: {
        componentReadout: "deterministic-gaming-gate-basis",
        invalidLineCount: invalidPatternLines.length,
        invalidPricingLineCount: invalidPricingLines.length,
        invalidShortageLineCount: invalidShortageLines.length,
        invalidValueAmount: invalidValueAmount.toFixed(2),
        invalidValueFloor: gate.invalidValueFloor,
        promoCorrelationCount: promoCorrelationLines.length,
        thresholdInvalidLineCount: gate.invalidLineCount,
        thresholdPromoCorrelationCount: gate.promoCorrelationCount,
        windowDays: gate.windowDays
      }
    }
  };
}

function isBehavioralEvidenceId(recordId: string): boolean {
  return !/^S\d-L\d$/u.test(recordId) && !recordId.startsWith("INV-");
}

function uniqueRecordIds(recordIds: string[]): string[] {
  return [...new Set(recordIds)];
}
