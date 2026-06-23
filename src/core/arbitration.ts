import type { ArbitrationPnlWeights } from "../../config/governed.js";
import { Decimal } from "decimal.js";

export type ArbitrationFunction = keyof ArbitrationPnlWeights;

export interface ArbitrationPosition {
  functionName: ArbitrationFunction;
  optionId: string;
  optionValue?: string | undefined;
  position: string;
  recordIds: string[];
}

export interface ArbitrateRiskMeshInput {
  caseId: string;
  positions: ArbitrationPosition[];
  weights: ArbitrationPnlWeights;
}

export interface BlockedArbitrationResult {
  caseId: string;
  status: "blocked";
  reason: "verify-prod-calibration-required";
  recordIds: string[];
  deterministicBasis: {
    positionCount: number;
    weightSource: ArbitrationPnlWeights;
  };
}

export interface RankedArbitrationContribution {
  functionName: ArbitrationFunction;
  optionValue: string;
  recordIds: string[];
  weight: number;
  weightedContribution: string;
}

export interface RankedArbitrationOption {
  contributions: RankedArbitrationContribution[];
  optionId: string;
  recordIds: string[];
  weightedValue: string;
}

export interface RankedArbitrationResult {
  caseId: string;
  status: "ranked";
  resolution: string;
  rankedOptions: RankedArbitrationOption[];
  recordIds: string[];
  deterministicBasis: {
    formula: "sum(optionValue * expertWeight)";
    positionCount: number;
    weightSource: ArbitrationPnlWeights;
  };
}

export type ArbitrationResult = BlockedArbitrationResult | RankedArbitrationResult;

export function arbitrateRiskMesh(input: ArbitrateRiskMeshInput): ArbitrationResult {
  if (input.positions.some((position) => position.optionValue === undefined)) {
    return buildBlockedResult(input);
  }

  const rankedOptions = rankOptions(input);
  if (rankedOptions.length === 0) {
    return buildBlockedResult(input);
  }
  const topOption = rankedOptions[0];
  if (topOption === undefined) {
    return buildBlockedResult(input);
  }

  return {
    caseId: input.caseId,
    status: "ranked",
    resolution: topOption.optionId,
    rankedOptions,
    recordIds: unique(input.positions.flatMap((position) => position.recordIds)),
    deterministicBasis: {
      formula: "sum(optionValue * expertWeight)",
      positionCount: input.positions.length,
      weightSource: input.weights
    }
  };
}

function buildBlockedResult(input: ArbitrateRiskMeshInput): BlockedArbitrationResult {
  return {
    caseId: input.caseId,
    status: "blocked",
    reason: "verify-prod-calibration-required",
    recordIds: unique(input.positions.flatMap((position) => position.recordIds)),
    deterministicBasis: {
      positionCount: input.positions.length,
      weightSource: input.weights
    }
  };
}

function rankOptions(input: ArbitrateRiskMeshInput): RankedArbitrationOption[] {
  const positionsByOption = new Map<string, ArbitrationPosition[]>();

  for (const position of input.positions) {
    const optionPositions = positionsByOption.get(position.optionId) ?? [];
    optionPositions.push(position);
    positionsByOption.set(position.optionId, optionPositions);
  }

  return [...positionsByOption.entries()]
    .map(([optionId, positions]) => buildRankedOption(optionId, positions, input.weights))
    .sort((left, right) => {
      const valueComparison = new Decimal(right.weightedValue).comparedTo(left.weightedValue);
      return valueComparison === 0 ? left.optionId.localeCompare(right.optionId) : valueComparison;
    });
}

function buildRankedOption(
  optionId: string,
  positions: ArbitrationPosition[],
  weights: ArbitrationPnlWeights
): RankedArbitrationOption {
  const contributions = positions.map((position) => {
    const optionValue = decimalFromOptionValue(position.optionValue);
    const weight = weights[position.functionName];
    const weightedContribution = optionValue.mul(weight);

    return {
      functionName: position.functionName,
      optionValue: optionValue.toFixed(2),
      recordIds: position.recordIds,
      weight,
      weightedContribution: weightedContribution.toFixed(4)
    };
  });
  const weightedValue = contributions.reduce(
    (total, contribution) => total.plus(contribution.weightedContribution),
    new Decimal(0)
  );

  return {
    contributions,
    optionId,
    recordIds: unique(positions.flatMap((position) => position.recordIds)),
    weightedValue: weightedValue.toFixed(4)
  };
}

function decimalFromOptionValue(value: string | undefined): Decimal {
  if (value === undefined || !/^-?\d+(\.\d+)?$/u.test(value)) {
    throw new Error("Arbitration option values must be explicit finite decimal strings.");
  }

  const decimal = new Decimal(value);
  if (!decimal.isFinite()) {
    throw new Error("Arbitration option values must be finite.");
  }

  return decimal;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
