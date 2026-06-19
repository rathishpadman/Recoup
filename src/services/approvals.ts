import type { DraftRebillAction } from "../tools/actions/draftRebill.js";
import type { DraftOutreachAction } from "../tools/actions/draftOutreach.js";
import type { RouteBillingAction } from "../tools/actions/routeBilling.js";

export type ProposedExternalAction = DraftOutreachAction | DraftRebillAction | RouteBillingAction;
export type ApprovalDecision = "approve" | "modify" | "reject";

export interface ApprovalInput {
  decision: ApprovalDecision;
  approverId: string;
}

export interface ApprovalResult {
  actionId: string;
  decision: ApprovalDecision;
  approverId: string;
  status: "human_decided";
}

export function decideApproval(action: ProposedExternalAction, input: ApprovalInput): ApprovalResult {
  if (input.approverId === action.proposedBy) {
    throw new Error("Proposer cannot approve its own action.");
  }

  if (!input.approverId.startsWith("human:")) {
    throw new Error("Approval requires a human approver.");
  }

  return {
    actionId: action.actionId,
    decision: input.decision,
    approverId: input.approverId,
    status: "human_decided"
  };
}
