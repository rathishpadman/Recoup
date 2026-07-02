import type { RuleInput } from "../core/rules/index.js";
import type { RuleId } from "../core/rules/types.js";
import { CoreRuleInputSchema } from "../types/decision.js";
import type { DeductionLine } from "../types/entities.js";

// rollback only: this helper isolates pre-reconciliation settlement labels for explicit legacy/shadow operation.
export function buildLegacyRollbackRuleInput(line: DeductionLine): RuleInput {
  if (line.ruleInput === undefined) {
    throw new Error(`Legacy rollback rule input required for ${line.lineId}.`);
  }

  const ruleId = legacyRollbackRuleId(line);
  const parsed = CoreRuleInputSchema.parse(line.ruleInput) as RuleInput;
  if (parsed.lineId !== line.lineId || parsed.ruleId !== ruleId || parsed.period !== line.period) {
    throw new Error(`Legacy rollback rule input does not match settlement line ${line.lineId}.`);
  }

  return parsed;
}

export function legacyRollbackRuleId(line: DeductionLine): RuleId {
  switch (line.ruleId) {
    case "damage-evidence-valid":
    case "promo-not-captured":
    case "shortage-pod-mismatch":
    case "otif-fine-valid":
    case "otif-timestamp-mismatch":
    case "pricing-below-contract":
    case "promo-overclaim":
    case "duplicate-credit":
      return line.ruleId;
    default:
      throw new Error(`Unknown legacy rollback ruleId: ${line.ruleId}`);
  }
}
