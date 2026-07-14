import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getForensics } from "../../cockpit/app/api/forensics/route.js";
import {
  buildForensicsReadModelBusinessHashes,
  mayaForensicsReadModelKey,
  readModelCacheHeader,
  readModelReceiptHashHeader,
  readModelSourceHashHeader,
  readModelSourceRefreshedAtHeader,
  scheduledReadModelMaxAgeMs
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
  RECOUP_READ_MODEL_CACHE: "disabled"
} as const;

const mayaEnvPatch = {
  ...envPatch,
  RECOUP_DEMO_SESSION_SECRET: "test-demo-session-secret"
} as const;

const mayaSupabaseEnvPatch = {
  ...mayaEnvPatch,
  RECOUP_READ_MODEL_CACHE: "enabled",
  SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
  SUPABASE_URL: "https://recoup.supabase.co"
} as const;

describe("Forensics route read-model cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("keeps scheduled read models usable for one hackathon demo day when the refresh schedule slips", () => {
    expect(scheduledReadModelMaxAgeMs).toBe(24 * 60 * 60 * 1_000);
  });

  it("serves the cached Maya forensics model without contending with the scheduled refresh", async () => {
    stubRouteEnv(mayaSupabaseEnvPatch);
    const cachedAt = new Date().toISOString();
    const cachedModel = {
      selected: { lineId: "S6-L1" },
      surface: "forensics-analyst",
      worklist: [{ lineId: "S6-L1" }]
    };
    const cachedSourceRecordIds = ["S6-L1", "recoup_deduction_lines"];
    const cachedBusinessHashes = buildForensicsReadModelBusinessHashes(cachedSourceRecordIds);
    let sawCacheLookup = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models")) {
        sawCacheLookup = true;
        expect(init).toMatchObject({ method: "GET" });
        return Promise.resolve(
          Response.json([
            {
              generated_at: cachedAt,
              model_key: mayaForensicsReadModelKey,
              payload_hash: "a".repeat(64),
              payload_json: cachedModel,
              persona: "maya",
              source_record_ids_json: cachedSourceRecordIds,
              source_refreshed_at: cachedAt,
              surface: "forensics-analyst"
            }
          ])
        );
      }

      throw new Error(`Unexpected cache-hit fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getForensics(
      new Request("http://localhost/api/forensics", {
        headers: {
          cookie: `${demoSessionCookieName}=${createMayaSessionCookie()}`
        },
        method: "GET"
      })
    );
    const body = (await response.json()) as typeof cachedModel;

    expect(response.status).toBe(200);
    expect(response.headers.get(readModelCacheHeader)).toBe("hit");
    expect(response.headers.get(readModelSourceRefreshedAtHeader)).toBe(cachedAt);
    expect(response.headers.get(readModelReceiptHashHeader)).toBe(cachedBusinessHashes.receiptHash);
    expect(response.headers.get(readModelSourceHashHeader)).toBe(cachedBusinessHashes.sourceHash);
    expect(body).toEqual(cachedModel);
    expect(sawCacheLookup).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bypasses an expired Maya cache row and self-heals through the live backend", async () => {
    stubRouteEnv(mayaSupabaseEnvPatch);
    const staleAt = new Date(Date.now() - scheduledReadModelMaxAgeMs - 1).toISOString();
    const cachedModel = { selected: { lineId: "STALE-LINE" }, surface: "forensics-analyst", worklist: [] };
    const backendModel = {
      selected: { lineId: "S6-L1" },
      surface: "forensics-analyst",
      worklist: [{ lineId: "S6-L1" }]
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models")) {
        return Promise.resolve(Response.json([{
          generated_at: staleAt,
          model_key: mayaForensicsReadModelKey,
          payload_hash: "a".repeat(64),
          payload_json: cachedModel,
          persona: "maya",
          source_record_ids_json: ["STALE-LINE"],
          source_refreshed_at: staleAt,
          surface: "forensics-analyst"
        }]));
      }
      if (url === "http://recoup-api.test/forensics") {
        return Promise.resolve(Response.json(backendModel));
      }
      if (url === "http://recoup-api.test/forensics/refresh") {
        return new Promise<Response>(() => {});
      }

      throw new Error(`Unexpected stale-cache fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getForensics(
      new Request("http://localhost/api/forensics", {
        headers: { cookie: `${demoSessionCookieName}=${createMayaSessionCookie()}` },
        method: "GET"
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get(readModelCacheHeader)).toBe("miss");
    expect(await response.json()).toEqual(backendModel);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("proxies the backend on a cache miss and kicks a background refresh", async () => {
    stubRouteEnv(mayaSupabaseEnvPatch);
    const backendModel = {
      selected: { lineId: "S6-L1" },
      surface: "forensics-analyst",
      worklist: [{ lineId: "S6-L1" }]
    };
    let sawCacheLookup = false;
    let sawBackendRead = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models")) {
        sawCacheLookup = true;
        expect(init).toMatchObject({ method: "GET" });
        return Promise.resolve(Response.json([]));
      }
      if (url === "http://recoup-api.test/forensics") {
        sawBackendRead = true;
        expect(sawCacheLookup).toBe(true);
        expect(init).toMatchObject({ cache: "no-store", method: "GET" });
        return Promise.resolve(Response.json(backendModel));
      }

      expect(url).toBe("http://recoup-api.test/forensics/refresh");
      expect(sawBackendRead).toBe(true);
      expect(init).toMatchObject({ cache: "no-store", method: "POST" });
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getForensics(
      new Request("http://localhost/api/forensics", {
        headers: {
          cookie: `${demoSessionCookieName}=${createMayaSessionCookie()}`
        },
        method: "GET"
      })
    );
    const body = (await response.json()) as typeof backendModel;

    expect(response.status).toBe(200);
    expect(response.headers.get(readModelCacheHeader)).toBe("miss");
    expect(body).toEqual(backendModel);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("still returns the documented 502 when the backend is unavailable on a cache miss", async () => {
    stubRouteEnv(mayaSupabaseEnvPatch);
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models")) {
        return Promise.resolve(Response.json([]));
      }
      if (url === "http://recoup-api.test/forensics") {
        throw new Error("backend unavailable");
      }

      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getForensics(
      new Request("http://localhost/api/forensics", {
        headers: {
          cookie: `${demoSessionCookieName}=${createMayaSessionCookie()}`
        },
        method: "GET"
      })
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.error).toBe("Forensics workbench service unavailable.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves upstream stale cache semantics and business hashes on a cache miss", async () => {
    stubRouteEnv(mayaSupabaseEnvPatch);
    const backendModel = {
      selected: { lineId: "S6-L1" },
      surface: "forensics-analyst",
      worklist: [{ lineId: "S6-L1" }]
    };
    let sawBackendRead = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models")) {
        return Promise.resolve(Response.json([]));
      }
      if (url === "http://recoup-api.test/forensics") {
        sawBackendRead = true;
        expect(init).toMatchObject({ cache: "no-store", method: "GET" });
        return Promise.resolve(
          Response.json(backendModel, {
            headers: {
              [readModelCacheHeader]: "stale",
              [readModelReceiptHashHeader]: "b".repeat(64),
              [readModelSourceHashHeader]: "a".repeat(64)
            }
          })
        );
      }

      expect(url).toBe("http://recoup-api.test/forensics/refresh");
      expect(sawBackendRead).toBe(true);
      expect(init).toMatchObject({ cache: "no-store", method: "POST" });
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getForensics(
      new Request("http://localhost/api/forensics", {
        headers: {
          cookie: `${demoSessionCookieName}=${createMayaSessionCookie()}`
        },
        method: "GET"
      })
    );
    const body = (await response.json()) as typeof backendModel;

    expect(response.status).toBe(200);
    expect(response.headers.get(readModelCacheHeader)).toBe("stale");
    expect(response.headers.get(readModelReceiptHashHeader)).toBe("b".repeat(64));
    expect(response.headers.get(readModelSourceHashHeader)).toBe("a".repeat(64));
    expect(body).toEqual(backendModel);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

function stubRouteEnv(env: Partial<Record<string, string>> = envPatch): void {
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
}

function createMayaSessionCookie(): string {
  return createSignedDemoSessionValue(
    {
      allowedRoutes: roleAllowedRoutes("maya"),
      defaultRoute: roleHomeRoute("maya"),
      displayName: "Maya Patel",
      loginId: "Maya",
      role: "maya"
    },
    mayaEnvPatch.RECOUP_DEMO_SESSION_SECRET
  );
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
