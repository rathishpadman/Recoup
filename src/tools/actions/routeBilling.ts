import type { Money } from "../../types/money.js";
import { clampToComputedDelta } from "../../guardrails/tool/amountClamp.js";
import { assertBillingActionDecision } from "../../guardrails/tool/actionBoundary.js";
import type { DeductionDecisionGuardInput } from "../../guardrails/tool/explainability.js";

export interface RouteBillingInput {
  decision: DeductionDecisionGuardInput;
  proposedBy?: string;
}

export interface RouteBillingAction {
  actionId: string;
  actionType: "route-billing";
  lineId: string;
  proposedAmount: Money;
  amountSource: "core-computed-delta";
  recordIds: string[];
  basis: string;
  evidenceDocumentIds: string[];
  proposedBy: string;
  recommendation: {
    type: "billing-prevention-draft";
    leakageStatus: "projected";
    queue: "billing";
    externalWrite: false;
    basis: string;
    recordIds: string[];
  };
  requiresHumanApproval: true;
  status: "pending_human";
  dispatchedExternally: false;
}

export function routeBilling(input: RouteBillingInput): RouteBillingAction {
  assertBillingActionDecision(input.decision);

  const proposedAmount = clampToComputedDelta(
    input.decision.deterministicBasis.computedDeltaAmount,
    input.decision.deterministicBasis.computedDeltaAmount
  );

  return {
    actionId: `route-billing:${input.decision.lineId}`,
    actionType: "route-billing",
    lineId: input.decision.lineId,
    proposedAmount,
    amountSource: "core-computed-delta",
    recordIds: input.decision.recordIds,
    basis: input.decision.basis,
    evidenceDocumentIds: input.decision.evidenceDocumentIds,
    proposedBy: input.proposedBy ?? "agent:forensics-investigator",
    recommendation: {
      type: "billing-prevention-draft",
      leakageStatus: "projected",
      queue: "billing",
      externalWrite: false,
      basis: input.decision.basis,
      recordIds: input.decision.recordIds
    },
    requiresHumanApproval: true,
    status: "pending_human",
    dispatchedExternally: false
  };
}
