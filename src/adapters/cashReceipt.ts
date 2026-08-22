import { z } from "zod";

import {
  CashReceiptSchema,
  satisfiesAllocationPrecondition,
  type CashReceipt
} from "../types/cashApplication.js";

/**
 * Canonical CashReceiptSource port, transcribed from Technical Design 10.
 *
 * The adapter contract is read-only. It returns canonical types only, carries
 * source health and freshness, and never converts a missing result into a
 * zero-amount receipt: a miss is an arm of the union, not a receipt of zero.
 */
export const cashReceiptLookupStatuses = [
  "settled",
  "pending",
  "ambiguous",
  "not_found",
  "stale",
  "source_unavailable",
  "contract_gap"
] as const;

export type CashReceiptLookupStatus = (typeof cashReceiptLookupStatuses)[number];

/**
 * The settled arm is the only one carrying a receipt, and the receipt it carries
 * must itself satisfy the Technical Design 4.5 allocation precondition. A
 * pending or stale receipt announced as settled is rejected here rather than
 * downstream, so an adapter cannot mislabel its own result.
 */
const SettledArmSchema = z.object({
  status: z.literal("settled"),
  receipt: CashReceiptSchema.refine(satisfiesAllocationPrecondition, {
    message: "a settled lookup result must carry a settled, fresh receipt"
  })
});

const observationArm = <Status extends CashReceiptLookupStatus>(status: Status) =>
  z.object({
    status: z.literal(status),
    reason: z.string().trim().min(1).optional()
  });

export const CashReceiptLookupResultSchema = z.discriminatedUnion("status", [
  SettledArmSchema,
  observationArm("pending"),
  observationArm("ambiguous"),
  observationArm("not_found"),
  observationArm("stale"),
  observationArm("source_unavailable"),
  observationArm("contract_gap")
]);

export type CashReceiptLookupResult = z.infer<typeof CashReceiptLookupResultSchema>;

export interface CashReceiptQuery {
  customerReference: string;
  legalEntityReference: string;
  paymentReference: string;
  instructedAmount: string;
  currency: string;
  asOf: string;
}

export interface CashReceiptSource {
  findReceipt(input: CashReceiptQuery): Promise<CashReceiptLookupResult>;
}

/**
 * Only the settled arm may precede an allocation. Source failure stays distinct
 * from a fresh zero-result, so neither can be read as the other.
 */
export function isAllocatableLookupResult(result: {
  status: CashReceiptLookupStatus;
  receipt?: CashReceipt;
}): boolean {
  return result.status === "settled";
}
