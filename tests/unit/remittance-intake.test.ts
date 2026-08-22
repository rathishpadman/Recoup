import { describe, expect, it, vi } from "vitest";

import { REMITTANCE_CSV_V1_HEADER } from "../../config/remittanceCsvV1.js";
import {
  createDemoAttachmentSecurityService,
  type DemoAttachment
} from "../../src/services/attachmentSecurity.js";
import {
  acceptInboundRemittance,
  hashSender,
  type InboundMessage
} from "../../src/services/remittanceIntake.js";

const csv = `${REMITTANCE_CSV_V1_HEADER.join(",")}\nREM-1,CUST-001,LE-001,PAY-1001,USD,1250.00,LINE-1,INV-1,1000.00,250.00,DMG,damaged pallet`;

const message: InboundMessage = {
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

function makeDeps(overrides: Partial<Parameters<typeof acceptInboundRemittance>[1]> = {}) {
  const attachments = new Map<string, DemoAttachment>([
    ["att-1", { filename: "advice.csv", declaredMime: "text/csv", bytes: csv }]
  ]);

  return {
    env: { RECOUP_CASH_INTAKE_ENABLED: "true" },
    scanner: createDemoAttachmentSecurityService({ attachments }),
    attachmentBody: (ref: string) => attachments.get(ref)?.bytes,
    approvedRecipient: "remittance@recoup.example",
    verifySignature: (candidate: InboundMessage) => candidate.signature === "valid",
    seenEventKeys: new Set<string>(),
    provenanceMode: "replay" as const,
    ...overrides
  };
}

describe("inbound remittance intake", () => {
  it("accepts a signed, correctly addressed, clean, mappable message", async () => {
    const result = await acceptInboundRemittance(message, makeDeps());
    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(result.advice.remittanceId).toBe("REM-1");
    expect(result.attachmentContentHash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("refuses when intake is disabled", async () => {
    const result = await acceptInboundRemittance(message, makeDeps({ env: {} }));
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toBe("intake_disabled");
  });

  it("rejects an invalid signature before doing anything else", async () => {
    const scanner = { inspect: vi.fn() };
    const result = await acceptInboundRemittance(
      { ...message, signature: "forged" },
      makeDeps({ scanner })
    );
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toBe("signature_invalid");
    expect(scanner.inspect).not.toHaveBeenCalled();
  });

  it("rejects a replayed provider event", async () => {
    const dependencies = makeDeps();
    const first = await acceptInboundRemittance(message, dependencies);
    const second = await acceptInboundRemittance(message, dependencies);

    expect(first.status).toBe("accepted");
    expect(second.status).toBe("rejected");
    if (second.status !== "rejected") return;
    expect(second.reason).toBe("replay_detected");
  });

  it("rejects a message addressed to the wrong recipient", async () => {
    const result = await acceptInboundRemittance(
      { ...message, recipient: "someone-else@recoup.example" },
      makeDeps()
    );
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toBe("wrong_recipient");
  });

  it("scans before mapping, so unscanned bytes never reach the parser", async () => {
    const order: string[] = [];
    const attachments = new Map<string, DemoAttachment>([
      ["att-1", { filename: "advice.csv", declaredMime: "text/csv", bytes: csv }]
    ]);
    const inner = createDemoAttachmentSecurityService({ attachments });

    const result = await acceptInboundRemittance(
      message,
      makeDeps({
        scanner: {
          inspect: async (input) => {
            order.push("scan");
            return inner.inspect(input);
          }
        },
        attachmentBody: (ref: string) => {
          order.push("read-body");
          return attachments.get(ref)?.bytes;
        }
      })
    );

    expect(result.status).toBe("accepted");
    expect(order).toEqual(["scan", "read-body"]);
  });

  it("fails closed when the scanner is unavailable", async () => {
    const result = await acceptInboundRemittance(
      message,
      makeDeps({
        scanner: createDemoAttachmentSecurityService({ attachments: new Map(), available: false })
      })
    );
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toBe("scan_unavailable");
  });

  it.each([
    ["executable", "payload.exe", "text/csv", "attachment_unsafe"],
    ["macro workbook", "book.xlsm", "text/csv", "attachment_unsafe"],
    ["archive", "bundle.zip", "text/csv", "attachment_unsupported"],
    ["spoofed extension", "advice.csv", "application/x-msdownload", "attachment_unsupported"]
  ])("quarantines a %s", async (_label, filename, declaredMime, expected) => {
    const attachments = new Map<string, DemoAttachment>([
      ["att-1", { filename, declaredMime, bytes: csv }]
    ]);
    const result = await acceptInboundRemittance(
      message,
      makeDeps({
        scanner: createDemoAttachmentSecurityService({ attachments }),
        attachmentBody: (ref: string) => attachments.get(ref)?.bytes
      })
    );

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toBe(expected);
  });

  it("rejects an unmappable attachment after a clean scan", async () => {
    const attachments = new Map<string, DemoAttachment>([
      ["att-1", { filename: "advice.csv", declaredMime: "text/csv", bytes: "not,a,valid,header" }]
    ]);
    const result = await acceptInboundRemittance(
      message,
      makeDeps({
        scanner: createDemoAttachmentSecurityService({ attachments }),
        attachmentBody: (ref: string) => attachments.get(ref)?.bytes
      })
    );

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toBe("mapping_failed");
  });

  it("hashes the sender rather than storing a raw address", () => {
    const hashed = hashSender("AP@Customer.Example");
    expect(hashed).toMatch(/^[0-9a-f]{64}$/u);
    expect(hashed).not.toContain("customer.example");
    expect(hashed).toBe(hashSender("ap@customer.example "));
  });
});
