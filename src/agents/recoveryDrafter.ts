import type { DeductionDecision } from "./forensics.js";
import type { DraftRebillAction } from "../tools/actions/draftRebill.js";
import { invokeServiceTool } from "../services/serviceLayer.js";

export function draftRecovery(decision: DeductionDecision): DraftRebillAction {
  return invokeServiceTool("actions.draftRebill", {
    decisionId: decision.decisionId,
    proposedBy: "agent:recovery-drafter"
  }) as DraftRebillAction;
}
