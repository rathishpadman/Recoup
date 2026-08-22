import { z } from "zod";

import { NonEmptyId } from "../src/types/cashApplication.js";

/**
 * UTF-8 CSV v1 contract (D-05).
 *
 * ASSUMED FIELD SET - NOT OWNER-RATIFIED. D-05 and D-08 must be ratified
 * jointly and neither is signed. This column list was authored for demo
 * purposes on explicit owner instruction and is registered in
 * docs/evidence/2026-08-22-cash-application-phase-0-evidence-record.md.
 *
 * Two properties are not negotiable regardless of which columns are ratified:
 * the format is versioned, and the machine-readable claimed reason code is
 * required. Free text alone can never reach the reason validator.
 */

export const REMITTANCE_CSV_VERSION = "csv-v1-ASSUMED";

/**
 * Ordered header. The mapper rejects any file whose header does not match
 * exactly, rather than tolerating extra, missing or reordered columns: a
 * silently accepted column shift misallocates money.
 */
export const REMITTANCE_CSV_V1_HEADER = [
  "remittance_id",
  "customer_reference",
  "legal_entity_reference",
  "payment_reference",
  "currency",
  "instructed_payment_amount",
  "line_id",
  "invoice_reference",
  "instructed_amount",
  "claimed_deduction_amount",
  "claimed_reason_code",
  "claimed_reason_text"
] as const;

export type RemittanceCsvColumn = (typeof REMITTANCE_CSV_V1_HEADER)[number];

export const RemittanceCsvRowSchema = z.object({
  remittance_id: NonEmptyId,
  customer_reference: NonEmptyId,
  legal_entity_reference: NonEmptyId,
  payment_reference: NonEmptyId,
  currency: z.string().regex(/^[A-Z]{3}$/u),
  instructed_payment_amount: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/u),
  line_id: NonEmptyId,
  invoice_reference: NonEmptyId,
  instructed_amount: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/u),
  claimed_deduction_amount: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/u),
  // Required, and required for a reason: the reason validator matches only a
  // machine-readable code, so a file without one produces lines that can never
  // leave ReasonReview.
  claimed_reason_code: NonEmptyId,
  claimed_reason_text: z.string().max(1000)
});

export type RemittanceCsvRow = z.infer<typeof RemittanceCsvRowSchema>;
