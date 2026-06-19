export interface ProposeTermsInput {
  customerId: string;
  terms: "2/10 Net-30 + deposit/clearance condition";
  recordIds: string[];
  basis: string;
  proposedBy?: string;
}

export interface ProposedTermsAction {
  actionId: string;
  actionType: "propose-terms";
  customerId: string;
  terms: "2/10 Net-30 + deposit/clearance condition";
  recordIds: string[];
  basis: string;
  proposedBy: string;
  requiresHumanApproval: true;
  status: "pending_human";
  dispatchedExternally: false;
}

export function proposeTerms(input: ProposeTermsInput): ProposedTermsAction {
  return {
    actionId: `propose-terms:${input.customerId}`,
    actionType: "propose-terms",
    customerId: input.customerId,
    terms: input.terms,
    recordIds: input.recordIds,
    basis: input.basis,
    proposedBy: input.proposedBy ?? "agent:sentinel",
    requiresHumanApproval: true,
    status: "pending_human",
    dispatchedExternally: false
  };
}
