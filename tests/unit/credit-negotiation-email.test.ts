import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import * as emailGateway from "../../src/services/emailGateway.js";

const config = {
  billingRecipient: "billing@example.com",
  recoveryRecipient: "recovery@example.com",
  resendApiKey: "test-resend-key",
  senderEmailAddress: "maya@example.com"
};

const draftBody = "Harbor Foods\nOrder ORD-HARBOR-6534\nRelease 55% after deposit confirmation.";
const approvedBodyHash = createHash("sha256").update(draftBody).digest("hex");

const draft: emailGateway.CreditNegotiationEmailDraft = {
  accountId: "ACC-HAR",
  actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
  approvedBodyHash,
  body: draftBody,
  from: "deals@north-bay.dev",
  headers: {
    "In-Reply-To": "<counter-0@harbor.example>",
    References: "<counter-0@harbor.example>"
  },
  orderId: "ORD-HARBOR-6534",
  replyTo: "deals+ORD-HARBOR-6534-r1@north-bay.dev",
  round: 1,
  subject: "[Recoup Deal ORD-HARBOR-6534 - Round 1] Harbor release proposal",
  to: "harbor-ap@example.com"
};

function buildSendLedger() {
  const rows: Array<Record<string, unknown>> = [];
  return {
    insertPending: vi.fn((row: Record<string, unknown>) => {
      rows.push(row);
      return Promise.resolve(row);
    }),
    markSent: vi.fn((row: Record<string, unknown>) => {
      const index = rows.findIndex((entry) => entry.idempotencyKey === row.idempotencyKey);
      if (index >= 0) {
        rows[index] = row;
      } else {
        rows.push(row);
      }
      return Promise.resolve(row);
    }),
    markFailed: vi.fn((row: Record<string, unknown>) => {
      const failedRow = { ...row, status: "failed" };
      const index = rows.findIndex((entry) => entry.idempotencyKey === row.idempotencyKey);
      if (index >= 0) {
        rows[index] = failedRow;
      } else {
        rows.push(failedRow);
      }
      return Promise.resolve(failedRow);
    }),
    readByActionId: vi.fn((actionId: string) =>
      Promise.resolve(rows.find((row) => row.actionId === actionId))
    ),
    readByIdempotencyKey: vi.fn((idempotencyKey: string) =>
      Promise.resolve(rows.find((row) => row.idempotencyKey === idempotencyKey))
    ),
    rows
  };
}

describe("David negotiation email gateway", () => {
  it("does not call Resend when durable pending send reservation fails", async () => {
    const readByIdempotencyKey = vi.fn(() => Promise.resolve(undefined));
    const readByActionId = vi.fn(() => Promise.resolve(undefined));
    const insertPending = vi.fn(() => Promise.reject(new Error("pending ledger unavailable")));
    const markFailed = vi.fn();
    const markSent = vi.fn();
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ id: "email_neg_should_not_send", last_event: "sent" }), { status: 200 }))
    );
    const sendNegotiationEmail = (emailGateway as unknown as {
      sendNegotiationEmail?: (input: {
        config: typeof config;
        draft: typeof draft;
        fetchImpl: typeof fetchImpl;
        principal: string;
        sendLedger: {
          insertPending: typeof insertPending;
          markFailed: typeof markFailed;
          markSent: typeof markSent;
          readByActionId: typeof readByActionId;
          readByIdempotencyKey: typeof readByIdempotencyKey;
        };
      }) => Promise<unknown>;
    }).sendNegotiationEmail;
    expect(sendNegotiationEmail).toBeTypeOf("function");

    await expect(
      sendNegotiationEmail?.({
        config,
        draft,
        fetchImpl,
        principal: "human:david-credit-lead",
        sendLedger: {
          insertPending,
          markFailed,
          markSent,
          readByActionId,
          readByIdempotencyKey
        }
      })
    ).rejects.toThrow("pending ledger unavailable");
    expect(insertPending).toHaveBeenCalledOnce();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
    expect(markSent).not.toHaveBeenCalled();
  });

  it("sends a Resend payload with explicit Harbor addressing, reply headers, hashes, and idempotency", async () => {
    const sendNegotiationEmail = (emailGateway as unknown as {
      sendNegotiationEmail?: (input: {
        config: typeof config;
        draft: typeof draft;
        fetchImpl: typeof fetchImpl;
        principal: string;
        sendLedger: ReturnType<typeof buildSendLedger>;
      }) => Promise<unknown>;
    }).sendNegotiationEmail;
    expect(sendNegotiationEmail).toBeTypeOf("function");

    const sendLedger = buildSendLedger();
    const fetchImpl = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(new Response(JSON.stringify({ id: "email_neg_123", last_event: "sent" }), { status: 200 }));
    });

    const result = await sendNegotiationEmail?.({
      config,
      draft,
      fetchImpl,
      principal: "human:david-credit-lead",
      sendLedger
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(sendLedger.insertPending).toHaveBeenCalledOnce();
    expect(sendLedger.markSent).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        body: JSON.stringify({
          from: "deals@north-bay.dev",
          headers: {
            "In-Reply-To": "<counter-0@harbor.example>",
            References: "<counter-0@harbor.example>"
          },
          html: [
            '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;">',
            "Harbor Foods<br />\nOrder ORD-HARBOR-6534<br />\nRelease 55% after deposit confirmation.",
            "</div>"
          ].join(""),
          reply_to: "deals+ORD-HARBOR-6534-r1@north-bay.dev",
          subject: "[Recoup Deal ORD-HARBOR-6534 - Round 1] Harbor release proposal",
          text: draft.body,
          to: ["harbor-ap@example.com"]
        }),
        method: "POST"
      })
    );
    const sendInit = fetchImpl.mock.calls[0]?.[1];
    const headers = sendInit?.headers as Record<string, string> | undefined;
    expect(headers?.authorization).toBe("Bearer test-resend-key");
    expect(headers?.["idempotency-key"]).toMatch(/^recoup-credit-negotiation\/[a-f0-9]{64}$/u);
    expect(result).toMatchObject({
      accountId: "ACC-HAR",
      actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      approvedBodyHash: draft.approvedBodyHash,
      orderId: "ORD-HARBOR-6534",
      principal: "human:david-credit-lead",
      providerEmailId: "email_neg_123",
      round: 1,
      sentBodyHash: draft.approvedBodyHash,
      status: "sent"
    });
  });

  it("uses a new provider idempotency key after a fresh reset creates a new approval receipt", async () => {
    const sendNegotiationEmail = (emailGateway as unknown as {
      sendNegotiationEmail?: (input: {
        config: typeof config;
        draft: typeof draft;
        fetchImpl: typeof fetchImpl;
        principal: string;
        sendLedger: ReturnType<typeof buildSendLedger>;
      }) => Promise<unknown>;
    }).sendNegotiationEmail;
    expect(sendNegotiationEmail).toBeTypeOf("function");

    const providerIds = ["email_neg_before_reset", "email_neg_after_reset"];
    const fetchImpl = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      const id = providerIds.shift() ?? "email_neg_extra";
      return Promise.resolve(new Response(JSON.stringify({ id, last_event: "sent" }), { status: 200 }));
    });
    const firstLedger = buildSendLedger();
    const secondLedger = buildSendLedger();

    await sendNegotiationEmail?.({
      config,
      draft: { ...draft, approvalAuditEntryHash: "a".repeat(64) },
      fetchImpl,
      principal: "human:david-credit-lead",
      sendLedger: firstLedger
    });
    await sendNegotiationEmail?.({
      config,
      draft: { ...draft, approvalAuditEntryHash: "b".repeat(64) },
      fetchImpl,
      principal: "human:david-credit-lead",
      sendLedger: secondLedger
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const firstHeaders = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined;
    const secondHeaders = fetchImpl.mock.calls[1]?.[1]?.headers as Record<string, string> | undefined;
    expect(firstHeaders?.["idempotency-key"]).toMatch(/^recoup-credit-negotiation\/[a-f0-9]{64}$/u);
    expect(secondHeaders?.["idempotency-key"]).toMatch(/^recoup-credit-negotiation\/[a-f0-9]{64}$/u);
    expect(secondHeaders?.["idempotency-key"]).not.toBe(firstHeaders?.["idempotency-key"]);
    expect(firstLedger.rows[0]).toMatchObject({ providerEmailId: "email_neg_before_reset", status: "sent" });
    expect(secondLedger.rows[0]).toMatchObject({ providerEmailId: "email_neg_after_reset", status: "sent" });
  });

  it("fails before provider delivery when no durable negotiation send ledger is configured", async () => {
    const sendNegotiationEmail = (emailGateway as unknown as {
      sendNegotiationEmail?: (input: {
        config: typeof config;
        draft: typeof draft;
        fetchImpl: typeof fetchImpl;
        principal: string;
      }) => Promise<unknown>;
    }).sendNegotiationEmail;
    expect(sendNegotiationEmail).toBeTypeOf("function");

    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ id: "email_neg_without_ledger", last_event: "sent" }), { status: 200 }))
    );

    await expect(
      sendNegotiationEmail?.({
        config,
        draft,
        fetchImpl,
        principal: "human:david-credit-lead"
      })
    ).rejects.toThrow("Credit negotiation send ledger is required.");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("dedupes duplicate approvals through the negotiation send ledger without a second provider send", async () => {
    const sendNegotiationEmail = (emailGateway as unknown as {
      sendNegotiationEmail?: (input: {
        config: typeof config;
        draft: typeof draft;
        fetchImpl: typeof fetchImpl;
        principal: string;
        sendLedger: typeof sendLedger;
      }) => Promise<{ providerEmailId: string; status: string }>;
    }).sendNegotiationEmail;
    expect(sendNegotiationEmail).toBeTypeOf("function");

    const rows: Array<Record<string, unknown>> = [];
    const sendLedger = {
      insertPending: vi.fn((row: Record<string, unknown>) => {
        rows.push(row);
        return Promise.resolve(row);
      }),
      markSent: vi.fn((row: Record<string, unknown>) => {
        const index = rows.findIndex((entry) => entry.idempotencyKey === row.idempotencyKey);
        if (index >= 0) {
          rows[index] = row;
        } else {
          rows.push(row);
        }
        return Promise.resolve(row);
      }),
      markFailed: vi.fn((row: Record<string, unknown>) => {
        const failedRow = { ...row, status: "failed" };
        const index = rows.findIndex((entry) => entry.idempotencyKey === row.idempotencyKey);
        if (index >= 0) {
          rows[index] = failedRow;
        } else {
          rows.push(failedRow);
        }
        return Promise.resolve(failedRow);
      }),
      readByActionId: vi.fn((actionId: string) =>
        Promise.resolve(rows.find((row) => row.actionId === actionId))
      ),
      readByIdempotencyKey: vi.fn((idempotencyKey: string) =>
        Promise.resolve(rows.find((row) => row.idempotencyKey === idempotencyKey))
      )
    };
    const fetchImpl = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(new Response(JSON.stringify({ id: "email_neg_123", last_event: "sent" }), { status: 200 }));
    });

    const first = await sendNegotiationEmail?.({
      config,
      draft,
      fetchImpl,
      principal: "human:david-credit-lead",
      sendLedger
    });
    const second = await sendNegotiationEmail?.({
      config,
      draft,
      fetchImpl,
      principal: "human:david-credit-lead",
      sendLedger
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(sendLedger.readByActionId).toHaveBeenCalledTimes(2);
    expect(sendLedger.readByIdempotencyKey).toHaveBeenCalledOnce();
    expect(sendLedger.insertPending).toHaveBeenCalledOnce();
    expect(sendLedger.markSent).toHaveBeenCalledOnce();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      accountId: "ACC-HAR",
      actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      approvedBodyHash: draft.approvedBodyHash,
      orderId: "ORD-HARBOR-6534",
      principal: "human:david-credit-lead",
      providerEmailId: "email_neg_123",
      round: 1,
      sentBodyHash: draft.approvedBodyHash
    });
    expect(first).toMatchObject({ providerEmailId: "email_neg_123", status: "sent" });
    expect(second).toMatchObject({ providerEmailId: "email_neg_123", status: "already_sent" });
  });

  it("marks the durable negotiation send failed when the provider rejects delivery", async () => {
    const sendNegotiationEmail = (emailGateway as unknown as {
      sendNegotiationEmail?: (input: {
        config: typeof config;
        draft: typeof draft;
        fetchImpl: typeof fetchImpl;
        principal: string;
        sendLedger: ReturnType<typeof buildSendLedger>;
      }) => Promise<unknown>;
    }).sendNegotiationEmail;
    expect(sendNegotiationEmail).toBeTypeOf("function");

    const sendLedger = buildSendLedger();
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: "provider refused harbor-ap@example.com with token=secret" }), { status: 502 })
      )
    );

    await expect(
      sendNegotiationEmail?.({
        config,
        draft,
        fetchImpl,
        principal: "human:david-credit-lead",
        sendLedger
      })
    ).rejects.toThrow("Negotiation email provider send failed. Provider status 502");

    expect(sendLedger.insertPending).toHaveBeenCalledOnce();
    expect(sendLedger.markFailed).toHaveBeenCalledOnce();
    expect(sendLedger.markSent).not.toHaveBeenCalled();
    expect(sendLedger.rows).toHaveLength(1);
    expect(sendLedger.rows[0]).toMatchObject({
      actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      status: "failed"
    });
    expect(sendLedger.rows[0]?.idempotencyKey).toMatch(/^recoup-credit-negotiation\/[a-f0-9]{64}$/u);
    expect(JSON.stringify(sendLedger.rows)).not.toContain("provider refused");
    expect(JSON.stringify(sendLedger.rows)).not.toContain("secret");
  });

  it("marks non-OK provider sends failed without exposing provider echo of the approved draft", async () => {
    const sendNegotiationEmail = (emailGateway as unknown as {
      sendNegotiationEmail?: (input: {
        config: typeof config;
        draft: typeof draft;
        fetchImpl: typeof fetchImpl;
        principal: string;
        sendLedger: ReturnType<typeof buildSendLedger>;
      }) => Promise<unknown>;
    }).sendNegotiationEmail;
    expect(sendNegotiationEmail).toBeTypeOf("function");

    const sendLedger = buildSendLedger();
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              message: `provider rejected raw approved draft for harbor-ap@example.com: ${draft.body}`
            }
          }),
          { status: 422 }
        )
      )
    );

    let thrown: unknown;
    try {
      await sendNegotiationEmail?.({
        config,
        draft,
        fetchImpl,
        principal: "human:david-credit-lead",
        sendLedger
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(emailGateway.EmailGatewayError);
    expect((thrown as emailGateway.EmailGatewayError).status).toBe(422);
    expect((thrown as Error).message).toBe("Negotiation email provider send failed. Provider status 422.");
    expect((thrown as Error).message).not.toContain("harbor-ap@example.com");
    expect((thrown as Error).message).not.toContain("Harbor Foods");
    expect((thrown as Error).message).not.toContain("ORD-HARBOR-6534");
    expect((thrown as Error).message).not.toContain("Release 55%");
    expect(sendLedger.insertPending).toHaveBeenCalledOnce();
    expect(sendLedger.markFailed).toHaveBeenCalledOnce();
    expect(sendLedger.markSent).not.toHaveBeenCalled();
    expect(sendLedger.rows).toHaveLength(1);
    expect(sendLedger.rows[0]).toMatchObject({
      actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      status: "failed"
    });
  });

  it("marks the durable negotiation send failed and sanitizes provider exceptions after reservation", async () => {
    const sendNegotiationEmail = (emailGateway as unknown as {
      sendNegotiationEmail?: (input: {
        config: typeof config;
        draft: typeof draft;
        fetchImpl: typeof fetchImpl;
        principal: string;
        sendLedger: ReturnType<typeof buildSendLedger>;
      }) => Promise<unknown>;
    }).sendNegotiationEmail;
    expect(sendNegotiationEmail).toBeTypeOf("function");

    const sendLedger = buildSendLedger();
    const fetchImpl = vi.fn(() =>
      Promise.reject(
        new emailGateway.EmailGatewayError(
          `provider crashed with Bearer raw-provider-secret for harbor-ap@example.com and body ${draft.body}`,
          502
        )
      )
    );

    let thrown: unknown;
    try {
      await sendNegotiationEmail?.({
        config,
        draft,
        fetchImpl,
        principal: "human:david-credit-lead",
        sendLedger
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(emailGateway.EmailGatewayError);
    expect((thrown as Error).message).toBe("Negotiation email provider send failed.");
    expect((thrown as Error).message).not.toContain("raw-provider-secret");
    expect((thrown as Error).message).not.toContain("harbor-ap@example.com");
    expect((thrown as Error).message).not.toContain(draft.body);
    expect(sendLedger.insertPending).toHaveBeenCalledOnce();
    expect(sendLedger.markFailed).toHaveBeenCalledOnce();
    expect(sendLedger.markSent).not.toHaveBeenCalled();
    expect(sendLedger.rows).toHaveLength(1);
    expect(sendLedger.rows[0]).toMatchObject({
      actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      status: "failed"
    });
  });

  it("dedupes the same approved round even when reply headers change", async () => {
    const sendNegotiationEmail = (emailGateway as unknown as {
      sendNegotiationEmail?: (input: {
        config: typeof config;
        draft: typeof draft;
        fetchImpl: typeof fetchImpl;
        principal: string;
        sendLedger: ReturnType<typeof buildSendLedger>;
      }) => Promise<{ providerEmailId: string; status: string }>;
    }).sendNegotiationEmail;
    expect(sendNegotiationEmail).toBeTypeOf("function");

    const sendLedger = buildSendLedger();
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ id: "email_neg_header_dedupe_123", last_event: "sent" }), { status: 200 }))
    );

    const first = await sendNegotiationEmail?.({
      config,
      draft,
      fetchImpl,
      principal: "human:david-credit-lead",
      sendLedger
    });
    const second = await sendNegotiationEmail?.({
      config,
      draft: {
        ...draft,
        headers: {
          "In-Reply-To": "<different-counter@harbor.example>",
          References: "<different-counter@harbor.example>"
        }
      },
      fetchImpl,
      principal: "human:david-credit-lead",
      sendLedger
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(sendLedger.insertPending).toHaveBeenCalledOnce();
    expect(sendLedger.markSent).toHaveBeenCalledOnce();
    expect(sendLedger.rows).toHaveLength(1);
    expect(first).toMatchObject({ providerEmailId: "email_neg_header_dedupe_123", status: "sent" });
    expect(second).toMatchObject({ providerEmailId: "email_neg_header_dedupe_123", status: "already_sent" });
  });

  it("normalizes provider last_event to the outbox sent enum", async () => {
    const sendNegotiationEmail = (emailGateway as unknown as {
      sendNegotiationEmail?: (input: {
        config: typeof config;
        draft: typeof draft;
        fetchImpl: typeof fetchImpl;
        principal: string;
        sendLedger: ReturnType<typeof buildSendLedger>;
      }) => Promise<{ providerEmailId: string; status: string }>;
    }).sendNegotiationEmail;
    expect(sendNegotiationEmail).toBeTypeOf("function");

    const sendLedger = buildSendLedger();
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ id: "email_neg_status_123", last_event: "queued" }), { status: 200 }))
    );

    const result = await sendNegotiationEmail?.({
      config,
      draft,
      fetchImpl,
      principal: "human:david-credit-lead",
      sendLedger
    });

    expect(sendLedger.markSent).toHaveBeenCalledWith(expect.objectContaining({ status: "sent" }));
    expect(sendLedger.rows[0]).toMatchObject({ providerEmailId: "email_neg_status_123", status: "sent" });
    expect(result).toMatchObject({ providerEmailId: "email_neg_status_123", status: "sent" });
  });
});
