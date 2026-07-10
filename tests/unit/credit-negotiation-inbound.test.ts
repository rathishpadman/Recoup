import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handleCreditNegotiationInboundPostForTest } from "../../cockpit/app/api/credit/negotiation/inbound/route.ts";
import { creditNegotiationPolicyCandidateRows } from "../../src/services/creditNegotiationPolicy.js";

const rawBody = JSON.stringify({
  created_at: "2026-07-09T14:30:00.000Z",
  data: {
    email_id: "eml_inbound_123",
    from: "harbor-ap@example.com",
    headers: {
      "message-id": "<counter-1@harbor.example>"
    },
    subject: "[Recoup Deal ORD-HARBOR-6534 - Round 1] Counter",
    to: "deals+ORD-HARBOR-6534-r1@north-bay.dev"
  },
  type: "email.received"
});

const subjectOnlyBody = JSON.stringify({
  created_at: "2026-07-09T14:30:00.000Z",
  data: {
    email_id: "eml_inbound_subject_456",
    from: "harbor-ap@example.com",
    headers: {
      "message-id": "<counter-subject@harbor.example>"
    },
    subject: "[Recoup Deal ORD-HARBOR-6534 · Round 1] Counter",
    to: "deals@north-bay.dev"
  },
  type: "email.received"
});

const resendReceivedWebhookBody = JSON.stringify({
  created_at: "2026-02-22T23:41:12.126Z",
  data: {
    bcc: [],
    cc: [],
    created_at: "2026-02-22T23:41:11.894719+00:00",
    email_id: "eml_received_official_shape",
    from: "harbor-ap@example.com",
    message_id: "<official-counter@harbor.example>",
    received_for: ["deals+ORD-HARBOR-6534-r1@north-bay.dev"],
    subject: "Counter details",
    to: ["forwarded@north-bay.dev"]
  },
  type: "email.received"
});

const rawSecretBase64 = Buffer.from("test-inbound-secret", "utf8").toString("base64");
const secret = `whsec_${rawSecretBase64}`;
const timestamp = "1783607400";
const webhookId = "msg_test_123";

function signedRequest(body: string, signatureOverride?: string): Request {
  return new Request("http://localhost/api/credit/negotiation/inbound", {
    body,
    headers: {
      "content-type": "application/json",
      "svix-id": webhookId,
      "svix-signature": signatureOverride ?? `v1,${sign(body)}`,
      "svix-timestamp": timestamp
    },
    method: "POST"
  });
}

function sign(body: string): string {
  return createHmac("sha256", Buffer.from("test-inbound-secret", "utf8"))
    .update(`${webhookId}.${timestamp}.${body}`)
    .digest("base64");
}

describe("David negotiation inbound webhook", () => {
  it("rejects an invalid Resend webhook signature before fetch or writes", async () => {
    const store = {
      insertInboundMetadata: vi.fn()
    };
    const fetchImpl = vi.fn();

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(rawBody, "v1,bad-signature"), {
      env: { RESEND_INBOUND_SIGNING_SECRET: secret, RESEND_API_KEY: "test-resend-key" },
      fetchImpl,
      nowMs: Number(timestamp) * 1000,
      store
    });

    expect(response.status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.insertInboundMetadata).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "Invalid Resend webhook signature." });
  });

  it("rejects a base64-shaped Resend webhook secret without the whsec prefix before reads or writes", async () => {
    const store = {
      insertInboundMetadata: vi.fn(),
      readCounterOfferByEmailId: vi.fn(() => Promise.resolve(undefined)),
      readInboundByEmailId: vi.fn(() => Promise.resolve(undefined))
    };
    const fetchImpl = vi.fn();

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(rawBody), {
      env: { RESEND_INBOUND_SIGNING_SECRET: rawSecretBase64, RESEND_API_KEY: "test-resend-key" },
      fetchImpl,
      nowMs: Number(timestamp) * 1000,
      store
    });

    expect(response.status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.readInboundByEmailId).not.toHaveBeenCalled();
    expect(store.readCounterOfferByEmailId).not.toHaveBeenCalled();
    expect(store.insertInboundMetadata).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "Invalid Resend webhook signature." });
  });

  it("returns a retryable failure when the durable inbound store is not configured", async () => {
    const fetchImpl = vi.fn();

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(rawBody), {
      env: {
        RESEND_INBOUND_RATE_LIMIT_MAX_EVENTS: "10",
        RESEND_INBOUND_RATE_LIMIT_WINDOW_MS: "60000",
        RESEND_INBOUND_SIGNING_SECRET: secret,
        RESEND_API_KEY: "test-resend-key"
      },
      fetchImpl,
      nowMs: Number(timestamp) * 1000
    });

    expect(response.status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "Credit negotiation inbound store is not configured." });
  });

  it("rate-limits repeated signed catch-all inbound events before store reads or body fetch", async () => {
    const spamBody = JSON.stringify({
      created_at: "2026-07-09T14:30:00.000Z",
      data: {
        email_id: "eml_spam_1",
        from: "spam@example.net",
        subject: "random inquiry",
        to: "random@north-bay.dev"
      },
      type: "email.received"
    });
    const store = {
      readRoundByToken: vi.fn()
    };
    const fetchImpl = vi.fn();
    const rateLimitStore = new Map<string, { count: number; windowStartMs: number }>();

    const first = await handleCreditNegotiationInboundPostForTest(signedRequest(spamBody), {
      env: { RESEND_INBOUND_SIGNING_SECRET: secret, RESEND_API_KEY: "test-resend-key" },
      fetchImpl,
      inboundRateLimit: { maxEvents: 1, store: rateLimitStore, windowMs: 60_000 },
      nowMs: Number(timestamp) * 1000,
      store
    });
    const second = await handleCreditNegotiationInboundPostForTest(signedRequest(spamBody), {
      env: { RESEND_INBOUND_SIGNING_SECRET: secret, RESEND_API_KEY: "test-resend-key" },
      fetchImpl,
      inboundRateLimit: { maxEvents: 1, store: rateLimitStore, windowMs: 60_000 },
      nowMs: Number(timestamp) * 1000 + 1_000,
      store
    });

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ status: "dropped_unmatched" });
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ status: "dropped_rate_limited" });
    expect(store.readRoundByToken).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rate-limits catch-all inbound bursts across recipient aliases from the same sender", async () => {
    const firstBody = JSON.stringify({
      created_at: "2026-07-09T14:30:00.000Z",
      data: {
        email_id: "eml_spam_alias_1",
        from: "spam@example.net",
        subject: "random inquiry",
        to: "random-one@north-bay.dev"
      },
      type: "email.received"
    });
    const secondBody = JSON.stringify({
      created_at: "2026-07-09T14:30:00.000Z",
      data: {
        email_id: "eml_spam_alias_2",
        from: "spam@example.net",
        subject: "another inquiry",
        to: "random-two@north-bay.dev"
      },
      type: "email.received"
    });
    const store = {
      readRoundByToken: vi.fn()
    };
    const fetchImpl = vi.fn();
    const rateLimitStore = new Map<string, { count: number; windowStartMs: number }>();

    const first = await handleCreditNegotiationInboundPostForTest(signedRequest(firstBody), {
      env: { RESEND_INBOUND_SIGNING_SECRET: secret, RESEND_API_KEY: "test-resend-key" },
      fetchImpl,
      inboundRateLimit: { maxEvents: 1, store: rateLimitStore, windowMs: 60_000 },
      nowMs: Number(timestamp) * 1000,
      store
    });
    const second = await handleCreditNegotiationInboundPostForTest(signedRequest(secondBody), {
      env: { RESEND_INBOUND_SIGNING_SECRET: secret, RESEND_API_KEY: "test-resend-key" },
      fetchImpl,
      inboundRateLimit: { maxEvents: 1, store: rateLimitStore, windowMs: 60_000 },
      nowMs: Number(timestamp) * 1000 + 1_000,
      store
    });

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ status: "dropped_unmatched" });
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ status: "dropped_rate_limited" });
    expect(store.readRoundByToken).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed in production mode when inbound rate-limit env is missing", async () => {
    const fetchImpl = vi.fn(() => {
      throw new Error("Rate-limit configuration should be checked before Supabase reads.");
    });

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(rawBody), {
      env: {
        RESEND_API_KEY: "test-resend-key",
        RESEND_INBOUND_SIGNING_SECRET: secret,
        SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      fetchImpl,
      nowMs: Number(timestamp) * 1000
    });

    expect(response.status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "Credit negotiation inbound rate limit is not configured." });
  });

  it("stores inbound metadata then returns retryable failure when Resend body fetch fails", async () => {
    const store = {
      insertInboundMetadata: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readInboundByEmailId: vi.fn(() => Promise.resolve(undefined)),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      )
    };
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ message: "temporarily unavailable" }), { status: 503 })));

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(rawBody), {
      env: { RESEND_INBOUND_SIGNING_SECRET: secret, RESEND_API_KEY: "test-resend-key" },
      extractCounterOffer: vi.fn(() =>
        Promise.resolve({
          citedSpans: [{ field: "outOfScope", text: "We can pay 20% deposit" }],
          intent: "out_of_scope"
        })
      ),
      fetchImpl,
      nowMs: Number(timestamp) * 1000,
      store: store as never
    });

    expect(response.status).toBe(502);
    const failedMetadataRow = store.insertInboundMetadata.mock.calls[0]?.[0];
    expect(failedMetadataRow).toMatchObject({
      bodyFetchStatus: "failed",
      emailId: "eml_inbound_123"
    });
    expect(failedMetadataRow?.rawBodyHash).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/u));
    await expect(response.json()).resolves.toEqual({
      emailId: "eml_inbound_123",
      error: "Credit negotiation inbound body fetch failed."
    });
  });

  it("retries a previously failed inbound body fetch instead of dropping it as duplicate", async () => {
    const store = {
      insertCounterOffer: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      insertInboundMetadata: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      markRoundCountered: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readInboundByEmailId: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          bodyFetchStatus: "failed",
          emailId: "eml_inbound_123",
          from: "harbor-ap@example.com",
          messageId: "<counter-1@harbor.example>",
          orderId: "ORD-HARBOR-6534",
          rawBodyHash: "a".repeat(64),
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          source: "email",
          subject: "[Recoup Deal ORD-HARBOR-6534 - Round 1] Counter",
          to: "deals+ORD-HARBOR-6534-r1@north-bay.dev"
        })
      ),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      ),
      updateInboundMetadata: vi.fn((row: Record<string, unknown>) => Promise.resolve(row))
    };
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ text: "We can pay 20% deposit and accept 2 tranches." }), { status: 200 }))
    );

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(rawBody), {
      env: { RESEND_INBOUND_SIGNING_SECRET: secret, RESEND_API_KEY: "test-resend-key" },
      extractCounterOffer: vi.fn(() =>
        Promise.resolve({
          citedSpans: [
            { field: "depositPct", text: "We can pay 20% deposit" },
            { field: "trancheCount", text: "accept 2 tranches" }
          ],
          intent: "counter_offer"
        })
      ),
      fetchImpl,
      nowMs: Number(timestamp) * 1000,
      store: store as never
    });

    expect(response.status).toBe(200);
    expect(store.insertInboundMetadata).not.toHaveBeenCalled();
    expect(store.updateInboundMetadata).toHaveBeenCalledWith(expect.objectContaining({ bodyFetchStatus: "fetched", emailId: "eml_inbound_123" }));
    expect(store.insertCounterOffer).toHaveBeenCalledOnce();
    expect(store.markRoundCountered).toHaveBeenCalledOnce();
  });

  it("replays fetched inbound metadata when no durable counter offer exists yet", async () => {
    const store = {
      insertCounterOffer: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      insertInboundMetadata: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      markRoundCountered: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readCounterOfferByEmailId: vi.fn(() => Promise.resolve(undefined)),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readInboundByEmailId: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          bodyFetchStatus: "fetched",
          emailId: "eml_inbound_123",
          from: "harbor-ap@example.com",
          messageId: "<counter-1@harbor.example>",
          orderId: "ORD-HARBOR-6534",
          rawBodyHash: "a".repeat(64),
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          source: "email",
          subject: "[Recoup Deal ORD-HARBOR-6534 - Round 1] Counter",
          textBodyHash: "b".repeat(64),
          to: "deals+ORD-HARBOR-6534-r1@north-bay.dev"
        })
      ),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      ),
      updateInboundMetadata: vi.fn((row: Record<string, unknown>) => Promise.resolve(row))
    };
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ text: "We can pay 25% deposit and accept 2 tranches." }), { status: 200 }))
    );

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(rawBody), {
      env: { RESEND_INBOUND_SIGNING_SECRET: secret, RESEND_API_KEY: "test-resend-key" },
      extractCounterOffer: vi.fn(() =>
        Promise.resolve({
          citedSpans: [
            { field: "depositPct", text: "25% deposit" },
            { field: "trancheCount", text: "2 tranches" }
          ],
          intent: "counter_offer"
        })
      ),
      fetchImpl,
      nowMs: Number(timestamp) * 1000,
      store: store as never
    });

    expect(response.status).toBe(200);
    expect(store.insertInboundMetadata).not.toHaveBeenCalled();
    expect(store.updateInboundMetadata).toHaveBeenCalledWith(expect.objectContaining({ bodyFetchStatus: "fetched", emailId: "eml_inbound_123" }));
    expect(store.insertCounterOffer).toHaveBeenCalledWith(expect.objectContaining({
      emailId: "eml_inbound_123",
      extractedTerms: {
        depositPct: 25,
        trancheCount: 2
      },
      status: "grammar_valid"
    }));
    await expect(response.json()).resolves.toEqual({
      emailId: "eml_inbound_123",
      parseStatus: "grammar_valid",
      status: "countered"
    });
  });

  it("repairs a sent round before treating an existing durable counter offer as duplicate", async () => {
    const store = {
      insertCounterOffer: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      insertInboundMetadata: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      markRoundCountered: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readCounterOfferByEmailId: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          emailId: "eml_inbound_123",
          orderId: "ORD-HARBOR-6534",
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          source: "email" as const,
          status: "grammar_valid" as const
        })
      ),
      readInboundByEmailId: vi.fn(() => Promise.resolve(undefined)),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      )
    };
    const fetchImpl = vi.fn();

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(rawBody), {
      env: { RESEND_INBOUND_SIGNING_SECRET: secret, RESEND_API_KEY: "test-resend-key" },
      fetchImpl,
      nowMs: Number(timestamp) * 1000,
      store: store as never
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ emailId: "eml_inbound_123", status: "duplicate" });
    expect(store.readCounterOfferByEmailId).toHaveBeenCalledWith("eml_inbound_123");
    expect(store.readRoundByToken).toHaveBeenCalledWith({ orderId: "ORD-HARBOR-6534", round: 1 });
    expect(store.markRoundCountered).toHaveBeenCalledWith({
      emailId: "eml_inbound_123",
      roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1"
    });
    expect(store.insertInboundMetadata).not.toHaveBeenCalled();
    expect(store.insertCounterOffer).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("verifies a signed inbound email, fetches the body, and stores metadata without model dollars", async () => {
    const store = {
      insertCounterOffer: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      insertInboundMetadata: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readInboundByEmailId: vi.fn(() => Promise.resolve(undefined)),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      )
    };
    const fetchImpl = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            html: "<p>We can pay 20% deposit and accept 2 tranches.</p>",
            text: "We can pay 20% deposit and accept 2 tranches."
          }),
          { status: 200 }
        )
      );
    });

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(rawBody), {
      env: { RESEND_INBOUND_SIGNING_SECRET: secret, RESEND_API_KEY: "test-resend-key" },
      extractCounterOffer: vi.fn(() =>
        Promise.resolve({
          citedSpans: [{ field: "outOfScope", text: "We can pay 20% deposit" }],
          intent: "out_of_scope"
        })
      ),
      fetchImpl,
      nowMs: Number(timestamp) * 1000,
      store: store as never
    });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.resend.com/emails/receiving/eml_inbound_123",
      expect.objectContaining({ method: "GET" })
    );
    const metadataRow = store.insertInboundMetadata.mock.calls[0]?.[0];
    expect(metadataRow).toMatchObject({
      accountId: "ACC-HAR",
      emailId: "eml_inbound_123",
      from: "harbor-ap@example.com",
      messageId: "<counter-1@harbor.example>",
      orderId: "ORD-HARBOR-6534",
      round: 1,
      roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      source: "email"
    });
    expect(metadataRow?.rawBodyHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(metadataRow?.textBodyHash).toMatch(/^[a-f0-9]{64}$/u);
    const payload: unknown = await response.json();
    expect(payload).toMatchObject({
      emailId: "eml_inbound_123",
      status: "human_review"
    });
    expect(JSON.stringify(payload)).not.toContain("20%");
  });

  it("accepts Resend email.received array recipients, received_for token, and data message_id", async () => {
    const store = {
      insertCounterOffer: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      insertInboundMetadata: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      markRoundCountered: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readInboundByEmailId: vi.fn(() => Promise.resolve(undefined)),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      )
    };
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ text: "We can pay 20% deposit and accept 2 tranches." }), { status: 200 }))
    );

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(resendReceivedWebhookBody), {
      env: { RESEND_INBOUND_SIGNING_SECRET: secret, RESEND_API_KEY: "test-resend-key" },
      extractCounterOffer: vi.fn(() =>
        Promise.resolve({
          citedSpans: [
            { field: "depositPct", text: "20% deposit" },
            { field: "trancheCount", text: "2 tranches" }
          ],
          intent: "counter_offer"
        })
      ),
      fetchImpl,
      nowMs: Number(timestamp) * 1000,
      store: store as never
    });

    expect(response.status).toBe(200);
    expect(store.readRoundByToken).toHaveBeenCalledWith({ orderId: "ORD-HARBOR-6534", round: 1 });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.resend.com/emails/receiving/eml_received_official_shape",
      expect.objectContaining({ method: "GET" })
    );
    expect(store.insertInboundMetadata).toHaveBeenCalledWith(expect.objectContaining({
      emailId: "eml_received_official_shape",
      messageId: "<official-counter@harbor.example>",
      to: "forwarded@north-bay.dev,deals+ORD-HARBOR-6534-r1@north-bay.dev"
    }));
    expect(store.insertCounterOffer).toHaveBeenCalledWith(expect.objectContaining({
      emailId: "eml_received_official_shape",
      messageId: "<official-counter@harbor.example>",
      status: "grammar_valid"
    }));
  });

  it("fails closed when the live inbound counter-offer writer seam is absent", async () => {
    const store = {
      insertInboundMetadata: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      markRoundCountered: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readInboundByEmailId: vi.fn(() => Promise.resolve(undefined)),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      )
    };
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ text: "We can pay 20% deposit and accept 2 tranches." }), { status: 200 }))
    );

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(rawBody), {
      env: { RESEND_INBOUND_SIGNING_SECRET: secret, RESEND_API_KEY: "test-resend-key" },
      extractCounterOffer: vi.fn(() =>
        Promise.resolve({
          citedSpans: [
            { field: "depositPct", text: "20% deposit" },
            { field: "trancheCount", text: "2 tranches" }
          ],
          intent: "counter_offer"
        })
      ),
      fetchImpl,
      nowMs: Number(timestamp) * 1000,
      store: store as never
    });

    expect(response.status).toBe(503);
    expect(store.markRoundCountered).not.toHaveBeenCalled();
    const body = await response.text();
    expect(body).not.toContain("20% deposit");
    expect(JSON.parse(body) as unknown).toEqual({ error: "store_not_configured" });
  });

  it("fails closed when the live inbound round countered updater seam is absent", async () => {
    const store = {
      insertCounterOffer: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      insertInboundMetadata: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readInboundByEmailId: vi.fn(() => Promise.resolve(undefined)),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      )
    };
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ text: "We can pay 20% deposit and accept 2 tranches." }), { status: 200 }))
    );

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(rawBody), {
      env: { RESEND_INBOUND_SIGNING_SECRET: secret, RESEND_API_KEY: "test-resend-key" },
      extractCounterOffer: vi.fn(() =>
        Promise.resolve({
          citedSpans: [
            { field: "depositPct", text: "20% deposit" },
            { field: "trancheCount", text: "2 tranches" }
          ],
          intent: "counter_offer"
        })
      ),
      fetchImpl,
      nowMs: Number(timestamp) * 1000,
      store: store as never
    });

    expect(response.status).toBe(503);
    expect(store.insertCounterOffer).not.toHaveBeenCalled();
    const body = await response.text();
    expect(body).not.toContain("20% deposit");
    expect(JSON.parse(body) as unknown).toEqual({ error: "store_not_configured" });
  });

  it("advances a signed inbound counter only after span-grounded grammar extraction", async () => {
    const store = {
      insertCounterOffer: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      insertInboundMetadata: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      markRoundCountered: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readInboundByEmailId: vi.fn(() => Promise.resolve(undefined)),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      )
    };
    const fetchImpl = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(
        new Response(JSON.stringify({ text: "We can pay 20% deposit and accept 2 tranches." }), {
          status: 200
        })
      );
    });

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(rawBody), {
      env: { RESEND_INBOUND_SIGNING_SECRET: secret, RESEND_API_KEY: "test-resend-key" },
      extractCounterOffer: vi.fn(() =>
        Promise.resolve({
          citedSpans: [
            { field: "depositPct", text: "We can pay 20% deposit" },
            { field: "trancheCount", text: "accept 2 tranches" }
          ],
          intent: "counter_offer"
        })
      ),
      fetchImpl,
      nowMs: Number(timestamp) * 1000,
      store: store as never
    });

    expect(response.status).toBe(200);
    expect(store.insertCounterOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "ACC-HAR",
        emailId: "eml_inbound_123",
        extractedTerms: {
          depositPct: 20,
          trancheCount: 2
        },
        messageId: "<counter-1@harbor.example>",
        orderId: "ORD-HARBOR-6534",
        roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        status: "grammar_valid"
      })
    );
    expect(store.markRoundCountered).toHaveBeenCalledWith({
      emailId: "eml_inbound_123",
      roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1"
    });
    await expect(response.json()).resolves.toEqual({
      emailId: "eml_inbound_123",
      parseStatus: "grammar_valid",
      status: "countered"
    });
  });

  it("correlates a signed inbound email using the documented subject token when the plus address is unavailable", async () => {
    const store = {
      insertCounterOffer: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      insertInboundMetadata: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readInboundByEmailId: vi.fn(() => Promise.resolve(undefined)),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      )
    };
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ text: "We can pay 20% deposit." }), { status: 200 })));

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(subjectOnlyBody), {
      env: { RESEND_INBOUND_SIGNING_SECRET: secret, RESEND_API_KEY: "test-resend-key" },
      extractCounterOffer: vi.fn(() =>
        Promise.resolve({
          citedSpans: [{ field: "outOfScope", text: "We can pay 20% deposit" }],
          intent: "out_of_scope"
        })
      ),
      fetchImpl,
      nowMs: Number(timestamp) * 1000,
      store: store as never
    });

    expect(response.status).toBe(200);
    expect(store.readRoundByToken).toHaveBeenCalledWith({ orderId: "ORD-HARBOR-6534", round: 1 });
    expect(store.insertInboundMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        emailId: "eml_inbound_subject_456",
        messageId: "<counter-subject@harbor.example>",
        to: "deals@north-bay.dev"
      })
    );
  });

  it("uses the default live LLM extractor when no test extractor is injected", async () => {
    const store = {
      insertCounterOffer: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      insertInboundMetadata: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      markRoundCountered: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readInboundByEmailId: vi.fn(() => Promise.resolve(undefined)),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      )
    };
    const fetchImpl = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      if (urlString === "https://api.resend.com/emails/receiving/eml_inbound_123") {
        return Promise.resolve(new Response(JSON.stringify({ text: "We can pay 20% deposit and accept 2 tranches." }), { status: 200 }));
      }
      if (urlString === "https://api.openai.com/v1/responses") {
        if (typeof init?.body !== "string") {
          throw new TypeError("Expected OpenAI request body.");
        }
        const requestBody = JSON.parse(init.body) as Record<string, unknown>;
        expect(JSON.stringify(requestBody)).toContain("json_schema");
        expect(JSON.stringify(requestBody)).not.toContain("sk-live-counter-extractor");
        return Promise.resolve(
          new Response(
            JSON.stringify({
              output_text: JSON.stringify({
                citedSpans: [
                  { field: "depositPct", text: "We can pay 20% deposit" },
                  { field: "trancheCount", text: "accept 2 tranches" }
                ],
                intent: "counter_offer"
              }),
              usage: {
                input_tokens: 210,
                output_tokens: 40,
                total_tokens: 250
              }
            }),
            { status: 200 }
          )
        );
      }
      throw new Error(`Unexpected fetch URL: ${urlString}`);
    });

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(rawBody), {
      env: {
        OPENAI_API_KEY: "sk-live-counter-extractor",
        RESEND_INBOUND_SIGNING_SECRET: secret,
        RESEND_API_KEY: "test-resend-key"
      },
      fetchImpl,
      nowMs: Number(timestamp) * 1000,
      store: store as never
    });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.objectContaining({ method: "POST" }));
    expect(store.insertCounterOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        extractedTerms: {
          depositPct: 20,
          trancheCount: 2
        },
        source: "email",
        status: "grammar_valid"
      })
    );
    await expect(response.json()).resolves.toEqual({
      emailId: "eml_inbound_123",
      parseStatus: "grammar_valid",
      status: "countered"
    });
  });

  it("fails closed before counter writes when the default live LLM extractor is missing credentials", async () => {
    const store = {
      insertCounterOffer: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      insertInboundMetadata: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      markRoundCountered: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readInboundByEmailId: vi.fn(() => Promise.resolve(undefined)),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      )
    };
    const fetchImpl = vi.fn((url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      if (urlString === "https://api.resend.com/emails/receiving/eml_inbound_123") {
        return Promise.resolve(new Response(JSON.stringify({ text: "We can pay 20% deposit." }), { status: 200 }));
      }
      throw new Error(`Unexpected fetch URL: ${urlString}`);
    });

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(rawBody), {
      env: { RESEND_INBOUND_SIGNING_SECRET: secret, RESEND_API_KEY: "test-resend-key" },
      fetchImpl,
      nowMs: Number(timestamp) * 1000,
      store: store as never
    });

    expect(response.status).toBe(503);
    expect(store.insertInboundMetadata).toHaveBeenCalledOnce();
    expect(store.insertCounterOffer).not.toHaveBeenCalled();
    expect(store.markRoundCountered).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "Credit negotiation inbound live extractor is not configured." });
  });

  it("fails closed without inserting a counter when metadata persistence fails after parsing", async () => {
    const store = {
      insertCounterOffer: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      insertInboundMetadata: vi.fn(() => Promise.reject(new Error("metadata unavailable"))),
      markRoundCountered: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readInboundByEmailId: vi.fn(() => Promise.resolve(undefined)),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      )
    };
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ text: "We can pay 20% deposit and accept 2 tranches." }), { status: 200 }))
    );

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(rawBody), {
      env: { RESEND_INBOUND_SIGNING_SECRET: secret, RESEND_API_KEY: "test-resend-key" },
      extractCounterOffer: vi.fn(() =>
        Promise.resolve({
          citedSpans: [
            { field: "depositPct", text: "20% deposit" },
            { field: "trancheCount", text: "2 tranches" }
          ],
          intent: "counter_offer"
        })
      ),
      fetchImpl,
      nowMs: Number(timestamp) * 1000,
      store: store as never
    });

    expect(response.status).toBe(503);
    expect(store.insertCounterOffer).not.toHaveBeenCalled();
    expect(store.markRoundCountered).not.toHaveBeenCalled();
    const body = await response.text();
    expect(body).not.toContain("20% deposit");
    expect(JSON.parse(body) as unknown).toEqual({ error: "Credit negotiation inbound metadata writer is not configured." });
  });

  it("leaves the sent round retryable when grammar-valid counter insert fails", async () => {
    const store = {
      insertCounterOffer: vi.fn(() => Promise.reject(new Error("counter insert unavailable"))),
      insertInboundMetadata: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      markRoundCountered: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readInboundByEmailId: vi.fn(() => Promise.resolve(undefined)),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      ),
      updateInboundMetadata: vi.fn((row: Record<string, unknown>) => Promise.resolve(row))
    };
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ text: "We can pay 20% deposit and accept 2 tranches." }), { status: 200 }))
    );

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(rawBody), {
      env: { RESEND_INBOUND_SIGNING_SECRET: secret, RESEND_API_KEY: "test-resend-key" },
      extractCounterOffer: vi.fn(() =>
        Promise.resolve({
          citedSpans: [
            { field: "depositPct", text: "20% deposit" },
            { field: "trancheCount", text: "2 tranches" }
          ],
          intent: "counter_offer"
        })
      ),
      fetchImpl,
      nowMs: Number(timestamp) * 1000,
      store: store as never
    });

    expect(response.status).toBe(503);
    expect(store.insertCounterOffer).toHaveBeenCalledOnce();
    expect(store.markRoundCountered).not.toHaveBeenCalled();
    expect(store.updateInboundMetadata).toHaveBeenCalledWith(expect.objectContaining({
      bodyFetchStatus: "failed",
      emailId: "eml_inbound_123"
    }));
    const body = await response.text();
    expect(body).not.toContain("20% deposit");
    expect(JSON.parse(body) as unknown).toEqual({ error: "Credit negotiation inbound persistence failed closed." });
  });

  it("uses Supabase rounds, contacts, and counter-offer ledgers by default", async () => {
    const fetchImpl = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      if (urlString.includes("/rest/v1/credit_negotiation_inbound_emails") && init?.method === "GET") {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (urlString.includes("/rest/v1/credit_negotiation_rounds") && init?.method === "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                account_id: "ACC-HAR",
                order_id: "ORD-HARBOR-6534",
                round_id: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
                round_no: 1,
                status: "sent"
              }
            ]),
            { status: 200 }
          )
        );
      }
      if (urlString.includes("/rest/v1/credit_account_contacts") && init?.method === "GET") {
        return Promise.resolve(new Response(JSON.stringify([{ contact_email: "harbor-ap@example.com" }]), { status: 200 }));
      }
      if (urlString.includes("/rest/v1/credit_negotiation_policy") && init?.method === "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify(
              creditNegotiationPolicyCandidateRows.map((row) => ({
                active: row.active,
                approved_by: row.approvedBy,
                effective_from: row.effectiveFrom,
                key: row.key,
                policy_version: row.policyVersion,
                record_id: row.recordId,
                value_text: row.valueText
              }))
            ),
            { status: 200 }
          )
        );
      }
      if (urlString.includes("/rest/v1/credit_counter_offers") && init?.method === "GET") {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (urlString === "https://api.resend.com/emails/receiving/eml_inbound_123") {
        return Promise.resolve(
          new Response(JSON.stringify({ text: "We can pay 20% deposit and accept 2 tranches." }), {
            status: 200
          })
        );
      }
      if (urlString.includes("/rest/v1/credit_counter_offers") && init?.method === "POST") {
        if (typeof init.body !== "string") {
          throw new TypeError("Expected counter-offer insert body to be JSON.");
        }

        return Promise.resolve(new Response(JSON.stringify([JSON.parse(init.body) as Record<string, unknown>]), { status: 201 }));
      }
      if (urlString.includes("/rest/v1/credit_negotiation_inbound_emails") && init?.method === "POST") {
        if (typeof init.body !== "string") {
          throw new TypeError("Expected inbound metadata insert body to be JSON.");
        }

        return Promise.resolve(new Response(JSON.stringify([JSON.parse(init.body) as Record<string, unknown>]), { status: 201 }));
      }
      if (urlString.includes("/rest/v1/credit_negotiation_rounds") && init?.method === "PATCH") {
        return Promise.resolve(new Response(JSON.stringify([{ status: "countered" }]), { status: 200 }));
      }

      throw new Error(`Unexpected fetch URL: ${urlString}`);
    });

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(rawBody), {
      env: {
        RESEND_API_KEY: "test-resend-key",
        RESEND_INBOUND_RATE_LIMIT_MAX_EVENTS: "10",
        RESEND_INBOUND_RATE_LIMIT_WINDOW_MS: "60000",
        RESEND_INBOUND_SIGNING_SECRET: secret,
        SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      extractCounterOffer: vi.fn(() =>
        Promise.resolve({
          citedSpans: [{ field: "depositPct", text: "We can pay 20% deposit" }],
          intent: "counter_offer"
        })
      ),
      fetchImpl,
      nowMs: Number(timestamp) * 1000
    });

    expect(response.status).toBe(200);
    const calls = fetchImpl.mock.calls.map(([url, init]) => ({
      body: init?.body,
      method: init?.method,
      url: typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url
    }));
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_negotiation_inbound_emails") && call.method === "GET")).toBe(true);
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_negotiation_inbound_emails") && call.method === "POST")).toBe(true);
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_negotiation_rounds") && call.method === "GET")).toBe(true);
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_account_contacts") && call.method === "GET")).toBe(true);
    expect(calls.find((call) => call.url.includes("/rest/v1/credit_account_contacts"))?.url).toContain("role=eq.ap");
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_counter_offers") && call.method === "POST")).toBe(true);
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_negotiation_rounds") && call.method === "PATCH")).toBe(true);
    const counterInsert = calls.find((call) => call.url.includes("/rest/v1/credit_counter_offers") && call.method === "POST");
    expect(counterInsert?.body).toContain("\"message_id\":\"<counter-1@harbor.example>\"");
    expect(JSON.stringify(calls)).not.toContain("supabase-service-secret");
  });

  it("fails closed when the Supabase inbound metadata update touches zero rows", async () => {
    const calls: Array<{ body: BodyInit | null | undefined; method: string | undefined; url: string }> = [];
    const fetchImpl = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      calls.push({ body: init?.body, method: init?.method, url: urlString });
      if (urlString.includes("/rest/v1/credit_negotiation_inbound_emails") && init?.method === "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                account_id: "ACC-HAR",
                body_fetch_status: "failed",
                email_id: "eml_inbound_123",
                from_email: "harbor-ap@example.com",
                message_id: "<counter-1@harbor.example>",
                order_id: "ORD-HARBOR-6534",
                raw_body_hash: "a".repeat(64),
                round_id: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
                round_no: 1,
                source: "email",
                subject: "[Recoup Deal ORD-HARBOR-6534 - Round 1] Counter",
                to_email: "deals+ORD-HARBOR-6534-r1@north-bay.dev"
              }
            ]),
            { status: 200 }
          )
        );
      }
      if (urlString.includes("/rest/v1/credit_counter_offers") && init?.method === "GET") {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (urlString.includes("/rest/v1/credit_negotiation_rounds") && init?.method === "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                account_id: "ACC-HAR",
                order_id: "ORD-HARBOR-6534",
                round_id: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
                round_no: 1,
                status: "sent"
              }
            ]),
            { status: 200 }
          )
        );
      }
      if (urlString.includes("/rest/v1/credit_account_contacts") && init?.method === "GET") {
        return Promise.resolve(new Response(JSON.stringify([{ contact_email: "harbor-ap@example.com" }]), { status: 200 }));
      }
      if (urlString === "https://api.resend.com/emails/receiving/eml_inbound_123") {
        return Promise.resolve(new Response(JSON.stringify({ text: "We can pay 20% deposit and accept 2 tranches." }), { status: 200 }));
      }
      if (urlString.includes("/rest/v1/credit_negotiation_policy") && init?.method === "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify(
              creditNegotiationPolicyCandidateRows.map((row) => ({
                active: row.active,
                approved_by: row.approvedBy,
                effective_from: row.effectiveFrom,
                key: row.key,
                policy_version: row.policyVersion,
                record_id: row.recordId,
                value_text: row.valueText
              }))
            ),
            { status: 200 }
          )
        );
      }
      if (urlString.includes("/rest/v1/credit_negotiation_inbound_emails") && init?.method === "PATCH") {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }

      throw new Error(`Unexpected fetch URL: ${urlString}`);
    });

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(rawBody), {
      env: {
        RESEND_API_KEY: "test-resend-key",
        RESEND_INBOUND_RATE_LIMIT_MAX_EVENTS: "10",
        RESEND_INBOUND_RATE_LIMIT_WINDOW_MS: "60000",
        RESEND_INBOUND_SIGNING_SECRET: secret,
        SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      extractCounterOffer: vi.fn(() =>
        Promise.resolve({
          citedSpans: [
            { field: "depositPct", text: "20% deposit" },
            { field: "trancheCount", text: "2 tranches" }
          ],
          intent: "counter_offer"
        })
      ),
      fetchImpl,
      nowMs: Number(timestamp) * 1000
    });

    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain("20% deposit");
    expect(JSON.parse(body) as unknown).toEqual({ error: "Credit negotiation inbound metadata writer is not configured." });
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_negotiation_inbound_emails") && call.method === "PATCH")).toBe(true);
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_counter_offers") && call.method === "POST")).toBe(false);
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_negotiation_rounds") && call.method === "PATCH")).toBe(false);
    expect(JSON.stringify(calls)).not.toContain("supabase-service-secret");
  });

  it("fails closed after persisting a counter when the Supabase round update touches zero rows", async () => {
    const calls: Array<{ body: BodyInit | null | undefined; method: string | undefined; url: string }> = [];
    const fetchImpl = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      calls.push({ body: init?.body, method: init?.method, url: urlString });
      if (urlString.includes("/rest/v1/credit_negotiation_inbound_emails") && init?.method === "GET") {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (urlString.includes("/rest/v1/credit_negotiation_rounds") && init?.method === "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                account_id: "ACC-HAR",
                order_id: "ORD-HARBOR-6534",
                round_id: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
                round_no: 1,
                status: "sent"
              }
            ]),
            { status: 200 }
          )
        );
      }
      if (urlString.includes("/rest/v1/credit_account_contacts") && init?.method === "GET") {
        return Promise.resolve(new Response(JSON.stringify([{ contact_email: "harbor-ap@example.com" }]), { status: 200 }));
      }
      if (urlString.includes("/rest/v1/credit_negotiation_policy") && init?.method === "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify(
              creditNegotiationPolicyCandidateRows.map((row) => ({
                active: row.active,
                approved_by: row.approvedBy,
                effective_from: row.effectiveFrom,
                key: row.key,
                policy_version: row.policyVersion,
                record_id: row.recordId,
                value_text: row.valueText
              }))
            ),
            { status: 200 }
          )
        );
      }
      if (urlString.includes("/rest/v1/credit_counter_offers") && init?.method === "GET") {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (urlString === "https://api.resend.com/emails/receiving/eml_inbound_123") {
        return Promise.resolve(new Response(JSON.stringify({ text: "We can pay 20% deposit and accept 2 tranches." }), { status: 200 }));
      }
      if (urlString.includes("/rest/v1/credit_negotiation_inbound_emails") && init?.method === "POST") {
        if (typeof init.body !== "string") {
          throw new TypeError("Expected inbound metadata insert body to be JSON.");
        }

        return Promise.resolve(new Response(JSON.stringify([JSON.parse(init.body) as Record<string, unknown>]), { status: 201 }));
      }
      if (urlString.includes("/rest/v1/credit_negotiation_inbound_emails") && init?.method === "PATCH") {
        if (typeof init.body !== "string") {
          throw new TypeError("Expected inbound metadata patch body to be JSON.");
        }

        return Promise.resolve(new Response(JSON.stringify([JSON.parse(init.body) as Record<string, unknown>]), { status: 200 }));
      }
      if (urlString.includes("/rest/v1/credit_counter_offers") && init?.method === "POST") {
        if (typeof init.body !== "string") {
          throw new TypeError("Expected counter-offer insert body to be JSON.");
        }

        return Promise.resolve(new Response(JSON.stringify([JSON.parse(init.body) as Record<string, unknown>]), { status: 201 }));
      }
      if (urlString.includes("/rest/v1/credit_negotiation_rounds") && init?.method === "PATCH") {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }

      throw new Error(`Unexpected fetch URL: ${urlString}`);
    });

    const response = await handleCreditNegotiationInboundPostForTest(signedRequest(rawBody), {
      env: {
        RESEND_API_KEY: "test-resend-key",
        RESEND_INBOUND_RATE_LIMIT_MAX_EVENTS: "10",
        RESEND_INBOUND_RATE_LIMIT_WINDOW_MS: "60000",
        RESEND_INBOUND_SIGNING_SECRET: secret,
        SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      extractCounterOffer: vi.fn(() =>
        Promise.resolve({
          citedSpans: [
            { field: "depositPct", text: "20% deposit" },
            { field: "trancheCount", text: "2 tranches" }
          ],
          intent: "counter_offer"
        })
      ),
      fetchImpl,
      nowMs: Number(timestamp) * 1000
    });

    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain("20% deposit");
    expect(JSON.parse(body) as unknown).toEqual({ error: "Credit negotiation inbound persistence failed closed." });
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_negotiation_rounds") && call.method === "PATCH")).toBe(true);
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_counter_offers") && call.method === "POST")).toBe(true);
    const metadataRevert = calls.find((call) => call.url.includes("/rest/v1/credit_negotiation_inbound_emails") && call.method === "PATCH");
    expect(metadataRevert?.body).toContain("\"body_fetch_status\":\"failed\"");
  });
});
