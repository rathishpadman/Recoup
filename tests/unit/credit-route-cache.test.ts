import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256CanonicalJson } from "../../config/governed.js";
import { buildCreditRiskReviewModel } from "../../src/services/creditRiskModel.js";
import { loadCreditRiskFixtureRows } from "./fixtures/creditRiskFixture.js";
import { GET as getCredit, POST as refreshCredit } from "../../cockpit/app/api/credit/route.js";
import {
  davidCreditRiskReadModelKey,
  readModelCacheHeader
} from "../../cockpit/app/api/read-model-cache.js";
import {
  createSignedDemoSessionValue,
  demoSessionCookieName,
  roleAllowedRoutes,
  roleHomeRoute
} from "../../cockpit/app/demo-auth.js";

const envPatch = {
  RECOUP_API_URL: "http://recoup-api.test",
  RECOUP_COCKPIT_AUTH_TOKEN: "test-human-token",
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead",
  RECOUP_DEMO_SESSION_SECRET: "test-demo-session-secret",
  RECOUP_READ_MODEL_CACHE: "enabled",
  SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
  SUPABASE_URL: "https://recoup.supabase.co"
} as const;

describe("David credit route read-model cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("serves the governed David cache without waiting for Render", async () => {
    stubRouteEnv();
    const cachedModel = buildCreditRiskReviewModel(loadCreditRiskFixtureRows());
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models")) {
        return Promise.resolve(Response.json([{
          generated_at: new Date().toISOString(),
          model_key: davidCreditRiskReadModelKey,
          payload_hash: sha256CanonicalJson(cachedModel),
          payload_json: cachedModel,
          persona: "david",
          source_record_ids_json: ["ACC-HAR", "credit_accounts:ACC-HAR"],
          source_refreshed_at: new Date().toISOString(),
          surface: "credit-risk-review"
        }]));
      }

      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getCredit(davidRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get(readModelCacheHeader)).toBe("hit");
    await expect(response.json()).resolves.toEqual(cachedModel);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.some(([input]) => fetchInputUrl(input) === "http://recoup-api.test/credit/v2")).toBe(false);
  });

  it("rejects a stale David cache row and falls back to the live backend", async () => {
    stubRouteEnv();
    const backendModel = {
      accounts: [{ accountId: "ACC-GRE", verdict: "CLEAR" }],
      surface: "credit-risk-review"
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models")) {
        return Promise.resolve(Response.json([{
          generated_at: "2026-07-10T00:00:00.000Z",
          model_key: davidCreditRiskReadModelKey,
          payload_hash: "a".repeat(64),
          payload_json: { accounts: [{ accountId: "ACC-HAR" }], surface: "credit-risk-review" },
          persona: "david",
          source_record_ids_json: ["ACC-HAR"],
          source_refreshed_at: "2026-07-10T00:00:00.000Z",
          surface: "credit-risk-review"
        }]));
      }
      if (url === "http://recoup-api.test/credit/v2") {
        return Promise.resolve(Response.json(backendModel));
      }
      if (url === "http://recoup-api.test/credit/v2/refresh") {
        return new Promise<Response>(() => {});
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getCredit(davidRequest());

    expect(response.headers.get(readModelCacheHeader)).toBe("miss");
    await expect(response.json()).resolves.toEqual(backendModel);
  });

  it("rejects a cache row whose hash does not match its payload", async () => {
    stubRouteEnv();
    const backendModel = buildCreditRiskReviewModel(loadCreditRiskFixtureRows());
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models")) {
        return Promise.resolve(Response.json([{
          generated_at: new Date().toISOString(),
          model_key: davidCreditRiskReadModelKey,
          payload_hash: "a".repeat(64),
          payload_json: { ...backendModel, portfolio: { totalExposureAmount: 999_999_999 } },
          persona: "david",
          source_record_ids_json: ["ACC-GRE"],
          source_refreshed_at: new Date().toISOString(),
          surface: "credit-risk-review"
        }]));
      }
      if (url === "http://recoup-api.test/credit/v2") {
        return Promise.resolve(Response.json(backendModel));
      }
      if (url === "http://recoup-api.test/credit/v2/refresh") {
        return new Promise<Response>(() => {});
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getCredit(davidRequest());

    expect(response.headers.get(readModelCacheHeader)).toBe("miss");
    await expect(response.json()).resolves.toEqual(backendModel);
  });

  it("rejects a hash-valid but incomplete David payload before the UI dereferences it", async () => {
    stubRouteEnv();
    const incompleteModel = {
      accounts: [cachedAccount("ACC-HAR", "ELEVATED")],
      asOfDate: "2026-07-10",
      portfolio: { totalExposureAmount: 1_240_000 },
      surface: "credit-risk-review"
    };
    const backendModel = buildCreditRiskReviewModel(loadCreditRiskFixtureRows());
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models")) {
        return Promise.resolve(Response.json([{
          generated_at: new Date().toISOString(),
          model_key: davidCreditRiskReadModelKey,
          payload_hash: sha256CanonicalJson(incompleteModel),
          payload_json: incompleteModel,
          persona: "david",
          source_record_ids_json: ["ACC-HAR"],
          source_refreshed_at: new Date().toISOString(),
          surface: "credit-risk-review"
        }]));
      }
      if (url === "http://recoup-api.test/credit/v2") {
        return Promise.resolve(Response.json(backendModel));
      }
      if (url === "http://recoup-api.test/credit/v2/refresh") {
        return new Promise<Response>(() => {});
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getCredit(davidRequest());

    expect(response.headers.get(readModelCacheHeader)).toBe("miss");
  });

  it("rejects hash-valid nested David objects that omit UI-required evidence fields", async () => {
    stubRouteEnv();
    const incompleteModel = structuredClone(buildCreditRiskReviewModel(loadCreditRiskFixtureRows()));
    const firstAccount = incompleteModel.accounts[0];
    if (firstAccount === undefined) {
      throw new Error("Credit fixture must contain at least one account.");
    }
    firstAccount.assessmentSteps = [{}] as typeof firstAccount.assessmentSteps;
    const backendModel = buildCreditRiskReviewModel(loadCreditRiskFixtureRows());
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models")) {
        return Promise.resolve(Response.json([{
          generated_at: new Date().toISOString(),
          model_key: davidCreditRiskReadModelKey,
          payload_hash: sha256CanonicalJson(incompleteModel),
          payload_json: incompleteModel,
          persona: "david",
          source_record_ids_json: ["ACC-CRE"],
          source_refreshed_at: new Date().toISOString(),
          surface: "credit-risk-review"
        }]));
      }
      if (url === "http://recoup-api.test/credit/v2") {
        return Promise.resolve(Response.json(backendModel));
      }
      if (url === "http://recoup-api.test/credit/v2/refresh") {
        return new Promise<Response>(() => {});
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getCredit(davidRequest());

    expect(response.headers.get(readModelCacheHeader)).toBe("miss");
  });

  it("rejects a cache row dated beyond the allowed clock skew", async () => {
    stubRouteEnv();
    const backendModel = buildCreditRiskReviewModel(loadCreditRiskFixtureRows());
    const futureIso = new Date(Date.now() + 10 * 60_000).toISOString();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models")) {
        return Promise.resolve(Response.json([{
          generated_at: futureIso,
          model_key: davidCreditRiskReadModelKey,
          payload_hash: sha256CanonicalJson(backendModel),
          payload_json: backendModel,
          persona: "david",
          source_record_ids_json: ["ACC-GRE"],
          source_refreshed_at: futureIso,
          surface: "credit-risk-review"
        }]));
      }
      if (url === "http://recoup-api.test/credit/v2") {
        return Promise.resolve(Response.json(backendModel));
      }
      if (url === "http://recoup-api.test/credit/v2/refresh") {
        return new Promise<Response>(() => {});
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getCredit(davidRequest());

    expect(response.headers.get(readModelCacheHeader)).toBe("miss");
  });

  it("falls back to Render once when the David cache is absent", async () => {
    stubRouteEnv();
    const backendModel = {
      accounts: [{ accountId: "ACC-CRE", verdict: "HIGH" }],
      surface: "credit-risk-review"
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models")) {
        return Promise.resolve(Response.json([]));
      }
      if (url === "http://recoup-api.test/credit/v2") {
        return Promise.resolve(Response.json(backendModel));
      }
      if (url === "http://recoup-api.test/credit/v2/refresh") {
        return new Promise<Response>(() => {});
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getCredit(davidRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get(readModelCacheHeader)).toBe("miss");
    await expect(response.json()).resolves.toEqual(backendModel);
  });

  it("refreshes the governed David cache before mutation-driven router refresh", async () => {
    stubRouteEnv();
    const refreshedModel = {
      accounts: [{ accountId: "ACC-HAR", verdict: "ELEVATED" }],
      surface: "credit-risk-review"
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(fetchInputUrl(input)).toBe("http://recoup-api.test/credit/v2/refresh");
      expect(init).toMatchObject({ cache: "no-store", method: "POST" });
      return Promise.resolve(Response.json(refreshedModel, {
        headers: { "x-recoup-read-model-cache": "refresh" }
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await refreshCredit(davidRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get(readModelCacheHeader)).toBe("refresh");
    await expect(response.json()).resolves.toEqual(refreshedModel);
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

  return new Request("http://localhost/api/credit", {
    headers: { cookie: `${demoSessionCookieName}=${session}` }
  });
}

function stubRouteEnv(): void {
  for (const [key, value] of Object.entries(envPatch)) {
    vi.stubEnv(key, value);
  }
}

function fetchInputUrl(input: RequestInfo | URL | undefined): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input?.url ?? "";
}

function cachedAccount(accountId: string, verdict: "CLEAR" | "ELEVATED"): Record<string, unknown> {
  return {
    accountId,
    creditLimitAmount: 1_800_000,
    customer: accountId === "ACC-HAR" ? "Harbor Foods" : "Greenleaf Naturals",
    exposureAmount: accountId === "ACC-HAR" ? 1_240_000 : 312_000,
    negotiationOrders: [],
    openDisputeAmount: 8_200,
    openDisputeCount: 1,
    packet: { actionId: `credit-v2:${accountId}`, recordIds: [accountId], rows: [] },
    unsupportedAmount: 0,
    verdict
  };
}
