import { assertActionProposalExplainability } from "../../guardrails/tool/actionProposal.js";
import type { BlockedRiskAssessment } from "../../core/risk.js";
import { z } from "zod";

const termProposalDeterministicBasisSchema = z
  .object({
    governedConfigSnapshot: z.literal("governed-config-snapshot"),
    rDriftTrigger: z.literal("governed-config-snapshot"),
    rScoreWeights: z.literal("governed-config-snapshot"),
    observedSignals: z
      .object({
        baselineDsoDays: z.number().finite(),
        currentDsoDays: z.number().finite(),
        disputeSpike: z.literal(true),
        lienSignal: z.literal(true)
      })
      .strict()
  })
  .strict();

export interface ProposeTermsInput {
  customerId: string;
  terms: string;
  recordIds: string[];
  basis: string;
  deterministicBasis: BlockedRiskAssessment["deterministicBasis"];
  proposedBy?: string;
}

export interface ProposedTermsAction {
  actionId: string;
  actionType: "propose-terms";
  customerId: string;
  terms: string;
  recordIds: string[];
  basis: string;
  deterministicBasis: BlockedRiskAssessment["deterministicBasis"];
  proposedBy: string;
  requiresHumanApproval: true;
  status: "pending_human";
  dispatchedExternally: false;
}

export function proposeTerms(input: ProposeTermsInput): ProposedTermsAction {
  const deterministicBasis = termProposalDeterministicBasisSchema.safeParse(input.deterministicBasis);
  if (!deterministicBasis.success) {
    throw new Error("Action proposals require cited recordIds and deterministic basis.");
  }
  assertActionProposalExplainability({ ...input, deterministicBasis: deterministicBasis.data });

  return {
    actionId: `propose-terms:${input.customerId}`,
    actionType: "propose-terms",
    customerId: input.customerId,
    terms: input.terms,
    recordIds: input.recordIds,
    basis: input.basis,
    deterministicBasis: deterministicBasis.data,
    proposedBy: input.proposedBy ?? "agent:sentinel",
    requiresHumanApproval: true,
    status: "pending_human",
    dispatchedExternally: false
  };
}
