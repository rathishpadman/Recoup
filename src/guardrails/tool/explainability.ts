import { Decimal } from "decimal.js";
import { ruleIds } from "../../core/rules/types.js";
import type { DeductionDecisionGuardInput } from "../../types/decision.js";

export type { DeductionDecisionGuardInput } from "../../types/decision.js";

export function assertDecisionExplainability(decision: DeductionDecisionGuardInput): void {
  if (decision.recordIds.length === 0 || decision.basis.trim().length === 0) {
    throw new Error("Decision requires cited recordIds and deterministic basis.");
  }

  const amountSource: string = decision.deterministicBasis.amountSource;

  if (amountSource !== "core-rule-delta" || !ruleIds.includes(decision.deterministicBasis.ruleId) || !(decision.deterministicBasis.computedDeltaAmount instanceof Decimal)) {
    throw new Error("Decision requires cited recordIds and deterministic basis.");
  }
}
