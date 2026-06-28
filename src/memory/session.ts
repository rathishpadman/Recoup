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

export interface WriteMayaCaseRecallMemoryInput {
  caseId: string;
  deterministicBasis: string;
  recordIds: string[];
  selectedLineId: string;
  sessionId: string;
  status: "answered" | "blocked" | "error" | "submitted";
}

export interface MayaQueryMemoryRecallContext {
  deterministicBasis: "trusted governed Maya case recall memory records";
  memoryRecordIds: string[];
  recordIds: string[];
  scopes: string[];
  selectedLineId: string;
}

const mayaCaseRecallMemoryKey = "maya-case-recall";
const mayaCaseRecallMemoryType = "maya_long_term_case_recall";
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

export function writeMayaCaseRecallMemory(store: MemoryStore, input: WriteMayaCaseRecallMemoryInput): MemoryRecord {
  const selectedRecordIds = uniqueRecordIds([input.selectedLineId, ...input.recordIds]);
  if (
    !isSafeMayaQueryMemoryRecordId(input.caseId) ||
    !isSafeMayaQueryMemoryRecordId(input.selectedLineId) ||
    !isSafeMayaQueryMemoryRecordId(input.sessionId) ||
    !selectedRecordIds.every(isSafeMayaQueryMemoryRecordId)
  ) {
    throw new Error("Maya case recall memory identifiers must be safe identifiers.");
  }

  return store.append({
    id: `case:${input.caseId}:maya-recall:${input.sessionId}:${input.selectedLineId}`,
    category: "case_state",
    trustLevel: "trusted",
    scope: `case:${input.caseId}`,
    payload: {
      caseId: input.caseId,
      deterministicBasis: input.deterministicBasis,
      key: mayaCaseRecallMemoryKey,
      memoryType: mayaCaseRecallMemoryType,
      selectedLineId: input.selectedLineId,
      selectedRecordIds,
      sessionId: input.sessionId,
      status: input.status
    },
    recordIds: selectedRecordIds,
    createdAt: new Date().toISOString()
  });
}

export function readMayaCaseRecallMemories(store: MemoryStore, caseId: string): MemoryRecord[] {
  return store.list(`case:${caseId}`).filter((record) => isTrustedMayaCaseRecallRecord(record, caseId));
}

export function buildMayaQueryMemoryRecallContext(
  records: readonly MemoryRecord[],
  selectedLineId: string
): MayaQueryMemoryRecallContext | undefined {
  const trustedRecords = records.filter(
    (record) =>
      isTrustedMayaCaseRecallRecord(record, selectedLineId) &&
      record.recordIds.includes(selectedLineId) &&
      record.recordIds.every(isSafeMayaQueryMemoryRecordId)
  );
  if (trustedRecords.length === 0) {
    return undefined;
  }

  return {
    deterministicBasis: "trusted governed Maya case recall memory records",
    memoryRecordIds: trustedRecords.map((record) => record.id),
    recordIds: uniqueRecordIds(trustedRecords.flatMap((record) => record.recordIds)),
    scopes: uniqueRecordIds(trustedRecords.map((record) => record.scope)),
    selectedLineId
  };
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

function isTrustedMayaCaseRecallRecord(record: MemoryRecord, caseId: string): boolean {
  const selectedLineId = record.payload["selectedLineId"];
  const sessionId = record.payload["sessionId"];
  const selectedRecordIds = record.payload["selectedRecordIds"];
  return (
    record.category === "case_state" &&
    record.trustLevel === "trusted" &&
    record.id === `case:${caseId}:maya-recall:${String(sessionId)}:${caseId}` &&
    record.scope === `case:${caseId}` &&
    record.payload["caseId"] === caseId &&
    record.payload["key"] === mayaCaseRecallMemoryKey &&
    record.payload["memoryType"] === mayaCaseRecallMemoryType &&
    typeof record.payload["deterministicBasis"] === "string" &&
    record.payload["status"] === "answered" &&
    selectedLineId === caseId &&
    typeof sessionId === "string" &&
    isSafeMayaQueryMemoryRecordId(sessionId) &&
    Array.isArray(selectedRecordIds) &&
    selectedRecordIds.every((recordId): recordId is string => typeof recordId === "string") &&
    selectedRecordIds.every(isSafeMayaQueryMemoryRecordId) &&
    sameRecordIds(selectedRecordIds, record.recordIds) &&
    record.recordIds.every(isSafeMayaQueryMemoryRecordId)
  );
}

function sameRecordIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((recordId, index) => recordId === right[index]);
}
