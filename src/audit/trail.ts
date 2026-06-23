import { createHash } from "node:crypto";

export type AuditPayload = Record<string, unknown>;

export interface AuditAppendInput {
  entryType: string;
  payload: AuditPayload;
  recordIds: string[];
}

export interface AuditEntry extends AuditAppendInput {
  sequence: number;
  previousHash: string;
  entryHash: string;
}

export interface AuditEntryBuildOptions {
  previousHash: string;
  sequence: number;
}

export interface AuditTrail {
  append(input: AuditAppendInput): AuditEntry;
  entries(): AuditEntry[];
  verify(): boolean;
}

const genesisHash = "GENESIS";

export function createAuditTrail(): AuditTrail {
  const chain: AuditEntry[] = [];

  return {
    append(input) {
      const previousHash = chain.at(-1)?.entryHash ?? genesisHash;
      const immutableEntry = createAuditEntry(input, {
        previousHash,
        sequence: chain.length + 1
      });
      chain.push(immutableEntry);

      return immutableEntry;
    },
    entries() {
      return chain.map(cloneAuditEntry);
    },
    verify() {
      return chain.every((entry, index) => {
        const previousHash = index === 0 ? genesisHash : chain[index - 1]?.entryHash;
        return entry.previousHash === previousHash && entry.entryHash === hashEntry({ ...entry, entryHash: "" });
      });
    }
  };
}

export function createAuditEntry(input: AuditAppendInput, options: AuditEntryBuildOptions): AuditEntry {
  assertJsonRecord(input.payload);
  const entry = {
    entryType: input.entryType,
    payload: cloneJsonRecord(input.payload),
    recordIds: [...input.recordIds],
    sequence: options.sequence,
    previousHash: options.previousHash,
    entryHash: ""
  };
  entry.entryHash = hashEntry(entry);

  return deepFreeze(entry);
}

function cloneAuditEntry(entry: AuditEntry): AuditEntry {
  return deepFreeze({
    entryHash: entry.entryHash,
    entryType: entry.entryType,
    payload: cloneJsonRecord(entry.payload),
    previousHash: entry.previousHash,
    recordIds: [...entry.recordIds],
    sequence: entry.sequence
  });
}

function cloneJsonRecord(record: AuditPayload): AuditPayload {
  return structuredClone(record);
}

function assertJsonRecord(record: AuditPayload): void {
  assertJsonValue(record);
}

function assertJsonValue(value: unknown): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return;
  }

  if (Array.isArray(value)) {
    if (Object.keys(value).some((key) => !/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length)) {
      throw new Error("Audit payload must be JSON-serializable.");
    }
    for (const item of value) {
      assertJsonValue(item);
    }
    return;
  }

  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    for (const item of Object.values(value as Record<string, unknown>)) {
      assertJsonValue(item);
    }
    return;
  }

  throw new Error("Audit payload must be JSON-serializable.");
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }

  return value;
}

function hashEntry(entry: AuditEntry): string {
  const payload = JSON.stringify({
    entryType: entry.entryType,
    payload: entry.payload,
    previousHash: entry.previousHash,
    recordIds: entry.recordIds,
    sequence: entry.sequence
  });

  return createHash("sha256").update(payload).digest("hex");
}
