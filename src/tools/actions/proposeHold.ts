import {
  computePartialHoldAmountSplit,
  type PartialHoldAmountSplit,
  type PartialHoldResult
} from "../../core/partialHold.js";
import { assertActionProposalExplainability } from "../../guardrails/tool/actionProposal.js";
import type { Money } from "../../types/money.js";

export interface HoldProposalDeterministicBasis {
  amountSource: "partial-hold-core";
  compositeScore: string;
  releaseRatioPercent: string;
}

export interface ProposeHoldInput {
  customerId: string;
  orderId: string;
  orderAmount: Money;
  partialHold: PartialHoldResult;
  amountSplit: PartialHoldAmountSplit;
  recordIds: string[];
  basis: string;
  proposedBy?: string;
}

export interface ProposedHoldAction {
  actionId: string;
  actionType: "propose-hold";
  customerId: string;
  orderId: string;
  orderAmount: Money;
  proposedReleaseAmount: Money;
  proposedBackOrderAmount: Money;
  amountSource: "partial-hold-core";
  releaseRatioPercent: Money;
  deterministicBasis: HoldProposalDeterministicBasis;
  recordIds: string[];
  basis: string;
  proposedBy: string;
  requiresHumanApproval: true;
  status: "pending_human";
  dispatchedExternally: false;
}

export function proposeHold(input: ProposeHoldInput): ProposedHoldAction {
  const deterministicBasis = {
    amountSource: "partial-hold-core",
    compositeScore: input.partialHold.compositeScore.toFixed(2),
    releaseRatioPercent: input.partialHold.releaseRatioPercent.toFixed(0)
  } satisfies HoldProposalDeterministicBasis;
  assertActionProposalExplainability({ ...input, deterministicBasis });

  const amountSplit = computePartialHoldAmountSplit({
    orderAmount: input.orderAmount,
    releaseRatioPercent: input.partialHold.releaseRatioPercent
  });
  if (
    !amountSplit.proposedReleaseAmount.equals(input.amountSplit.proposedReleaseAmount) ||
    !amountSplit.proposedBackOrderAmount.equals(input.amountSplit.proposedBackOrderAmount) ||
    !amountSplit.orderAmount.equals(input.amountSplit.orderAmount) ||
    !amountSplit.releaseRatioPercent.equals(input.amountSplit.releaseRatioPercent)
  ) {
    throw new Error("Partial-hold action amounts must match deterministic core split.");
  }

  return {
    actionId: `propose-hold:${input.orderId}`,
    actionType: "propose-hold",
    customerId: input.customerId,
    orderId: input.orderId,
    orderAmount: input.orderAmount,
    proposedReleaseAmount: amountSplit.proposedReleaseAmount,
    proposedBackOrderAmount: amountSplit.proposedBackOrderAmount,
    amountSource: amountSplit.amountSource,
    releaseRatioPercent: input.partialHold.releaseRatioPercent,
    deterministicBasis,
    recordIds: input.recordIds,
    basis: input.basis,
    proposedBy: input.proposedBy ?? "agent:risk-mesh-supervisor",
    requiresHumanApproval: true,
    status: "pending_human",
    dispatchedExternally: false
  };
}
