import { Decimal } from "decimal.js";
import { partialHoldThresholds } from "../../config/thresholds.js";
import type { Money } from "../types/money.js";

export type PartialHoldCriterion =
  | "orderValueVsExposure"
  | "customerStrategicValue"
  | "dsoPaymentDrift"
  | "orderMargin"
  | "revenueForecast"
  | "paymentPattern";

export type PartialHoldWeights = Record<PartialHoldCriterion, number>;
export type PartialHoldScores = Record<PartialHoldCriterion, number>;

export interface PartialHoldInput {
  weights: PartialHoldWeights;
  scores: PartialHoldScores;
}

export interface PartialHoldResult {
  compositeScore: Decimal;
  releaseRatioPercent: Decimal;
}

export interface PartialHoldAmountSplit {
  orderAmount: Money;
  proposedReleaseAmount: Money;
  proposedBackOrderAmount: Money;
  releaseRatioPercent: Decimal;
  amountSource: "partial-hold-core";
}

export interface PartialHoldAmountSplitInput {
  orderAmount: Money;
  releaseRatioPercent: Decimal;
}

export function computePartialHold(input: PartialHoldInput): PartialHoldResult {
  const compositeScore = Object.entries(input.weights).reduce((total, [criterion, weight]) => {
    const score = input.scores[criterion as PartialHoldCriterion];
    return total.plus(new Decimal(score).times(weight));
  }, new Decimal(0));

  return {
    compositeScore,
    releaseRatioPercent: releaseRatioForComposite(compositeScore)
  };
}

export function computePartialHoldAmountSplit(input: PartialHoldAmountSplitInput): PartialHoldAmountSplit {
  const proposedReleaseAmount = input.orderAmount.times(input.releaseRatioPercent).dividedBy(100).toDecimalPlaces(2);

  return {
    orderAmount: input.orderAmount,
    proposedReleaseAmount,
    proposedBackOrderAmount: input.orderAmount.minus(proposedReleaseAmount).toDecimalPlaces(2),
    releaseRatioPercent: input.releaseRatioPercent,
    amountSource: "partial-hold-core"
  };
}

function releaseRatioForComposite(compositeScore: Decimal): Decimal {
  if (compositeScore.lessThan(partialHoldThresholds.partialFrom)) {
    return new Decimal(0);
  }

  if (compositeScore.greaterThan(partialHoldThresholds.partialThrough)) {
    return new Decimal(100);
  }

  const stepped = compositeScore
    .dividedBy(partialHoldThresholds.releaseStepPercent)
    .ceil()
    .times(partialHoldThresholds.releaseStepPercent);

  return Decimal.min(
    Decimal.max(stepped, partialHoldThresholds.minPartialReleasePercent),
    partialHoldThresholds.maxPartialReleasePercent
  );
}
