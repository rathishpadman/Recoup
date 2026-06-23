import { describe, expect, it } from "vitest";
import { createAuditEntry } from "../../src/audit/trail.js";
import {
  createSupabaseAuditChainRepository,
  createSupabaseAuditChainRepositoryFromEnv
} from "../../src/audit/supabaseTrail.js";
import type { MemoryRecord } from "../../src/memory/schema.js";
import type { SupabaseMemoryFetch } from "../../src/memory/supabaseStore.js";

const approvalMemoryRecord: MemoryRecord = {
  category: "approval_records",
  createdAt: "1970-01-01T00:00:00.000Z",
  id: "approval:draft-rebill:S3-L1",
  payload: {
    actionId: "draft-rebill:S3-L1",
    approverId: "human:maya-lead",
    auditEntryHash: "0".repeat(64),
    decision: "approve",
    status: "human_decided"
  },
  recordIds: ["draft-rebill:S3-L1"],
  scope: "approval:draft-rebill:S3-L1",
  trustLevel: "trusted"
};

describe("supabase audit-chain repository", () => {
  it("fetches the durable audit tail with service-role server headers only", async () => {
    const calls: Array<{ init: RequestInit; url: string }> = [];
    const fetcher: SupabaseMemoryFetch = (url, init) => {
      calls.push({ init, url });
      return Promise.resolve(
        new Response(JSON.stringify([{ entry_hash: "a".repeat(64), seq: 7 }]), {
          headers: { "content-type": "application/json" },
          status: 200
        })
      );
    };
    const repository = createSupabaseAuditChainRepository({
      fetcher,
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co/"
    });

    await expect(repository.readTail()).resolves.toEqual({
      entryHash: "a".repeat(64),
      sequence: 7
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "https://recoup.supabase.co/rest/v1/recoup_audit_chain?select=entry_hash%2Cseq&order=seq.desc&limit=1"
    );
    expect(calls[0]?.init).toMatchObject({
      headers: {
        apikey: "supabase-service-secret",
        authorization: "Bearer supabase-service-secret"
      },
      method: "GET"
    });
  });

  it("commits approval audit and final memory through the atomic RPC instead of raw audit table POST", async () => {
    const calls: Array<{ body?: string; init: RequestInit; url: string }> = [];
    const previousHash = "b".repeat(64);
    const entry = createAuditEntry(
      {
        entryType: "approval.decision",
        payload: {
          actionId: "draft-rebill:S3-L1",
          approverId: "human:maya-lead",
          decision: "approve",
          status: "human_decided"
        },
        recordIds: ["draft-rebill:S3-L1", "S3-L1"]
      },
      { previousHash, sequence: 8 }
    );
    const fetcher: SupabaseMemoryFetch = (url, init) => {
      const body = stringifyRequestBody(init.body);
      calls.push({ ...(body === undefined ? {} : { body }), init, url });
      return Promise.resolve(new Response(JSON.stringify({ committed: true }), { status: 200 }));
    };
    const repository = createSupabaseAuditChainRepository({
      fetcher,
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await repository.commitApprovalDecision({
      auditEntry: entry,
      expectedPreviousHash: previousHash,
      memoryRecord: { ...approvalMemoryRecord, payload: { ...approvalMemoryRecord.payload, auditEntryHash: entry.entryHash } },
      memoryTableName: "recoup_memory_records"
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://recoup.supabase.co/rest/v1/rpc/recoup_commit_approval_audit");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers).toEqual({
      apikey: "supabase-service-secret",
      authorization: "Bearer supabase-service-secret",
      "content-type": "application/json"
    });
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      p_audit_entry_hash: entry.entryHash,
      p_audit_payload: {
        entryType: "approval.decision",
        payload: entry.payload,
        recordIds: ["draft-rebill:S3-L1", "S3-L1"],
        sequence: 8
      },
      p_audit_prev_hash: previousHash,
      p_expected_prev_hash: previousHash,
      p_memory_category: "approval_records",
      p_memory_created_at: "1970-01-01T00:00:00.000Z",
      p_memory_id: "approval:draft-rebill:S3-L1",
      p_memory_payload_json: {
        actionId: "draft-rebill:S3-L1",
        approverId: "human:maya-lead",
        auditEntryHash: entry.entryHash,
        decision: "approve",
        status: "human_decided"
      },
      p_memory_record_ids_json: ["draft-rebill:S3-L1"],
      p_memory_scope: "approval:draft-rebill:S3-L1",
      p_memory_table_name: "recoup_memory_records",
      p_memory_trust_level: "trusted"
    });
    expect(calls.some((call) => call.url === "https://recoup.supabase.co/rest/v1/recoup_audit_chain")).toBe(false);
    expect(calls.map((call) => call.init.method)).not.toContain("UPDATE");
    expect(calls.map((call) => call.init.method)).not.toContain("DELETE");
  });

  it("maps genesis to null and non-genesis to the actual durable head", async () => {
    const calls: Array<{ body?: string; init: RequestInit; url: string }> = [];
    const repository = createSupabaseAuditChainRepository({
      fetcher: (url, init) => {
        const body = stringifyRequestBody(init.body);
        calls.push({ ...(body === undefined ? {} : { body }), init, url });
        return Promise.resolve(new Response(JSON.stringify({ committed: true }), { status: 200 }));
      },
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });
    const genesisEntry = createAuditEntry(
      {
        entryType: "approval.decision",
        payload: { actionId: "draft-rebill:S3-L1", decision: "approve" },
        recordIds: ["draft-rebill:S3-L1", "S3-L1"]
      },
      { previousHash: "GENESIS", sequence: 1 }
    );
    const durableHead = "c".repeat(64);
    const nextEntry = createAuditEntry(
      {
        entryType: "approval.decision",
        payload: { actionId: "route-billing:S1-L1", decision: "reject" },
        recordIds: ["route-billing:S1-L1", "S1-L1"]
      },
      { previousHash: durableHead, sequence: 4 }
    );

    await repository.commitApprovalDecision({
      auditEntry: genesisEntry,
      expectedPreviousHash: "GENESIS",
      memoryRecord: { ...approvalMemoryRecord, payload: { ...approvalMemoryRecord.payload, auditEntryHash: genesisEntry.entryHash } },
      memoryTableName: "recoup_memory_records"
    });
    await repository.commitApprovalDecision({
      auditEntry: nextEntry,
      expectedPreviousHash: durableHead,
      memoryRecord: { ...approvalMemoryRecord, payload: { ...approvalMemoryRecord.payload, auditEntryHash: nextEntry.entryHash } },
      memoryTableName: "recoup_memory_records"
    });

    expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({
      p_audit_prev_hash: null,
      p_expected_prev_hash: null
    });
    expect(JSON.parse(calls[1]?.body ?? "{}")).toMatchObject({
      p_audit_prev_hash: durableHead,
      p_expected_prev_hash: durableHead
    });
  });

  it("creates a repository only when Supabase server credentials are configured", () => {
    expect(createSupabaseAuditChainRepositoryFromEnv({})).toBeUndefined();
    expect(
      createSupabaseAuditChainRepositoryFromEnv({
        SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
        SUPABASE_URL: "https://recoup.supabase.co"
      })
    ).toBeDefined();
  });

  it("maps default Postgres audit-tail mismatch errors to retryable mismatches", async () => {
    const repository = createSupabaseAuditChainRepository({
      fetcher: () =>
        Promise.resolve(
          new Response(JSON.stringify({ code: "P0001", message: "audit_tail_mismatch" }), { status: 400 })
        ),
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });
    const entry = createAuditEntry(
      {
        entryType: "approval.decision",
        payload: { actionId: "draft-rebill:S3-L1", decision: "approve" },
        recordIds: ["draft-rebill:S3-L1", "S3-L1"]
      },
      { previousHash: "GENESIS", sequence: 1 }
    );

    await expect(
      repository.commitApprovalDecision({
        auditEntry: entry,
        expectedPreviousHash: "GENESIS",
        memoryRecord: { ...approvalMemoryRecord, payload: { ...approvalMemoryRecord.payload, auditEntryHash: entry.entryHash } },
        memoryTableName: "recoup_memory_records"
      })
    ).rejects.toThrow("Supabase audit-chain tail mismatch.");
  });

  it("does not leak service-role secrets when a durable audit commit fails", async () => {
    const repository = createSupabaseAuditChainRepository({
      fetcher: () =>
        Promise.resolve(
          new Response(JSON.stringify({ message: "permission denied for supabase-service-secret" }), { status: 503 })
        ),
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });
    const entry = createAuditEntry(
      {
        entryType: "approval.decision",
        payload: { actionId: "draft-rebill:S3-L1", decision: "approve" },
        recordIds: ["draft-rebill:S3-L1", "S3-L1"]
      },
      { previousHash: "GENESIS", sequence: 1 }
    );

    await expect(
      repository.commitApprovalDecision({
        auditEntry: entry,
        expectedPreviousHash: "GENESIS",
        memoryRecord: { ...approvalMemoryRecord, payload: { ...approvalMemoryRecord.payload, auditEntryHash: entry.entryHash } },
        memoryTableName: "recoup_memory_records"
      })
    ).rejects.toThrow("Supabase audit-chain commit failed with HTTP 503.");
    await expect(
      repository.commitApprovalDecision({
        auditEntry: entry,
        expectedPreviousHash: "GENESIS",
        memoryRecord: { ...approvalMemoryRecord, payload: { ...approvalMemoryRecord.payload, auditEntryHash: entry.entryHash } },
        memoryTableName: "recoup_memory_records"
      })
    ).rejects.not.toThrow("supabase-service-secret");
  });
});

function stringifyRequestBody(body: BodyInit | null | undefined): string | undefined {
  if (typeof body === "string") {
    return body;
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  return undefined;
}
