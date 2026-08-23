import { describe, expect, it } from "vitest";

import { loadAgentOperationsSnapshot } from "../../src/services/agentOperationsReadModel.ts";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.ts";
import type { WorkflowRepository } from "../../src/services/workflowRepository.ts";

/**
 * The run table renders nine columns and the read model supplied three, so six
 * of them showed an em dash on every row for every scenario. An operator could
 * not tell when a run started or how long it took.
 *
 * Everything asserted here is derivable from the run projection the repository
 * already returns, so none of it needs a new source. Elapsed is computed in the
 * backend on purpose: the cockpit performs no arithmetic.
 */

const exposedEnv = { RECOUP_CASH_ROLLOUT_STAGE: "shadow" };

async function seed(
  repository: WorkflowRepository,
  input: {
    runId: string;
    state: string;
    createdAt: string;
    updatedAt: string;
    terminalAt?: string;
    eventTimes: string[];
  }
): Promise<void> {
  await repository.createRun({
    runId: input.runId,
    workflowName: "cash_application_to_maya",
    workflowVersion: "v1",
    triggerType: "replay_email",
    triggerRecordId: `MSG-${input.runId}`,
    correlationId: `COR-${input.runId}`,
    state: "Received",
    currentPhase: "intake",
    provenanceMode: "replay",
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    ...(input.terminalAt === undefined ? {} : { terminalAt: input.terminalAt })
  });

  for (const [index, occurredAt] of input.eventTimes.entries()) {
    await repository.appendEvent({
      runId: input.runId,
      event: {
        eventId: `EVT-${input.runId}-${String(index)}`,
        runId: input.runId,
        correlationId: `COR-${input.runId}`,
        eventType: index === 0 ? "run_received" : "phase_completed",
        phase: index === 0 ? "intake" : "allocate",
        status: "ok",
        safeSummary: `step ${String(index)}`,
        recordIds: [`REC-${input.runId}`],
        provenanceMode: "replay",
        occurredAt
      }
    });
  }

  await repository.updateRunState({
    runId: input.runId,
    state: input.state,
    currentPhase: "allocate",
    ...(input.terminalAt === undefined ? {} : { terminalAt: input.terminalAt })
  });
}

describe("agent operations run fields", () => {
  it("reports when a completed run was queued, started and finished", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seed(repository, {
      runId: "RUN-A",
      state: "Ready",
      createdAt: "2026-08-22T10:00:00.000Z",
      updatedAt: "2026-08-22T10:02:31.000Z",
      terminalAt: "2026-08-22T10:02:31.000Z",
      eventTimes: ["2026-08-22T10:00:17.000Z", "2026-08-22T10:02:30.000Z"]
    });

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });
    const [row] = snapshot.runs;

    expect(row?.queuedAt).toBe("2026-08-22T10:00:00.000Z");
    // The first event is when work actually began, not when the run row appeared.
    expect(row?.startedAt).toBe("2026-08-22T10:00:17.000Z");
    expect(row?.completedAt).toBe("2026-08-22T10:02:31.000Z");
  });

  it("computes elapsed in the backend as a formatted string", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seed(repository, {
      runId: "RUN-B",
      state: "Ready",
      createdAt: "2026-08-22T10:00:00.000Z",
      updatedAt: "2026-08-22T10:02:31.000Z",
      terminalAt: "2026-08-22T10:02:31.000Z",
      eventTimes: ["2026-08-22T10:00:00.000Z"]
    });

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });

    // 10:00:00 to 10:02:31 is two minutes thirty-one seconds.
    expect(snapshot.runs[0]?.elapsed).toBe("02:31");
  });

  it("leaves finish and elapsed unset while a run is still in flight", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seed(repository, {
      runId: "RUN-C",
      state: "AwaitingCashReceipt",
      createdAt: "2026-08-22T10:00:00.000Z",
      updatedAt: "2026-08-22T10:00:05.000Z",
      eventTimes: ["2026-08-22T10:00:01.000Z"]
    });

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });
    const [row] = snapshot.runs;

    expect(row?.status).toBe("Waiting");
    expect(row?.completedAt).toBeUndefined();
    // An in-flight elapsed would be stale the moment it rendered.
    expect(row?.elapsed).toBeUndefined();
  });

  it("names the scenario from the workflow rather than leaving it blank", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seed(repository, {
      runId: "RUN-D",
      state: "Ready",
      createdAt: "2026-08-22T10:00:00.000Z",
      updatedAt: "2026-08-22T10:00:10.000Z",
      terminalAt: "2026-08-22T10:00:10.000Z",
      eventTimes: ["2026-08-22T10:00:01.000Z"]
    });

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });

    expect(snapshot.runs[0]?.scenario).toBe("AR Cash App");
  });

  it("carries the run fields onto the roster row for the specialist", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seed(repository, {
      runId: "RUN-E",
      state: "Ready",
      createdAt: "2026-08-22T10:00:00.000Z",
      updatedAt: "2026-08-22T10:00:42.000Z",
      terminalAt: "2026-08-22T10:00:42.000Z",
      eventTimes: ["2026-08-22T10:00:01.000Z"]
    });

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });
    const cash = snapshot.roster.find((entry) => entry.agent === "Cash Application");

    expect(cash?.lastRunId).toBe("RUN-E");
    expect(cash?.lastScenario).toBe("AR Cash App");
    expect(cash?.lastRun).toBe("2026-08-22T10:00:42.000Z");
  });
});
