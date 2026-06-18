import { buildFinding } from "./shared.js";
import type { PricingBelowContractInput, RuleFinding } from "./types.js";

const basis = "Deduction prices the line below the contracted price.";

export function evaluatePricingBelowContract(input: PricingBelowContractInput): RuleFinding | undefined {
  if (!input.deductedBelowContractPrice || !input.contractPriceAvailable) {
    return undefined;
  }

  if (!input.contractedUnitPrice || !input.deliveredQuantity || !input.actualPaidAmount) {
    return undefined;
  }

  const expectedContractAmount = input.contractedUnitPrice.times(input.deliveredQuantity);

  return buildFinding(input, expectedContractAmount.minus(input.actualPaidAmount), basis);
}
