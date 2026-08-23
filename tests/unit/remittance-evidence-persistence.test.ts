import { describe, expect, it } from "vitest";

import { persistRemittanceEvidence } from "../../src/adapters/remittanceEvidenceStore.ts";
import type { RemittanceAdviceInput } from "../../src/core/cashApplication/match.ts";

/**
 * BRD definition of done 2: inbox, remittance and initial run state commit
 * together, and a crash or retry cannot strand or duplicate a case.
 *
 * Nothing wrote these rows. The advice existed only in memory, so creating a
 * live case violated the foreign key from recoup_live_deduction_cases back to
 * recoup_cash_remittances and the whole run failed after the allocation.
 *
 * The security shape matters as much as the ordering: the raw sender and the
 * raw body never reach the database, only hashes of them.
 */

const advice: RemittanceAdviceInput = {
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
      claimedReasonTextSanitized: "two pallets arrived damaged",
      sourceRecordIds: ["SRC-1"]
    }
  ],
  sourceRecordIds: ["SRC-1"],
  provenanceMode: "live"
};

const message = {
  provider: "gmail",
  providerEventId: "MSG-1",
  messageId: "MSG-1",
  recipient: "remittance@recoup.example",
  sender: "ar@customer.example",
  subject: "Remittance advice PAY-1",
  receivedAt: "2026-08-23T09:00:00.000Z"
};

interface Written {
  table: string;
  body: Record<string, unknown>;
}

function capture(): { writes: Written[]; fetcher: typeof fetch } {
  const writes: Written[] = [];
  const fetcher = ((input: URL | RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const table = url.split("/rest/v1/")[1]?.split("?")[0] ?? url;
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    writes.push({ table, body });
    return Promise.resolve(new Response("[]", { status: 201 }));
  }) as typeof fetch;

  return { writes, fetcher };
}

const config = { url: "https://stub.invalid", serviceRoleKey: "stub-key" };

describe("remittance evidence persistence", () => {
  it("writes inbox, remittance and lines in dependency order", async () => {
    const { writes, fetcher } = capture();

    await persistRemittanceEvidence({
      ...config,
      fetcher,
      inboxId: "INBOX-1",
      advice,
      message,
      attachmentContentHash: "hash-abc"
    });

    // Each table references the one before it, so the order is the contract.
    expect(writes.map((write) => write.table)).toEqual([
      "recoup_cash_inbox",
      "recoup_cash_remittances",
      "recoup_cash_remittance_lines"
    ]);
  });

  it("never stores the raw sender or the raw body", async () => {
    const { writes, fetcher } = capture();

    await persistRemittanceEvidence({
      ...config,
      fetcher,
      inboxId: "INBOX-1",
      advice,
      message,
      attachmentContentHash: "hash-abc"
    });

    const inbox = writes[0]?.body ?? {};
    expect(inbox.sender_hash).toBeTypeOf("string");
    expect(JSON.stringify(inbox)).not.toContain("ar@customer.example");
    expect(inbox.body_content_hash).toBe("hash-abc");
  });

  it("ties the remittance to the inbox row and carries the mapper version", async () => {
    const { writes, fetcher } = capture();

    await persistRemittanceEvidence({
      ...config,
      fetcher,
      inboxId: "INBOX-1",
      advice,
      message,
      attachmentContentHash: "hash-abc"
    });

    const remittance = writes[1]?.body ?? {};
    expect(remittance.remittance_id).toBe("REM-1");
    expect(remittance.inbox_id).toBe("INBOX-1");
    expect(remittance.mapper_version).toBe("csv-v1");
    expect(remittance.instructed_payment_amount).toBe("1250.00");
  });

  it("writes one row per advice line, each pointing at the remittance", async () => {
    const { writes, fetcher } = capture();

    await persistRemittanceEvidence({
      ...config,
      fetcher,
      inboxId: "INBOX-1",
      advice,
      message,
      attachmentContentHash: "hash-abc"
    });

    const lines = writes[2]?.body as unknown as Record<string, unknown>[];
    expect(Array.isArray(lines)).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.line_id).toBe("LINE-1");
    expect(lines[0]?.remittance_id).toBe("REM-1");
  });

  it("treats a duplicate delivery as already recorded rather than failing", async () => {
    const writes: Written[] = [];
    // Append-only tables answer 409 when the row is already there, which is
    // what a provider redelivery looks like and is not an error.
    const fetcher = ((input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      writes.push({ table: url, body: typeof init?.body === "string" ? { raw: init.body } : {} });
      return Promise.resolve(new Response('{"code":"23505"}', { status: 409 }));
    }) as typeof fetch;

    await expect(
      persistRemittanceEvidence({
        ...config,
        fetcher,
        inboxId: "INBOX-1",
        advice,
        message,
        attachmentContentHash: "hash-abc"
      })
    ).resolves.toBeUndefined();
  });
});
