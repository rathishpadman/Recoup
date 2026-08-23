import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import { createCockpitApi } from "../../src/services/cockpitApi.js";
import type { RuntimeEnv } from "../../config/localRuntimeEnv.js";

/**
 * POST /admin/cash-demo-reset clears the cash slice between test cycles.
 *
 * It is the most destructive endpoint in the service, so the guards are the
 * point of these tests rather than the happy path. It must refuse an
 * unauthenticated caller, refuse an unconfirmed request, and not exist at all
 * on a deployment that is not running demo data.
 *
 * The deletion itself is a SECURITY DEFINER function in Postgres, so the tables
 * stay append-only for every other caller and this stays the only way out.
 */

const baseEnv: RuntimeEnv = {
  RECOUP_CASH_ROLLOUT_STAGE: "shadow",
  RECOUP_CASH_REHEARSAL_ENABLED: "true",
  RECOUP_COCKPIT_AUTH_TOKEN: "test-human-token",
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead",
  SUPABASE_URL: "https://stub.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "stub-key"
};

/** What the cockpit proxy mints once it has proven who is asking. */
const adminAuth = {
  "x-recoup-human-principal": "human:maya-lead",
  "x-recoup-human-token": "test-human-token"
};

async function startApi(
  env: RuntimeEnv,
  capture: { calls: { url: string }[] },
  status = 200
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server: Server = createServer(
    createCockpitApi({
      env,
      cashReceiptWriteFetcher: (input: URL | RequestInfo) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        capture.calls.push({ url });
        return Promise.resolve(
          new Response(JSON.stringify({ workflow_runs: 3, receipts: 2 }), { status })
        );
      }
    })
  );
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    close: () => new Promise<void>((resolve) => server.close(() => { resolve(); }))
  };
}

async function post(
  baseUrl: string,
  body: string,
  headers: Record<string, string>
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}/admin/cash-demo-reset`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body
  });

  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

const body = JSON.stringify({ confirm: "reset-cash-demo-data" });

describe("POST /admin/cash-demo-reset", () => {
  it("clears the cash slice and reports what it removed", async () => {
    const capture = { calls: [] as { url: string }[] };
    const api = await startApi(baseEnv, capture);

    try {
      const result = await post(api.baseUrl, body, adminAuth);

      expect(result.status).toBe(200);
      expect(result.json.reset).toBe(true);
      // The counts come from Postgres, not from anything counted here.
      expect(result.json.deleted).toEqual({ workflow_runs: 3, receipts: 2 });
      expect(capture.calls[0]?.url).toContain("reset_cash_application_demo_data");
    } finally {
      await api.close();
    }
  });

  it("refuses an unauthenticated caller", async () => {
    const capture = { calls: [] as { url: string }[] };
    const api = await startApi(baseEnv, capture);

    try {
      const result = await post(api.baseUrl, body, {});

      expect(result.status).toBe(401);
      // Nothing may be deleted before the caller is known.
      expect(capture.calls).toHaveLength(0);
    } finally {
      await api.close();
    }
  });

  it("refuses a wrong admin token", async () => {
    const capture = { calls: [] as { url: string }[] };
    const api = await startApi(baseEnv, capture);

    try {
      const result = await post(api.baseUrl, body, {
        ...adminAuth,
        "x-recoup-human-token": "not-the-token"
      });

      expect(result.status).toBe(401);
      expect(capture.calls).toHaveLength(0);
    } finally {
      await api.close();
    }
  });

  it("requires the caller to spell out what they are doing", async () => {
    const capture = { calls: [] as { url: string }[] };
    const api = await startApi(baseEnv, capture);

    try {
      // A signed but unconfirmed request must not wipe the slice: the phrase is
      // what separates an intentional reset from a stray POST.
      const stray = JSON.stringify({});
      const result = await post(api.baseUrl, stray, adminAuth);

      expect(result.status).toBe(422);
      expect(capture.calls).toHaveLength(0);
    } finally {
      await api.close();
    }
  });

  it("does not exist when rehearsal is off", async () => {
    const capture = { calls: [] as { url: string }[] };
    const api = await startApi({ ...baseEnv, RECOUP_CASH_ROLLOUT_STAGE: "disabled" }, capture);

    try {
      const result = await post(api.baseUrl, body, adminAuth);

      // A deployment that is not running demo data has no demo reset.
      expect(result.status).toBe(404);
      expect(capture.calls).toHaveLength(0);
    } finally {
      await api.close();
    }
  });

  it("reports a failure rather than claiming a reset that did not happen", async () => {
    const capture = { calls: [] as { url: string }[] };
    const api = await startApi(baseEnv, capture, 403);

    try {
      const result = await post(api.baseUrl, body, adminAuth);

      expect(result.status).toBe(502);
      expect(result.json.reset).toBeUndefined();
    } finally {
      await api.close();
    }
  });
});
