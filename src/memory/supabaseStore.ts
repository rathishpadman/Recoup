import { MemoryRecordSchema, memoryCategories, type MemoryRecord } from "./schema.js";
import type { RuntimeEnv } from "../../config/env.js";
import {
  canonicalJson,
  governedConfigSeedRows,
  parseActiveGovernedConfigRows,
  type GovernedConfigRuntimeSnapshot
} from "../../config/governed.js";

export type SupabaseMemoryFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface SupabaseMemoryRepository {
  append(record: MemoryRecord): Promise<MemoryRecord>;
  appendIfAbsent(record: MemoryRecord): Promise<MemoryRecord | undefined>;
  list(scope: string): Promise<MemoryRecord[]>;
  listAll(): Promise<MemoryRecord[]>;
}

export interface SupabaseGovernedConfigRepository {
  loadActive(): Promise<GovernedConfigRuntimeSnapshot>;
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

const defaultMemoryTableName = "recoup_memory_records";

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

      return parseSupabaseMemoryRow(rows[0]);
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
    }
  };
}

export function createSupabaseMemoryRepositoryFromEnv(
  env: RuntimeEnv,
  fetcher?: SupabaseMemoryFetch
): SupabaseMemoryRepository | undefined {
  if (env.SUPABASE_SERVICE_ROLE_KEY === undefined || env.SUPABASE_URL === undefined) {
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
  const governedConfigKeyValues = [
    "arbitration_weights",
    "r_score_weights",
    "r_drift",
    "gaming_gate",
    "partial_hold",
    "accuracy_bars",
    "seed"
  ]
    .map((key) => `'${key}'`)
    .join(", ");
  const governedConfigSeedValues = governedConfigSeedRows
    .map(
      (row) =>
        `(${String(row.configVersion)}, '${row.key}', '${escapeSql(canonicalJson(row.valueJson))}'::jsonb, '${row.configHash}', '${row.effectiveFrom}', '${row.approvedBy}', true)`
    )
    .join(",\n  ");
  return `
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
CREATE INDEX IF NOT EXISTS idx_recoup_src_bureau_customer_date ON recoup_src_bureau (customer_id, as_of_date);
CREATE INDEX IF NOT EXISTS idx_recoup_src_docs_customer ON recoup_src_docs (customer_id);
CREATE INDEX IF NOT EXISTS idx_recoup_src_docs_linked_record_ids ON recoup_src_docs USING gin (linked_record_ids);
CREATE INDEX IF NOT EXISTS idx_recoup_src_remittance_customer_payment ON recoup_src_remittance (customer_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_recoup_src_remittance_invoice_refs ON recoup_src_remittance USING gin (invoice_refs);
CREATE INDEX IF NOT EXISTS idx_recoup_src_remittance_deduction_refs ON recoup_src_remittance USING gin (deduction_refs);
CREATE INDEX IF NOT EXISTS idx_recoup_src_tpm_customer_window ON recoup_src_tpm (customer_id, window_start, window_end);
CREATE INDEX IF NOT EXISTS idx_recoup_src_tpm_claim_refs ON recoup_src_tpm USING gin (claim_refs);
CREATE UNIQUE INDEX IF NOT EXISTS idx_${safeTableName}_id ON ${safeTableName} (id);
CREATE INDEX IF NOT EXISTS idx_${safeTableName}_scope_sequence ON ${safeTableName} (scope, sequence);
CREATE INDEX IF NOT EXISTS idx_${safeTableName}_record_ids ON ${safeTableName} USING gin (record_ids_json);
CREATE INDEX IF NOT EXISTS idx_recoup_app_principals_capabilities ON recoup_app_principals USING gin (capabilities);

REVOKE ALL ON TABLE ${safeTableName} FROM anon, authenticated;
REVOKE ALL ON TABLE recoup_app_principals FROM anon, authenticated;
REVOKE ALL ON TABLE recoup_config FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_audit_chain FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_src_bureau FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_src_docs FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_src_remittance FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE recoup_src_tpm FROM anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE ${safeTableName} TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE recoup_app_principals TO service_role;
GRANT SELECT, INSERT ON TABLE recoup_config TO service_role;
GRANT SELECT, INSERT ON TABLE recoup_audit_chain TO service_role;
GRANT SELECT ON TABLE recoup_src_bureau TO service_role;
GRANT SELECT ON TABLE recoup_src_docs TO service_role;
GRANT SELECT ON TABLE recoup_src_remittance TO service_role;
GRANT SELECT ON TABLE recoup_src_tpm TO service_role;

INSERT INTO recoup_app_principals (principal, capabilities)
VALUES ('human:owner-ratified-day-1', ARRAY['config:approve'])
ON CONFLICT (principal) DO NOTHING;

INSERT INTO recoup_config (config_version, key, value_json, config_hash, effective_from, approved_by, active)
VALUES
  ${governedConfigSeedValues}
ON CONFLICT (config_version, key) DO NOTHING;

ALTER TABLE recoup_app_principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_app_principals FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_config FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_audit_chain ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_audit_chain FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_src_bureau ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_src_bureau FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_src_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_src_docs FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_src_remittance ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_src_remittance FORCE ROW LEVEL SECURITY;
ALTER TABLE recoup_src_tpm ENABLE ROW LEVEL SECURITY;
ALTER TABLE recoup_src_tpm FORCE ROW LEVEL SECURITY;
ALTER TABLE ${safeTableName} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${safeTableName} FORCE ROW LEVEL SECURITY;
`.trim();
}

async function requestRows(
  fetcher: SupabaseMemoryFetch,
  input: {
    body?: string;
    conflictAsEmpty?: boolean;
    method: "GET" | "POST";
    prefer?: string;
    serviceRoleKey: string;
    url: string;
  }
): Promise<SupabaseMemoryRow[]> {
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

  return (await response.json()) as SupabaseMemoryRow[];
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

function parseJsonCell(value: Record<string, unknown> | string | string[]): unknown {
  return typeof value === "string" ? (JSON.parse(value) as unknown) : value;
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
