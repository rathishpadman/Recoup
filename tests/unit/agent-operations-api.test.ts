import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import { createCockpitApi } from "../../src/services/cockpitApi.js";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.js";
import type { WorkflowRepository } from "../../src/services/workflowRepository.js";
import type { RuntimeEnv } from "../../config/localRuntimeEnv.js";

/**
 * GET /agent-operations is the route the cockpit reads. It exists because the
 * page was rendering a hardcoded empty snapshot with nothing behind it.
 *
 * The gate is asserted here as well as in the loader, because this is the
 * boundary a deployment actually exposes: a caller reaching the endpoint at a
 * stage that does not permit the view must get the empty snapshot, not rows.
 */

async function startApi(input: {
  env?: RuntimeEnv;
  workflowRepository?: WorkflowRepository;
}): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server: Server = createServer(
    createCockpitApi({
      env: { ...(input.env ?? {}) },
      ...(input.workflowRepository === undefined
        ? {}
        : { workflowRepository: input.workflowRepository })
    })
  );

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      })
  };
}

async function seedReadyRun(repository: WorkflowRepository): Promise<void> {
  await repository.createRun({
    runId: "RUN-API-1",
    workflowName: "cash_application_to_maya",
    workflowVersion: "v1",
    triggerType: "replay_email",
    triggerRecordId: "MSG-API-1",
    correlationId: "COR-API-1",
    state: "Received",
    currentPhase: "intake",
    provenanceMode: "replay",
    createdAt: "2026-08-22T10:00:00.000Z",
    updatedAt: "2026-08-22T10:00:00.000Z"
  });

  await repository.appendEvent({
    runId: "RUN-API-1",
    event: {
      eventId: "EVT-API-1",
      runId: "RUN-API-1",
      correlationId: "COR-API-1",
      eventType: "run_received",
      phase: "intake",
      status: "started",
      safeSummary: "remittance advice accepted",
      recordIds: ["REC-API-1"],
      provenanceMode: "replay",
      occurredAt: "2026-08-22T10:00:00.000Z"
    }
  });
}

describe("GET /agent-operations", () => {
  it("serves the empty snapshot when the view is not exposed", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seedReadyRun(repository);
    const api = await startApi({ env: {}, workflowRepository: repository });

    try {
      const response = await fetch(`${api.baseUrl}/agent-operations`);
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        runs: unknown[];
        roster: unknown[];
        counts: Record<string, number>;
      };

      // The run exists and is readable. The stage is the only reason it is absent.
      expect(body.runs).toEqual([]);
      expect(body.roster).toHaveLength(4);
      expect(body.counts.active).toBe(0);
    } finally {
      await api.close();
    }
  });

  it("serves the run once the stage exposes the view", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seedReadyRun(repository);
    const api = await startApi({
      env: { RECOUP_CASH_ROLLOUT_STAGE: "shadow" },
      workflowRepository: repository
    });

    try {
      const response = await fetch(`${api.baseUrl}/agent-operations`);
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        runs: { runId: string; status: string; provenanceMode: string }[];
        events: { event: string }[];
      };

      expect(body.runs).toHaveLength(1);
      expect(body.runs[0]?.runId).toBe("RUN-API-1");
      expect(body.runs[0]?.provenanceMode).toBe("replay");
      expect(body.events).toHaveLength(1);
      expect(body.events[0]?.event).toBe("remittance advice accepted");
    } finally {
      await api.close();
    }
  });

  it("serves the empty snapshot when the kill switch is engaged", async () => {
    const repository = createInMemoryWorkflowRepository();
    await seedReadyRun(repository);
    const api = await startApi({
      env: {
        RECOUP_CASH_ROLLOUT_STAGE: "shadow",
        RECOUP_CASH_KILL_AGENT_OPS_UI: "true"
      },
      workflowRepository: repository
    });

    try {
      const response = await fetch(`${api.baseUrl}/agent-operations`);
      const body = (await response.json()) as { runs: unknown[] };

      // The kill switch beats the stage, so an incident needs no redeploy.
      expect(body.runs).toEqual([]);
    } finally {
      await api.close();
    }
  });
});
