import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { RuntimeEnv } from "../../config/env.js";
import { createSqliteMemoryStore } from "./sqliteStore.js";
import { createInMemoryStore, type MemoryStore } from "./store.js";

export type RuntimeMemoryStore = MemoryStore & {
  close(): void;
  mode: "in_memory" | "sqlite";
};

export function createRuntimeMemoryStore(env: RuntimeEnv = process.env): RuntimeMemoryStore {
  if (env.SUPABASE_SERVICE_ROLE_KEY !== undefined && env.SUPABASE_URL !== undefined) {
    throw new Error("Supabase memory uses the async repository.");
  }

  const dbPath = env.RECOUP_MEMORY_DB_PATH?.trim();
  if (dbPath === undefined || dbPath.length === 0) {
    return {
      ...createInMemoryStore(),
      close() {
        return undefined;
      },
      mode: "in_memory"
    };
  }

  ensureDatabaseDirectory(dbPath);
  return {
    ...createSqliteMemoryStore(dbPath),
    mode: "sqlite"
  };
}

function ensureDatabaseDirectory(dbPath: string): void {
  if (dbPath === ":memory:") {
    return;
  }

  mkdirSync(dirname(dbPath), { recursive: true });
}
