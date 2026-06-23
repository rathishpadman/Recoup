import type { Money } from "../../types/money.js";
import { clampToComputedDelta } from "../../guardrails/tool/amountClamp.js";
import { assertRecoveryActionDecision } from "../../guardrails/tool/actionBoundary.js";
import type { DeductionDecisionGuardInput } from "../../guardrails/tool/explainability.js";

export interface DraftRebillInput {
  decision: DeductionDecisionGuardInput;
  proposedBy?: string;
}

export interface DraftRebillAction {
  actionId: string;
  actionType: "draft-rebill";
  lineId: string;
  proposedAmount: Money;
  amountSource: "core-computed-delta";
  recordIds: string[];
  basis: string;
  evidenceDocumentIds: string[];
  proposedBy: string;
  requiresHumanApproval: true;
  status: "pending_human";
  dispatchedExternally: false;
}

export function draftRebill(input: DraftRebillInput): DraftRebillAction {
  assertRecoveryActionDecision(input.decision);

  const proposedAmount = clampToComputedDelta(
    input.decision.deterministicBasis.computedDeltaAmount,
    input.decision.deterministicBasis.computedDeltaAmount
  );

  return {
    actionId: `draft-rebill:${input.decision.lineId}`,
    actionType: "draft-rebill",
    lineId: input.decision.lineId,
    proposedAmount,
    amountSource: "core-computed-delta",
    recordIds: input.decision.recordIds,
    basis: input.decision.basis,
    evidenceDocumentIds: input.decision.evidenceDocumentIds,
    proposedBy: input.proposedBy ?? "agent:recovery-drafter",
    requiresHumanApproval: true,
    status: "pending_human",
    dispatchedExternally: false
  };
}
