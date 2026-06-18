import { buildFinding } from "./shared.js";
import type { RuleFinding, ShortagePodMismatchInput } from "./types.js";

const basis = "POD shows full signed delivery for the claimed shortage.";

export function evaluateShortagePodMismatch(input: ShortagePodMismatchInput): RuleFinding | undefined {
  if (!input.claimedShortage || !input.podSignedFullDelivery) {
    return undefined;
  }

  if (!input.allowedShortageAmount) {
    return undefined;
  }

  return buildFinding(input, input.claimedAmount.minus(input.allowedShortageAmount), basis);
}
