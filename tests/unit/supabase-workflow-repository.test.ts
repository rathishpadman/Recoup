import { describe, expect, it, vi } from "vitest";

import { createSupabaseWorkflowRepository } from "../../src/services/supabaseWorkflowRepository.js";
import type { LiveDeductionCase, WorkflowRun } from "../../src/types/workflow.js";

const options = {
  url: "https://example.supabase.co",
  serviceRoleKey: "test-service-role-key"
};

const run: WorkflowRun = {
  runId: "RUN-1",
  workflowName: "cash_application_to_maya",
  workflowVersion: "v1",
  triggerType: "replay_email",
  triggerRecordId: "MSG-1",
  correlationId: "COR-1",
  state: "Received",
  currentPhase: "intake",
  provenanceMode: "replay",
  createdAt: "2026-08-22T09:00:00Z",
  updatedAt: "2026-08-22T09:00:00Z"
};

const liveCase: LiveDeductionCase = {
  caseId: "CASE-abc",
  origin: "live_cash_application",
  runId: "RUN-1",
  customerId: "CUST-001",
  legalEntityId: "LE-001",
  invoiceRecordIds: ["INV-1"],
  remittanceId: "REM-1",
  receiptId: "CR-1001",
  allocationId: "ALLOC-1",
  claimedReason: "DMG",
  validatedReason: "DEP",
  shortPaymentAmount: "250.00",
  currency: "USD",
  status: "Ready",
  policyVersions: { allocation: "demo-allocation-policy-v1-ASSUMED" },
  recordIds: ["REM-SRC-1"],
  provenanceMode: "replay",
  createdAt: "2026-08-22T09:00:00Z"
};

/** The database returns snake_case columns, not the canonical camelCase type. */
const runRow = {
  run_id: "RUN-1",
  workflow_name: "cash_application_to_maya",
  workflow_version: "v1",
  trigger_type: "replay_email",
  trigger_record_id: "MSG-1",
  correlation_id: "COR-1",
  state: "Received",
  current_phase: "intake",
  case_id: null,
  provenance_mode: "replay",
  created_at: "2026-08-22T09:00:00Z",
  updated_at: "2026-08-22T09:00:00Z",
  terminal_at: null
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** Typed so call arguments are known rather than an empty tuple. */
function mockFetcher(response: () => Response): ReturnType<typeof vi.fn<Fetcher>> {
  return vi.fn<Fetcher>(() => Promise.resolve(response()));
}

function callInit(fetcher: ReturnType<typeof vi.fn<Fetcher>>, index = 0): RequestInit {
  const call = fetcher.mock.calls[index];
  if (call === undefined) {
    throw new Error(`no fetcher call at index ${String(index)}`);
  }
  return call[1];
}

function callUrl(fetcher: ReturnType<typeof vi.fn<Fetcher>>, index = 0): string {
  const call = fetcher.mock.calls[index];
  if (call === undefined) {
    throw new Error(`no fetcher call at index ${String(index)}`);
  }
  return call[0];
}

/** Header names are case-insensitive, so assertions must be too. */
function headerValue(init: RequestInit, name: string): string | undefined {
  const entries = Object.entries((init.headers ?? {}) as Record<string, string>);
  return entries.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}

describe("Supabase workflow repository", () => {
  it("authenticates every request with the service role key", async () => {
    const fetcher = mockFetcher(() => jsonResponse([runRow]));
    const repository = createSupabaseWorkflowRepository({ ...options, fetcher });

    await repository.getRun("RUN-1");

    const init = callInit(fetcher);
    expect(headerValue(init, "apikey")).toBe("test-service-role-key");
    expect(headerValue(init, "authorization")).toBe(
      "Bearer test-service-role-key"
    );
  });

  it("writes runs to recoup_workflow_runs", async () => {
    const fetcher = mockFetcher(() => jsonResponse([run]));
    const repository = createSupabaseWorkflowRepository({ ...options, fetcher });

    await repository.createRun(run);

    expect(callUrl(fetcher)).toContain("/rest/v1/recoup_workflow_runs");
    expect(callInit(fetcher).method).toBe("POST");
  });

  it("makes a replayed run a no-op rather than a duplicate-key error", async () => {
    // The run id is deterministic, so a replay collides on the primary key.
    // Upserting is what keeps that a no-op instead of a failure.
    const fetcher = mockFetcher(() => jsonResponse([run]));
    const repository = createSupabaseWorkflowRepository({ ...options, fetcher });

    const created = await repository.createRun(run);

    expect(created.runId).toBe("RUN-1");
    const init = callInit(fetcher);
    expect(headerValue(init, "prefer")).toContain("resolution=merge-duplicates");
  });

  it("appends events without ever issuing an update or delete", async () => {
    const fetcher = mockFetcher(() =>
        jsonResponse([
          {
            cursor_id: 7,
            event_id: "EVT-1",
            run_id: "RUN-1",
            run_sequence: 1,
            correlation_id: "COR-1",
            event_type: "run_received",
            phase: "intake",
            status: "started",
            safe_summary: "accepted",
            record_ids: ["REM-SRC-1"],
            provenance_mode: "replay",
            occurred_at: "2026-08-22T09:00:00Z"
          }
        ])
    );

    const repository = createSupabaseWorkflowRepository({ ...options, fetcher });

    await repository.appendEvent({
      runId: "RUN-1",
      event: {
        eventId: "EVT-1",
        runId: "RUN-1",
        correlationId: "COR-1",
        eventType: "run_received",
        phase: "intake",
        status: "started",
        safeSummary: "accepted",
        recordIds: ["REM-SRC-1"],
        provenanceMode: "replay",
        occurredAt: "2026-08-22T09:00:00Z"
      }
    });

    for (const [, init] of fetcher.mock.calls) {
      expect(["GET", "POST"]).toContain(init.method ?? "GET");
    }
  });

  it("derives the cursor from the database identity rather than a local counter", async () => {
    const fetcher = mockFetcher(() =>
        jsonResponse([
          {
            cursor_id: 42,
            event_id: "EVT-1",
            run_id: "RUN-1",
            run_sequence: 1,
            correlation_id: "COR-1",
            event_type: "run_received",
            phase: "intake",
            status: "started",
            safe_summary: "accepted",
            record_ids: ["REM-SRC-1"],
            provenance_mode: "replay",
            occurred_at: "2026-08-22T09:00:00Z"
          }
        ])
    );

    const repository = createSupabaseWorkflowRepository({ ...options, fetcher });
    const event = await repository.appendEvent({
      runId: "RUN-1",
      event: {
        eventId: "EVT-1",
        runId: "RUN-1",
        correlationId: "COR-1",
        eventType: "run_received",
        phase: "intake",
        status: "started",
        safeSummary: "accepted",
        recordIds: ["REM-SRC-1"],
        provenanceMode: "replay",
        occurredAt: "2026-08-22T09:00:00Z"
      }
    });

    expect(event.cursor).toBe("42");
  });

  it("upserts a case on its primary key so a replay does not duplicate it", async () => {
    const fetcher = mockFetcher(() => jsonResponse([liveCase]));
    const repository = createSupabaseWorkflowRepository({ ...options, fetcher });

    await repository.upsertCase(liveCase);

    const init = callInit(fetcher);
    expect(headerValue(init, "prefer")).toContain("resolution=merge-duplicates");
  });

  it("returns undefined for a missing run rather than throwing", async () => {
    const fetcher = mockFetcher(() => jsonResponse([]));
    const repository = createSupabaseWorkflowRepository({ ...options, fetcher });

    expect(await repository.getRun("RUN-MISSING")).toBeUndefined();
  });

  it("surfaces a genuine database error instead of returning empty", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(jsonResponse({ message: "permission denied" }, 403))
    );
    const repository = createSupabaseWorkflowRepository({ ...options, fetcher });

    await expect(repository.listCases()).rejects.toThrow(/permission denied/u);
  });

  it("never puts a service role key into an error message", async () => {
    const fetcher = mockFetcher(() => jsonResponse({ message: "boom" }, 500));
    const repository = createSupabaseWorkflowRepository({ ...options, fetcher });

    await expect(repository.listCases()).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("test-service-role-key") as unknown as string
      })
    );
  });

  it("reads events after a cursor in ascending order", async () => {
    const fetcher = mockFetcher(() => jsonResponse([]));
    const repository = createSupabaseWorkflowRepository({ ...options, fetcher });

    await repository.readEventsSince("10", 25);

    const requested = callUrl(fetcher);
    expect(requested).toContain("cursor_id=gt.10");
    expect(requested).toContain("order=cursor_id.asc");
    expect(requested).toContain("limit=25");
  });
});
