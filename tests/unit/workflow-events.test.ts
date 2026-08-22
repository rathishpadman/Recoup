import { describe, expect, it } from "vitest";

import {
  LiveDeductionCaseSchema,
  WorkflowEventSchema,
  WorkflowRunSchema,
  deriveAllocationKey,
  deriveCaseCommandKey,
  deriveInboundCommandKey,
  deriveRunCommandKey
} from "../../src/types/workflow.js";

const baseEvent = {
  schemaVersion: "1",
  eventId: "EVT-1",
  cursor: "1",
  runSequence: 1,
  runId: "RUN-1",
  correlationId: "COR-1",
  eventType: "run_received",
  phase: "intake",
  status: "started",
  safeSummary: "run received",
  recordIds: ["REM-SRC-1"],
  provenanceMode: "replay",
  occurredAt: "2026-08-22T09:00:00Z"
};

describe("WorkflowRunSchema (TDD 6.1)", () => {
  it("accepts a well-formed run", () => {
    const parsed = WorkflowRunSchema.safeParse({
      runId: "RUN-1",
      workflowName: "cash_application_to_maya",
      workflowVersion: "v1",
      triggerType: "replay_email",
      triggerRecordId: "MSG-1",
      correlationId: "COR-1",
      state: "Validating",
      currentPhase: "validate",
      provenanceMode: "replay",
      createdAt: "2026-08-22T09:00:00Z",
      updatedAt: "2026-08-22T09:00:00Z"
    });
    expect(parsed.success).toBe(true);
  });

  it("pins the workflow name to a single literal", () => {
    const parsed = WorkflowRunSchema.safeParse({
      runId: "RUN-1",
      workflowName: "something_else",
      workflowVersion: "v1",
      triggerType: "replay_email",
      triggerRecordId: "MSG-1",
      correlationId: "COR-1",
      state: "Validating",
      currentPhase: "validate",
      provenanceMode: "replay",
      createdAt: "2026-08-22T09:00:00Z",
      updatedAt: "2026-08-22T09:00:00Z"
    });
    expect(parsed.success).toBe(false);
  });

  it("names exactly the three trigger types", () => {
    expect(WorkflowRunSchema.shape.triggerType.options).toEqual([
      "live_email",
      "replay_email",
      "synthetic_email"
    ]);
  });
});

describe("WorkflowEventSchema (TDD 6.2)", () => {
  it("accepts a well-formed event", () => {
    expect(WorkflowEventSchema.safeParse(baseEvent).success).toBe(true);
  });

  it("requires at least one cited record", () => {
    expect(WorkflowEventSchema.safeParse({ ...baseEvent, recordIds: [] }).success).toBe(false);
  });

  it("bounds the safe summary at 1000 characters", () => {
    const parsed = WorkflowEventSchema.safeParse({
      ...baseEvent,
      safeSummary: "x".repeat(1001)
    });
    expect(parsed.success).toBe(false);
  });

  it("requires a numeric cursor", () => {
    expect(WorkflowEventSchema.safeParse({ ...baseEvent, cursor: "abc" }).success).toBe(false);
  });

  it("requires a positive run sequence", () => {
    expect(WorkflowEventSchema.safeParse({ ...baseEvent, runSequence: 0 }).success).toBe(false);
  });

  it("rejects an unknown event type", () => {
    expect(
      WorkflowEventSchema.safeParse({ ...baseEvent, eventType: "not_an_event" }).success
    ).toBe(false);
  });

  it("carries all seventeen documented event types", () => {
    expect(WorkflowEventSchema.shape.eventType.options).toHaveLength(17);
  });
});

describe("LiveDeductionCaseSchema (TDD 4.8)", () => {
  const liveCase = {
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

  it("accepts a well-formed live case", () => {
    expect(LiveDeductionCaseSchema.safeParse(liveCase).success).toBe(true);
  });

  it("has no scenario id field, so a live case can never be S09", () => {
    expect(Object.keys(LiveDeductionCaseSchema.shape)).not.toContain("scenarioId");
    const parsed = LiveDeductionCaseSchema.safeParse({ ...liveCase, scenarioId: "S09" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("scenarioId");
    }
  });

  it("pins origin to live_cash_application", () => {
    expect(
      LiveDeductionCaseSchema.safeParse({ ...liveCase, origin: "gold_set" }).success
    ).toBe(false);
  });

  it("permits only DEP as the validated reason in the first release", () => {
    expect(
      LiveDeductionCaseSchema.safeParse({ ...liveCase, validatedReason: "PRC" }).success
    ).toBe(false);
  });
});

describe("stable idempotency keys (TDD 5.4)", () => {
  it("derives the same key for the same inputs", () => {
    expect(deriveInboundCommandKey("resend", "evt-1")).toBe(
      deriveInboundCommandKey("resend", "evt-1")
    );
  });

  it("derives different keys for different inputs", () => {
    expect(deriveInboundCommandKey("resend", "evt-1")).not.toBe(
      deriveInboundCommandKey("resend", "evt-2")
    );
  });

  it("keeps the four key families distinct for the same operands", () => {
    const keys = new Set([
      deriveInboundCommandKey("a", "b"),
      deriveRunCommandKey("a"),
      deriveAllocationKey("a", "b", "c"),
      deriveCaseCommandKey("a", "b", "c")
    ]);
    expect(keys.size).toBe(4);
  });

  it("produces a hex sha256", () => {
    expect(deriveRunCommandKey("inbox-1")).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("derives a case key from allocation, line and reason, not from a counter", () => {
    const first = deriveCaseCommandKey("ALLOC-1", "LINE-1", "DEP");
    const second = deriveCaseCommandKey("ALLOC-1", "LINE-1", "DEP");
    const other = deriveCaseCommandKey("ALLOC-1", "LINE-2", "DEP");
    expect(first).toBe(second);
    expect(first).not.toBe(other);
  });
});
