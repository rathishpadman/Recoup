import { MemoryRecordSchema, memoryCategories, type MemoryRecord } from "./schema.js";
import type { RuntimeEnv } from "../../config/env.js";
import {
  canonicalJson,
  governedConfigKeys,
  governedConfigSeedRows,
  parseActiveGovernedConfigRows,
  type GovernedConfigRuntimeSnapshot
} from "../../config/governed.js";
import {
  parseReleaseOwnerInputRows,
  releaseOwnerInputQueryableConfigKeys,
  releaseOwnerInputSeedRows,
  type ReleaseOwnerInputSnapshot
} from "../../config/releaseOwnerInputs.js";
import { buildSyntheticDataset } from "../adapters/syntheticData.js";
import type { SourceHealthResult } from "../services/sourceHealth.js";

export type SupabaseMemoryFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface SupabaseApprovalLifecycleResetInput {
  approvalRecordId: string;
  approvalScope: string;
  auditRecord: MemoryRecord;
}

export interface SupabaseMemoryRepository {
  append(record: MemoryRecord): Promise<MemoryRecord>;
  appendIfAbsent(record: MemoryRecord): Promise<MemoryRecord | undefined>;
  list(scope: string): Promise<MemoryRecord[]>;
  listAll(): Promise<MemoryRecord[]>;
  resetApprovalLifecycle(input: SupabaseApprovalLifecycleResetInput): Promise<number>;
}

export interface SupabaseGovernedConfigRepository {
  loadActive(): Promise<GovernedConfigRuntimeSnapshot>;
}

export interface SupabaseReleaseOwnerInputRepository {
  loadActive(): Promise<ReleaseOwnerInputSnapshot>;
}

export interface SupabaseSourceHealthSnapshotRepository {
  loadLatest(): Promise<SourceHealthResult[]>;
  upsert(results: readonly SourceHealthResult[]): Promise<void>;
}

export type SupabaseReadModelSurface = "connector-readiness" | "forensics-analyst";
export type SupabaseReadModelPersona = "maya";

export interface SupabaseReadModelRecord {
  generatedAt: string;
  modelKey: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  persona: SupabaseReadModelPersona;
  sourceRecordIds: string[];
  sourceRefreshedAt: string;
  surface: SupabaseReadModelSurface;
}

export interface SupabaseReadModelRepository {
  load(modelKey: string): Promise<SupabaseReadModelRecord | undefined>;
  upsert(record: Omit<SupabaseReadModelRecord, "generatedAt"> & { generatedAt?: string }): Promise<SupabaseReadModelRecord>;
}

export interface SupabaseMemoryRepositoryOptions {
  fetcher?: SupabaseMemoryFetch;
  serviceRoleKey: string;
  tableName?: string;
  url: string;
}

export interface SupabaseGovernedConfigRepositoryOptions {
  fetcher?: SupabaseMemoryFetch;
  serviceRoleKey: string;
  url: string;
}

export interface SupabaseReleaseOwnerInputRepositoryOptions {
  fetcher?: SupabaseMemoryFetch;
  serviceRoleKey: string;
  url: string;
}

export interface SupabaseSourceHealthSnapshotRepositoryOptions {
  fetcher?: SupabaseMemoryFetch;
  serviceRoleKey: string;
  tableName?: string;
  url: string;
}

export interface SupabaseReadModelRepositoryOptions {
  fetcher?: SupabaseMemoryFetch;
  serviceRoleKey: string;
  tableName?: string;
  url: string;
}

export type SupabaseTableReadinessStatus = "available" | "not_found_or_not_exposed" | "error";

export interface SupabaseTableReadinessSnapshot {
  tableStatuses: Record<string, SupabaseTableReadinessStatus>;
  unsafeShadowActions: Array<{
    columnName: string;
    tableName: string;
    value: string;
  }>;
}

export interface SupabaseTableReadinessProbe {
  probeTables(tableNames: readonly string[]): Promise<SupabaseTableReadinessSnapshot>;
}

export interface SupabaseTableReadinessProbeOptions {
  fetcher?: SupabaseMemoryFetch;
  serviceRoleKey: string;
  url: string;
}

interface SupabaseMemoryRow {
  category: string;
  created_at: string;
  id: string;
  payload_json: Record<string, unknown> | string;
  record_ids_json: string[] | string;
  scope: string;
  trust_level: string;
}

interface SupabaseSourceHealthSnapshotRow {
  checked_at: string;
  last_error: string | null;
  latency_ms: number;
  proof_items_json: string[] | string;
  record_ids_json: string[] | string;
  source_mode: string;
  source_name: string;
  status: string;
}

interface SupabaseReadModelRow {
  generated_at: string;
  model_key: string;
  payload_hash: string;
  payload_json: Record<string, unknown> | string;
  persona: string;
  source_record_ids_json: string[] | string;
  source_refreshed_at: string;
  surface: string;
}

const defaultMemoryTableName = "recoup_memory_records";
const defaultSourceHealthSnapshotTableName = "recoup_source_health_snapshots";
const defaultReadModelTableName = "recoup_cockpit_read_models";

export function createSupabaseMemoryRepository(options: SupabaseMemoryRepositoryOptions): SupabaseMemoryRepository {
  const tableName = normalizeTableName(options.tableName ?? defaultMemoryTableName);
  const baseUrl = normalizeSupabaseUrl(options.url);
  const fetcher = options.fetcher ?? fetch;

  return {
    async append(record) {
      const parsed = MemoryRecordSchema.parse(record);
      const rows = await requestRows(fetcher, {
        body: JSON.stringify(toSupabaseRow(parsed)),
        method: "POST",
        serviceRoleKey: options.serviceRoleKey,
        url: `${baseUrl}/rest/v1/${tableName}?on_conflict=id`
      });

      return rows[0] === undefined ? parsed : parseSupabaseMemoryRow(rows[0]);
    },
    async appendIfAbsent(record) {
      const parsed = MemoryRecordSchema.parse(record);
      const rows = await requestRows(fetcher, {
        body: JSON.stringify(toSupabaseRow(parsed)),
        conflictAsEmpty: true,
        method: "POST",
        prefer: "return=representation",
        serviceRoleKey: options.serviceRoleKey,
        url: `${baseUrl}/rest/v1/${tableName}`
      });

      return rows.length === 0 ? undefined : parseSupabaseMemoryRow(rows[0]);
    },
    async list(scope) {
      const url = new URL(`${baseUrl}/rest/v1/${tableName}`);
      url.searchParams.set("scope", `eq.${scope}`);
      url.searchParams.set("order", "sequence.asc");
      return (await requestRows(fetcher, { method: "GET", serviceRoleKey: options.serviceRoleKey, url: url.href })).map(
        parseSupabaseMemoryRow
      );
    },
    async listAll() {
      const url = new URL(`${baseUrl}/rest/v1/${tableName}`);
      url.searchParams.set("order", "sequence.asc");
      return (await requestRows(fetcher, { method: "GET", serviceRoleKey: options.serviceRoleKey, url: url.href })).map(
        parseSupabaseMemoryRow
      );
    },
    async resetApprovalLifecycle(input) {
      const auditRecord = parseApprovalLifecycleResetAuditRecord(input.auditRecord);
      const rows = await requestRows<{ deleted_record_count: number }>(fetcher, {
        body: JSON.stringify({
          p_approval_id: input.approvalRecordId,
          p_approval_scope: input.approvalScope,
          p_audit_category: auditRecord.category,
          p_audit_created_at: auditRecord.createdAt,
          p_audit_id: auditRecord.id,
          p_audit_payload_json: auditRecord.payload,
          p_audit_record_ids_json: auditRecord.recordIds,
          p_audit_scope: auditRecord.scope,
          p_audit_trust_level: auditRecord.trustLevel,
          p_memory_table_name: tableName
        }),
        method: "POST",
        serviceRoleKey: options.serviceRoleKey,
        url: `${baseUrl}/rest/v1/rpc/recoup_reset_demo_approval_lifecycle`
      });
      const row = rows[0];
      if (row === undefined || !Number.isSafeInteger(row.deleted_record_count) || row.deleted_record_count < 0) {
        throw new Error("Supabase demo reset RPC returned an invalid deletion count.");
      }

      return row.deleted_record_count;
    }
  };
}

export function createSupabaseMemoryRepositoryFromEnv(
  env: RuntimeEnv,
  fetcher?: SupabaseMemoryFetch
): SupabaseMemoryRepository | undefined {
  if (
    env.RECOUP_MEMORY_BACKEND !== "supabase" ||
    env.SUPABASE_SERVICE_ROLE_KEY === undefined ||
    env.SUPABASE_URL === undefined
  ) {
    return undefined;
  }

  return createSupabaseMemoryRepository({
    ...(fetcher === undefined ? {} : { fetcher }),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    ...(env.RECOUP_SUPABASE_MEMORY_TABLE === undefined ? {} : { tableName: env.RECOUP_SUPABASE_MEMORY_TABLE }),
    url: env.SUPABASE_URL
  });
}

export function createSupabaseGovernedConfigRepository(
  options: SupabaseGovernedConfigRepositoryOptions
): SupabaseGovernedConfigRepository {
  const baseUrl = normalizeSupabaseUrl(options.url);
  const fetcher = options.fetcher ?? fetch;

  return {
    async loadActive() {
      const url = new URL(`${baseUrl}/rest/v1/recoup_config`);
      url.searchParams.set("active", "eq.true");
      url.searchParams.set("config_version", "eq.1");
      url.searchParams.set("key", `in.(${governedConfigKeys.join(",")})`);
      url.searchParams.set(
        "select",
        "config_version,key,value_json,config_hash,effective_from,approved_by,active"
      );
      url.searchParams.set("order", "config_version.asc,key.asc");
      const rows = await requestGovernedConfigRows(fetcher, {
        method: "GET",
        serviceRoleKey: options.serviceRoleKey,
        url: url.href
      });

      return parseActiveGovernedConfigRows(rows);
    }
  };
}

export function createSupabaseGovernedConfigRepositoryFromEnv(
  env: RuntimeEnv,
  fetcher?: SupabaseMemoryFetch
): SupabaseGovernedConfigRepository | undefined {
  if (env.SUPABASE_SERVICE_ROLE_KEY === undefined || env.SUPABASE_URL === undefined) {
    return undefined;
  }

  return createSupabaseGovernedConfigRepository({
    ...(fetcher === undefined ? {} : { fetcher }),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    url: env.SUPABASE_URL
  });
}

export function createSupabaseReleaseOwnerInputRepository(
  options: SupabaseReleaseOwnerInputRepositoryOptions
): SupabaseReleaseOwnerInputRepository {
  const baseUrl = normalizeSupabaseUrl(options.url);
  const fetcher = options.fetcher ?? fetch;

  return {
    async loadActive() {
      const url = new URL(`${baseUrl}/rest/v1/recoup_config`);
      url.searchParams.set("active", "eq.true");
      url.searchParams.set("config_version", "eq.1");
      url.searchParams.set("key", `in.(${releaseOwnerInputQueryableConfigKeys.join(",")})`);
      url.searchParams.set(
        "select",
        "config_version,key,value_json,config_hash,effective_from,approved_by,active"
      );
      url.searchParams.set("order", "config_version.asc,key.asc");
      const rows = await requestGovernedConfigRows(fetcher, {
        method: "GET",
        serviceRoleKey: options.serviceRoleKey,
        url: url.href
      });

      return parseReleaseOwnerInputRows(rows);
    }
  };
}

export function createSupabaseReleaseOwnerInputRepositoryFromEnv(
  env: RuntimeEnv,
  fetcher?: SupabaseMemoryFetch
): SupabaseReleaseOwnerInputRepository | undefined {
  if (env.SUPABASE_SERVICE_ROLE_KEY === undefined || env.SUPABASE_URL === undefined) {
    return undefined;
  }

  return createSupabaseReleaseOwnerInputRepository({
    ...(fetcher === undefined ? {} : { fetcher }),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    url: env.SUPABASE_URL
  });
}

export function createSupabaseSourceHealthSnapshotRepository(
  options: SupabaseSourceHealthSnapshotRepositoryOptions
): SupabaseSourceHealthSnapshotRepository {
  const tableName = normalizeTableName(options.tableName ?? defaultSourceHealthSnapshotTableName);
  const baseUrl = normalizeSupabaseUrl(options.url);
  const fetcher = options.fetcher ?? fetch;

  return {
    async loadLatest() {
      const url = new URL(`${baseUrl}/rest/v1/${tableName}`);
      url.searchParams.set(
        "select",
        "source_name,status,source_mode,checked_at,latency_ms,proof_items_json,record_ids_json,last_error"
      );
      url.searchParams.set("order", "source_name.asc");
      const rows = await requestSourceHealthRows(fetcher, {
        method: "GET",
        serviceRoleKey: options.serviceRoleKey,
        url: url.href
      });

      return rows.map(parseSupabaseSourceHealthSnapshotRow);
    },
    async upsert(results) {
      await requestSourceHealthRows(fetcher, {
        body: JSON.stringify(results.map(toSupabaseSourceHealthSnapshotRow)),
        method: "POST",
        serviceRoleKey: options.serviceRoleKey,
        url: `${baseUrl}/rest/v1/${tableName}?on_conflict=source_name`
      });
    }
  };
}

export function createSupabaseSourceHealthSnapshotRepositoryFromEnv(
  env: RuntimeEnv,
  fetcher?: SupabaseMemoryFetch
): SupabaseSourceHealthSnapshotRepository | undefined {
  if (env.SUPABASE_SERVICE_ROLE_KEY === undefined || env.SUPABASE_URL === undefined) {
    return undefined;
  }

  return createSupabaseSourceHealthSnapshotRepository({
    ...(fetcher === undefined ? {} : { fetcher }),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    url: env.SUPABASE_URL
  });
}

export function createSupabaseReadModelRepository(options: SupabaseReadModelRepositoryOptions): SupabaseReadModelRepository {
  const tableName = normalizeTableName(options.tableName ?? defaultReadModelTableName);
  const baseUrl = normalizeSupabaseUrl(options.url);
  const fetcher = options.fetcher ?? fetch;

  return {
    async load(modelKey) {
      const url = new URL(`${baseUrl}/rest/v1/${tableName}`);
      url.searchParams.set(
        "select",
        "model_key,surface,persona,payload_json,source_record_ids_json,payload_hash,source_refreshed_at,generated_at"
      );
      url.searchParams.set("model_key", `eq.${modelKey}`);
      url.searchParams.set("limit", "1");
      const rows = await requestReadModelRows(fetcher, {
        method: "GET",
        serviceRoleKey: options.serviceRoleKey,
        url: url.href
      });

      return rows.length === 0 ? undefined : parseSupabaseReadModelRow(rows[0]);
    },
    async upsert(record) {
      const parsed = parseReadModelRecord(record);
      const rows = await requestReadModelRows(fetcher, {
        body: JSON.stringify([toSupabaseReadModelRow(parsed)]),
        method: "POST",
        serviceRoleKey: options.serviceRoleKey,
        url: `${baseUrl}/rest/v1/${tableName}?on_conflict=model_key`
      });

      return rows[0] === undefined ? parsed : parseSupabaseReadModelRow(rows[0]);
    }
  };
}

export function createSupabaseReadModelRepositoryFromEnv(
  env: RuntimeEnv,
  fetcher?: SupabaseMemoryFetch
): SupabaseReadModelRepository | undefined {
  if (env.SUPABASE_SERVICE_ROLE_KEY === undefined || env.SUPABASE_URL === undefined) {
    return undefined;
  }

  return createSupabaseReadModelRepository({
    ...(fetcher === undefined ? {} : { fetcher }),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    ...(env.RECOUP_SUPABASE_READ_MODEL_TABLE === undefined ? {} : { tableName: env.RECOUP_SUPABASE_READ_MODEL_TABLE }),
    url: env.SUPABASE_URL
  });
}

export function createSupabaseTableReadinessProbe(
  options: SupabaseTableReadinessProbeOptions
): SupabaseTableReadinessProbe {
  const baseUrl = normalizeSupabaseUrl(options.url);
  const fetcher = options.fetcher ?? fetch;

  return {
    async probeTables(tableNames) {
      const uniqueTableNames = [...new Set(tableNames.map(normalizeTableName))];
      const tableStatuses: Record<string, SupabaseTableReadinessStatus> = {};

      for (const tableName of uniqueTableNames) {
        tableStatuses[tableName] = await requestTableReadiness(fetcher, {
          serviceRoleKey: options.serviceRoleKey,
          tableName,
          url: baseUrl
        });
      }

      return {
        tableStatuses,
        unsafeShadowActions: await requestUnsafeShadowActions(fetcher, {
          serviceRoleKey: options.serviceRoleKey,
          url: baseUrl
        })
      };
    }
  };
}

export function createSupabaseTableReadinessProbeFromEnv(
  env: RuntimeEnv,
  fetcher?: SupabaseMemoryFetch
): SupabaseTableReadinessProbe | undefined {
  if (env.SUPABASE_SERVICE_ROLE_KEY === undefined || env.SUPABASE_URL === undefined) {
    return undefined;
  }

  return createSupabaseTableReadinessProbe({
    ...(fetcher === undefined ? {} : { fetcher }),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    url: env.SUPABASE_URL
  });
}

export function buildSupabaseMemorySchemaSql(tableName = defaultMemoryTableName): string {
  const safeTableName = normalizeTableName(tableName);
  const categoryValues = memoryCategories.map((category) => `'${category}'`).join(", ");
  const governedConfigKeyValues = [...governedConfigKeys, ...releaseOwnerInputQueryableConfigKeys]
    .map((key) => `'${key}'`)
    .join(", ");
  const governedConfigSeedValues = governedConfigSeedRows
    .map(
      (row) =>
        `(${String(row.configVersion)}, '${row.key}', '${escapeSql(canonicalJson(row.valueJson))}'::jsonb, '${row.configHash}', '${row.effectiveFrom}', '${row.approvedBy}', true)`
    )
    .join(",\n  ");
  const releaseOwnerInputSeedValues = releaseOwnerInputSeedRows
    .map(
      (row) =>
        `(${String(row.configVersion)}, '${row.key}', '${escapeSql(canonicalJson(row.valueJson))}'::jsonb, '${row.configHash}', '${row.effectiveFrom}', '${row.approvedBy}', true)`
    )
    .join(",\n  ");
  const settlementDataset = buildSyntheticDataset({ seed: 42 });
  const settlementCustomerSeedValues = settlementDataset.customers
    .map((customer) =>
      [
        `'${escapeSql(customer.customerId)}'`,
        `'${escapeSql(customer.name)}'`,
        `'${escapeSql(customer.profile)}'`
      ].join(", ")
    )
    .map((row) => `(${row})`)
    .join(",\n  ");
  const settlementLineSeedValues = settlementDataset.deductionLines
    .map((line) =>
      [
        `'${escapeSql(line.lineId)}'`,
        `'${line.scenarioId}'`,
        `'${escapeSql(line.customerId)}'`,
        `'${escapeSql(line.scenarioType)}'`,
        line.amount.toFixed(2),
        `'${line.verdict}'`,
        `'${line.routing}'`,
        `'${escapeSql(canonicalJson(line.recordIds))}'::jsonb`,
        `'${escapeSql(line.ruleId)}'`,
        `'${escapeSql(canonicalJson(line.ruleInput ?? {}))}'::jsonb`,
        `'${escapeSql(line.period)}'`,
        `'${line.eventId}'`
      ].join(", ")
    )
    .map((row) => `(${row})`)
    .join(",\n  ");
  const toolsDataCustomerRScoreSeedValues = [
    {
      creditLimit: "500000.0",
      customerId: "USCU_S04",
      customerName: "Harbor Foods",
      revenueForecast12mo: "9000000.0",
      rScoreComponentScores: {
        agingConcentration: 60,
        disputeRate: 71,
        dsoAdp: 70,
        overLimitFrequency: 70
      },
      segment: "Foodservice Distributor",
      strategicValue: "Medium"
    },
    {
      creditLimit: "10000000.0",
      customerId: "USCU_L10",
      customerName: "Crestline Grocery",
      revenueForecast12mo: "48000000.0",
      rScoreComponentScores: {
        agingConcentration: 15,
        disputeRate: 73.1,
        dsoAdp: 10,
        overLimitFrequency: 0
      },
      segment: "Strategic Retail",
      strategicValue: "High"
    },
    {
      creditLimit: "1500000.0",
      customerId: "USCU_S07",
      customerName: "ValuMart Club",
      revenueForecast12mo: "22000000.0",
      rScoreComponentScores: {
        agingConcentration: 20,
        disputeRate: 56.4,
        dsoAdp: 15,
        overLimitFrequency: 0
      },
      segment: "Club",
      strategicValue: "High"
    },
    {
      creditLimit: "50000.0",
      customerId: "USCU_S03",
      customerName: "Greenleaf Naturals",
      revenueForecast12mo: "3500000.0",
      rScoreComponentScores: {
        agingConcentration: 25,
        disputeRate: 0,
        dsoAdp: 20,
        overLimitFrequency: 0
      },
      segment: "Regional Wholesaler",
      strategicValue: "Low"
    }
  ]
    .map((customer) =>
      [
        `'${escapeSql(customer.customerId)}'`,
        `'${escapeSql(canonicalJson(customer.rScoreComponentScores))}'::jsonb`,
        `'${escapeSql(customer.customerName)}'`,
        `'${escapeSql(customer.segment)}'`,
        `'${escapeSql(customer.strategicValue)}'`,
        customer.creditLimit,
        customer.revenueForecast12mo
      ].join(", ")
    )
    .map((row) => `(${row})`)
    .join(",\n  ");
  return `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS recoup_app_principals (
  principal text PRIMARY KEY,
  capabilities text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

DROP INDEX IF EXISTS idx_recoup_config_active_key;

CREATE TABLE IF NOT EXISTS recoup_config (
  config_version int NOT NULL,
  key text NOT NULL CHECK (key IN (${governedConfigKeyValues})),
  value_json jsonb NOT NULL CHECK (jsonb_typeof(value_json) = 'object'),
  config_hash text NOT NULL CHECK (config_hash ~ '^[a-f0-9]{64}$'),
  effective_from timestamptz NOT NULL,
  approved_by text NOT NULL REFERENCES recoup_app_principals(principal),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (config_version, key)
);

CREATE TABLE IF NOT EXISTS recoup_audit_chain (
  entry_hash text PRIMARY KEY CHECK (entry_hash ~ '^[a-f0-9]{64}$'),
  prev_hash text CHECK (prev_hash IS NULL OR prev_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  seq bigint GENERATED BY DEFAULT AS IDENTITY UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recoup_customers (
  customer_id text PRIMARY KEY,
  name text NOT NULL,
  profile text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recoup_deduction_lines (
  line_id text PRIMARY KEY,
  scenario_id text CHECK (scenario_id IN ('S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8')),
  customer_id text NOT NULL REFERENCES recoup_customers(customer_id),
  scenario_type text NOT NULL,
  amount numeric NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('valid', 'invalid', 'partial')),
  routing text NOT NULL CHECK (routing IN ('billing', 'recovery')),
  record_ids_json jsonb NOT NULL CHECK (jsonb_typeof(record_ids_json) = 'array' AND jsonb_array_length(record_ids_json) > 0),
  rule_id text NOT NULL,
  rule_input_json jsonb NOT NULL CHECK (jsonb_typeof(rule_input_json) = 'object'),
  period text NOT NULL,
  event_id text NOT NULL CHECK (event_id ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recoup_evidence_documents (
  evidence_id text PRIMARY KEY,
  document_type text NOT NULL CHECK (document_type IN ('pod', 'sap_invoice', 'sap_credit_memo', 'customer_po', 'contract_pricing', 'contract_sla', 'tpm_promo', 'tpm_accrual', 'carrier_damage_report', 'carrier_photo', 'remittance_advice', 'edi_812', 'bureau_alert', 'payment_history')),
  source_system text NOT NULL,
  customer_id text NOT NULL,
  source_record_id text NOT NULL,
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  raw_text text,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  storage_uri text,
  retrieved_at timestamptz NOT NULL,
  valid_from date,
  valid_to date,
  provenance text NOT NULL CHECK (provenance IN ('sap_odata', 'source_generated', 'uploaded_document', 'provider_api')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE TABLE IF NOT EXISTS recoup_evidence_links (
  evidence_id text NOT NULL REFERENCES recoup_evidence_documents(evidence_id),
  record_id text NOT NULL,
  record_role text NOT NULL CHECK (record_role IN ('deduction_line', 'claim', 'customer', 'invoice', 'source_record')),
  PRIMARY KEY(evidence_id, record_id, record_role)
);

CREATE TABLE IF NOT EXISTS recoup_deduction_claims (
  claim_id text PRIMARY KEY,
  line_id text NOT NULL,
  gold_scenario_id text,
  customer_id text NOT NULL,
  invoice_ref text NOT NULL,
  claim_amount numeric(18,2) NOT NULL,
  reason_code text NOT NULL,
  remittance_evidence_id text NOT NULL REFERENCES recoup_evidence_documents(evidence_id),
  record_ids jsonb NOT NULL CHECK (jsonb_typeof(record_ids) = 'array' AND jsonb_array_length(record_ids) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recoup_reconciliation_receipts (
  receipt_id text PRIMARY KEY,
  claim_id text NOT NULL REFERENCES recoup_deduction_claims(claim_id),
  line_id text NOT NULL,
  rule_id text NOT NULL,
  derived_rule_input_json jsonb NOT NULL CHECK (jsonb_typeof(derived_rule_input_json) = 'object'),
  evidence_ids jsonb NOT NULL CHECK (jsonb_typeof(evidence_ids) = 'array' AND jsonb_array_length(evidence_ids) > 0),
  deterministic_basis jsonb NOT NULL CHECK (jsonb_typeof(deterministic_basis) = 'object'),
  confidence_factors jsonb NOT NULL CHECK (jsonb_typeof(confidence_factors) = 'object'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recoup_src_bureau (
  customer_id text NOT NULL,
  bureau_id text PRIMARY KEY,
  as_of_date date NOT NULL,
  risk_score int NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  limit_recommendation numeric NOT NULL,
  public_records jsonb NOT NULL CHECK (jsonb_typeof(public_records) = 'object'),
  delinquency_flag boolean NOT NULL,
  provenance text NOT NULL CHECK (provenance = 'synthetic')
);

CREATE TABLE IF NOT EXISTS recoup_src_docs (
  doc_id text PRIMARY KEY,
  doc_type text NOT NULL CHECK (doc_type IN ('POD', 'contract', 'TPM', 'correspondence')),
  customer_id text NOT NULL,
  linked_record_ids jsonb NOT NULL CHECK (jsonb_typeof(linked_record_ids) = 'array' AND jsonb_array_length(linked_record_ids) > 0),
  uri text NOT NULL,
  signed_date date,
  provenance text NOT NULL CHECK (provenance = 'synthetic')
);

CREATE TABLE IF NOT EXISTS recoup_src_remittance (
  remit_id text PRIMARY KEY,
  transaction_set text NOT NULL CHECK (transaction_set IN ('820', '812', '810', 'manual')),
  customer_id text NOT NULL,
  paid_amount numeric NOT NULL,
  invoice_refs jsonb NOT NULL CHECK (jsonb_typeof(invoice_refs) = 'array'),
  deduction_refs jsonb NOT NULL CHECK (jsonb_typeof(deduction_refs) = 'array'),
  payment_date date NOT NULL,
  currency text NOT NULL,
  provenance text NOT NULL CHECK (provenance = 'synthetic')
);

CREATE TABLE IF NOT EXISTS recoup_src_sap (
  sap_document_id text PRIMARY KEY,
  document_type text NOT NULL CHECK (document_type IN ('invoice', 'credit-memo')),
  customer_id text NOT NULL,
  service_name text NOT NULL,
  entity_set text NOT NULL,
  linked_record_ids jsonb NOT NULL CHECK (jsonb_typeof(linked_record_ids) = 'array' AND jsonb_array_length(linked_record_ids) > 0),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  summary text NOT NULL,
  retrieved_at timestamptz NOT NULL,
  provenance text NOT NULL CHECK (provenance = 'sap-odata')
);

CREATE TABLE IF NOT EXISTS recoup_src_tpm (
  promo_id text PRIMARY KEY,
  customer_id text NOT NULL,
  product_scope jsonb NOT NULL CHECK (jsonb_typeof(product_scope) = 'object'),
  promo_type text NOT NULL,
  approved_allowance numeric NOT NULL,
  accrued_amount numeric NOT NULL,
  window_start date NOT NULL,
  window_end date NOT NULL,
  claim_refs jsonb NOT NULL CHECK (jsonb_typeof(claim_refs) = 'array'),
  provenance text NOT NULL CHECK (provenance = 'synthetic'),
  CHECK (window_end >= window_start)
);

CREATE TABLE IF NOT EXISTS recoup_source_health_snapshots (
  source_name text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('connected', 'degraded', 'blocked')),
  source_mode text NOT NULL CHECK (source_mode IN ('live', 'synthetic_static_table', 'unavailable')),
  checked_at timestamptz NOT NULL,
  latency_ms int NOT NULL CHECK (latency_ms >= 0),
  proof_items_json jsonb NOT NULL CHECK (jsonb_typeof(proof_items_json) = 'array' AND jsonb_array_length(proof_items_json) > 0),
  record_ids_json jsonb NOT NULL CHECK (jsonb_typeof(record_ids_json) = 'array' AND jsonb_array_length(record_ids_json) > 0),
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recoup_cockpit_read_models (
  model_key text PRIMARY KEY,
  surface text NOT NULL CHECK (surface IN ('forensics-analyst', 'connector-readiness')),
  persona text NOT NULL CHECK (persona IN ('maya')),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  source_record_ids_json jsonb NOT NULL CHECK (jsonb_typeof(source_record_ids_json) = 'array' AND jsonb_array_length(source_record_ids_json) > 0),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  source_refreshed_at timestamptz NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recoup_agent_usage_runs (
  usage_run_id text PRIMARY KEY,
  correlation_id text NOT NULL,
  workflow_name text NOT NULL,
  agent_name text NOT NULL,
  model_id text NOT NULL,
  model_execution_mode text NOT NULL,
  cache_capability text CHECK (cache_capability IS NULL OR cache_capability IN ('deduction_forensics', 'credit_risk', 'risk_mesh', 'containment')),
  prompt_cache_key text,
  prompt_prefix_version text,
  status text NOT NULL CHECK (status IN ('succeeded', 'blocked', 'failed')),
  input_tokens int NOT NULL CHECK (input_tokens >= 0),
  output_tokens int NOT NULL CHECK (output_tokens >= 0),
  cached_input_tokens int NOT NULL CHECK (cached_input_tokens >= 0),
  uncached_input_tokens int NOT NULL CHECK (uncached_input_tokens >= 0),
  reasoning_tokens int NOT NULL CHECK (reasoning_tokens >= 0),
  total_tokens int NOT NULL CHECK (total_tokens >= 0),
  latency_ms int CHECK (latency_ms IS NULL OR latency_ms >= 0),
  handoff_count int NOT NULL CHECK (handoff_count >= 0),
  tool_call_count int NOT NULL CHECK (tool_call_count >= 0),
  guardrail_trip_count int NOT NULL CHECK (guardrail_trip_count >= 0),
  record_ids_json jsonb NOT NULL CHECK (jsonb_typeof(record_ids_json) = 'array' AND jsonb_array_length(record_ids_json) > 0),
  cited_record_ids_json jsonb NOT NULL CHECK (jsonb_typeof(cited_record_ids_json) = 'array'),
  deterministic_basis text NOT NULL,
  source_receipt_id text,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS recoup_eval_gate_runs (
  eval_run_id text PRIMARY KEY,
  release_status text NOT NULL CHECK (release_status IN ('pass', 'fail', 'blocked')),
  source_mode text NOT NULL CHECK (source_mode IN ('live_supabase', 'local_fixture', 'blocked')),
  branch_name text,
  commit_sha text CHECK (commit_sha IS NULL OR commit_sha ~ '^[a-f0-9]{40}$'),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  report_hash text NOT NULL CHECK (report_hash ~ '^[a-f0-9]{64}$'),
  report_json jsonb NOT NULL CHECK (jsonb_typeof(report_json) = 'object'),
  record_ids_json jsonb NOT NULL CHECK (jsonb_typeof(record_ids_json) = 'array' AND jsonb_array_length(record_ids_json) > 0),
  deterministic_basis text NOT NULL,
  CHECK (completed_at >= started_at)
);

CREATE TABLE IF NOT EXISTS recoup_eval_gate_results (
  eval_gate_result_id text PRIMARY KEY,
  eval_run_id text NOT NULL REFERENCES recoup_eval_gate_runs(eval_run_id),
  gate text NOT NULL CHECK (gate IN ('run-control', 'deduction-validity', 'intent-precision', 'arbitration-agreement', 'detection-fp', 'decision-fp', 'gold-set-parity')),
  status text NOT NULL CHECK (status IN ('pass', 'fail', 'blocked')),
  score numeric CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
  threshold numeric CHECK (threshold IS NULL OR (threshold >= 0 AND threshold <= 1)),
  blocker_reason text CHECK ((status <> 'blocked') OR (blocker_reason IS NOT NULL AND length(blocker_reason) > 0)),
  open_dependencies_json jsonb NOT NULL CHECK (jsonb_typeof(open_dependencies_json) = 'array'),
  record_ids_json jsonb NOT NULL CHECK (jsonb_typeof(record_ids_json) = 'array' AND jsonb_array_length(record_ids_json) > 0),
  deterministic_basis text NOT NULL
);

CREATE TABLE IF NOT EXISTS recoup_model_pricing (
  pricing_id text PRIMARY KEY,
  model_id text NOT NULL,
  service_tier text NOT NULL,
  input_per_1m_tokens numeric NOT NULL CHECK (input_per_1m_tokens >= 0),
  output_per_1m_tokens numeric NOT NULL CHECK (output_per_1m_tokens >= 0),
  cached_input_per_1m_tokens numeric NOT NULL CHECK (cached_input_per_1m_tokens >= 0),
  reasoning_per_1m_tokens numeric NOT NULL CHECK (reasoning_per_1m_tokens >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  approved_by text NOT NULL REFERENCES recoup_app_principals(principal),
  pricing_hash text NOT NULL CHECK (pricing_hash ~ '^[a-f0-9]{64}$'),
  active boolean NOT NULL DEFAULT true,
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TABLE IF NOT EXISTS recoup_openai_cost_buckets (
  cost_bucket_id text PRIMARY KEY,
  bucket_start timestamptz NOT NULL,
  bucket_end timestamptz NOT NULL,
  project_id text,
  model_id text,
  line_item text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  source_response_hash text NOT NULL CHECK (source_response_hash ~ '^[a-f0-9]{64}$'),
  imported_at timestamptz NOT NULL,
  provenance text NOT NULL CHECK (provenance = 'openai_org_cost_api'),
  CHECK (bucket_end > bucket_start)
);

CREATE TABLE IF NOT EXISTS recoup_finops_daily_rollups (
  rollup_id text PRIMARY KEY,
  rollup_date date NOT NULL,
  workflow_name text NOT NULL,
  agent_name text NOT NULL,
  model_id text NOT NULL,
  run_count int NOT NULL CHECK (run_count >= 0),
  succeeded_count int NOT NULL CHECK (succeeded_count >= 0),
  blocked_count int NOT NULL CHECK (blocked_count >= 0),
  failed_count int NOT NULL CHECK (failed_count >= 0),
  total_tokens int NOT NULL CHECK (total_tokens >= 0),
  input_tokens int NOT NULL CHECK (input_tokens >= 0),
  output_tokens int NOT NULL CHECK (output_tokens >= 0),
  cached_input_tokens int NOT NULL CHECK (cached_input_tokens >= 0),
  uncached_input_tokens int NOT NULL CHECK (uncached_input_tokens >= 0),
  computed_cost_amount numeric CHECK (computed_cost_amount IS NULL OR computed_cost_amount >= 0),
  computed_cost_currency text CHECK (computed_cost_currency IS NULL OR computed_cost_currency ~ '^[A-Z]{3}$'),
  cost_status text NOT NULL CHECK (cost_status IN ('computed_from_owner_pricing', 'reconciled_from_provider_cost_api', 'pricing_not_configured_not_computed')),
  prompt_cache_hit_rate numeric CHECK (prompt_cache_hit_rate IS NULL OR (prompt_cache_hit_rate >= 0 AND prompt_cache_hit_rate <= 1)),
  prompt_cache_savings_amount numeric CHECK (prompt_cache_savings_amount IS NULL OR prompt_cache_savings_amount >= 0),
  prompt_cache_savings_currency text CHECK (prompt_cache_savings_currency IS NULL OR prompt_cache_savings_currency ~ '^[A-Z]{3}$'),
  prompt_cache_savings_status text NOT NULL CHECK (prompt_cache_savings_status IN ('computed_from_owner_pricing', 'pricing_not_configured_not_computed', 'no_cached_tokens_observed')),
  cases_processed_count int NOT NULL CHECK (cases_processed_count >= 0),
  cited_answer_count int NOT NULL CHECK (cited_answer_count >= 0),
  approved_draft_count int NOT NULL CHECK (approved_draft_count >= 0),
  disputed_amount numeric NOT NULL CHECK (disputed_amount >= 0),
  unit_economics_json jsonb NOT NULL CHECK (jsonb_typeof(unit_economics_json) = 'object'),
  source_record_ids_json jsonb NOT NULL CHECK (jsonb_typeof(source_record_ids_json) = 'array' AND jsonb_array_length(source_record_ids_json) > 0),
  deterministic_basis text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recoup_finops_recommendations (
  recommendation_id text PRIMARY KEY,
  recommendation_type text NOT NULL CHECK (recommendation_type IN ('quality_gate', 'pricing_config', 'token_budget', 'prompt_cache', 'batch_eval', 'guardrail_regression', 'model_routing', 'source_gap')),
  severity text NOT NULL CHECK (severity IN ('critical', 'important', 'advisory')),
  status text NOT NULL CHECK (status IN ('open', 'accepted', 'dismissed', 'superseded')),
  title text NOT NULL,
  recommended_action text NOT NULL,
  affected_agent_name text,
  affected_workflow_name text,
  expected_impact_json jsonb NOT NULL CHECK (jsonb_typeof(expected_impact_json) = 'object'),
  evidence_record_ids_json jsonb NOT NULL CHECK (jsonb_typeof(evidence_record_ids_json) = 'array' AND jsonb_array_length(evidence_record_ids_json) > 0),
  deterministic_basis text NOT NULL,
  requires_human_approval boolean NOT NULL,
  created_at timestamptz NOT NULL,
  resolved_at timestamptz,
  resolved_by text REFERENCES recoup_app_principals(principal),
  CHECK (resolved_at IS NULL OR resolved_at >= created_at)
);

CREATE TABLE IF NOT EXISTS customers (
  customer_id text PRIMARY KEY,
  customer_name text NOT NULL,
  segment text,
  strategic_value text,
  credit_limit numeric NOT NULL DEFAULT 0,
  revenue_forecast_12mo numeric NOT NULL DEFAULT 0,
  r_score_component_scores_json jsonb CHECK (
    r_score_component_scores_json IS NULL OR (
      jsonb_typeof(r_score_component_scores_json) = 'object'
      AND r_score_component_scores_json ?& ARRAY['agingConcentration', 'disputeRate', 'dsoAdp', 'overLimitFrequency']
      AND jsonb_typeof(r_score_component_scores_json->'agingConcentration') = 'number'
      AND jsonb_typeof(r_score_component_scores_json->'disputeRate') = 'number'
      AND jsonb_typeof(r_score_component_scores_json->'dsoAdp') = 'number'
      AND jsonb_typeof(r_score_component_scores_json->'overLimitFrequency') = 'number'
      AND (r_score_component_scores_json->>'agingConcentration')::numeric BETWEEN 0 AND 100
      AND (r_score_component_scores_json->>'disputeRate')::numeric BETWEEN 0 AND 100
      AND (r_score_component_scores_json->>'dsoAdp')::numeric BETWEEN 0 AND 100
      AND (r_score_component_scores_json->>'overLimitFrequency')::numeric BETWEEN 0 AND 100
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  payment_id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id text NOT NULL,
  invoice_ref text NOT NULL,
  invoice_amount numeric NOT NULL,
  invoice_date date NOT NULL,
  payment_date date NOT NULL,
  days_to_pay int NOT NULL CHECK (days_to_pay >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pod_records (
  pod_id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sales_order_ref text NOT NULL,
  delivery_ref text NOT NULL,
  invoice_ref text NOT NULL,
  customer_id text NOT NULL,
  carrier_name text,
  delivery_timestamp timestamptz,
  target_delivery_date date,
  shipped_qty int NOT NULL CHECK (shipped_qty >= 0),
  signed_qty int NOT NULL CHECK (signed_qty >= 0),
  discrepancy_note text,
  signed_by text,
  signature_image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promotions (
  promo_id text PRIMARY KEY,
  customer_id text NOT NULL,
  sku text NOT NULL,
  promo_rate numeric NOT NULL,
  accrual_cap numeric NOT NULL DEFAULT 0,
  start_date date NOT NULL,
  end_date date NOT NULL,
  promo_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS contracts (
  contract_id text PRIMARY KEY,
  customer_id text NOT NULL,
  pricing_model text,
  otif_threshold numeric NOT NULL DEFAULT 98,
  fine_percentage numeric NOT NULL DEFAULT 0,
  pricing_terms jsonb CHECK (pricing_terms IS NULL OR jsonb_typeof(pricing_terms) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carrier_reports (
  report_id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  invoice_ref text NOT NULL,
  customer_id text NOT NULL,
  carrier_name text,
  damage_description text,
  damaged_qty int NOT NULL CHECK (damaged_qty >= 0),
  report_status text NOT NULL DEFAULT 'SUBMITTED' CHECK (report_status IN ('SUBMITTED', 'VERIFIED', 'REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS damage_photos (
  photo_id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  report_id text,
  photo_url text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bureau_alerts (
  alert_id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id text NOT NULL,
  alert_type text NOT NULL,
  severity text NOT NULL,
  details text,
  alert_date date NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS remittance_headers (
  remittance_id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id text NOT NULL,
  remittance_date date NOT NULL,
  payment_reference text,
  total_amount_paid numeric NOT NULL,
  total_deductions numeric NOT NULL DEFAULT 0,
  ocr_confidence numeric,
  pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS remittance_lines (
  line_id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  remittance_id text,
  invoice_ref text NOT NULL,
  deducted_amount numeric NOT NULL,
  reason_code_raw text,
  reason_code_mapped text,
  disputed_sku text,
  disputed_qty int CHECK (disputed_qty IS NULL OR disputed_qty >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deductions_backlog (
  deduction_id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  line_ref text,
  customer_id text NOT NULL,
  invoice_ref text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  scenario_type text NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('PENDING', 'VALID', 'INVALID', 'PARTIAL')),
  confidence numeric NOT NULL DEFAULT 0,
  explanation text,
  assigned_analyst text,
  status text NOT NULL DEFAULT 'OPEN',
  gaming_pattern_flag boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_requests (
  request_id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  deduction_id text,
  invoice_ref text NOT NULL,
  type text NOT NULL CHECK (type IN ('CREDIT_MEMO', 'CREDIT_AND_REBILL', 'WRITE_OFF')),
  amount numeric NOT NULL,
  gl_code text,
  re_bill_amount numeric NOT NULL DEFAULT 0,
  re_bill_unit_price numeric NOT NULL DEFAULT 0,
  supporting_evidence_urls text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'SENT_TO_SAP', 'CONFIRMED')),
  audit_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recovery_packages (
  package_id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  deduction_id text,
  customer_id text NOT NULL,
  invoice_ref text NOT NULL,
  amount numeric NOT NULL,
  correspondence_letter text,
  evidence_package_json jsonb CHECK (evidence_package_json IS NULL OR jsonb_typeof(evidence_package_json) = 'object'),
  status text NOT NULL DEFAULT 'GENERATED' CHECK (status IN ('GENERATED', 'SUBMITTED_TO_PORTAL', 'PAID', 'ABANDONED')),
  follow_up_cadence_count int NOT NULL DEFAULT 0 CHECK (follow_up_cadence_count >= 0),
  next_follow_up_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_decisions (
  decision_id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id text NOT NULL,
  blocked_order_ref text NOT NULL,
  order_amount numeric NOT NULL,
  credit_limit_amount numeric NOT NULL,
  dso_drift_days int NOT NULL,
  margin_percentage numeric NOT NULL,
  customer_strategic_segment text NOT NULL,
  composite_release_score numeric NOT NULL,
  release_ratio numeric NOT NULL,
  released_amount numeric NOT NULL,
  held_amount numeric NOT NULL,
  proposed_terms text,
  decision_verdict text NOT NULL DEFAULT 'PROPOSED' CHECK (decision_verdict IN ('PROPOSED', 'APPROVED', 'OVERRIDDEN', 'REJECTED')),
  arbitrator_user text,
  negotiation_log jsonb CHECK (negotiation_log IS NULL OR jsonb_typeof(negotiation_log) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS immutable_audit_log (
  audit_id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  action_type text NOT NULL,
  ref_id text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  operator_user text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ${safeTableName} (
  sequence bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  id text NOT NULL,
  category text NOT NULL CHECK (category IN (${categoryValues})),
  trust_level text NOT NULL CHECK (trust_level IN ('trusted', 'semi_trusted', 'untrusted')),
  scope text NOT NULL,
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  record_ids_json jsonb NOT NULL CHECK (jsonb_typeof(record_ids_json) = 'array' AND jsonb_array_length(record_ids_json) > 0),
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recoup_config_version ON recoup_config (config_version);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recoup_audit_chain_seq ON recoup_audit_chain (seq);
CREATE INDEX IF NOT EXISTS idx_recoup_deduction_lines_customer_scenario ON recoup_deduction_lines (customer_id, scenario_id);
CREATE INDEX IF NOT EXISTS idx_recoup_deduction_lines_record_ids ON recoup_deduction_lines USING gin (record_ids_json);
CREATE INDEX IF NOT EXISTS idx_recoup_evidence_documents_customer_type ON recoup_evidence_documents (customer_id, document_type);
CREATE INDEX IF NOT EXISTS idx_recoup_evidence_documents_source_record ON recoup_evidence_documents (source_system, source_record_id);
CREATE INDEX IF NOT EXISTS idx_recoup_evidence_links_record ON recoup_evidence_links (record_role, record_id);
CREATE INDEX IF NOT EXISTS idx_recoup_deduction_claims_line ON recoup_deduction_claims (line_id);
CREATE INDEX IF NOT EXISTS idx_recoup_deduction_claims_record_ids ON recoup_deduction_claims USING gin (record_ids);
CREATE INDEX IF NOT EXISTS idx_recoup_reconciliation_receipts_claim ON recoup_reconciliation_receipts (claim_id);
CREATE INDEX IF NOT EXISTS idx_recoup_reconciliation_receipts_evidence_ids ON recoup_reconciliation_receipts USING gin (evidence_ids);
CREATE INDEX IF NOT EXISTS idx_recoup_src_bureau_customer_date ON recoup_src_bureau (customer_id, as_of_date);
CREATE INDEX IF NOT EXISTS idx_recoup_src_docs_customer ON recoup_src_docs (customer_id);
CREATE INDEX IF NOT EXISTS idx_recoup_src_docs_linked_record_ids ON recoup_src_docs USING gin (linked_record_ids);
CREATE INDEX IF NOT EXISTS idx_recoup_src_remittance_customer_payment ON recoup_src_remittance (customer_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_recoup_src_remittance_invoice_refs ON recoup_src_remittance USING gin (invoice_refs);
CREATE INDEX IF NOT EXISTS idx_recoup_src_remittance_deduction_refs ON recoup_src_remittance USING gin (deduction_refs);
CREATE INDEX IF NOT EXISTS idx_recoup_src_sap_customer ON recoup_src_sap (customer_id);
CREATE INDEX IF NOT EXISTS idx_recoup_src_sap_linked_record_ids ON recoup_src_sap USING gin (linked_record_ids);
CREATE INDEX IF NOT EXISTS idx_recoup_src_tpm_customer_window ON recoup_src_tpm (customer_id, window_start, window_end);
CREATE INDEX IF NOT EXISTS idx_recoup_src_tpm_claim_refs ON recoup_src_tpm USING gin (claim_refs);
CREATE INDEX IF NOT EXISTS idx_recoup_cockpit_read_models_surface_persona ON recoup_cockpit_read_models (surface, persona);
CREATE INDEX IF NOT EXISTS idx_recoup_cockpit_read_models_record_ids ON recoup_cockpit_read_models USING gin (source_record_ids_json);
CREATE INDEX IF NOT EXISTS idx_recoup_agent_usage_runs_created_agent_model ON recoup_agent_usage_runs (created_at, agent_name, model_id);
CREATE INDEX IF NOT EXISTS idx_recoup_agent_usage_runs_workflow_agent_model ON recoup_agent_usage_runs (workflow_name, agent_name, model_id);
CREATE INDEX IF NOT EXISTS idx_recoup_agent_usage_runs_record_ids ON recoup_agent_usage_runs USING gin (record_ids_json);
CREATE INDEX IF NOT EXISTS idx_recoup_agent_usage_runs_cited_record_ids ON recoup_agent_usage_runs USING gin (cited_record_ids_json);
CREATE INDEX IF NOT EXISTS idx_recoup_eval_gate_runs_completed_at ON recoup_eval_gate_runs (completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_recoup_eval_gate_results_eval_run_gate ON recoup_eval_gate_results (eval_run_id, gate);
CREATE INDEX IF NOT EXISTS idx_recoup_model_pricing_active_model_tier ON recoup_model_pricing (active, model_id, service_tier);
CREATE INDEX IF NOT EXISTS idx_recoup_openai_cost_buckets_bucket_model ON recoup_openai_cost_buckets (bucket_start, bucket_end, model_id);
CREATE INDEX IF NOT EXISTS idx_recoup_finops_daily_rollups_date_agent_model ON recoup_finops_daily_rollups (rollup_date, agent_name, model_id);
CREATE INDEX IF NOT EXISTS idx_recoup_finops_daily_rollups_workflow_agent_model ON recoup_finops_daily_rollups (workflow_name, agent_name, model_id);
CREATE INDEX IF NOT EXISTS idx_recoup_finops_daily_rollups_source_record_ids ON recoup_finops_daily_rollups USING gin (source_record_ids_json);
CREATE INDEX IF NOT EXISTS idx_recoup_finops_recommendations_status_severity ON recoup_finops_recommendations (status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recoup_finops_recommendations_evidence_record_ids ON recoup_finops_recommendations USING gin (evidence_record_ids_json);
CREATE INDEX IF NOT EXISTS idx_payments_customer_invoice_ref ON payments (customer_id, invoice_ref);
CREATE INDEX IF NOT EXISTS idx_pod_records_invoice ON pod_records (invoice_ref);
CREATE INDEX IF NOT EXISTS idx_pod_records_delivery ON pod_records (delivery_ref);
CREATE INDEX IF NOT EXISTS idx_promotions_customer_window ON promotions (customer_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_contracts_customer ON contracts (customer_id);
CREATE INDEX IF NOT EXISTS idx_carrier_reports_customer_invoice ON carrier_reports (customer_id, invoice_ref);
CREATE INDEX IF NOT EXISTS idx_damage_photos_report ON damage_photos (report_id);
CREATE INDEX IF NOT EXISTS idx_bureau_alerts_customer_type ON bureau_alerts (customer_id, alert_type, severity, resolved);
CREATE INDEX IF NOT EXISTS idx_remittance_headers_customer_date ON remittance_headers (customer_id, remittance_date);
CREATE INDEX IF NOT EXISTS idx_remittance_lines_invoice_ref ON remittance_lines (invoice_ref);
CREATE INDEX IF NOT EXISTS idx_deductions_backlog_customer_verdict ON deductions_backlog (customer_id, verdict);
CREATE INDEX IF NOT EXISTS idx_billing_requests_status ON billing_requests (status);
CREATE INDEX IF NOT EXISTS idx_recovery_packages_status ON recovery_packages (status);
CREATE INDEX IF NOT EXISTS idx_credit_decisions_customer_order ON credit_decisions (customer_id, blocked_order_ref);
CREATE INDEX IF NOT EXISTS idx_immutable_audit_log_ref ON immutable_audit_log (ref_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_${safeTableName}_id ON ${safeTableName} (id);
CREATE INDEX IF NOT EXISTS idx_${safeTableName}_scope_sequence ON ${safeTableName} (scope, sequence);
CREATE INDEX IF NOT EXISTS idx_${safeTableName}_record_ids ON ${safeTableName} USING gin (record_ids_json);
CREATE INDEX IF NOT EXISTS idx_recoup_app_principals_capabilities ON recoup_app_principals USING gin (capabilities);

CREATE OR REPLACE FUNCTION recoup_commit_approval_audit(
  p_expected_prev_hash text,
  p_audit_entry_hash text,
  p_audit_prev_hash text,
  p_audit_payload jsonb,
  p_memory_table_name text,
  p_memory_id text,
  p_memory_category text,
  p_memory_trust_level text,
  p_memory_scope text,
  p_memory_payload_json jsonb,
  p_memory_record_ids_json jsonb,
  p_memory_created_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_tail_hash text;
BEGIN
  IF p_memory_table_name <> '${safeTableName}' THEN
    RAISE EXCEPTION 'unsafe_memory_table_name';
  END IF;

  LOCK TABLE recoup_audit_chain IN EXCLUSIVE MODE;

  SELECT entry_hash
  INTO current_tail_hash
  FROM recoup_audit_chain
  ORDER BY seq DESC
  LIMIT 1;

  IF NOT (p_expected_prev_hash IS NOT DISTINCT FROM current_tail_hash) THEN
    RAISE EXCEPTION 'audit_tail_mismatch';
  END IF;

  IF p_audit_prev_hash IS DISTINCT FROM current_tail_hash THEN
    RAISE EXCEPTION 'audit_tail_mismatch';
  END IF;

  INSERT INTO recoup_audit_chain (entry_hash, prev_hash, payload)
  VALUES (p_audit_entry_hash, p_audit_prev_hash, p_audit_payload);

  EXECUTE format(
    'INSERT INTO %I (id, category, trust_level, scope, payload_json, record_ids_json, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    p_memory_table_name
  )
  USING
    p_memory_id,
    p_memory_category,
    p_memory_trust_level,
    p_memory_scope,
    p_memory_payload_json,
    p_memory_record_ids_json,
    p_memory_created_at;
END;
$$;

CREATE OR REPLACE FUNCTION recoup_reset_demo_approval_lifecycle(
  p_memory_table_name text,
  p_approval_id text,
  p_approval_scope text,
  p_audit_id text,
  p_audit_category text,
  p_audit_trust_level text,
  p_audit_scope text,
  p_audit_payload_json jsonb,
  p_audit_record_ids_json jsonb,
  p_audit_created_at timestamptz
)
RETURNS TABLE(deleted_record_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_memory_table_name <> '${safeTableName}' THEN
    RAISE EXCEPTION 'unsafe_memory_table_name';
  END IF;

  IF p_approval_id !~ '^approval:.+' OR p_approval_scope <> p_approval_id THEN
    RAISE EXCEPTION 'unsafe_approval_lifecycle_scope';
  END IF;

  IF p_audit_category <> 'audit_refs' THEN
    RAISE EXCEPTION 'unsafe_reset_audit_category';
  END IF;

  RETURN QUERY EXECUTE format(
    'WITH deleted AS (
       DELETE FROM %I
       WHERE id = $1 AND scope = $2 AND category = ''approval_records''
       RETURNING id
     ), deleted_count AS (
       SELECT count(*)::integer AS value FROM deleted
     ), inserted AS (
       INSERT INTO %I (id, category, trust_level, scope, payload_json, record_ids_json, created_at)
       VALUES ($3, $4, $5, $6, $7 || jsonb_build_object(''deletedRecordCount'', (SELECT value FROM deleted_count)), $8, $9)
       ON CONFLICT(id) DO UPDATE SET
         category = excluded.category,
         trust_level = excluded.trust_level,
         scope = excluded.scope,
         payload_json = excluded.payload_json,
         record_ids_json = excluded.record_ids_json,
         created_at = excluded.created_at
       RETURNING id
     )
     SELECT value FROM deleted_count',
    p_memory_table_name,
    p_memory_table_name
  )
  USING
    p_approval_id,
    p_approval_scope,
    p_audit_id,
    p_audit_category,
    p_audit_trust_level,
    p_audit_scope,
    p_audit_payload_json,
    p_audit_record_ids_json,
    p_audit_created_at;
END;
$$;

REVOKE ALL ON TABLE ${safeTableName} FROM anon, authenticated;
REVOKE ALL ON TABLE recoup_app_principals FROM anon, authenticated;
REVOKE ALL ON TABLE recoup_config FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_audit_chain FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_customers FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_deduction_lines FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_evidence_documents FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_evidence_links FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_deduction_claims FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_reconciliation_receipts FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_src_bureau FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_src_docs FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_src_remittance FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_src_sap FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_src_tpm FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_source_health_snapshots FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_cockpit_read_models FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_agent_usage_runs FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_eval_gate_runs FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_eval_gate_results FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_model_pricing FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_openai_cost_buckets FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_finops_daily_rollups FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_finops_recommendations FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE customers FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE payments FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE pod_records FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE promotions FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE contracts FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE carrier_reports FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE damage_photos FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE bureau_alerts FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE remittance_headers FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE remittance_lines FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE deductions_backlog FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE billing_requests FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recovery_packages FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE credit_decisions FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE immutable_audit_log FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION recoup_commit_approval_audit(text, text, text, jsonb, text, text, text, text, text, jsonb, jsonb, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION recoup_reset_demo_approval_lifecycle(text, text, text, text, text, text, text, jsonb, jsonb, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE ${safeTableName} TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE recoup_app_principals TO service_role;
GRANT SELECT, INSERT ON TABLE recoup_config TO service_role;
GRANT SELECT ON TABLE recoup_audit_chain TO service_role;
GRANT EXECUTE ON FUNCTION recoup_commit_approval_audit(text, text, text, jsonb, text, text, text, text, text, jsonb, jsonb, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION recoup_reset_demo_approval_lifecycle(text, text, text, text, text, text, text, jsonb, jsonb, timestamptz) TO service_role;
GRANT SELECT ON TABLE recoup_customers TO service_role;
GRANT SELECT ON TABLE recoup_deduction_lines TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE recoup_evidence_documents TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE recoup_evidence_links TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE recoup_deduction_claims TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE recoup_reconciliation_receipts TO service_role;
GRANT SELECT ON TABLE recoup_src_bureau TO service_role;
GRANT SELECT ON TABLE recoup_src_docs TO service_role;
GRANT SELECT ON TABLE recoup_src_remittance TO service_role;
GRANT SELECT ON TABLE recoup_src_sap TO service_role;
GRANT SELECT ON TABLE recoup_src_tpm TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE recoup_source_health_snapshots TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE recoup_cockpit_read_models TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE recoup_agent_usage_runs TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE recoup_eval_gate_runs TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE recoup_eval_gate_results TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE recoup_model_pricing TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE recoup_openai_cost_buckets TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE recoup_finops_daily_rollups TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE recoup_finops_recommendations TO service_role;
GRANT SELECT ON TABLE customers TO service_role;
GRANT SELECT ON TABLE payments TO service_role;
GRANT SELECT ON TABLE pod_records TO service_role;
GRANT SELECT ON TABLE promotions TO service_role;
GRANT SELECT ON TABLE contracts TO service_role;
GRANT SELECT ON TABLE carrier_reports TO service_role;
GRANT SELECT ON TABLE damage_photos TO service_role;
GRANT SELECT ON TABLE bureau_alerts TO service_role;
GRANT SELECT ON TABLE remittance_headers TO service_role;
GRANT SELECT ON TABLE remittance_lines TO service_role;
GRANT SELECT ON TABLE deductions_backlog TO service_role;
GRANT SELECT ON TABLE billing_requests TO service_role;
GRANT SELECT ON TABLE recovery_packages TO service_role;
GRANT SELECT ON TABLE credit_decisions TO service_role;
GRANT SELECT ON TABLE immutable_audit_log TO service_role;

INSERT INTO recoup_app_principals (principal, capabilities)
VALUES
  ('human:owner-ratified-day-1', ARRAY['config:approve']),
  ('human:rathish-owner', ARRAY['config:approve', 'release:approve'])
ON CONFLICT (principal) DO NOTHING;

INSERT INTO recoup_config (config_version, key, value_json, config_hash, effective_from, approved_by, active)
VALUES
  ${governedConfigSeedValues}
ON CONFLICT (config_version, key) DO NOTHING;

INSERT INTO recoup_config (config_version, key, value_json, config_hash, effective_from, approved_by, active)
VALUES
  ${releaseOwnerInputSeedValues}
ON CONFLICT (config_version, key) DO NOTHING;

INSERT INTO recoup_customers (customer_id, name, profile)
VALUES
  ${settlementCustomerSeedValues}
ON CONFLICT (customer_id) DO NOTHING;

INSERT INTO recoup_deduction_lines (
  line_id,
  scenario_id,
  customer_id,
  scenario_type,
  amount,
  verdict,
  routing,
  record_ids_json,
  rule_id,
  rule_input_json,
  period,
  event_id
)
VALUES
  ${settlementLineSeedValues}
ON CONFLICT (line_id) DO NOTHING;

INSERT INTO customers (
  customer_id,
  r_score_component_scores_json,
  customer_name,
  segment,
  strategic_value,
  credit_limit,
  revenue_forecast_12mo
)
VALUES
  ${toolsDataCustomerRScoreSeedValues}
ON CONFLICT (customer_id) DO UPDATE SET
  r_score_component_scores_json = EXCLUDED.r_score_component_scores_json,
  customer_name = EXCLUDED.customer_name,
  segment = EXCLUDED.segment,
  strategic_value = EXCLUDED.strategic_value,
  credit_limit = EXCLUDED.credit_limit,
  revenue_forecast_12mo = EXCLUDED.revenue_forecast_12mo,
  updated_at = now();

ALTER TABLE recoup_app_principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_app_principals FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_config FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_audit_chain ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_audit_chain FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_customers FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_deduction_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_deduction_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_evidence_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_evidence_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_evidence_links FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_deduction_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_deduction_claims FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_reconciliation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_reconciliation_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_src_bureau ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_src_bureau FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_src_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_src_docs FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_src_remittance ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_src_remittance FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_src_sap ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_src_sap FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_src_tpm ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_src_tpm FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_source_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_source_health_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_cockpit_read_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_cockpit_read_models FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_agent_usage_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_agent_usage_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_eval_gate_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_eval_gate_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_eval_gate_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_eval_gate_results FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_model_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_model_pricing FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_openai_cost_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_openai_cost_buckets FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_finops_daily_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_finops_daily_rollups FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_finops_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_finops_recommendations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recoup_evidence_documents_service_role_select ON recoup_evidence_documents;
DROP POLICY IF EXISTS recoup_evidence_documents_service_role_insert ON recoup_evidence_documents;
DROP POLICY IF EXISTS recoup_evidence_documents_service_role_update ON recoup_evidence_documents;
DROP POLICY IF EXISTS recoup_evidence_links_service_role_select ON recoup_evidence_links;
DROP POLICY IF EXISTS recoup_evidence_links_service_role_insert ON recoup_evidence_links;
DROP POLICY IF EXISTS recoup_evidence_links_service_role_update ON recoup_evidence_links;
DROP POLICY IF EXISTS recoup_deduction_claims_service_role_select ON recoup_deduction_claims;
DROP POLICY IF EXISTS recoup_deduction_claims_service_role_insert ON recoup_deduction_claims;
DROP POLICY IF EXISTS recoup_deduction_claims_service_role_update ON recoup_deduction_claims;
DROP POLICY IF EXISTS recoup_reconciliation_receipts_service_role_select ON recoup_reconciliation_receipts;
DROP POLICY IF EXISTS recoup_reconciliation_receipts_service_role_insert ON recoup_reconciliation_receipts;
DROP POLICY IF EXISTS recoup_reconciliation_receipts_service_role_update ON recoup_reconciliation_receipts;
DROP POLICY IF EXISTS recoup_source_health_snapshots_service_role_select ON recoup_source_health_snapshots;
DROP POLICY IF EXISTS recoup_source_health_snapshots_service_role_insert ON recoup_source_health_snapshots;
DROP POLICY IF EXISTS recoup_source_health_snapshots_service_role_update ON recoup_source_health_snapshots;
DROP POLICY IF EXISTS recoup_cockpit_read_models_service_role_select ON recoup_cockpit_read_models;
DROP POLICY IF EXISTS recoup_cockpit_read_models_service_role_insert ON recoup_cockpit_read_models;
DROP POLICY IF EXISTS recoup_cockpit_read_models_service_role_update ON recoup_cockpit_read_models;
DROP POLICY IF EXISTS recoup_agent_usage_runs_service_role_select ON recoup_agent_usage_runs;
DROP POLICY IF EXISTS recoup_agent_usage_runs_service_role_insert ON recoup_agent_usage_runs;
DROP POLICY IF EXISTS recoup_agent_usage_runs_service_role_update ON recoup_agent_usage_runs;
DROP POLICY IF EXISTS recoup_eval_gate_runs_service_role_select ON recoup_eval_gate_runs;
DROP POLICY IF EXISTS recoup_eval_gate_runs_service_role_insert ON recoup_eval_gate_runs;
DROP POLICY IF EXISTS recoup_eval_gate_runs_service_role_update ON recoup_eval_gate_runs;
DROP POLICY IF EXISTS recoup_eval_gate_results_service_role_select ON recoup_eval_gate_results;
DROP POLICY IF EXISTS recoup_eval_gate_results_service_role_insert ON recoup_eval_gate_results;
DROP POLICY IF EXISTS recoup_eval_gate_results_service_role_update ON recoup_eval_gate_results;
DROP POLICY IF EXISTS recoup_model_pricing_service_role_select ON recoup_model_pricing;
DROP POLICY IF EXISTS recoup_model_pricing_service_role_insert ON recoup_model_pricing;
DROP POLICY IF EXISTS recoup_model_pricing_service_role_update ON recoup_model_pricing;
DROP POLICY IF EXISTS recoup_openai_cost_buckets_service_role_select ON recoup_openai_cost_buckets;
DROP POLICY IF EXISTS recoup_openai_cost_buckets_service_role_insert ON recoup_openai_cost_buckets;
DROP POLICY IF EXISTS recoup_openai_cost_buckets_service_role_update ON recoup_openai_cost_buckets;
DROP POLICY IF EXISTS recoup_finops_daily_rollups_service_role_select ON recoup_finops_daily_rollups;
DROP POLICY IF EXISTS recoup_finops_daily_rollups_service_role_insert ON recoup_finops_daily_rollups;
DROP POLICY IF EXISTS recoup_finops_daily_rollups_service_role_update ON recoup_finops_daily_rollups;
DROP POLICY IF EXISTS recoup_finops_recommendations_service_role_select ON recoup_finops_recommendations;
DROP POLICY IF EXISTS recoup_finops_recommendations_service_role_insert ON recoup_finops_recommendations;
DROP POLICY IF EXISTS recoup_finops_recommendations_service_role_update ON recoup_finops_recommendations;
CREATE POLICY recoup_evidence_documents_service_role_select
  ON recoup_evidence_documents
  FOR SELECT TO service_role USING (true);
CREATE POLICY recoup_evidence_documents_service_role_insert
  ON recoup_evidence_documents
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY recoup_evidence_documents_service_role_update
  ON recoup_evidence_documents
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY recoup_evidence_links_service_role_select
  ON recoup_evidence_links
  FOR SELECT TO service_role USING (true);
CREATE POLICY recoup_evidence_links_service_role_insert
  ON recoup_evidence_links
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY recoup_evidence_links_service_role_update
  ON recoup_evidence_links
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY recoup_deduction_claims_service_role_select
  ON recoup_deduction_claims
  FOR SELECT TO service_role USING (true);
CREATE POLICY recoup_deduction_claims_service_role_insert
  ON recoup_deduction_claims
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY recoup_deduction_claims_service_role_update
  ON recoup_deduction_claims
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY recoup_reconciliation_receipts_service_role_select
  ON recoup_reconciliation_receipts
  FOR SELECT TO service_role USING (true);
CREATE POLICY recoup_reconciliation_receipts_service_role_insert
  ON recoup_reconciliation_receipts
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY recoup_reconciliation_receipts_service_role_update
  ON recoup_reconciliation_receipts
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY recoup_source_health_snapshots_service_role_select
  ON recoup_source_health_snapshots
  FOR SELECT TO service_role USING (true);
CREATE POLICY recoup_source_health_snapshots_service_role_insert
  ON recoup_source_health_snapshots
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY recoup_source_health_snapshots_service_role_update
  ON recoup_source_health_snapshots
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY recoup_cockpit_read_models_service_role_select
  ON recoup_cockpit_read_models
  FOR SELECT TO service_role USING (true);
CREATE POLICY recoup_cockpit_read_models_service_role_insert
  ON recoup_cockpit_read_models
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY recoup_cockpit_read_models_service_role_update
  ON recoup_cockpit_read_models
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY recoup_agent_usage_runs_service_role_select
  ON recoup_agent_usage_runs
  FOR SELECT TO service_role USING (true);
CREATE POLICY recoup_agent_usage_runs_service_role_insert
  ON recoup_agent_usage_runs
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY recoup_agent_usage_runs_service_role_update
  ON recoup_agent_usage_runs
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY recoup_eval_gate_runs_service_role_select
  ON recoup_eval_gate_runs
  FOR SELECT TO service_role USING (true);
CREATE POLICY recoup_eval_gate_runs_service_role_insert
  ON recoup_eval_gate_runs
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY recoup_eval_gate_runs_service_role_update
  ON recoup_eval_gate_runs
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY recoup_eval_gate_results_service_role_select
  ON recoup_eval_gate_results
  FOR SELECT TO service_role USING (true);
CREATE POLICY recoup_eval_gate_results_service_role_insert
  ON recoup_eval_gate_results
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY recoup_eval_gate_results_service_role_update
  ON recoup_eval_gate_results
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY recoup_model_pricing_service_role_select
  ON recoup_model_pricing
  FOR SELECT TO service_role USING (true);
CREATE POLICY recoup_model_pricing_service_role_insert
  ON recoup_model_pricing
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY recoup_model_pricing_service_role_update
  ON recoup_model_pricing
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY recoup_openai_cost_buckets_service_role_select
  ON recoup_openai_cost_buckets
  FOR SELECT TO service_role USING (true);
CREATE POLICY recoup_openai_cost_buckets_service_role_insert
  ON recoup_openai_cost_buckets
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY recoup_openai_cost_buckets_service_role_update
  ON recoup_openai_cost_buckets
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY recoup_finops_daily_rollups_service_role_select
  ON recoup_finops_daily_rollups
  FOR SELECT TO service_role USING (true);
CREATE POLICY recoup_finops_daily_rollups_service_role_insert
  ON recoup_finops_daily_rollups
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY recoup_finops_daily_rollups_service_role_update
  ON recoup_finops_daily_rollups
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY recoup_finops_recommendations_service_role_select
  ON recoup_finops_recommendations
  FOR SELECT TO service_role USING (true);
CREATE POLICY recoup_finops_recommendations_service_role_insert
  ON recoup_finops_recommendations
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY recoup_finops_recommendations_service_role_update
  ON recoup_finops_recommendations
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
ALTER TABLE pod_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_records FORCE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions FORCE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts FORCE ROW LEVEL SECURITY;
ALTER TABLE carrier_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE damage_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE damage_photos FORCE ROW LEVEL SECURITY;
ALTER TABLE bureau_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bureau_alerts FORCE ROW LEVEL SECURITY;
ALTER TABLE remittance_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE remittance_headers FORCE ROW LEVEL SECURITY;
ALTER TABLE remittance_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE remittance_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE deductions_backlog ENABLE ROW LEVEL SECURITY;
ALTER TABLE deductions_backlog FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE recovery_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_packages FORCE ROW LEVEL SECURITY;
ALTER TABLE credit_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE immutable_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE immutable_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE ${safeTableName} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${safeTableName} FORCE ROW LEVEL SECURITY;
`.trim();
}

async function requestRows<T = SupabaseMemoryRow>(
  fetcher: SupabaseMemoryFetch,
  input: {
    body?: string;
    conflictAsEmpty?: boolean;
    method: "DELETE" | "GET" | "POST";
    prefer?: string;
    serviceRoleKey: string;
    url: string;
  }
): Promise<T[]> {
  const response = await fetcher(input.url, {
    ...(input.body === undefined ? {} : { body: input.body }),
    headers: {
      apikey: input.serviceRoleKey,
      authorization: `Bearer ${input.serviceRoleKey}`,
      "content-type": "application/json",
      prefer: input.prefer ?? "resolution=merge-duplicates,return=representation"
    },
    method: input.method
  });

  if (!response.ok) {
    if (input.conflictAsEmpty === true && response.status === 409) {
      return [];
    }
    throw new Error(`Supabase memory request failed with HTTP ${String(response.status)}.`);
  }

  return (await response.json()) as T[];
}

async function requestSourceHealthRows(
  fetcher: SupabaseMemoryFetch,
  input: {
    body?: string;
    method: "GET" | "POST";
    serviceRoleKey: string;
    url: string;
  }
): Promise<SupabaseSourceHealthSnapshotRow[]> {
  const response = await fetcher(input.url, {
    ...(input.body === undefined ? {} : { body: input.body }),
    headers: {
      ...serviceRoleReadHeaders(input.serviceRoleKey),
      ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      prefer: "resolution=merge-duplicates,return=representation"
    },
    method: input.method
  });

  if (!response.ok) {
    throw new Error(`Supabase source health request failed with HTTP ${String(response.status)}.`);
  }

  const rows = (await response.json()) as unknown;
  if (!Array.isArray(rows)) {
    throw new Error("Supabase source health response must be an array of rows.");
  }

  return rows.map((row) => row as SupabaseSourceHealthSnapshotRow);
}

async function requestReadModelRows(
  fetcher: SupabaseMemoryFetch,
  input: {
    body?: string;
    method: "GET" | "POST";
    serviceRoleKey: string;
    url: string;
  }
): Promise<SupabaseReadModelRow[]> {
  const response = await fetcher(input.url, {
    ...(input.body === undefined ? {} : { body: input.body }),
    headers: {
      ...serviceRoleReadHeaders(input.serviceRoleKey),
      ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      prefer: "resolution=merge-duplicates,return=representation"
    },
    method: input.method
  });

  if (!response.ok) {
    throw new Error(`Supabase cockpit read model request failed with HTTP ${String(response.status)}.`);
  }

  const rows = (await response.json()) as unknown;
  if (!Array.isArray(rows)) {
    throw new Error("Supabase cockpit read model response must be an array of rows.");
  }

  return rows.map((row) => row as SupabaseReadModelRow);
}

async function requestGovernedConfigRows(
  fetcher: SupabaseMemoryFetch,
  input: { method: "GET"; serviceRoleKey: string; url: string }
): Promise<unknown[]> {
  const response = await fetcher(input.url, {
    headers: {
      apikey: input.serviceRoleKey,
      authorization: `Bearer ${input.serviceRoleKey}`
    },
    method: input.method
  });

  if (!response.ok) {
    throw new Error(`Supabase governed config request failed with HTTP ${String(response.status)}.`);
  }

  const rows = (await response.json()) as unknown;
  if (!Array.isArray(rows)) {
    throw new Error("Supabase governed config response must be an array of rows.");
  }

  return rows.map((row) => row as unknown);
}

async function requestTableReadiness(
  fetcher: SupabaseMemoryFetch,
  input: { serviceRoleKey: string; tableName: string; url: string }
): Promise<SupabaseTableReadinessStatus> {
  const url = new URL(`${input.url}/rest/v1/${input.tableName}`);
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", "0");

  try {
    const response = await fetcher(url.href, {
      headers: serviceRoleReadHeaders(input.serviceRoleKey),
      method: "GET"
    });

    if (response.ok) {
      return "available";
    }

    return response.status === 404 ? "not_found_or_not_exposed" : "error";
  } catch {
    return "error";
  }
}

async function requestUnsafeShadowActions(
  fetcher: SupabaseMemoryFetch,
  input: { serviceRoleKey: string; url: string }
): Promise<SupabaseTableReadinessSnapshot["unsafeShadowActions"]> {
  const findings: SupabaseTableReadinessSnapshot["unsafeShadowActions"] = [];

  for (const check of unsafeShadowActionChecks) {
    const url = new URL(`${input.url}/rest/v1/${check.tableName}`);
    url.searchParams.set("select", check.columnName);
    url.searchParams.set(check.columnName, `in.(${check.values.join(",")})`);
    url.searchParams.set("limit", "1");

    try {
      const response = await fetcher(url.href, {
        headers: serviceRoleReadHeaders(input.serviceRoleKey),
        method: "GET"
      });
      if (!response.ok) {
        continue;
      }

      const rows = (await response.json()) as unknown;
      if (!Array.isArray(rows)) {
        continue;
      }

      for (const row of rows) {
        if (!isJsonRecord(row)) {
          continue;
        }

        const value = row[check.columnName];
        if (typeof value === "string" && (check.values as readonly string[]).includes(value)) {
          findings.push({
            columnName: check.columnName,
            tableName: check.tableName,
            value
          });
        }
      }
    } catch {
      continue;
    }
  }

  return findings;
}

function serviceRoleReadHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`
  };
}

function toSupabaseRow(record: MemoryRecord): SupabaseMemoryRow {
  return {
    category: record.category,
    created_at: record.createdAt,
    id: record.id,
    payload_json: record.payload,
    record_ids_json: record.recordIds,
    scope: record.scope,
    trust_level: record.trustLevel
  };
}

function parseApprovalLifecycleResetAuditRecord(record: MemoryRecord): MemoryRecord {
  const parsed = MemoryRecordSchema.parse(record);
  if (parsed.category !== "audit_refs") {
    throw new Error("Approval lifecycle reset audit record must be an audit_refs memory record.");
  }

  return parsed;
}

function toSupabaseSourceHealthSnapshotRow(result: SourceHealthResult): SupabaseSourceHealthSnapshotRow {
  return {
    checked_at: result.checkedAtIso,
    last_error: result.lastError ?? null,
    latency_ms: result.latencyMs,
    proof_items_json: result.proofItems,
    record_ids_json: result.recordIds,
    source_mode: result.sourceMode,
    source_name: result.sourceName,
    status: result.status
  };
}

function toSupabaseReadModelRow(record: SupabaseReadModelRecord): SupabaseReadModelRow {
  return {
    generated_at: record.generatedAt,
    model_key: record.modelKey,
    payload_hash: record.payloadHash,
    payload_json: record.payload,
    persona: record.persona,
    source_record_ids_json: record.sourceRecordIds,
    source_refreshed_at: record.sourceRefreshedAt,
    surface: record.surface
  };
}

function parseSupabaseMemoryRow(row: SupabaseMemoryRow | undefined): MemoryRecord {
  if (row === undefined) {
    throw new Error("Supabase memory response did not include a record.");
  }

  return MemoryRecordSchema.parse({
    category: row.category,
    createdAt: normalizeSupabaseTimestamp(row.created_at),
    id: row.id,
    payload: parseJsonCell(row.payload_json),
    recordIds: parseJsonCell(row.record_ids_json),
    scope: row.scope,
    trustLevel: row.trust_level
  });
}

function parseSupabaseReadModelRow(row: SupabaseReadModelRow | undefined): SupabaseReadModelRecord {
  if (row === undefined) {
    throw new Error("Supabase cockpit read model response did not include a record.");
  }
  if (row.persona !== "maya") {
    throw new Error("Supabase cockpit read model row has an invalid persona.");
  }
  if (!isReadModelSurface(row.surface)) {
    throw new Error("Supabase cockpit read model row has an invalid surface.");
  }

  return parseReadModelRecord({
    generatedAt: normalizeSupabaseTimestamp(row.generated_at),
    modelKey: row.model_key,
    payload: parseJsonRecordCell(row.payload_json, "payload_json"),
    payloadHash: row.payload_hash,
    persona: row.persona,
    sourceRecordIds: parseStringArrayCell(row.source_record_ids_json, "source_record_ids_json"),
    sourceRefreshedAt: normalizeSupabaseTimestamp(row.source_refreshed_at),
    surface: row.surface
  });
}

function parseSupabaseSourceHealthSnapshotRow(row: SupabaseSourceHealthSnapshotRow | undefined): SourceHealthResult {
  if (row === undefined) {
    throw new Error("Supabase source health response did not include a record.");
  }

  if (!isSourceHealthStatus(row.status)) {
    throw new Error("Supabase source health row has an invalid status.");
  }

  if (!isSourceHealthMode(row.source_mode)) {
    throw new Error("Supabase source health row has an invalid source mode.");
  }

  return {
    checkedAtIso: normalizeSupabaseTimestamp(row.checked_at),
    ...(typeof row.last_error === "string" && row.last_error.trim().length > 0 ? { lastError: row.last_error } : {}),
    latencyMs: row.latency_ms,
    proofItems: parseStringArrayCell(row.proof_items_json, "proof_items_json"),
    recordIds: parseStringArrayCell(row.record_ids_json, "record_ids_json"),
    sourceMode: row.source_mode,
    sourceName: row.source_name,
    status: row.status
  };
}

type SupabaseReadModelRecordInput = Omit<SupabaseReadModelRecord, "generatedAt" | "persona" | "surface"> & {
  generatedAt?: string;
  persona: string;
  surface: string;
};

function parseReadModelRecord(record: SupabaseReadModelRecordInput): SupabaseReadModelRecord {
  if (!isReadModelSurface(record.surface)) {
    throw new Error("Supabase cockpit read model row has an invalid surface.");
  }
  if (record.persona !== "maya") {
    throw new Error("Supabase cockpit read model row has an invalid persona.");
  }
  if (!isSafeReadModelKey(record.modelKey)) {
    throw new Error("Supabase cockpit read model key must be safe.");
  }
  if (!/^[a-f0-9]{64}$/u.test(record.payloadHash)) {
    throw new Error("Supabase cockpit read model payload hash must be a SHA-256 hex digest.");
  }
  if (!Array.isArray(record.sourceRecordIds) || record.sourceRecordIds.length === 0) {
    throw new Error("Supabase cockpit read model source record IDs must be non-empty.");
  }
  if (!record.sourceRecordIds.every((recordId) => typeof recordId === "string" && recordId.trim().length > 0)) {
    throw new Error("Supabase cockpit read model source record IDs must be strings.");
  }
  if (!isJsonRecord(record.payload)) {
    throw new Error("Supabase cockpit read model payload must be an object.");
  }

  return {
    generatedAt: normalizeSupabaseTimestamp(record.generatedAt ?? new Date().toISOString()),
    modelKey: record.modelKey,
    payload: record.payload,
    payloadHash: record.payloadHash,
    persona: record.persona,
    sourceRecordIds: record.sourceRecordIds,
    sourceRefreshedAt: normalizeSupabaseTimestamp(record.sourceRefreshedAt),
    surface: record.surface
  };
}

function parseJsonCell(value: Record<string, unknown> | string | string[]): unknown {
  return typeof value === "string" ? (JSON.parse(value) as unknown) : value;
}

function parseJsonRecordCell(value: Record<string, unknown> | string, columnName: string): Record<string, unknown> {
  const parsed = parseJsonCell(value);
  if (!isJsonRecord(parsed)) {
    throw new Error(`Supabase cockpit read model ${columnName} must be an object.`);
  }

  return parsed;
}

function parseStringArrayCell(value: string[] | string, columnName: string): string[] {
  const parsed = parseJsonCell(value);
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((item) => typeof item === "string")) {
    throw new Error(`Supabase source health ${columnName} must be a non-empty string array.`);
  }

  return parsed;
}

function isSourceHealthStatus(value: string): value is SourceHealthResult["status"] {
  return value === "connected" || value === "degraded" || value === "blocked";
}

function isSourceHealthMode(value: string): value is SourceHealthResult["sourceMode"] {
  return value === "live" || value === "synthetic_static_table" || value === "unavailable";
}

function isReadModelSurface(value: string): value is SupabaseReadModelSurface {
  return value === "connector-readiness" || value === "forensics-analyst";
}

function isSafeReadModelKey(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}$/u.test(value);
}

function normalizeSupabaseTimestamp(value: string): string {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.valueOf())) {
    return parsed.toISOString();
  }

  const postgresTimestamp = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?([+-]\d{2})(?::?(\d{2}))?$/u.exec(
    value
  );
  if (postgresTimestamp === null) {
    return value;
  }

  const date = postgresTimestamp[1];
  const time = postgresTimestamp[2];
  const offsetHours = postgresTimestamp[4];
  if (date === undefined || time === undefined || offsetHours === undefined) {
    return value;
  }

  const fraction = postgresTimestamp[3] === undefined ? ".000" : postgresTimestamp[3].slice(0, 4).padEnd(4, "0");
  const offsetMinutes = postgresTimestamp[5] ?? "00";
  const normalized = `${date}T${time}${fraction}${offsetHours}:${offsetMinutes}`;
  const normalizedDate = new Date(normalized);

  return Number.isNaN(normalizedDate.valueOf()) ? value : normalizedDate.toISOString();
}

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/+$/u, "");
}

function normalizeTableName(tableName: string): string {
  if (!/^[a-z][a-z0-9_]*$/u.test(tableName)) {
    throw new Error("Supabase memory table name must be a safe Postgres identifier.");
  }

  return tableName;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const unsafeShadowActionChecks = [
  {
    columnName: "status",
    tableName: "billing_requests",
    values: ["SENT_TO_SAP"]
  },
  {
    columnName: "status",
    tableName: "recovery_packages",
    values: ["SUBMITTED_TO_PORTAL"]
  },
  {
    columnName: "action_type",
    tableName: "immutable_audit_log",
    values: ["SAP_STAGE_WRITE"]
  }
] as const;

function escapeSql(value: string): string {
  return value.replace(/'/gu, "''");
}
