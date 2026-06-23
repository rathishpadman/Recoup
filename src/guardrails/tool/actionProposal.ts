export interface ActionProposalGuardInput {
  recordIds: string[];
  basis: string;
  deterministicBasis?: Record<string, unknown>;
}

export function assertActionProposalExplainability(proposal: ActionProposalGuardInput): void {
  if (
    proposal.recordIds.length === 0 ||
    proposal.basis.trim().length === 0 ||
    proposal.deterministicBasis === undefined ||
    Object.keys(proposal.deterministicBasis).length === 0
  ) {
    throw new Error("Action proposals require cited recordIds and deterministic basis.");
  }
}
