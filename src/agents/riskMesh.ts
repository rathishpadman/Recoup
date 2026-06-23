import type { GovernedConfigValues } from "../../config/governed.js";
import type { SourcePort } from "../adapters/source.js";
import { createAuditTrail, type AuditEntry } from "../audit/trail.js";
import {
  arbitrateRiskMesh,
  type ArbitrationPosition,
  type ArbitrationResult
} from "../core/arbitration.js";
import {
  computePartialHold,
  computePartialHoldAmountSplit,
  type PartialHoldAmountSplit,
  type PartialHoldResult,
  type PartialHoldScores
} from "../core/partialHold.js";
import { assertFinalAgentOutput } from "../guardrails/output/final.js";
import { buildAutonomyGauge, type AutonomyGauge } from "../services/autonomyGauge.js";
import type { ProposedExternalAction } from "../services/approvals.js";
import { invokeServiceTool, type ServiceToolName } from "../services/serviceLayer.js";
import { money } from "../types/money.js";
import type { Money } from "../types/money.js";
import { assessHarborContainment, toContainmentDecision, type ContainmentDecision } from "./containment.js";
import { assessHarborSentinel } from "./sentinel.js";

type RiskMeshProposalToolName = Extract<ServiceToolName, "actions.proposeHold" | "actions.proposeTerms">;
type ProposedHoldAction = Extract<ProposedExternalAction, { actionType: "propose-hold" }>;
type ProposedTermsAction = Extract<ProposedExternalAction, { actionType: "propose-terms" }>;

export interface RiskMeshClosedLoopRun {
  customerId: string;
  sentinel: ReturnType<typeof assessHarborSentinel>;
  arbitration: ArbitrationResult;
  partialHold: PartialHoldResult;
  holdAction: ProposedHoldAction;
  termsAction: ProposedTermsAction;
  containmentDecisions: ContainmentDecision[];
  auditEntries: AuditEntry[];
  auditTrailValid: boolean;
  autonomyGauge: AutonomyGauge;
  serviceToolNames: RiskMeshProposalToolName[];
}

export interface HarborRiskMeshProposalContext {
  caseConfig: GovernedConfigValues["riskMeshCases"]["harbor"];
  sentinel: ReturnType<typeof assessHarborSentinel>;
  containment: ReturnType<typeof assessHarborContainment>;
  positions: ArbitrationPosition[];
  arbitration: ArbitrationResult;
  partialHold: PartialHoldResult;
  partialHoldScores: PartialHoldScores;
  partialHoldWeights: GovernedConfigValues["partialHold"]["weights"];
  orderAmount: Money;
  amountSplit: PartialHoldAmountSplit;
  holdProposalInput: {
    basis: string;
    customerId: string;
    orderAmount: Money;
    amountSplit: PartialHoldAmountSplit;
    orderId: string;
    partialHold: PartialHoldResult;
    recordIds: string[];
  };
  termsProposalInput: {
    basis: string;
    customerId: string;
    deterministicBasis: ReturnType<typeof assessHarborSentinel>["deterministicBasis"];
    recordIds: string[];
    terms: string;
  };
}

export interface RiskMeshClosedLoopInput {
  governedConfig: GovernedConfigValues;
  source: SourcePort;
}

export function runRiskMeshClosedLoop(input: RiskMeshClosedLoopInput): RiskMeshClosedLoopRun {
  const context = buildHarborRiskMeshProposalContext(input);
  const { arbitration, containment, partialHold, positions, sentinel } = context;
  assertFinalAgentOutput({ containmentDecisions: [containment] });

  const serviceToolNames: RiskMeshProposalToolName[] = [];
  const holdAction = invokeRiskMeshProposalTool(
    serviceToolNames,
    "actions.proposeHold",
    input.governedConfig,
    input.source
  ) as ProposedHoldAction;
  const termsAction = invokeRiskMeshProposalTool(
    serviceToolNames,
    "actions.proposeTerms",
    input.governedConfig,
    input.source
  ) as ProposedTermsAction;
  const trail = createAuditTrail();

  trail.append({
    entryType: "sentinel.blocked-risk",
    payload: {
      customerId: sentinel.customerId,
      reason: sentinel.reason,
      status: sentinel.status
    },
    recordIds: sentinel.recordIds
  });
  trail.append({
    entryType: arbitration.status === "blocked" ? "arbitration.blocked" : "arbitration.ranked",
    payload: {
      caseId: arbitration.caseId,
      positions,
      resolution: arbitration.status === "blocked" ? arbitration.status : arbitration.resolution,
      status: arbitration.status,
      weightsUsed: input.governedConfig.arbitrationWeights,
      ...(arbitration.status === "blocked" ? { reason: arbitration.reason } : { rankedOptions: arbitration.rankedOptions })
    },
    recordIds: arbitration.recordIds
  });
  trail.append({
    entryType: "partial-hold.proposed",
    payload: {
      actionId: holdAction.actionId,
      compositeScore: partialHold.compositeScore.toFixed(2),
      releaseRatioPercent: partialHold.releaseRatioPercent.toFixed(0)
    },
    recordIds: holdAction.recordIds
  });
  trail.append({
    entryType: "terms.proposed",
    payload: {
      actionId: termsAction.actionId,
      terms: termsAction.terms
    },
    recordIds: termsAction.recordIds
  });

  return {
    customerId: context.caseConfig.customerId,
    sentinel,
    arbitration,
    partialHold,
    holdAction,
    termsAction,
    containmentDecisions: [toContainmentDecision(containment)],
    auditEntries: trail.entries(),
    auditTrailValid: trail.verify(),
    autonomyGauge: buildAutonomyGauge(),
    serviceToolNames
  };
}

export function buildHarborRiskMeshProposalContext(input: RiskMeshClosedLoopInput): HarborRiskMeshProposalContext {
  const caseConfig = input.governedConfig.riskMeshCases.harbor;
  const sentinel = assessHarborSentinel({
    customerId: caseConfig.customerId,
    rDriftTrigger: input.governedConfig.rDriftTrigger,
    rScoreWeights: input.governedConfig.rScoreWeights
  }, input.source);
  if (sentinel.customerId !== caseConfig.customerId) {
    throw new Error("Harbor Risk Mesh case config must match the cited Sentinel customer.");
  }
  const containment = assessHarborContainment({
    customerId: caseConfig.customerId,
    intentLabel: caseConfig.containmentIntentLabel
  }, input.source);
  const positions = caseConfig.arbitrationPositions;
  const arbitrationResult = arbitrateRiskMesh({
    caseId: caseConfig.caseId,
    positions,
    weights: input.governedConfig.arbitrationWeights
  });
  const arbitration = arbitrationResult;
  const partialHoldScores: PartialHoldScores = caseConfig.partialHoldScores;
  const partialHold = computePartialHold({
    scores: partialHoldScores,
    thresholds: input.governedConfig.partialHold.thresholds,
    weights: input.governedConfig.partialHold.weights
  });
  const orderAmount = money(caseConfig.orderAmount);
  const amountSplit = computePartialHoldAmountSplit({
    orderAmount,
    releaseRatioPercent: partialHold.releaseRatioPercent
  });

  return {
    caseConfig,
    sentinel,
    arbitration,
    partialHold,
    containment,
    positions,
    partialHoldScores,
    partialHoldWeights: input.governedConfig.partialHold.weights,
    orderAmount,
    amountSplit,
    holdProposalInput: {
      basis: caseConfig.holdBasis,
      customerId: caseConfig.customerId,
      orderAmount,
      amountSplit,
      orderId: caseConfig.orderId,
      partialHold,
      recordIds: caseConfig.recordIds
    },
    termsProposalInput: {
      basis: caseConfig.termsBasis,
      customerId: caseConfig.customerId,
      deterministicBasis: sentinel.deterministicBasis,
      recordIds: sentinel.recordIds,
      terms: caseConfig.terms
    }
  };
}

function invokeRiskMeshProposalTool(
  serviceToolNames: RiskMeshProposalToolName[],
  toolName: RiskMeshProposalToolName,
  governedConfig: GovernedConfigValues,
  source: SourcePort
): ProposedExternalAction {
  serviceToolNames.push(toolName);
  return invokeServiceTool(toolName, { caseId: governedConfig.riskMeshCases.harbor.caseId }, { governedConfig, source }) as ProposedExternalAction;
}
