import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GET,
  handleEmailGetForTest,
  handleEmailPostForTest,
  POST
} from "../../cockpit/app/api/email/route.ts";
import { clearEmailSendReceiptsForTest } from "../../src/services/emailGateway.ts";
import { invokeServiceTool } from "../../src/services/serviceLayer.ts";

const approvedDetail = {
  approvalReceipt: {
    actionId: "draft:S3-L1",
    approverId: "human:maya-lead",
    auditEntryHash: "a".repeat(64),
    decision: "approve",
    recordIds: ["draft:S3-L1", "S3-L1"],
    status: "human_decided"
  },
  lineId: "S3-L1",
  recoveryDraft: {
    actionId: "draft:S3-L1"
  },
  recommendedAction: {
    actionLabel: "Recovery - issue debit memo"
  },
  selected: {
    draft: {
      actionId: "draft:S3-L1",
      basis: "The signed proof of delivery shows the full ordered quantity was received."
    }
  },
  surface: "forensics-work-item-detail",
  workItem: {
    amount: "$99.00",
    customerLabel: "NorthBay Retail",
    lineIds: ["S3-L1"],
    reason: "The signed proof of delivery shows the full ordered quantity was received.",
    recommendedActionLabel: "Recovery - issue debit memo",
    routing: "recovery",
    verdict: "invalid",
    verdictLabel: "Invalid",
    workItemLabel: "NorthBay recovery case"
  }
};

const env = {
  EMAIL_TO_BILLING: "billing@example.com",
  EMAIL_TO_RECOVERY: "recovery@example.com",
  NODE_ENV: "test",
  RECOUP_API_URL: "http://127.0.0.1:4317",
  RECOUP_COCKPIT_AUTH_TOKEN: "test-human-token",
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya",
  RESEND_API_KEY: "test-resend-key",
  SENDER_EMAIL_ADDRESS: "maya@example.com"
};

function request(body: unknown): Request {
  return new Request("http://localhost/api/email", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-recoup-human-principal": "human:maya",
      "x-recoup-human-token": "test-human-token"
    },
    method: "POST"
  });
}

const approvedEmailBody = [
  "NorthBay Retail",
  "NorthBay recovery case",
  "$99.00",
  "Invalid",
  "The signed proof of delivery shows the full ordered quantity was received.",
  "Recovery - issue debit memo"
].join("\n");
const approvedEmailSubject = "NorthBay Retail recovery draft";
const approvedEmailHtml = [
  '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;">',
  approvedEmailBody.replace(/\n/gu, "<br />\n"),
  "</div>"
].join("");
const sha256Pattern = /^[a-f0-9]{64}$/u;

describe("Maya email route", () => {
  beforeEach(() => {
    clearEmailSendReceiptsForTest();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exports POST and GET route handlers", () => {
    expect(typeof POST).toBe("function");
    expect(typeof GET).toBe("function");
  });

  it("fails closed with an inline-safe error when email env is missing", async () => {
    const response = await handleEmailPostForTest(
      request({
        actionId: "draft:S3-L1",
        body: approvedEmailBody,
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: approvedEmailSubject
      }),
      {
        env: { ...env, RESEND_API_KEY: undefined },
        fetchImpl: vi.fn()
      }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Email service is not configured.",
      missing: ["RESEND_API_KEY"]
    });
  });

  it("rejects send before committed human approval", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ ...approvedDetail, approvalReceipt: undefined }), { status: 200 }))
    );

    const response = await handleEmailPostForTest(
      request({
        actionId: "draft:S3-L1",
        body: approvedEmailBody,
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: approvedEmailSubject
      }),
      { env, fetchImpl }
    );

    expect(response.status).toBe(409);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({ error: "Human approval is required before email send." });
  });

  it("rejects approval receipts that are not tied to a human approver and approved records", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ...approvedDetail,
            approvalReceipt: {
              ...approvedDetail.approvalReceipt,
              approverId: "agent:maya",
              recordIds: ["draft:S3-L1"]
            }
          }),
          { status: 200 }
        )
      )
    );

    const response = await handleEmailPostForTest(
      request({
        actionId: "draft:S3-L1",
        body: approvedEmailBody,
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: approvedEmailSubject
      }),
      { env, fetchImpl }
    );

    expect(response.status).toBe(409);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({ error: "Human approval is required before email send." });
  });

  it("rejects approved details that are missing required email facts", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ...approvedDetail,
            workItem: {
              ...approvedDetail.workItem,
              amount: undefined
            }
          }),
          { status: 200 }
        )
      )
    );

    const response = await handleEmailPostForTest(
      request({
        actionId: "draft:S3-L1",
        body: approvedEmailBody,
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: approvedEmailSubject
      }),
      { env, fetchImpl }
    );

    expect(response.status).toBe(409);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({ error: "Approved case detail is missing required email facts." });
  });

  it("rejects a verified human without the server-owned send_email capability", async () => {
    const fetchImpl = vi.fn();

    const response = await handleEmailPostForTest(
      request({
        actionId: "draft:S3-L1",
        body: approvedEmailBody,
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: approvedEmailSubject
      }),
      { env: { ...env, RECOUP_EMAIL_SEND_PRINCIPALS: "human:billing-lead" }, fetchImpl }
    );

    expect(response.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Actor is not permitted to send approved external correspondence."
    });
  });

  it("requires an explicit send_email principal allowlist in production", async () => {
    const fetchImpl = vi.fn();

    const response = await handleEmailPostForTest(
      request({
        actionId: "draft:S3-L1",
        body: approvedEmailBody,
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: approvedEmailSubject
      }),
      { env: { ...env, VERCEL_ENV: "production" }, fetchImpl }
    );

    expect(response.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Actor is not permitted to send approved external correspondence."
    });
  });

  it("requires an explicit send_email principal allowlist outside test runtime", async () => {
    const fetchImpl = vi.fn();

    const response = await handleEmailPostForTest(
      request({
        actionId: "draft:S3-L1",
        body: approvedEmailBody,
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: approvedEmailSubject
      }),
      { env: { ...env, NODE_ENV: undefined }, fetchImpl }
    );

    expect(response.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Actor is not permitted to send approved external correspondence."
    });
  });

  it("rejects edited email drafts that drop approved case facts", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify(approvedDetail), { status: 200 })));

    const response = await handleEmailPostForTest(
      request({
        actionId: "draft:S3-L1",
        body: "Please process this.",
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: "Short note"
      }),
      { env, fetchImpl }
    );

    expect(response.status).toBe(409);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({ error: "Email draft must include approved case facts." });
  });

  it("rejects recipient groups that do not match approved case routing", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify(approvedDetail), { status: 200 })));

    const response = await handleEmailPostForTest(
      request({
        actionId: "draft:S3-L1",
        body: approvedEmailBody,
        lineId: "S3-L1",
        recipientGroup: "billing",
        subject: approvedEmailSubject
      }),
      { env, fetchImpl }
    );

    expect(response.status).toBe(409);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({ error: "Email recipient does not match the approved case routing." });
  });

  it("sends real Resend payload only after re-fetching approved case detail", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(approvedDetail), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ created_at: "2026-07-03T00:00:00.000Z", id: "email_123", last_event: "sent" }), {
          status: 200
        })
      );

    const response = await handleEmailPostForTest(
      request({
        actionId: "draft:S3-L1",
        body: approvedEmailBody,
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: approvedEmailSubject
      }),
      { env, fetchImpl }
    );

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.resend.com/emails",
      expect.objectContaining({
        body: JSON.stringify({
          from: "maya@example.com",
          html: [
            '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;">',
            approvedEmailBody.replace(/\n/gu, "<br />\n"),
            "</div>"
          ].join(""),
          subject: approvedEmailSubject,
          text: approvedEmailBody,
          to: ["recovery@example.com"]
        }),
        method: "POST"
      })
    );
    const sendInit = fetchImpl.mock.calls[1]?.[1] as RequestInit | undefined;
    const sendHeaders = sendInit?.headers as Record<string, string> | undefined;
    expect(sendHeaders?.["idempotency-key"]).toMatch(/^recoup-email\/[a-f0-9]{64}$/u);
    const payload = (await response.json()) as {
      actionId: string;
      bodyHtmlHash: string;
      bodyTextHash: string;
      lineId: string;
      providerEmailId: string;
      recipientGroup: string;
      status: string;
      statusToken: string;
    };
    expect(payload.bodyHtmlHash).toMatch(sha256Pattern);
    expect(payload.bodyTextHash).toMatch(sha256Pattern);
    expect(payload).toEqual({
      actionId: "draft:S3-L1",
      bodyHtmlHash: payload.bodyHtmlHash,
      bodyTextHash: payload.bodyTextHash,
      lineId: "S3-L1",
      providerEmailId: "email_123",
      recipientGroup: "recovery",
      status: "sent",
      statusToken: payload.statusToken
    });
    expect(payload.statusToken.length).toBeGreaterThan(20);
  });

  it("returns the original send receipt instead of dispatching a duplicate approved email", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(approvedDetail), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ created_at: "2026-07-03T00:00:00.000Z", id: "email_123", last_event: "sent" }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(approvedDetail), { status: 200 }));
    const requestBody = {
      actionId: "draft:S3-L1",
      body: approvedEmailBody,
      lineId: "S3-L1",
      recipientGroup: "recovery",
      subject: approvedEmailSubject
    } as const;

    const firstResponse = await handleEmailPostForTest(request(requestBody), { env, fetchImpl });
    const secondResponse = await handleEmailPostForTest(request(requestBody), { env, fetchImpl });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    const firstPayload = (await firstResponse.json()) as { providerEmailId: string; status: string; statusToken: string };
    const secondPayload = (await secondResponse.json()) as { providerEmailId: string; status: string; statusToken: string };
    expect(firstPayload.providerEmailId).toBe("email_123");
    expect(firstPayload.status).toBe("sent");
    expect(secondPayload.providerEmailId).toBe("email_123");
    expect(secondPayload.status).toBe("already_sent");
    expect(secondPayload.statusToken.length).toBeGreaterThan(20);
    expect(fetchImpl.mock.calls.filter(([url]) => url === "https://api.resend.com/emails")).toHaveLength(1);
  });

  it("uses a new provider idempotency key when an approved email draft body changes", async () => {
    const editedEmailBody = `${approvedEmailBody}\nReviewed with updated settlement notes.`;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(approvedDetail), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ created_at: "2026-07-03T00:00:00.000Z", id: "email_123", last_event: "sent" }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(approvedDetail), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ created_at: "2026-07-03T00:00:01.000Z", id: "email_456", last_event: "sent" }), {
          status: 200
        })
      );
    const requestBody = {
      actionId: "draft:S3-L1",
      body: approvedEmailBody,
      lineId: "S3-L1",
      recipientGroup: "recovery",
      subject: approvedEmailSubject
    } as const;

    const firstResponse = await handleEmailPostForTest(request(requestBody), { env, fetchImpl });
    const secondResponse = await handleEmailPostForTest(
      request({
        ...requestBody,
        body: editedEmailBody
      }),
      { env, fetchImpl }
    );

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    const firstPayload = (await firstResponse.json()) as { providerEmailId: string; status: string };
    const secondPayload = (await secondResponse.json()) as { providerEmailId: string; status: string };
    expect(firstPayload).toMatchObject({ providerEmailId: "email_123", status: "sent" });
    expect(secondPayload).toMatchObject({ providerEmailId: "email_456", status: "sent" });

    const resendCalls = fetchImpl.mock.calls.filter(([url]) => url === "https://api.resend.com/emails");
    expect(resendCalls).toHaveLength(2);
    const resendInits = resendCalls.map(([, init]) => init as RequestInit | undefined);
    const firstHeaders = resendInits[0]?.headers as Record<string, string> | undefined;
    const secondHeaders = resendInits[1]?.headers as Record<string, string> | undefined;
    expect(firstHeaders?.["idempotency-key"]).toMatch(/^recoup-email\/[a-f0-9]{64}$/u);
    expect(secondHeaders?.["idempotency-key"]).toMatch(/^recoup-email\/[a-f0-9]{64}$/u);
    expect(secondHeaders?.["idempotency-key"]).not.toBe(firstHeaders?.["idempotency-key"]);
  });

  it("uses a new provider idempotency key when the configured sender or recipient changes", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(approvedDetail), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ created_at: "2026-07-03T00:00:00.000Z", id: "email_123", last_event: "sent" }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(approvedDetail), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ created_at: "2026-07-03T00:00:01.000Z", id: "email_456", last_event: "sent" }), {
          status: 200
        })
      );
    const requestBody = {
      actionId: "draft:S3-L1",
      body: approvedEmailBody,
      lineId: "S3-L1",
      recipientGroup: "recovery",
      subject: approvedEmailSubject
    } as const;

    const firstResponse = await handleEmailPostForTest(request(requestBody), { env, fetchImpl });
    const secondResponse = await handleEmailPostForTest(request(requestBody), {
      env: {
        ...env,
        EMAIL_TO_RECOVERY: "collections@example.com",
        SENDER_EMAIL_ADDRESS: "maya@north-bay.dev"
      },
      fetchImpl
    });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    const firstPayload = (await firstResponse.json()) as { providerEmailId: string; status: string };
    const secondPayload = (await secondResponse.json()) as { providerEmailId: string; status: string };
    expect(firstPayload).toMatchObject({ providerEmailId: "email_123", status: "sent" });
    expect(secondPayload).toMatchObject({ providerEmailId: "email_456", status: "sent" });

    const resendCalls = fetchImpl.mock.calls.filter(([url]) => url === "https://api.resend.com/emails");
    expect(resendCalls).toHaveLength(2);
    const firstInit = resendCalls[0]?.[1] as RequestInit | undefined;
    const secondInit = resendCalls[1]?.[1] as RequestInit | undefined;
    const firstHeaders = firstInit?.headers as Record<string, string> | undefined;
    const secondHeaders = secondInit?.headers as Record<string, string> | undefined;
    expect(firstHeaders?.["idempotency-key"]).toMatch(/^recoup-email\/[a-f0-9]{64}$/u);
    expect(secondHeaders?.["idempotency-key"]).toMatch(/^recoup-email\/[a-f0-9]{64}$/u);
    expect(secondHeaders?.["idempotency-key"]).not.toBe(firstHeaders?.["idempotency-key"]);
  });

  it("generates a non-empty HTML body while preserving the approved plain-text body", async () => {
    const bodyWithEscapableCharacters = `${approvedEmailBody}\nReview approved & route "now".`;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(approvedDetail), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "email_123", last_event: "sent" }), { status: 200 }));

    const response = await handleEmailPostForTest(
      request({
        actionId: "draft:S3-L1",
        body: bodyWithEscapableCharacters,
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: approvedEmailSubject
      }),
      { env, fetchImpl }
    );

    expect(response.status).toBe(200);
    const resendBody = (fetchImpl.mock.calls[1]?.[1] as RequestInit | undefined)?.body;
    if (typeof resendBody !== "string") {
      throw new TypeError("Expected Resend request body to be a JSON string.");
    }
    const resendCallBody = JSON.parse(resendBody) as {
      html?: string;
      text?: string;
    };
    expect(resendCallBody.text).toBe(bodyWithEscapableCharacters);
    expect(resendCallBody.html).toContain("NorthBay Retail");
    expect(resendCallBody.html).toContain("Review approved &amp; route &quot;now&quot;.");
    expect(resendCallBody.html).not.toContain('Review approved & route "now".');
  });

  it("returns a redacted provider error when Resend rejects the live send", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(approvedDetail), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "The sender maya@example.com is not verified for recovery@example.com. Bearer provider-secret"
          }),
          { status: 403 }
        )
      );

    const response = await handleEmailPostForTest(
      request({
        actionId: "draft:S3-L1",
        body: approvedEmailBody,
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: approvedEmailSubject
      }),
      { env, fetchImpl }
    );

    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("Email provider send failed. Provider status 403:");
    expect(payload.error).toContain("[email]");
    expect(payload.error).toContain("Bearer [redacted]");
    expect(payload.error).not.toContain("maya@example.com");
    expect(payload.error).not.toContain("recovery@example.com");
    expect(payload.error).not.toContain("provider-secret");
  });

  it("rejects HTML markup so edited drafts stay plain text", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify(approvedDetail), { status: 200 })));

    const response = await handleEmailPostForTest(
      request({
        actionId: "draft:S3-L1",
        body: `${approvedEmailBody}\n<!-- hidden approved facts -->`,
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: approvedEmailSubject
      }),
      { env, fetchImpl }
    );

    expect(response.status).toBe(400);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({ error: "Email draft must be plain text." });
  });

  it("reads safe Resend sent-email metadata by provider email ID", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(approvedDetail), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ created_at: "2026-07-03T00:00:00.000Z", id: "email_123", last_event: "sent" }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            bcc: ["hidden@example.com"],
            created_at: "2026-07-03T00:00:00.000Z",
            from: "maya@example.com",
            headers: { authorization: "secret" },
            html: approvedEmailHtml,
            id: "email_123",
            last_event: "delivered",
            subject: approvedEmailSubject,
            text: approvedEmailBody,
            to: ["recovery@example.com"]
          }),
          { status: 200 }
        )
      );

    const sendResponse = await handleEmailPostForTest(
      request({
        actionId: "draft:S3-L1",
        body: approvedEmailBody,
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: approvedEmailSubject
      }),
      { env, fetchImpl }
    );
    expect(sendResponse.status).toBe(200);
    const sendPayload = (await sendResponse.json()) as { statusToken: string };
    clearEmailSendReceiptsForTest();

    const response = await handleEmailGetForTest(
      new Request(
        "http://localhost/api/email?actionId=draft:S3-L1&lineId=S3-L1&providerEmailId=email_123&recipientGroup=recovery",
        {
          headers: {
            "x-recoup-email-status-token": sendPayload.statusToken,
            "x-recoup-human-principal": "human:maya",
            "x-recoup-human-token": "test-human-token"
          }
        }
      ),
      { env, fetchImpl }
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload.bodyHtmlHash).toMatch(sha256Pattern);
    expect(payload.bodyTextHash).toMatch(sha256Pattern);
    expect(payload).toEqual({
      actionId: "draft:S3-L1",
      bodyHtmlHash: payload.bodyHtmlHash,
      bodyTextHash: payload.bodyTextHash,
      createdAt: "2026-07-03T00:00:00.000Z",
      lastEvent: "delivered",
      lineId: "S3-L1",
      providerBodyHashVerified: true,
      providerEmailId: "email_123",
      recipientGroup: "recovery",
      status: "delivered",
      subject: approvedEmailSubject
    });
    expect(JSON.stringify(payload)).not.toContain(approvedEmailBody);
    expect(JSON.stringify(payload)).not.toContain(approvedEmailHtml);
    expect(JSON.stringify(payload)).not.toContain("recovery@example.com");
    expect(JSON.stringify(payload)).not.toContain("secret");
  });

  it("fails closed when provider readback body no longer matches the approved draft", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(approvedDetail), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ created_at: "2026-07-03T00:00:00.000Z", id: "email_123", last_event: "sent" }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            created_at: "2026-07-03T00:00:00.000Z",
            html: approvedEmailHtml,
            id: "email_123",
            last_event: "delivered",
            subject: approvedEmailSubject,
            text: "tampered provider body"
          }),
          { status: 200 }
        )
      );

    const sendResponse = await handleEmailPostForTest(
      request({
        actionId: "draft:S3-L1",
        body: approvedEmailBody,
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: approvedEmailSubject
      }),
      { env, fetchImpl }
    );
    expect(sendResponse.status).toBe(200);
    const sendPayload = (await sendResponse.json()) as { statusToken: string };

    const response = await handleEmailGetForTest(
      new Request(
        "http://localhost/api/email?actionId=draft:S3-L1&lineId=S3-L1&providerEmailId=email_123&recipientGroup=recovery",
        {
          headers: {
            "x-recoup-email-status-token": sendPayload.statusToken,
            "x-recoup-human-principal": "human:maya",
            "x-recoup-human-token": "test-human-token"
          }
        }
      ),
      { env, fetchImpl }
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Email provider body hash did not match the approved draft." });
  });

  it("rejects signed email status receipts passed through the URL", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(approvedDetail), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ created_at: "2026-07-03T00:00:00.000Z", id: "email_123", last_event: "sent" }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "email_123", last_event: "delivered", subject: approvedEmailSubject }), {
          status: 200
        })
      );

    const sendResponse = await handleEmailPostForTest(
      request({
        actionId: "draft:S3-L1",
        body: approvedEmailBody,
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: approvedEmailSubject
      }),
      { env, fetchImpl }
    );
    expect(sendResponse.status).toBe(200);
    const sendPayload = (await sendResponse.json()) as { statusToken: string };

    const response = await handleEmailGetForTest(
      new Request(
        `http://localhost/api/email?actionId=draft:S3-L1&lineId=S3-L1&providerEmailId=email_123&recipientGroup=recovery&statusToken=${encodeURIComponent(sendPayload.statusToken)}`,
        {
          headers: {
            "x-recoup-human-principal": "human:maya",
            "x-recoup-human-token": "test-human-token"
          }
        }
      ),
      { env, fetchImpl }
    );

    expect(response.status).toBe(400);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await expect(response.json()).resolves.toEqual({ error: "Invalid email status request." });
  });

  it("expires signed email status receipts after the delivery-check window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-03T00:00:00.000Z"));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(approvedDetail), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ created_at: "2026-07-03T00:00:00.000Z", id: "email_123", last_event: "sent" }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "email_123", last_event: "delivered", subject: approvedEmailSubject }), {
          status: 200
        })
      );

    const sendResponse = await handleEmailPostForTest(
      request({
        actionId: "draft:S3-L1",
        body: approvedEmailBody,
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: approvedEmailSubject
      }),
      { env, fetchImpl }
    );
    expect(sendResponse.status).toBe(200);
    const sendPayload = (await sendResponse.json()) as { statusToken: string };
    vi.setSystemTime(new Date("2026-07-03T00:16:00.000Z"));

    const response = await handleEmailGetForTest(
      new Request(
        "http://localhost/api/email?actionId=draft:S3-L1&lineId=S3-L1&providerEmailId=email_123&recipientGroup=recovery",
        {
          headers: {
            "x-recoup-email-status-token": sendPayload.statusToken,
            "x-recoup-human-principal": "human:maya",
            "x-recoup-human-token": "test-human-token"
          }
        }
      ),
      { env, fetchImpl }
    );

    expect(response.status).toBe(404);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await expect(response.json()).resolves.toEqual({ error: "Email status receipt unavailable." });
  });

  it("sends and reads approved email through the typed service gateway", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(approvedDetail), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ created_at: "2026-07-03T00:00:00.000Z", id: "email_service_123", last_event: "sent" }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            created_at: "2026-07-03T00:00:00.000Z",
            from: "maya@example.com",
            headers: { authorization: "secret" },
            html: approvedEmailHtml,
            id: "email_service_123",
            last_event: "delivered",
            subject: approvedEmailSubject,
            text: approvedEmailBody,
            to: ["recovery@example.com"]
          }),
          { status: 200 }
        )
      );

    const sendResult = (await invokeServiceTool(
      "email.sendApproved",
      {
        actionId: "draft:S3-L1",
        body: approvedEmailBody,
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: approvedEmailSubject
      },
      {
        actorCapabilities: ["read", "send_email"],
        emailFetch: fetchImpl,
        runtimeEnv: env,
        verifiedHumanPrincipal: "human:maya"
      }
    )) as {
      providerEmailId: string;
      statusToken: string;
    };

    expect(sendResult.providerEmailId).toBe("email_service_123");
    expect(sendResult.statusToken.length).toBeGreaterThan(20);

    const statusResult = (await invokeServiceTool(
      "email.status",
      {
        actionId: "draft:S3-L1",
        lineId: "S3-L1",
        providerEmailId: sendResult.providerEmailId,
        recipientGroup: "recovery",
        statusToken: sendResult.statusToken
      },
      {
        emailFetch: fetchImpl,
        runtimeEnv: env,
        verifiedHumanPrincipal: "human:maya"
      }
    )) as {
      bodyHtmlHash: string;
      bodyTextHash: string;
      lastEvent: string;
      providerBodyHashVerified: boolean;
      providerEmailId: string;
      status: string;
      subject: string;
    };

    expect(statusResult.bodyHtmlHash).toMatch(sha256Pattern);
    expect(statusResult.bodyTextHash).toMatch(sha256Pattern);
    expect(statusResult).toEqual({
      actionId: "draft:S3-L1",
      bodyHtmlHash: statusResult.bodyHtmlHash,
      bodyTextHash: statusResult.bodyTextHash,
      createdAt: "2026-07-03T00:00:00.000Z",
      lastEvent: "delivered",
      lineId: "S3-L1",
      providerBodyHashVerified: true,
      providerEmailId: "email_service_123",
      recipientGroup: "recovery",
      status: "delivered",
      subject: approvedEmailSubject
    });
    expect(JSON.stringify(statusResult)).not.toContain("recovery@example.com");
    expect(JSON.stringify(statusResult)).not.toContain("secret");
  });

  it("blocks service-gateway email send without the send_email actor capability", async () => {
    await expect(
      Promise.resolve().then(() => invokeServiceTool(
        "email.sendApproved",
        {
          actionId: "draft:S3-L1",
          body: approvedEmailBody,
          lineId: "S3-L1",
          recipientGroup: "recovery",
          subject: approvedEmailSubject
        },
        {
          actorCapabilities: ["read"],
          runtimeEnv: env,
          verifiedHumanPrincipal: "human:maya"
        }
      ))
    ).rejects.toThrow("Actor is not permitted to send approved external correspondence.");
  });

  it("blocks service-gateway email send when the server principal allowlist denies the caller", async () => {
    const fetchImpl = vi.fn();

    await expect(
      Promise.resolve().then(() => invokeServiceTool(
        "email.sendApproved",
        {
          actionId: "draft:S3-L1",
          body: approvedEmailBody,
          lineId: "S3-L1",
          recipientGroup: "recovery",
          subject: approvedEmailSubject
        },
        {
          actorCapabilities: ["read", "send_email"],
          emailFetch: fetchImpl,
          runtimeEnv: { ...env, RECOUP_EMAIL_SEND_PRINCIPALS: "human:billing-lead" },
          verifiedHumanPrincipal: "human:maya"
        }
      ))
    ).rejects.toThrow("Actor is not permitted to send approved external correspondence.");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks service-gateway email status read without a verified human principal", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(approvedDetail), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ created_at: "2026-07-03T00:00:00.000Z", id: "email_service_123", last_event: "sent" }), {
          status: 200
        })
      );

    const sendResult = (await invokeServiceTool(
      "email.sendApproved",
      {
        actionId: "draft:S3-L1",
        body: approvedEmailBody,
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: approvedEmailSubject
      },
      {
        actorCapabilities: ["read", "send_email"],
        emailFetch: fetchImpl,
        runtimeEnv: env,
        verifiedHumanPrincipal: "human:maya"
      }
    )) as {
      providerEmailId: string;
      statusToken: string;
    };

    await expect(
      Promise.resolve().then(() => invokeServiceTool(
        "email.status",
        {
          actionId: "draft:S3-L1",
          lineId: "S3-L1",
          providerEmailId: sendResult.providerEmailId,
          recipientGroup: "recovery",
          statusToken: sendResult.statusToken
        },
        {
          emailFetch: fetchImpl,
          runtimeEnv: env
        }
      ))
    ).rejects.toThrow("Verified human cockpit auth required for email status.");
  });

  it("rejects status reads when the receipt metadata does not match the sent email", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(approvedDetail), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ created_at: "2026-07-03T00:00:00.000Z", id: "email_123", last_event: "sent" }), {
          status: 200
        })
      );

    const sendResponse = await handleEmailPostForTest(
      request({
        actionId: "draft:S3-L1",
        body: approvedEmailBody,
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: approvedEmailSubject
      }),
      { env, fetchImpl }
    );
    expect(sendResponse.status).toBe(200);
    const sendPayload = (await sendResponse.json()) as { statusToken: string };

    const response = await handleEmailGetForTest(
      new Request(
        "http://localhost/api/email?actionId=draft:S9-L1&lineId=S3-L1&providerEmailId=email_123&recipientGroup=recovery",
        {
          headers: {
            "x-recoup-email-status-token": sendPayload.statusToken,
            "x-recoup-human-principal": "human:maya",
            "x-recoup-human-token": "test-human-token"
          }
        }
      ),
      { env, fetchImpl }
    );

    expect(response.status).toBe(404);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await expect(response.json()).resolves.toEqual({ error: "Email status receipt unavailable." });
  });

  it("rejects status reads when the signed receipt token is missing or does not match", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(approvedDetail), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ created_at: "2026-07-03T00:00:00.000Z", id: "email_123", last_event: "sent" }), {
          status: 200
        })
      );

    const sendResponse = await handleEmailPostForTest(
      request({
        actionId: "draft:S3-L1",
        body: approvedEmailBody,
        lineId: "S3-L1",
        recipientGroup: "recovery",
        subject: approvedEmailSubject
      }),
      { env, fetchImpl }
    );
    expect(sendResponse.status).toBe(200);
    const sendPayload = (await sendResponse.json()) as { statusToken: string };

    const response = await handleEmailGetForTest(
      new Request(
        "http://localhost/api/email?actionId=draft:S3-L1&lineId=S3-L1&providerEmailId=email_missing&recipientGroup=recovery",
        {
          headers: {
            "x-recoup-email-status-token": sendPayload.statusToken,
            "x-recoup-human-principal": "human:maya",
            "x-recoup-human-token": "test-human-token"
          }
        }
      ),
      { env, fetchImpl }
    );

    expect(response.status).toBe(404);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await expect(response.json()).resolves.toEqual({ error: "Email status receipt unavailable." });
  });
});
