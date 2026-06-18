import { evaluateDamageEvidenceValid } from "./damageEvidenceValid.js";
import { evaluateDuplicateCredit } from "./duplicateCredit.js";
import { evaluateOtifFineValid } from "./otifFineValid.js";
import { evaluateOtifTimestampMismatch } from "./otifTimestampMismatch.js";
import { evaluatePricingBelowContract } from "./pricingBelowContract.js";
import { evaluatePromoNotCaptured } from "./promoNotCaptured.js";
import { evaluatePromoOverclaim } from "./promoOverclaim.js";
import { evaluateShortagePodMismatch } from "./shortagePodMismatch.js";
import type {
  DamageEvidenceValidInput,
  DuplicateCreditInput,
  OtifFineValidInput,
  OtifTimestampMismatchInput,
  PricingBelowContractInput,
  PromoNotCapturedInput,
  PromoOverclaimInput,
  RuleFinding,
  RuleId,
  RuleInput,
  ShortagePodMismatchInput
} from "./types.js";

export type {
  DamageEvidenceValidInput,
  DuplicateCreditInput,
  OtifFineValidInput,
  OtifTimestampMismatchInput,
  PricingBelowContractInput,
  PromoNotCapturedInput,
  PromoOverclaimInput,
  RuleFinding,
  RuleId,
  RuleInput,
  ShortagePodMismatchInput
} from "./types.js";
export { ruleIds } from "./types.js";
export { evaluateDamageEvidenceValid } from "./damageEvidenceValid.js";
export { evaluateDuplicateCredit } from "./duplicateCredit.js";
export { evaluateOtifFineValid } from "./otifFineValid.js";
export { evaluateOtifTimestampMismatch } from "./otifTimestampMismatch.js";
export { evaluatePricingBelowContract } from "./pricingBelowContract.js";
export { evaluatePromoNotCaptured } from "./promoNotCaptured.js";
export { evaluatePromoOverclaim } from "./promoOverclaim.js";
export { evaluateShortagePodMismatch } from "./shortagePodMismatch.js";

export const ruleRegistry = {
  "damage-evidence-valid": evaluateDamageEvidenceValid,
  "promo-not-captured": evaluatePromoNotCaptured,
  "shortage-pod-mismatch": evaluateShortagePodMismatch,
  "otif-fine-valid": evaluateOtifFineValid,
  "otif-timestamp-mismatch": evaluateOtifTimestampMismatch,
  "pricing-below-contract": evaluatePricingBelowContract,
  "promo-overclaim": evaluatePromoOverclaim,
  "duplicate-credit": evaluateDuplicateCredit
} satisfies {
  "damage-evidence-valid": (input: DamageEvidenceValidInput) => RuleFinding | undefined;
  "promo-not-captured": (input: PromoNotCapturedInput) => RuleFinding | undefined;
  "shortage-pod-mismatch": (input: ShortagePodMismatchInput) => RuleFinding | undefined;
  "otif-fine-valid": (input: OtifFineValidInput) => RuleFinding | undefined;
  "otif-timestamp-mismatch": (input: OtifTimestampMismatchInput) => RuleFinding | undefined;
  "pricing-below-contract": (input: PricingBelowContractInput) => RuleFinding | undefined;
  "promo-overclaim": (input: PromoOverclaimInput) => RuleFinding | undefined;
  "duplicate-credit": (input: DuplicateCreditInput) => RuleFinding | undefined;
};

export function evaluateRule(ruleId: "damage-evidence-valid", input: DamageEvidenceValidInput): RuleFinding | undefined;
export function evaluateRule(ruleId: "promo-not-captured", input: PromoNotCapturedInput): RuleFinding | undefined;
export function evaluateRule(ruleId: "shortage-pod-mismatch", input: ShortagePodMismatchInput): RuleFinding | undefined;
export function evaluateRule(ruleId: "otif-fine-valid", input: OtifFineValidInput): RuleFinding | undefined;
export function evaluateRule(ruleId: "otif-timestamp-mismatch", input: OtifTimestampMismatchInput): RuleFinding | undefined;
export function evaluateRule(ruleId: "pricing-below-contract", input: PricingBelowContractInput): RuleFinding | undefined;
export function evaluateRule(ruleId: "promo-overclaim", input: PromoOverclaimInput): RuleFinding | undefined;
export function evaluateRule(ruleId: "duplicate-credit", input: DuplicateCreditInput): RuleFinding | undefined;
export function evaluateRule(ruleId: RuleId, input: RuleInput): RuleFinding | undefined;
export function evaluateRule(ruleId: RuleId, input: RuleInput): RuleFinding | undefined {
  switch (ruleId) {
    case "damage-evidence-valid":
      return input.ruleId === ruleId ? evaluateDamageEvidenceValid(input) : undefined;
    case "promo-not-captured":
      return input.ruleId === ruleId ? evaluatePromoNotCaptured(input) : undefined;
    case "shortage-pod-mismatch":
      return input.ruleId === ruleId ? evaluateShortagePodMismatch(input) : undefined;
    case "otif-fine-valid":
      return input.ruleId === ruleId ? evaluateOtifFineValid(input) : undefined;
    case "otif-timestamp-mismatch":
      return input.ruleId === ruleId ? evaluateOtifTimestampMismatch(input) : undefined;
    case "pricing-below-contract":
      return input.ruleId === ruleId ? evaluatePricingBelowContract(input) : undefined;
    case "promo-overclaim":
      return input.ruleId === ruleId ? evaluatePromoOverclaim(input) : undefined;
    case "duplicate-credit":
      return input.ruleId === ruleId ? evaluateDuplicateCredit(input) : undefined;
  }
}
