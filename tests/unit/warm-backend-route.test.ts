import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getWarmBackend } from "../../cockpit/app/api/cron/warm-backend/route.js";

const envPatch = {
  RECOUP_API_URL: "http://recoup-api.test"
} as const;

describe("Warm backend cron route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("pings the backend health route and returns 200 when it is healthy", async () => {
    stubRouteEnv(envPatch);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(fetchInputUrl(input)).toBe("http://recoup-api.test/healthz");
      expect(init).toMatchObject({ cache: "no-store", method: "GET" });
      return Promise.resolve(Response.json({ status: "ok" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getWarmBackend();
    const body = (await response.json()) as { ok?: boolean };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 504 when the backend health check fails", async () => {
    stubRouteEnv(envPatch);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(fetchInputUrl(input)).toBe("http://recoup-api.test/healthz");
      expect(init).toMatchObject({ cache: "no-store", method: "GET" });
      throw new Error("backend unavailable");
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getWarmBackend();
    const body = (await response.json()) as { ok?: boolean };

    expect(response.status).toBe(504);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function stubRouteEnv(env: Partial<Record<string, string>>): void {
  for (const [key, value] of Object.entries(env)) {
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
