import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handleCreditNegotiationEmailPostForTest } from "../../cockpit/app/api/credit/negotiation/email/route.ts";

const body = "Harbor Foods\nOrder ORD-HARBOR-6534\nRelease 55% after deposit confirmation.";
const approvedBodyHash = createHash("sha256").update(body).digest("hex");
const approvedSubjectHash = createHash("sha256").update("[Recoup Deal ORD-HARBOR-6534 - Round 1] Harbor release proposal").digest("hex");
const approvedToHash = createHash("sha256").update("harbor-ap@example.com").digest("hex");

const env = {
  CREDIT_NEGOTIATION_FROM_EMAIL: "deals@north-bay.dev",
  EMAIL_TO_BILLING: "billing@example.com",
  EMAIL_TO_RECOVERY: "recovery@example.com",
  HARBOR_AP_CONTACT_EMAIL: "harbor-ap@example.com",
  NODE_ENV: "test",
  RECOUP_COCKPIT_AUTH_TOKEN: "test-human-token",
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:david-credit-lead",
  RESEND_API_KEY: "test-resend-key",
  SENDER_EMAIL_ADDRESS: "maya@example.com"
};

function request(payload: unknown): Request {
  return new Request("http://localhost/api/credit/negotiation/email", {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
      "x-recoup-human-principal": "human:david-credit-lead",
      "x-recoup-human-token": "test-human-token"
    },
    method: "POST"
  });
}

const approvedPayload = {
  accountId: "ACC-HAR",
  actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
  approvalReceipt: {
    actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
    approverId: "human:david-credit-lead",
    auditEntryHash: "a".repeat(64),
    decision: "approve",
    recordIds: ["credit-v2:negotiation:ORD-HARBOR-6534:r1", "ACC-HAR", "ORD-HARBOR-6534", "credit_orders:ORD-HARBOR-6534"],
    status: "human_decided"
  },
  approvedBodyHash,
  body,
  lastInboundMessageId: "<counter-0@harbor.example>",
  orderId: "ORD-HARBOR-6534",
  round: 1,
  subject: "[Recoup Deal ORD-HARBOR-6534 - Round 1] Harbor release proposal"
};

const serverApprovedPayload = {
  accountId: approvedPayload.accountId,
  actionId: approvedPayload.actionId,
  approvedBodyHash: approvedPayload.approvedBodyHash,
  body: approvedPayload.body,
  lastInboundMessageId: approvedPayload.lastInboundMessageId,
  orderId: approvedPayload.orderId,
  round: approvedPayload.round,
  subject: approvedPayload.subject
};

const storedApprovalReceipt = {
  actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
  approverId: "human:david-credit-lead",
  auditEntryHash: "b".repeat(64),
  approvedBodyHash,
  approvedDraftRecordId: "credit_negotiation_rounds:credit-v2:negotiation:ORD-HARBOR-6534:r1",
  approvedRecipientConfigKey: "HARBOR_AP_CONTACT_EMAIL",
  approvedSubjectHash,
  approvedToHash,
  decision: "approve",
  recordIds: [
    "credit-v2:negotiation:ORD-HARBOR-6534:r1",
    "ACC-HAR",
    "ORD-HARBOR-6534",
    "credit_orders:ORD-HARBOR-6534"
  ],
  status: "human_decided"
};

const storedApprovedDraft = {
  accountId: "ACC-HAR",
  actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
  approvedBody: body,
  approvedBodyHash,
  approvedSubject: approvedPayload.subject,
  approvedSubjectHash,
  approvedToHash,
  orderId: "ORD-HARBOR-6534",
  round: 1
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

const clearCommunicationStore = {
  hasUnresolvedHumanReview: vi.fn(() => Promise.resolve(false))
};

describe("David negotiation email route", () => {
  it("blocks an approved email send while a customer reply requires human review", async () => {
    const sendLedger = buildSendLedger();
    const fetchImpl = vi.fn();
    const response = await handleCreditNegotiationEmailPostForTest(request(serverApprovedPayload), {
      approvalStore: {
        readApprovedNegotiationAction: vi.fn(() => Promise.resolve(storedApprovalReceipt))
      },
      approvedDraftStore: {
        readApprovedNegotiationDraft: vi.fn(() => Promise.resolve(storedApprovedDraft))
      },
      communicationStore: {
        hasUnresolvedHumanReview: vi.fn(() => Promise.resolve(true))
      },
      env,
      fetchImpl,
      sendLedger: sendLedger as never
    } as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Customer reply requires human review before negotiation email send."
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sendLedger.insertPending).not.toHaveBeenCalled();
  });

  it.each(["sent", "human_review"] as const)(
    "blocks through the production Supabase communication gate for an unresolved %s round",
    async (roundStatus) => {
    const fetchImpl = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      const parsedUrl = new URL(urlString);
      if (
        parsedUrl.pathname === "/rest/v1/credit_negotiation_rounds" &&
        parsedUrl.searchParams.get("status") === "eq.human_review" &&
        init?.method === "GET"
      ) {
        return Promise.resolve(Response.json(roundStatus === "human_review" ? [{ status: roundStatus }] : []));
      }
      if (urlString.includes("/rest/v1/credit_counter_offers") && init?.method === "GET") {
        return Promise.resolve(Response.json([{ round_id: "credit-v2:negotiation:ORD-HARBOR-6534:r1" }]));
      }
      if (urlString.includes("/rest/v1/credit_negotiation_rounds") && init?.method === "GET") {
        return Promise.resolve(Response.json([{ status: roundStatus }]));
      }
      throw new Error(`Unexpected fetch URL: ${urlString}`);
    });

    const response = await handleCreditNegotiationEmailPostForTest(request(serverApprovedPayload), {
      env: {
        ...env,
        SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      fetchImpl
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Customer reply requires human review before negotiation email send."
    });
    expect(fetchImpl).toHaveBeenCalledTimes(roundStatus === "human_review" ? 1 : 3);
    expect(
      fetchImpl.mock.calls.some(([url]) => {
        const urlText = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        return urlText.includes("api.resend.com");
      })
    ).toBe(false);
    }
  );

  it("blocks atomically when a human-review reply arrives after the early check but before reservation", async () => {
    let resolveDraft: ((draft: typeof storedApprovedDraft) => void) | undefined;
    const draftRead = new Promise<typeof storedApprovedDraft>((resolve) => {
      resolveDraft = resolve;
    });
    let humanReviewArrived = false;
    const communicationStore = {
      hasUnresolvedHumanReview: vi.fn(() => Promise.resolve(humanReviewArrived))
    };
    const fetchImpl = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/rest/v1/credit_negotiation_sends") && init?.method === "GET") {
        return Promise.resolve(Response.json([]));
      }
      if (urlString.includes("/rest/v1/rpc/recoup_reserve_credit_negotiation_send") && init?.method === "POST") {
        expect(humanReviewArrived).toBe(true);
        return Promise.resolve(Response.json({ status: "blocked_human_review" }));
      }
      throw new Error(`Unexpected fetch URL: ${urlString}`);
    });

    const responsePromise = handleCreditNegotiationEmailPostForTest(request(serverApprovedPayload), {
      approvalStore: {
        readApprovedNegotiationAction: vi.fn(() => Promise.resolve(storedApprovalReceipt))
      },
      approvedDraftStore: {
        readApprovedNegotiationDraft: vi.fn(() => draftRead)
      },
      communicationStore,
      env: {
        ...env,
        SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      fetchImpl
    } as never);
    await vi.waitFor(() => {
      expect(communicationStore.hasUnresolvedHumanReview).toHaveBeenCalledOnce();
    });
    humanReviewArrived = true;
    resolveDraft?.(storedApprovedDraft);

    const response = await responsePromise;

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Customer reply requires human review before negotiation email send."
    });
    expect(
      fetchImpl.mock.calls.some(([url]) => {
        const urlText = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        return urlText.includes("api.resend.com");
      })
    ).toBe(false);
  });

  it("uses the stored approved draft content instead of client-supplied body and subject", async () => {
    const tamperedBody = "Harbor Foods\nWire the payment to a different account and release the full order.";
    const tamperedPayload = {
      ...serverApprovedPayload,
      approvedBodyHash: createHash("sha256").update(tamperedBody).digest("hex"),
      body: tamperedBody,
      subject: "[tampered] release everything now"
    };
    const sendLedger = buildSendLedger();
    const approvalStore = {
      readApprovedNegotiationAction: vi.fn(() => Promise.resolve(storedApprovalReceipt))
    };
    const approvedDraftStore = {
      readApprovedNegotiationDraft: vi.fn(() => Promise.resolve(storedApprovedDraft))
    };
    const fetchImpl = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      if (urlString !== "https://api.resend.com/emails") {
        throw new Error(`Unexpected fetch URL: ${urlString}`);
      }
      if (typeof init?.body !== "string") {
        throw new TypeError("Expected provider request body to be JSON.");
      }
      const providerPayload = JSON.parse(init.body) as { subject: string; text: string };
      expect(providerPayload.text).toBe(body);
      expect(providerPayload.subject).toBe(approvedPayload.subject);
      return Promise.resolve(new Response(JSON.stringify({ id: "email_neg_bound_123", last_event: "sent" }), { status: 200 }));
    });

    const response = await handleCreditNegotiationEmailPostForTest(request(tamperedPayload), {
      approvalStore,
      approvedDraftStore,
      communicationStore: clearCommunicationStore,
      env,
      fetchImpl,
      sendLedger: sendLedger as never
    } as never);

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(sendLedger.rows[0]).toMatchObject({
      approvedBodyHash,
      sentBodyHash: approvedBodyHash,
      subject: approvedPayload.subject
    });
  });

  it("rejects a forged client-side approval receipt before provider delivery", async () => {
    const sendLedger = buildSendLedger();
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ id: "email_neg_forged_123", last_event: "sent" }), { status: 200 }))
    );

    const response = await handleCreditNegotiationEmailPostForTest(request(approvedPayload), {
      communicationStore: clearCommunicationStore,
      env,
      fetchImpl,
      sendLedger: sendLedger as never
    });

    expect(response.status).toBe(409);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sendLedger.insertPending).not.toHaveBeenCalled();
    expect(sendLedger.markSent).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "Stored David negotiation approval receipt is required before email send." });
  });

  it("rejects a missing typed approved draft before outbox reservation or provider delivery", async () => {
    const sendLedger = buildSendLedger();
    const approvalStore = {
      readApprovedNegotiationAction: vi.fn(() => Promise.resolve(storedApprovalReceipt))
    };
    const approvedDraftStore = {
      readApprovedNegotiationDraft: vi.fn(() => Promise.resolve(undefined))
    };
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ id: "email_neg_missing_draft_123", last_event: "sent" }), { status: 200 }))
    );

    const response = await handleCreditNegotiationEmailPostForTest(request(serverApprovedPayload), {
      approvalStore,
      approvedDraftStore,
      communicationStore: clearCommunicationStore,
      env,
      fetchImpl,
      sendLedger: sendLedger as never
    } as never);

    expect(response.status).toBe(409);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sendLedger.insertPending).not.toHaveBeenCalled();
    expect(sendLedger.markSent).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "Stored David negotiation approved draft is required before email send." });
  });

  it("sends only after the server reads a stored David approval receipt", async () => {
    const sendLedger = buildSendLedger();
    const approvalStore = {
      readApprovedNegotiationAction: vi.fn(() => Promise.resolve(storedApprovalReceipt))
    };
    const approvedDraftStore = {
      readApprovedNegotiationDraft: vi.fn(() => Promise.resolve(storedApprovedDraft))
    };
    const fetchImpl = vi.fn((url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      expect(urlString).not.toContain("/forensics/work-items/");
      return Promise.resolve(new Response(JSON.stringify({ id: "email_neg_route_456", last_event: "sent" }), { status: 200 }));
    });

    const response = await handleCreditNegotiationEmailPostForTest(request(serverApprovedPayload), {
      approvalStore,
      approvedDraftStore,
      communicationStore: clearCommunicationStore,
      env,
      fetchImpl,
      sendLedger: sendLedger as never
    } as never);

    expect(response.status).toBe(200);
    expect(approvalStore.readApprovedNegotiationAction).toHaveBeenCalledWith({
      accountId: "ACC-HAR",
      actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      orderId: "ORD-HARBOR-6534",
      principal: "human:david-credit-lead"
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(sendLedger.insertPending).toHaveBeenCalledOnce();
    expect(sendLedger.markSent).toHaveBeenCalledOnce();
  });

  it("sends from stored approval and draft with a minimal client request", async () => {
    const sendLedger = buildSendLedger();
    const approvalStore = {
      readApprovedNegotiationAction: vi.fn(() => Promise.resolve(storedApprovalReceipt))
    };
    const approvedDraftStore = {
      readApprovedNegotiationDraft: vi.fn(() => Promise.resolve(storedApprovedDraft))
    };
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ id: "email_neg_minimal_123" }), { status: 200 })));

    const response = await handleCreditNegotiationEmailPostForTest(
      request({
        accountId: "ACC-HAR",
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        orderId: "ORD-HARBOR-6534",
        round: 1
      }),
      {
        approvalStore,
        approvedDraftStore,
        communicationStore: clearCommunicationStore,
        env,
        fetchImpl,
        sendLedger: sendLedger as never
      } as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      approvedBodyHash,
      providerEmailId: "email_neg_minimal_123",
      sentBodyHash: approvedBodyHash,
      status: "sent"
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(sendLedger.insertPending).toHaveBeenCalledOnce();
    expect(sendLedger.markSent).toHaveBeenCalledOnce();
  });

  it("rejects a stored negotiation approval whose approver does not match the David principal", async () => {
    const approvalStore = {
      readApprovedNegotiationAction: vi.fn(() =>
        Promise.resolve({
          ...storedApprovalReceipt,
          approverId: "human:maya-lead"
        })
      )
    };
    const fetchImpl = vi.fn();

    const response = await handleCreditNegotiationEmailPostForTest(request(serverApprovedPayload), {
      approvalStore,
      communicationStore: clearCommunicationStore,
      env,
      fetchImpl,
      sendLedger: {
        insertPending: vi.fn(),
        markFailed: vi.fn(),
        markSent: vi.fn(),
        readByActionId: vi.fn(),
        readByIdempotencyKey: vi.fn()
      } as never
    } as never);

    expect(response.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "Stored David negotiation approval receipt does not match the signed principal." });
  });

  it("sends only after a David human approval and never refetches Maya forensics detail", async () => {
    const sendLedger = buildSendLedger();
    const fetchImpl = vi.fn((url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      expect(urlString).not.toContain("/forensics/work-items/");
      return Promise.resolve(new Response(JSON.stringify({ id: "email_neg_route_123", last_event: "sent" }), { status: 200 }));
    });
    const approvalStore = {
      readApprovedNegotiationAction: vi.fn(() => Promise.resolve(storedApprovalReceipt))
    };
    const approvedDraftStore = {
      readApprovedNegotiationDraft: vi.fn(() => Promise.resolve(storedApprovedDraft))
    };

    const response = await handleCreditNegotiationEmailPostForTest(request(serverApprovedPayload), {
      approvalStore,
      approvedDraftStore,
      communicationStore: clearCommunicationStore,
      env,
      fetchImpl,
      sendLedger: sendLedger as never
    } as never);

    expect(response.status).toBe(200);
    expect(approvalStore.readApprovedNegotiationAction).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(sendLedger.insertPending).toHaveBeenCalledOnce();
    expect(sendLedger.markSent).toHaveBeenCalledOnce();
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload).toMatchObject({
      accountId: "ACC-HAR",
      actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      approvedBodyHash,
      orderId: "ORD-HARBOR-6534",
      principal: "human:david-credit-lead",
      providerEmailId: "email_neg_route_123",
      round: 1,
      sentBodyHash: approvedBodyHash,
      status: "sent"
    });
    expect(sendLedger.rows[0]).toMatchObject({
      from: "deals@north-bay.dev",
      replyTo: "deals+ORD-HARBOR-6534-r1@north-bay.dev",
      to: "harbor-ap@example.com"
    });
  });

  it("does not send the same approved round twice when last inbound header input changes", async () => {
    const sendLedger = buildSendLedger();
    const approvalStore = {
      readApprovedNegotiationAction: vi.fn(() => Promise.resolve(storedApprovalReceipt))
    };
    const approvedDraftStore = {
      readApprovedNegotiationDraft: vi.fn(() => Promise.resolve(storedApprovedDraft))
    };
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ id: "email_neg_route_dedupe_123", last_event: "sent" }), { status: 200 }))
    );

    const first = await handleCreditNegotiationEmailPostForTest(request(serverApprovedPayload), {
      approvalStore,
      approvedDraftStore,
      communicationStore: clearCommunicationStore,
      env,
      fetchImpl,
      sendLedger: sendLedger as never
    } as never);
    const second = await handleCreditNegotiationEmailPostForTest(
      request({
        ...serverApprovedPayload,
        lastInboundMessageId: "<different-counter@harbor.example>"
      }),
      {
        approvalStore,
        approvedDraftStore,
        communicationStore: clearCommunicationStore,
        env,
        fetchImpl,
        sendLedger: sendLedger as never
      } as never
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(sendLedger.insertPending).toHaveBeenCalledOnce();
    expect(sendLedger.markSent).toHaveBeenCalledOnce();
    await expect(second.json()).resolves.toMatchObject({
      providerEmailId: "email_neg_route_dedupe_123",
      status: "already_sent"
    });
  });

  it("rejects Maya-scoped direct human auth on the David negotiation send route", async () => {
    const fetchImpl = vi.fn();

    const response = await handleCreditNegotiationEmailPostForTest(
      new Request("http://localhost/api/credit/negotiation/email", {
        body: JSON.stringify(approvedPayload),
        headers: {
          "content-type": "application/json",
          "x-recoup-human-principal": "human:maya-lead",
          "x-recoup-human-token": "test-human-token"
        },
        method: "POST"
      }),
      {
        env: { ...env, RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead" },
        fetchImpl
      }
    );

    expect(response.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "David human approval is required for negotiation email." });
  });

  it("uses the Supabase credit_negotiation_sends outbox and marks the round sent by default", async () => {
    const fetchImpl = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      if (urlString.includes("/rest/v1/credit_counter_offers") && init?.method === "GET") {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (urlString.includes("/rest/v1/recoup_memory_records") && init?.method === "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                category: "approval_records",
                id: "approval:credit-v2:negotiation:ORD-HARBOR-6534:r1",
                payload_json: storedApprovalReceipt,
                record_ids_json: storedApprovalReceipt.recordIds,
                scope: "approval:credit-v2:negotiation:ORD-HARBOR-6534:r1",
                trust_level: "trusted"
              }
            ]),
            { status: 200 }
          )
        );
      }
      if (urlString.includes("/rest/v1/credit_negotiation_rounds") && init?.method === "GET") {
        const parsedUrl = new URL(urlString);
        if (parsedUrl.searchParams.get("status") === "eq.human_review") {
          return Promise.resolve(Response.json([]));
        }
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                account_id: "ACC-HAR",
                order_id: "ORD-HARBOR-6534",
                our_proposal_json: {
                  approvedBody: body,
                  approvedBodyHash,
                  approvedSubject: approvedPayload.subject,
                  approvedSubjectHash,
                  approvedToHash
                },
                round_id: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
                round_no: 1,
                status: "drafted"
              }
            ]),
            { status: 200 }
          )
        );
      }
      if (urlString.includes("/rest/v1/credit_negotiation_sends") && init?.method === "GET") {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (urlString.includes("/rest/v1/rpc/recoup_reserve_credit_negotiation_send") && init?.method === "POST") {
        if (typeof init.body !== "string") {
          throw new TypeError("Expected Supabase reservation body to be JSON.");
        }
        const payload = JSON.parse(init.body) as { p_send: Record<string, unknown> };
        return Promise.resolve(Response.json({ send: payload.p_send, status: "reserved" }));
      }
      if (urlString === "https://api.resend.com/emails") {
        return Promise.resolve(new Response(JSON.stringify({ id: "email_neg_supabase_123", last_event: "sent" }), { status: 200 }));
      }
      if (urlString.includes("/rest/v1/credit_negotiation_sends") && init?.method === "PATCH") {
        if (typeof init.body !== "string") {
          throw new TypeError("Expected Supabase send patch body to be JSON.");
        }
        const row = JSON.parse(init.body) as Record<string, unknown>;
        return Promise.resolve(new Response(JSON.stringify([{ ...row, provider_email_id: "email_neg_supabase_123" }]), { status: 200 }));
      }
      if (urlString.includes("/rest/v1/credit_negotiation_rounds") && init?.method === "PATCH") {
        if (typeof init.body !== "string") {
          throw new TypeError("Expected Supabase round patch body to be JSON.");
        }
        const row = JSON.parse(init.body) as Record<string, unknown>;
        return Promise.resolve(new Response(JSON.stringify([{ ...row, status: "sent" }]), { status: 200 }));
      }

      throw new Error(`Unexpected fetch URL: ${urlString}`);
    });

    const response = await handleCreditNegotiationEmailPostForTest(request(serverApprovedPayload), {
      env: {
        ...env,
        SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      fetchImpl
    });

    expect(response.status).toBe(200);
    const calls = fetchImpl.mock.calls.map(([url, init]) => ({
      body: init?.body,
      method: init?.method,
      url: typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url
    }));
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_negotiation_sends") && call.url.includes("action_id=") && call.method === "GET")).toBe(true);
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_negotiation_sends") && call.url.includes("idempotency_key=") && call.method === "GET")).toBe(true);
    expect(calls.some((call) => call.url.includes("/rest/v1/rpc/recoup_reserve_credit_negotiation_send") && call.method === "POST")).toBe(true);
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_negotiation_sends") && call.method === "PATCH")).toBe(true);
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_negotiation_rounds") && call.method === "PATCH")).toBe(true);
    const pendingInsertCall = calls.find((call) => call.url.includes("/rest/v1/rpc/recoup_reserve_credit_negotiation_send") && call.method === "POST");
    expect(pendingInsertCall?.body).toContain("\"status\":\"pending\"");
    expect(pendingInsertCall?.body).not.toContain("email_neg_supabase_123");
    const sendPatchCall = calls.find((call) => call.url.includes("/rest/v1/credit_negotiation_sends") && call.method === "PATCH");
    expect(sendPatchCall?.body).toContain("email_neg_supabase_123");
    expect(JSON.stringify(calls)).not.toContain("supabase-service-secret");
  });
});
