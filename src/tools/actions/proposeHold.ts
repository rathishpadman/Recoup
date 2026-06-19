import type { PartialHoldResult } from "../../core/partialHold.js";
import type { Money } from "../../types/money.js";

export interface ProposeHoldInput {
  customerId: string;
  orderId: string;
  orderAmount: Money;
  partialHold: PartialHoldResult;
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
  recordIds: string[];
  basis: string;
  proposedBy: string;
  requiresHumanApproval: true;
  status: "pending_human";
  dispatchedExternally: false;
}

export function proposeHold(input: ProposeHoldInput): ProposedHoldAction {
  const releaseRatio = input.partialHold.releaseRatioPercent;
  const proposedReleaseAmount = input.orderAmount.times(releaseRatio).dividedBy(100).toDecimalPlaces(2);

  return {
    actionId: `propose-hold:${input.orderId}`,
    actionType: "propose-hold",
    customerId: input.customerId,
    orderId: input.orderId,
    orderAmount: input.orderAmount,
    proposedReleaseAmount,
    proposedBackOrderAmount: input.orderAmount.minus(proposedReleaseAmount).toDecimalPlaces(2),
    amountSource: "partial-hold-core",
    releaseRatioPercent: releaseRatio,
    recordIds: input.recordIds,
    basis: input.basis,
    proposedBy: input.proposedBy ?? "agent:risk-mesh-supervisor",
    requiresHumanApproval: true,
    status: "pending_human",
    dispatchedExternally: false
  };
}
