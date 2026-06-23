import type { RuntimeEnv } from "../../config/env.js";
import { MemoryRecordSchema, type MemoryRecord } from "../memory/schema.js";
import type { SupabaseMemoryFetch } from "../memory/supabaseStore.js";
import type { AuditEntry } from "./trail.js";

export interface SupabaseAuditTail {
  entryHash: string;
  sequence: number;
}

export interface SupabaseAuditChainCommitInput {
  auditEntry: AuditEntry;
  expectedPreviousHash: string;
  memoryRecord: MemoryRecord;
  memoryTableName?: string;
}

export interface SupabaseAuditChainRepository {
  commitApprovalDecision(input: SupabaseAuditChainCommitInput): Promise<void>;
  readTail(): Promise<SupabaseAuditTail | undefined>;
}

export interface SupabaseAuditChainRepositoryOptions {
  fetcher?: SupabaseMemoryFetch;
  serviceRoleKey: string;
  url: string;
}

interface SupabaseAuditTailRow {
  entry_hash: string;
  seq: number | string;
}

const defaultMemoryTableName = "recoup_memory_records";
const genesisHash = "GENESIS";
const durableAuditConflictStatus = 409;

export function createSupabaseAuditChainRepository(
  options: SupabaseAuditChainRepositoryOptions
): SupabaseAuditChainRepository {
  const baseUrl = normalizeSupabaseUrl(options.url);
  const fetcher = options.fetcher ?? fetch;

  return {
    async readTail() {
      const url = new URL(`${baseUrl}/rest/v1/recoup_audit_chain`);
      url.searchParams.set("select", "entry_hash,seq");
      url.searchParams.set("order", "seq.desc");
      url.searchParams.set("limit", "1");

      const rows = await requestTailRows(fetcher, {
        serviceRoleKey: options.serviceRoleKey,
        url: url.href
      });
      const row = rows[0];
      return row === undefined ? undefined : parseTailRow(row);
    },
    async commitApprovalDecision(input) {
      const parsedMemoryRecord = MemoryRecordSchema.parse(input.memoryRecord);
      await requestCommit(fetcher, {
        body: JSON.stringify(toCommitRpcPayload({
          ...input,
          memoryRecord: parsedMemoryRecord,
          memoryTableName: input.memoryTableName ?? defaultMemoryTableName
        })),
        serviceRoleKey: options.serviceRoleKey,
        url: `${baseUrl}/rest/v1/rpc/recoup_commit_approval_audit`
      });
    }
  };
}

export function createSupabaseAuditChainRepositoryFromEnv(
  env: RuntimeEnv,
  fetcher?: SupabaseMemoryFetch
): SupabaseAuditChainRepository | undefined {
  if (env.SUPABASE_SERVICE_ROLE_KEY === undefined || env.SUPABASE_URL === undefined) {
    return undefined;
  }

  return createSupabaseAuditChainRepository({
    ...(fetcher === undefined ? {} : { fetcher }),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    url: env.SUPABASE_URL
  });
}

export function isSupabaseAuditTailMismatch(error: unknown): boolean {
  return error instanceof Error && error.message === "Supabase audit-chain tail mismatch.";
}

async function requestTailRows(
  fetcher: SupabaseMemoryFetch,
  input: {
    serviceRoleKey: string;
    url: string;
  }
): Promise<SupabaseAuditTailRow[]> {
  const response = await fetcher(input.url, {
    headers: serviceRoleHeaders(input.serviceRoleKey),
    method: "GET"
  });

  if (!response.ok) {
    throw new Error(`Supabase audit-chain tail request failed with HTTP ${String(response.status)}.`);
  }

  const rows = (await response.json()) as unknown;
  if (!Array.isArray(rows)) {
    throw new Error("Supabase audit-chain tail response must be an array of rows.");
  }

  return rows.map((row) => row as SupabaseAuditTailRow);
}

async function requestCommit(
  fetcher: SupabaseMemoryFetch,
  input: {
    body: string;
    serviceRoleKey: string;
    url: string;
  }
): Promise<void> {
  const response = await fetcher(input.url, {
    body: input.body,
    headers: {
      ...serviceRoleHeaders(input.serviceRoleKey),
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    const body = await response.text();
    if (isAuditTailMismatchBody(body)) {
      throw new Error("Supabase audit-chain tail mismatch.");
    }
    if (response.status === durableAuditConflictStatus) {
      throw new Error("Supabase approval decision already committed.");
    }
    throw new Error(`Supabase audit-chain commit failed with HTTP ${String(response.status)}.`);
  }
}

function isAuditTailMismatchBody(body: string): boolean {
  return /audit[-_\s]?tail[-_\s]?mismatch/iu.test(body);
}

function serviceRoleHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`
  };
}

function toCommitRpcPayload(input: Required<SupabaseAuditChainCommitInput>): Record<string, unknown> {
  const auditPreviousHash = input.auditEntry.previousHash === genesisHash ? null : input.auditEntry.previousHash;
  const expectedPreviousHash = input.expectedPreviousHash === genesisHash ? null : input.expectedPreviousHash;

  return {
    p_audit_entry_hash: input.auditEntry.entryHash,
    p_audit_payload: {
      entryType: input.auditEntry.entryType,
      payload: input.auditEntry.payload,
      recordIds: input.auditEntry.recordIds,
      sequence: input.auditEntry.sequence
    },
    p_audit_prev_hash: auditPreviousHash,
    p_expected_prev_hash: expectedPreviousHash,
    p_memory_category: input.memoryRecord.category,
    p_memory_created_at: input.memoryRecord.createdAt,
    p_memory_id: input.memoryRecord.id,
    p_memory_payload_json: input.memoryRecord.payload,
    p_memory_record_ids_json: input.memoryRecord.recordIds,
    p_memory_scope: input.memoryRecord.scope,
    p_memory_table_name: normalizeTableName(input.memoryTableName),
    p_memory_trust_level: input.memoryRecord.trustLevel
  };
}

function parseTailRow(row: SupabaseAuditTailRow): SupabaseAuditTail {
  const sequence = typeof row.seq === "string" ? Number(row.seq) : row.seq;
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("Supabase audit-chain tail sequence is invalid.");
  }

  return {
    entryHash: row.entry_hash,
    sequence
  };
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
