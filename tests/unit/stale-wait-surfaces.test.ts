import { describe, expect, it } from "vitest";

import { loadAgentOperationsSnapshot } from "../../src/services/agentOperationsReadModel.ts";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.ts";
import type { WorkflowRepository } from "../../src/services/workflowRepository.ts";

/**
 * A wait that will never resolve has to stop looking like a wait.
 *
 * AC-06 has a run enter AwaitingCashReceipt, schedule a resume, and on
 * exhaustion reach Review with a visible dead letter. The first two need the
 * worker, which D-11 has not authorised; the consequence is that a run whose
 * receipt never matches waits forever and the Waiting counter just grows.
 *
 * Waiting is still the right first answer: from outside, "the money has not
 * arrived yet" and "this will never match" look identical, and rejecting on
 * arrival would throw away notes that become good in an hour. What is wrong is
 * waiting without limit and without telling anyone.
 *
 * Age is real data on the run, so the exhausted ones can be surfaced at read
 * time without inventing a state or waiting for the worker.
 */

const env = { RECOUP_CASH_ROLLOUT_STAGE: "shadow" };

async function waitingRun(repository: WorkflowRepository, runId: string, hoursAgo: number): Promise<void> {
  const created = new Date(Date.now() - hoursAgo * 3_600_000).toISOString();

  await repository.createRun({
    runId,
    workflowName: "cash_application_to_maya",
    workflowVersion: "v1",
    triggerType: "replay_email",
    triggerRecordId: `MSG-${runId}`,
    correlationId: `COR-${runId}`,
    state: "Received",
    currentPhase: "intake",
    customerReference: "CUST-001",
    provenanceMode: "replay",
    createdAt: created,
    updatedAt: created
  });

  await repository.appendEvent({
    runId,
    event: {
      eventId: `EVT-${runId}`,
      runId,
      correlationId: `COR-${runId}`,
      eventType: "phase_waiting",
      phase: "validate",
      specialist: "cash_application",
      status: "not_found",
      safeSummary: "Waiting: the money has not been confirmed as received yet",
      recordIds: [`REC-${runId}`],
      provenanceMode: "replay",
      occurredAt: created
    }
  });

  await repository.updateRunState({ runId, state: "AwaitingCashReceipt", currentPhase: "validate" });
}

describe("a wait that has gone on too long", () => {
  it("still reads as Waiting while the money could plausibly arrive", async () => {
    const repository = createInMemoryWorkflowRepository();
    await waitingRun(repository, "RUN-FRESH", 2);

    const snapshot = await loadAgentOperationsSnapshot({ repository, env });

    expect(snapshot.runs[0]?.status).toBe("Waiting");
    expect(snapshot.counts.waiting).toBe(1);
    expect(snapshot.counts.needsAttention).toBe(0);
  });

  it("becomes work for a person once the wait is exhausted", async () => {
    const repository = createInMemoryWorkflowRepository();
    await waitingRun(repository, "RUN-STALE", 48);

    const snapshot = await loadAgentOperationsSnapshot({ repository, env });

    // Hiding in Waiting is how ten of these accumulated unnoticed.
    expect(snapshot.runs[0]?.status).toBe("Blocked");
    expect(snapshot.counts.needsAttention).toBe(1);
    expect(snapshot.counts.waiting).toBe(0);
  });

  it("says why it stopped waiting rather than just changing colour", async () => {
    const repository = createInMemoryWorkflowRepository();
    await waitingRun(repository, "RUN-STALE", 48);

    const snapshot = await loadAgentOperationsSnapshot({ repository, env });

    expect(snapshot.runs[0]?.blockerCode).toBe("wait_exhausted");
  });

  it("counts a mix correctly", async () => {
    const repository = createInMemoryWorkflowRepository();
    await waitingRun(repository, "RUN-A", 1);
    await waitingRun(repository, "RUN-B", 96);

    const snapshot = await loadAgentOperationsSnapshot({ repository, env });

    expect(snapshot.counts.waiting).toBe(1);
    expect(snapshot.counts.needsAttention).toBe(1);
  });
});
