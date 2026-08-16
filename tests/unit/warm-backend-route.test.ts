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

  it("refreshes all first-paint governed read models without a separate health wait", async () => {
    stubRouteEnv(envPatch);
    const urls: string[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = fetchInputUrl(input);
      urls.push(url);
      expect(init).toMatchObject({
        cache: "no-store",
        method: url.endsWith("/connectors") ? "GET" : "POST"
      });
      expect(new Headers(init?.headers).get("x-recoup-human-principal")).toBe("human:maya-lead");
      expect(new Headers(init?.headers).get("x-recoup-human-token")).toBe("test-human-token");
      return Promise.resolve(Response.json({ surface: url.includes("credit") ? "credit-risk-review" : "forensics-analyst" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getWarmBackend(warmRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ ok: true });
    // The three primary refreshes still run first and there is still no separate health wait. The
    // trailing /forensics read is the worklist lookup used to rebuild the per-work-item models.
    expect(urls).toEqual([
      "http://recoup-api.test/forensics/refresh",
      "http://recoup-api.test/connectors",
      "http://recoup-api.test/credit/v2/refresh",
      "http://recoup-api.test/forensics"
    ]);
  });

  it("rebuilds the per-work-item read models so a shape change cannot survive a warm cycle", async () => {
    stubRouteEnv(envPatch);
    const urls: string[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = fetchInputUrl(input);
      urls.push(url);
      if (url.endsWith("/forensics")) {
        return Promise.resolve(
          Response.json({ surface: "forensics-analyst", worklist: [{ lineId: "S3-L1" }, { lineId: "S5-L1" }] })
        );
      }

      return Promise.resolve(Response.json({ surface: url.includes("credit") ? "credit-risk-review" : "forensics-analyst" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getWarmBackend(warmRequest());

    expect(response.status).toBe(200);
    // Per-work-item models are lazily built and never refreshed by the primary endpoints, so a
    // deploy that changes their shape left stale payloads serving until someone opened each case.
    expect(urls.some((url) => url.endsWith("/api/forensics/work-items/S3-L1"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/api/forensics/work-items/S5-L1"))).toBe(true);
  });

  it("uses a default warm timeout long enough for a free Render cold start", async () => {
    vi.useFakeTimers();
    stubRouteEnv(envPatch);
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    let settled = false;
    const responsePromise = getWarmBackend(warmRequest()).then((response) => {
      settled = true;

      return response;
    });

    await vi.advanceTimersByTimeAsync(45_001);
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(75_000);
    await Promise.resolve();
    expect(settled).toBe(true);
    const response = await responsePromise;

    expect(response.status).toBe(504);
    expect(fetchMock).toHaveBeenCalledTimes(3);
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
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("declares a Render cron that reliably invokes the Vercel warm endpoint", () => {
    const renderYaml = readFileSync("render.yaml", "utf8");

    expect(renderYaml).toMatch(/^\s*name:\s+recoup-vercel-warm-backend\s*$/mu);
    expect(renderYaml).toMatch(/^\s*schedule:\s+"(?:\*\/10|0\/10) \* \* \* \*"\s*$/mu);
    expect(renderYaml).toContain("RECOUP_WARM_BACKEND_URL");
    expect(renderYaml).toContain("https://recoup-self-eta.vercel.app/api/cron/warm-backend");
    expect(renderYaml).toContain("RECOUP_WARM_BACKEND_SECRET");
    expect(renderYaml).toContain("npm run warm:backend");
  });

  it("keeps the ten-minute GitHub Action authenticated and gated on a completed cache refresh", () => {
    const workflow = readFileSync(".github/workflows/warm-recoup-backend.yml", "utf8");

    expect(workflow).toContain('cron: "3,13,23,33,43,53 * * * *"');
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
