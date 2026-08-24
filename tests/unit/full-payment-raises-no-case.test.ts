import { describe, expect, it } from "vitest";

import { startCashApplicationRun } from "../../src/services/cashApplicationRun.ts";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.ts";
import type { CashReceiptSource } from "../../src/adapters/cashReceipt.ts";

/**
 * BRD AC-02, a Must: "Payment balances the selected invoice(s); Cash
 * Application completes; no deduction, Forensics run or Maya deduction item is
 * created."
 *
 * Production created one. Sending the paid-in-full scenario raised
 * CASE-b5c704bd51d4aeea for a short payment of 0.00 USD and emitted the
 * maya_ready handoff behind it, which reads on the screen as "Passed to
 * Deduction Forensics to investigate". A person would open that case and find
 * nothing withheld, because nothing was.
 *
 * The gate above the case only asked whether the reason code validated. A
 * reason validates just as well when the amount behind it is zero, so a
 * fully-paid remittance walked straight through it.
 *
 * The run still completes. Full payment is a success, not a hold: it reaches
 * Ready with the allocation recorded and simply produces no case and no
 * handoff.
 */

const env = {
  RECOUP_CASH_ROLLOUT_STAGE: "shadow",
  RECOUP_CASH_REHEARSAL_ENABLED: "true",
  RECOUP_CASH_DEMO_POLICY_ENABLED: "true"
};

function advice(claimedDeductionAmount: string, instructedAmount: string) {
  return {
    remittanceId: "REM-FULL",
    inboundMessageId: "INBOX-FULL",
    customerReference: "CUST-001",
    legalEntityReference: "LE-001",
    paymentReference: "PAY-FULL",
    currency: "USD",
    instructedPaymentAmount: "1250.00",
    mapperVersion: "csv-v1",
    lines: [
      {
        lineId: "LINE-1",
        invoiceReference: "INV-1",
        instructedAmount,
        claimedDeductionAmount,
        claimedReasonCode: "DMG",
        claimedReasonTextSanitized: "paid in full",
        sourceRecordIds: ["SRC-1"]
      }
    ],
    sourceRecordIds: ["SRC-1"],
    provenanceMode: "replay" as const
  };
}

const invoices = [
  { invoiceRecordId: "INV-1", invoiceReference: "INV-1", balance: "1250.00", currency: "USD" }
];

const settled: CashReceiptSource = {
  findReceipt: () =>
    Promise.resolve({
      status: "settled",
      receipt: {
        receiptId: "REC-FULL",
        sourceSystem: "rehearsal-proxy",
        sourceRecordId: "REC-FULL",
        paymentReference: "PAY-FULL",
        customerReference: "CUST-001",
        legalEntityReference: "LE-001",
        amountReceived: "1250.00",
        currency: "USD",
        settlementStatus: "settled",
        valueDate: "2026-08-20",
        observedAt: "2026-08-23T09:00:00.000Z",
        retrievedAt: "2026-08-23T09:00:00.000Z",
        freshnessPolicyVersion: "rehearsal-freshness-v1",
        freshnessStatus: "fresh",
        recordIds: ["REC-FULL"]
      }
    }) as never
};

async function runFullPayment() {
  const repository = createInMemoryWorkflowRepository();
  const outcome = await startCashApplicationRun({
    advice: advice("0.00", "1250.00"),
    invoices,
    env,
    repository,
    source: settled
  });

  return { outcome, repository };
}

describe("a payment that deducts nothing (AC-02)", () => {
  it("completes rather than holding", async () => {
    const { outcome } = await runFullPayment();

    expect(outcome.state).toBe("Ready");
  });

  it("raises no deduction case", async () => {
    const { outcome } = await runFullPayment();

    expect(outcome.caseId).toBeUndefined();
    expect(outcome.liveCase).toBeUndefined();
  });

  it("hands nothing to Deduction Forensics", async () => {
    const { outcome, repository } = await runFullPayment();
    const events = await repository.listEvents(outcome.runId);

    expect(events.map((event) => event.eventType)).not.toContain("maya_ready");
    expect(events.map((event) => event.eventType)).not.toContain("case_created");
  });

  it("still records the allocation, because the money was applied", async () => {
    const { outcome, repository } = await runFullPayment();
    const events = await repository.listEvents(outcome.runId);

    expect(events.map((event) => event.phase)).toContain("allocate");
  });

  it("says in plain words that nothing was withheld", async () => {
    const { outcome, repository } = await runFullPayment();
    const events = await repository.listEvents(outcome.runId);
    const last = events[events.length - 1];

    // A run that ends with the allocation event and no closing line reads as
    // having stopped halfway.
    expect(last?.safeSummary ?? "").toMatch(/paid in full|nothing was deducted|no deduction/iu);
  });
});

describe("a payment that does deduct still raises its case", () => {
  it("keeps the short-payment path intact", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({
      advice: advice("250.00", "1000.00"),
      invoices,
      env,
      repository,
      source: settled
    });

    expect(outcome.state).toBe("Ready");
    expect(outcome.caseId).toBeDefined();
  });
});
