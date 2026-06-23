import type { GamingGate, RDriftTrigger, RScoreWeights } from "../../config/governed.js";
import type { DeductionLine } from "../types/entities.js";
import { money } from "../types/money.js";
import { Decimal } from "decimal.js";

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

export interface RiskScoreComponentScores {
  agingConcentration: number;
  disputeRate: number;
  dsoAdp: number;
  overLimitFrequency: number;
}

export interface RiskScoreInput {
  componentScores: RiskScoreComponentScores;
  customerId: string;
  recordIds: string[];
  weights: RScoreWeights;
}

export interface RiskScoreAssessment {
  customerId: string;
  recordIds: string[];
  score: Decimal;
  status: "computed_from_supplied_components";
  deterministicBasis: {
    componentValueBounds: "caller-supplied-0-100-component-values";
    componentScores: RiskScoreComponentScores;
    rScoreWeights: "governed-config-snapshot";
    sourceNormalization: "caller-supplied-component-values";
    weightedComponents: Record<keyof RiskScoreComponentScores, string>;
  };
}

export interface RiskDriftInput {
  baselineDsoDays: number;
  currentDsoDays: number;
  customerId: string;
  recordIds: string[];
  trigger: RDriftTrigger;
  baselineDisputeRate?: number;
  baselineRiskTierRank?: number;
  cooldownDaysSinceLastReview?: number;
  currentDisputeRate?: number;
  currentRiskTierRank?: number;
}

export interface RiskDriftAssessment {
  customerId: string;
  drifted: boolean;
  recordIds: string[];
  status: "computed_from_supplied_observations";
  deterministicBasis: {
    computedDsoIncreaseDays: number;
    computedDisputeRateRelativeIncrease: string | null;
    computedRiskTierDowngrade: number | null;
    observedSignals: Omit<RiskDriftInput, "customerId" | "recordIds" | "trigger">;
    rDriftTrigger: "governed-config-snapshot";
    triggered: {
      cooldownSatisfied: boolean;
      disputeRateRelativeIncrease: boolean;
      dsoIncreaseDays: boolean;
      riskTierDowngrade: boolean;
    };
  };
}

export interface BlockedRiskAssessment {
  customerId: string;
  status: "blocked";
  reason: "source-risk-observation-fields-required";
  recordIds: string[];
  deterministicBasis: {
    rDriftTrigger: "governed-config-snapshot";
    rScoreWeights: "governed-config-snapshot";
    governedConfigSnapshot: "governed-config-snapshot";
    observedSignals: RiskObservationInput["observedSignals"];
  };
}

export function computeRiskScore(input: RiskScoreInput): RiskScoreAssessment {
  assertRecordIds(input.recordIds);
  assertRiskScoreComponents(input.componentScores);
  const weights = input.weights;
  const weightedComponents = {
    agingConcentration: new Decimal(input.componentScores.agingConcentration).times(weights.agingConcentration),
    disputeRate: new Decimal(input.componentScores.disputeRate).times(weights.disputeRate),
    dsoAdp: new Decimal(input.componentScores.dsoAdp).times(weights.dsoAdp),
    overLimitFrequency: new Decimal(input.componentScores.overLimitFrequency).times(weights.overLimitFrequency)
  } satisfies Record<keyof RiskScoreComponentScores, Decimal>;
  const score = Object.values(weightedComponents).reduce((total, component) => total.plus(component), new Decimal(0));

  return {
    customerId: input.customerId,
    recordIds: [...input.recordIds],
    score,
    status: "computed_from_supplied_components",
    deterministicBasis: {
      componentValueBounds: "caller-supplied-0-100-component-values",
      componentScores: { ...input.componentScores },
      rScoreWeights: "governed-config-snapshot",
      sourceNormalization: "caller-supplied-component-values",
      weightedComponents: {
        agingConcentration: weightedComponents.agingConcentration.toFixed(2),
        disputeRate: weightedComponents.disputeRate.toFixed(2),
        dsoAdp: weightedComponents.dsoAdp.toFixed(2),
        overLimitFrequency: weightedComponents.overLimitFrequency.toFixed(2)
      }
    }
  };
}

export function evaluateRiskDrift(input: RiskDriftInput): RiskDriftAssessment {
  assertRecordIds(input.recordIds);
  assertRiskDriftInput(input);
  const trigger = input.trigger;
  const dsoIncrease = input.currentDsoDays - input.baselineDsoDays;
  const disputeRateRelativeIncrease = hasDisputeRatePair(input)
    ? new Decimal(input.currentDisputeRate).minus(input.baselineDisputeRate).dividedBy(input.baselineDisputeRate)
    : undefined;
  const riskTierDowngrade = hasRiskTierPair(input)
    ? input.currentRiskTierRank - input.baselineRiskTierRank
    : undefined;
  const triggered = {
    cooldownSatisfied:
      input.cooldownDaysSinceLastReview === undefined || input.cooldownDaysSinceLastReview >= trigger.cooldownDays,
    disputeRateRelativeIncrease:
      disputeRateRelativeIncrease?.greaterThanOrEqualTo(trigger.disputeRateRelativeIncrease) ?? false,
    dsoIncreaseDays: dsoIncrease >= trigger.dsoIncreaseDays,
    riskTierDowngrade: riskTierDowngrade === undefined ? false : riskTierDowngrade >= trigger.riskTierDowngrade
  };

  return {
    customerId: input.customerId,
    drifted:
      triggered.cooldownSatisfied &&
      (triggered.disputeRateRelativeIncrease || triggered.dsoIncreaseDays || triggered.riskTierDowngrade),
    recordIds: [...input.recordIds],
    status: "computed_from_supplied_observations",
    deterministicBasis: {
      computedDsoIncreaseDays: dsoIncrease,
      computedDisputeRateRelativeIncrease: disputeRateRelativeIncrease?.toFixed(4) ?? null,
      computedRiskTierDowngrade: riskTierDowngrade ?? null,
      observedSignals: {
        baselineDsoDays: input.baselineDsoDays,
        currentDsoDays: input.currentDsoDays,
        ...(input.baselineDisputeRate === undefined ? {} : { baselineDisputeRate: input.baselineDisputeRate }),
        ...(input.baselineRiskTierRank === undefined ? {} : { baselineRiskTierRank: input.baselineRiskTierRank }),
        ...(input.cooldownDaysSinceLastReview === undefined
          ? {}
          : { cooldownDaysSinceLastReview: input.cooldownDaysSinceLastReview }),
        ...(input.currentDisputeRate === undefined ? {} : { currentDisputeRate: input.currentDisputeRate }),
        ...(input.currentRiskTierRank === undefined ? {} : { currentRiskTierRank: input.currentRiskTierRank })
      },
      rDriftTrigger: "governed-config-snapshot",
      triggered
    }
  };
}

export function buildBlockedRiskAssessment(input: RiskObservationInput): BlockedRiskAssessment {
  return {
    customerId: input.customerId,
    status: "blocked",
    reason: "source-risk-observation-fields-required",
    recordIds: [...input.recordIds],
    deterministicBasis: {
      rDriftTrigger: "governed-config-snapshot",
      rScoreWeights: "governed-config-snapshot",
      governedConfigSnapshot: "governed-config-snapshot",
      observedSignals: { ...input.observedSignals }
    }
  };
}

function assertRiskScoreComponents(componentScores: RiskScoreComponentScores): void {
  for (const [component, value] of Object.entries(componentScores)) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error(`R-score component ${component} must be a supplied finite 0-100 component value.`);
    }
  }
}

function assertRiskDriftInput(input: RiskDriftInput): void {
  const values = {
    baselineDsoDays: input.baselineDsoDays,
    currentDsoDays: input.currentDsoDays,
    ...(input.baselineDisputeRate === undefined ? {} : { baselineDisputeRate: input.baselineDisputeRate }),
    ...(input.baselineRiskTierRank === undefined ? {} : { baselineRiskTierRank: input.baselineRiskTierRank }),
    ...(input.cooldownDaysSinceLastReview === undefined
      ? {}
      : { cooldownDaysSinceLastReview: input.cooldownDaysSinceLastReview }),
    ...(input.currentDisputeRate === undefined ? {} : { currentDisputeRate: input.currentDisputeRate }),
    ...(input.currentRiskTierRank === undefined ? {} : { currentRiskTierRank: input.currentRiskTierRank })
  };

  for (const [field, value] of Object.entries(values)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`R-drift input ${field} must be a non-negative finite number.`);
    }
  }

  if (
    (input.baselineDisputeRate === undefined) !== (input.currentDisputeRate === undefined)
  ) {
    throw new Error("R-drift dispute-rate observations must include both baseline and current values.");
  }
  if (
    (input.baselineRiskTierRank === undefined) !== (input.currentRiskTierRank === undefined)
  ) {
    throw new Error("R-drift risk-tier observations must include both baseline and current values.");
  }
  if (
    input.baselineDisputeRate !== undefined &&
    input.currentDisputeRate !== undefined &&
    input.baselineDisputeRate === 0 &&
    input.currentDisputeRate > 0
  ) {
    throw new Error("R-drift dispute-rate relative increase requires a positive baseline dispute rate.");
  }
}

function hasDisputeRatePair(
  input: RiskDriftInput
): input is RiskDriftInput & { baselineDisputeRate: number; currentDisputeRate: number } {
  return input.baselineDisputeRate !== undefined && input.currentDisputeRate !== undefined;
}

function hasRiskTierPair(
  input: RiskDriftInput
): input is RiskDriftInput & { baselineRiskTierRank: number; currentRiskTierRank: number } {
  return input.baselineRiskTierRank !== undefined && input.currentRiskTierRank !== undefined;
}

function assertRecordIds(recordIds: string[]): void {
  if (recordIds.length === 0 || recordIds.some((recordId) => recordId.trim().length === 0)) {
    throw new Error("Risk assessments require cited recordIds.");
  }
}

export interface GamingCandidateInput {
  customerId: string;
  deductionLines: DeductionLine[];
  gate: GamingGate;
}

export interface GamingCandidateAssessment {
  customerId: string;
  candidate: boolean;
  intentLabel: "gaming" | "not-gaming";
  recordIds: string[];
  behavioralEvidenceIds: string[];
  deterministicBasis: {
    gamingThresholds: "governed-config-snapshot";
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
  const gate = input.gate;
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
      gamingThresholds: "governed-config-snapshot",
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
