/**
 * Agent Operations view types.
 *
 * These mirror the backend read model exactly. The cockpit performs no
 * business logic and no arithmetic: every value here was decided and formatted
 * by the backend, and the components below only choose how to show it.
 */

export type AgentRunState =
  | "Idle"
  | "Queued"
  | "Running"
  | "Waiting"
  | "HandedOff"
  | "Blocked"
  | "Completed";

export interface AgentOperationsRunRow {
  runId: string;
  specialist: string;
  state: string;
  phase: string;
  lastEventType: string;
  lastEventAt: string;
  caseId?: string;
  provenanceMode: "live" | "replay" | "synthetic";
  blocked: boolean;
}

export interface AgentOperationsEvent {
  eventId: string;
  runId: string;
  cursor: string;
  eventType: string;
  phase: string;
  status: string;
  safeSummary: string;
  recordIds: string[];
  provenanceMode: "live" | "replay" | "synthetic";
  occurredAt: string;
}

export interface UpstreamCashOrigin {
  caseId: string;
  runId: string;
  shortPaymentAmount: string;
  currency: string;
  validatedReason: string;
  provenanceMode: "live" | "replay" | "synthetic";
  /** Backend-decided: the cited receipt did not come from an authoritative source. */
  rehearsalOnly: boolean;
  /** Backend-decided: the allocation cites an unratified policy version. */
  assumedPolicy: boolean;
  citedRecordCount: number;
  createdAt: string;
}

export interface AgentOperationsSnapshot {
  runs: AgentOperationsRunRow[];
  events: AgentOperationsEvent[];
  cursor: string;
}
