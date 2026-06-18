import type { Money } from "../../types/money.js";

export const ruleIds = [
  "damage-evidence-valid",
  "promo-not-captured",
  "shortage-pod-mismatch",
  "otif-fine-valid",
  "otif-timestamp-mismatch",
  "pricing-below-contract",
  "promo-overclaim",
  "duplicate-credit"
] as const;

export type RuleId = (typeof ruleIds)[number];

interface BaseRuleInput {
  ruleId: RuleId;
  lineId: string;
  period: string;
  recordIds: string[];
  claimedAmount: Money;
}

export interface DamageEvidenceValidInput extends BaseRuleInput {
  ruleId: "damage-evidence-valid";
  damagedGoodsAmount?: Money;
  salvageCreditAmount?: Money;
  photoEvidenceReceived: boolean;
  carrierReportReceived: boolean;
}

export interface PromoNotCapturedInput extends BaseRuleInput {
  ruleId: "promo-not-captured";
  approvedPromoAccrual?: Money;
  capturedPromoCredit?: Money;
  approvedPromoExists: boolean;
  invoiceBilledAtList: boolean;
}

export interface ShortagePodMismatchInput extends BaseRuleInput {
  ruleId: "shortage-pod-mismatch";
  allowedShortageAmount?: Money;
  claimedShortage: boolean;
  podSignedFullDelivery: boolean;
}

export interface OtifFineValidInput extends BaseRuleInput {
  ruleId: "otif-fine-valid";
  allowedFineAmount?: Money;
  contractSlaAllowsFine: boolean;
  slaBreachConfirmed: boolean;
}

export interface OtifTimestampMismatchInput extends BaseRuleInput {
  ruleId: "otif-timestamp-mismatch";
  allowedFineAmount?: Money;
  otifFineAssessed: boolean;
  podTimestampOnTime: boolean;
}

export interface PricingBelowContractInput extends BaseRuleInput {
  ruleId: "pricing-below-contract";
  contractedUnitPrice?: Money;
  deliveredQuantity?: string;
  actualPaidAmount?: Money;
  deductedBelowContractPrice: boolean;
  contractPriceAvailable: boolean;
}

export interface PromoOverclaimInput extends BaseRuleInput {
  ruleId: "promo-overclaim";
  claimedAllowance?: Money;
  approvedAccrual?: Money;
  approvedAccrualExceeded: boolean;
}

export interface DuplicateCreditInput extends BaseRuleInput {
  ruleId: "duplicate-credit";
  priorCreditAmount?: Money;
  alreadyCredited: boolean;
}

export type RuleInput =
  | DamageEvidenceValidInput
  | PromoNotCapturedInput
  | ShortagePodMismatchInput
  | OtifFineValidInput
  | OtifTimestampMismatchInput
  | PricingBelowContractInput
  | PromoOverclaimInput
  | DuplicateCreditInput;

export interface RuleFinding {
  ruleId: RuleId;
  recordIds: string[];
  deltaAmount: Money;
  basis: string;
  eventId: string;
}

export type RuleEvaluator<TInput extends RuleInput = RuleInput> = (input: TInput) => RuleFinding | undefined;
