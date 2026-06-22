import { arbitrationPnlWeights, partialHoldWeights } from "../../config/weights.js";
import { createAuditTrail, type AuditEntry } from "../audit/trail.js";
import { arbitrateRiskMesh, type ArbitrationPosition, type BlockedArbitrationResult } from "../core/arbitration.js";
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
  customerId: "CUST-HARBOR";
  sentinel: ReturnType<typeof assessHarborSentinel>;
  arbitration: BlockedArbitrationResult;
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
  sentinel: ReturnType<typeof assessHarborSentinel>;
  containment: ReturnType<typeof assessHarborContainment>;
  positions: ArbitrationPosition[];
  arbitration: BlockedArbitrationResult;
  partialHold: PartialHoldResult;
  partialHoldScores: PartialHoldScores;
  partialHoldWeights: typeof partialHoldWeights;
  orderAmount: Money;
  amountSplit: PartialHoldAmountSplit;
  holdProposalInput: {
    basis: string;
    customerId: "CUST-HARBOR";
    orderAmount: Money;
    amountSplit: PartialHoldAmountSplit;
    orderId: typeof harborOrderId;
    partialHold: PartialHoldResult;
    recordIds: string[];
  };
  termsProposalInput: {
    basis: string;
    customerId: "CUST-HARBOR";
    recordIds: string[];
    terms: typeof harborTerms;
  };
}

export const harborCaseId = "ARB-HARBOR-ORDER-640K";
export const harborOrderId = "ORDER-HARBOR-640K";
export const harborRecordIds = ["CUST-HARBOR", harborOrderId, "LEDGER-6-PARTIAL-HOLD"] as const;
export const harborHoldBasis =
  "Harbor worked example computes a 55% controlled release from the deterministic partial-hold core.";
export const harborTermsBasis = "Sentinel drift observation routes revised terms to HITL without self-applying terms.";
export const harborTerms = "2/10 Net-30 + deposit/clearance condition";

export function runRiskMeshClosedLoop(): RiskMeshClosedLoopRun {
  const context = buildHarborRiskMeshProposalContext();
  const { arbitration, containment, partialHold, positions, sentinel } = context;
  assertFinalAgentOutput({ containmentDecisions: [containment] });

  const serviceToolNames: RiskMeshProposalToolName[] = [];
  const holdAction = invokeRiskMeshProposalTool(serviceToolNames, "actions.proposeHold") as ProposedHoldAction;
  const termsAction = invokeRiskMeshProposalTool(serviceToolNames, "actions.proposeTerms") as ProposedTermsAction;
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
    entryType: "arbitration.blocked",
    payload: {
      caseId: arbitration.caseId,
      positions,
      resolution: arbitration.status,
      weightsUsed: arbitrationPnlWeights
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
    customerId: "CUST-HARBOR",
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

export function buildHarborRiskMeshProposalContext(): HarborRiskMeshProposalContext {
  const sentinel = assessHarborSentinel();
  const containment = assessHarborContainment();
  const positions = buildHarborPositions();
  const arbitration = arbitrateRiskMesh({
    caseId: harborCaseId,
    positions,
    weights: arbitrationPnlWeights
  });
  const partialHoldScores: PartialHoldScores = {
    orderValueVsExposure: 35,
    customerStrategicValue: 60,
    dsoPaymentDrift: 30,
    orderMargin: 80,
    revenueForecast: 65,
    paymentPattern: 50
  };
  const partialHold = computePartialHold({
    weights: partialHoldWeights,
    scores: partialHoldScores
  });
  const orderAmount = money("640000.00");
  const amountSplit = computePartialHoldAmountSplit({
    orderAmount,
    releaseRatioPercent: partialHold.releaseRatioPercent
  });

  return {
    sentinel,
    arbitration,
    partialHold,
    containment,
    positions,
    partialHoldScores,
    partialHoldWeights,
    orderAmount,
    amountSplit,
    holdProposalInput: {
      basis: harborHoldBasis,
      customerId: "CUST-HARBOR",
      orderAmount,
      amountSplit,
      orderId: harborOrderId,
      partialHold,
      recordIds: [...harborRecordIds]
    },
    termsProposalInput: {
      basis: harborTermsBasis,
      customerId: "CUST-HARBOR",
      recordIds: sentinel.recordIds,
      terms: harborTerms
    }
  };
}

function invokeRiskMeshProposalTool(
  serviceToolNames: RiskMeshProposalToolName[],
  toolName: RiskMeshProposalToolName
): ProposedExternalAction {
  serviceToolNames.push(toolName);
  return invokeServiceTool(toolName, { caseId: harborCaseId }) as ProposedExternalAction;
}

function buildHarborPositions(): ArbitrationPosition[] {
  return [
    {
      functionName: "credit",
      optionId: "partial-hold",
      position: "Limit breach requires a controlled release pending human approval.",
      recordIds: ["CUST-HARBOR", harborOrderId]
    },
    {
      functionName: "fulfillment",
      optionId: "ship-now",
      position: "Holiday mix has high margin and a stable forecast.",
      recordIds: [harborOrderId, "LEDGER-6-PARTIAL-HOLD"]
    },
    {
      functionName: "billing",
      optionId: "revised-terms",
      position: "Revised terms remain draft-only until David approves.",
      recordIds: ["CUST-HARBOR", "LEDGER-6-PARTIAL-HOLD"]
    },
    {
      functionName: "collections",
      optionId: "sentinel-checkpoint",
      position: "Continued drift re-opens the Risk Mesh.",
      recordIds: ["CUST-HARBOR", "LEDGER-HARBOR-DISTRESSED-HONEST"]
    }
  ];
}
