import { Decimal } from "decimal.js";
import { z } from "zod";

import { money, type Money } from "./money.js";

/**
 * Shared primitives, transcribed from Technical Design 4.1.
 *
 * MoneyString is the JSON/persistence boundary contract and is deliberately
 * distinct from MoneySchema in ./money.ts, which preprocesses into a Decimal and
 * therefore cannot describe a JSON field.
 */
export const NonEmptyId = z.string().trim().min(1);
export const IsoTimestamp = z.string().datetime({ offset: true });
export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/u);
export const MoneyString = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u);
export const ProvenanceMode = z.enum(["live", "replay", "synthetic"]);

export type MoneyStringValue = z.infer<typeof MoneyString>;

/**
 * Receipt, instructed, applied, deduction and unapplied amounts are non-negative
 * (Technical Design 4.1). A negative value is rejected because no owner-approved
 * reversal entity exists; this validates sign only and infers nothing about how a
 * reversal would be allocated.
 */
const NonNegativeMoneyString = MoneyString.refine(
  (value) => !new Decimal(value).isNegative(),
  { message: "amount must be non-negative" }
);

export const SettlementStatusSchema = z.enum(["settled", "pending", "reversed", "unknown"]);
export const FreshnessStatusSchema = z.enum(["fresh", "stale", "unknown"]);

/** Technical Design 4.5. */
export const CashReceiptSchema = z.object({
  receiptId: NonEmptyId,
  sourceSystem: NonEmptyId,
  sourceRecordId: NonEmptyId,
  paymentReference: NonEmptyId,
  customerReference: NonEmptyId,
  legalEntityReference: NonEmptyId,
  amountReceived: NonNegativeMoneyString,
  currency: CurrencyCode,
  settlementStatus: SettlementStatusSchema,
  valueDate: z.string().date(),
  observedAt: IsoTimestamp,
  retrievedAt: IsoTimestamp,
  freshnessPolicyVersion: NonEmptyId,
  freshnessStatus: FreshnessStatusSchema,
  recordIds: z.array(NonEmptyId).min(1)
});

export type CashReceipt = z.infer<typeof CashReceiptSchema>;
export type SettlementStatus = z.infer<typeof SettlementStatusSchema>;
export type FreshnessStatus = z.infer<typeof FreshnessStatusSchema>;

/**
 * Technical Design 4.5: only settlementStatus = settled and freshnessStatus =
 * fresh may satisfy the allocation precondition. Every other combination fails
 * closed.
 */
export function satisfiesAllocationPrecondition(
  receipt: Pick<CashReceipt, "settlementStatus" | "freshnessStatus">
): boolean {
  return receipt.settlementStatus === "settled" && receipt.freshnessStatus === "fresh";
}

/**
 * The two named boundary functions from Technical Design 4.1. Repository and API
 * inputs validate MoneyString, then convert once before entering core; core
 * results stay Decimal until a formatter produces the outbound string.
 */
export function moneyStringToDecimal(value: MoneyStringValue): Money {
  return money(MoneyString.parse(value));
}

/**
 * Currency scale policy, the second half of the Technical Design 4.1 boundary
 * pair. Declared structurally here rather than imported from config so the type
 * layer stays free of a dependency on the policy module.
 */
export interface CurrencyScalePolicy {
  currencyScale: number;
  rounding: "half_up" | "half_even" | "down";
}

const decimalRoundingModes = {
  half_up: Decimal.ROUND_HALF_UP,
  half_even: Decimal.ROUND_HALF_EVEN,
  down: Decimal.ROUND_DOWN
} as const;

/**
 * The single formatter. Core results stay Decimal until this produces the
 * persistence, API or display string, so scale and rounding are applied in
 * exactly one place and come from policy rather than from an assumed two
 * decimal places.
 */
export function decimalToMoneyString(
  value: Money,
  policy: CurrencyScalePolicy
): MoneyStringValue {
  return MoneyString.parse(
    value.toFixed(policy.currencyScale, decimalRoundingModes[policy.rounding])
  );
}
