import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getNegotiationStatus } from "../../cockpit/app/api/credit/negotiation/status/route.js";
import {
  createSignedDemoSessionValue,
  demoSessionCookieName,
  roleAllowedRoutes,
  roleHomeRoute
} from "../../cockpit/app/demo-auth.js";

const envPatch = {
  RECOUP_COCKPIT_AUTH_TOKEN: "test-human-token",
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead",
  RECOUP_DEMO_SESSION_SECRET: "test-demo-session-secret",
  SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
  SUPABASE_URL: "https://recoup.supabase.co"
} as const;

describe("David negotiation status route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns a valid countered round without exposing email content", async () => {
    stubEnv();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : input.url);
      expect(url.pathname).toBe("/rest/v1/credit_negotiation_rounds");
      expect(url.searchParams.get("order_id")).toBe("eq.ORD-HARBOR-6534");
      expect(url.searchParams.get("order")).toBe("round_no.desc,updated_at.desc");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer supabase-secret-key");
      return Promise.resolve(Response.json([{
        inbound_email_id: "inbound-2",
        round_id: "credit-v2:negotiation:ORD-HARBOR-6534:r2",
        round_no: 2,
        status: "countered",
        updated_at: "2026-07-11T05:30:00.000Z"
      }]));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getNegotiationStatus(davidRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      latestRound: {
        hasInboundReply: true,
        humanReviewRequired: false,
        persistedRoundStatus: "countered",
        round: 2,
        status: "countered",
        statusSource: "credit_negotiation_rounds"
      },
      orderId: "ORD-HARBOR-6534"
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("derives a received human-review reply without mutating the sent round", async () => {
    stubEnv();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : input.url);
      if (url.pathname === "/rest/v1/credit_negotiation_rounds") {
        return Promise.resolve(Response.json([{
          inbound_email_id: null,
          round_id: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          round_no: 1,
          status: "sent",
          updated_at: "2026-07-11T09:42:00.000Z"
        }]));
      }

      expect(url.pathname).toBe("/rest/v1/credit_counter_offers");
      expect(url.searchParams.get("order_id")).toBe("eq.ORD-HARBOR-6534");
      expect(url.searchParams.get("round_id")).toBeNull();
      expect(url.searchParams.get("source")).toBe("eq.email");
      expect(url.searchParams.get("status")).toBe("eq.human_review");
      return Promise.resolve(Response.json([{
        counter_offer_id: "counter-human-review-1",
        created_at: "2026-07-11T09:43:00.000Z",
        round_id: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        source: "email",
        status: "human_review"
      }]));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getNegotiationStatus(davidRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      latestRound: {
        hasInboundReply: true,
        humanReviewRequired: true,
        persistedRoundStatus: "sent",
        round: 1,
        status: "human_review",
        statusSource: "credit_counter_offers"
      },
      orderId: "ORD-HARBOR-6534"
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a sent round waiting when no customer reply exists", async () => {
    stubEnv();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : input.url);
      if (url.pathname === "/rest/v1/credit_negotiation_rounds") {
        return Promise.resolve(Response.json([{
          inbound_email_id: null,
          round_id: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          round_no: 1,
          status: "sent",
          updated_at: "2026-07-11T09:42:00.000Z"
        }]));
      }
      return Promise.resolve(Response.json([]));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getNegotiationStatus(davidRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      latestRound: {
        hasInboundReply: false,
        humanReviewRequired: false,
        persistedRoundStatus: "sent",
        round: 1,
        status: "sent",
        statusSource: "credit_negotiation_rounds"
      }
    });
  });

  it("surfaces an unresolved persisted human-review round when a newer draft exists", async () => {
    stubEnv();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : input.url);
      if (url.pathname === "/rest/v1/credit_negotiation_rounds" && url.searchParams.get("round_id") === null) {
        return Promise.resolve(Response.json([{
          inbound_email_id: null,
          round_id: "credit-v2:negotiation:ORD-HARBOR-6534:r2",
          round_no: 2,
          status: "drafted",
          updated_at: "2026-07-11T09:44:00.000Z"
        }]));
      }
      if (url.pathname === "/rest/v1/credit_counter_offers") {
        expect(url.searchParams.get("round_id")).toBeNull();
        return Promise.resolve(Response.json([{
          counter_offer_id: "counter-human-review-r1",
          created_at: "2026-07-11T09:43:00.000Z",
          round_id: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          source: "email",
          status: "human_review"
        }]));
      }
      expect(url.pathname).toBe("/rest/v1/credit_negotiation_rounds");
      expect(url.searchParams.get("round_id")).toBe("eq.credit-v2:negotiation:ORD-HARBOR-6534:r1");
      return Promise.resolve(Response.json([{
        inbound_email_id: null,
        round_id: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        round_no: 1,
        status: "human_review",
        updated_at: "2026-07-11T09:42:00.000Z"
      }]));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getNegotiationStatus(davidRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      latestRound: {
        hasInboundReply: true,
        humanReviewRequired: true,
        persistedRoundStatus: "human_review",
        round: 1,
        status: "human_review",
        statusSource: "credit_counter_offers"
      }
    });
  });

  it("fails closed when the human-review reply source is unavailable", async () => {
    stubEnv();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input instanceof URL
        ? input
        : new URL(typeof input === "string" ? input : input.url);
      if (url.pathname === "/rest/v1/credit_negotiation_rounds") {
        return Promise.resolve(Response.json([{
          inbound_email_id: null,
          round_id: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
          round_no: 1,
          status: "sent",
          updated_at: "2026-07-11T09:42:00.000Z"
        }]));
      }
      return Promise.resolve(new Response(null, { status: 503 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getNegotiationStatus(davidRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Credit negotiation status source is unavailable." });
  });

  it("rejects unauthenticated status polling before reading Supabase", async () => {
    stubEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await getNegotiationStatus(new Request("http://localhost/api/credit/negotiation/status?orderId=ORD-HARBOR-6534"));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function davidRequest(): Request {
  const session = createSignedDemoSessionValue({
    allowedRoutes: roleAllowedRoutes("david"),
    defaultRoute: roleHomeRoute("david"),
    displayName: "David Kim",
    loginId: "david",
    role: "david"
  }, envPatch.RECOUP_DEMO_SESSION_SECRET);

  return new Request("http://localhost/api/credit/negotiation/status?orderId=ORD-HARBOR-6534", {
    headers: { cookie: `${demoSessionCookieName}=${session}` }
  });
}

function stubEnv(): void {
  for (const [key, value] of Object.entries(envPatch)) {
    vi.stubEnv(key, value);
  }
}
