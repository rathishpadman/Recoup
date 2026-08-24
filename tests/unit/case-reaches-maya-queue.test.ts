import { describe, expect, it } from "vitest";

import { startCashApplicationRun } from "../../src/services/cashApplicationRun.ts";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.ts";
import type { CashReceiptSource } from "../../src/adapters/cashReceipt.ts";

/**
 * The last box of the flow, which was never connected.
 *
 * A completed short payment writes a LiveDeductionCase and emits maya_ready —
 * "Passed to Deduction Forensics to investigate". Nothing was passed anywhere.
 * The case lands in recoup_live_deduction_cases; Maya's work list is built from
 * recoup_deduction_claims. Production proved it: one case, twenty claims, zero
 * overlap. Her twenty items are seed data and always were.
 *
 * So the handover event was true about intent and false about effect, which is
 * the worst combination: the screen said a person had been given the work.
 *
 * The claim is written from the case rather than recomputed. Every value it
 * needs is already on the case, and a second derivation is a second chance to
 * disagree about the money.
 */

const env = {
  RECOUP_CASH_ROLLOUT_STAGE: "shadow",
  RECOUP_CASH_REHEARSAL_ENABLED: "true",
  RECOUP_CASH_DEMO_POLICY_ENABLED: "true"
};

function advice(claimedDeductionAmount: string, instructedAmount: string) {
  return {
    remittanceId: "REM-Q1",
    inboundMessageId: "INBOX-Q1",
    customerReference: "CUST-001",
    legalEntityReference: "LE-001",
    paymentReference: "PAY-Q1",
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
        claimedReasonTextSanitized: "two pallets arrived damaged",
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
        receiptId: "REC-Q1",
        sourceSystem: "rehearsal-proxy",
        sourceRecordId: "REC-Q1",
        paymentReference: "PAY-Q1",
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
        recordIds: ["REC-Q1"]
      }
    }) as never
};

async function shortPayment() {
  const repository = createInMemoryWorkflowRepository();
  const outcome = await startCashApplicationRun({
    advice: advice("250.00", "1000.00"),
    invoices,
    env,
    repository,
    source: settled
  });

  return { repository, outcome };
}

describe("a raised case reaches the queue a person actually works from", () => {
  it("writes a claim, not only a case", async () => {
    const { repository } = await shortPayment();

    expect(await repository.listDeductionClaims()).toHaveLength(1);
  });

  it("files it under the same identity as the case", async () => {
    const { repository, outcome } = await shortPayment();
    const [claim] = await repository.listDeductionClaims();

    expect(claim?.claimId).toBe(outcome.caseId);
  });

  it("carries the money across without recomputing it", async () => {
    const { repository, outcome } = await shortPayment();
    const [claim] = await repository.listDeductionClaims();

    expect(claim?.claimAmount).toBe(outcome.liveCase?.shortPaymentAmount);
    // The cents are the whole point. 250, not 250.00, is the bug that already
    // reached production once through a numeric column.
    expect(claim?.claimAmount).toBe("250.00");
  });

  it("cites the customer, invoice and remittance a reviewer needs", async () => {
    const { repository } = await shortPayment();
    const [claim] = await repository.listDeductionClaims();

    expect(claim?.customerId).toBe("CUST-001");
    expect(claim?.invoiceRef).toBe("INV-1");
    expect(claim?.remittanceEvidenceId).toBe("REM-Q1");
    expect(claim?.recordIds.length).toBeGreaterThan(0);
  });

  it("uses the validated reason, not the one the customer claimed", async () => {
    const { repository } = await shortPayment();
    const [claim] = await repository.listDeductionClaims();

    // DMG is what they said. DEP is what policy validated it to.
    expect(claim?.reasonCode).toBe("DEP");
  });

  it("carries no scenario identity onto a live-case surface", async () => {
    const { repository } = await shortPayment();
    const [claim] = await repository.listDeductionClaims();

    expect(claim?.goldScenarioId).toBeUndefined();
  });
});

describe("nothing else writes a claim", () => {
  it("does not queue work for a payment that deducted nothing", async () => {
    const repository = createInMemoryWorkflowRepository();
    await startCashApplicationRun({
      advice: advice("0.00", "1250.00"),
      invoices,
      env,
      repository,
      source: settled
    });

    // AC-02 again: no deduction, no Forensics run, no Maya item.
    expect(await repository.listDeductionClaims()).toHaveLength(0);
  });

  it("does not queue work for a payment still waiting on the money", async () => {
    const repository = createInMemoryWorkflowRepository();
    await startCashApplicationRun({
      advice: advice("250.00", "1000.00"),
      invoices,
      env,
      repository,
      source: { findReceipt: () => Promise.resolve({ status: "not_found", reason: "no receipt" }) as never }
    });

    expect(await repository.listDeductionClaims()).toHaveLength(0);
  });
});
