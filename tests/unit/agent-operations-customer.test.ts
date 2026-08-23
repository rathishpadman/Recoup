import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { loadAgentOperationsSnapshot } from "../../src/services/agentOperationsReadModel.ts";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.ts";
import type { WorkflowRepository } from "../../src/services/workflowRepository.ts";

/**
 * BRD FR-OPS-06: run detail must resolve the customer the run belongs to.
 *
 * The run projection carried no customer at all, so an operator looking at
 * Agent Operations could not tell whose payment a run was applying. That is the
 * primary triage field on a cash application screen.
 *
 * The customer reference travels on the remittance advice, so the run records
 * it at creation rather than the read model joining back to the advice on every
 * page load.
 */

const exposedEnv = { RECOUP_CASH_ROLLOUT_STAGE: "shadow" };

async function seedRun(
  repository: WorkflowRepository,
  runId: string,
  customerReference?: string
): Promise<void> {
  await repository.createRun({
    runId,
    workflowName: "cash_application_to_maya",
    workflowVersion: "v1",
    triggerType: "replay_email",
    triggerRecordId: `MSG-${runId}`,
    correlationId: `COR-${runId}`,
    state: "Received",
    currentPhase: "intake",
    provenanceMode: "replay",
    createdAt: "2026-08-22T10:00:00.000Z",
    updatedAt: "2026-08-22T10:00:00.000Z",
    ...(customerReference === undefined ? {} : { customerReference })
  });

  await repository.appendEvent({
    runId,
    event: {
      eventId: `EVT-${runId}`,
      runId,
      correlationId: `COR-${runId}`,
      eventType: "run_received",
      phase: "intake",
      status: "ok",
      safeSummary: "remittance advice accepted",
      recordIds: [`REC-${runId}`],
      provenanceMode: "replay",
      occurredAt: "2026-08-22T10:00:01.000Z"
    }
  });
}

describe("agent operations customer attribution", () => {
  it("names the customer the run belongs to", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seedRun(repository, "RUN-1", "CUST-001");

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });

    expect(snapshot.runs[0]?.customer).toBe("CUST-001");
  });

  it("keeps two runs attributed to their own customers", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seedRun(repository, "RUN-1", "CUST-001");
    await seedRun(repository, "RUN-2", "CUST-002");

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });
    const byRun = new Map(snapshot.runs.map((run) => [run.runId, run.customer]));

    expect(byRun.get("RUN-1")).toBe("CUST-001");
    expect(byRun.get("RUN-2")).toBe("CUST-002");
  });

  it("reports no customer rather than an invented one", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seedRun(repository, "RUN-3");

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });

    expect(snapshot.runs[0]?.customer).toBeUndefined();
  });

  it("persists the customer additively on the runs table", () => {
    const sql = readFileSync("docs/supabase-cash-application-schema.sql", "utf8");
    const table = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS recoup_workflow_runs"));

    // Nullable: a run created before this column existed stays readable.
    expect(table.slice(0, table.indexOf(");"))).toContain("customer_reference text");
  });

  it("shows the customer in run details", () => {
    const detail = readFileSync("cockpit/components/agent-operations/run-detail.tsx", "utf8");

    expect(detail).toContain("detail.customer");
  });
});
