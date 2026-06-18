import { buildFinding } from "./shared.js";
import type { OtifFineValidInput, RuleFinding } from "./types.js";

const basis = "Contract SLA permits the OTIF fine and the breach is confirmed.";

export function evaluateOtifFineValid(input: OtifFineValidInput): RuleFinding | undefined {
  if (!input.contractSlaAllowsFine || !input.slaBreachConfirmed) {
    return undefined;
  }

  if (!input.allowedFineAmount) {
    return undefined;
  }

  return buildFinding(input, input.allowedFineAmount, basis);
}
