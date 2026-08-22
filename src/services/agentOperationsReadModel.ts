import { isCashCapabilityEnabled } from "../../config/cashRollout.js";
import type { RuntimeEnv } from "../../config/localRuntimeEnv.js";
import type { WorkflowEvent, WorkflowRun } from "../types/workflow.js";
import { projectAgentOperations } from "./liveCaseReadModel.js";
import type { WorkflowRepository } from "./workflowRepository.js";

/**
 * Assembles the Agent Operations snapshot the cockpit renders.
 *
 * The route used to return a hardcoded empty snapshot, so `projectAgentOperations`
 * was never reached from the cockpit and no run could appear on the screen.
 * This is the missing half: it reads durable state and shapes it for display.
 *
 * Every decision the cockpit would otherwise have to make is made here — the
 * display status, the formatted time, whether a run is blocked — because the
 * cockpit is required to perform no business logic and no arithmetic.
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

export interface AgentOperationsCounts {
  active: number;
  queued: number;
  waiting: number;
  needsAttention: number;
}

export interface AgentRosterRow {
  agent: string;
  status: AgentStatus;
  health: AgentHealth;
}

export interface AgentOperationsRunRow {
  runId: string;
  agent: string;
  status: AgentStatus;
  caseId?: string;
  provenanceMode: WorkflowRun["provenanceMode"];
  blocked: boolean;
}

export interface AgentOperationsEventRow {
  eventId: string;
  runId: string;
  cursor: string;
  time: string;
  event: string;
  eventType: string;
  phase: string;
  recordIds: string[];
  provenanceMode: WorkflowEvent["provenanceMode"];
}

export interface AgentOperationsSnapshot {
  counts: AgentOperationsCounts;
  roster: AgentRosterRow[];
  runs: AgentOperationsRunRow[];
  events: AgentOperationsEventRow[];
  cursor: string;
}

/**
 * The roster is the fixed set of specialists the workspace reports on, so it is
 * present even with no runs. Reporting zero idle agents would read as an outage.
 */
const ROSTER_AGENTS = [
  "Cash Application",
  "Deduction Forensics",
  "Recovery Drafter",
  "Maya Queue"
] as const;

function emptyRoster(): AgentRosterRow[] {
  return ROSTER_AGENTS.map((agent) => ({ agent, status: "Idle", health: "healthy" }));
}

export function emptyAgentOperationsSnapshot(): AgentOperationsSnapshot {
  return {
    counts: { active: 0, queued: 0, waiting: 0, needsAttention: 0 },
    roster: emptyRoster(),
    runs: [],
    events: [],
    cursor: "0"
  };
}

/**
 * Run state to display status. The mapping lives here rather than in the
 * cockpit so a new state cannot silently render as something misleading: an
 * unrecognised state reads as Running, which is the honest "in flight, and I
 * cannot say more" answer.
 */
const STATUS_BY_RUN_STATE: Record<string, AgentStatus> = {
  Received: "Queued",
  AwaitingCashReceipt: "Waiting",
  ReasonReview: "Blocked",
  Review: "Blocked",
  Ready: "Completed"
};

function displayStatus(state: string, blocked: boolean): AgentStatus {
  if (blocked) {
    return "Blocked";
  }

  return STATUS_BY_RUN_STATE[state] ?? "Running";
}

export async function loadAgentOperationsSnapshot(input: {
  repository: WorkflowRepository;
  env: RuntimeEnv;
}): Promise<AgentOperationsSnapshot> {
  const { repository, env } = input;

  // Fail closed. Below the exposing stage, or with the kill switch engaged,
  // the rows are perfectly readable and must still not be shown.
  if (!isCashCapabilityEnabled(env, "agent_operations_exposure")) {
    return emptyAgentOperationsSnapshot();
  }

  const events = await repository.readEventsSince("0");
  const allRuns = await repository.listRuns();

  const runs: AgentOperationsRunRow[] = [];
  const counts: AgentOperationsCounts = { active: 0, queued: 0, waiting: 0, needsAttention: 0 };

  for (const run of allRuns) {
    const projected = projectAgentOperations({ run, events });

    if (projected === undefined) {
      // A run that exists but has emitted nothing is queued. Dropping it would
      // make accepted work disappear from the screen entirely.
      counts.queued += 1;
      continue;
    }

    const status = displayStatus(run.state, projected.blocked);

    runs.push({
      runId: projected.runId,
      agent: projected.specialist,
      status,
      ...(projected.caseId === undefined ? {} : { caseId: projected.caseId }),
      provenanceMode: projected.provenanceMode,
      blocked: projected.blocked
    });

    if (status === "Blocked") {
      counts.needsAttention += 1;
    } else if (status === "Waiting") {
      counts.waiting += 1;
    } else if (status === "Queued") {
      counts.queued += 1;
    } else if (status !== "Completed") {
      counts.active += 1;
    }
  }

  return {
    counts,
    roster: emptyRoster(),
    // Order is the order they happened. The loader never sorts or reverses.
    events: events.map((event) => ({
      eventId: event.eventId,
      runId: event.runId,
      cursor: event.cursor,
      time: event.occurredAt,
      event: event.safeSummary,
      eventType: event.eventType,
      phase: event.phase,
      recordIds: event.recordIds,
      provenanceMode: event.provenanceMode
    })),
    runs,
    cursor: events.at(-1)?.cursor ?? "0"
  };
}
