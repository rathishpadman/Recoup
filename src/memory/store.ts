import { MemoryRecordSchema, type MemoryRecord } from "./schema.js";

export interface MemoryStore {
  append(record: MemoryRecord): MemoryRecord;
  find(scope: string, predicate: (record: MemoryRecord) => boolean): MemoryRecord | undefined;
  list(scope: string): MemoryRecord[];
  listAll(): MemoryRecord[];
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
    find(scope, predicate) {
      return records.find((record) => record.scope === scope && predicate(record));
    },
    list(scope) {
      return records.filter((record) => record.scope === scope);
    },
    listAll() {
      return [...records];
    }
  };
}
