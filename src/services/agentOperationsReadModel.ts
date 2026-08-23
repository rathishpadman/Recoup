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

/** Shown only while an agent is still working. */
export interface AgentCurrentAction {
  currentAction: string;
  tool?: string;
  elapsed?: string;
}

export interface AgentRosterRow {
  agent: string;
  status: AgentStatus;
  health: AgentHealth;
  currentAction?: AgentCurrentAction;
  lastRun?: string;
  lastRunId?: string;
  lastScenario?: string;
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
  specialist?: string;
  /** The event's own status: how that step turned out. */
  outcome: string;
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

/**
 * The specialist name an event carries, mapped to its roster label. A
 * specialist with no run of its own stays idle rather than borrowing another's
 * status.
 */
const ROSTER_LABEL_BY_SPECIALIST: Record<string, string> = {
  cash_application: "Cash Application",
  deduction_forensics: "Deduction Forensics",
  recovery_drafter: "Recovery Drafter",
  maya_queue: "Maya Queue"
};

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

/**
 * Workflow name to the operator-facing scenario label. A workflow with no
 * approved label reports nothing rather than having its internal name shown:
 * an enum leaking onto the screen is how `cash_application` ended up there.
 */
const SCENARIO_BY_WORKFLOW: Record<string, string> = {
  cash_application_to_maya: "AR Cash App"
};

/**
 * Duration as mm:ss, or h:mm:ss once it runs past an hour. Computed here
 * because the cockpit performs no arithmetic, and a client-side clock would
 * disagree with the audit trail.
 */
function formatElapsed(fromIso: string, toIso: string): string | undefined {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);

  if (Number.isNaN(from) || Number.isNaN(to) || to < from) {
    return undefined;
  }

  const totalSeconds = Math.floor((to - from) / 1_000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3_600);
  const pad = (value: number): string => String(value).padStart(2, "0");

  return hours === 0 ? `${pad(minutes)}:${pad(seconds)}` : `${String(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

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
    const scenario = SCENARIO_BY_WORKFLOW[run.workflowName];
    // When work began, which is the first event, not when the row was created.
    const startedAt = events.find((event) => event.runId === run.runId)?.occurredAt;
    // Only a terminal run has a finish, so only a terminal run has an elapsed.
    const elapsed =
      run.terminalAt === undefined || startedAt === undefined
        ? undefined
        : formatElapsed(startedAt, run.terminalAt);

    runs.push({
      runId: projected.runId,
      agent: projected.specialist,
      ...(scenario === undefined ? {} : { scenario }),
      ...(run.customerReference === undefined ? {} : { customer: run.customerReference }),
      status,
      queuedAt: run.createdAt,
      ...(startedAt === undefined ? {} : { startedAt }),
      ...(run.terminalAt === undefined ? {} : { completedAt: run.terminalAt }),
      ...(elapsed === undefined ? {} : { elapsed }),
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

  // The roster reports the latest run each specialist has. A screen showing
  // "Waiting 1" beside four idle agents reads as broken and invites the reader
  // to distrust both halves.
  /**
   * The most recent thing a run did, for a run that has not finished. A
   * terminal run reports nothing: an action left on the screen after the work
   * stopped reads as still running.
   */
  const TERMINAL: AgentStatus[] = ["Completed", "Blocked"];
  const latestEventByRun = new Map<string, (typeof events)[number]>();
  for (const event of events) {
    latestEventByRun.set(event.runId, event);
  }

  const latestByAgent = new Map<string, AgentOperationsRunRow>();
  for (const row of runs) {
    const label = ROSTER_LABEL_BY_SPECIALIST[row.agent];
    if (label !== undefined) {
      latestByAgent.set(label, row);
    }
  }

  return {
    counts,
    roster: ROSTER_AGENTS.map((agent) => {
      const latest = latestByAgent.get(agent);

      return latest === undefined
        ? { agent, status: "Idle" as AgentStatus, health: "healthy" as AgentHealth }
        : {
            agent,
            status: latest.status,
            health: "healthy" as AgentHealth,
            ...(latest.completedAt === undefined ? {} : { lastRun: latest.completedAt }),
            lastRunId: latest.runId,
            ...(latest.scenario === undefined ? {} : { lastScenario: latest.scenario }),
            ...(TERMINAL.includes(latest.status)
              ? {}
              : (() => {
                  const event = latestEventByRun.get(latest.runId);

                  return event === undefined
                    ? {}
                    : { currentAction: { currentAction: event.safeSummary } };
                })())
          };
    }),
    // Order is the order they happened. The loader never sorts or reverses.
    events: events.map((event) => ({
      eventId: event.eventId,
      runId: event.runId,
      cursor: event.cursor,
      time: event.occurredAt,
      event: event.safeSummary,
      eventType: event.eventType,
      phase: event.phase,
      ...(event.specialist === undefined ? {} : { specialist: event.specialist }),
      outcome: event.status,
      recordIds: event.recordIds,
      provenanceMode: event.provenanceMode
    })),
    runs,
    cursor: events.at(-1)?.cursor ?? "0"
  };
}
