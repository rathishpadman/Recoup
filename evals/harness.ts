import type { DeductionLine, DeductionVerdict } from "../src/types/entities.js";
import { evaluateRule, type RuleInput } from "../src/core/rules/index.js";
import { money } from "../src/types/money.js";

export interface MetricCase<T> {
  predicted: T;
  actual: T;
}

export type DeductionEvaluationLabel = DeductionVerdict | "suppressed";

export type MetricGateResult =
  | { status: "pass" | "fail"; score: number; threshold: number }
  | { status: "blocked"; reason: string };

export interface RecoveryDecision {
  lineId: string;
  pursueRecovery: boolean;
}

export type IntentLabel = "gaming" | "distressed-honest" | "genuine";

export interface CustomerIntentLabel {
  customerId: string;
  intentLabel: IntentLabel;
}

export interface ContainmentDecision {
  customerId: string;
  contained: boolean;
}

export interface FalsePositiveGateResult {
  status: "pass" | "fail";
  falsePositiveCount: number;
  violations: string[];
}

export interface AccuracyBarThresholds {
  deductionValidityAccuracy: number;
  intentPrecision: number;
  arbitrationAgreement: number;
}

export interface AccuracyBarReportInput {
  deductionValidityCases: Array<MetricCase<DeductionEvaluationLabel>>;
  intentCases: Array<MetricCase<IntentLabel>>;
  arbitrationCases: Array<MetricCase<string>>;
  thresholds: AccuracyBarThresholds;
  requiredIntentLabelCount: number;
  requiredArbitrationLabelCount: number;
}

export interface AccuracyBarReport {
  deductionValidity: MetricGateResult;
  intentPrecision: MetricGateResult;
  arbitrationAgreement: MetricGateResult;
}

export interface ReleaseReadinessRunControl {
  status: "pass" | "blocked";
  reason?: string;
  openDependencies?: string[];
}

export type ReleaseReadinessGate =
  | "run-control"
  | "deduction-validity"
  | "intent-precision"
  | "arbitration-agreement";

export interface ReleaseReadinessBlocker {
  gate: ReleaseReadinessGate;
  reason: string;
  openDependencies?: string[];
  score?: number;
  threshold?: number;
}

export interface ReleaseReadinessReportInput {
  runControl: ReleaseReadinessRunControl;
  accuracyBars: AccuracyBarReport;
}

export type ReleaseReadinessReport =
  | { status: "pass"; blockers: [] }
  | { status: "fail"; blockers: [ReleaseReadinessBlocker, ...ReleaseReadinessBlocker[]] };

export function buildCanonicalDeductionValidityCases(
  lines: DeductionLine[]
): Array<MetricCase<DeductionEvaluationLabel>> {
  return lines.map((line) => {
    const input = buildCanonicalRuleInput(line);
    const finding = evaluateRule(input.ruleId, input);

    return {
      predicted: finding === undefined ? "suppressed" : verdictForRuleId(finding.ruleId),
      actual: line.verdict
    };
  });
}

export function findValidDeductionsPursued(lines: DeductionLine[], decisions: RecoveryDecision[]): string[] {
  const decisionByLineId = new Map(decisions.map((decision) => [decision.lineId, decision]));

  return lines
    .filter((line) => line.verdict === "valid")
    .filter((line) => decisionByLineId.get(line.lineId)?.pursueRecovery === true)
    .map((line) => line.lineId);
}

export function findWrongfulContainments(
  labels: CustomerIntentLabel[],
  decisions: ContainmentDecision[]
): string[] {
  const decisionByCustomerId = new Map(decisions.map((decision) => [decision.customerId, decision]));

  return labels
    .filter((label) => label.intentLabel === "distressed-honest")
    .filter((label) => decisionByCustomerId.get(label.customerId)?.contained === true)
    .map((label) => label.customerId);
}

export function evaluateFalsePositiveGate(violations: string[]): FalsePositiveGateResult {
  return {
    status: violations.length === 0 ? "pass" : "fail",
    falsePositiveCount: violations.length,
    violations
  };
}

function verdictForRuleId(ruleId: string): DeductionVerdict {
  switch (ruleId) {
    case "damage-evidence-valid":
    case "promo-not-captured":
    case "otif-fine-valid":
      return "valid";
    case "shortage-pod-mismatch":
    case "otif-timestamp-mismatch":
    case "pricing-below-contract":
    case "duplicate-credit":
      return "invalid";
    case "promo-overclaim":
      return "partial";
    default:
      throw new Error(`Unknown canonical deduction validity ruleId: ${ruleId}`);
  }
}

export function calculateAccuracy<T>(cases: Array<MetricCase<T>>): number {
  if (cases.length === 0) {
    return 0;
  }

  const matches = cases.filter((metricCase) => metricCase.predicted === metricCase.actual).length;
  return matches / cases.length;
}

export function calculatePrecision<T>(cases: Array<MetricCase<T>>, positiveLabel: T): number {
  const positivePredictions = cases.filter((metricCase) => metricCase.predicted === positiveLabel);
  if (positivePredictions.length === 0) {
    return 0;
  }

  const truePositives = positivePredictions.filter((metricCase) => metricCase.actual === positiveLabel).length;
  return truePositives / positivePredictions.length;
}

export function calculateAgreement<T>(cases: Array<MetricCase<T>>): number {
  return calculateAccuracy(cases);
}

export function evaluateMetricGate<T>(
  cases: Array<MetricCase<T>>,
  metric: (cases: Array<MetricCase<T>>) => number,
  threshold: number,
  blockedReason?: string
): MetricGateResult {
  if (cases.length === 0 && blockedReason !== undefined) {
    return { status: "blocked", reason: blockedReason };
  }

  const score = metric(cases);
  return {
    status: score >= threshold ? "pass" : "fail",
    score,
    threshold
  };
}

function evaluateCompleteMetricGate<T>(
  cases: Array<MetricCase<T>>,
  metric: (cases: Array<MetricCase<T>>) => number,
  threshold: number,
  blockedReason: string,
  requiredCaseCount: number
): MetricGateResult {
  if (!Number.isFinite(requiredCaseCount) || cases.length < requiredCaseCount) {
    return { status: "blocked", reason: blockedReason };
  }

  return evaluateMetricGate(cases, metric, threshold, blockedReason);
}

export function buildAccuracyBarReport(input: AccuracyBarReportInput): AccuracyBarReport {
  return {
    deductionValidity: evaluateMetricGate(
      input.deductionValidityCases,
      calculateAccuracy,
      input.thresholds.deductionValidityAccuracy
    ),
    intentPrecision: evaluateCompleteMetricGate(
      input.intentCases,
      (cases) => calculatePrecision(cases, "gaming"),
      input.thresholds.intentPrecision,
      "complete intent labels unavailable",
      input.requiredIntentLabelCount
    ),
    arbitrationAgreement: evaluateCompleteMetricGate(
      input.arbitrationCases,
      calculateAgreement,
      input.thresholds.arbitrationAgreement,
      "arbitration expert labels unavailable",
      input.requiredArbitrationLabelCount
    )
  };
}

export function buildReleaseReadinessReport(input: ReleaseReadinessReportInput): ReleaseReadinessReport {
  const blockers: ReleaseReadinessBlocker[] = [];

  if (input.runControl.status === "blocked") {
    blockers.push({
      gate: "run-control",
      reason: input.runControl.reason ?? "run-control blocked",
      ...(input.runControl.openDependencies !== undefined
        ? { openDependencies: input.runControl.openDependencies }
        : {})
    });
  }

  collectMetricBlocker(blockers, "deduction-validity", input.accuracyBars.deductionValidity);
  collectMetricBlocker(blockers, "intent-precision", input.accuracyBars.intentPrecision);
  collectMetricBlocker(blockers, "arbitration-agreement", input.accuracyBars.arbitrationAgreement);

  if (blockers.length === 0) {
    return { status: "pass", blockers: [] };
  }

  return { status: "fail", blockers: blockers as [ReleaseReadinessBlocker, ...ReleaseReadinessBlocker[]] };
}

function collectMetricBlocker(
  blockers: ReleaseReadinessBlocker[],
  gate: ReleaseReadinessGate,
  result: MetricGateResult
): void {
  if (result.status === "blocked") {
    blockers.push({ gate, reason: result.reason });
    return;
  }

  if (result.status === "fail") {
    blockers.push({
      gate,
      reason: "release-blocking metric below threshold",
      score: result.score,
      threshold: result.threshold
    });
  }
}

function buildCanonicalRuleInput(line: DeductionLine): RuleInput {
  const base = {
    lineId: line.lineId,
    period: line.period,
    recordIds: line.recordIds,
    claimedAmount: line.amount
  };

  switch (line.ruleId) {
    case "damage-evidence-valid":
      return {
        ...base,
        ruleId: line.ruleId,
        damagedGoodsAmount: line.amount,
        salvageCreditAmount: money("0.00"),
        photoEvidenceReceived: true,
        carrierReportReceived: true
      };
    case "promo-not-captured":
      return {
        ...base,
        ruleId: line.ruleId,
        approvedPromoAccrual: line.amount,
        capturedPromoCredit: money("0.00"),
        approvedPromoExists: true,
        invoiceBilledAtList: true
      };
    case "shortage-pod-mismatch":
      return {
        ...base,
        ruleId: line.ruleId,
        allowedShortageAmount: money("0.00"),
        claimedShortage: true,
        podSignedFullDelivery: true
      };
    case "otif-fine-valid":
      return {
        ...base,
        ruleId: line.ruleId,
        allowedFineAmount: line.amount,
        contractSlaAllowsFine: true,
        slaBreachConfirmed: true
      };
    case "otif-timestamp-mismatch":
      return {
        ...base,
        ruleId: line.ruleId,
        allowedFineAmount: money("0.00"),
        otifFineAssessed: true,
        podTimestampOnTime: true
      };
    case "pricing-below-contract":
      return {
        ...base,
        ruleId: line.ruleId,
        contractedUnitPrice: line.amount,
        deliveredQuantity: "1",
        actualPaidAmount: money("0.00"),
        deductedBelowContractPrice: true,
        contractPriceAvailable: true
      };
    case "promo-overclaim":
      return {
        ...base,
        ruleId: line.ruleId,
        claimedAllowance: line.amount,
        approvedAccrual: money("0.00"),
        approvedAccrualExceeded: true
      };
    case "duplicate-credit":
      return {
        ...base,
        ruleId: line.ruleId,
        priorCreditAmount: line.amount,
        alreadyCredited: true
      };
    default:
      throw new Error(`Unknown canonical deduction validity ruleId: ${line.ruleId}`);
  }
}
