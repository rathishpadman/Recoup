import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildSupabaseMemorySchemaSql,
  createSupabaseMemoryRepository,
  createSupabaseMemoryRepositoryFromEnv,
  type SupabaseMemoryFetch
} from "../../src/memory/supabaseStore.js";
import type { MemoryRecord } from "../../src/memory/schema.js";

const record: MemoryRecord = {
  id: "session:demo:active-case",
  category: "session_state",
  trustLevel: "trusted",
  scope: "session:demo",
  payload: { key: "active-case", value: "S3-L1" },
  recordIds: ["S3-L1"],
  createdAt: "2026-06-19T00:00:00.000Z"
};

describe("supabase memory repository", () => {
  it("documents a constrained Postgres schema for cited memory records", () => {
    const sql = buildSupabaseMemorySchemaSql("recoup_memory_records");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_memory_records");
    expect(sql).toContain("category text NOT NULL CHECK (category IN");
    expect(sql).toContain("trust_level text NOT NULL CHECK (trust_level IN");
    expect(sql).toContain("payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object')");
    expect(sql).toContain("record_ids_json jsonb NOT NULL");
    expect(sql).toContain("jsonb_typeof(record_ids_json) = 'array'");
    expect(sql).toContain("jsonb_array_length(record_ids_json) > 0");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_recoup_memory_records_id");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_recoup_memory_records_scope_sequence");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_recoup_memory_records_record_ids");
    expect(sql).toContain("ALTER TABLE recoup_memory_records ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE recoup_memory_records FORCE ROW LEVEL SECURITY");
  });

  it("documents server-only auth scaffolding without broad browser policies", () => {
    const sql = buildSupabaseMemorySchemaSql("recoup_memory_records");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_app_principals");
    expect(sql).toContain("capabilities text[] NOT NULL DEFAULT ARRAY[]::text[]");
    expect(sql).toContain("ALTER TABLE recoup_app_principals ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE recoup_app_principals FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_recoup_app_principals_capabilities");
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]+TO\s+(?:anon|authenticated)/iu);
    expect(sql).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("keeps the reviewable SQL artifact aligned with the generated schema", () => {
    expect(readFileSync("docs/supabase-memory-schema.sql", "utf8").trim()).toBe(
      buildSupabaseMemorySchemaSql("recoup_memory_records")
    );
  });

  it("upserts memory through Supabase REST without exposing secret values in returned records", async () => {
    const calls: Array<{ init: RequestInit; url: string }> = [];
    const fetcher: SupabaseMemoryFetch = (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              id: record.id,
              category: record.category,
              trust_level: record.trustLevel,
              scope: record.scope,
              payload_json: record.payload,
              record_ids_json: record.recordIds,
              created_at: record.createdAt
            }
          ]),
          { headers: { "content-type": "application/json" }, status: 201 }
        )
      );
    };
    const repository = createSupabaseMemoryRepository({
      fetcher,
      serviceRoleKey: "supabase-secret-key",
      tableName: "recoup_memory_records",
      url: "https://recoup.supabase.co"
    });

    await expect(repository.append(record)).resolves.toEqual(record);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://recoup.supabase.co/rest/v1/recoup_memory_records?on_conflict=id");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers).toMatchObject({
      apikey: "supabase-secret-key",
      authorization: "Bearer supabase-secret-key",
      prefer: "resolution=merge-duplicates,return=representation"
    });
    expect(JSON.stringify(await repository.append(record))).not.toContain("supabase-secret-key");
  });

  it("reads scoped memory in deterministic sequence order", async () => {
    const calls: Array<{ init: RequestInit; url: string }> = [];
    const fetcher: SupabaseMemoryFetch = (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              id: record.id,
              category: record.category,
              trust_level: record.trustLevel,
              scope: record.scope,
              payload_json: record.payload,
              record_ids_json: record.recordIds,
              created_at: record.createdAt
            }
          ]),
          { headers: { "content-type": "application/json" }, status: 200 }
        )
      );
    };
    const repository = createSupabaseMemoryRepository({
      fetcher,
      serviceRoleKey: "supabase-secret-key",
      tableName: "recoup_memory_records",
      url: "https://recoup.supabase.co"
    });

    await expect(repository.list("session:demo")).resolves.toEqual([record]);
    expect(calls[0]?.url).toBe(
      "https://recoup.supabase.co/rest/v1/recoup_memory_records?scope=eq.session%3Ademo&order=sequence.asc"
    );
    expect(calls[0]?.init.method).toBe("GET");
  });

  it("normalizes Postgres timestamptz rows to the internal ISO memory datetime contract", async () => {
    const fetcher: SupabaseMemoryFetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify([
            {
              id: record.id,
              category: record.category,
              trust_level: record.trustLevel,
              scope: record.scope,
              payload_json: record.payload,
              record_ids_json: record.recordIds,
              created_at: "2026-06-19 00:00:00+00"
            }
          ]),
          { headers: { "content-type": "application/json" }, status: 200 }
        )
      );
    const repository = createSupabaseMemoryRepository({
      fetcher,
      serviceRoleKey: "supabase-secret-key",
      tableName: "recoup_memory_records",
      url: "https://recoup.supabase.co"
    });

    await expect(repository.listAll()).resolves.toEqual([{ ...record, createdAt: "2026-06-19T00:00:00.000Z" }]);
  });

  it("creates a repository only when Supabase memory credentials are explicitly configured", () => {
    expect(createSupabaseMemoryRepositoryFromEnv({})).toBeUndefined();
    expect(
      createSupabaseMemoryRepositoryFromEnv({
        RECOUP_MEMORY_BACKEND: "supabase",
        RECOUP_SUPABASE_MEMORY_TABLE: "recoup_memory_records",
        SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
        SUPABASE_URL: "https://recoup.supabase.co"
      })
    ).toBeDefined();
  });
});
