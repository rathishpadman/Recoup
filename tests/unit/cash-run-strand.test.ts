import { describe, expect, it } from "vitest";

import { startCashApplicationRun } from "../../src/services/cashApplicationRun.ts";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.ts";
import type { CashReceiptSource } from "../../src/adapters/cashReceipt.ts";

/**
 * BRD definition of done 2: a crash or retry cannot strand a run.
 *
 * It could. When a write failed after intake — a missing column, a foreign key,
 * a refused grant — the exception left the run row at Received with no terminal
 * event. The caller answered 502 and the operations screen counted the run as
 * Queued forever: work that looks pending and will never move.
 *
 * Four such runs were left in production before this was found, which is what
 * a stranded run looks like from the outside.
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

/** A repository whose case write fails, the way a refused grant does. */
function repositoryThatFailsOnCase() {
  const repository = createInMemoryWorkflowRepository();
  repository.upsertCase = () => Promise.reject(new Error("supabase request failed: 409"));
  return repository;
}

describe("a failed cash run is not left stranded", () => {
  it("still reports the failure to the caller", async () => {
    const repository = repositoryThatFailsOnCase();

    await expect(
      startCashApplicationRun({ advice, invoices, env, repository, source: settled })
    ).rejects.toThrow();
  });

  it("moves the run out of Received rather than leaving it pending forever", async () => {
    const repository = repositoryThatFailsOnCase();

    await startCashApplicationRun({ advice, invoices, env, repository, source: settled }).catch(
      () => undefined
    );

    const [run] = await repository.listRuns();

    // Received renders as Queued, so a stranded run is counted as work that is
    // about to start and never does.
    expect(run?.state).not.toBe("Received");
    expect(run?.state).toBe("Review");
  });

  it("records why it stopped, so the operator sees work rather than a gap", async () => {
    const repository = repositoryThatFailsOnCase();

    await startCashApplicationRun({ advice, invoices, env, repository, source: settled }).catch(
      () => undefined
    );

    const events = await repository.readEventsSince("0");
    const failure = events.at(-1);

    expect(failure?.eventType).toBe("error");
    expect(failure?.status).toBe("run_failed");
  });

  it("creates no case when the case write is what failed", async () => {
    const repository = repositoryThatFailsOnCase();

    await startCashApplicationRun({ advice, invoices, env, repository, source: settled }).catch(
      () => undefined
    );

    expect(await repository.listCases()).toHaveLength(0);
  });

  it("leaves a healthy run untouched", async () => {
    const repository = createInMemoryWorkflowRepository();

    const outcome = await startCashApplicationRun({
      advice,
      invoices,
      env,
      repository,
      source: settled
    });

    expect(outcome.state).toBe("Ready");
    const events = await repository.readEventsSince("0");
    expect(events.some((event) => event.eventType === "error")).toBe(false);
  });
});
