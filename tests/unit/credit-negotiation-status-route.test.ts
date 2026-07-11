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

  it("returns the latest governed round without exposing email content", async () => {
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
      latestRound: { hasInboundReply: true, round: 2, status: "countered" },
      orderId: "ORD-HARBOR-6534"
    });
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
