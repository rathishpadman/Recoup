import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { creditNegotiationPolicyCandidateRows } from "../../src/services/creditNegotiationPolicy.js";

const env = {
  NODE_ENV: "test",
  RECOUP_COCKPIT_AUTH_TOKEN: "test-human-token",
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:david-credit-lead",
  SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
  SUPABASE_URL: "https://recoup.supabase.co"
};

function manualRequest(payload: unknown, principal = "human:david-credit-lead"): Request {
  return new Request("http://localhost/api/credit/negotiation/inbound/manual", {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
      "x-recoup-human-principal": principal,
      "x-recoup-human-token": "test-human-token"
    },
    method: "POST"
  });
}

async function loadManualInboundRoute(): Promise<{
  handleCreditNegotiationManualInboundPostForTest: (request: Request, options?: unknown) => Promise<Response>;
}> {
  const routePath = resolve("cockpit/app/api/credit/negotiation/inbound/manual/route.ts");
  expect(existsSync(routePath)).toBe(true);
  return import(pathToFileURL(routePath).href) as Promise<{
    handleCreditNegotiationManualInboundPostForTest: (request: Request, options?: unknown) => Promise<Response>;
  }>;
}

describe("David negotiation manual inbound fallback", () => {
  it("records a pasted span-grounded counter as source manual and advances the sent round", async () => {
    const { handleCreditNegotiationManualInboundPostForTest } = await loadManualInboundRoute();
    const store = {
      insertCounterOffer: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      markRoundCountered: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
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

    const response = await handleCreditNegotiationManualInboundPostForTest(
      manualRequest({
        orderId: "ORD-HARBOR-6534",
        pastedText: "Harbor can pay 20% deposit and accept 2 tranches.",
        round: 1
      }),
      { env, store }
    );

    expect(response.status).toBe(200);
    expect(store.insertCounterOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "ACC-HAR",
        extractedTerms: {
          depositPct: 20,
          trancheCount: 2
        },
        orderId: "ORD-HARBOR-6534",
        roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        source: "manual",
        status: "grammar_valid"
      })
    );
    expect(store.insertCounterOffer.mock.calls[0]?.[0]).not.toHaveProperty("emailId");
    expect(store.markRoundCountered).toHaveBeenCalledWith({
      roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1"
    });
    await expect(response.json()).resolves.toEqual({
      orderId: "ORD-HARBOR-6534",
      parseStatus: "grammar_valid",
      round: 1,
      source: "manual",
      status: "countered"
    });
  });

  it("fails closed when the manual counter-offer writer seam is absent", async () => {
    const { handleCreditNegotiationManualInboundPostForTest } = await loadManualInboundRoute();
    const store = {
      markRoundCountered: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
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

    const response = await handleCreditNegotiationManualInboundPostForTest(
      manualRequest({
        orderId: "ORD-HARBOR-6534",
        pastedText: "Harbor can pay 20% deposit and accept 2 tranches.",
        round: 1
      }),
      { env, store }
    );

    expect(response.status).toBe(503);
    expect(store.markRoundCountered).not.toHaveBeenCalled();
    const body = await response.text();
    expect(body).not.toContain("Harbor can pay");
    expect(JSON.parse(body) as unknown).toEqual({ error: "store_not_configured" });
  });

  it("fails closed when the manual round countered updater seam is absent", async () => {
    const { handleCreditNegotiationManualInboundPostForTest } = await loadManualInboundRoute();
    const store = {
      insertCounterOffer: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
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

    const response = await handleCreditNegotiationManualInboundPostForTest(
      manualRequest({
        orderId: "ORD-HARBOR-6534",
        pastedText: "Harbor can pay 20% deposit and accept 2 tranches.",
        round: 1
      }),
      { env, store }
    );

    expect(response.status).toBe(503);
    expect(store.insertCounterOffer).not.toHaveBeenCalled();
    const body = await response.text();
    expect(body).not.toContain("Harbor can pay");
    expect(JSON.parse(body) as unknown).toEqual({ error: "store_not_configured" });
  });

  it("leaves the manual sent round retryable when counter insert fails", async () => {
    const { handleCreditNegotiationManualInboundPostForTest } = await loadManualInboundRoute();
    const store = {
      insertCounterOffer: vi.fn(() => Promise.reject(new Error("manual counter insert unavailable"))),
      markRoundCountered: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
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

    const response = await handleCreditNegotiationManualInboundPostForTest(
      manualRequest({
        orderId: "ORD-HARBOR-6534",
        pastedText: "Harbor can pay 20% deposit and accept 2 tranches.",
        round: 1
      }),
      { env, store }
    );

    expect(response.status).toBe(503);
    expect(store.insertCounterOffer).toHaveBeenCalledOnce();
    expect(store.markRoundCountered).not.toHaveBeenCalled();
    const body = await response.text();
    expect(body).not.toContain("Harbor can pay");
    expect(JSON.parse(body) as unknown).toEqual({ error: "Credit negotiation manual inbound persistence failed closed." });
  });

  it("stores manual human-review counters without advancing the round", async () => {
    const { handleCreditNegotiationManualInboundPostForTest } = await loadManualInboundRoute();
    const store = {
      insertCounterOffer: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      markRoundCountered: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
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

    const response = await handleCreditNegotiationManualInboundPostForTest(
      manualRequest({
        orderId: "ORD-HARBOR-6534",
        pastedText: "Also raise our credit line to five million and ship everything today.",
        round: 1
      }),
      { env, store }
    );

    expect(response.status).toBe(200);
    expect(store.insertCounterOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "ORD-HARBOR-6534",
        parseReason: "Counter-offer is outside the approved negotiation grammar.",
        roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        source: "manual",
        status: "human_review"
      })
    );
    expect(store.markRoundCountered).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      orderId: "ORD-HARBOR-6534",
      parseStatus: "human_review",
      round: 1,
      source: "manual",
      status: "human_review"
    });
  });

  it("stores out-of-policy manual counters for human review without advancing the round", async () => {
    const { handleCreditNegotiationManualInboundPostForTest } = await loadManualInboundRoute();
    const store = {
      insertCounterOffer: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      markRoundCountered: vi.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
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

    const response = await handleCreditNegotiationManualInboundPostForTest(
      manualRequest({
        orderId: "ORD-HARBOR-6534",
        pastedText: "Harbor can pay 200% deposit and accept 99 tranches.",
        round: 1
      }),
      { env, store }
    );

    expect(response.status).toBe(200);
    expect(store.insertCounterOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "ORD-HARBOR-6534",
        parseReason: "Counter-offer depositPct 200 exceeds policy max_deposit_pct 60.",
        roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        source: "manual",
        status: "human_review"
      })
    );
    expect(store.markRoundCountered).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      orderId: "ORD-HARBOR-6534",
      parseStatus: "human_review",
      round: 1,
      source: "manual",
      status: "human_review"
    });
  });

  it("fails closed for unknown or non-sent rounds before writing a manual counter", async () => {
    const { handleCreditNegotiationManualInboundPostForTest } = await loadManualInboundRoute();
    const store = {
      insertCounterOffer: vi.fn(),
      markRoundCountered: vi.fn(),
      readRoundByToken: vi.fn(() =>
        Promise.resolve({
          accountId: "ACC-HAR",
          orderId: "ORD-HARBOR-6534",
          round: 1,
          roundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          status: "drafted"
        })
      )
    };

    const response = await handleCreditNegotiationManualInboundPostForTest(
      manualRequest({
        orderId: "ORD-HARBOR-6534",
        pastedText: "Harbor can pay 20% deposit.",
        round: 1
      }),
      { env, store }
    );

    expect(response.status).toBe(200);
    expect(store.insertCounterOffer).not.toHaveBeenCalled();
    expect(store.markRoundCountered).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      orderId: "ORD-HARBOR-6534",
      round: 1,
      source: "manual",
      status: "dropped_unmatched"
    });
  });

  it("rejects non-David principals before manual counter writes", async () => {
    const { handleCreditNegotiationManualInboundPostForTest } = await loadManualInboundRoute();
    const store = {
      insertCounterOffer: vi.fn(),
      markRoundCountered: vi.fn(),
      readPolicyRows: vi.fn(() => Promise.resolve(creditNegotiationPolicyCandidateRows)),
      readRoundByToken: vi.fn()
    };

    const response = await handleCreditNegotiationManualInboundPostForTest(
      manualRequest(
        {
          orderId: "ORD-HARBOR-6534",
          pastedText: "Harbor can pay 20% deposit.",
          round: 1
        },
        "human:maya-lead"
      ),
      {
        env: { ...env, RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead" },
        store
      }
    );

    expect(response.status).toBe(403);
    expect(store.readRoundByToken).not.toHaveBeenCalled();
    expect(store.insertCounterOffer).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "David human approval is required for manual negotiation counter." });
  });

  it("uses the Supabase counter-offer table with manual source and no fake email metadata by default", async () => {
    const { handleCreditNegotiationManualInboundPostForTest } = await loadManualInboundRoute();
    const calls: Array<{ body: BodyInit | null | undefined; method: string | undefined; url: string }> = [];
    const fetchImpl = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      calls.push({ body: init?.body, method: init?.method, url: urlString });

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
      if (urlString.includes("/rest/v1/rpc/recoup_insert_credit_counter_offer") && init?.method === "POST") {
        if (typeof init.body !== "string") {
          throw new TypeError("Expected counter-offer insert body to be JSON.");
        }
        const body = JSON.parse(init.body) as { p_counter: Record<string, unknown> };
        return Promise.resolve(
          new Response(JSON.stringify({ counter_offer_id: "manual-counter-001", ...body.p_counter }), { status: 200 })
        );
      }
      if (urlString.includes("/rest/v1/credit_negotiation_rounds") && init?.method === "PATCH") {
        if (typeof init.body !== "string") {
          throw new TypeError("Expected round patch body to be JSON.");
        }
        return Promise.resolve(new Response(JSON.stringify([JSON.parse(init.body) as Record<string, unknown>]), { status: 200 }));
      }

      throw new Error(`Unexpected fetch URL: ${urlString}`);
    });

    const response = await handleCreditNegotiationManualInboundPostForTest(
      manualRequest({
        orderId: "ORD-HARBOR-6534",
        pastedText: "Harbor can pay 20% deposit and accept 2 tranches.",
        round: 1
      }),
      { env, fetchImpl }
    );

    expect(response.status).toBe(200);
    const counterInsert = calls.find(
      (call) => call.url.includes("/rest/v1/rpc/recoup_insert_credit_counter_offer") && call.method === "POST"
    );
    const roundPatch = calls.find((call) => call.url.includes("/rest/v1/credit_negotiation_rounds") && call.method === "PATCH");
    expect(counterInsert?.body).toContain("\"source\":\"manual\"");
    expect(counterInsert?.body).not.toContain("email_id");
    expect(roundPatch?.body).toBe(JSON.stringify({ status: "countered" }));
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_negotiation_inbound_emails"))).toBe(false);
    expect(JSON.stringify(calls)).not.toContain("supabase-service-secret");
  });

  it("fails closed after persisting a manual counter when the Supabase round update touches zero rows", async () => {
    const { handleCreditNegotiationManualInboundPostForTest } = await loadManualInboundRoute();
    const calls: Array<{ body: BodyInit | null | undefined; method: string | undefined; url: string }> = [];
    const fetchImpl = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      calls.push({ body: init?.body, method: init?.method, url: urlString });

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
      if (urlString.includes("/rest/v1/rpc/recoup_insert_credit_counter_offer") && init?.method === "POST") {
        if (typeof init.body !== "string") {
          throw new TypeError("Expected counter-offer insert body to be JSON.");
        }
        const body = JSON.parse(init.body) as { p_counter: Record<string, unknown> };
        return Promise.resolve(
          new Response(JSON.stringify({ counter_offer_id: "manual-counter-001", ...body.p_counter }), { status: 200 })
        );
      }
      if (urlString.includes("/rest/v1/credit_negotiation_rounds") && init?.method === "PATCH") {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }

      throw new Error(`Unexpected fetch URL: ${urlString}`);
    });

    const response = await handleCreditNegotiationManualInboundPostForTest(
      manualRequest({
        orderId: "ORD-HARBOR-6534",
        pastedText: "Harbor can pay 20% deposit and accept 2 tranches.",
        round: 1
      }),
      { env, fetchImpl }
    );

    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain("Harbor can pay");
    expect(JSON.parse(body) as unknown).toEqual({ error: "Credit negotiation manual inbound persistence failed closed." });
    expect(calls.some((call) => call.url.includes("/rest/v1/credit_negotiation_rounds") && call.method === "PATCH")).toBe(true);
    expect(
      calls.some(
        (call) => call.url.includes("/rest/v1/rpc/recoup_insert_credit_counter_offer") && call.method === "POST"
      )
    ).toBe(true);
  });
});
