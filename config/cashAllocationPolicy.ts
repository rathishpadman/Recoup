import { z } from "zod";

import { MoneyString, NonEmptyId } from "../src/types/cashApplication.js";

/**
 * Allocation policy contract (D-07).
 *
 * Technical Design 5.2 is explicit that discounts, credits, tolerances,
 * rounding, overpayment and FX "come only from approved policy", and that
 * missing policy returns `Contract gap` rather than defaulting to zero or a
 * hard-coded tolerance. The core therefore takes policy as an input.
 *
 * This module declares the shape only. It deliberately exports no policy
 * values: every branch is required, nothing is optional, and there is no
 * fallback object. Ratifying D-07 means supplying one object that satisfies
 * this schema; until then `loadApprovedAllocationPolicy` returns undefined and
 * the core reports `policy_missing`.
 */

export const PaymentReferenceMatchRuleSchema = z.enum(["exact", "normalized"]);

export const InvoiceOrderingRuleSchema = z.enum([
  "oldest_due_date_first",
  "largest_balance_first",
  "remittance_line_order"
]);

export const CardinalityRuleSchema = z.enum(["one_to_one", "one_to_many"]);

export const RoundingModeSchema = z.enum(["half_up", "half_even", "down"]);

export const OverpaymentTreatmentSchema = z.enum([
  "unapplied_credit",
  "review",
  "blocked"
]);

export const ResidualTreatmentSchema = z.enum([
  "leave_open",
  "write_off_within_tolerance",
  "review"
]);

export const AmbiguityTreatmentSchema = z.enum(["review", "blocked"]);

export const FxPolicySchema = z.enum(["reject_cross_currency", "approved_rate_source"]);

/**
 * One field per branch the specification names as owner-owned. Nothing here has
 * a default; an incomplete object fails parsing rather than being silently
 * completed.
 */
export const CashAllocationPolicySchema = z.object({
  policyVersion: NonEmptyId,
  calculationVersion: NonEmptyId,
  paymentReferenceMatchRule: PaymentReferenceMatchRuleSchema,
  cardinality: CardinalityRuleSchema,
  invoiceOrdering: InvoiceOrderingRuleSchema,
  currencyScale: z.number().int().min(0).max(6),
  rounding: RoundingModeSchema,
  /** Absolute amount, not a percentage. "0" means no tolerance, stated explicitly. */
  amountTolerance: MoneyString,
  discountsAllowed: z.boolean(),
  creditsAllowed: z.boolean(),
  overpayment: OverpaymentTreatmentSchema,
  residual: ResidualTreatmentSchema,
  ambiguity: AmbiguityTreatmentSchema,
  fx: FxPolicySchema
});

export type CashAllocationPolicy = z.infer<typeof CashAllocationPolicySchema>;

/**
 * DEMO POLICY - ASSUMED VALUES, NOT OWNER-RATIFIED.
 *
 * D-07 is unratified. These values were authored for demo and MVP purposes on
 * explicit owner instruction; every one is an assumption, and none has been
 * reviewed by Treasury or Architecture. They are recorded field by field in
 * `docs/evidence/2026-08-22-cash-application-phase-0-evidence-record.md`.
 *
 * The bias throughout is conservative: where a choice could either resolve a
 * case automatically or send it to a human, this policy sends it to a human.
 * That makes the demo under-claim rather than over-claim, which is the safe
 * direction to be wrong in when the values are invented.
 *
 * Do not promote this object to production. Ratifying D-07 means replacing it
 * with a reviewed object and recording the new policyVersion.
 */
export const DEMO_ALLOCATION_POLICY: CashAllocationPolicy = {
  // Named so it is obvious in any allocation receipt that cites it.
  policyVersion: "demo-allocation-policy-v1-ASSUMED",
  calculationVersion: "demo-calc-v1",

  // Tolerant of casing and surrounding whitespace, because demo fixtures and
  // hand-typed references vary. Stricter than this would fail the demo for
  // cosmetic reasons; looser would risk matching unrelated payments.
  paymentReferenceMatchRule: "normalized",

  // A single remittance commonly settles several invoices.
  cardinality: "one_to_many",

  // The customer's own line order is deterministic and needs no field the
  // canonical invoice does not carry. oldest_due_date_first would need a due
  // date that is not modelled yet.
  invoiceOrdering: "remittance_line_order",

  // Two places suits the USD demo fixtures. This is exactly the assumption the
  // design warns must not be made for every currency, so it is a demo value and
  // nothing more.
  currencyScale: 2,

  // Matches the ROUND_HALF_UP already configured in src/types/money.ts, so the
  // formatter cannot disagree with the arithmetic that produced the Decimal.
  rounding: "half_up",

  // No tolerance. A penny of drift becomes a human decision rather than a
  // silent write-off, which is the right default when the number is invented.
  amountTolerance: "0",

  // Neither is modelled in the canonical remittance line, so allowing them
  // would mean inferring amounts the mapper never produced.
  discountsAllowed: false,
  creditsAllowed: false,

  // Money arriving beyond what the remittance explains is a question for a
  // human, not something to park in a credit automatically.
  overpayment: "review",
  residual: "review",
  ambiguity: "review",

  // No approved FX rate source exists, so cross-currency is refused rather than
  // converted at an invented rate.
  fx: "reject_cross_currency"
};

/**
 * Returns the approved policy, or undefined when none is approved.
 *
 * D-07 remains unratified, so this returns the demo policy only when
 * `RECOUP_CASH_DEMO_POLICY_ENABLED` is explicitly true. Production callers that
 * do not set it receive undefined and the core reports `policy_missing` or
 * `Contract gap`, which is the fail-closed path the design requires.
 */
export function loadApprovedAllocationPolicy(
  env: Partial<Record<string, string | undefined>> = process.env
): CashAllocationPolicy | undefined {
  if (env.RECOUP_CASH_DEMO_POLICY_ENABLED?.trim().toLowerCase() === "true") {
    return DEMO_ALLOCATION_POLICY;
  }

  return undefined;
}
