import { describe, expect, it } from "vitest";

import { createInMemoryOutbox } from "../../src/services/workflowOutbox.js";

const t0 = new Date("2026-08-22T09:00:00Z");
const later = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

describe("outbox scheduling (TDD 6.3, AC-06)", () => {
  it("schedules exactly one deterministic resume per run", () => {
    const outbox = createInMemoryOutbox();
    const first = outbox.schedule({ runId: "RUN-1", availableAt: later(60).toISOString() });
    const second = outbox.schedule({ runId: "RUN-1", availableAt: later(120).toISOString() });

    expect(second.commandId).toBe(first.commandId);
    expect(outbox.list()).toHaveLength(1);
  });

  it("lets a verified receipt signal make the existing command claimable sooner", () => {
    const outbox = createInMemoryOutbox();
    outbox.schedule({ runId: "RUN-1", availableAt: later(3600).toISOString() });
    const advanced = outbox.schedule({
      runId: "RUN-1",
      availableAt: t0.toISOString(),
      wakeReason: "verified_receipt_signal"
    });

    expect(outbox.list()).toHaveLength(1);
    expect(advanced.availableAt).toBe(t0.toISOString());
    expect(advanced.wakeReason).toBe("verified_receipt_signal");
  });

  it("keeps commands for separate runs distinct", () => {
    const outbox = createInMemoryOutbox();
    outbox.schedule({ runId: "RUN-1", availableAt: t0.toISOString() });
    outbox.schedule({ runId: "RUN-2", availableAt: t0.toISOString() });
    expect(outbox.list()).toHaveLength(2);
  });
});

describe("bounded claiming and leasing", () => {
  it("claims nothing before the due time", () => {
    const outbox = createInMemoryOutbox();
    outbox.schedule({ runId: "RUN-1", availableAt: later(600).toISOString() });

    const claimed = outbox.claimDue({ owner: "worker-1", now: t0, leaseSeconds: 60 });
    expect(claimed).toHaveLength(0);
  });

  it("claims a due command exactly once while the lease holds", () => {
    const outbox = createInMemoryOutbox();
    outbox.schedule({ runId: "RUN-1", availableAt: t0.toISOString() });

    const first = outbox.claimDue({ owner: "worker-1", now: later(1), leaseSeconds: 300 });
    const second = outbox.claimDue({ owner: "worker-2", now: later(2), leaseSeconds: 300 });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it("lets a second worker reclaim after the lease expires, so a crash resumes", () => {
    const outbox = createInMemoryOutbox();
    outbox.schedule({ runId: "RUN-1", availableAt: t0.toISOString() });

    outbox.claimDue({ owner: "worker-1", now: later(1), leaseSeconds: 60 });
    const reclaimed = outbox.claimDue({ owner: "worker-2", now: later(120), leaseSeconds: 60 });

    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]?.leaseOwner).toBe("worker-2");
    expect(reclaimed[0]?.attempt).toBe(2);
  });

  it("increments the attempt on each claim", () => {
    const outbox = createInMemoryOutbox();
    outbox.schedule({ runId: "RUN-1", availableAt: t0.toISOString() });

    const first = outbox.claimDue({ owner: "w", now: later(1), leaseSeconds: 10 });
    expect(first[0]?.attempt).toBe(1);

    const second = outbox.claimDue({ owner: "w", now: later(60), leaseSeconds: 10 });
    expect(second[0]?.attempt).toBe(2);
  });

  it("honours the claim limit", () => {
    const outbox = createInMemoryOutbox();
    for (const runId of ["RUN-1", "RUN-2", "RUN-3"]) {
      outbox.schedule({ runId, availableAt: t0.toISOString() });
    }

    const claimed = outbox.claimDue({ owner: "w", now: later(1), leaseSeconds: 60, limit: 2 });
    expect(claimed).toHaveLength(2);
  });

  it("does not reclaim a completed command", () => {
    const outbox = createInMemoryOutbox();
    const command = outbox.schedule({ runId: "RUN-1", availableAt: t0.toISOString() });

    outbox.claimDue({ owner: "w", now: later(1), leaseSeconds: 60 });
    outbox.complete(command.commandId);

    expect(outbox.claimDue({ owner: "w", now: later(600), leaseSeconds: 60 })).toHaveLength(0);
  });
});

describe("exhaustion becomes a visible dead letter", () => {
  it("reschedules while attempts remain", () => {
    const outbox = createInMemoryOutbox();
    const command = outbox.schedule({ runId: "RUN-1", availableAt: t0.toISOString() });
    outbox.claimDue({ owner: "w", now: later(1), leaseSeconds: 60 });

    const next = outbox.reschedule({
      commandId: command.commandId,
      availableAt: later(600).toISOString(),
      maxAttempts: 5
    });

    expect(next.status).toBe("claimable");
    expect(next.deadLetterReason).toBeUndefined();
  });

  it("dead-letters instead of scheduling another wake-up once attempts are spent", () => {
    const outbox = createInMemoryOutbox();
    const command = outbox.schedule({ runId: "RUN-1", availableAt: t0.toISOString() });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      outbox.claimDue({ owner: "w", now: later(attempt * 120 + 1), leaseSeconds: 60 });
      outbox.reschedule({
        commandId: command.commandId,
        availableAt: later(attempt * 120 + 60).toISOString(),
        maxAttempts: 3
      });
    }

    const final = outbox.list()[0];
    expect(final?.status).toBe("dead_letter");
    expect(final?.deadLetterReason).toBe("max_attempts_exhausted");
  });

  it("never reclaims a dead-lettered command", () => {
    const outbox = createInMemoryOutbox();
    const command = outbox.schedule({ runId: "RUN-1", availableAt: t0.toISOString() });
    outbox.claimDue({ owner: "w", now: later(1), leaseSeconds: 60 });
    outbox.reschedule({
      commandId: command.commandId,
      availableAt: t0.toISOString(),
      maxAttempts: 1
    });

    expect(outbox.claimDue({ owner: "w", now: later(600), leaseSeconds: 60 })).toHaveLength(0);
  });
});
