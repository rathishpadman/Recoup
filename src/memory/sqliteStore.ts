import { DatabaseSync } from "node:sqlite";
import { MemoryRecordSchema, memoryCategories, type MemoryRecord } from "./schema.js";
import type { MemoryStore } from "./store.js";

export interface SqliteMemoryStore extends MemoryStore {
  close(): void;
}

interface MemoryRow {
  id: string;
  category: string;
  trust_level: string;
  scope: string;
  payload_json: string;
  record_ids_json: string;
  created_at: string;
}

export function createSqliteMemoryStore(dbPath: string): SqliteMemoryStore {
  const database = new DatabaseSync(dbPath);
  const categoryValues = memoryCategories.map((category) => `'${category}'`).join(", ");
  configureDurability(database, dbPath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS memory_records (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN (${categoryValues})),
      trust_level TEXT NOT NULL CHECK (trust_level IN ('trusted', 'semi_trusted', 'untrusted')),
      scope TEXT NOT NULL,
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
      record_ids_json TEXT NOT NULL CHECK (json_valid(record_ids_json) AND json_type(record_ids_json) = 'array' AND json_array_length(record_ids_json) > 0),
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_records_id ON memory_records(id);
    CREATE INDEX IF NOT EXISTS idx_memory_records_scope_sequence ON memory_records(scope, sequence);
  `);

  const insert = database.prepare(`
    INSERT INTO memory_records (id, category, trust_level, scope, payload_json, record_ids_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      category = excluded.category,
      trust_level = excluded.trust_level,
      scope = excluded.scope,
      payload_json = excluded.payload_json,
      record_ids_json = excluded.record_ids_json,
      created_at = excluded.created_at
  `);
  const insertIfAbsent = database.prepare(`
    INSERT INTO memory_records (id, category, trust_level, scope, payload_json, record_ids_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);
  const selectByScope = database.prepare(`
    SELECT id, category, trust_level, scope, payload_json, record_ids_json, created_at
    FROM memory_records
    WHERE scope = ?
    ORDER BY sequence ASC
  `);
  const selectAll = database.prepare(`
    SELECT id, category, trust_level, scope, payload_json, record_ids_json, created_at
    FROM memory_records
    ORDER BY sequence ASC
  `);

  return {
    append(record) {
      const parsed = MemoryRecordSchema.parse(record);
      insert.run(
        parsed.id,
        parsed.category,
        parsed.trustLevel,
        parsed.scope,
        JSON.stringify(parsed.payload),
        JSON.stringify(parsed.recordIds),
        parsed.createdAt
      );

      return parsed;
    },
    appendIfAbsent(record) {
      const parsed = MemoryRecordSchema.parse(record);
      const result = insertIfAbsent.run(
        parsed.id,
        parsed.category,
        parsed.trustLevel,
        parsed.scope,
        JSON.stringify(parsed.payload),
        JSON.stringify(parsed.recordIds),
        parsed.createdAt
      ) as { changes: number };

      return result.changes === 0 ? undefined : parsed;
    },
    find(scope, predicate) {
      return readScope(selectByScope, scope).find(predicate);
    },
    list(scope) {
      return readScope(selectByScope, scope);
    },
    listAll() {
      return readRows(selectAll.all());
    },
    close() {
      database.close();
    }
  };
}

function configureDurability(database: DatabaseSync, dbPath: string): void {
  database.exec("PRAGMA busy_timeout = 5000;");
  if (dbPath === ":memory:") {
    return;
  }

  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
  `);
}

function readScope(statement: ReturnType<DatabaseSync["prepare"]>, scope: string): MemoryRecord[] {
  return readRows(statement.all(scope));
}

function readRows(rows: unknown[]): MemoryRecord[] {
  return rows.map((row) => parseMemoryRow(row as MemoryRow));
}

function parseMemoryRow(row: MemoryRow): MemoryRecord {
  return MemoryRecordSchema.parse({
    id: row.id,
    category: row.category,
    trustLevel: row.trust_level,
    scope: row.scope,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    recordIds: JSON.parse(row.record_ids_json) as string[],
    createdAt: row.created_at
  });
}
