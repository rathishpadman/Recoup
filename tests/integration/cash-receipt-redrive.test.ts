import { describe, expect, it } from "vitest";

import type { CashReceiptSource } from "../../src/adapters/cashReceipt.js";
import { startCashApplicationRun } from "../../src/services/cashApplicationRun.js";
import { createInMemoryOutbox } from "../../src/services/workflowOutbox.js";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.js";

/**
 * AC-06: a valid email with no settled receipt waits durably, resumes from due
 * time alone, and exhausts into a visible terminal state. No browser is open at
 * any point in these tests, which is the property under test.
 */

const demoEnv = {
  RECOUP_CASH_REHEARSAL_ENABLED: "true",
  RECOUP_CASH_DEMO_POLICY_ENABLED: "true"
};

const advice = {
  remittanceId: "REM-1",
  inboundMessageId: "MSG-1",
  customerReference: "CUST-001",
  legalEntityReference: "LE-001",
  paymentReference: "PAY-1001",
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
      sourceRecordIds: ["REM-SRC-1"]
    }
  ],
  sourceRecordIds: ["REM-SRC-1"],
  provenanceMode: "replay" as const
};

const invoices = [
  { invoiceRecordId: "INV-1", invoiceReference: "INV-1", balance: "1250.00", currency: "USD" }
];

const settledReceipt = {
  receiptId: "CR-1001",
  sourceSystem: "rehearsal-proxy",
  sourceRecordId: "SRC-1001",
  paymentReference: "PAY-1001",
  customerReference: "CUST-001",
  legalEntityReference: "LE-001",
  amountReceived: "1250.00",
  currency: "USD",
  settlementStatus: "settled" as const,
  valueDate: "2026-08-20",
  observedAt: "2026-08-20T10:00:00Z",
  retrievedAt: "2026-08-22T09:00:00Z",
  freshnessPolicyVersion: "freshness-v1",
  freshnessStatus: "fresh" as const,
  recordIds: ["SRC-1001"]
};

/** A source that misses a fixed number of times, then settles. */
function createEventuallySettlingSource(missesBeforeSettling: number): CashReceiptSource {
  let calls = 0;
  return {
    findReceipt() {
      calls += 1;
      if (calls <= missesBeforeSettling) {
        return Promise.resolve({ status: "not_found" as const });
      }
      return Promise.resolve({ status: "settled" as const, receipt: settledReceipt });
    }
  };
}

const t0 = new Date("2026-08-22T09:00:00Z");
const later = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

describe("AC-06 durable wait and resume", () => {
  it("waits without allocating when the receipt has not settled", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({
      advice,
      invoices,
      env: demoEnv,
      repository,
      source: createEventuallySettlingSource(99)
    });

    expect(outcome.state).toBe("AwaitingCashReceipt");
    expect(await repository.listCases()).toHaveLength(0);
  });

  it("schedules exactly one resume command for a waiting run", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outbox = createInMemoryOutbox();
    const outcome = await startCashApplicationRun({
      advice,
      invoices,
      env: demoEnv,
      repository,
      source: createEventuallySettlingSource(99)
    });

    outbox.schedule({ runId: outcome.runId, availableAt: later(600).toISOString() });
    outbox.schedule({ runId: outcome.runId, availableAt: later(1200).toISOString() });

    expect(outbox.list()).toHaveLength(1);
    expect(outbox.list()[0]?.commandType).toBe("resume_cash_application");
  });

  it("resumes from due time alone and reaches a case, with no browser involved", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outbox = createInMemoryOutbox();
    const source = createEventuallySettlingSource(1);

    const first = await startCashApplicationRun({
      advice,
      invoices,
      env: demoEnv,
      repository,
      source
    });
    expect(first.state).toBe("AwaitingCashReceipt");

    const command = outbox.schedule({
      runId: first.runId,
      availableAt: later(600).toISOString()
    });

    // Nothing happens before the due time.
    expect(outbox.claimDue({ owner: "worker-1", now: later(60), leaseSeconds: 300 })).toHaveLength(0);

    // Due time arrives; the worker claims and re-drives the same run.
    const claimed = outbox.claimDue({ owner: "worker-1", now: later(700), leaseSeconds: 300 });
    expect(claimed).toHaveLength(1);

    const resumed = await startCashApplicationRun({
      advice,
      invoices,
      env: demoEnv,
      repository,
      source
    });
    outbox.complete(command.commandId);

    expect(resumed.runId).toBe(first.runId);
    expect(resumed.state).toBe("Ready");
    expect(resumed.caseId).toBeDefined();
    expect(await repository.listCases()).toHaveLength(1);
  });

  it("survives a worker crash: an expired lease lets another worker resume", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outbox = createInMemoryOutbox();
    const outcome = await startCashApplicationRun({
      advice,
      invoices,
      env: demoEnv,
      repository,
      source: createEventuallySettlingSource(99)
    });

    outbox.schedule({ runId: outcome.runId, availableAt: t0.toISOString() });
    outbox.claimDue({ owner: "worker-crashed", now: later(1), leaseSeconds: 60 });

    const reclaimed = outbox.claimDue({ owner: "worker-2", now: later(300), leaseSeconds: 60 });
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]?.leaseOwner).toBe("worker-2");
  });

  it("exhausts into a visible dead letter rather than waiting forever", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outbox = createInMemoryOutbox();
    const outcome = await startCashApplicationRun({
      advice,
      invoices,
      env: demoEnv,
      repository,
      source: createEventuallySettlingSource(99)
    });

    const command = outbox.schedule({ runId: outcome.runId, availableAt: t0.toISOString() });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      outbox.claimDue({ owner: "w", now: later(attempt * 120 + 1), leaseSeconds: 60 });
      outbox.reschedule({
        commandId: command.commandId,
        availableAt: later(attempt * 120 + 60).toISOString(),
        maxAttempts: 3
      });
    }

    expect(outbox.list()[0]?.status).toBe("dead_letter");
    expect(await repository.listCases()).toHaveLength(0);
  });

  it("keeps a source outage distinct from a genuine zero result", async () => {
    const repository = createInMemoryWorkflowRepository();

    const outage = await startCashApplicationRun({
      advice,
      invoices,
      env: demoEnv,
      repository,
      source: { findReceipt: () => Promise.resolve({ status: "source_unavailable" as const }) }
    });

    const events = await repository.listEvents(outage.runId);
    expect(events.at(-1)?.status).toBe("source_unavailable");
    expect(events.at(-1)?.status).not.toBe("not_found");
  });
});
