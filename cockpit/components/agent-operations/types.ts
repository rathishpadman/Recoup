/**
 * Agent Operations view types.
 *
 * These mirror the backend read model exactly. The cockpit performs no
 * business logic and no arithmetic: every value here was decided and formatted
 * by the backend, and the components only choose how to show it.
 *
 * Shapes follow the approved ImageGen cues in `mockups/imagegen/`.
 */

export type AgentStatus =
  | "Idle"
  | "Queued"
  | "Running"
  | "Waiting"
  | "Handed off"
  | "Blocked"
  | "Completed";

export type AgentHealth = "healthy" | "degraded" | "unavailable";

/** The four counters across the top of the workspace. */
export interface AgentOperationsCounts {
  active: number;
  queued: number;
  waiting: number;
  needsAttention: number;
}

/** Shown only while an agent is running. All values backend-formatted. */
export interface AgentCurrentAction {
  currentAction: string;
  tool: string;
  elapsed: string;
  traceHref?: string;
}

export interface AgentRosterRow {
  agent: string;
  /** What this specialist is for, in words a reader outside the team follows. */
  role: string;
  /** What it is doing right now, or why it is not. */
  activity: string;
  status: AgentStatus;
  health: AgentHealth;
  lastRun?: string;
  lastRunId?: string;
  lastScenario?: string;
  successRate30d?: string;
  avgRunTime30d?: string;
  currentAction?: AgentCurrentAction;
}

export interface AgentOperationsRunRow {
  runId: string;
  agent: string;
  scenario?: string;
  customer?: string;
  status: AgentStatus;
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
  elapsed?: string;
  caseId?: string;
  evidence?: RunEvidence;
  provenanceMode: "live" | "replay" | "synthetic";
  blocked: boolean;
}

/** Everything the case rests on. All backend-decided; money already formatted. */
export interface RunEvidence {
  caseId: string;
  remittanceId: string;
  receiptId: string;
  allocationId: string;
  claimedReason: string;
  validatedReason: string;
  shortPaymentAmount: string;
  currency: string;
  citedRecordCount: number;
  assumedPolicy: boolean;
}

export interface RunDetail {
  runId: string;
  agent: string;
  scenario?: string;
  customer?: string;
  status: AgentStatus;
  startedAt?: string;
  elapsed?: string;
  caseId?: string;
  evidence?: RunEvidence;
  blockerCode?: string;
}

export interface AgentOperationsEvent {
  eventId: string;
  runId: string;
  cursor: string;
  time: string;
  event: string;
  eventType: string;
  phase: string;
  specialist?: string;
  /** How that step turned out, decided by the backend. */
  outcome: string;
  recordIds: string[];
  provenanceMode: "live" | "replay" | "synthetic";
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

/** Emphasized only once the durable handoff event exists (FR-OPS-05). */
export interface AgentHandoffEdge {
  from: string;
  to: string;
  emphasized: boolean;
}

export interface AgentOperationsSnapshot {
  counts: AgentOperationsCounts;
  roster: AgentRosterRow[];
  handoffs: AgentHandoffEdge[];
  runs: AgentOperationsRunRow[];
  events: AgentOperationsEvent[];
  cursor: string;
}

/** Shown when no verified remittance email has arrived yet. */
export const RUNS_EMPTY_MESSAGE = "Waiting for a verified remittance email.";
export const NO_RUN_SELECTED_TITLE = "No run selected.";
