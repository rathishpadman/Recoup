import { describe, expect, it } from "vitest";

import { loadAgentOperationsSnapshot } from "../../src/services/agentOperationsReadModel.ts";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.ts";
import { startCashApplicationRun } from "../../src/services/cashApplicationRun.ts";
import type { CashReceiptSource } from "../../src/adapters/cashReceipt.ts";

/**
 * BRD FR-OPS-06: run detail shows the match and allocation snapshot, the case
 * and claim IDs, the evidence IDs and the audit receipts.
 *
 * It showed six fields, none of them these, so an operator could see that a run
 * had produced a case and nothing about what the case says.
 *
 * Money is carried as the backend formatted it. FR-OPS-10 forbids the cockpit
 * computing or reformatting a monetary value, so the string is passed through
 * exactly as the allocation produced it.
 */

const env = {
  RECOUP_CASH_ROLLOUT_STAGE: "shadow",
  RECOUP_CASH_REHEARSAL_ENABLED: "true",
  RECOUP_CASH_DEMO_POLICY_ENABLED: "true"
};

const advice = {
  remittanceId: "REM-1",
  inboundMessageId: "INBOX-1",
  customerReference: "CUST-001",
  legalEntityReference: "LE-001",
  paymentReference: "PAY-1",
  currency: "USD",
  instructedPaymentAmount: "1250.00",
  mapperVersion: "csv-v1",
  lines: [
    {
      lineId: "LINE-1",
      invoiceReference: "INV-1",
      instructedAmount: "1000.00",
      claimedDeductionAmount: "250.00",
      claimedReasonCode: "DMG",
      claimedReasonTextSanitized: "damaged pallet",
      sourceRecordIds: ["SRC-1"]
    }
  ],
  sourceRecordIds: ["SRC-1"],
  provenanceMode: "replay" as const
};

const invoices = [
  { invoiceRecordId: "INV-1", invoiceReference: "INV-1", balance: "1250.00", currency: "USD" }
];

const settled: CashReceiptSource = {
  findReceipt: () =>
    Promise.resolve({
      status: "settled",
      receipt: {
        receiptId: "REC-1",
        sourceSystem: "rehearsal-proxy",
        sourceRecordId: "REC-1",
        paymentReference: "PAY-1",
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
        recordIds: ["REC-1"]
      }
    }) as never
};

describe("agent operations run evidence", () => {
  it("reports the short payment the allocation produced", async () => {
    const repository = createInMemoryWorkflowRepository();
    await startCashApplicationRun({ advice, invoices, env, repository, source: settled });

    const snapshot = await loadAgentOperationsSnapshot({ repository, env });
    const evidence = snapshot.runs[0]?.evidence;

    expect(evidence?.shortPaymentAmount).toBe("250.00");
    expect(evidence?.currency).toBe("USD");
  });

  it("cites the receipt, allocation and remittance the case rests on", async () => {
    const repository = createInMemoryWorkflowRepository();
    await startCashApplicationRun({ advice, invoices, env, repository, source: settled });

    const snapshot = await loadAgentOperationsSnapshot({ repository, env });
    const evidence = snapshot.runs[0]?.evidence;

    expect(evidence?.receiptId).toBe("REC-1");
    expect(evidence?.remittanceId).toBe("REM-1");
    expect(evidence?.allocationId).toBeTypeOf("string");
  });

  it("names the validated reason rather than the claim", async () => {
    const repository = createInMemoryWorkflowRepository();
    await startCashApplicationRun({ advice, invoices, env, repository, source: settled });

    const snapshot = await loadAgentOperationsSnapshot({ repository, env });

    expect(snapshot.runs[0]?.evidence?.validatedReason).toBe("DEP");
  });

  it("flags an allocation built on an unratified policy", async () => {
    const repository = createInMemoryWorkflowRepository();
    await startCashApplicationRun({ advice, invoices, env, repository, source: settled });

    const snapshot = await loadAgentOperationsSnapshot({ repository, env });

    // The demo allocation and reason packs are registered as assumed, and an
    // operator must not read the result as owner-ratified.
    //
    // Receipt authority is a separate question and deliberately not answered
    // here: the case records the receipt id but not its source system, so this
    // read model cannot tell a rehearsal proxy from SAP without inventing the
    // signal. Surfacing that needs the source system on the case.
    expect(snapshot.runs[0]?.evidence?.assumedPolicy).toBe(true);
  });

  it("carries no evidence for a run that produced no case", async () => {
    const repository = createInMemoryWorkflowRepository();
    await startCashApplicationRun({
      advice,
      invoices,
      env,
      repository,
      source: { findReceipt: () => Promise.resolve({ status: "not_found", reason: "none" }) as never }
    });

    const snapshot = await loadAgentOperationsSnapshot({ repository, env });

    expect(snapshot.runs[0]?.evidence).toBeUndefined();
  });
});
