import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import { createCockpitApi } from "../../src/services/cockpitApi.js";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.js";
import type { WorkflowRepository } from "../../src/services/workflowRepository.js";
import type { RuntimeEnv } from "../../config/localRuntimeEnv.js";

/**
 * BRD FR-OPS-07: cursor-based SSE streams persisted events, replays what was
 * missed after a reconnect and preserves ordering.
 *
 * The cursor is the persisted event cursor, not a position in memory, which is
 * what makes the replay durable: a client that was disconnected across a
 * restart still resumes exactly where it stopped.
 *
 * Read-model invalidation SSE stays a separate channel and is not this.
 */

/** SSE frames are separated by a blank line. */
const FRAME_SEPARATOR = "\n\n";

const env: RuntimeEnv = {
  RECOUP_CASH_ROLLOUT_STAGE: "shadow",
  RECOUP_AGENT_OPERATIONS_SSE_POLL_MS: "20",
  // Fixture mode is how the suite reaches a protected read route; the refusal
  // itself is asserted separately against real-backend mode.
  RECOUP_DATA_MODE: "fixture"
};

async function startApi(
  repository: WorkflowRepository,
  overrides: RuntimeEnv = {}
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server: Server = createServer(
    createCockpitApi({ env: { ...env, ...overrides }, workflowRepository: repository })
  );
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    close: () =>
      new Promise<void>((resolve) => {
        // An SSE connection is keep-alive, so close() would wait for it to
        // drain and the test would hang rather than fail.
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      })
  };
}

async function seedEvents(repository: WorkflowRepository, count: number): Promise<void> {
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

  for (let index = 0; index < count; index += 1) {
    await repository.appendEvent({
      runId: "RUN-1",
      event: {
        eventId: `EVT-${String(index)}`,
        runId: "RUN-1",
        correlationId: "COR-1",
        eventType: "phase_completed",
        phase: `phase-${String(index)}`,
        status: "ok",
        safeSummary: `step ${String(index)}`,
        recordIds: ["REC-1"],
        provenanceMode: "replay",
        occurredAt: `2026-08-22T10:0${String(index)}:00.000Z`
      }
    });
  }
}

/** Reads frames until `wanted` have arrived or the budget expires. */
async function readFrames(
  url: string,
  wanted: number,
  headers: Record<string, string> = {},
  budgetMs = 3_000
): Promise<{ status: number; frames: { id?: string; data: string }[] }> {
  const controller = new AbortController();
  const response = await fetch(url, { headers, signal: controller.signal });

  if (!response.ok || response.body === null) {
    controller.abort();
    return { status: response.status, frames: [] };
  }

  // The budget has to be able to interrupt a blocked read. When no frame ever
  // arrives, read() never resolves, so a deadline checked between reads is
  // never reached again and the test hangs instead of asserting.
  const budgetTimer = setTimeout(() => {
    controller.abort();
  }, budgetMs);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const frames: { id?: string; data: string }[] = [];
  let buffer = "";

  try {
    while (frames.length < wanted) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let split = buffer.indexOf(FRAME_SEPARATOR);

      while (split !== -1) {
        const block = buffer.slice(0, split);
        buffer = buffer.slice(split + FRAME_SEPARATOR.length);
        const id = /^id:\s*(.+)$/mu.exec(block)?.[1];
        const data = /^data:\s*(.+)$/mu.exec(block)?.[1];

        if (data !== undefined) {
          frames.push(id === undefined ? { data } : { id, data });
        }

        split = buffer.indexOf(FRAME_SEPARATOR);
      }
    }
  } catch {
    // Aborting the read is how the budget ends; that is not a failure.
  } finally {
    clearTimeout(budgetTimer);
    controller.abort();
  }

  return { status: response.status, frames };
}

describe("agent operations SSE", () => {
  it("refuses an unauthenticated caller before any frame is written", { timeout: 20_000 }, async () => {
    const repository = createInMemoryWorkflowRepository();
    await seedEvents(repository, 2);
    const api = await startApi(repository, { RECOUP_DATA_MODE: "real-backend" });

    try {
      const result = await readFrames(`${api.baseUrl}/agent-operations/events`, 1);

      expect(result.status).toBe(401);
      expect(result.frames).toHaveLength(0);
    } finally {
      await api.close();
    }
  });

  it("streams the persisted events in order", { timeout: 20_000 }, async () => {
    const repository = createInMemoryWorkflowRepository();
    await seedEvents(repository, 3);
    const api = await startApi(repository);

    try {
      const result = await readFrames(`${api.baseUrl}/agent-operations/events`, 3);
      const phases = result.frames.map(
        (frame) => (JSON.parse(frame.data) as { phase: string }).phase
      );

      expect(phases).toEqual(["phase-0", "phase-1", "phase-2"]);
    } finally {
      await api.close();
    }
  });

  it("replays only what was missed when a client resumes from its cursor", { timeout: 20_000 }, async () => {
    const repository = createInMemoryWorkflowRepository();
    await seedEvents(repository, 3);
    const api = await startApi(repository);

    try {
      const first = await readFrames(`${api.baseUrl}/agent-operations/events`, 3);
      const lastCursor = first.frames.at(-1)?.id ?? "0";

      // The reconnect carries the cursor, so the first two are not resent.
      // Nothing should arrive, so this waits only long enough to be sure.
      const resumed = await readFrames(
        `${api.baseUrl}/agent-operations/events?cursor=${lastCursor}`,
        1,
        {},
        600
      );

      expect(resumed.frames).toHaveLength(0);
    } finally {
      await api.close();
    }
  });

  it("resumes mid-stream without duplicating or skipping", { timeout: 20_000 }, async () => {
    const repository = createInMemoryWorkflowRepository();
    await seedEvents(repository, 3);
    const api = await startApi(repository);

    try {
      const all = await readFrames(`${api.baseUrl}/agent-operations/events`, 3);
      const afterFirst = all.frames[0]?.id ?? "0";

      const resumed = await readFrames(
        `${api.baseUrl}/agent-operations/events?cursor=${afterFirst}`,
        2
      );
      const phases = resumed.frames.map(
        (frame) => (JSON.parse(frame.data) as { phase: string }).phase
      );

      expect(phases).toEqual(["phase-1", "phase-2"]);
    } finally {
      await api.close();
    }
  });

  it("honours Last-Event-ID, which is what a browser sends on reconnect", { timeout: 20_000 }, async () => {
    const repository = createInMemoryWorkflowRepository();
    await seedEvents(repository, 3);
    const api = await startApi(repository);

    try {
      const all = await readFrames(`${api.baseUrl}/agent-operations/events`, 3);
      const afterFirst = all.frames[0]?.id ?? "0";

      const resumed = await readFrames(`${api.baseUrl}/agent-operations/events`, 2, {
        "last-event-id": afterFirst
      });
      const phases = resumed.frames.map(
        (frame) => (JSON.parse(frame.data) as { phase: string }).phase
      );

      expect(phases).toEqual(["phase-1", "phase-2"]);
    } finally {
      await api.close();
    }
  });

  it("is closed when the surface is not exposed", { timeout: 20_000 }, async () => {
    const repository = createInMemoryWorkflowRepository();
    await seedEvents(repository, 2);
    const api = await startApi(repository, { RECOUP_CASH_ROLLOUT_STAGE: "disabled" });

    try {
      const result = await readFrames(`${api.baseUrl}/agent-operations/events`, 1);

      expect(result.status).toBe(404);
      expect(result.frames).toHaveLength(0);
    } finally {
      await api.close();
    }
  });
});
