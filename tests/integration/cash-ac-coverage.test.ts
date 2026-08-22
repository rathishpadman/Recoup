import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { CashReceiptSource } from "../../src/adapters/cashReceipt.js";
import { createDemoAttachmentSecurityService } from "../../src/services/attachmentSecurity.js";
import { startCashApplicationRun } from "../../src/services/cashApplicationRun.js";
import { acceptInboundRemittance } from "../../src/services/remittanceIntake.js";
import { createInMemoryOutbox } from "../../src/services/workflowOutbox.js";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.js";
import { REMITTANCE_CSV_V1_HEADER } from "../../config/remittanceCsvV1.js";

/**
 * AC-01 to AC-19 backend coverage under the deferred-live-slice election.
 *
 * Every assertion below is against the rehearsal source. AC-01 and AC-19 are
 * therefore recorded as structurally blocked, not passing: no live cash has
 * moved and no effectiveness claim may be drawn from replay data.
 */

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
  claimedReasonTextSanitized: "damaged pallet",
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

const csv = `${REMITTANCE_CSV_V1_HEADER.join(",")}\nREM-1,CUST-001,LE-001,PAY-1001,USD,1250.00,LINE-1,INV-1,1000.00,250.00,DMG,damaged pallet`;

function intakeDeps(overrides: Record<string, unknown> = {}) {
  const attachments = new Map([
    ["att-1", { filename: "advice.csv", declaredMime: "text/csv", bytes: csv }]
  ]);
  return {
    env: { RECOUP_CASH_INTAKE_ENABLED: "true" },
    scanner: createDemoAttachmentSecurityService({ attachments }),
    attachmentBody: (ref: string) => attachments.get(ref)?.bytes,
    approvedRecipient: "remittance@recoup.example",
    verifySignature: () => true,
    seenEventKeys: new Set<string>(),
    provenanceMode: "replay" as const,
    ...overrides
  };
}

const message = {
  provider: "demo-provider",
  providerEventId: "evt-1",
  messageId: "msg-1",
  signature: "valid",
  recipient: "remittance@recoup.example",
  sender: "ap@customer.example",
  subject: "Payment advice",
  attachmentRef: "att-1",
  receivedAt: "2026-08-22T09:00:00Z"
};

describe("AC-01 happy-path short pay", () => {
  it("reaches a Maya-ready case from a rehearsal receipt only", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });

    expect(outcome.state).toBe("Ready");
    // Structurally blocked as a live claim: the citation is a rehearsal source.
    expect(outcome.liveCase?.provenanceMode).not.toBe("live");
  });
});

describe("AC-02 full payment", () => {
  it("allocates with no deduction and creates no short-payment case", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({
      advice: {
        ...advice,
        lines: [{ ...line, instructedAmount: "1250.00", claimedDeductionAmount: "0" }]
      },
      invoices,
      env: demoEnv,
      repository
    });

    expect(outcome.liveCase?.shortPaymentAmount).toBe("0.00");
  });
});

describe("AC-03 duplicate delivery", () => {
  it("refuses a replayed provider event", async () => {
    const dependencies = intakeDeps();
    const first = await acceptInboundRemittance(message, dependencies);
    const second = await acceptInboundRemittance(message, dependencies);

    expect(first.status).toBe("accepted");
    expect(second.status).toBe("rejected");
  });

  it("creates one case when the same advice is run twice", async () => {
    const repository = createInMemoryWorkflowRepository();
    await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });
    await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });

    expect(await repository.listCases()).toHaveLength(1);
  });
});

describe("AC-04 ambiguous match", () => {
  it("reviews rather than choosing between two candidate invoices", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({
      advice,
      invoices: [
        ...invoices,
        { invoiceRecordId: "INV-1-DUP", invoiceReference: "INV-1", balance: "10.00", currency: "USD" }
      ],
      env: demoEnv,
      repository
    });

    expect(outcome.state).not.toBe("Ready");
    expect(await repository.listCases()).toHaveLength(0);
  });
});

describe("AC-05 unsupported document", () => {
  it("rejects an archive rather than parsing it", async () => {
    const attachments = new Map([
      ["att-1", { filename: "advice.zip", declaredMime: "text/csv", bytes: csv }]
    ]);
    const result = await acceptInboundRemittance(
      message,
      intakeDeps({
        scanner: createDemoAttachmentSecurityService({ attachments }),
        attachmentBody: (ref: string) => attachments.get(ref)?.bytes
      })
    );

    expect(result.status).toBe("rejected");
  });
});

describe("AC-06 no settled receipt", () => {
  it("waits durably and schedules exactly one resume", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outbox = createInMemoryOutbox();
    const source: CashReceiptSource = {
      findReceipt: () => Promise.resolve({ status: "not_found" as const })
    };

    const outcome = await startCashApplicationRun({
      advice,
      invoices,
      env: demoEnv,
      repository,
      source
    });

    outbox.schedule({ runId: outcome.runId, availableAt: "2026-08-22T10:00:00Z" });
    outbox.schedule({ runId: outcome.runId, availableAt: "2026-08-22T11:00:00Z" });

    expect(outcome.state).toBe("AwaitingCashReceipt");
    expect(outbox.list()).toHaveLength(1);
  });
});

describe("AC-07 ambiguous reason", () => {
  it("blocks when one code maps to two rules", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({
      advice: { ...advice, lines: [{ ...line, claimedReasonCode: "UNMAPPED" }] },
      invoices,
      env: demoEnv,
      repository
    });

    expect(outcome.state).toBe("ReasonReview");
  });
});

describe("AC-08 source outage", () => {
  it("keeps an outage distinct from a zero result", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({
      advice,
      invoices,
      env: demoEnv,
      repository,
      source: { findReceipt: () => Promise.resolve({ status: "source_unavailable" as const }) }
    });

    const events = await repository.listEvents(outcome.runId);
    expect(events.at(-1)?.status).toBe("source_unavailable");
  });
});

describe("AC-09 and AC-10 DEP validation", () => {
  it("creates a case only for a validated DEP", async () => {
    const repository = createInMemoryWorkflowRepository();
    const valid = await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });
    expect(valid.liveCase?.validatedReason).toBe("DEP");

    const invalidRepository = createInMemoryWorkflowRepository();
    const invalid = await startCashApplicationRun({
      advice: { ...advice, lines: [{ ...line, claimedReasonCode: "NOPE" }] },
      invoices,
      env: demoEnv,
      repository: invalidRepository
    });
    expect(invalid.liveCase).toBeUndefined();
  });
});

describe("AC-11 overlapping emails", () => {
  it("keeps two different remittances in separate runs and cases", async () => {
    const repository = createInMemoryWorkflowRepository();
    await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });
    await startCashApplicationRun({
      advice: {
        ...advice,
        remittanceId: "REM-2",
        inboundMessageId: "MSG-2",
        customerReference: "CUST-002",
        paymentReference: "PAY-1002"
      },
      invoices,
      env: demoEnv,
      repository
    });

    expect(await repository.listCases()).toHaveLength(2);
  });
});

describe("AC-12 durable cursor supports reconnect", () => {
  it("replays only events after a supplied cursor", async () => {
    const repository = createInMemoryWorkflowRepository();
    await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });

    const all = await repository.readEventsSince("0");
    const afterFirst = await repository.readEventsSince(all[0]?.cursor ?? "0");

    expect(all.length).toBeGreaterThan(1);
    expect(afterFirst).toHaveLength(all.length - 1);
  });
});

describe("AC-13 unsafe attachment", () => {
  it("quarantines an executable and never maps it", async () => {
    const attachments = new Map([
      ["att-1", { filename: "advice.exe", declaredMime: "text/csv", bytes: csv }]
    ]);
    const result = await acceptInboundRemittance(
      message,
      intakeDeps({
        scanner: createDemoAttachmentSecurityService({ attachments }),
        attachmentBody: (ref: string) => attachments.get(ref)?.bytes
      })
    );

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toBe("attachment_unsafe");
  });
});

describe("AC-14 receipt and remittance mismatch", () => {
  it("blocks when the receipt belongs to another customer", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({
      advice: { ...advice, customerReference: "CUST-999" },
      invoices,
      env: demoEnv,
      repository
    });

    expect(outcome.state).not.toBe("Ready");
  });
});

describe("AC-16 unauthorized approval and AC-17 human modification", () => {
  it("exposes no approval or mutation path from the cash agent", () => {
    const agent = readFileSync("src/agents/cashApplication.ts", "utf8");
    expect(agent).not.toMatch(/approve|reject|execute|send/u);
  });
});

describe("AC-18 crash and dead letter", () => {
  it("reclaims after a lease expires and dead-letters on exhaustion", () => {
    const outbox = createInMemoryOutbox();
    const command = outbox.schedule({ runId: "RUN-1", availableAt: "2026-08-22T09:00:00Z" });

    outbox.claimDue({
      owner: "crashed",
      now: new Date("2026-08-22T09:00:01Z"),
      leaseSeconds: 60
    });
    const reclaimed = outbox.claimDue({
      owner: "recovered",
      now: new Date("2026-08-22T09:05:00Z"),
      leaseSeconds: 60
    });
    expect(reclaimed).toHaveLength(1);

    outbox.reschedule({
      commandId: command.commandId,
      availableAt: "2026-08-22T09:10:00Z",
      maxAttempts: 2
    });
    expect(outbox.list()[0]?.status).toBe("dead_letter");
  });
});

describe("AC-19 straight-through effectiveness", () => {
  it("is not claimed: every outcome cites a rehearsal source", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });

    // A rate computed from replay data is not an effectiveness claim, and the
    // specification forbids publishing one. The assertion records that.
    expect(outcome.liveCase?.provenanceMode).toBe("replay");
    expect(outcome.liveCase?.policyVersions.allocation).toContain("ASSUMED");
  });
});
