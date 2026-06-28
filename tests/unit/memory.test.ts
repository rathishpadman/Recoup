import { describe, expect, it } from "vitest";
import { createInMemoryStore } from "../../src/memory/store.js";
import {
  buildMayaQueryMemoryRecallContext,
  readMayaCaseRecallMemories,
  readMayaQueryScopeMemory,
  readSessionState,
  writeMayaCaseRecallMemory,
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

  it("writes trusted Maya long-term case recall without free text, money, or decision fields", () => {
    const store = createInMemoryStore();

    const record = writeMayaCaseRecallMemory(store, {
      caseId: "S6-L1",
      deterministicBasis: "POST /forensics/query cited records + deterministic query basis",
      recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
      selectedLineId: "S6-L1",
      sessionId: "maya-session-42",
      status: "answered"
    });

    expect(record).toMatchObject({
      category: "case_state",
      id: "case:S6-L1:maya-recall:maya-session-42:S6-L1",
      recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
      scope: "case:S6-L1",
      trustLevel: "trusted"
    });
    expect(record.payload).toEqual({
      caseId: "S6-L1",
      deterministicBasis: "POST /forensics/query cited records + deterministic query basis",
      key: "maya-case-recall",
      memoryType: "maya_long_term_case_recall",
      selectedLineId: "S6-L1",
      selectedRecordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
      sessionId: "maya-session-42",
      status: "answered"
    });
    expect(Object.keys(record.payload).filter((key) => /question|answer|amount|dollar|verdict|routing|approval/iu.test(key))).toEqual(
      []
    );
    expect(JSON.stringify(record.payload)).not.toMatch(/\$|external action|writeback|approved_by/iu);
    expect(readMayaCaseRecallMemories(store, "S6-L1")).toEqual([record]);
  });

  it("builds advisory Maya query recall context only from trusted safe case memories", () => {
    const store = createInMemoryStore();
    writeMayaCaseRecallMemory(store, {
      caseId: "S6-L1",
      deterministicBasis: "POST /forensics/query cited records + deterministic query basis",
      recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
      selectedLineId: "S6-L1",
      sessionId: "maya-session-42",
      status: "answered"
    });
    store.append({
      category: "case_state",
      createdAt: "2026-06-28T00:00:00.000Z",
      id: "case:S6-L1:unsafe-memory",
      payload: {
        caseId: "S6-L1",
        deterministicBasis: "unsafe record IDs are omitted",
        key: "maya-case-recall",
        memoryType: "maya_long_term_case_recall",
        selectedLineId: "S6-L1",
        selectedRecordIds: ["S6-L1", "bearer-record"],
        sessionId: "maya-session-unsafe",
        status: "answered"
      },
      recordIds: ["S6-L1", "bearer-record"],
      scope: "case:S6-L1",
      trustLevel: "trusted"
    });

    expect(buildMayaQueryMemoryRecallContext(readMayaCaseRecallMemories(store, "S6-L1"), "S6-L1")).toEqual({
      deterministicBasis: "trusted governed Maya case recall memory records",
      memoryRecordIds: ["case:S6-L1:maya-recall:maya-session-42:S6-L1"],
      recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"],
      scopes: ["case:S6-L1"],
      selectedLineId: "S6-L1"
    });
  });

  it("omits forged or mismatched trusted Maya recall rows from advisory context", () => {
    const store = createInMemoryStore();
    writeMayaCaseRecallMemory(store, {
      caseId: "S6-L1",
      deterministicBasis: "POST /forensics/query cited records + deterministic query basis",
      recordIds: ["S6-L1", "INV-S6-1"],
      selectedLineId: "S6-L1",
      sessionId: "maya-session-42",
      status: "answered"
    });

    for (const poisoned of [
      {
        id: "case:S6-L1:maya-recall:maya-session-43:S6-L1",
        payload: { caseId: "S6-L1", selectedLineId: "S6-L1", selectedRecordIds: ["S6-L1"], sessionId: "maya-session-43", status: "blocked" },
        recordIds: ["S6-L1"],
        scope: "case:S6-L1"
      },
      {
        id: "case:S6-L2:maya-recall:maya-session-44:S6-L2",
        payload: { caseId: "S6-L2", selectedLineId: "S6-L2", selectedRecordIds: ["S6-L2"], sessionId: "maya-session-44", status: "answered" },
        recordIds: ["S6-L2"],
        scope: "case:S6-L1"
      },
      {
        id: "case:S6-L1:maya-recall:maya-session-45:S6-L1",
        payload: { caseId: "S6-L1", selectedLineId: "S6-L1", selectedRecordIds: ["S6-L1", "INV-S6-999"], sessionId: "maya-session-45", status: "answered" },
        recordIds: ["S6-L1", "INV-S6-1"],
        scope: "case:S6-L1"
      }
    ]) {
      store.append({
        category: "case_state",
        createdAt: "2026-06-28T00:00:00.000Z",
        id: poisoned.id,
        payload: {
          deterministicBasis: "forged trusted row",
          key: "maya-case-recall",
          memoryType: "maya_long_term_case_recall",
          ...poisoned.payload
        },
        recordIds: poisoned.recordIds,
        scope: poisoned.scope,
        trustLevel: "trusted"
      });
    }

    expect(buildMayaQueryMemoryRecallContext(readMayaCaseRecallMemories(store, "S6-L1"), "S6-L1")).toEqual({
      deterministicBasis: "trusted governed Maya case recall memory records",
      memoryRecordIds: ["case:S6-L1:maya-recall:maya-session-42:S6-L1"],
      recordIds: ["S6-L1", "INV-S6-1"],
      scopes: ["case:S6-L1"],
      selectedLineId: "S6-L1"
    });
  });
});
