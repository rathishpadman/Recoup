import { describe, expect, it } from "vitest";

import { startCashApplicationRun } from "../../src/services/cashApplicationRun.js";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.js";

const demoEnv = {
  RECOUP_CASH_REHEARSAL_ENABLED: "true",
  RECOUP_CASH_DEMO_POLICY_ENABLED: "true"
};

const line = {
  lineId: "LINE-1",
  invoiceReference: "INV-1",
  instructedAmount: "1000.00",
  claimedDeductionAmount: "250.00",
  claimedReasonCode: "DMG",
  claimedReasonTextSanitized: "damaged pallet on delivery",
  sourceRecordIds: ["REM-SRC-1"]
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
  lines: [line],
  sourceRecordIds: ["REM-SRC-1"],
  provenanceMode: "replay" as const
};

const invoices = [
  { invoiceRecordId: "INV-1", invoiceReference: "INV-1", balance: "1250.00", currency: "USD" }
];

describe("remittance to Maya-ready case, end to end", () => {
  it("carries a short payment through to a live case", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });

    expect(outcome.state).toBe("Ready");
    expect(outcome.caseId).toBeDefined();
    expect(outcome.liveCase?.origin).toBe("live_cash_application");
    expect(outcome.liveCase?.validatedReason).toBe("DEP");
    expect(outcome.liveCase?.shortPaymentAmount).toBe("250.00");
    expect(outcome.liveCase?.provenanceMode).toBe("replay");
  });

  it("records the full event history in order", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });
    const events = await repository.listEvents(outcome.runId);

    expect(events.map((event) => event.eventType)).toEqual([
      "run_received",
      "phase_started",
      "phase_completed",
      "case_created",
      "maya_ready"
    ]);

    expect(events.map((event) => event.runSequence)).toEqual([1, 2, 3, 4, 5]);
    for (const event of events) {
      expect(event.recordIds.length).toBeGreaterThan(0);
      expect(event.provenanceMode).toBe("replay");
    }
  });

  it("is idempotent: replaying the same message reuses the run and the case", async () => {
    const repository = createInMemoryWorkflowRepository();
    const first = await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });
    const second = await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });

    expect(second.runId).toBe(first.runId);
    expect(second.caseId).toBe(first.caseId);
    expect(await repository.listCases()).toHaveLength(1);
  });

  it("waits rather than allocating when the receipt source is unavailable", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({
      advice,
      invoices,
      env: { RECOUP_CASH_DEMO_POLICY_ENABLED: "true" },
      repository
    });

    expect(outcome.state).toBe("AwaitingCashReceipt");
    expect(outcome.caseId).toBeUndefined();
    expect(await repository.listCases()).toHaveLength(0);

    const events = await repository.listEvents(outcome.runId);
    expect(events.at(-1)?.eventType).toBe("phase_waiting");
  });

  it("stops at ReasonReview and creates no case when the reason is unmapped", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({
      advice: { ...advice, lines: [{ ...line, claimedReasonCode: "NOT-A-CODE" }] },
      invoices,
      env: demoEnv,
      repository
    });

    expect(outcome.state).toBe("ReasonReview");
    expect(outcome.caseId).toBeUndefined();
    expect(await repository.listCases()).toHaveLength(0);
  });

  it("never creates a case without a settled receipt", async () => {
    const repository = createInMemoryWorkflowRepository();
    await startCashApplicationRun({
      advice: { ...advice, paymentReference: "PAY-NOT-A-FIXTURE" },
      invoices,
      env: demoEnv,
      repository
    });

    expect(await repository.listCases()).toHaveLength(0);
  });

  it("keeps the live case out of the S1-S8 scenario space", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });

    expect(outcome.liveCase).not.toHaveProperty("scenarioId");
    expect(outcome.caseId).not.toMatch(/^S\d+$/u);
    expect(outcome.caseId).toMatch(/^CASE-[0-9a-f]{16}$/u);
  });

  it("leaks no raw customer free text into the event log", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });
    const events = await repository.listEvents(outcome.runId);

    for (const event of events) {
      expect(event.safeSummary).not.toContain("damaged pallet on delivery");
      expect(event.safeSummary.length).toBeLessThanOrEqual(1000);
    }
  });

  it("exposes a durable cursor that advances across runs", async () => {
    const repository = createInMemoryWorkflowRepository();
    await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });

    const fromStart = await repository.readEventsSince("0");
    expect(fromStart.length).toBeGreaterThan(0);

    const lastCursor = fromStart.at(-1)?.cursor ?? "0";
    expect(await repository.readEventsSince(lastCursor)).toHaveLength(0);
  });

  it("marks the run terminal only once a case exists", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });
    const run = await repository.getRun(outcome.runId);

    expect(run?.state).toBe("Ready");
    expect(run?.caseId).toBe(outcome.caseId);
    expect(run?.terminalAt).toBeDefined();
  });
});
