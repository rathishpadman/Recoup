import { describe, expect, it } from "vitest";
import { MemoryRecordSchema, memoryCategories } from "../../src/memory/schema.js";

describe("memory contract", () => {
  it("defines scoped memory categories for agents and transactions", () => {
    expect(memoryCategories).toEqual([
      "session_state",
      "workflow_state",
      "case_state",
      "transaction_state",
      "evidence_refs",
      "approval_records",
      "audit_refs",
      "connector_state",
      "compaction_summaries",
      "artifact_refs",
      "agent_handoff_packets"
    ]);
  });

  it("requires trust labels and record references for memory records", () => {
    expect(() =>
      MemoryRecordSchema.parse({
        id: "mem-1",
        category: "case_state",
        trustLevel: "trusted",
        scope: "case:ARB-HARBOR-ORDER-640K",
        payload: { status: "pending_human" },
        recordIds: ["ARB-HARBOR-ORDER-640K"],
        createdAt: "2026-06-19T00:00:00.000Z"
      })
    ).not.toThrow();
  });

  it("rejects uncited memory records", () => {
    expect(() =>
      MemoryRecordSchema.parse({
        id: "mem-uncited",
        category: "case_state",
        trustLevel: "trusted",
        scope: "case:ARB-HARBOR-ORDER-640K",
        payload: { status: "pending_human" },
        recordIds: [],
        createdAt: "2026-06-19T00:00:00.000Z"
      })
    ).toThrow();
  });

  it("rejects direct PII and secrets before memory persistence", () => {
    expect(() =>
      MemoryRecordSchema.parse({
        id: "mem-secret",
        category: "connector_state",
        trustLevel: "trusted",
        scope: "connector:sap",
        payload: {
          clientSecret: "sap-client-secret",
          note: "Contact maya@example.com or 555-0188"
        },
        recordIds: ["SAP-CONNECTOR"],
        createdAt: "2026-06-19T00:00:00.000Z"
      })
    ).toThrow("Memory payload must not contain direct PII or secrets.");
  });
});
