export const seed = 42 as const;

export const partialHoldThresholds = {
  holdBelow: 40,
  partialFrom: 40,
  partialThrough: 60,
  shipAbove: 60,
  releaseStepPercent: 5,
  minPartialReleasePercent: 40,
  maxPartialReleasePercent: 70
} as const;

export const decisionEvalBars = {
  deductionValidityAccuracy: 0.9,
  intentPrecision: 0.9,
  arbitrationAgreement: 0.85
} as const;
