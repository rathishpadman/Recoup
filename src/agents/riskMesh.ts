import { arbitrationPnlWeights, partialHoldWeights } from "../../config/weights.js";
import { createAuditTrail, type AuditEntry } from "../audit/trail.js";
import { arbitrateRiskMesh, type ArbitrationPosition, type BlockedArbitrationResult } from "../core/arbitration.js";
import { computePartialHold, computePartialHoldAmountSplit, type PartialHoldResult } from "../core/partialHold.js";
import { buildAutonomyGauge, type AutonomyGauge } from "../services/autonomyGauge.js";
import { proposeHold, type ProposedHoldAction } from "../tools/actions/proposeHold.js";
import { proposeTerms, type ProposedTermsAction } from "../tools/actions/proposeTerms.js";
import { money } from "../types/money.js";
import { assessHarborContainment, toContainmentDecision, type ContainmentDecision } from "./containment.js";
import { assessHarborSentinel } from "./sentinel.js";

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
}

const harborCaseId = "ARB-HARBOR-ORDER-640K";
const harborOrderId = "ORDER-HARBOR-640K";
const harborRecordIds = ["CUST-HARBOR", harborOrderId, "LEDGER-6-PARTIAL-HOLD"];

export function runRiskMeshClosedLoop(): RiskMeshClosedLoopRun {
  const sentinel = assessHarborSentinel();
  const containment = assessHarborContainment();
  const positions = buildHarborPositions();
  const arbitration = arbitrateRiskMesh({
    caseId: harborCaseId,
    positions,
    weights: arbitrationPnlWeights
  });
  const partialHold = computePartialHold({
    weights: partialHoldWeights,
    scores: {
      orderValueVsExposure: 35,
      customerStrategicValue: 60,
      dsoPaymentDrift: 30,
      orderMargin: 80,
      revenueForecast: 65,
      paymentPattern: 50
    }
  });
  const orderAmount = money("640000.00");
  const amountSplit = computePartialHoldAmountSplit({
    orderAmount,
    releaseRatioPercent: partialHold.releaseRatioPercent
  });
  const holdAction = proposeHold({
    basis: "Harbor worked example computes a 55% controlled release from the deterministic partial-hold core.",
    customerId: "CUST-HARBOR",
    orderAmount,
    amountSplit,
    orderId: harborOrderId,
    partialHold,
    recordIds: harborRecordIds
  });
  const termsAction = proposeTerms({
    basis: "Sentinel drift observation routes revised terms to HITL without self-applying terms.",
    customerId: "CUST-HARBOR",
    recordIds: sentinel.recordIds,
    terms: "2/10 Net-30 + deposit/clearance condition"
  });
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
    autonomyGauge: buildAutonomyGauge()
  };
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
