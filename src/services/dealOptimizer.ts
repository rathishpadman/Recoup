import { Decimal } from "decimal.js";
import { sha256CanonicalJson } from "../../config/governed.js";
import {
  calculateDealExpectedValue,
  type DealCandidateTerms,
  type DealScenarioInput
} from "../core/dealExpectedValue.js";
import type { CreditRiskRows, CreditVerdict } from "./creditRiskModel.js";
import { buildCreditRiskReviewModel } from "./creditRiskModel.js";
import {
  parseActiveCreditNegotiationPolicyRows,
  type CreditNegotiationPolicyRow,
  type CreditNegotiationPolicySnapshot
} from "./creditNegotiationPolicy.js";

export interface DealOptimizerCandidateStructure {
  candidateId: string;
  collateralRatio: string;
  depositPct: string;
  financingSpreadBps: string;
  releasePct: string;
  sourceRecordIds: readonly string[];
  trancheCount: number;
}

export interface DealOptimizerCounterOfferRow {
  accountId: string;
  counterOfferId: string;
  extractedTerms: Partial<Record<"collateralRatio" | "depositPct" | "financingSpreadBps" | "releasePct" | "trancheCount", number | string>>;
  orderId: string;
  roundId: string;
  source: "email" | "manual";
  sourceRecordIds: readonly string[];
  status: "grammar_valid" | "human_review";
}

export interface DealOptimizerCostOfCapitalRow {
  accountId: string;
  annualBps: string;
  sourceRecordIds: readonly string[];
}

export interface DealOptimizerInventoryRow {
  holdingCostPerUnitPerDay: string;
  holdingDays: number;
  orderId: string;
  scenarioId: string;
  sourceRecordIds: readonly string[];
}

export interface DealOptimizerOrderRow {
  accountId: string;
  grossMarginPct: string;
  orderAmount: string;
  orderId: string;
  sourceRecordIds: readonly string[];
  units: string;
}

export interface DealOptimizerSellthroughRow {
  orderId: string;
  probability: string;
  scenarioId: string;
  sellThroughPct: string;
  sourceRecordIds: readonly string[];
}

export interface DealOptimizerRows {
  candidateStructures: readonly DealOptimizerCandidateStructure[];
  counterOffers?: readonly DealOptimizerCounterOfferRow[] | undefined;
  costOfCapital: readonly DealOptimizerCostOfCapitalRow[];
  inventory: readonly DealOptimizerInventoryRow[];
  orders: readonly DealOptimizerOrderRow[];
  posSellthrough: readonly DealOptimizerSellthroughRow[];
}

export interface DealOptimizerInput {
  creditRiskRows: CreditRiskRows;
  orderId: string;
  policyRows: readonly CreditNegotiationPolicyRow[];
  seed: 42;
  simRows: DealOptimizerRows;
}

export interface RankedDealCandidate {
  calculationHash: string;
  candidateId: string;
  objectiveValue: string;
  objectiveValueLabel: string;
  rank: number;
  scenarioCount: number;
  sourceRecordIds: string[];
  terms: {
    collateralRatioLabel: string;
    depositPctLabel: string;
    financingSpreadLabel: string;
    releasePctLabel: string;
    trancheCountLabel: string;
  };
}

export interface RejectedDealCandidate {
  candidateId: string;
  reason: string;
  sourceRecordIds: string[];
}

export interface DealOptimizerModel {
  optimizerRunId: string;
  orderId: string;
  policyHash: string;
  rankedCandidates: RankedDealCandidate[];
  rejectedCandidates: RejectedDealCandidate[];
  seed: 42;
  sourceHash: string;
  sourceRecordIds: string[];
}

const sourceNames = {
  candidateStructures: "credit_deal_candidate_grid",
  costOfCapital: "sim_cost_of_capital",
  inventory: "sim_3pl_inventory",
  orders: "credit_orders",
  posSellthrough: "sim_pos_sellthrough"
} as const;

export function buildDealOptimizerModel(input: DealOptimizerInput): DealOptimizerModel {
  assertRequiredSources(input.simRows);
  const policy = parseActiveCreditNegotiationPolicyRows(input.policyRows);
  const order = findOrder(input.simRows.orders, input.orderId);
  const creditAccount = buildCreditRiskReviewModel(input.creditRiskRows).accounts.find((account) => account.accountId === order.accountId);
  if (creditAccount === undefined) {
    throw new Error(`Deal optimizer missing required source: credit account ${order.accountId}.`);
  }

  const costOfCapital = findCostOfCapital(input.simRows.costOfCapital, order.accountId);
  const inventoryForOrder = input.simRows.inventory.filter((row) => row.orderId === order.orderId);
  const posSellthroughForOrder = input.simRows.posSellthrough.filter((row) => row.orderId === order.orderId);
  assertOrderScopedScenarioSources(order.orderId, inventoryForOrder, posSellthroughForOrder);
  const orderScopedSimRows = {
    ...input.simRows,
    inventory: inventoryForOrder,
    posSellthrough: posSellthroughForOrder
  };
  const scenarios = buildScenarioRows(orderScopedSimRows, order.orderId);
  const holdingCost = uniqueHoldingCost(inventoryForOrder);
  const counterOfferCandidates: DealOptimizerCandidateStructure[] = [];
  const rejectedCandidates: RejectedDealCandidate[] = [];
  const counterOffersForOrder = (input.simRows.counterOffers ?? []).filter(
    (counterOffer) =>
      counterOffer.accountId === order.accountId &&
      counterOffer.orderId === order.orderId &&
      counterOffer.status === "grammar_valid"
  );
  for (const counterOffer of counterOffersForOrder) {
    const counterCandidate = counterOfferCandidateStructure(counterOffer);
    if ("reason" in counterCandidate) {
      rejectedCandidates.push(counterCandidate);
    } else {
      counterOfferCandidates.push(counterCandidate);
    }
  }
  const candidateStructures = [...input.simRows.candidateStructures, ...counterOfferCandidates];
  const sourceRecordIds = dedupe([
    ...order.sourceRecordIds,
    ...costOfCapital.sourceRecordIds,
    ...input.simRows.candidateStructures.flatMap((candidate) => candidate.sourceRecordIds),
    ...counterOffersForOrder.flatMap((counterOffer) => counterOffer.sourceRecordIds),
    ...inventoryForOrder.flatMap((row) => row.sourceRecordIds),
    ...posSellthroughForOrder.flatMap((row) => row.sourceRecordIds),
    ...policy.sourceRecordIds,
    creditAccount.accountId
  ]);
  const sourceHash = sha256CanonicalJson({
    accountId: creditAccount.accountId,
    candidates: input.simRows.candidateStructures,
    costOfCapital,
    ...(counterOffersForOrder.length === 0 ? {} : { counterOffers: counterOffersForOrder }),
    inventory: inventoryForOrder,
    order,
    posSellthrough: posSellthroughForOrder,
    seed: input.seed
  });
  const evaluatedCandidates: RankedDealCandidate[] = [];

  for (const candidate of candidateStructures) {
    const rejection = rejectOutOfPolicyCandidate(candidate, policy);
    if (rejection !== undefined) {
      rejectedCandidates.push(rejection);
      continue;
    }

    const annualDefaultProbability = annualDefaultProbabilityForVerdict(policy, creditAccount.verdict);
    const pdPolicyRecordId = `credit_negotiation_policy:${policyKeyForVerdict(creditAccount.verdict)}:v1`;
    const result = calculateDealExpectedValue({
      candidate: candidateTerms(candidate),
      economics: {
        costOfCapitalAnnualBps: costOfCapital.annualBps,
        grossMarginPct: order.grossMarginPct,
        holdingCostPerUnitPerDay: holdingCost,
        sourceRecordIds: costOfCapital.sourceRecordIds
      },
      order: {
        orderAmount: order.orderAmount,
        orderId: order.orderId,
        sourceRecordIds: order.sourceRecordIds,
        units: order.units
      },
      risk: {
        annualDefaultProbability,
        exposureAmount: creditAccount.exposureAmount.toFixed(2),
        sourceRecordIds: [creditAccount.accountId, pdPolicyRecordId],
        verdict: creditAccount.verdict
      },
      scenarios,
      seed: input.seed
    });

    evaluatedCandidates.push({
      calculationHash: result.calculationHash,
      candidateId: result.candidateId,
      objectiveValue: result.objectiveValue,
      objectiveValueLabel: formatMoneyLabel(result.objectiveValue),
      rank: 0,
      scenarioCount: result.basis.scenarioCount,
      sourceRecordIds: dedupe([...candidate.sourceRecordIds, ...result.sourceRecordIds]),
      terms: {
        collateralRatioLabel: `${decimal(candidate.collateralRatio).toString()}x collateral`,
        depositPctLabel: `${decimal(candidate.depositPct).toString()}% deposit`,
        financingSpreadLabel: `${decimal(candidate.financingSpreadBps).toString()} bps spread`,
        releasePctLabel: `${decimal(candidate.releasePct).toString()}% release`,
        trancheCountLabel: `${candidate.trancheCount.toString()} ${candidate.trancheCount === 1 ? "tranche" : "tranches"}`
      }
    });
  }

  const rankedCandidates = evaluatedCandidates
    .sort((left, right) => compareObjective(right.objectiveValue, left.objectiveValue) || left.candidateId.localeCompare(right.candidateId))
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1
    }));

  return {
    optimizerRunId: `credit-deal-optimizer:${input.orderId}:${sourceHash.slice(0, 12)}:${policy.policyHash.slice(0, 12)}:seed-${input.seed.toString()}`,
    orderId: input.orderId,
    policyHash: policy.policyHash,
    rankedCandidates,
    rejectedCandidates,
    seed: input.seed,
    sourceHash,
    sourceRecordIds
  };
}

function counterOfferCandidateStructure(
  counterOffer: DealOptimizerCounterOfferRow
): DealOptimizerCandidateStructure | RejectedDealCandidate {
  const requiredTerms = ["collateralRatio", "depositPct", "financingSpreadBps", "releasePct", "trancheCount"] as const;
  const missingTerms = requiredTerms.filter((term) => counterOffer.extractedTerms[term] === undefined);
  const candidateId = `counter-offer:${counterOffer.counterOfferId}`;
  if (missingTerms.length > 0) {
    return {
      candidateId,
      reason: `Counter-offer is missing required deal terms: ${missingTerms.join(", ")}.`,
      sourceRecordIds: [...counterOffer.sourceRecordIds]
    };
  }

  const collateralRatio = counterOffer.extractedTerms.collateralRatio;
  const depositPct = counterOffer.extractedTerms.depositPct;
  const financingSpreadBps = counterOffer.extractedTerms.financingSpreadBps;
  const releasePct = counterOffer.extractedTerms.releasePct;
  const trancheCount = counterOffer.extractedTerms.trancheCount;
  if (
    collateralRatio === undefined ||
    depositPct === undefined ||
    financingSpreadBps === undefined ||
    releasePct === undefined ||
    trancheCount === undefined
  ) {
    throw new Error("Counter-offer term presence check failed.");
  }

  const collateralRatioCandidate = counterDecimalString(counterOffer, candidateId, "collateralRatio", collateralRatio);
  if (typeof collateralRatioCandidate !== "string") {
    return collateralRatioCandidate;
  }
  const depositPctCandidate = counterDecimalString(counterOffer, candidateId, "depositPct", depositPct);
  if (typeof depositPctCandidate !== "string") {
    return depositPctCandidate;
  }
  const financingSpreadBpsCandidate = counterDecimalString(counterOffer, candidateId, "financingSpreadBps", financingSpreadBps);
  if (typeof financingSpreadBpsCandidate !== "string") {
    return financingSpreadBpsCandidate;
  }
  const releasePctCandidate = counterDecimalString(counterOffer, candidateId, "releasePct", releasePct);
  if (typeof releasePctCandidate !== "string") {
    return releasePctCandidate;
  }
  const trancheCountCandidate = counterPositiveInteger(counterOffer, candidateId, trancheCount);
  if (typeof trancheCountCandidate !== "number") {
    return trancheCountCandidate;
  }

  return {
    candidateId,
    collateralRatio: collateralRatioCandidate,
    depositPct: depositPctCandidate,
    financingSpreadBps: financingSpreadBpsCandidate,
    releasePct: releasePctCandidate,
    sourceRecordIds: [...counterOffer.sourceRecordIds],
    trancheCount: trancheCountCandidate
  };
}

function assertRequiredSources(rows: DealOptimizerRows): void {
  if (rows.orders.length === 0) {
    throw new Error(`Deal optimizer missing required source: ${sourceNames.orders}.`);
  }
  if (rows.inventory.length === 0) {
    throw new Error(`Deal optimizer missing required source: ${sourceNames.inventory}.`);
  }
  if (rows.costOfCapital.length === 0) {
    throw new Error(`Deal optimizer missing required source: ${sourceNames.costOfCapital}.`);
  }
  if (rows.posSellthrough.length === 0) {
    throw new Error(`Deal optimizer missing required source: ${sourceNames.posSellthrough}.`);
  }
  if (rows.candidateStructures.length === 0) {
    throw new Error(`Deal optimizer missing required source: ${sourceNames.candidateStructures}.`);
  }
}

function assertOrderScopedScenarioSources(
  orderId: string,
  inventoryRows: readonly DealOptimizerInventoryRow[],
  posSellthroughRows: readonly DealOptimizerSellthroughRow[]
): void {
  if (inventoryRows.length === 0) {
    throw new Error(`Deal optimizer missing required source: sim_3pl_inventory ${orderId}.`);
  }
  if (posSellthroughRows.length === 0) {
    throw new Error(`Deal optimizer missing required source: sim_pos_sellthrough ${orderId}.`);
  }
}

function findOrder(orders: readonly DealOptimizerOrderRow[], orderId: string): DealOptimizerOrderRow {
  const order = orders.find((row) => row.orderId === orderId);
  if (order === undefined) {
    throw new Error(`Deal optimizer missing required source: credit_orders ${orderId}.`);
  }
  return order;
}

function findCostOfCapital(rows: readonly DealOptimizerCostOfCapitalRow[], accountId: string): DealOptimizerCostOfCapitalRow {
  const row = rows.find((candidate) => candidate.accountId === accountId);
  if (row === undefined) {
    throw new Error(`Deal optimizer missing required source: sim_cost_of_capital ${accountId}.`);
  }
  return row;
}

function buildScenarioRows(rows: DealOptimizerRows, orderId: string): DealScenarioInput[] {
  const inventoryByScenario = new Map(rows.inventory.filter((row) => row.orderId === orderId).map((row) => [row.scenarioId, row]));
  return rows.posSellthrough
    .filter((row) => row.orderId === orderId)
    .map((sellthrough): DealScenarioInput => {
      const inventory = inventoryByScenario.get(sellthrough.scenarioId);
      if (inventory === undefined) {
        throw new Error(`Deal optimizer missing required source: sim_3pl_inventory ${sellthrough.scenarioId}.`);
      }
      return {
        holdingDays: inventory.holdingDays,
        probability: sellthrough.probability,
        scenarioId: sellthrough.scenarioId,
        sellThroughPct: sellthrough.sellThroughPct,
        sourceRecordIds: [...sellthrough.sourceRecordIds, ...inventory.sourceRecordIds]
      };
    });
}

function uniqueHoldingCost(inventoryRows: readonly DealOptimizerInventoryRow[]): string {
  const costs = [...new Set(inventoryRows.map((row) => row.holdingCostPerUnitPerDay))];
  if (costs.length !== 1) {
    throw new Error("Deal optimizer requires one holding cost value for the replay scenario grid.");
  }
  const holdingCost = costs[0];
  if (holdingCost === undefined) {
    throw new Error("Deal optimizer missing required source: sim_3pl_inventory holding cost.");
  }
  return holdingCost;
}

function rejectOutOfPolicyCandidate(
  candidate: DealOptimizerCandidateStructure,
  policy: CreditNegotiationPolicySnapshot
): RejectedDealCandidate | undefined {
  const depositPct = decimal(candidate.depositPct);
  if (depositPct.greaterThan(policy.values.max_deposit_pct)) {
    return rejection(candidate, `depositPct ${depositPct.toString()} exceeds policy max_deposit_pct ${policy.values.max_deposit_pct.toString()}.`);
  }
  if (depositPct.lessThan(policy.values.min_deposit_pct)) {
    return rejection(candidate, `depositPct ${depositPct.toString()} is below policy min_deposit_pct ${policy.values.min_deposit_pct.toString()}.`);
  }

  const releasePct = decimal(candidate.releasePct);
  if (releasePct.greaterThan(policy.values.max_release_pct)) {
    return rejection(candidate, `releasePct ${releasePct.toString()} exceeds policy max_release_pct ${policy.values.max_release_pct.toString()}.`);
  }
  if (releasePct.lessThan(policy.values.min_release_pct)) {
    return rejection(candidate, `releasePct ${releasePct.toString()} is below policy min_release_pct ${policy.values.min_release_pct.toString()}.`);
  }

  if (candidate.trancheCount > policy.values.max_tranches) {
    return rejection(candidate, `trancheCount ${candidate.trancheCount.toString()} exceeds policy max_tranches ${policy.values.max_tranches.toString()}.`);
  }

  const collateralRatio = decimal(candidate.collateralRatio);
  if (collateralRatio.greaterThan(policy.values.max_collateral_ratio)) {
    return rejection(
      candidate,
      `collateralRatio ${collateralRatio.toString()} exceeds policy max_collateral_ratio ${policy.values.max_collateral_ratio.toString()}.`
    );
  }

  const financingSpreadBps = decimal(candidate.financingSpreadBps);
  if (financingSpreadBps.greaterThan(policy.values.max_financing_spread_bps)) {
    return rejection(
      candidate,
      `financingSpreadBps ${financingSpreadBps.toString()} exceeds policy max_financing_spread_bps ${policy.values.max_financing_spread_bps.toString()}.`
    );
  }

  return undefined;
}

function candidateTerms(candidate: DealOptimizerCandidateStructure): DealCandidateTerms {
  return {
    candidateId: candidate.candidateId,
    collateralRatio: candidate.collateralRatio,
    depositPct: candidate.depositPct,
    financingSpreadBps: candidate.financingSpreadBps,
    releasePct: candidate.releasePct
  };
}

function annualDefaultProbabilityForVerdict(policy: CreditNegotiationPolicySnapshot, verdict: CreditVerdict): string {
  switch (verdict) {
    case "CLEAR":
      return policy.values.default_prob_by_verdict_clear.toString();
    case "WATCH":
      return policy.values.default_prob_by_verdict_watch.toString();
    case "ELEVATED":
      return policy.values.default_prob_by_verdict_elevated.toString();
    case "HIGH":
      return policy.values.default_prob_by_verdict_high.toString();
  }
}

function policyKeyForVerdict(verdict: CreditVerdict): string {
  switch (verdict) {
    case "CLEAR":
      return "default_prob_by_verdict_clear";
    case "WATCH":
      return "default_prob_by_verdict_watch";
    case "ELEVATED":
      return "default_prob_by_verdict_elevated";
    case "HIGH":
      return "default_prob_by_verdict_high";
  }
}

function rejection(candidate: DealOptimizerCandidateStructure, reason: string): RejectedDealCandidate {
  return {
    candidateId: candidate.candidateId,
    reason,
    sourceRecordIds: [...candidate.sourceRecordIds]
  };
}

function compareObjective(left: string, right: string): number {
  return decimal(left).comparedTo(decimal(right));
}

function formatMoneyLabel(value: string): string {
  const parsed = decimal(value);
  return `$${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  }).format(parsed.toNumber())}`;
}

function counterDecimalString(
  counterOffer: DealOptimizerCounterOfferRow,
  candidateId: string,
  termName: "collateralRatio" | "depositPct" | "financingSpreadBps" | "releasePct",
  value: number | string
): string | RejectedDealCandidate {
  try {
    return decimal(value.toString()).toString();
  } catch {
    return counterOfferRejection(counterOffer, candidateId, `Counter-offer ${termName} must be a finite decimal.`);
  }
}

function counterPositiveInteger(
  counterOffer: DealOptimizerCounterOfferRow,
  candidateId: string,
  value: number | string
): number | RejectedDealCandidate {
  let parsed: Decimal;
  try {
    parsed = decimal(value.toString());
  } catch {
    return counterOfferRejection(counterOffer, candidateId, "Counter-offer trancheCount must be a positive integer.");
  }
  if (!parsed.isInteger() || parsed.lessThan(1)) {
    return counterOfferRejection(counterOffer, candidateId, "Counter-offer trancheCount must be a positive integer.");
  }

  return parsed.toNumber();
}

function counterOfferRejection(counterOffer: DealOptimizerCounterOfferRow, candidateId: string, reason: string): RejectedDealCandidate {
  return {
    candidateId,
    reason,
    sourceRecordIds: [...counterOffer.sourceRecordIds]
  };
}

function decimal(value: string): Decimal {
  const parsed = new Decimal(value);
  if (!parsed.isFinite()) {
    throw new Error("Deal optimizer values must be finite decimals.");
  }
  return parsed;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
