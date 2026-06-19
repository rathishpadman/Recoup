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
      const entry = {
        ...input,
        sequence: chain.length + 1,
        previousHash,
        entryHash: ""
      };
      entry.entryHash = hashEntry(entry);
      chain.push(entry);

      return entry;
    },
    entries() {
      return [...chain];
    },
    verify() {
      return chain.every((entry, index) => {
        const previousHash = index === 0 ? genesisHash : chain[index - 1]?.entryHash;
        return entry.previousHash === previousHash && entry.entryHash === hashEntry({ ...entry, entryHash: "" });
      });
    }
  };
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
