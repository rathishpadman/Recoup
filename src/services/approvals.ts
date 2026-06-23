import type { DraftRebillAction } from "../tools/actions/draftRebill.js";
import type { DraftOutreachAction } from "../tools/actions/draftOutreach.js";
import type { ProposedHoldAction } from "../tools/actions/proposeHold.js";
import type { ProposedTermsAction } from "../tools/actions/proposeTerms.js";
import type { RouteBillingAction } from "../tools/actions/routeBilling.js";
import type { ContainmentReviewAction } from "../agents/containment.js";

export type ProposedExternalAction =
  | ContainmentReviewAction
  | DraftOutreachAction
  | DraftRebillAction
  | ProposedHoldAction
  | ProposedTermsAction
  | RouteBillingAction;
export type ApprovalDecision = "approve" | "modify" | "reject";

export interface ApprovableActionReference {
  actionId: string;
  proposedBy: string;
}

export interface ApprovalInput {
  decision: ApprovalDecision;
  approverId: string;
  reason?: string;
}

export interface ApprovalResult {
  actionId: string;
  decision: ApprovalDecision;
  approverId: string;
  reason?: string;
  status: "human_decided";
}

export function decideApproval(action: ApprovableActionReference, input: ApprovalInput): ApprovalResult {
  if (input.approverId === action.proposedBy) {
    throw new Error("Proposer cannot approve its own action.");
  }

  if (!input.approverId.startsWith("human:")) {
    throw new Error("Approval requires a human approver.");
  }

  const reason = input.reason?.trim();
  if (input.decision !== "approve" && (reason === undefined || reason === "")) {
    throw new Error("Modify and reject decisions require a human reason.");
  }

  const result: ApprovalResult = {
    actionId: action.actionId,
    decision: input.decision,
    approverId: input.approverId,
    status: "human_decided"
  };

  if (reason !== undefined && reason !== "") {
    return { ...result, reason };
  }

  return result;
}

export function assertApprovalReasonSafe(reason: string): void {
  if (containsDirectPiiOrSecret(reason)) {
    throw new Error("Approval reason must not contain direct PII or secrets.");
  }
}

function containsDirectPiiOrSecret(value: string): boolean {
  return (
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(value) ||
    /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/u.test(value) ||
    /\bsk-[A-Za-z0-9_-]{8,}\b/u.test(value) ||
    /(?:api[_-]?key|client[_-]?secret|password|token|secret)\s*[:=]/iu.test(value)
  );
}
