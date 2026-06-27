import { MemoryRecordSchema, type MemoryRecord } from "./schema.js";

export interface ApprovalLifecycleResetInput {
  approvalRecordId: string;
  approvalScope: string;
  auditRecord: MemoryRecord;
}

export interface MemoryStore {
  append(record: MemoryRecord): MemoryRecord;
  appendIfAbsent(record: MemoryRecord): MemoryRecord | undefined;
  find(scope: string, predicate: (record: MemoryRecord) => boolean): MemoryRecord | undefined;
  list(scope: string): MemoryRecord[];
  listAll(): MemoryRecord[];
  resetApprovalLifecycle(input: ApprovalLifecycleResetInput): number;
}

export function createInMemoryStore(): MemoryStore {
  const records: MemoryRecord[] = [];

  return {
    append(record) {
      const parsed = MemoryRecordSchema.parse(record);
      const existingIndex = records.findIndex((candidate) => candidate.id === parsed.id);
      if (existingIndex === -1) {
        records.push(parsed);
      } else {
        records[existingIndex] = parsed;
      }
      return parsed;
    },
    appendIfAbsent(record) {
      const parsed = MemoryRecordSchema.parse(record);
      if (records.some((candidate) => candidate.id === parsed.id)) {
        return undefined;
      }
      records.push(parsed);
      return parsed;
    },
    find(scope, predicate) {
      return records.find((record) => record.scope === scope && predicate(record));
    },
    list(scope) {
      return records.filter((record) => record.scope === scope);
    },
    listAll() {
      return [...records];
    },
    resetApprovalLifecycle(input) {
      const auditRecord = parseApprovalLifecycleResetAuditRecord(input.auditRecord);
      let deletedCount = 0;
      for (let index = records.length - 1; index >= 0; index -= 1) {
        const record = records[index];
        if (
          record?.category === "approval_records" &&
          record.id === input.approvalRecordId &&
          record.scope === input.approvalScope
        ) {
          records.splice(index, 1);
          deletedCount += 1;
        }
      }

      const auditRecordWithDeletedCount = withApprovalLifecycleResetCount(auditRecord, deletedCount);
      const existingIndex = records.findIndex((candidate) => candidate.id === auditRecord.id);
      if (existingIndex === -1) {
        records.push(auditRecordWithDeletedCount);
      } else {
        records[existingIndex] = auditRecordWithDeletedCount;
      }

      return deletedCount;
    }
  };
}

function parseApprovalLifecycleResetAuditRecord(record: MemoryRecord): MemoryRecord {
  const parsed = MemoryRecordSchema.parse(record);
  if (parsed.category !== "audit_refs") {
    throw new Error("Approval lifecycle reset audit record must be an audit_refs memory record.");
  }

  return parsed;
}

function withApprovalLifecycleResetCount(record: MemoryRecord, deletedRecordCount: number): MemoryRecord {
  return {
    ...record,
    payload: {
      ...record.payload,
      deletedRecordCount
    }
  };
}
