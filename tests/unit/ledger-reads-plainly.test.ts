import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readableOutcome } from "../../cockpit/components/agent-operations/display.ts";

import { loadAgentOperationsSnapshot } from "../../src/services/agentOperationsReadModel.ts";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.ts";
import { startCashApplicationRun } from "../../src/services/cashApplicationRun.ts";
import type { CashReceiptSource } from "../../src/adapters/cashReceipt.ts";

/**
 * The activity trail is the part a reviewer reads to understand what happened,
 * and it was written in the vocabulary of the code: "remittance advice
 * accepted", "resolving cash receipt", "live deduction case created". Someone
 * in finance can guess at those, which is not the same as understanding them.
 *
 * The audit value lives in the event type, the phase and the cited record IDs,
 * and none of that changes here. Only the sentence a person reads does.
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
        receiptId: "REC-1", sourceSystem: "rehearsal-proxy", sourceRecordId: "REC-1",
        paymentReference: "PAY-1", customerReference: "CUST-001", legalEntityReference: "LE-001",
        amountReceived: "1250.00", currency: "USD", settlementStatus: "settled",
        valueDate: "2026-08-20", observedAt: "2026-08-23T09:00:00.000Z",
        retrievedAt: "2026-08-23T09:00:00.000Z", freshnessPolicyVersion: "rehearsal-freshness-v1",
        freshnessStatus: "fresh", recordIds: ["REC-1"]
      }
    }) as never
};

async function trail(source: CashReceiptSource): Promise<string[]> {
  const repository = createInMemoryWorkflowRepository();
  await startCashApplicationRun({ advice, invoices, env, repository, source });
  const snapshot = await loadAgentOperationsSnapshot({ repository, env });
  return snapshot.events.map((event) => event.event);
}

describe("the activity trail reads plainly", () => {
  it("says a payment note arrived, not that advice was accepted", async () => {
    const lines = await trail(settled);

    expect(lines[0]).toContain("Payment note");
    expect(lines.join(" ")).not.toContain("remittance advice accepted");
  });

  it("says it is checking the bank, not resolving a cash receipt", async () => {
    const lines = await trail(settled);

    expect(lines.join(" ")).toContain("money reached the bank");
    expect(lines.join(" ")).not.toContain("resolving cash receipt");
  });

  it("names the invoice and the amount applied", async () => {
    const lines = await trail(settled);
    const applied = lines.find((line) => line.includes("Applied"));

    expect(applied).toContain("1000.00 USD");
    expect(applied).toContain("INV-1");
  });

  it("says a case was raised for the shortfall, with the amount", async () => {
    const lines = await trail(settled);
    const raised = lines.find((line) => line.includes("shortfall"));

    expect(raised).toContain("250.00 USD");
  });

  it("names where the case went rather than saying it is ready", async () => {
    const lines = await trail(settled);

    expect(lines.join(" ")).toContain("Deduction Forensics");
  });

  it("explains a hold in terms of the money, not the machine", async () => {
    const lines = await trail({
      findReceipt: () => Promise.resolve({ status: "not_found", reason: "no receipt" }) as never
    });

    // "run halted: no_receipt" tells a reviewer nothing about their payment.
    expect(lines.join(" ")).not.toContain("run halted");
    expect(lines.join(" ").toLowerCase()).toContain("waiting");
  });

  it("keeps the audit fields untouched", async () => {
    const repository = createInMemoryWorkflowRepository();
    await startCashApplicationRun({ advice, invoices, env, repository, source: settled });
    const snapshot = await loadAgentOperationsSnapshot({ repository, env });

    // Readability is a presentation change. The trail is still evidence.
    for (const event of snapshot.events) {
      expect(event.eventType.length).toBeGreaterThan(0);
      expect(event.phase.length).toBeGreaterThan(0);
      expect(event.recordIds.length).toBeGreaterThan(0);
    }
  });
});

describe("why a run stopped, in words", () => {
  it("explains a stranded run instead of printing its code", () => {
    // "run_stranded" on the screen is the machine talking to itself.
    expect(readableOutcome("run_stranded")).not.toBe("run_stranded");
    expect(readableOutcome("run_stranded").toLowerCase()).toMatch(/stopped|did not finish/u);
  });

  it("keeps the two staleness answers distinguishable", () => {
    expect(readableOutcome("run_stranded")).not.toBe(readableOutcome("wait_exhausted"));
  });

  it("renders the blocker through the same words as the ledger", () => {
    const detail = readFileSync("cockpit/components/agent-operations/run-detail.tsx", "utf8");

    expect(detail).toContain("readableOutcome(detail.blockerCode)");
  });
});
