import type { MemoryRecord } from "./schema.js";
import type { MemoryStore } from "./store.js";

export interface WriteSessionStateInput {
  sessionId: string;
  key: string;
  value: string;
  recordIds: string[];
}

export interface WriteTransactionStateInput {
  transactionId: string;
  key: string;
  value: Record<string, unknown>;
  recordIds: string[];
}

export interface WriteAgentHandoffPacketInput {
  handoffId: string;
  capability: string;
  caseId: string;
  deterministicBasis: string;
  fromAgent: string;
  intent: string;
  toAgent: string;
  status: string;
  summary: string;
  recordIds: string[];
}

export interface WriteMayaQueryScopeMemoryInput {
  deterministicBasis: string;
  recordIds: string[];
  selectedLineId: string;
  sessionId: string;
  status: "answered" | "blocked" | "error" | "submitted";
}

const mayaQueryScopeMemoryKey = "maya-query-scope";
const mayaQueryScopeMemoryType = "maya_short_term_query_scope";
const safeMayaQueryMemoryRecordIdPattern = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}$/u;
const unsafeMayaQueryMemoryRecordIdPattern =
  /(?:@|bearer|secret|token|api[-_]?key|password|client[_-]?secret|sk-|\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b)/iu;

export function writeSessionState(store: MemoryStore, input: WriteSessionStateInput): MemoryRecord {
  return store.append({
    id: `session:${input.sessionId}:${input.key}`,
    category: "session_state",
    trustLevel: "trusted",
    scope: `session:${input.sessionId}`,
    payload: {
      key: input.key,
      value: input.value
    },
    recordIds: input.recordIds,
    createdAt: new Date().toISOString()
  });
}

export function readSessionState(store: MemoryStore, sessionId: string, key: string): MemoryRecord | undefined {
  return store.find(`session:${sessionId}`, (record) => record.payload["key"] === key);
}

export function writeMayaQueryScopeMemory(store: MemoryStore, input: WriteMayaQueryScopeMemoryInput): MemoryRecord {
  const selectedRecordIds = uniqueRecordIds([input.selectedLineId, ...input.recordIds]);
  if (!isSafeMayaQueryMemoryRecordId(input.selectedLineId) || !selectedRecordIds.every(isSafeMayaQueryMemoryRecordId)) {
    throw new Error("Maya query scope memory record IDs must be safe identifiers.");
  }

  return store.append({
    id: `session:${input.sessionId}:${mayaQueryScopeMemoryKey}`,
    category: "session_state",
    trustLevel: "trusted",
    scope: `session:${input.sessionId}`,
    payload: {
      deterministicBasis: input.deterministicBasis,
      key: mayaQueryScopeMemoryKey,
      memoryType: mayaQueryScopeMemoryType,
      selectedLineId: input.selectedLineId,
      selectedRecordIds,
      status: input.status
    },
    recordIds: selectedRecordIds,
    createdAt: new Date().toISOString()
  });
}

export function readMayaQueryScopeMemory(store: MemoryStore, sessionId: string): MemoryRecord | undefined {
  return store.find(`session:${sessionId}`, (record) => record.payload["key"] === mayaQueryScopeMemoryKey);
}

export function writeTransactionState(store: MemoryStore, input: WriteTransactionStateInput): MemoryRecord {
  return store.append({
    id: `transaction:${input.transactionId}:${input.key}`,
    category: "transaction_state",
    trustLevel: "trusted",
    scope: `transaction:${input.transactionId}`,
    payload: {
      key: input.key,
      value: input.value
    },
    recordIds: input.recordIds,
    createdAt: new Date().toISOString()
  });
}

export function readTransactionState(store: MemoryStore, transactionId: string, key: string): MemoryRecord | undefined {
  return store.find(`transaction:${transactionId}`, (record) => record.payload["key"] === key);
}

export function writeAgentHandoffPacket(store: MemoryStore, input: WriteAgentHandoffPacketInput): MemoryRecord {
  return store.append({
    id: `agent-handoff:${input.handoffId}`,
    category: "agent_handoff_packets",
    trustLevel: "semi_trusted",
    scope: `agent-handoff:${input.handoffId}`,
    payload: {
      capability: input.capability,
      caseId: input.caseId,
      deterministicBasis: input.deterministicBasis,
      fromAgent: input.fromAgent,
      intent: input.intent,
      status: input.status,
      summary: input.summary,
      toAgent: input.toAgent
    },
    recordIds: input.recordIds,
    createdAt: new Date().toISOString()
  });
}

export function readAgentHandoffPacket(store: MemoryStore, handoffId: string): MemoryRecord | undefined {
  return store.find(`agent-handoff:${handoffId}`, (record) => record.id === `agent-handoff:${handoffId}`);
}

function uniqueRecordIds(recordIds: readonly string[]): string[] {
  return [...new Set(recordIds.map((recordId) => recordId.trim()).filter((recordId) => recordId.length > 0))];
}

function isSafeMayaQueryMemoryRecordId(recordId: string): boolean {
  return safeMayaQueryMemoryRecordIdPattern.test(recordId) && !unsafeMayaQueryMemoryRecordIdPattern.test(recordId);
}
