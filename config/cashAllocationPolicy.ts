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
 * D-07 is unratified, so there is no approved policy to return. This is the
 * fail-closed path the design requires, not a placeholder to be filled with
 * plausible values: a wrong tolerance or rounding mode silently misallocates
 * money, which is worse than reporting a contract gap.
 *
 * To ratify: supply a reviewed object satisfying CashAllocationPolicySchema and
 * return it here, then record the policyVersion in the Phase 0 evidence pack.
 */
export function loadApprovedAllocationPolicy(): CashAllocationPolicy | undefined {
  return undefined;
}
