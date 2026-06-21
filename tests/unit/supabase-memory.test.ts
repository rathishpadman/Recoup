import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  day1GovernedConfigSeed,
  governedConfigSeedRows,
  sha256CanonicalJson
} from "../../config/governed.js";
import {
  buildSupabaseMemorySchemaSql,
  createSupabaseGovernedConfigRepository,
  createSupabaseGovernedConfigRepositoryFromEnv,
  createSupabaseMemoryRepository,
  createSupabaseMemoryRepositoryFromEnv,
  createSupabaseTableReadinessProbe,
  createSupabaseTableReadinessProbeFromEnv,
  type SupabaseMemoryFetch
} from "../../src/memory/supabaseStore.js";
import type { MemoryRecord } from "../../src/memory/schema.js";

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

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

  it("documents Day-1 synthetic source tables behind the Supabase source boundary", () => {
    const sql = buildSupabaseMemorySchemaSql("recoup_memory_records");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_src_bureau");
    expect(sql).toContain("bureau_id text PRIMARY KEY");
    expect(sql).toContain("risk_score int NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100)");
    expect(sql).toContain("limit_recommendation numeric NOT NULL");
    expect(sql).toContain("public_records jsonb NOT NULL CHECK (jsonb_typeof(public_records) = 'object')");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_src_docs");
    expect(sql).toContain("doc_id text PRIMARY KEY");
    expect(sql).toContain("doc_type text NOT NULL CHECK (doc_type IN ('POD', 'contract', 'TPM', 'correspondence'))");
    expect(sql).toContain(
      "linked_record_ids jsonb NOT NULL CHECK (jsonb_typeof(linked_record_ids) = 'array' AND jsonb_array_length(linked_record_ids) > 0)"
    );
    expect(sql).toContain("uri text NOT NULL");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_src_remittance");
    expect(sql).toContain("remit_id text PRIMARY KEY");
    expect(sql).toContain("transaction_set text NOT NULL CHECK (transaction_set IN ('820', '812', '810', 'manual'))");
    expect(sql).toContain("paid_amount numeric NOT NULL");
    expect(sql).toContain("invoice_refs jsonb NOT NULL CHECK (jsonb_typeof(invoice_refs) = 'array')");
    expect(sql).toContain("deduction_refs jsonb NOT NULL CHECK (jsonb_typeof(deduction_refs) = 'array')");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_src_tpm");
    expect(sql).toContain("promo_id text PRIMARY KEY");
    expect(sql).toContain("product_scope jsonb NOT NULL CHECK (jsonb_typeof(product_scope) = 'object')");
    expect(sql).toContain("approved_allowance numeric NOT NULL");
    expect(sql).toContain("accrued_amount numeric NOT NULL");
    expect(sql).toContain("CHECK (window_end >= window_start)");
    expect(sql).toContain("claim_refs jsonb NOT NULL CHECK (jsonb_typeof(claim_refs) = 'array')");

    for (const tableName of ["recoup_src_bureau", "recoup_src_docs", "recoup_src_remittance", "recoup_src_tpm"]) {
      expect(sql).toContain("provenance text NOT NULL CHECK (provenance = 'synthetic')");
      expect(sql).toContain(`REVOKE ALL ON TABLE ${tableName} FROM anon, authenticated, service_role`);
      expect(sql).toContain(`GRANT SELECT ON TABLE ${tableName} TO service_role`);
      expect(sql).not.toMatch(
        new RegExp(`GRANT\\s+[^;]*(?:INSERT|UPDATE|DELETE)[^;]*ON TABLE ${tableName} TO service_role`, "iu")
      );
      expect(sql).toContain(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);
    }
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

  it("adds governed config and append-only audit-chain tables with insert-only service grants", () => {
    const sql = buildSupabaseMemorySchemaSql("recoup_memory_records");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_config");
    expect(sql).toContain("config_version int NOT NULL");
    expect(sql).toContain("key text NOT NULL CHECK (key IN");
    expect(sql).toContain("value_json jsonb NOT NULL CHECK (jsonb_typeof(value_json) = 'object')");
    expect(sql).toContain("config_hash text NOT NULL CHECK (config_hash ~ '^[a-f0-9]{64}$')");
    expect(sql).toContain("approved_by text NOT NULL REFERENCES recoup_app_principals(principal)");
    expect(sql).toContain("PRIMARY KEY (config_version, key)");
    expect(sql).toContain("DROP INDEX IF EXISTS idx_recoup_config_active_key;");
    expect(sql.indexOf("DROP INDEX IF EXISTS idx_recoup_config_active_key;")).toBeLessThan(
      sql.indexOf("CREATE TABLE IF NOT EXISTS recoup_config")
    );
    expect(sql).not.toMatch(/CREATE\s+(?:UNIQUE\s+)?INDEX[^\n]*idx_recoup_config_active_key/iu);
    expect(sql).not.toMatch(/CREATE\s+UNIQUE\s+INDEX[^\n]*recoup_config[^\n]*WHERE\s+active/iu);
    expect(sql).toContain("GRANT SELECT, INSERT ON TABLE recoup_config TO service_role");
    expect(sql).not.toMatch(/GRANT\s+[^;]*(?:UPDATE|DELETE)[^;]*ON TABLE recoup_config/iu);

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_audit_chain");
    expect(sql).toContain("entry_hash text PRIMARY KEY CHECK (entry_hash ~ '^[a-f0-9]{64}$')");
    expect(sql).toContain("prev_hash text CHECK (prev_hash IS NULL OR prev_hash ~ '^[a-f0-9]{64}$')");
    expect(sql).toContain("payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')");
    expect(sql).toContain("seq bigint GENERATED BY DEFAULT AS IDENTITY UNIQUE");
    expect(sql).toContain("GRANT SELECT, INSERT ON TABLE recoup_audit_chain TO service_role");
    expect(sql).not.toMatch(/GRANT\s+[^;]*(?:UPDATE|DELETE)[^;]*ON TABLE recoup_audit_chain/iu);
  });

  it("seeds recoup_config v1 rows for the supplied governed config values", () => {
    const sql = buildSupabaseMemorySchemaSql("recoup_memory_records");

    expect(sql).toContain("INSERT INTO recoup_app_principals (principal, capabilities)");
    expect(sql).toContain("'human:owner-ratified-day-1'");
    expect(sql).toContain("INSERT INTO recoup_config");
    expect(sql).toContain("'arbitration_weights'");
    expect(sql).toContain('{"billing":0.15,"collections":0.25,"credit":0.35,"fulfillment":0.25}');
    expect(sql).toContain("'r_score_weights'");
    expect(sql).toContain('{"agingConcentration":0.2,"disputeRate":0.25,"dsoAdp":0.35,"overLimitFrequency":0.2}');
    expect(sql).toContain("'r_drift'");
    expect(sql).toContain('{"cooldownDays":30,"disputeRateRelativeIncrease":0.5,"dsoIncreaseDays":10,"riskTierDowngrade":1}');
    expect(sql).toContain("'gaming_gate'");
    expect(sql).toContain('{"invalidLineCount":2,"invalidValueFloor":"10000.00","promoCorrelationCount":1,"windowDays":90}');
    expect(sql).toContain("'partial_hold'");
    expect(sql).toContain(
      '{"thresholds":{"holdBelow":40,"maxPartialReleasePercent":70,"minPartialReleasePercent":40,"partialFrom":40,"partialThrough":60,"releaseStepPercent":5,"shipAbove":60},"weights":{"customerStrategicValue":0.15,"dsoPaymentDrift":0.2,"orderMargin":0.15,"orderValueVsExposure":0.2,"paymentPattern":0.15,"revenueForecast":0.15}}'
    );
    expect(sql).toContain("'accuracy_bars'");
    expect(sql).toContain('{"arbitrationAgreement":0.85,"deductionValidityAccuracy":0.9,"intentPrecision":0.9}');
    expect(sql).toContain("'seed'");
    expect(sql).toContain('{"seed":42}');
    expect(sql).toContain("ON CONFLICT (config_version, key) DO NOTHING");
  });

  it("keeps the reviewable SQL artifact aligned with the generated schema", () => {
    expect(normalizeNewlines(readFileSync("docs/supabase-memory-schema.sql", "utf8")).trim()).toBe(
      normalizeNewlines(buildSupabaseMemorySchemaSql("recoup_memory_records"))
    );
  });

  it("loads active governed config rows through Supabase REST with service-role server headers only", async () => {
    const calls: Array<{ init: RequestInit; url: string }> = [];
    const fetcher: SupabaseMemoryFetch = (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(
        new Response(JSON.stringify(toPostgrestGovernedConfigRows()), {
          headers: { "content-type": "application/json" },
          status: 200
        })
      );
    };
    const repository = createSupabaseGovernedConfigRepository({
      fetcher,
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co/"
    });

    const snapshot = await repository.loadActive();

    expect(snapshot).toEqual({
      configHash: day1GovernedConfigSeed.configHash,
      configVersion: 1,
      rowHashes: Object.fromEntries(governedConfigSeedRows.map((row) => [row.key, row.configHash])),
      values: day1GovernedConfigSeed.values
    });
    expect(calls).toHaveLength(1);
    const requestUrl = new URL(calls[0]?.url ?? "");
    expect(`${requestUrl.origin}${requestUrl.pathname}`).toBe("https://recoup.supabase.co/rest/v1/recoup_config");
    expect(requestUrl.searchParams.get("active")).toBe("eq.true");
    expect(requestUrl.searchParams.get("config_version")).toBe("eq.1");
    expect(requestUrl.searchParams.get("select")).toBe(
      "config_version,key,value_json,config_hash,effective_from,approved_by,active"
    );
    expect(requestUrl.searchParams.get("order")).toBe("config_version.asc,key.asc");
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.headers).toEqual({
      apikey: "supabase-service-secret",
      authorization: "Bearer supabase-service-secret"
    });
    expect(JSON.stringify(snapshot)).not.toContain("supabase-service-secret");
  });

  it("constrains governed config loading to v1 so future active versions cannot mix into the snapshot", async () => {
    const calls: Array<{ init: RequestInit; url: string }> = [];
    const fetcher: SupabaseMemoryFetch = (url, init) => {
      calls.push({ url, init });
      const requestUrl = new URL(url);
      const rows =
        requestUrl.searchParams.get("config_version") === "eq.1"
          ? toPostgrestGovernedConfigRows()
          : [...toPostgrestGovernedConfigRows(), ...toPostgrestGovernedConfigRows(2)];

      return Promise.resolve(
        new Response(JSON.stringify(rows), {
          headers: { "content-type": "application/json" },
          status: 200
        })
      );
    };
    const repository = createSupabaseGovernedConfigRepository({
      fetcher,
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(repository.loadActive()).resolves.toMatchObject({
      configHash: day1GovernedConfigSeed.configHash,
      configVersion: 1,
      values: day1GovernedConfigSeed.values
    });
    expect(new URL(calls[0]?.url ?? "").searchParams.get("config_version")).toBe("eq.1");
  });

  it("rejects Supabase governed config rows whose per-key row hash is invalid", async () => {
    const rows = toPostgrestGovernedConfigRows();
    const firstRow = rows[0];

    if (firstRow === undefined) {
      throw new Error("governed config seed rows should not be empty.");
    }

    const fetcher: SupabaseMemoryFetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify([{ ...firstRow, config_hash: sha256CanonicalJson({ tampered: true }) }, ...rows.slice(1)]),
          {
            headers: { "content-type": "application/json" },
            status: 200
          }
        )
      );
    const repository = createSupabaseGovernedConfigRepository({
      fetcher,
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(repository.loadActive()).rejects.toThrow(/row configHash must be sha256\(canonical value_json\)/u);
  });

  it("creates a governed config repository only when Supabase server credentials are configured", () => {
    expect(createSupabaseGovernedConfigRepositoryFromEnv({})).toBeUndefined();
    expect(
      createSupabaseGovernedConfigRepositoryFromEnv({
        SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
        SUPABASE_URL: "https://recoup.supabase.co"
      })
    ).toBeDefined();
  });

  it("probes Supabase Tools_data table readiness with service-role headers and zero-row reads", async () => {
    const calls: Array<{ init: RequestInit; url: string }> = [];
    const fetcher: SupabaseMemoryFetch = (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(new Response(JSON.stringify([]), { headers: { "content-type": "application/json" }, status: 200 }));
    };
    const probe = createSupabaseTableReadinessProbe({
      fetcher,
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co/"
    });

    const result = await probe.probeTables(["customers", "pod_records"]);

    expect(result.tableStatuses).toMatchObject({
      customers: "available",
      pod_records: "available"
    });
    expect(result.unsafeShadowActions).toEqual([]);
    expect(calls[0]?.url).toBe("https://recoup.supabase.co/rest/v1/customers?select=*&limit=0");
    expect(calls[1]?.url).toBe("https://recoup.supabase.co/rest/v1/pod_records?select=*&limit=0");
    expect(calls.some((call) => call.url.includes("billing_requests?select=status&status=in.%28SENT_TO_SAP%29&limit=1"))).toBe(true);
    expect(calls[0]?.init.headers).toEqual({
      apikey: "supabase-service-secret",
      authorization: "Bearer supabase-service-secret"
    });
    expect(JSON.stringify(result)).not.toContain("supabase-service-secret");
  });

  it("classifies missing Supabase Tools_data tables as not found or not exposed", async () => {
    const fetcher: SupabaseMemoryFetch = (url, init) => {
      void init;
      return Promise.resolve(
        new Response(JSON.stringify([]), {
          headers: { "content-type": "application/json" },
          status: url.includes("/pod_records?") ? 404 : 200
        })
      );
    };
    const probe = createSupabaseTableReadinessProbe({
      fetcher,
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co/"
    });

    await expect(probe.probeTables(["customers", "pod_records"])).resolves.toMatchObject({
      tableStatuses: {
        customers: "available",
        pod_records: "not_found_or_not_exposed"
      }
    });
  });

  it("flags unsafe shadow action statuses without returning row identifiers or amounts", async () => {
    const fetcher: SupabaseMemoryFetch = (url, init) => {
      void init;
      const body = url.includes("billing_requests?select=status")
        ? [{ status: "SENT_TO_SAP", request_id: "REQ-SECRET", amount: "999.00" }]
        : [];

      return Promise.resolve(
        new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json" },
          status: 200
        })
      );
    };
    const probe = createSupabaseTableReadinessProbe({
      fetcher,
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co/"
    });

    const result = await probe.probeTables(["billing_requests"]);

    expect(result.unsafeShadowActions).toEqual([
      {
        columnName: "status",
        tableName: "billing_requests",
        value: "SENT_TO_SAP"
      }
    ]);
    expect(JSON.stringify(result)).not.toContain("REQ-SECRET");
    expect(JSON.stringify(result)).not.toContain("999.00");
  });

  it("creates a Supabase table readiness probe only when server credentials are configured", () => {
    expect(createSupabaseTableReadinessProbeFromEnv({})).toBeUndefined();
    expect(
      createSupabaseTableReadinessProbeFromEnv({
        SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
        SUPABASE_URL: "https://recoup.supabase.co"
      })
    ).toBeDefined();
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

function toPostgrestGovernedConfigRows(configVersion = 1) {
  return governedConfigSeedRows.map((row) => ({
    active: row.active,
    approved_by: row.approvedBy,
    config_hash: row.configHash,
    config_version: configVersion,
    effective_from: row.effectiveFrom,
    key: row.key,
    value_json: row.valueJson
  }));
}
