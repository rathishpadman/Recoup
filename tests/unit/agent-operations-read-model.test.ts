import { describe, expect, it } from "vitest";

import { loadAgentOperationsSnapshot } from "../../src/services/agentOperationsReadModel.ts";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.ts";
import type { WorkflowRepository } from "../../src/services/workflowRepository.ts";
import type { WorkflowEventType } from "../../src/types/workflow.ts";

/**
 * The Agent Operations route rendered a hardcoded empty snapshot, so the
 * projections in liveCaseReadModel were never reached from the cockpit and no
 * run could ever appear on the screen. These assert the loader that closes
 * that gap.
 *
 * The fail-closed default is the part worth protecting: with the capability
 * off, the loader must return the empty snapshot rather than the rows it could
 * perfectly well have read.
 */

const exposedEnv = { RECOUP_CASH_ROLLOUT_STAGE: "shadow" };

async function seedRun(
  repository: WorkflowRepository,
  input: {
    runId: string;
    state: string;
    phase: string;
    events: { eventType: WorkflowEventType; phase: string; status: string }[];
    caseId?: string;
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
    createdAt: "2026-08-22T10:00:00.000Z",
    updatedAt: "2026-08-22T10:00:00.000Z"
  });

  for (const [index, event] of input.events.entries()) {
    await repository.appendEvent({
      runId: input.runId,
      event: {
        eventId: `EVT-${input.runId}-${String(index)}`,
        runId: input.runId,
        correlationId: `COR-${input.runId}`,
        eventType: event.eventType,
        phase: event.phase,
        status: event.status,
        safeSummary: `${event.eventType} ${event.phase}`,
        recordIds: [`REC-${input.runId}`],
        provenanceMode: "replay",
        occurredAt: `2026-08-22T10:0${String(index)}:00.000Z`
      }
    });
  }

  await repository.updateRunState({
    runId: input.runId,
    state: input.state,
    currentPhase: input.phase,
    ...(input.caseId === undefined ? {} : { caseId: input.caseId })
  });
}

describe("loadAgentOperationsSnapshot", () => {
  it("returns the empty snapshot when the capability is not exposed", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seedRun(repository, {
      runId: "RUN-1",
      state: "Ready",
      phase: "handoff",
      events: [{ eventType: "run_received", phase: "intake", status: "started" }]
    });

    // The rows exist and are readable. The capability gate is the only reason
    // they must not appear.
    const snapshot = await loadAgentOperationsSnapshot({ repository, env: {} });

    expect(snapshot.runs).toEqual([]);
    expect(snapshot.events).toEqual([]);
    expect(snapshot.counts).toEqual({ active: 0, queued: 0, waiting: 0, needsAttention: 0 });
    expect(snapshot.roster).toHaveLength(4);
  });

  it("returns the empty snapshot when the kill switch is engaged at an exposed stage", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seedRun(repository, {
      runId: "RUN-1",
      state: "Ready",
      phase: "handoff",
      events: [{ eventType: "run_received", phase: "intake", status: "started" }]
    });

    const snapshot = await loadAgentOperationsSnapshot({
      repository,
      env: { ...exposedEnv, RECOUP_CASH_KILL_AGENT_OPS_UI: "true" }
    });

    expect(snapshot.runs).toEqual([]);
  });

  it("projects a run into a row once the capability is exposed", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seedRun(repository, {
      runId: "RUN-1",
      state: "Ready",
      phase: "handoff",
      caseId: "CASE-1",
      events: [
        { eventType: "run_received", phase: "intake", status: "started" },
        { eventType: "case_created", phase: "handoff", status: "completed" }
      ]
    });

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });

    expect(snapshot.runs).toHaveLength(1);
    expect(snapshot.runs[0]?.runId).toBe("RUN-1");
    expect(snapshot.runs[0]?.caseId).toBe("CASE-1");
    expect(snapshot.runs[0]?.agent).toBe("cash_application");
    expect(snapshot.runs[0]?.provenanceMode).toBe("replay");
    expect(snapshot.runs[0]?.blocked).toBe(false);
    // The backend decides the display status. A Ready run has finished, so it
    // reads Completed rather than the cockpit inferring that from a timestamp.
    expect(snapshot.runs[0]?.status).toBe("Completed");
  });

  it("counts a waiting run as waiting and a blocked run as needing attention", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seedRun(repository, {
      runId: "RUN-WAIT",
      state: "AwaitingCashReceipt",
      phase: "validate",
      events: [
        { eventType: "run_received", phase: "intake", status: "started" },
        { eventType: "phase_waiting", phase: "validate", status: "awaiting_receipt" }
      ]
    });
    await seedRun(repository, {
      runId: "RUN-BLOCKED",
      state: "Review",
      phase: "validate",
      events: [
        { eventType: "run_received", phase: "intake", status: "started" },
        { eventType: "phase_blocked", phase: "validate", status: "not_settled" }
      ]
    });

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });

    expect(snapshot.counts.waiting).toBe(1);
    expect(snapshot.counts.needsAttention).toBe(1);
    expect(snapshot.runs).toHaveLength(2);

    const waiting = snapshot.runs.find((row) => row.runId === "RUN-WAIT");
    const blocked = snapshot.runs.find((row) => row.runId === "RUN-BLOCKED");
    expect(waiting?.status).toBe("Waiting");
    expect(waiting?.blocked).toBe(false);
    expect(blocked?.status).toBe("Blocked");
    expect(blocked?.blocked).toBe(true);
  });

  it("counts a run that has emitted no event as queued rather than dropping it", async () => {
    const repository = createInMemoryWorkflowRepository();
    await repository.createRun({
      runId: "RUN-QUEUED",
      workflowName: "cash_application_to_maya",
      workflowVersion: "v1",
      triggerType: "replay_email",
      triggerRecordId: "MSG-QUEUED",
      correlationId: "COR-QUEUED",
      state: "Received",
      currentPhase: "intake",
      provenanceMode: "replay",
      createdAt: "2026-08-22T10:00:00.000Z",
      updatedAt: "2026-08-22T10:00:00.000Z"
    });

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });

    // projectAgentOperations returns undefined without an event, so a run that
    // exists but has not started must still be accounted for somewhere.
    expect(snapshot.counts.queued).toBe(1);
  });

  it("carries the event ledger and the cursor through unchanged", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seedRun(repository, {
      runId: "RUN-1",
      state: "Ready",
      phase: "handoff",
      events: [
        { eventType: "run_received", phase: "intake", status: "started" },
        { eventType: "phase_started", phase: "validate", status: "started" }
      ]
    });

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });

    expect(snapshot.events).toHaveLength(2);
    // Order is the order they happened; the loader never sorts or reverses.
    expect(snapshot.events[0]?.eventType).toBe("run_received");
    expect(snapshot.events[1]?.eventType).toBe("phase_started");
    expect(snapshot.cursor).toBe(snapshot.events.at(-1)?.cursor);
    // The ledger carries the backend-formatted time, so the cockpit never
    // formats a date of its own.
    expect(snapshot.events[0]?.time).toBe("2026-08-22T10:00:00.000Z");
    expect(snapshot.events[0]?.recordIds).toEqual(["REC-RUN-1"]);
  });

  it("reflects a run in flight on the roster rather than reporting every agent idle", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seedRun(repository, {
      runId: "RUN-WAIT",
      state: "AwaitingCashReceipt",
      phase: "validate",
      events: [
        { eventType: "run_received", phase: "intake", status: "started" },
        { eventType: "phase_waiting", phase: "validate", status: "awaiting_receipt" }
      ]
    });

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });

    // A screen showing "Waiting 1" beside a roster of four idle agents reads as
    // broken, and invites the reader to distrust both halves.
    const cashApplication = snapshot.roster.find((row) => row.agent === "Cash Application");
    expect(cashApplication?.status).toBe("Waiting");
    expect(cashApplication?.lastRunId).toBe("RUN-WAIT");

    // The specialists with no run of their own stay idle.
    expect(snapshot.roster.find((row) => row.agent === "Maya Queue")?.status).toBe("Idle");
  });

  it("leaves every agent idle when the capability is not exposed", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seedRun(repository, {
      runId: "RUN-WAIT",
      state: "AwaitingCashReceipt",
      phase: "validate",
      events: [{ eventType: "phase_waiting", phase: "validate", status: "awaiting_receipt" }]
    });

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: {} });

    expect(snapshot.roster.every((row) => row.status === "Idle")).toBe(true);
  });
});
