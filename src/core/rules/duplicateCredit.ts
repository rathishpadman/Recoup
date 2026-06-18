import { buildFinding } from "./shared.js";
import type { DuplicateCreditInput, RuleFinding } from "./types.js";

const basis = "Deduction duplicates an already-issued credit memo.";

export function evaluateDuplicateCredit(input: DuplicateCreditInput): RuleFinding | undefined {
  if (!input.alreadyCredited) {
    return undefined;
  }

  if (!input.priorCreditAmount) {
    return undefined;
  }

  return buildFinding(input, input.priorCreditAmount, basis);
}
