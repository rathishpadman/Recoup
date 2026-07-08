import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getForensics } from "../../cockpit/app/api/forensics/route.js";
import {
  buildForensicsReadModelBusinessHashes,
  mayaForensicsReadModelKey,
  readModelCacheHeader,
  readModelReceiptHashHeader,
  readModelSourceHashHeader,
  readModelSourceRefreshedAtHeader
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

  it("serves the cached Maya forensics model before triggering a non-blocking refresh", async () => {
    stubRouteEnv(mayaSupabaseEnvPatch);
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
              generated_at: "2026-07-01T01:12:16.319Z",
              model_key: mayaForensicsReadModelKey,
              payload_hash: "a".repeat(64),
              payload_json: cachedModel,
              persona: "maya",
              source_record_ids_json: cachedSourceRecordIds,
              source_refreshed_at: "2026-07-01T01:12:16.319Z",
              surface: "forensics-analyst"
            }
          ])
        );
      }

      expect(url).toBe("http://recoup-api.test/forensics/refresh");
      expect(sawCacheLookup).toBe(true);
      expect(init).toMatchObject({ cache: "no-store", method: "POST" });
      expect(headerValue(init?.headers, "x-recoup-human-principal")).toBe(mayaEnvPatch.RECOUP_COCKPIT_HUMAN_PRINCIPAL);
      expect(headerValue(init?.headers, "x-recoup-human-token")).toBe(mayaEnvPatch.RECOUP_COCKPIT_AUTH_TOKEN);
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
    const body = (await response.json()) as typeof cachedModel;

    expect(response.status).toBe(200);
    expect(response.headers.get(readModelCacheHeader)).toBe("hit");
    expect(response.headers.get(readModelSourceRefreshedAtHeader)).toBe("2026-07-01T01:12:16.319Z");
    expect(response.headers.get(readModelReceiptHashHeader)).toBe(cachedBusinessHashes.receiptHash);
    expect(response.headers.get(readModelSourceHashHeader)).toBe(cachedBusinessHashes.sourceHash);
    expect(body).toEqual(cachedModel);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

function headerValue(headers: HeadersInit | undefined, name: string): string | undefined {
  if (headers === undefined) {
    return undefined;
  }
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }
  if (Array.isArray(headers)) {
    return headers.find(([candidate]) => candidate.toLowerCase() === name.toLowerCase())?.[1];
  }

  return headers[name];
}
