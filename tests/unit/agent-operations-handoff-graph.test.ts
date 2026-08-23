import { describe, expect, it } from "vitest";

import { loadAgentOperationsSnapshot } from "../../src/services/agentOperationsReadModel.ts";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.ts";
import type { WorkflowRepository } from "../../src/services/workflowRepository.ts";
import type { WorkflowEventType } from "../../src/types/workflow.ts";

/**
 * BRD FR-OPS-05: an edge is emphasized only after the corresponding durable
 * handoff event exists.
 *
 * The rule is the whole requirement. An edge drawn because a run looks like it
 * is heading somewhere is a claim the event log does not support, and a
 * reviewer reading the graph would believe work had been passed on when it had
 * not.
 */

const exposedEnv = { RECOUP_CASH_ROLLOUT_STAGE: "shadow" };

async function seed(
  repository: WorkflowRepository,
  events: { eventType: WorkflowEventType; phase: string }[]
): Promise<void> {
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

  for (const [index, event] of events.entries()) {
    await repository.appendEvent({
      runId: "RUN-1",
      event: {
        eventId: `EVT-${String(index)}`,
        runId: "RUN-1",
        correlationId: "COR-1",
        eventType: event.eventType,
        phase: event.phase,
        status: "ok",
        safeSummary: event.eventType,
        recordIds: ["REC-1"],
        provenanceMode: "replay",
        occurredAt: `2026-08-22T10:0${String(index)}:00.000Z`
      }
    });
  }
}

describe("agent operations handoff graph", () => {
  it("draws every edge the workflow can take", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seed(repository, [{ eventType: "run_received", phase: "intake" }]);

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });

    expect(snapshot.handoffs.length).toBeGreaterThan(0);
    expect(snapshot.handoffs.map((edge) => `${edge.from}->${edge.to}`)).toContain(
      "Cash Application->Deduction Forensics"
    );
  });

  it("leaves every edge unemphasized before any handoff happens", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seed(repository, [
      { eventType: "run_received", phase: "intake" },
      { eventType: "phase_completed", phase: "allocate" }
    ]);

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });

    // Allocating is not handing off. Nothing has been passed to Forensics.
    expect(snapshot.handoffs.every((edge) => !edge.emphasized)).toBe(true);
  });

  it("emphasizes the edge once the durable handoff event exists", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seed(repository, [
      { eventType: "run_received", phase: "intake" },
      { eventType: "phase_completed", phase: "allocate" },
      { eventType: "maya_ready", phase: "handoff" }
    ]);

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });
    const edge = snapshot.handoffs.find(
      (candidate) => candidate.from === "Cash Application" && candidate.to === "Deduction Forensics"
    );

    expect(edge?.emphasized).toBe(true);
  });

  it("keeps later edges unemphasized when only the first handoff happened", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seed(repository, [
      { eventType: "run_received", phase: "intake" },
      { eventType: "maya_ready", phase: "handoff" }
    ]);

    const snapshot = await loadAgentOperationsSnapshot({ repository, env: exposedEnv });
    const later = snapshot.handoffs.find(
      (candidate) => candidate.from === "Deduction Forensics" && candidate.to === "Recovery Drafter"
    );

    expect(later?.emphasized).toBe(false);
  });
});
