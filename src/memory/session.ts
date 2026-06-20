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
    createdAt: new Date(0).toISOString()
  });
}

export function readSessionState(store: MemoryStore, sessionId: string, key: string): MemoryRecord | undefined {
  return store.find(`session:${sessionId}`, (record) => record.payload["key"] === key);
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
    createdAt: new Date(0).toISOString()
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
    createdAt: new Date(0).toISOString()
  });
}

export function readAgentHandoffPacket(store: MemoryStore, handoffId: string): MemoryRecord | undefined {
  return store.find(`agent-handoff:${handoffId}`, (record) => record.id === `agent-handoff:${handoffId}`);
}
