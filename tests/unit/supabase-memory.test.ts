import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  day1GovernedConfigSeed,
  governedConfigSeedRows,
  sha256CanonicalJson
} from "../../config/governed.js";
import {
  buildSupabaseMemorySchemaSql,
  createSupabaseGovernedConfigRepository,
  createSupabaseGovernedConfigRepositoryFromEnv,
  createSupabaseReadModelRepository,
  createSupabaseReadModelRepositoryFromEnv,
  createSupabaseMemoryRepository,
  createSupabaseMemoryRepositoryFromEnv,
  createSupabaseReleaseOwnerInputRepository,
  createSupabaseReleaseOwnerInputRepositoryFromEnv,
  createSupabaseSourceHealthSnapshotRepository,
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

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_src_sap");
    expect(sql).toContain("sap_document_id text PRIMARY KEY");
    expect(sql).toContain("document_type text NOT NULL CHECK (document_type IN ('invoice', 'credit-memo'))");
    expect(sql).toContain("service_name text NOT NULL");
    expect(sql).toContain("entity_set text NOT NULL");
    expect(sql).toContain(
      "linked_record_ids jsonb NOT NULL CHECK (jsonb_typeof(linked_record_ids) = 'array' AND jsonb_array_length(linked_record_ids) > 0)"
    );
    expect(sql).toContain("payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object')");
    expect(sql).toContain("summary text NOT NULL");
    expect(sql).toContain("retrieved_at timestamptz NOT NULL");
    expect(sql).toContain("provenance text NOT NULL CHECK (provenance = 'sap-odata')");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_recoup_src_sap_customer ON recoup_src_sap (customer_id)");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_recoup_src_sap_linked_record_ids ON recoup_src_sap USING gin (linked_record_ids)");

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

    expect(sql).toContain("REVOKE ALL ON TABLE recoup_src_sap FROM anon, authenticated, service_role");
    expect(sql).toContain("GRANT SELECT ON TABLE recoup_src_sap TO service_role");
    expect(sql).not.toMatch(/GRANT\s+[^;]*(?:INSERT|UPDATE|DELETE)[^;]*ON TABLE recoup_src_sap TO service_role/iu);
    expect(sql).toContain("ALTER TABLE recoup_src_sap ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE recoup_src_sap FORCE ROW LEVEL SECURITY");
    expect(sql).not.toMatch(/INSERT\s+INTO\s+recoup_src_sap/iu);
  });

  it("documents a service-role-only source health snapshot table for backend connector polling", () => {
    const sql = buildSupabaseMemorySchemaSql("recoup_memory_records");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_source_health_snapshots");
    expect(sql).toContain("source_name text PRIMARY KEY");
    expect(sql).toContain("status text NOT NULL CHECK (status IN ('connected', 'degraded', 'blocked'))");
    expect(sql).toContain("source_mode text NOT NULL CHECK (source_mode IN ('live', 'synthetic_static_table', 'unavailable'))");
    expect(sql).toContain("checked_at timestamptz NOT NULL");
    expect(sql).toContain("latency_ms int NOT NULL CHECK (latency_ms >= 0)");
    expect(sql).toContain(
      "proof_items_json jsonb NOT NULL CHECK (jsonb_typeof(proof_items_json) = 'array' AND jsonb_array_length(proof_items_json) > 0)"
    );
    expect(sql).toContain(
      "record_ids_json jsonb NOT NULL CHECK (jsonb_typeof(record_ids_json) = 'array' AND jsonb_array_length(record_ids_json) > 0)"
    );
    expect(sql).not.toContain("idx_recoup_source_health_snapshots_checked_at");
    expect(sql).toContain("REVOKE ALL ON TABLE recoup_source_health_snapshots FROM anon, authenticated, service_role");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE ON TABLE recoup_source_health_snapshots TO service_role");
    expect(sql).toContain("ALTER TABLE recoup_source_health_snapshots ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE recoup_source_health_snapshots FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("CREATE POLICY recoup_source_health_snapshots_service_role_select");
    expect(sql).toContain("FOR SELECT TO service_role USING (true)");
    expect(sql).toContain("CREATE POLICY recoup_source_health_snapshots_service_role_insert");
    expect(sql).toContain("FOR INSERT TO service_role WITH CHECK (true)");
    expect(sql).toContain("CREATE POLICY recoup_source_health_snapshots_service_role_update");
    expect(sql).toContain("FOR UPDATE TO service_role USING (true) WITH CHECK (true)");
    expect(sql).not.toMatch(/CREATE POLICY\s+recoup_source_health_snapshots[\s\S]+TO\s+(?:anon|authenticated)/iu);
  });

  it("documents a service-role-only cockpit read-model table for fast source-derived page loads", () => {
    const sql = buildSupabaseMemorySchemaSql("recoup_memory_records");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_cockpit_read_models");
    expect(sql).toContain("model_key text PRIMARY KEY");
    expect(sql).toContain("surface text NOT NULL CHECK (surface IN ('forensics-analyst', 'connector-readiness'))");
    expect(sql).toContain("persona text NOT NULL CHECK (persona IN ('maya'))");
    expect(sql).toContain("payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object')");
    expect(sql).toContain(
      "source_record_ids_json jsonb NOT NULL CHECK (jsonb_typeof(source_record_ids_json) = 'array' AND jsonb_array_length(source_record_ids_json) > 0)"
    );
    expect(sql).toContain("payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$')");
    expect(sql).toContain("source_refreshed_at timestamptz NOT NULL");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_recoup_cockpit_read_models_surface_persona");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_recoup_cockpit_read_models_record_ids");
    expect(sql).toContain("REVOKE ALL ON TABLE recoup_cockpit_read_models FROM anon, authenticated, service_role");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE ON TABLE recoup_cockpit_read_models TO service_role");
    expect(sql).toContain("ALTER TABLE recoup_cockpit_read_models ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE recoup_cockpit_read_models FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("CREATE POLICY recoup_cockpit_read_models_service_role_select");
    expect(sql).not.toMatch(/CREATE POLICY\s+recoup_cockpit_read_models[\s\S]+TO\s+(?:anon|authenticated)/iu);
  });

  it("documents service-role-only evals and FinOps tables for governed agent economics", () => {
    const sql = buildSupabaseMemorySchemaSql("recoup_memory_records");
    const evalFinopsTables = [
      "recoup_agent_usage_runs",
      "recoup_eval_gate_runs",
      "recoup_eval_gate_results",
      "recoup_model_pricing",
      "recoup_openai_cost_buckets",
      "recoup_finops_daily_rollups",
      "recoup_finops_recommendations"
    ];

    for (const tableName of evalFinopsTables) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`);
      expect(sql).toContain(`REVOKE ALL ON TABLE ${tableName} FROM anon, authenticated, service_role`);
      expect(sql).toContain(`GRANT SELECT, INSERT, UPDATE ON TABLE ${tableName} TO service_role`);
      expect(sql).not.toMatch(new RegExp(`GRANT\\s+[^;]*DELETE[^;]*ON TABLE ${tableName} TO service_role`, "iu"));
      expect(sql).toContain(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);
      expect(sql).toContain(`CREATE POLICY ${tableName}_service_role_select`);
      expect(sql).toContain(`CREATE POLICY ${tableName}_service_role_insert`);
      expect(sql).toContain(`CREATE POLICY ${tableName}_service_role_update`);
      expect(sql).not.toMatch(new RegExp(`CREATE POLICY\\s+${tableName}[\\s\\S]+TO\\s+(?:anon|authenticated)`, "iu"));
    }

    expect(sql).toContain("usage_run_id text PRIMARY KEY");
    expect(sql).toContain("status text NOT NULL CHECK (status IN ('succeeded', 'blocked', 'failed'))");
    expect(sql).toContain("input_tokens int NOT NULL CHECK (input_tokens >= 0)");
    expect(sql).toContain("cached_input_tokens int NOT NULL CHECK (cached_input_tokens >= 0)");
    expect(sql).toContain("uncached_input_tokens int NOT NULL CHECK (uncached_input_tokens >= 0)");
    expect(sql).toContain("total_tokens int NOT NULL CHECK (total_tokens >= 0)");
    expect(sql).toContain(
      "record_ids_json jsonb NOT NULL CHECK (jsonb_typeof(record_ids_json) = 'array' AND jsonb_array_length(record_ids_json) > 0)"
    );
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_recoup_agent_usage_runs_created_agent_model");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_recoup_agent_usage_runs_workflow_agent_model");

    expect(sql).toContain("release_status text NOT NULL CHECK (release_status IN ('pass', 'fail', 'blocked'))");
    expect(sql).toContain("source_mode text NOT NULL CHECK (source_mode IN ('live_supabase', 'local_fixture', 'blocked'))");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_recoup_eval_gate_runs_completed_at");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_recoup_eval_gate_results_eval_run_gate");

    expect(sql).toContain("input_per_1m_tokens numeric NOT NULL CHECK (input_per_1m_tokens >= 0)");
    expect(sql).toContain("cached_input_per_1m_tokens numeric NOT NULL CHECK (cached_input_per_1m_tokens >= 0)");
    expect(sql).toContain("approved_by text NOT NULL REFERENCES recoup_app_principals(principal)");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_recoup_model_pricing_active_model_tier");

    expect(sql).toContain("provenance text NOT NULL CHECK (provenance = 'openai_org_cost_api')");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_recoup_openai_cost_buckets_bucket_model");

    expect(sql).toContain(
      "cost_status text NOT NULL CHECK (cost_status IN ('computed_from_owner_pricing', 'reconciled_from_provider_cost_api', 'pricing_not_configured_not_computed'))"
    );
    expect(sql).toContain(
      "prompt_cache_savings_status text NOT NULL CHECK (prompt_cache_savings_status IN ('computed_from_owner_pricing', 'pricing_not_configured_not_computed', 'no_cached_tokens_observed'))"
    );
    expect(sql).toContain("disputed_amount numeric NOT NULL CHECK (disputed_amount >= 0)");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_recoup_finops_daily_rollups_date_agent_model");

    expect(sql).toContain(
      "recommendation_type text NOT NULL CHECK (recommendation_type IN ('quality_gate', 'pricing_config', 'token_budget', 'prompt_cache', 'batch_eval', 'guardrail_regression', 'model_routing', 'source_gap'))"
    );
    expect(sql).toContain("requires_human_approval boolean NOT NULL");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_recoup_finops_recommendations_status_severity");
  });

  it("round-trips source-derived cockpit read models through Supabase without exposing browser credentials", async () => {
    const calls: Array<{ body?: string; method?: string; url: string }> = [];
    const storedRows: unknown[] = [];
    const fetcher: SupabaseMemoryFetch = (url, init) => {
      const call: { body?: string; method?: string; url: string } = { url };
      if (typeof init.body === "string") {
        call.body = init.body;
      }
      if (init.method !== undefined) {
        call.method = init.method;
      }
      calls.push(call);
      expect(init.headers).toMatchObject({
        apikey: "supabase-secret-key",
        authorization: "Bearer supabase-secret-key"
      });

      if (init.method === "POST") {
        const rows = JSON.parse(init.body as string) as unknown;
        expect(Array.isArray(rows)).toBe(true);
        storedRows.splice(0, storedRows.length, ...(rows as unknown[]));
        return Promise.resolve(new Response(JSON.stringify(storedRows), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify(storedRows), { status: 200 }));
    };
    const repository = createSupabaseReadModelRepository({
      fetcher,
      serviceRoleKey: "supabase-secret-key",
      url: "https://recoup.supabase.co"
    });
    const payload = {
      surface: "forensics-analyst",
      worklist: [{ lineId: "S6-L1" }]
    };

    await repository.upsert({
      modelKey: "maya:forensics",
      payload,
      payloadHash: sha256CanonicalJson(payload),
      persona: "maya",
      sourceRecordIds: ["S6-L1", "recoup_deduction_lines"],
      sourceRefreshedAt: "2026-06-29T00:00:00.000Z",
      surface: "forensics-analyst"
    });
    const loaded = await repository.load("maya:forensics");

    expect(loaded).toMatchObject({
      modelKey: "maya:forensics",
      payload,
      persona: "maya",
      sourceRecordIds: ["S6-L1", "recoup_deduction_lines"],
      surface: "forensics-analyst"
    });
    expect(calls[0]?.url).toContain("/rest/v1/recoup_cockpit_read_models?on_conflict=model_key");
    expect(calls[1]?.url).toContain("/rest/v1/recoup_cockpit_read_models");
    expect(calls[1]?.url).toContain("model_key=eq.maya%3Aforensics");
    expect(createSupabaseReadModelRepositoryFromEnv({ SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key" }, fetcher)).toBeUndefined();
    expect(
      createSupabaseReadModelRepositoryFromEnv(
        { SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key", SUPABASE_URL: "https://recoup.supabase.co" },
        fetcher
      )
    ).toBeDefined();
  });

  it("documents Supabase Tools_data tables required by connector readiness and Sentinel risk observations", () => {
    const sql = buildSupabaseMemorySchemaSql("recoup_memory_records");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS customers");
    expect(sql).toContain("customer_id text PRIMARY KEY");
    expect(sql).toContain("r_score_component_scores_json jsonb");
    expect(sql).toContain("r_score_component_scores_json ?& ARRAY['agingConcentration', 'disputeRate', 'dsoAdp', 'overLimitFrequency']");
    expect(sql).toContain("(r_score_component_scores_json->>'overLimitFrequency')::numeric BETWEEN 0 AND 100");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS payments");
    expect(sql).toContain("payment_id text PRIMARY KEY DEFAULT gen_random_uuid()::text");
    expect(sql).toContain("days_to_pay int NOT NULL CHECK (days_to_pay >= 0)");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS bureau_alerts");
    expect(sql).toContain("alert_id text PRIMARY KEY DEFAULT gen_random_uuid()::text");
    expect(sql).toContain("alert_type text NOT NULL");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS deductions_backlog");
    expect(sql).toContain("deduction_id text PRIMARY KEY DEFAULT gen_random_uuid()::text");
    expect(sql).toContain("line_ref text");
    expect(sql).toContain("verdict text NOT NULL CHECK (verdict IN ('PENDING', 'VALID', 'INVALID', 'PARTIAL'))");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS pod_records");
    expect(sql).toContain("pod_id text PRIMARY KEY DEFAULT gen_random_uuid()::text");
    expect(sql).toContain("shipped_qty int NOT NULL CHECK (shipped_qty >= 0)");
    expect(sql).toContain("signed_qty int NOT NULL CHECK (signed_qty >= 0)");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS carrier_reports");
    expect(sql).toContain("report_status text NOT NULL DEFAULT 'SUBMITTED' CHECK (report_status IN ('SUBMITTED', 'VERIFIED', 'REJECTED'))");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS damage_photos");
    expect(sql).toContain("photo_url text NOT NULL");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS promotions");
    expect(sql).toContain("promo_id text PRIMARY KEY");
    expect(sql).toContain("accrual_cap numeric NOT NULL DEFAULT 0");
    expect(sql).toContain("CHECK (end_date >= start_date)");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS contracts");
    expect(sql).toContain("contract_id text PRIMARY KEY");
    expect(sql).toContain("pricing_terms jsonb CHECK (pricing_terms IS NULL OR jsonb_typeof(pricing_terms) = 'object')");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS remittance_headers");
    expect(sql).toContain("remittance_id text PRIMARY KEY DEFAULT gen_random_uuid()::text");
    expect(sql).toContain("total_deductions numeric NOT NULL DEFAULT 0");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS remittance_lines");
    expect(sql).toContain("line_id text PRIMARY KEY DEFAULT gen_random_uuid()::text");
    expect(sql).toContain("deducted_amount numeric NOT NULL");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS billing_requests");
    expect(sql).toContain("type text NOT NULL CHECK (type IN ('CREDIT_MEMO', 'CREDIT_AND_REBILL', 'WRITE_OFF'))");
    expect(sql).toContain("status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'SENT_TO_SAP', 'CONFIRMED'))");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS recovery_packages");
    expect(sql).toContain("status text NOT NULL DEFAULT 'GENERATED' CHECK (status IN ('GENERATED', 'SUBMITTED_TO_PORTAL', 'PAID', 'ABANDONED'))");
    expect(sql).toContain("follow_up_cadence_count int NOT NULL DEFAULT 0 CHECK (follow_up_cadence_count >= 0)");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS credit_decisions");
    expect(sql).toContain("decision_verdict text NOT NULL DEFAULT 'PROPOSED' CHECK (decision_verdict IN ('PROPOSED', 'APPROVED', 'OVERRIDDEN', 'REJECTED'))");
    expect(sql).toContain("negotiation_log jsonb CHECK (negotiation_log IS NULL OR jsonb_typeof(negotiation_log) = 'object')");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS immutable_audit_log");
    expect(sql).toContain("action_type text NOT NULL");
    expect(sql).toContain("payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object')");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_pod_records_invoice");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_remittance_lines_invoice_ref");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_immutable_audit_log_ref");

    const toolsDataTableNames = [
      "customers",
      "payments",
      "pod_records",
      "carrier_reports",
      "damage_photos",
      "promotions",
      "contracts",
      "bureau_alerts",
      "remittance_headers",
      "remittance_lines",
      "deductions_backlog",
      "billing_requests",
      "recovery_packages",
      "credit_decisions",
      "immutable_audit_log"
    ];

    for (const tableName of toolsDataTableNames) {
      expect(sql).toContain(`REVOKE ALL ON TABLE ${tableName} FROM anon, authenticated, service_role`);
      expect(sql).toContain(`GRANT SELECT ON TABLE ${tableName} TO service_role`);
      expect(sql).not.toMatch(
        new RegExp(`GRANT\\s+[^;]*(?:INSERT|UPDATE|DELETE)[^;]*ON TABLE ${tableName} TO service_role`, "iu")
      );
      expect(sql).toContain(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`);
    }
  });

  it("documents Supabase settlement source tables required by Forensics and CFO read models", () => {
    const sql = buildSupabaseMemorySchemaSql("recoup_memory_records");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_customers");
    expect(sql).toContain("customer_id text PRIMARY KEY");
    expect(sql).toContain("profile text NOT NULL");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_deduction_lines");
    expect(sql).toContain("line_id text PRIMARY KEY");
    expect(sql).toContain("scenario_id text NOT NULL CHECK (scenario_id IN ('S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'))");
    expect(sql).toContain("customer_id text NOT NULL REFERENCES recoup_customers(customer_id)");
    expect(sql).toContain("amount numeric NOT NULL");
    expect(sql).toContain("verdict text NOT NULL CHECK (verdict IN ('valid', 'invalid', 'partial'))");
    expect(sql).toContain("routing text NOT NULL CHECK (routing IN ('billing', 'recovery'))");
    expect(sql).toContain(
      "record_ids_json jsonb NOT NULL CHECK (jsonb_typeof(record_ids_json) = 'array' AND jsonb_array_length(record_ids_json) > 0)"
    );
    expect(sql).toContain("event_id text NOT NULL CHECK (event_id ~ '^[a-f0-9]{64}$')");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_recoup_deduction_lines_customer_scenario");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_recoup_deduction_lines_record_ids");

    for (const tableName of ["recoup_customers", "recoup_deduction_lines"]) {
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

  it("loads and upserts Supabase source health snapshots through service-role REST", async () => {
    const fetcher = vi.fn<SupabaseMemoryFetch>((url, init) => {
      if (init.method === "GET") {
        expect(url).toContain("/rest/v1/recoup_source_health_snapshots");
        expect(url).toContain("select=source_name%2Cstatus%2Csource_mode%2Cchecked_at%2Clatency_ms%2Cproof_items_json%2Crecord_ids_json%2Clast_error");
        return Promise.resolve(
          Response.json([
            {
              checked_at: "2026-06-24T10:16:00+00:00",
              last_error: null,
              latency_ms: 128,
              proof_items_json: ["read-only metadata probe", "credentials present", "external writes blocked"],
              record_ids_json: ["sap-odata", "ZUI_BILLINGDOCUMENTFS_0001"],
              source_mode: "live",
              source_name: "sap-odata",
              status: "connected"
            }
          ])
        );
      }

      expect(init.method).toBe("POST");
      expect(url).toBe("https://recoup.supabase.co/rest/v1/recoup_source_health_snapshots?on_conflict=source_name");
      expect(init.headers).toMatchObject({
        apikey: "service-role-secret",
        authorization: "Bearer service-role-secret",
        prefer: "resolution=merge-duplicates,return=representation"
      });
      expect(typeof init.body).toBe("string");
      expect(JSON.parse(init.body as string)).toEqual([
        {
          checked_at: "2026-06-24T10:16:00.000Z",
          last_error: null,
          latency_ms: 128,
          proof_items_json: ["read-only metadata probe", "credentials present", "external writes blocked"],
          record_ids_json: ["sap-odata", "ZUI_BILLINGDOCUMENTFS_0001"],
          source_mode: "live",
          source_name: "sap-odata",
          status: "connected"
        }
      ]);
      return Promise.resolve(Response.json([]));
    });
    const repository = createSupabaseSourceHealthSnapshotRepository({
      fetcher,
      serviceRoleKey: "service-role-secret",
      url: "https://recoup.supabase.co/"
    });

    const snapshots = await repository.loadLatest();
    expect(snapshots).toEqual([
      {
        checkedAtIso: "2026-06-24T10:16:00.000Z",
        latencyMs: 128,
        proofItems: ["read-only metadata probe", "credentials present", "external writes blocked"],
        recordIds: ["sap-odata", "ZUI_BILLINGDOCUMENTFS_0001"],
        sourceMode: "live",
        sourceName: "sap-odata",
        status: "connected"
      }
    ]);

    await repository.upsert(snapshots);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("adds governed config and append-only audit-chain tables with locked RPC service grants", () => {
    const sql = buildSupabaseMemorySchemaSql("recoup_memory_records");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_config");
    expect(sql).toContain("config_version int NOT NULL");
    expect(sql).toContain("key text NOT NULL CHECK (key IN");
    expect(sql).toContain("'run_control'");
    expect(sql).toContain("'release_eval_label_manifest'");
    expect(sql).toContain("'intent_eval_labels'");
    expect(sql).toContain("'arbitration_eval_labels'");
    expect(sql).toContain("'decision_confidence_threshold'");
    expect(sql).toContain("'decision_confidence_threshold', '{\"threshold\":0.8}'::jsonb");
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
    expect(sql).toContain("GRANT SELECT ON TABLE recoup_audit_chain TO service_role");
    expect(sql).not.toMatch(/GRANT\s+[^;]*INSERT[^;]*ON TABLE recoup_audit_chain/iu);
    expect(sql).not.toMatch(/GRANT\s+[^;]*(?:UPDATE|DELETE)[^;]*ON TABLE recoup_audit_chain/iu);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION recoup_commit_approval_audit(");
    expect(sql).toContain("IF p_memory_table_name <> 'recoup_memory_records' THEN");
    expect(sql).toContain("LOCK TABLE recoup_audit_chain IN EXCLUSIVE MODE;");
    expect(sql).toContain("p_expected_prev_hash IS NOT DISTINCT FROM current_tail_hash");
    expect(sql).toContain("INSERT INTO recoup_audit_chain (entry_hash, prev_hash, payload)");
    expect(sql).toContain("INSERT INTO %I (id, category, trust_level, scope, payload_json, record_ids_json, created_at)");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION recoup_reset_demo_approval_lifecycle(");
    expect(sql).toContain("p_audit_category <> 'audit_refs'");
    expect(sql).toContain("DELETE FROM %I");
    expect(sql).toContain("id = $1");
    expect(sql).toContain("scope = $2");
    expect(sql).toContain("category = ''approval_records''");
    expect(sql).toContain("jsonb_build_object(''deletedRecordCount'', (SELECT value FROM deleted_count))");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION recoup_commit_approval_audit(text, text, text, jsonb, text, text, text, text, text, jsonb, jsonb, timestamptz) FROM PUBLIC, anon, authenticated, service_role"
    );
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION recoup_commit_approval_audit");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION recoup_reset_demo_approval_lifecycle(text, text, text, text, text, text, text, jsonb, jsonb, timestamptz) FROM PUBLIC, anon, authenticated, service_role"
    );
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION recoup_reset_demo_approval_lifecycle");
    expect(sql).not.toMatch(/GRANT\s+[^;]*(?:UPDATE|DELETE)[^;]*ON FUNCTION recoup_commit_approval_audit/iu);
    expect(sql).not.toMatch(/GRANT\s+[^;]*DELETE[^;]*ON TABLE recoup_memory_records/iu);
  });

  it("seeds Round 2 source-owned R-score component values for all four Tools_data customers", () => {
    const sql = buildSupabaseMemorySchemaSql("recoup_memory_records");

    expect(sql).toContain(
      "'USCU_S04', '{\"agingConcentration\":60,\"disputeRate\":71,\"dsoAdp\":70,\"overLimitFrequency\":70}'::jsonb"
    );
    expect(sql).toContain(
      "'USCU_L10', '{\"agingConcentration\":15,\"disputeRate\":73.1,\"dsoAdp\":10,\"overLimitFrequency\":0}'::jsonb"
    );
    expect(sql).toContain(
      "'USCU_S07', '{\"agingConcentration\":20,\"disputeRate\":56.4,\"dsoAdp\":15,\"overLimitFrequency\":0}'::jsonb"
    );
    expect(sql).toContain(
      "'USCU_S03', '{\"agingConcentration\":25,\"disputeRate\":0,\"dsoAdp\":20,\"overLimitFrequency\":0}'::jsonb"
    );
  });

  it("seeds recoup_config v1 rows for the supplied governed config values", () => {
    const sql = buildSupabaseMemorySchemaSql("recoup_memory_records");

    expect(sql).toContain("INSERT INTO recoup_app_principals (principal, capabilities)");
    expect(sql).toContain("'human:owner-ratified-day-1'");
    expect(sql).toContain("INSERT INTO recoup_config");
    expect(sql).toContain("'arbitration_weights'");
    expect(sql).toContain('{"billing":0.15,"collections":0.2,"credit":0.35,"fulfillment":0.3}');
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
    expect(sql).toContain("'risk_mesh_cases'");
    expect(sql).toContain('"orderAmount":"640010.00"');
    expect(sql).toContain('"terms":"2/10 Net-30 + 25% deposit"');
    expect(sql).toContain("'seed'");
    expect(sql).toContain('{"seed":42}');
    expect(sql).toContain("ON CONFLICT (config_version, key) DO NOTHING");
  });

  it("seeds non-secret release owner-input rows from the checked-in Supabase setup", () => {
    const sql = buildSupabaseMemorySchemaSql("recoup_memory_records");

    expect(sql).toContain("'human:rathish-owner'");
    expect(sql).toContain("'run_control'");
    expect(sql).toContain('"forensics":{"retryCap":2,"stepBudget":80,"tokenBudget":200000}');
    expect(sql).toContain("'release_eval_label_manifest'");
    expect(sql).toContain('"arbitrationCaseIds":["arb:harbor-order-6534"]');
    expect(sql).toContain("'intent_eval_labels'");
    expect(sql).toContain('"caseId":"intent:USCU_L10"');
    expect(sql).toContain("'arbitration_eval_labels'");
    expect(sql).toContain('"expectedRanking":["partial_release_55","full_release_revised_terms","full_release_100","full_hold_0"]');
    expect(sql).toContain("'77dfb2833f50f78331984258e15ec5477feb8a330a13db6f5cdc551bb980b6d5'");
    expect(sql).toContain("'246b86ea6db527a4209956412a8e92bb1726dbc0d7124c6953712e88ede22a0d'");
    expect(sql).toContain("'a58cd791f61e56c2679c74b0263bb7fded555caae14437b2b1e68a9690c9d697'");
  });

  it("seeds settlement source rows into Supabase instead of relying on runtime static values", () => {
    const sql = buildSupabaseMemorySchemaSql("recoup_memory_records");

    expect(sql).toContain("INSERT INTO recoup_customers (customer_id, name, profile)");
    expect(sql).toContain("('CUST-HARBOR', 'Harbor Foods', 'Foodservice distributor')");
    expect(sql).toContain("INSERT INTO recoup_deduction_lines (");
    expect(sql).toContain("'S1-L1', 'S1', 'CUST-GREENLEAF'");
    expect(sql).toContain("'Damaged product, evidence received', 2700.00, 'valid', 'billing'");
    expect(sql).toContain("'S6-L1', 'S6', 'CUST-CRESTLINE'");
    expect(sql).toContain("ON CONFLICT (customer_id) DO NOTHING");
    expect(sql).toContain("ON CONFLICT (line_id) DO NOTHING");
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
    expect(requestUrl.searchParams.get("key")).toBe(
      "in.(arbitration_weights,r_score_weights,r_drift,gaming_gate,partial_hold,accuracy_bars,risk_mesh_cases,seed)"
    );
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

  it("loads release owner inputs from recoup_config without hardcoded release values", async () => {
    const calls: Array<{ init: RequestInit; url: string }> = [];
    const fetcher: SupabaseMemoryFetch = (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(
        new Response(JSON.stringify(toPostgrestReleaseOwnerInputRows()), {
          headers: { "content-type": "application/json" },
          status: 200
        })
      );
    };
    const repository = createSupabaseReleaseOwnerInputRepository({
      fetcher,
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co/"
    });

    const snapshot = await repository.loadActive();

    expect(snapshot.runControlConfig.phases.forensics).toEqual({
      retryCap: 2,
      stepBudget: 80,
      tokenBudget: 200000
    });
    expect(snapshot.labelManifest.intentCaseIds).toEqual([
      "intent:USCU_L10",
      "intent:USCU_S04",
      "intent:USCU_S07",
      "intent:USCU_S03"
    ]);
    expect(snapshot.intentLabels.labels.map((label) => label.actual)).toEqual([
      "gaming",
      "distressed-honest",
      "genuine",
      "genuine"
    ]);
    expect(snapshot.arbitrationLabels.labels[0]?.actual).toBe(
      "partial-release-55|ship=352005.50|backorder=288004.50|terms=2/10 Net-30 + 25% deposit"
    );
    expect(snapshot.decisionConfidenceThreshold).toBeUndefined();
    const requestUrl = new URL(calls[0]?.url ?? "");
    expect(`${requestUrl.origin}${requestUrl.pathname}`).toBe("https://recoup.supabase.co/rest/v1/recoup_config");
    expect(requestUrl.searchParams.get("key")).toBe(
      "in.(run_control,release_eval_label_manifest,intent_eval_labels,arbitration_eval_labels,decision_confidence_threshold)"
    );
    expect(calls[0]?.init.headers).toEqual({
      apikey: "supabase-service-secret",
      authorization: "Bearer supabase-service-secret"
    });
    expect(JSON.stringify(snapshot)).not.toContain("supabase-service-secret");
  });

  it("parses optional release owner-input decision confidence threshold rows when present", async () => {
    const thresholdValueJson = { threshold: 0.73 };
    const repository = createSupabaseReleaseOwnerInputRepository({
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify([...toPostgrestReleaseOwnerInputRows(), toPostgrestDecisionConfidenceThresholdRow(thresholdValueJson)]),
            {
              headers: { "content-type": "application/json" },
              status: 200
            }
          )
        ),
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    const snapshot = await repository.loadActive();

    expect(snapshot.decisionConfidenceThreshold).toEqual({
      approvedBy: "human:rathish-owner",
      threshold: 0.73
    });
    expect(snapshot.rowHashes.decision_confidence_threshold).toBe(sha256CanonicalJson(thresholdValueJson));
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.decisionConfidenceThreshold)).toBe(true);
    expect(Object.isFrozen(snapshot.rowHashes)).toBe(true);
  });

  it("rejects optional release owner-input decision confidence threshold rows whose hash is invalid", async () => {
    const rows = [
      ...toPostgrestReleaseOwnerInputRows(),
      {
        ...toPostgrestDecisionConfidenceThresholdRow({ threshold: 0.73 }),
        config_hash: sha256CanonicalJson({ tampered: true })
      }
    ];
    const repository = createSupabaseReleaseOwnerInputRepository({
      fetcher: () =>
        Promise.resolve(
          new Response(JSON.stringify(rows), {
            headers: { "content-type": "application/json" },
            status: 200
          })
        ),
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(repository.loadActive()).rejects.toThrow(/row configHash must be sha256\(canonical value_json\)/u);
  });

  it("rejects optional release owner-input decision confidence threshold rows outside the approved range", async () => {
    const repository = createSupabaseReleaseOwnerInputRepository({
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify([...toPostgrestReleaseOwnerInputRows(), toPostgrestDecisionConfidenceThresholdRow({ threshold: 1.1 })]),
            {
              headers: { "content-type": "application/json" },
              status: 200
            }
          )
        ),
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(repository.loadActive()).rejects.toThrow(
      /valueJson must match the release owner-input schema for decision_confidence_threshold/u
    );
  });

  it("rejects release owner-input rows whose per-key row hash is invalid", async () => {
    const rows = toPostgrestReleaseOwnerInputRows();
    const firstRow = rows[0];

    if (firstRow === undefined) {
      throw new Error("release owner input rows should not be empty.");
    }

    const repository = createSupabaseReleaseOwnerInputRepository({
      fetcher: () =>
        Promise.resolve(
          new Response(JSON.stringify([{ ...firstRow, config_hash: sha256CanonicalJson({ tampered: true }) }, ...rows.slice(1)]), {
            headers: { "content-type": "application/json" },
            status: 200
          })
        ),
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(repository.loadActive()).rejects.toThrow(/row configHash must be sha256\(canonical value_json\)/u);
  });

  it("creates a release owner-input repository only when Supabase server credentials are configured", () => {
    expect(createSupabaseReleaseOwnerInputRepositoryFromEnv({})).toBeUndefined();
    expect(
      createSupabaseReleaseOwnerInputRepositoryFromEnv({
        SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
        SUPABASE_URL: "https://recoup.supabase.co"
      })
    ).toBeDefined();
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

  it("treats an accepted Supabase memory upsert with no returned row as the parsed input record", async () => {
    const repository = createSupabaseMemoryRepository({
      fetcher: () =>
        Promise.resolve(new Response(JSON.stringify([]), { headers: { "content-type": "application/json" }, status: 201 })),
      serviceRoleKey: "supabase-secret-key",
      tableName: "recoup_memory_records",
      url: "https://recoup.supabase.co"
    });

    await expect(repository.append(record)).resolves.toEqual(record);
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

  it("resets demo approval lifecycle through a locked RPC instead of raw table delete", async () => {
    const auditRecord: MemoryRecord = {
      category: "audit_refs",
      createdAt: "2026-06-27T08:00:00.000Z",
      id: "admin-reset:route-billing:S1-L1:reset-1",
      payload: {
        actionId: "route-billing:S1-L1",
        deletedRecordCount: 1,
        operation: "demo_lifecycle_reset",
        operatorPrincipal: "human:cfo-lead",
        preservedSourceData: true,
        resetScope: "approval:route-billing:S1-L1"
      },
      recordIds: ["route-billing:S1-L1"],
      scope: "admin-reset:route-billing:S1-L1",
      trustLevel: "trusted"
    };
    const calls: Array<{ init: RequestInit; url: string }> = [];
    const fetcher: SupabaseMemoryFetch = (url, init) => {
      calls.push({ init, url });
      return Promise.resolve(
        new Response(JSON.stringify([{ deleted_record_count: 1 }]), {
          headers: { "content-type": "application/json" },
          status: 200
        })
      );
    };
    const repository = createSupabaseMemoryRepository({
      fetcher,
      serviceRoleKey: "supabase-secret-key",
      tableName: "recoup_memory_records",
      url: "https://recoup.supabase.co"
    });

    await expect(
      repository.resetApprovalLifecycle({
        approvalRecordId: "approval:route-billing:S1-L1",
        approvalScope: "approval:route-billing:S1-L1",
        auditRecord
      })
    ).resolves.toBe(1);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://recoup.supabase.co/rest/v1/rpc/recoup_reset_demo_approval_lifecycle");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers).toMatchObject({
      apikey: "supabase-secret-key",
      authorization: "Bearer supabase-secret-key",
      prefer: "resolution=merge-duplicates,return=representation"
    });
    const rpcBody = calls[0]?.init.body;
    if (typeof rpcBody !== "string") {
      throw new Error("Supabase reset RPC test did not receive a serialized request body.");
    }
    expect(JSON.parse(rpcBody)).toEqual({
      p_approval_id: "approval:route-billing:S1-L1",
      p_approval_scope: "approval:route-billing:S1-L1",
      p_audit_category: "audit_refs",
      p_audit_created_at: auditRecord.createdAt,
      p_audit_id: auditRecord.id,
      p_audit_payload_json: auditRecord.payload,
      p_audit_record_ids_json: auditRecord.recordIds,
      p_audit_scope: auditRecord.scope,
      p_audit_trust_level: "trusted",
      p_memory_table_name: "recoup_memory_records"
    });
    expect(calls.some((call) => call.init.method === "DELETE")).toBe(false);
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

function toPostgrestReleaseOwnerInputRows() {
  return [
    {
      active: true,
      approved_by: "human:rathish-owner",
      config_hash: "77dfb2833f50f78331984258e15ec5477feb8a330a13db6f5cdc551bb980b6d5",
      config_version: 1,
      effective_from: "2026-06-22T00:00:00.000Z",
      key: "run_control",
      value_json: {
        phases: {
          containment: { retryCap: 2, stepBudget: 24, tokenBudget: 45000 },
          forensics: { retryCap: 2, stepBudget: 80, tokenBudget: 200000 },
          query: { retryCap: 1, stepBudget: 12, tokenBudget: 32000 },
          recovery: { retryCap: 2, stepBudget: 40, tokenBudget: 90000 },
          riskMesh: { retryCap: 2, stepBudget: 36, tokenBudget: 90000 },
          sentinel: { retryCap: 2, stepBudget: 30, tokenBudget: 70000 }
        }
      }
    },
    {
      active: true,
      approved_by: "human:rathish-owner",
      config_hash: "66ae8d96a0ece2964fc7283d75212098f120b24b048bcce1f0dc103913663e82",
      config_version: 1,
      effective_from: "2026-06-22T00:00:00.000Z",
      key: "release_eval_label_manifest",
      value_json: {
        arbitrationCaseIds: ["arb:harbor-order-6534"],
        intentCaseIds: ["intent:USCU_L10", "intent:USCU_S04", "intent:USCU_S07", "intent:USCU_S03"]
      }
    },
    {
      active: true,
      approved_by: "human:rathish-owner",
      config_hash: "a0038f6bcb79cade73cb5264c41c28ba1a223063ee67779fbfd196214893efc6",
      config_version: 1,
      effective_from: "2026-06-22T00:00:00.000Z",
      key: "intent_eval_labels",
      value_json: {
        labels: [
          {
            actual: "gaming",
            caseId: "intent:USCU_L10",
            modelCustomerId: "CUST-CRESTLINE",
            recordIds: ["S3-L1", "POD-SIGNED-1", "S6-L1", "PRICE-CLAUSE-1"],
            sapCustomerId: "USCU_L10"
          },
          {
            actual: "distressed-honest",
            caseId: "intent:USCU_S04",
            modelCustomerId: "CUST-HARBOR",
            recordIds: ["FIN-DISP-202", "BUREAU-HARBOR-TAX-LIEN", "90000036", "90000085"],
            sapCustomerId: "USCU_S04"
          },
          {
            actual: "genuine",
            caseId: "intent:USCU_S07",
            modelCustomerId: "CUST-VALUMART",
            recordIds: ["S4-L1", "SLA-CONTRACT-1", "S5-L1", "POD-TIMESTAMP-1"],
            sapCustomerId: "USCU_S07"
          },
          {
            actual: "genuine",
            caseId: "intent:USCU_S03",
            modelCustomerId: "CUST-GREENLEAF",
            recordIds: ["S1-L1", "PHOTO-CARRIER-1", "POD-90000002"],
            sapCustomerId: "USCU_S03"
          }
        ]
      }
    },
    {
      active: true,
      approved_by: "human:rathish-owner",
      config_hash: "246b86ea6db527a4209956412a8e92bb1726dbc0d7124c6953712e88ede22a0d",
      config_version: 1,
      effective_from: "2026-06-22T00:00:00.000Z",
      key: "arbitration_eval_labels",
      value_json: {
        labels: [
          {
            actual: "partial-release-55|ship=352005.50|backorder=288004.50|terms=2/10 Net-30 + 25% deposit",
            caseId: "arb:harbor-order-6534",
            expectedRanking: ["partial_release_55", "full_release_revised_terms", "full_release_100", "full_hold_0"],
            modelCaseId: "ARB-HARBOR-ORDER-640K",
            recordIds: ["6534", "USCU_S04", "LEDGER-6-PARTIAL-HOLD"],
            sapOrderId: "6534"
          }
        ]
      }
    }
  ];
}

function toPostgrestDecisionConfidenceThresholdRow(valueJson: { threshold: number }) {
  return {
    active: true,
    approved_by: "human:rathish-owner",
    config_hash: sha256CanonicalJson(valueJson),
    config_version: 1,
    effective_from: "2026-06-22T00:00:00.000Z",
    key: "decision_confidence_threshold",
    value_json: valueJson
  };
}
