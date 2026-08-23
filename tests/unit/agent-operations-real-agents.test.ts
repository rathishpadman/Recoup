import { describe, expect, it } from "vitest";

import { loadAgentOperationsSnapshot } from "../../src/services/agentOperationsReadModel.ts";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.ts";
import { startCashApplicationRun } from "../../src/services/cashApplicationRun.ts";
import type { CashReceiptSource } from "../../src/adapters/cashReceipt.ts";
import type { WorkflowRepository } from "../../src/services/workflowRepository.ts";

/**
 * The roster reported four specialists and only one of them could ever move.
 *
 * Nothing wrote `specialist` on an event, so the projection fell back to
 * cash_application for everything and Deduction Forensics, Recovery Drafter and
 * Maya Queue were permanently Idle. They were decoration on a screen whose only
 * job is to report real state.
 *
 * The visible symptom was the handoff arrow lighting up while Forensics sat
 * Idle: the arrow read a real event, the roster row read a specialist that was
 * never written, and the two disagreed on the same screen.
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

const noReceipt: CashReceiptSource = {
  findReceipt: () => Promise.resolve({ status: "not_found", reason: "none" }) as never
};

async function completedRun(): Promise<WorkflowRepository> {
  const repository = createInMemoryWorkflowRepository();
  await startCashApplicationRun({ advice, invoices, env, repository, source: settled });
  return repository;
}

describe("the roster reports real agents", () => {
  it("stamps the specialist that did the work on every event", async () => {
    const repository = await completedRun();

    const events = await repository.readEventsSince("0");

    // Not one of them carried a specialist before, so the projection guessed.
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.specialist !== undefined)).toBe(true);
    expect(events[0]?.specialist).toBe("cash_application");
  });

  it("never shows an agent Idle while the arrow into it is emphasized", async () => {
    const repository = await completedRun();

    const snapshot = await loadAgentOperationsSnapshot({ repository, env });

    // The bug this exists to prevent: the graph claiming a handover the roster
    // contradicts. Whatever the states are, they have to agree.
    for (const edge of snapshot.handoffs.filter((candidate) => candidate.emphasized)) {
      const target = snapshot.roster.find((entry) => entry.agent === edge.to);

      expect(target, `${edge.to} is on the roster`).toBeDefined();
      expect(
        target?.status,
        `${edge.to} cannot be Idle while the arrow into it is emphasized`
      ).not.toBe("Idle");
    }
  });

  it("moves Deduction Forensics off Idle once a case is handed to it", async () => {
    const repository = await completedRun();

    const snapshot = await loadAgentOperationsSnapshot({ repository, env });
    const forensics = snapshot.roster.find((entry) => entry.agent === "Deduction Forensics");

    expect(forensics?.status).not.toBe("Idle");
  });

  it("leaves Deduction Forensics Idle when no case was created", async () => {
    const repository = createInMemoryWorkflowRepository();
    await startCashApplicationRun({ advice, invoices, env, repository, source: noReceipt });

    const snapshot = await loadAgentOperationsSnapshot({ repository, env });
    const forensics = snapshot.roster.find((entry) => entry.agent === "Deduction Forensics");

    // Nothing was handed over, so nothing may claim to be working.
    expect(forensics?.status).toBe("Idle");
  });

  it("says in business terms what each agent is doing", async () => {
    const repository = await completedRun();

    const snapshot = await loadAgentOperationsSnapshot({ repository, env });

    for (const entry of snapshot.roster) {
      // A reader who does not know the internals still has to be able to tell
      // what this specialist is for and whether it is busy.
      expect(entry.role, `${entry.agent} explains what it does`).toBeTypeOf("string");
      expect(entry.role.length).toBeGreaterThan(10);
      expect(entry.activity, `${entry.agent} says what is happening now`).toBeTypeOf("string");
    }
  });

  it("counts what is waiting for a person rather than reporting a machine state", async () => {
    const repository = await completedRun();

    const snapshot = await loadAgentOperationsSnapshot({ repository, env });
    const maya = snapshot.roster.find((entry) => entry.agent === "Maya Queue");

    // A queue is not an agent. What matters is how many cases are sitting in it.
    expect(maya?.activity).toContain("1");
  });
});
