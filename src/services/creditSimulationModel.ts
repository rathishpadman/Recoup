import { Decimal } from "decimal.js";
import { day1GovernedConfigSeed, sha256CanonicalJson } from "../../config/governed.js";
import {
  computePartialHold,
  computePartialHoldAmountSplit,
  type PartialHoldCriterion,
  type PartialHoldScores,
  type PartialHoldWeights
} from "../core/partialHold.js";
import { proposeTerms } from "../tools/actions/proposeTerms.js";
import { money } from "../types/money.js";
import type { CreditRiskRows } from "./creditRiskModel.js";

export const partialHoldSimulationCriteria = [
  "orderValueVsExposure",
  "customerStrategicValue",
  "dsoPaymentDrift",
  "orderMargin",
  "revenueForecast",
  "paymentPattern"
] as const satisfies readonly PartialHoldCriterion[];

export interface CreditSimulationInput {
  accountId: string;
  scoreOverrides?: Partial<Record<PartialHoldCriterion, number>> | undefined;
  weightOverrides?: Partial<Record<PartialHoldCriterion, number>> | undefined;
}

export interface CreditSimulationModel {
  accountId: string;
  amountSplit: {
    amountSource: "partial-hold-core";
    orderAmount: string;
    orderAmountLabel: string;
    proposedBackOrderAmount: string;
    proposedBackOrderAmountLabel: string;
    proposedReleaseAmount: string;
    proposedReleaseAmountLabel: string;
  };
  appliedOverrides: {
    scoreOverrides: Partial<Record<PartialHoldCriterion, number>>;
    weightOverrides: Partial<Record<PartialHoldCriterion, number>>;
  };
  compositeScore: string;
  compositeScoreLabel: string;
  deterministicBasis: {
    partialHoldCore: "computePartialHold + computePartialHoldAmountSplit";
    policyHash: string;
    sourceHash: string;
    termsTool: "proposeTerms draft-only";
  };
  externalActionDispatched: false;
  recordIds: string[];
  releaseRatioPercent: string;
  releaseRatioPercentLabel: string;
  sensitivityLine: string;
  terms: {
    actionId: string;
    actionType: "propose-terms";
    dispatchedExternally: false;
    requiresHumanApproval: true;
    status: "pending_human";
    terms: string;
  };
}

export class CreditSimulationMissingSourceError extends Error {
  readonly missingSource = "credit-simulation-partial-hold-scores" as const;

  constructor(accountId: string) {
    super(`Credit simulation missing partial-hold scores for account ${accountId}.`);
    this.name = "CreditSimulationMissingSourceError";
  }
}

const harborCreditAccountId = "ACC-HAR";
const governedConfig = day1GovernedConfigSeed.values;
const harborSimulationSource = governedConfig.riskMeshCases.harbor;

export function buildCreditSimulationModel(input: CreditSimulationInput, rows: CreditRiskRows): CreditSimulationModel {
  const account = rows.accounts.find((row) => row.accountId === input.accountId);
  if (account === undefined || account.accountId !== harborCreditAccountId) {
    throw new CreditSimulationMissingSourceError(input.accountId);
  }

  const appliedScoreOverrides = normalizeScoreOverrides(input.scoreOverrides ?? {});
  const appliedWeightOverrides = normalizeWeightOverrides(input.weightOverrides ?? {});
  const scores = assertCompleteScores({
    ...harborSimulationSource.partialHoldScores,
    ...appliedScoreOverrides
  });
  const weights = assertCompleteWeights({
    ...governedConfig.partialHold.weights,
    ...appliedWeightOverrides
  });
  const partialHold = computePartialHold({
    scores,
    thresholds: governedConfig.partialHold.thresholds,
    weights
  });
  const amountSplit = computePartialHoldAmountSplit({
    orderAmount: money(harborSimulationSource.orderAmount),
    releaseRatioPercent: partialHold.releaseRatioPercent
  });
  const recordIds = dedupe([account.accountId, harborSimulationSource.customerId, harborSimulationSource.orderId, ...harborSimulationSource.recordIds]);
  const observedSignals = buildTermsObservedSignals(account.accountId, rows);
  const terms = proposeTerms({
    basis: harborSimulationSource.termsBasis,
    customerId: harborSimulationSource.customerId,
    deterministicBasis: {
      governedConfigSnapshot: "governed-config-snapshot",
      observedSignals,
      rDriftTrigger: "governed-config-snapshot",
      rScoreWeights: "governed-config-snapshot"
    },
    recordIds,
    terms: harborSimulationSource.terms
  });
  const sourceHash = sha256CanonicalJson({
    accountId: account.accountId,
    appliedScoreOverrides,
    appliedWeightOverrides,
    orderAmount: harborSimulationSource.orderAmount,
    recordIds,
    scores,
    thresholds: governedConfig.partialHold.thresholds,
    weights
  });

  return {
    accountId: account.accountId,
    amountSplit: {
      amountSource: amountSplit.amountSource,
      orderAmount: amountSplit.orderAmount.toFixed(2),
      orderAmountLabel: formatMoney(amountSplit.orderAmount),
      proposedBackOrderAmount: amountSplit.proposedBackOrderAmount.toFixed(2),
      proposedBackOrderAmountLabel: formatMoney(amountSplit.proposedBackOrderAmount),
      proposedReleaseAmount: amountSplit.proposedReleaseAmount.toFixed(2),
      proposedReleaseAmountLabel: formatMoney(amountSplit.proposedReleaseAmount)
    },
    appliedOverrides: {
      scoreOverrides: appliedScoreOverrides,
      weightOverrides: appliedWeightOverrides
    },
    compositeScore: partialHold.compositeScore.toFixed(2),
    compositeScoreLabel: trimTrailingZeros(partialHold.compositeScore.toFixed(2)),
    deterministicBasis: {
      partialHoldCore: "computePartialHold + computePartialHoldAmountSplit",
      policyHash: day1GovernedConfigSeed.configHash,
      sourceHash,
      termsTool: "proposeTerms draft-only"
    },
    externalActionDispatched: false,
    recordIds,
    releaseRatioPercent: partialHold.releaseRatioPercent.toFixed(2),
    releaseRatioPercentLabel: `${trimTrailingZeros(partialHold.releaseRatioPercent.toFixed(2))}%`,
    sensitivityLine: buildSensitivityLine(partialHold.compositeScore),
    terms: {
      actionId: terms.actionId,
      actionType: terms.actionType,
      dispatchedExternally: terms.dispatchedExternally,
      requiresHumanApproval: terms.requiresHumanApproval,
      status: terms.status,
      terms: terms.terms
    }
  };
}

function normalizeScoreOverrides(
  overrides: Partial<Record<PartialHoldCriterion, number>>
): Partial<Record<PartialHoldCriterion, number>> {
  return normalizeOverrides(overrides, 0, 100);
}

function normalizeWeightOverrides(
  overrides: Partial<Record<PartialHoldCriterion, number>>
): Partial<Record<PartialHoldCriterion, number>> {
  return normalizeOverrides(overrides, 0, 1);
}

function normalizeOverrides(
  overrides: Partial<Record<PartialHoldCriterion, number>>,
  min: number,
  max: number
): Partial<Record<PartialHoldCriterion, number>> {
  const normalized: Partial<Record<PartialHoldCriterion, number>> = {};
  for (const criterion of partialHoldSimulationCriteria) {
    const value = overrides[criterion];
    if (value === undefined) {
      continue;
    }
    if (!Number.isFinite(value)) {
      throw new Error(`Credit simulation override ${criterion} must be finite.`);
    }
    normalized[criterion] = Math.min(Math.max(value, min), max);
  }
  return normalized;
}

function assertCompleteScores(scores: Partial<Record<PartialHoldCriterion, number>>): PartialHoldScores {
  const normalized = {} as PartialHoldScores;
  for (const criterion of partialHoldSimulationCriteria) {
    const value = scores[criterion];
    if (value === undefined || !Number.isFinite(value)) {
      throw new Error(`Credit simulation missing score ${criterion}.`);
    }
    normalized[criterion] = value;
  }
  return normalized;
}

function assertCompleteWeights(weights: Partial<Record<PartialHoldCriterion, number>>): PartialHoldWeights {
  const normalized = {} as PartialHoldWeights;
  for (const criterion of partialHoldSimulationCriteria) {
    const value = weights[criterion];
    if (value === undefined || !Number.isFinite(value)) {
      throw new Error(`Credit simulation missing weight ${criterion}.`);
    }
    normalized[criterion] = value;
  }
  return normalized;
}

function buildSensitivityLine(compositeScore: Decimal): string {
  const partialThrough = new Decimal(governedConfig.partialHold.thresholds.partialThrough);
  if (compositeScore.greaterThan(partialThrough)) {
    return `Composite score is ${trimTrailingZeros(compositeScore.toFixed(2))}; full release threshold is already met.`;
  }

  return `Composite score would need to rise from ${trimTrailingZeros(compositeScore.toFixed(2))} to above ${partialThrough.toFixed(
    2
  )} before full release.`;
}

function buildTermsObservedSignals(accountId: string, rows: CreditRiskRows): {
  baselineDsoDays: number;
  currentDsoDays: number;
  disputeSpike: true;
  lienSignal: true;
} {
  const priorPayments = rows.paymentHistory.filter((row) => row.accountId === accountId && row.window === "Prior");
  const recentPayments = rows.paymentHistory.filter((row) => row.accountId === accountId && row.window === "Recent");
  const disputeSpike = rows.deductions.some((row) => row.accountId === accountId);
  const lienSignal = harborSimulationSource.riskObservationSource.criticalAlertType === "TAX_LIEN";
  if (priorPayments.length === 0 || recentPayments.length === 0 || !disputeSpike || !lienSignal) {
    throw new CreditSimulationMissingSourceError(accountId);
  }

  return {
    baselineDsoDays: averageRoundedDays(priorPayments.map((row) => row.daysToPay)),
    currentDsoDays: averageRoundedDays(recentPayments.map((row) => row.daysToPay)),
    disputeSpike: true,
    lienSignal: true
  };
}

function averageRoundedDays(values: readonly number[]): number {
  const total = values.reduce((sum, value) => sum.plus(value), new Decimal(0));
  return total.div(values.length).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

function formatMoney(value: Decimal): string {
  return `$${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  }).format(value.toNumber())}`;
}

function trimTrailingZeros(value: string): string {
  return value.replace(/\.?0+$/u, "");
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
