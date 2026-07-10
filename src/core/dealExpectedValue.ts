import { Decimal } from "decimal.js";
import { sha256CanonicalJson } from "../../config/governed.js";

export interface DealCandidateTerms {
  candidateId: string;
  collateralRatio: string;
  depositPct: string;
  financingSpreadBps: string;
  releasePct: string;
}

export interface DealExpectedValueOrderInput {
  orderAmount: string;
  orderId: string;
  sourceRecordIds: readonly string[];
  units: string;
}

export interface DealExpectedValueEconomicsInput {
  costOfCapitalAnnualBps: string;
  grossMarginPct: string;
  holdingCostPerUnitPerDay: string;
  sourceRecordIds: readonly string[];
}

export interface DealExpectedValueRiskInput {
  annualDefaultProbability: string;
  exposureAmount: string;
  sourceRecordIds: readonly string[];
  verdict: "CLEAR" | "ELEVATED" | "HIGH" | "WATCH";
}

export interface DealScenarioInput {
  holdingDays: number;
  probability: string;
  scenarioId: string;
  sellThroughPct: string;
  sourceRecordIds: readonly string[];
}

export interface DealExpectedValueInput {
  candidate: DealCandidateTerms;
  economics: DealExpectedValueEconomicsInput;
  order: DealExpectedValueOrderInput;
  risk: DealExpectedValueRiskInput;
  scenarios: readonly DealScenarioInput[];
  seed: 42;
}

export interface DealExpectedValueScenarioResult {
  costOfCapital: string;
  expectedDefaultLoss: string;
  holdingCost: string;
  objectiveValue: string;
  probability: string;
  revenueCaptured: string;
  scenarioId: string;
}

export interface DealExpectedValueResult {
  basis: {
    formula: "revenueCaptured - costOfCapital - holdingCost - expectedDefaultLoss";
    scenarioCount: number;
  };
  calculationHash: string;
  candidateId: string;
  objectiveValue: string;
  scenarioResults: DealExpectedValueScenarioResult[];
  sourceRecordIds: string[];
}

const one = new Decimal(1);
const hundred = new Decimal(100);
const tenThousand = new Decimal(10_000);
const daysPerYear = new Decimal(365);
const probabilitySumTolerance = new Decimal("0.000000001");

export function calculateDealExpectedValue(input: DealExpectedValueInput): DealExpectedValueResult {
  assertScenarioGrid(input.scenarios);
  const orderAmount = positiveDecimal(input.order.orderAmount, "orderAmount");
  const units = positiveDecimal(input.order.units, "units");
  const releasePct = percentDecimal(input.candidate.releasePct, "releasePct");
  const depositPct = percentDecimal(input.candidate.depositPct, "depositPct");
  const financingSpreadBps = nonNegativeDecimal(input.candidate.financingSpreadBps, "financingSpreadBps");
  nonNegativeDecimal(input.candidate.collateralRatio, "collateralRatio");
  const costOfCapitalAnnualBps = nonNegativeDecimal(input.economics.costOfCapitalAnnualBps, "costOfCapitalAnnualBps");
  const grossMarginPct = ratioDecimal(input.economics.grossMarginPct, "grossMarginPct");
  const holdingCostPerUnitPerDay = nonNegativeDecimal(input.economics.holdingCostPerUnitPerDay, "holdingCostPerUnitPerDay");
  const exposureAmount = nonNegativeDecimal(input.risk.exposureAmount, "exposureAmount");
  const annualDefaultProbability = ratioDecimal(input.risk.annualDefaultProbability, "annualDefaultProbability");

  const releaseAmount = orderAmount.times(releasePct).div(hundred);
  const depositAmount = releaseAmount.times(depositPct).div(hundred);
  const financedBalance = Decimal.max(releaseAmount.minus(depositAmount), new Decimal(0));
  const annualCostRate = costOfCapitalAnnualBps.plus(financingSpreadBps).div(tenThousand);
  const unshippedUnits = units.times(one.minus(releasePct.div(hundred)));
  let aggregateObjective = new Decimal(0);
  const scenarioResults: DealExpectedValueScenarioResult[] = [];

  for (const scenario of input.scenarios) {
    const probability = ratioDecimal(scenario.probability, `scenario ${scenario.scenarioId} probability`);
    const sellThroughPct = ratioDecimal(scenario.sellThroughPct, `scenario ${scenario.scenarioId} sellThroughPct`);
    const holdingDays = positiveIntegerDecimal(scenario.holdingDays, `scenario ${scenario.scenarioId} holdingDays`);
    const revenueCaptured = releaseAmount.times(sellThroughPct).times(grossMarginPct);
    const costOfCapital = financedBalance.times(annualCostRate).times(holdingDays).div(daysPerYear);
    const holdingCost = unshippedUnits.times(holdingCostPerUnitPerDay).times(holdingDays);
    const expectedDefaultLoss = exposureAmount.times(horizonProbability(annualDefaultProbability, holdingDays));
    const objectiveValue = revenueCaptured.minus(costOfCapital).minus(holdingCost).minus(expectedDefaultLoss);

    aggregateObjective = aggregateObjective.plus(objectiveValue.times(probability));
    scenarioResults.push({
      costOfCapital: moneyString(costOfCapital),
      expectedDefaultLoss: moneyString(expectedDefaultLoss),
      holdingCost: moneyString(holdingCost),
      objectiveValue: moneyString(objectiveValue),
      probability: probability.toFixed(2),
      revenueCaptured: moneyString(revenueCaptured),
      scenarioId: scenario.scenarioId
    });
  }

  const sourceRecordIds = dedupe([
    ...input.order.sourceRecordIds,
    ...input.economics.sourceRecordIds,
    ...input.risk.sourceRecordIds,
    ...input.scenarios.flatMap((scenario) => scenario.sourceRecordIds)
  ]);

  return {
    basis: {
      formula: "revenueCaptured - costOfCapital - holdingCost - expectedDefaultLoss",
      scenarioCount: input.scenarios.length
    },
    calculationHash: sha256CanonicalJson({ input, sourceRecordIds }),
    candidateId: input.candidate.candidateId,
    objectiveValue: moneyString(aggregateObjective),
    scenarioResults,
    sourceRecordIds
  };
}

function assertScenarioGrid(scenarios: readonly DealScenarioInput[]): void {
  if (scenarios.length === 0) {
    throw new Error("Deal expected value requires at least one scenario row.");
  }
  const probabilitySum = scenarios.reduce((sum, scenario) => sum.plus(ratioDecimal(scenario.probability, scenario.scenarioId)), new Decimal(0));
  if (probabilitySum.minus(1).abs().greaterThan(probabilitySumTolerance)) {
    throw new Error("Deal expected value scenario probabilities must sum to 1.");
  }
}

function horizonProbability(annualDefaultProbability: Decimal, holdingDays: Decimal): Decimal {
  return one.minus(one.minus(annualDefaultProbability).pow(holdingDays.div(daysPerYear)));
}

function moneyString(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function positiveDecimal(value: string, label: string): Decimal {
  const parsed = decimal(value, label);
  if (parsed.lessThanOrEqualTo(0)) {
    throw new Error(`Deal expected value ${label} must be positive.`);
  }
  return parsed;
}

function nonNegativeDecimal(value: string, label: string): Decimal {
  const parsed = decimal(value, label);
  if (parsed.lessThan(0)) {
    throw new Error(`Deal expected value ${label} must be non-negative.`);
  }
  return parsed;
}

function percentDecimal(value: string, label: string): Decimal {
  const parsed = decimal(value, label);
  if (parsed.lessThan(0) || parsed.greaterThan(100)) {
    throw new Error(`Deal expected value ${label} must be from 0 to 100.`);
  }
  return parsed;
}

function ratioDecimal(value: string, label: string): Decimal {
  const parsed = decimal(value, label);
  if (parsed.lessThan(0) || parsed.greaterThan(1)) {
    throw new Error(`Deal expected value ${label} must be from 0 to 1.`);
  }
  return parsed;
}

function positiveIntegerDecimal(value: number, label: string): Decimal {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Deal expected value ${label} must be a positive integer.`);
  }
  return new Decimal(value);
}

function decimal(value: string, label: string): Decimal {
  const parsed = new Decimal(value);
  if (!parsed.isFinite()) {
    throw new Error(`Deal expected value ${label} must be finite.`);
  }
  return parsed;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
