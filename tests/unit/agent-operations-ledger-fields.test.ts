import { describe, expect, it } from "vitest";

import { loadAgentOperationsSnapshot } from "../../src/services/agentOperationsReadModel.ts";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.ts";
import type { WorkflowRepository } from "../../src/services/workflowRepository.ts";

/**
 * BRD FR-OPS-04: the ledger shows timestamp, specialist, phase, safe action
 * summary, approved tool/source, cited record IDs and outcome.
 *
 * Time, phase, summary and record IDs already travel. Specialist and outcome
 * were on the event and dropped by the read model, so the ledger could not show
 * who acted or how it turned out.
 */

const exposedEnv = { RECOUP_CASH_ROLLOUT_STAGE: "shadow" };

async function seed(repository: WorkflowRepository): Promise<void> {
  await repository.createRun({
    runId: "RUN-1",
    workflowName: "cash_application_to_maya",
    workflowVersion: "v1",
    triggerType: "replay_email",
    triggerRecordId: "MSG-1",
    correlationId: "COR-1",
    state: "Received",
    currentPhase: "intake",
    provenanceMode: "replay",
    createdAt: "2026-08-22T10:00:00.000Z",
    updatedAt: "2026-08-22T10:00:00.000Z"
  });

  await repository.appendEvent({
    runId: "RUN-1",
    event: {
      eventId: "EVT-1",
      runId: "RUN-1",
      correlationId: "COR-1",
      eventType: "agent_started",
      phase: "validate",
      specialist: "cash_application",
      status: "started",
      safeSummary: "resolving cash receipt",
      recordIds: ["REC-1"],
      provenanceMode: "replay",
      occurredAt: "2026-08-22T10:00:01.000Z"
    }
  });

  await repository.appendEvent({
    runId: "RUN-1",
    event: {
      eventId: "EVT-2",
      runId: "RUN-1",
      correlationId: "COR-1",
      eventType: "phase_completed",
      phase: "allocate",
      status: "balanced",
      safeSummary: "allocated 1000.00 USD",
      recordIds: ["REC-1", "INV-1"],
      provenanceMode: "replay",
      occurredAt: "2026-08-22T10:00:02.000Z"
    }
  });
}

describe("agent operations ledger fields", () => {
  it("names the specialist that acted", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seed(repository);

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });

    expect(snapshot.events[0]?.specialist).toBe("cash_application");
  });

  it("reports the outcome of each event", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seed(repository);

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });

    expect(snapshot.events[0]?.outcome).toBe("started");
    expect(snapshot.events[1]?.outcome).toBe("balanced");
  });

  it("leaves the specialist unset rather than guessing one", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seed(repository);

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });

    // The second event carries no specialist, and inventing one would put a
    // name against work nothing recorded a name for.
    expect(snapshot.events[1]?.specialist).toBeUndefined();
  });

  it("tells the operator what an in-flight agent is doing", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seed(repository);

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });
    const cash = snapshot.roster.find((entry) => entry.agent === "Cash Application");

    // The run has not reached a terminal state, so the roster reports the most
    // recent thing it did rather than an empty row.
    expect(cash?.currentAction?.currentAction).toBe("allocated 1000.00 USD");
  });

  it("shows no current action once the run is finished", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seed(repository);
    await repository.updateRunState({
      runId: "RUN-1",
      state: "Ready",
      currentPhase: "handoff",
      terminalAt: "2026-08-22T10:00:03.000Z"
    });

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });
    const cash = snapshot.roster.find((entry) => entry.agent === "Cash Application");

    expect(cash?.status).toBe("Completed");
    expect(cash?.currentAction).toBeUndefined();
  });
});
