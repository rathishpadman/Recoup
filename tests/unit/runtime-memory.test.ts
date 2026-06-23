import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRuntimeMemoryStore } from "../../src/memory/runtime.js";
import { readSessionState, writeSessionState } from "../../src/memory/session.js";

describe("runtime memory store", () => {
  it("uses SQLite durable memory when RECOUP_MEMORY_DB_PATH is configured", () => {
    const dir = mkdtempSync(join(tmpdir(), "recoup-runtime-memory-"));
    const dbPath = join(dir, "memory.sqlite");
    let first: ReturnType<typeof createRuntimeMemoryStore> | undefined;
    let second: ReturnType<typeof createRuntimeMemoryStore> | undefined;

    try {
      first = createRuntimeMemoryStore({ RECOUP_MEMORY_DB_PATH: dbPath });
      expect(first.mode).toBe("sqlite");
      writeSessionState(first, {
        sessionId: "session-demo",
        key: "active-case",
        value: "ARB-HARBOR-ORDER-640K",
        recordIds: ["ARB-HARBOR-ORDER-640K"]
      });
      first.close();
      first = undefined;

      second = createRuntimeMemoryStore({ RECOUP_MEMORY_DB_PATH: dbPath });
      expect(second.mode).toBe("sqlite");
      expect(readSessionState(second, "session-demo", "active-case")).toMatchObject({
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

  it("falls back to scoped in-memory storage when durable memory is not configured", () => {
    const store = createRuntimeMemoryStore({});

    expect(store.mode).toBe("in_memory");
    writeSessionState(store, {
      sessionId: "session-demo",
      key: "active-case",
      value: "ARB-HARBOR-ORDER-640K",
      recordIds: ["ARB-HARBOR-ORDER-640K"]
    });
    expect(readSessionState(store, "session-demo", "active-case")).toMatchObject({
      payload: { key: "active-case", value: "ARB-HARBOR-ORDER-640K" }
    });
    store.close();
  });

  it("does not validate unrelated connector credentials when opening runtime memory", () => {
    const store = createRuntimeMemoryStore({ SAP_ODATA_BASE_URL: "sap-sandbox-host" });

    expect(store.mode).toBe("in_memory");
    store.close();
  });

  it("fails closed instead of silently downgrading configured Supabase memory to in-memory", () => {
    expect(() =>
      createRuntimeMemoryStore({
        RECOUP_MEMORY_BACKEND: "supabase",
        SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
        SUPABASE_URL: "https://recoup.supabase.co"
      })
    ).toThrow("Supabase memory uses the async repository.");
  });
});
