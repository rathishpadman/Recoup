import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  readAgentHandoffPacket,
  readSessionState,
  readTransactionState,
  writeAgentHandoffPacket,
  writeSessionState,
  writeTransactionState
} from "../../src/memory/session.js";
import { createSqliteMemoryStore } from "../../src/memory/sqliteStore.js";

describe("sqlite memory store", () => {
  it("uses WAL journaling for durable file-backed memory", () => {
    const dir = mkdtempSync(join(tmpdir(), "recoup-memory-"));
    const dbPath = join(dir, "memory.sqlite");
    let store: ReturnType<typeof createSqliteMemoryStore> | undefined;
    let database: DatabaseSync | undefined;

    try {
      store = createSqliteMemoryStore(dbPath);
      store.close();
      store = undefined;

      database = new DatabaseSync(dbPath);
      expect((database.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode).toBe("wal");
      expect((database.prepare("PRAGMA synchronous").get() as { synchronous: number }).synchronous).toBe(2);
      database.close();
      database = undefined;
    } finally {
      store?.close();
      database?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates a constrained durable memory schema", () => {
    const dir = mkdtempSync(join(tmpdir(), "recoup-memory-schema-"));
    const dbPath = join(dir, "memory.sqlite");
    let store: ReturnType<typeof createSqliteMemoryStore> | undefined;
    let database: DatabaseSync | undefined;

    try {
      store = createSqliteMemoryStore(dbPath);
      store.close();
      store = undefined;
      database = new DatabaseSync(dbPath);
      const schemaRows = database
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'memory_records'")
        .all() as Array<{ sql: string }>;
      const indexRows = database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'memory_records'")
        .all() as Array<{ name: string }>;
      const schema = schemaRows[0]?.sql ?? "";

      expect(schema).toContain("category TEXT NOT NULL CHECK");
      expect(schema).toContain("trust_level TEXT NOT NULL CHECK");
      expect(schema).toContain("json_valid(payload_json)");
      expect(schema).toContain("json_array_length(record_ids_json) > 0");
      expect(indexRows.map((row) => row.name)).toContain("idx_memory_records_scope_sequence");
    } finally {
      store?.close();
      database?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists cited memory records across store instances", () => {
    const dir = mkdtempSync(join(tmpdir(), "recoup-memory-"));
    const dbPath = join(dir, "memory.sqlite");
    let first: ReturnType<typeof createSqliteMemoryStore> | undefined;
    let second: ReturnType<typeof createSqliteMemoryStore> | undefined;

    try {
      first = createSqliteMemoryStore(dbPath);
      writeSessionState(first, {
        sessionId: "session-demo",
        key: "active-case",
        value: "ARB-HARBOR-ORDER-640K",
        recordIds: ["ARB-HARBOR-ORDER-640K"]
      });
      first.close();
      first = undefined;

      second = createSqliteMemoryStore(dbPath);
      expect(readSessionState(second, "session-demo", "active-case")).toMatchObject({
        category: "session_state",
        payload: { key: "active-case", value: "ARB-HARBOR-ORDER-640K" },
        recordIds: ["ARB-HARBOR-ORDER-640K"]
      });
      second.close();
      second = undefined;
    } finally {
      first?.close();
      second?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists current agent and transaction memory without stale duplicate state", () => {
    const dir = mkdtempSync(join(tmpdir(), "recoup-memory-"));
    const dbPath = join(dir, "memory.sqlite");
    let first: ReturnType<typeof createSqliteMemoryStore> | undefined;
    let second: ReturnType<typeof createSqliteMemoryStore> | undefined;

    try {
      first = createSqliteMemoryStore(dbPath);
      writeSessionState(first, {
        sessionId: "session-demo",
        key: "active-case",
        value: "ARB-HARBOR-ORDER-640K",
        recordIds: ["ARB-HARBOR-ORDER-640K"]
      });
      writeSessionState(first, {
        sessionId: "session-demo",
        key: "active-case",
        value: "ARB-CRESTLINE-DEDUCTION",
        recordIds: ["ARB-CRESTLINE-DEDUCTION"]
      });
      writeTransactionState(first, {
        transactionId: "TX-S2-L1",
        key: "deduction-verdict",
        value: { verdict: "valid", route: "billing" },
        recordIds: ["S2-L1", "TPM-CONTRACT-1"]
      });
      writeAgentHandoffPacket(first, {
        handoffId: "handoff-forensics-recovery-S2-L1",
        capability: "B",
        caseId: "case-S2-L1",
        deterministicBasis: "runForensicsInvestigation trace + recoupHandoffGraph",
        fromAgent: "forensics",
        intent: "stage-recovery-and-billing-drafts",
        toAgent: "recoveryDrafter",
        status: "ready_for_human_review",
        summary: "Draft recovery packet prepared from deterministic findings.",
        recordIds: ["S2-L1", "TPM-CONTRACT-1"]
      });
      first.close();
      first = undefined;

      second = createSqliteMemoryStore(dbPath);
      expect(readSessionState(second, "session-demo", "active-case")).toMatchObject({
        payload: { key: "active-case", value: "ARB-CRESTLINE-DEDUCTION" },
        recordIds: ["ARB-CRESTLINE-DEDUCTION"]
      });
      expect(second.list("session:session-demo")).toHaveLength(1);
      expect(readTransactionState(second, "TX-S2-L1", "deduction-verdict")).toMatchObject({
        category: "transaction_state",
        payload: { key: "deduction-verdict", value: { verdict: "valid", route: "billing" } },
        recordIds: ["S2-L1", "TPM-CONTRACT-1"]
      });
      expect(readAgentHandoffPacket(second, "handoff-forensics-recovery-S2-L1")).toMatchObject({
        category: "agent_handoff_packets",
        payload: {
          capability: "B",
          caseId: "case-S2-L1",
          deterministicBasis: "runForensicsInvestigation trace + recoupHandoffGraph",
          fromAgent: "forensics",
          intent: "stage-recovery-and-billing-drafts",
          status: "ready_for_human_review",
          toAgent: "recoveryDrafter"
        },
        recordIds: ["S2-L1", "TPM-CONTRACT-1"]
      });
      second.close();
      second = undefined;
    } finally {
      first?.close();
      second?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
