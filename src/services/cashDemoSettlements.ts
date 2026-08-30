import { createHash } from "node:crypto";

/**
 * Bank confirmations for the emailed test scenarios.
 *
 * A remittance advice is the customer's claim that they paid. It is not proof
 * the money arrived — that comes from the bank. Nothing confirmed the payment
 * references the test files cite, so an emailed scenario held at Waiting
 * forever and the flow could not be shown end to end through the real mailbox.
 *
 * PROXY FOR THE BANK FEED, and labelled as one on every row. This is a
 * different thing from the send control it replaces: stubbing an upstream
 * system you do not have is an ordinary boundary, whereas manufacturing the
 * counterparty's own email — and hardcoding the signature check to pass, as
 * that control did — is not a test of anything.
 *
 * Each row is shaped to let its scenario reach the outcome it is named for.
 * The refusals matter most: a payment that never arrived has no row here at
 * all, and its absence is the fixture.
 *
 * D-02 is unsigned. None of this is authoritative settlement.
 */

export interface CashDemoSettlement {
  paymentReference: string;
  customerReference: string;
  amountReceived: string;
  currency: string;
  settlementStatus: "settled" | "pending" | "reversed";
  /** Large values exercise the freshness rule rather than the happy path. */
  observedHoursAgo: number;
}

export const CASH_DEMO_SETTLEMENTS: CashDemoSettlement[] = [
  // Reaches a completed run and raises a case for the 250.00 shortfall.
  { paymentReference: "PAY-SC01", customerReference: "CUST-001", amountReceived: "1250.00", currency: "USD", settlementStatus: "settled", observedHoursAgo: 2 },
  // Completes with nothing deducted, so no case is raised.
  { paymentReference: "PAY-SC02", customerReference: "CUST-002", amountReceived: "1250.00", currency: "USD", settlementStatus: "settled", observedHoursAgo: 2 },
  // Completes once; a second delivery of the same advice is refused as a replay.
  { paymentReference: "PAY-SC03", customerReference: "CUST-003", amountReceived: "1250.00", currency: "USD", settlementStatus: "settled", observedHoursAgo: 2 },

  /*
   * PAY-SC04 is deliberately absent. That scenario is "the note arrived before
   * the money", and confirming it would delete the only thing it demonstrates.
   */

  // Money is showing but has not cleared, so nothing is applied.
  { paymentReference: "PAY-SC05", customerReference: "CUST-005", amountReceived: "1250.00", currency: "USD", settlementStatus: "pending", observedHoursAgo: 1 },
  // Settled, but older than the freshness window the policy allows.
  { paymentReference: "PAY-SC06", customerReference: "CUST-006", amountReceived: "1250.00", currency: "USD", settlementStatus: "settled", observedHoursAgo: 72 },
  // The money came back out again.
  { paymentReference: "PAY-SC07", customerReference: "CUST-007", amountReceived: "1250.00", currency: "USD", settlementStatus: "reversed", observedHoursAgo: 2 },
  // Paid in euros against an advice denominated in dollars.
  { paymentReference: "PAY-SC08", customerReference: "CUST-008", amountReceived: "1250.00", currency: "EUR", settlementStatus: "settled", observedHoursAgo: 2 },
  // Confirmed, so the run gets far enough to stop on the unrecognised reason.
  { paymentReference: "PAY-SC09", customerReference: "CUST-009", amountReceived: "1250.00", currency: "USD", settlementStatus: "settled", observedHoursAgo: 2 },
  // The multi-line advice settles a different total.
  { paymentReference: "PAY-SC10", customerReference: "CUST-010", amountReceived: "8400.50", currency: "USD", settlementStatus: "settled", observedHoursAgo: 2 }
];

/**
 * One row in the shape the receipts table takes.
 *
 * Amounts stay strings the whole way. The column is numeric, and a number here
 * is how 250.00 became 250 in production once already.
 */
export function buildSettlementRow(
  settlement: CashDemoSettlement,
  now: Date
): Record<string, unknown> {
  const observedAt = new Date(now.getTime() - settlement.observedHoursAgo * 3_600_000).toISOString();
  const receiptId = `REH-${settlement.paymentReference}`;

  return {
    receipt_id: receiptId,
    source_system: "rehearsal-proxy",
    source_record_id: receiptId,
    payment_reference: settlement.paymentReference,
    customer_reference: settlement.customerReference,
    legal_entity_reference: "LE-001",
    amount_received: settlement.amountReceived,
    currency: settlement.currency,
    settlement_status: settlement.settlementStatus,
    value_date: observedAt.slice(0, 10),
    observed_at: observedAt,
    retrieved_at: now.toISOString(),
    freshness_policy_version: "rehearsal-freshness-v1",
    freshness_status: "fresh",
    source_payload_hash: createHash("sha256").update(receiptId).digest("hex"),
    record_ids: [receiptId]
  };
}
