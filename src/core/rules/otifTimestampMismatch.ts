import { buildFinding } from "./shared.js";
import type { OtifTimestampMismatchInput, RuleFinding } from "./types.js";

const basis = "3PL POD timestamp shows delivery was on time.";

export function evaluateOtifTimestampMismatch(input: OtifTimestampMismatchInput): RuleFinding | undefined {
  if (!input.otifFineAssessed || !input.podTimestampOnTime) {
    return undefined;
  }

  if (!input.allowedFineAmount) {
    return undefined;
  }

  return buildFinding(input, input.claimedAmount.minus(input.allowedFineAmount), basis);
}
