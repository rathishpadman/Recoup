import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getWarmBackend } from "../../cockpit/app/api/cron/warm-backend/route.js";

const envPatch = {
  RECOUP_API_URL: "http://recoup-api.test",
  RECOUP_COCKPIT_AUTH_TOKEN: "test-human-token",
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead",
  RECOUP_WARM_BACKEND_SECRET: "test-warm-backend-secret"
} as const;

describe("Warm backend cron route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("refreshes both governed Supabase read models without a separate health wait", async () => {
    stubRouteEnv(envPatch);
    const urls: string[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = fetchInputUrl(input);
      urls.push(url);
      expect(init).toMatchObject({ cache: "no-store", method: "POST" });
      expect(new Headers(init?.headers).get("x-recoup-human-principal")).toBe("human:maya-lead");
      expect(new Headers(init?.headers).get("x-recoup-human-token")).toBe("test-human-token");
      return Promise.resolve(Response.json({ surface: url.includes("credit") ? "credit-risk-review" : "forensics-analyst" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getWarmBackend(warmRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(urls).toEqual([
      "http://recoup-api.test/forensics/refresh",
      "http://recoup-api.test/credit/v2/refresh"
    ]);
  });

  it("returns 401 without the scheduled-refresh bearer secret", async () => {
    stubRouteEnv(envPatch);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await getWarmBackend(new Request("http://localhost/api/cron/warm-backend"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 504 when either governed read-model refresh fails", async () => {
    stubRouteEnv(envPatch);
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = fetchInputUrl(input);
      return Promise.resolve(Response.json({ error: "refresh failed" }, { status: url.includes("credit") ? 503 : 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getWarmBackend(warmRequest());

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the ten-minute GitHub Action authenticated and gated on a completed cache refresh", () => {
    const workflow = readFileSync(".github/workflows/warm-recoup-backend.yml", "utf8");

    expect(workflow).toContain('cron: "*/10 * * * *"');
    expect(workflow).toContain("/api/cron/warm-backend");
    expect(workflow).toContain("secrets.RECOUP_WARM_BACKEND_SECRET");
    expect(workflow).toContain('Authorization: Bearer ${RECOUP_WARM_BACKEND_SECRET}');
    expect(workflow).toContain('warm_refresh "$WARM_BACKEND_URL" "vercel-refresh"');
    expect(workflow).toContain('warm_public "$WARM_BACKEND_FALLBACK_URL" "render-wake"');
    expect(workflow).toContain('warm_refresh "$WARM_BACKEND_URL" "vercel-refresh-after-wake"');
  });
});

function warmRequest(): Request {
  return new Request("http://localhost/api/cron/warm-backend", {
    headers: { authorization: `Bearer ${envPatch.RECOUP_WARM_BACKEND_SECRET}` }
  });
}

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
