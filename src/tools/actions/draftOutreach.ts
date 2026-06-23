import { assertRecoveryActionDecision } from "../../guardrails/tool/actionBoundary.js";
import type { DeductionDecisionGuardInput } from "../../guardrails/tool/explainability.js";

export interface DraftOutreachInput {
  decision: DeductionDecisionGuardInput;
  proposedBy?: string;
}

export interface DraftOutreachAction {
  actionId: string;
  actionType: "draft-outreach";
  lineId: string;
  recordIds: string[];
  basis: string;
  proposedBy: string;
  requiresHumanApproval: true;
  status: "pending_human";
  dispatchedExternally: false;
}

export function draftOutreach(input: DraftOutreachInput): DraftOutreachAction {
  assertRecoveryActionDecision(input.decision);

  return {
    actionId: `draft-outreach:${input.decision.lineId}`,
    actionType: "draft-outreach",
    lineId: input.decision.lineId,
    recordIds: input.decision.recordIds,
    basis: input.decision.basis,
    proposedBy: input.proposedBy ?? "agent:recovery-drafter",
    requiresHumanApproval: true,
    status: "pending_human",
    dispatchedExternally: false
  };
}
