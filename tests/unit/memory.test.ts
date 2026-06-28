import { describe, expect, it } from "vitest";
import { createInMemoryStore } from "../../src/memory/store.js";
import {
  readMayaQueryScopeMemory,
  readSessionState,
  writeMayaQueryScopeMemory,
  writeSessionState
} from "../../src/memory/session.js";

describe("memory store", () => {
  it("writes and reads session state by scope", () => {
    const store = createInMemoryStore();
    writeSessionState(store, {
      sessionId: "session-demo",
      key: "active-case",
      value: "ARB-HARBOR-ORDER-640K",
      recordIds: ["ARB-HARBOR-ORDER-640K"]
    });

    expect(readSessionState(store, "session-demo", "active-case")).toMatchObject({
      category: "session_state",
      payload: { key: "active-case", value: "ARB-HARBOR-ORDER-640K" },
      recordIds: ["ARB-HARBOR-ORDER-640K"]
    });
  });

  it("returns the latest current-state record for repeated deterministic IDs", () => {
    const store = createInMemoryStore();

    writeSessionState(store, {
      sessionId: "session-demo",
      key: "active-case",
      value: "ARB-HARBOR-ORDER-640K",
      recordIds: ["ARB-HARBOR-ORDER-640K"]
    });
    writeSessionState(store, {
      sessionId: "session-demo",
      key: "active-case",
      value: "ARB-CRESTLINE-DEDUCTION",
      recordIds: ["ARB-CRESTLINE-DEDUCTION"]
    });

    expect(readSessionState(store, "session-demo", "active-case")).toMatchObject({
      payload: { key: "active-case", value: "ARB-CRESTLINE-DEDUCTION" },
      recordIds: ["ARB-CRESTLINE-DEDUCTION"]
    });
    expect(store.list("session:session-demo")).toHaveLength(1);
  });

  it("writes Maya query scope memory without question text or decision fields", () => {
    const store = createInMemoryStore();

    const record = writeMayaQueryScopeMemory(store, {
      deterministicBasis: "POST /forensics/query selected evidence scope",
      recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
      selectedLineId: "S6-L1",
      sessionId: "maya-session-42",
      status: "submitted"
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
      status: "submitted"
    });
    expect(JSON.stringify(record.payload)).not.toMatch(/question|amount|dollar|verdict|routing|approval/iu);
    expect(readMayaQueryScopeMemory(store, "maya-session-42")).toEqual(record);
  });

  it("updates Maya query scope memory by deterministic session key", () => {
    const store = createInMemoryStore();

    writeMayaQueryScopeMemory(store, {
      deterministicBasis: "POST /forensics/query selected evidence scope",
      recordIds: ["S3-L1", "POD-SIGNED-1"],
      selectedLineId: "S3-L1",
      sessionId: "maya-session-42",
      status: "submitted"
    });
    writeMayaQueryScopeMemory(store, {
      deterministicBasis: "POST /forensics/query selected evidence scope",
      recordIds: ["S6-L1", "PRICE-CLAUSE-1"],
      selectedLineId: "S6-L1",
      sessionId: "maya-session-42",
      status: "blocked"
    });

    expect(store.list("session:maya-session-42")).toHaveLength(1);
    expect(readMayaQueryScopeMemory(store, "maya-session-42")).toMatchObject({
      payload: {
        selectedLineId: "S6-L1",
        selectedRecordIds: ["S6-L1", "PRICE-CLAUSE-1"],
        status: "blocked"
      },
      recordIds: ["S6-L1", "PRICE-CLAUSE-1"]
    });
  });

  it("rejects unsafe Maya query scope memory record IDs", () => {
    const store = createInMemoryStore();

    expect(() =>
      writeMayaQueryScopeMemory(store, {
        deterministicBasis: "POST /forensics/query selected evidence scope",
        recordIds: ["S6-L1", "sk-record-secret"],
        selectedLineId: "S6-L1",
        sessionId: "maya-session-42",
        status: "blocked"
      })
    ).toThrow("Maya query scope memory record IDs must be safe identifiers.");
    expect(store.list("session:maya-session-42")).toEqual([]);
  });
});
