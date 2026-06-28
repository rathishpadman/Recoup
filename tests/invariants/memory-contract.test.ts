import { describe, expect, it } from "vitest";
import { MemoryRecordSchema, memoryCategories } from "../../src/memory/schema.js";
import { writeMayaQueryScopeMemory } from "../../src/memory/session.js";
import { createInMemoryStore } from "../../src/memory/store.js";

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

  it("keeps Maya query scope memory cited, scoped, and free of decision fields", () => {
    const store = createInMemoryStore();
    const record = writeMayaQueryScopeMemory(store, {
      deterministicBasis: "POST /forensics/query selected evidence scope",
      recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
      selectedLineId: "S6-L1",
      sessionId: "maya-session-42",
      status: "answered"
    });

    expect(record).toMatchObject({
      category: "session_state",
      id: "session:maya-session-42:maya-query-scope",
      recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
      scope: "session:maya-session-42",
      trustLevel: "trusted"
    });
    expect(record.payload).toEqual({
      deterministicBasis: "POST /forensics/query selected evidence scope",
      key: "maya-query-scope",
      memoryType: "maya_short_term_query_scope",
      selectedLineId: "S6-L1",
      selectedRecordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
      status: "answered"
    });
    expect(
      Object.keys(record.payload).filter((key) => /question|answer|amount|dollar|verdict|routing|approval/iu.test(key))
    ).toEqual([]);
    expect(JSON.stringify(record.payload)).not.toMatch(/\$|external action|writeback|approved_by/iu);
  });

  it("rejects unsafe Maya query scope identifiers before persistence", () => {
    const store = createInMemoryStore();

    expect(() =>
      writeMayaQueryScopeMemory(store, {
        deterministicBasis: "POST /forensics/query selected evidence scope",
        recordIds: ["S6-L1", "maya@example.com"],
        selectedLineId: "S6-L1",
        sessionId: "maya-session-42",
        status: "blocked"
      })
    ).toThrow("Maya query scope memory record IDs must be safe identifiers.");
    expect(store.list("session:maya-session-42")).toEqual([]);
  });
});
