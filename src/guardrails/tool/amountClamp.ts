import { Decimal } from "decimal.js";
import type { Money } from "../../types/money.js";

export function clampToComputedDelta(requestedAmount: Money, computedDeltaAmount: Money): Money {
  return Decimal.min(requestedAmount, computedDeltaAmount);
}
