import { buildFinding } from "./shared.js";
import type { PromoNotCapturedInput, RuleFinding } from "./types.js";

const basis = "Approved promotion exists and invoice was billed at list.";

export function evaluatePromoNotCaptured(input: PromoNotCapturedInput): RuleFinding | undefined {
  if (!input.approvedPromoExists || !input.invoiceBilledAtList) {
    return undefined;
  }

  if (!input.approvedPromoAccrual || !input.capturedPromoCredit) {
    return undefined;
  }

  return buildFinding(input, input.approvedPromoAccrual.minus(input.capturedPromoCredit), basis);
}
