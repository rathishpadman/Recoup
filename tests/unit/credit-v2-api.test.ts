import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createCockpitApi } from "../../src/services/cockpitApi.js";
import type { SupabaseMemoryFetch } from "../../src/memory/supabaseStore.js";
import { loadCreditRiskFixtureRows } from "./fixtures/creditRiskFixture.js";
import { governedConfigPostgrestRows, rowsForCreditRiskTable } from "./fixtures/creditRiskSupabaseFixture.js";

const cockpitAuthEnv = {
  RECOUP_COCKPIT_ALLOWED_ORIGINS: "http://127.0.0.1:3000",
  RECOUP_COCKPIT_AUTH_TOKEN: "test-human-token",
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead"
} as const;

const cockpitAuthHeaders = {
  "content-type": "application/json",
  "x-recoup-human-principal": cockpitAuthEnv.RECOUP_COCKPIT_HUMAN_PRINCIPAL,
  "x-recoup-human-token": cockpitAuthEnv.RECOUP_COCKPIT_AUTH_TOKEN
} as const;

const governedConfigEnv = {
  SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
  SUPABASE_URL: "https://recoup.supabase.co"
} as const;

describe("GET /credit/v2", () => {
  it("returns the deterministic credit risk review surface from seeded Supabase rows", async () => {
    const calls: string[] = [];
    const { baseUrl, server } = await listen(creditRiskFetcher(calls));

    try {
      const response = await fetch(`${baseUrl}/credit/v2`, {
        headers: cockpitAuthHeaders
      });
      const body = (await response.json()) as {
        accounts: Array<{ accountId: string; verdict: string }>;
        surface: string;
      };

      expect(response.status).toBe(200);
      expect(body.surface).toBe("credit-risk-review");
      expect(body.accounts).toHaveLength(4);
      expect([...body.accounts.map((account) => `${account.accountId}:${account.verdict}`)].sort()).toEqual([
        "ACC-CRE:HIGH",
        "ACC-GRE:CLEAR",
        "ACC-HAR:ELEVATED",
        "ACC-VAL:WATCH"
      ]);
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.stringContaining("/rest/v1/recoup_config"),
          expect.stringContaining("/rest/v1/credit_snapshot"),
          expect.stringContaining("/rest/v1/credit_accounts"),
          expect.stringContaining("/rest/v1/credit_policy")
        ])
      );
    } finally {
      await close(server);
    }
  });

  it("fails closed with a missingSource when credit accounts are unavailable", async () => {
    const { baseUrl, server } = await listen(creditRiskFetcher([], { emptyTables: ["credit_accounts"] }));

    try {
      const response = await fetch(`${baseUrl}/credit/v2`, {
        headers: cockpitAuthHeaders
      });
      const body = (await response.json()) as { error: string; missingSource: string };

      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        error: "Supabase credit risk credit_accounts rows are unavailable or failed validation.",
        missingSource: "supabase-credit-risk-credit_accounts"
      });
    } finally {
      await close(server);
    }
  });
});

async function listen(memoryFetcher: SupabaseMemoryFetch): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer(
    createCockpitApi({
      env: { ...governedConfigEnv, ...cockpitAuthEnv },
      memoryFetcher
    })
  );

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    server
  };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function creditRiskFetcher(
  calls: string[],
  options: { emptyTables?: string[] } = {}
): SupabaseMemoryFetch {
  const fixture = loadCreditRiskFixtureRows();
  const emptyTables = new Set(options.emptyTables ?? []);

  return (url, init) => {
    calls.push(url);
    expect(init?.headers).toMatchObject({
      apikey: "supabase-secret-key",
      authorization: "Bearer supabase-secret-key"
    });

    if (url.includes("/rest/v1/recoup_config")) {
      return Promise.resolve(jsonResponse(governedConfigPostgrestRows()));
    }

    const tableName = new URL(url).pathname.split("/").at(-1);
    if (tableName !== undefined && emptyTables.has(tableName)) {
      return Promise.resolve(jsonResponse([]));
    }

    return Promise.resolve(jsonResponse(rowsForCreditRiskTable(fixture, tableName)));
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status: 200
  });
}
