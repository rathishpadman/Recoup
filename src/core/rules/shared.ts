import { createEventId } from "../../types/variance.js";
import type { Money } from "../../types/money.js";
import type { RuleFinding, RuleInput } from "./types.js";

export function buildFinding(input: RuleInput, deltaAmount: Money, basis: string): RuleFinding | undefined {
  if (deltaAmount.lessThanOrEqualTo(0)) {
    return undefined;
  }

  return {
    ruleId: input.ruleId,
    recordIds: input.recordIds,
    deltaAmount,
    basis,
    eventId: createEventId({
      ruleId: input.ruleId,
      recordIds: input.recordIds,
      period: input.period
    })
  };
}
