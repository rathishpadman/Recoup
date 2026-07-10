import { describe, expect, it, vi } from "vitest";
import { handleCreditNegotiationInboundRetryPostForTest } from "../../cockpit/app/api/credit/negotiation/inbound/retry/route.ts";
import {
  retryFailedCreditNegotiationInboundFetchesForTest,
  type CreditNegotiationCounterOfferRow,
  type CreditNegotiationInboundMetadataRow,
  type CreditNegotiationInboundRetryResult,
  type CreditNegotiationInboundStore
} from "../../cockpit/app/api/credit/negotiation/inbound/route.ts";
import { creditNegotiationPolicyCandidateRows } from "../../src/services/creditNegotiationPolicy.js";

describe("David negotiation inbound retry worker", () => {
  it("requires a retry secret before cron can trigger failed inbound body refetches", async () => {
    const response = await handleCreditNegotiationInboundRetryPostForTest(
      new Request("http://localhost/api/credit/negotiation/inbound/retry", { method: "POST" }),
      { env: {} }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Credit negotiation inbound retry is not configured." });
  });

  it("runs the retry worker for an authenticated cron request with an explicit batch limit", async () => {
    const store = {
      readFailedInboundMetadata: vi.fn((limit: number) => {
        expect(limit).toBeGreaterThan(0);
        return Promise.resolve([] as CreditNegotiationInboundMetadataRow[]);
      }),
      updateInboundMetadata: vi.fn((row: CreditNegotiationInboundMetadataRow) => Promise.resolve(row))
    } satisfies CreditNegotiationInboundStore;

    const response = await handleCreditNegotiationInboundRetryPostForTest(
      new Request("http://localhost/api/credit/negotiation/inbound/retry", {
        headers: { authorization: "Bearer retry-secret" },
        method: "POST"
      }),
      {
        env: {
          CREDIT_NEGOTIATION_INBOUND_RETRY_LIMIT: "7",
          CREDIT_NEGOTIATION_INBOUND_RETRY_SECRET: "retry-secret",
          RESEND_API_KEY: "test-resend-key"
        },
        store
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      attempted: 0,
      countered: 0,
      failed: 0,
      humanReview: 0,
      skipped: 0,
      storedMetadata: 0
    });
    expect(store.readFailedInboundMetadata).toHaveBeenCalledWith(7);
  });

  it("refetches failed inbound bodies and advances only after grounded policy-valid parsing", async () => {
    const failedMetadata: CreditNegotiationInboundMetadataRow = {
      accountId: "ACC-HAR",
      bodyFetchStatus: "failed" as const,
      emailId: "eml_failed_retry",
      from: "harbor-ap@example.com",
      messageId: "<retry-counter@harbor.example>",
      orderId: "ORD-HARBOR-6534",
      rawBodyHash: "a".repeat(64),
      round: 1,
      roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      source: "email" as const,
      subject: "[Recoup Deal ORD-HARBOR-6534 - Round 1] Counter",
      to: "deals+ORD-HARBOR-6534-r1@north-bay.dev"
    };
    const store = {
      insertCounterOffer: vi.fn((row: CreditNegotiationCounterOfferRow) => Promise.resolve(row)),
      markRoundCountered: vi.fn((row: { emailId?: string | undefined; roundId: string }) => Promise.resolve(row)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readFailedInboundMetadata: vi.fn(() => Promise.resolve([failedMetadata])),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      ),
      updateInboundMetadata: vi.fn((row: CreditNegotiationInboundMetadataRow) => Promise.resolve(row))
    } satisfies CreditNegotiationInboundStore;
    const fetchImpl = vi.fn((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      expect(url).toBe("https://api.resend.com/emails/receiving/eml_failed_retry");
      return Promise.resolve(new Response(JSON.stringify({ text: "We can pay 30% deposit over 2 tranches." }), { status: 200 }));
    });

    const result: CreditNegotiationInboundRetryResult = await retryFailedCreditNegotiationInboundFetchesForTest({
      env: { RESEND_API_KEY: "test-resend-key" },
      extractCounterOffer: vi.fn(() =>
        Promise.resolve({
          citedSpans: [
            { field: "depositPct", text: "30% deposit" },
            { field: "trancheCount", text: "2 tranches" }
          ],
          intent: "counter_offer"
        })
      ),
      fetchImpl,
      limit: 5,
      store
    });

    expect(result).toEqual({ attempted: 1, countered: 1, failed: 0, humanReview: 0, skipped: 0, storedMetadata: 0 });
    const updatedMetadata = store.updateInboundMetadata.mock.calls[0]?.[0];
    expect(updatedMetadata).toMatchObject({
      bodyFetchStatus: "fetched",
      emailId: "eml_failed_retry"
    });
    expect(updatedMetadata?.textBodyHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(store.insertCounterOffer).toHaveBeenCalledWith(expect.objectContaining({
      emailId: "eml_failed_retry",
      messageId: "<retry-counter@harbor.example>",
      source: "email",
      status: "grammar_valid"
    }));
    expect(store.markRoundCountered).toHaveBeenCalledWith({
      emailId: "eml_failed_retry",
      roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1"
    });
  });

  it("leaves failed metadata retryable without inserting a counter when metadata update fails after parsing", async () => {
    const failedMetadata: CreditNegotiationInboundMetadataRow = {
      accountId: "ACC-HAR",
      bodyFetchStatus: "failed",
      emailId: "eml_retry_metadata_write_failed",
      from: "harbor-ap@example.com",
      messageId: "<retry-metadata-write-failed@harbor.example>",
      orderId: "ORD-HARBOR-6534",
      rawBodyHash: "a".repeat(64),
      round: 1,
      roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      source: "email",
      subject: "[Recoup Deal ORD-HARBOR-6534 - Round 1] Counter",
      to: "deals+ORD-HARBOR-6534-r1@north-bay.dev"
    };
    const store = {
      insertCounterOffer: vi.fn((row: CreditNegotiationCounterOfferRow) => Promise.resolve(row)),
      markRoundCountered: vi.fn((row: { emailId?: string | undefined; roundId: string }) => Promise.resolve(row)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readFailedInboundMetadata: vi.fn(() => Promise.resolve([failedMetadata])),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      ),
      updateInboundMetadata: vi.fn(() => Promise.reject(new Error("metadata update unavailable")))
    } satisfies CreditNegotiationInboundStore;
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ text: "We can pay 30% deposit over 2 tranches." }), { status: 200 })));

    const result = await retryFailedCreditNegotiationInboundFetchesForTest({
      env: { RESEND_API_KEY: "test-resend-key" },
      extractCounterOffer: vi.fn(() =>
        Promise.resolve({
          citedSpans: [
            { field: "depositPct", text: "30% deposit" },
            { field: "trancheCount", text: "2 tranches" }
          ],
          intent: "counter_offer"
        })
      ),
      fetchImpl,
      limit: 5,
      store
    });

    expect(result).toEqual({ attempted: 1, countered: 0, failed: 1, humanReview: 0, skipped: 0, storedMetadata: 0 });
    expect(store.updateInboundMetadata).toHaveBeenCalledWith(expect.objectContaining({
      bodyFetchStatus: "fetched",
      emailId: "eml_retry_metadata_write_failed"
    }));
    expect(store.insertCounterOffer).not.toHaveBeenCalled();
    expect(store.markRoundCountered).not.toHaveBeenCalled();
  });

  it("leaves the failed metadata retryable when counter insert fails after parsing", async () => {
    const failedMetadata: CreditNegotiationInboundMetadataRow = {
      accountId: "ACC-HAR",
      bodyFetchStatus: "failed",
      emailId: "eml_retry_counter_insert_failed",
      from: "harbor-ap@example.com",
      messageId: "<retry-counter-insert-failed@harbor.example>",
      orderId: "ORD-HARBOR-6534",
      rawBodyHash: "a".repeat(64),
      round: 1,
      roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      source: "email",
      subject: "[Recoup Deal ORD-HARBOR-6534 - Round 1] Counter",
      to: "deals+ORD-HARBOR-6534-r1@north-bay.dev"
    };
    const store = {
      insertCounterOffer: vi.fn(() => Promise.reject(new Error("counter insert unavailable"))),
      markRoundCountered: vi.fn((row: { emailId?: string | undefined; roundId: string }) => Promise.resolve(row)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readFailedInboundMetadata: vi.fn(() => Promise.resolve([failedMetadata])),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      ),
      updateInboundMetadata: vi.fn((row: CreditNegotiationInboundMetadataRow) => Promise.resolve(row))
    } satisfies CreditNegotiationInboundStore;
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ text: "We can pay 30% deposit over 2 tranches." }), { status: 200 })));

    const result = await retryFailedCreditNegotiationInboundFetchesForTest({
      env: { RESEND_API_KEY: "test-resend-key" },
      extractCounterOffer: vi.fn(() =>
        Promise.resolve({
          citedSpans: [
            { field: "depositPct", text: "30% deposit" },
            { field: "trancheCount", text: "2 tranches" }
          ],
          intent: "counter_offer"
        })
      ),
      fetchImpl,
      limit: 5,
      store
    });

    expect(result).toEqual({ attempted: 1, countered: 0, failed: 1, humanReview: 0, skipped: 0, storedMetadata: 0 });
    expect(store.updateInboundMetadata).toHaveBeenNthCalledWith(1, expect.objectContaining({
      bodyFetchStatus: "fetched",
      emailId: "eml_retry_counter_insert_failed"
    }));
    expect(store.updateInboundMetadata).toHaveBeenLastCalledWith(expect.objectContaining({
      bodyFetchStatus: "failed",
      emailId: "eml_retry_counter_insert_failed"
    }));
    expect(store.insertCounterOffer).toHaveBeenCalledOnce();
    expect(store.markRoundCountered).not.toHaveBeenCalled();
  });

  it("reverts failed metadata to retryable when the round update fails after counter insert", async () => {
    const failedMetadata: CreditNegotiationInboundMetadataRow = {
      accountId: "ACC-HAR",
      bodyFetchStatus: "failed",
      emailId: "eml_retry_round_update_failed",
      from: "harbor-ap@example.com",
      messageId: "<retry-round-update-failed@harbor.example>",
      orderId: "ORD-HARBOR-6534",
      rawBodyHash: "a".repeat(64),
      round: 1,
      roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      source: "email",
      subject: "[Recoup Deal ORD-HARBOR-6534 - Round 1] Counter",
      to: "deals+ORD-HARBOR-6534-r1@north-bay.dev"
    };
    const store = {
      insertCounterOffer: vi.fn((row: CreditNegotiationCounterOfferRow) => Promise.resolve(row)),
      markRoundCountered: vi.fn(() => Promise.reject(new Error("round update unavailable"))),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readFailedInboundMetadata: vi.fn(() => Promise.resolve([failedMetadata])),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      ),
      updateInboundMetadata: vi.fn((row: CreditNegotiationInboundMetadataRow) => Promise.resolve(row))
    } satisfies CreditNegotiationInboundStore;
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ text: "We can pay 30% deposit over 2 tranches." }), { status: 200 })));

    const result = await retryFailedCreditNegotiationInboundFetchesForTest({
      env: { RESEND_API_KEY: "test-resend-key" },
      extractCounterOffer: vi.fn(() =>
        Promise.resolve({
          citedSpans: [
            { field: "depositPct", text: "30% deposit" },
            { field: "trancheCount", text: "2 tranches" }
          ],
          intent: "counter_offer"
        })
      ),
      fetchImpl,
      limit: 5,
      store
    });

    expect(result).toEqual({ attempted: 1, countered: 0, failed: 1, humanReview: 0, skipped: 0, storedMetadata: 0 });
    expect(store.insertCounterOffer).toHaveBeenCalledOnce();
    expect(store.markRoundCountered).toHaveBeenCalledWith({
      emailId: "eml_retry_round_update_failed",
      roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1"
    });
    expect(store.updateInboundMetadata).toHaveBeenNthCalledWith(1, expect.objectContaining({
      bodyFetchStatus: "fetched",
      emailId: "eml_retry_round_update_failed"
    }));
    expect(store.updateInboundMetadata).toHaveBeenLastCalledWith(expect.objectContaining({
      bodyFetchStatus: "failed",
      emailId: "eml_retry_round_update_failed"
    }));
  });

  it("treats a Supabase inbound metadata zero-row retry update as a failed write", async () => {
    const calls: Array<{ body: BodyInit | null | undefined; method: string | undefined; url: string }> = [];
    const fetchImpl = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ body: init?.body, method: init?.method, url });
      if (url.includes("/rest/v1/credit_negotiation_inbound_emails") && init?.method === "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                account_id: "ACC-HAR",
                body_fetch_status: "failed",
                email_id: "eml_retry_zero_row_update",
                from_email: "harbor-ap@example.com",
                message_id: "<retry-zero-row-update@harbor.example>",
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
      if (url.includes("/rest/v1/credit_counter_offers") && init?.method === "GET") {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes("/rest/v1/credit_negotiation_rounds") && init?.method === "GET") {
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
      if (url.includes("/rest/v1/credit_account_contacts") && init?.method === "GET") {
        return Promise.resolve(new Response(JSON.stringify([{ contact_email: "harbor-ap@example.com" }]), { status: 200 }));
      }
      if (url === "https://api.resend.com/emails/receiving/eml_retry_zero_row_update") {
        return Promise.resolve(new Response(JSON.stringify({ text: "We can pay 30% deposit over 2 tranches." }), { status: 200 }));
      }
      if (url.includes("/rest/v1/credit_negotiation_policy") && init?.method === "GET") {
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
      if (url.includes("/rest/v1/credit_negotiation_inbound_emails") && init?.method === "PATCH") {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const result = await retryFailedCreditNegotiationInboundFetchesForTest({
      env: {
        RESEND_API_KEY: "test-resend-key",
        SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      extractCounterOffer: vi.fn(() =>
        Promise.resolve({
          citedSpans: [
            { field: "depositPct", text: "30% deposit" },
            { field: "trancheCount", text: "2 tranches" }
          ],
          intent: "counter_offer"
        })
      ),
      fetchImpl,
      limit: 5
    });

    expect(result).toEqual({ attempted: 1, countered: 0, failed: 1, humanReview: 0, skipped: 0, storedMetadata: 0 });
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_negotiation_inbound_emails") && call.method === "PATCH")).toBe(true);
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_counter_offers") && call.method === "POST")).toBe(false);
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_negotiation_rounds") && call.method === "PATCH")).toBe(false);
    expect(JSON.stringify(calls)).not.toContain("supabase-service-secret");
  });

  it("fails closed when retry reaches a missing counter-offer writer seam", async () => {
    const failedMetadata: CreditNegotiationInboundMetadataRow = {
      accountId: "ACC-HAR",
      bodyFetchStatus: "failed",
      emailId: "eml_missing_retry_writer",
      from: "harbor-ap@example.com",
      messageId: "<retry-missing-writer@harbor.example>",
      orderId: "ORD-HARBOR-6534",
      rawBodyHash: "a".repeat(64),
      round: 1,
      roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      source: "email",
      subject: "[Recoup Deal ORD-HARBOR-6534 - Round 1] Counter",
      to: "deals+ORD-HARBOR-6534-r1@north-bay.dev"
    };
    const store = {
      markRoundCountered: vi.fn((row: { emailId?: string | undefined; roundId: string }) => Promise.resolve(row)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readFailedInboundMetadata: vi.fn(() => Promise.resolve([failedMetadata])),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      ),
      updateInboundMetadata: vi.fn((row: CreditNegotiationInboundMetadataRow) => Promise.resolve(row))
    } satisfies CreditNegotiationInboundStore;
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ text: "We can pay 30% deposit over 2 tranches." }), { status: 200 })));

    const response = await handleCreditNegotiationInboundRetryPostForTest(
      new Request("http://localhost/api/credit/negotiation/inbound/retry", {
        headers: { authorization: "Bearer retry-secret" },
        method: "POST"
      }),
      {
        env: {
          CREDIT_NEGOTIATION_INBOUND_RETRY_LIMIT: "5",
          CREDIT_NEGOTIATION_INBOUND_RETRY_SECRET: "retry-secret",
          RESEND_API_KEY: "test-resend-key"
        },
        extractCounterOffer: vi.fn(() =>
          Promise.resolve({
            citedSpans: [
              { field: "depositPct", text: "30% deposit" },
              { field: "trancheCount", text: "2 tranches" }
            ],
            intent: "counter_offer"
          })
        ),
        fetchImpl,
        store
      }
    );

    expect(response.status).toBe(503);
    expect(store.markRoundCountered).not.toHaveBeenCalled();
    expect(store.updateInboundMetadata).not.toHaveBeenCalled();
    const body = await response.text();
    expect(body).not.toContain("30% deposit");
    expect(JSON.parse(body) as unknown).toEqual({ error: "store_not_configured" });
  });

  it("fails closed when retry reaches a missing round countered updater seam", async () => {
    const failedMetadata: CreditNegotiationInboundMetadataRow = {
      accountId: "ACC-HAR",
      bodyFetchStatus: "failed",
      emailId: "eml_missing_retry_updater",
      from: "harbor-ap@example.com",
      messageId: "<retry-missing-updater@harbor.example>",
      orderId: "ORD-HARBOR-6534",
      rawBodyHash: "a".repeat(64),
      round: 1,
      roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      source: "email",
      subject: "[Recoup Deal ORD-HARBOR-6534 - Round 1] Counter",
      to: "deals+ORD-HARBOR-6534-r1@north-bay.dev"
    };
    const store = {
      insertCounterOffer: vi.fn((row: CreditNegotiationCounterOfferRow) => Promise.resolve(row)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readFailedInboundMetadata: vi.fn(() => Promise.resolve([failedMetadata])),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      ),
      updateInboundMetadata: vi.fn((row: CreditNegotiationInboundMetadataRow) => Promise.resolve(row))
    } satisfies CreditNegotiationInboundStore;
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ text: "We can pay 30% deposit over 2 tranches." }), { status: 200 })));

    const response = await handleCreditNegotiationInboundRetryPostForTest(
      new Request("http://localhost/api/credit/negotiation/inbound/retry", {
        headers: { authorization: "Bearer retry-secret" },
        method: "POST"
      }),
      {
        env: {
          CREDIT_NEGOTIATION_INBOUND_RETRY_LIMIT: "5",
          CREDIT_NEGOTIATION_INBOUND_RETRY_SECRET: "retry-secret",
          RESEND_API_KEY: "test-resend-key"
        },
        extractCounterOffer: vi.fn(() =>
          Promise.resolve({
            citedSpans: [
              { field: "depositPct", text: "30% deposit" },
              { field: "trancheCount", text: "2 tranches" }
            ],
            intent: "counter_offer"
          })
        ),
        fetchImpl,
        store
      }
    );

    expect(response.status).toBe(503);
    expect(store.insertCounterOffer).not.toHaveBeenCalled();
    expect(store.updateInboundMetadata).not.toHaveBeenCalled();
    const body = await response.text();
    expect(body).not.toContain("30% deposit");
    expect(JSON.parse(body) as unknown).toEqual({ error: "store_not_configured" });
  });

  it("leaves failed metadata retryable when parsing cannot produce a governed counter", async () => {
    const failedMetadata: CreditNegotiationInboundMetadataRow = {
      accountId: "ACC-HAR",
      bodyFetchStatus: "failed",
      emailId: "eml_unparsed_retry",
      from: "harbor-ap@example.com",
      messageId: "<retry-unparsed@harbor.example>",
      orderId: "ORD-HARBOR-6534",
      rawBodyHash: "a".repeat(64),
      round: 1,
      roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      source: "email",
      subject: "[Recoup Deal ORD-HARBOR-6534 - Round 1] Counter",
      to: "deals+ORD-HARBOR-6534-r1@north-bay.dev"
    };
    const store = {
      insertCounterOffer: vi.fn((row: CreditNegotiationCounterOfferRow) => Promise.resolve(row)),
      markRoundCountered: vi.fn((row: { emailId?: string | undefined; roundId: string }) => Promise.resolve(row)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readFailedInboundMetadata: vi.fn(() => Promise.resolve([failedMetadata])),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      ),
      updateInboundMetadata: vi.fn((row: CreditNegotiationInboundMetadataRow) => Promise.resolve(row))
    } satisfies CreditNegotiationInboundStore;
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ text: "Please call me." }), { status: 200 })));

    const result = await retryFailedCreditNegotiationInboundFetchesForTest({
      env: { RESEND_API_KEY: "test-resend-key" },
      extractCounterOffer: vi.fn(() => Promise.resolve(undefined)),
      fetchImpl,
      limit: 5,
      store
    });

    expect(result).toEqual({ attempted: 1, countered: 0, failed: 1, humanReview: 0, skipped: 0, storedMetadata: 0 });
    expect(store.updateInboundMetadata).not.toHaveBeenCalled();
    expect(store.insertCounterOffer).not.toHaveBeenCalled();
    expect(store.markRoundCountered).not.toHaveBeenCalled();
  });

  it("repairs a sent round when a durable grammar-valid counter offer already exists", async () => {
    const failedMetadata: CreditNegotiationInboundMetadataRow = {
      accountId: "ACC-HAR",
      bodyFetchStatus: "failed",
      emailId: "eml_already_countered_repair",
      from: "harbor-ap@example.com",
      messageId: "<retry-already-countered-repair@harbor.example>",
      orderId: "ORD-HARBOR-6534",
      rawBodyHash: "a".repeat(64),
      round: 1,
      roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      source: "email",
      subject: "[Recoup Deal ORD-HARBOR-6534 - Round 1] Counter",
      to: "deals+ORD-HARBOR-6534-r1@north-bay.dev"
    };
    const store = {
      insertCounterOffer: vi.fn((row: CreditNegotiationCounterOfferRow) => Promise.resolve(row)),
      markRoundCountered: vi.fn((row: { emailId?: string | undefined; roundId: string }) => Promise.resolve(row)),
      readCounterOfferByEmailId: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          emailId: "eml_already_countered_repair",
          orderId: "ORD-HARBOR-6534",
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          source: "email" as const,
          status: "grammar_valid" as const
        })
      ),
      readFailedInboundMetadata: vi.fn(() => Promise.resolve([failedMetadata])),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      ),
      updateInboundMetadata: vi.fn((row: CreditNegotiationInboundMetadataRow) => Promise.resolve(row))
    } satisfies CreditNegotiationInboundStore;
    const fetchImpl = vi.fn();

    const result = await retryFailedCreditNegotiationInboundFetchesForTest({
      env: { RESEND_API_KEY: "test-resend-key" },
      fetchImpl,
      limit: 5,
      store
    });

    expect(result).toEqual({ attempted: 1, countered: 1, failed: 0, humanReview: 0, skipped: 0, storedMetadata: 0 });
    expect(store.readCounterOfferByEmailId).toHaveBeenCalledWith("eml_already_countered_repair");
    expect(store.readRoundByToken).toHaveBeenCalledWith({ orderId: "ORD-HARBOR-6534", round: 1 });
    expect(store.markRoundCountered).toHaveBeenCalledWith({
      emailId: "eml_already_countered_repair",
      roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1"
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.insertCounterOffer).not.toHaveBeenCalled();
    expect(store.updateInboundMetadata).not.toHaveBeenCalled();
  });

  it("skips failed metadata when the durable human-review counter offer already exists", async () => {
    const failedMetadata: CreditNegotiationInboundMetadataRow = {
      accountId: "ACC-HAR",
      bodyFetchStatus: "failed",
      emailId: "eml_already_countered",
      from: "harbor-ap@example.com",
      messageId: "<retry-already-countered@harbor.example>",
      orderId: "ORD-HARBOR-6534",
      rawBodyHash: "a".repeat(64),
      round: 1,
      roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      source: "email",
      subject: "[Recoup Deal ORD-HARBOR-6534 - Round 1] Counter",
      to: "deals+ORD-HARBOR-6534-r1@north-bay.dev"
    };
    const store = {
      insertCounterOffer: vi.fn((row: CreditNegotiationCounterOfferRow) => Promise.resolve(row)),
      markRoundCountered: vi.fn((row: { emailId?: string | undefined; roundId: string }) => Promise.resolve(row)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readCounterOfferByEmailId: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          emailId: "eml_already_countered",
          orderId: "ORD-HARBOR-6534",
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          source: "email" as const,
          status: "human_review" as const
        })
      ),
      readFailedInboundMetadata: vi.fn(() => Promise.resolve([failedMetadata])),
      readRoundByToken: vi.fn(),
      updateInboundMetadata: vi.fn((row: CreditNegotiationInboundMetadataRow) => Promise.resolve(row))
    } satisfies CreditNegotiationInboundStore;
    const fetchImpl = vi.fn();

    const result = await retryFailedCreditNegotiationInboundFetchesForTest({
      env: { RESEND_API_KEY: "test-resend-key" },
      fetchImpl,
      limit: 5,
      store
    });

    expect(result).toEqual({ attempted: 1, countered: 0, failed: 0, humanReview: 0, skipped: 1, storedMetadata: 0 });
    expect(store.readCounterOfferByEmailId).toHaveBeenCalledWith("eml_already_countered");
    expect(store.readRoundByToken).not.toHaveBeenCalled();
    expect(store.readContactForOrder).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.insertCounterOffer).not.toHaveBeenCalled();
    expect(store.markRoundCountered).not.toHaveBeenCalled();
    expect(store.updateInboundMetadata).not.toHaveBeenCalled();
  });

  it("skips stale or closed rounds without fetching the provider body", async () => {
    const failedMetadata: CreditNegotiationInboundMetadataRow = {
      accountId: "ACC-HAR",
      bodyFetchStatus: "failed",
      emailId: "eml_closed_retry",
      from: "harbor-ap@example.com",
      orderId: "ORD-HARBOR-6534",
      rawBodyHash: "a".repeat(64),
      round: 1,
      roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      source: "email",
      subject: "[Recoup Deal ORD-HARBOR-6534 - Round 1] Counter",
      to: "deals+ORD-HARBOR-6534-r1@north-bay.dev"
    };
    const store = {
      insertCounterOffer: vi.fn((row: CreditNegotiationCounterOfferRow) => Promise.resolve(row)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readFailedInboundMetadata: vi.fn(() => Promise.resolve([failedMetadata])),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "closed"
        })
      ),
      updateInboundMetadata: vi.fn((row: CreditNegotiationInboundMetadataRow) => Promise.resolve(row))
    } satisfies CreditNegotiationInboundStore;
    const fetchImpl = vi.fn();

    const result = await retryFailedCreditNegotiationInboundFetchesForTest({
      env: { RESEND_API_KEY: "test-resend-key" },
      fetchImpl,
      limit: 5,
      store
    });

    expect(result).toEqual({ attempted: 1, countered: 0, failed: 0, humanReview: 0, skipped: 1, storedMetadata: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.readContactForOrder).not.toHaveBeenCalled();
    expect(store.updateInboundMetadata).not.toHaveBeenCalled();
    expect(store.insertCounterOffer).not.toHaveBeenCalled();
  });

  it("skips unauthorized senders without fetching the provider body", async () => {
    const failedMetadata: CreditNegotiationInboundMetadataRow = {
      accountId: "ACC-HAR",
      bodyFetchStatus: "failed",
      emailId: "eml_spoofed_retry",
      from: "not-harbor@example.com",
      orderId: "ORD-HARBOR-6534",
      rawBodyHash: "a".repeat(64),
      round: 1,
      roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      source: "email",
      subject: "[Recoup Deal ORD-HARBOR-6534 - Round 1] Counter",
      to: "deals+ORD-HARBOR-6534-r1@north-bay.dev"
    };
    const store = {
      insertCounterOffer: vi.fn((row: CreditNegotiationCounterOfferRow) => Promise.resolve(row)),
      readContactForOrder: vi.fn(() => Promise.resolve({ contactEmail: "harbor-ap@example.com" })),
      readFailedInboundMetadata: vi.fn(() => Promise.resolve([failedMetadata])),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "sent"
        })
      ),
      updateInboundMetadata: vi.fn((row: CreditNegotiationInboundMetadataRow) => Promise.resolve(row))
    } satisfies CreditNegotiationInboundStore;
    const fetchImpl = vi.fn();

    const result = await retryFailedCreditNegotiationInboundFetchesForTest({
      env: { RESEND_API_KEY: "test-resend-key" },
      fetchImpl,
      limit: 5,
      store
    });

    expect(result).toEqual({ attempted: 1, countered: 0, failed: 0, humanReview: 0, skipped: 1, storedMetadata: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.updateInboundMetadata).not.toHaveBeenCalled();
    expect(store.insertCounterOffer).not.toHaveBeenCalled();
  });
});
