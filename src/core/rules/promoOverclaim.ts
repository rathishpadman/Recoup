import { buildFinding } from "./shared.js";
import type { PromoOverclaimInput, RuleFinding } from "./types.js";

const basis = "Claimed allowance exceeds the approved TPM accrual; overclaim is recovered in full.";

export function evaluatePromoOverclaim(input: PromoOverclaimInput): RuleFinding | undefined {
  if (!input.approvedAccrualExceeded) {
    return undefined;
  }

  if (!input.claimedAllowance || !input.approvedAccrual) {
    return undefined;
  }

  return buildFinding(input, input.claimedAllowance.minus(input.approvedAccrual), basis);
}
