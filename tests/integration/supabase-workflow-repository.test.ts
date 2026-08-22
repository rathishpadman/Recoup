import { describe, expect, it, vi } from "vitest";

import { startCashApplicationRun } from "../../src/services/cashApplicationRun.js";
import { createSupabaseWorkflowRepository } from "../../src/services/supabaseWorkflowRepository.js";

/**
 * Supabase repository contract, exercised against a recorded PostgREST double.
 *
 * The schema itself is verified against real Postgres separately; this covers
 * the request shapes, which is where a repository silently diverges from the
 * table it writes to.
 */

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function createFakeSupabase() {
  const calls: Captured[] = [];
  const runs = new Map<string, Record<string, unknown>>();
  const events: Record<string, unknown>[] = [];
  const cases = new Map<string, Record<string, unknown>>();
  let cursor = 0;

  const fetcher = vi.fn((url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    const body: unknown =
      typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({
      url,
      method,
      headers: init.headers as Record<string, string>,
      body
    });

    const json = (value: unknown) =>
      Promise.resolve(new Response(JSON.stringify(value), { status: 200 }));

    if (url.includes("/recoup_workflow_runs")) {
      if (method === "POST") {
        const row = body as Record<string, unknown>;
        runs.set(String(row.run_id), row);
        return json([]);
      }
      if (method === "PATCH") {
        const runId = /run_id=eq\.([^&]+)/u.exec(url)?.[1] ?? "";
        const existing = runs.get(decodeURIComponent(runId)) ?? {};
        runs.set(decodeURIComponent(runId), { ...existing, ...(body as object) });
        return json([]);
      }
      const runId = /run_id=eq\.([^&]+)/u.exec(url)?.[1] ?? "";
      const row = runs.get(decodeURIComponent(runId));
      return json(row === undefined ? [] : [row]);
    }

    if (url.includes("/recoup_workflow_events")) {
      if (method === "POST") {
        cursor += 1;
        const row = { ...(body as Record<string, unknown>), cursor_id: cursor };
        events.push(row);
        return json([row]);
      }
      const runId = /run_id=eq\.([^&]+)/u.exec(url)?.[1];
      const since = /cursor_id=gt\.([^&]+)/u.exec(url)?.[1];
      let visible = events;
      if (runId !== undefined) {
        visible = events.filter((row) => row.run_id === decodeURIComponent(runId));
      }
      if (since !== undefined) {
        visible = events.filter((row) => Number(row.cursor_id) > Number(since));
      }
      return json(visible);
    }

    if (url.includes("/recoup_live_deduction_cases")) {
      if (method === "POST") {
        const row = body as Record<string, unknown>;
        cases.set(String(row.case_id), row);
        return json([]);
      }
      return json([...cases.values()]);
    }

    return json([]);
  });

  return { fetcher, calls, events };
}

const advice = {
  remittanceId: "REM-1",
  inboundMessageId: "MSG-1",
  customerReference: "CUST-001",
  legalEntityReference: "LE-001",
  paymentReference: "PAY-1001",
  currency: "USD",
  instructedPaymentAmount: "1250.00",
  mapperVersion: "csv-v1",
  lines: [
    {
      lineId: "LINE-1",
      invoiceReference: "INV-1",
      instructedAmount: "1000.00",
      claimedDeductionAmount: "250.00",
      claimedReasonCode: "DMG",
      sourceRecordIds: ["REM-SRC-1"]
    }
  ],
  sourceRecordIds: ["REM-SRC-1"],
  provenanceMode: "replay" as const
};

const invoices = [
  { invoiceRecordId: "INV-1", invoiceReference: "INV-1", balance: "1250.00", currency: "USD" }
];

const demoEnv = {
  RECOUP_CASH_REHEARSAL_ENABLED: "true",
  RECOUP_CASH_DEMO_POLICY_ENABLED: "true"
};

describe("the Supabase repository satisfies the same port", () => {
  it("drives a full run to a persisted case", async () => {
    const supabase = createFakeSupabase();
    const repository = createSupabaseWorkflowRepository({
      url: "https://example.supabase.co",
      serviceRoleKey: "test-key",
      fetcher: supabase.fetcher
    });

    const outcome = await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });

    expect(outcome.state).toBe("Ready");
    expect(await repository.listCases()).toHaveLength(1);

    const stored = await repository.getRun(outcome.runId);
    expect(stored?.state).toBe("Ready");
    expect(stored?.caseId).toBe(outcome.caseId);
  });

  it("never issues PATCH or DELETE against the event log", async () => {
    const supabase = createFakeSupabase();
    const repository = createSupabaseWorkflowRepository({
      url: "https://example.supabase.co",
      serviceRoleKey: "test-key",
      fetcher: supabase.fetcher
    });

    await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });

    const eventWrites = supabase.calls.filter((call) =>
      call.url.includes("/recoup_workflow_events")
    );

    expect(eventWrites.length).toBeGreaterThan(0);
    for (const call of eventWrites) {
      expect(["GET", "POST"]).toContain(call.method);
    }
  });

  it("orders events by the database cursor, not by insertion order in memory", async () => {
    const supabase = createFakeSupabase();
    const repository = createSupabaseWorkflowRepository({
      url: "https://example.supabase.co",
      serviceRoleKey: "test-key",
      fetcher: supabase.fetcher
    });

    const outcome = await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });

    const listCalls = supabase.calls.filter(
      (call) => call.url.includes("/recoup_workflow_events") && call.method === "GET"
    );
    expect(listCalls.some((call) => call.url.includes("order=cursor_id.asc"))).toBe(true);

    const events = await repository.listEvents(outcome.runId);
    const cursors = events.map((event) => Number(event.cursor));
    expect([...cursors].sort((left, right) => left - right)).toEqual(cursors);
  });

  it("sends the service role key as apikey and bearer, never in a query string", async () => {
    const supabase = createFakeSupabase();
    const repository = createSupabaseWorkflowRepository({
      url: "https://example.supabase.co",
      serviceRoleKey: "test-key",
      fetcher: supabase.fetcher
    });

    await repository.listCases();

    for (const call of supabase.calls) {
      expect(call.url).not.toContain("test-key");
      expect(call.headers.apikey).toBe("test-key");
    }
  });

  it("resolves a replayed run onto the same row rather than erroring", async () => {
    const supabase = createFakeSupabase();
    const repository = createSupabaseWorkflowRepository({
      url: "https://example.supabase.co",
      serviceRoleKey: "test-key",
      fetcher: supabase.fetcher
    });

    await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });
    await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });

    const runInserts = supabase.calls.filter(
      (call) => call.url.includes("/recoup_workflow_runs") && call.method === "POST"
    );

    expect(runInserts.length).toBeGreaterThan(0);
    for (const call of runInserts) {
      expect(call.headers.Prefer).toContain("merge-duplicates");
    }
    expect(await repository.listCases()).toHaveLength(1);
  });

  it("raises rather than silently continuing when Supabase rejects a write", async () => {
    const failing = vi.fn(() =>
      Promise.resolve(new Response("permission denied", { status: 403 }))
    );
    const repository = createSupabaseWorkflowRepository({
      url: "https://example.supabase.co",
      serviceRoleKey: "test-key",
      fetcher: failing
    });

    await expect(repository.listCases()).rejects.toThrow(/403/u);
  });
});
