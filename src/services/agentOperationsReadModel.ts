import { isCashCapabilityEnabled } from "../../config/cashRollout.js";
import type { RuntimeEnv } from "../../config/localRuntimeEnv.js";
import type { LiveDeductionCase, WorkflowEvent, WorkflowRun } from "../types/workflow.js";
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
  /** What this specialist is for, in words a reader outside the team follows. */
  role: string;
  /** What it is doing right now, or why it is not. */
  activity: string;
  status: AgentStatus;
  health: AgentHealth;
  currentAction?: AgentCurrentAction;
  lastRun?: string;
  lastRunId?: string;
  lastScenario?: string;
}

/**
 * What the case rests on, for FR-OPS-06. Every value is the backend's, and the
 * money is the string the allocation produced: the cockpit neither computes nor
 * reformats a monetary value.
 */
export interface AgentOperationsRunEvidence {
  caseId: string;
  remittanceId: string;
  receiptId: string;
  allocationId: string;
  claimedReason: string;
  validatedReason: string;
  shortPaymentAmount: string;
  currency: string;
  citedRecordCount: number;
  /** The allocation or reason pack is registered as assumed, not ratified. */
  assumedPolicy: boolean;
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
  /** Why a run needs a person, when it does. */
  blockerCode?: string;
  evidence?: AgentOperationsRunEvidence;
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

/**
 * One edge of the handoff graph. FR-OPS-05: emphasized only once the durable
 * handoff event exists, never because a run looks like it is heading there.
 */
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

/**
 * What each specialist is for. The screen previously named four specialists and
 * explained none of them, which left the reader to infer the pipeline from four
 * labels and a row of dashes.
 */
const ROLE_BY_AGENT: Record<string, string> = {
  "Cash Application": "Reads the payment note, confirms the money arrived and works out the shortfall",
  "Deduction Forensics": "Investigates whether a deduction the customer took is justified",
  "Recovery Drafter": "Prepares a recovery letter when money is owed back",
  "Maya Queue": "Holds prepared cases until a person decides"
};

function emptyRoster(): AgentRosterRow[] {
  return ROSTER_AGENTS.map((agent) => ({
    agent,
    role: ROLE_BY_AGENT[agent] ?? "",
    activity: "Nothing to do",
    status: "Idle",
    health: "healthy"
  }));
}

export function emptyAgentOperationsSnapshot(): AgentOperationsSnapshot {
  return {
    counts: { active: 0, queued: 0, waiting: 0, needsAttention: 0 },
    handoffs: HANDOFF_EDGES.map((edge) => ({ ...edge, emphasized: false })),
    roster: emptyRoster(),
    runs: [],
    events: [],
    cursor: "0"
  };
}

/**
 * The edges the workflow can take, in order. Drawn always so the shape of the
 * pipeline is legible; emphasized only on evidence.
 */
const HANDOFF_EDGES: readonly { from: string; to: string; event: WorkflowEvent["eventType"] }[] = [
  { from: "Cash Application", to: "Deduction Forensics", event: "maya_ready" },
  { from: "Deduction Forensics", to: "Recovery Drafter", event: "agent_handoff" },
  { from: "Recovery Drafter", to: "Maya Queue", event: "human_decision" }
];

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

/**
 * How long a run may wait for the money before it stops being a wait.
 *
 * AC-06 wants the worker to exhaust the retry and dead-letter it. That needs
 * D-11, so until then the age is read here instead: a run that has waited past
 * this is shown as work for a person rather than left to accumulate quietly in
 * the Waiting column, which is how ten of them went unnoticed.
 */
const MAX_WAIT_HOURS = 24;

function waitExhausted(run: WorkflowRun): boolean {
  if (run.state !== "AwaitingCashReceipt") {
    return false;
  }

  const started = Date.parse(run.createdAt);

  return !Number.isNaN(started) && Date.now() - started > MAX_WAIT_HOURS * 3_600_000;
}

function displayStatus(state: string, blocked: boolean): AgentStatus {
  if (blocked) {
    return "Blocked";
  }

  return STATUS_BY_RUN_STATE[state] ?? "Running";
}


/** Plain-language description of what a run is doing, for the roster row. */
function activityFor(agent: string, run: AgentOperationsRunRow): string {
  const who = run.customer ?? "a payment";

  switch (run.status) {
    case "Completed":
      return run.caseId === undefined
        ? `Finished ${who} — nothing deducted`
        : `Finished ${who} — case raised`;
    case "Waiting":
      return `Holding ${who} until the money is confirmed`;
    case "Blocked":
      return `Stopped on ${who} — needs a person`;
    case "Queued":
      return `About to start ${who}`;
    default:
      return `Working on ${who}`;
  }
}

/**
 * State for a specialist that has no runs of its own, derived from the cases
 * that reached it. Returns nothing when no case did, so an idle specialist
 * stays idle rather than borrowing another's activity.
 */
function downstreamState(
  agent: string,
  casesByRun: Map<string, LiveDeductionCase>
): { activity: string; status: AgentStatus } | undefined {
  const cases = [...casesByRun.values()];

  if (cases.length === 0) {
    return undefined;
  }

  const plural = cases.length === 1 ? "case" : "cases";

  if (agent === "Deduction Forensics") {
    return { activity: `${String(cases.length)} ${plural} to investigate`, status: "Queued" };
  }

  if (agent === "Maya Queue") {
    return { activity: `${String(cases.length)} ${plural} waiting for a decision`, status: "Waiting" };
  }

  // Recovery drafts only after Forensics finds money owed back, and nothing
  // records that yet. Claiming otherwise would be the decoration again.
  return undefined;
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
  const casesByRun = new Map((await repository.listCases()).map((entry) => [entry.runId, entry]));

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

    const exhausted = waitExhausted(run);
    const status = exhausted ? "Blocked" : displayStatus(run.state, projected.blocked);
    const scenario = SCENARIO_BY_WORKFLOW[run.workflowName];
    // When work began, which is the first event, not when the row was created.
    const startedAt = events.find((event) => event.runId === run.runId)?.occurredAt;
    // Only a terminal run has a finish, so only a terminal run has an elapsed.
    const elapsed =
      run.terminalAt === undefined || startedAt === undefined
        ? undefined
        : formatElapsed(startedAt, run.terminalAt);

    const liveCase = casesByRun.get(run.runId);
    const evidence =
      liveCase === undefined
        ? undefined
        : {
            caseId: liveCase.caseId,
            remittanceId: liveCase.remittanceId,
            receiptId: liveCase.receiptId,
            allocationId: liveCase.allocationId,
            claimedReason: liveCase.claimedReason,
            validatedReason: liveCase.validatedReason,
            shortPaymentAmount: liveCase.shortPaymentAmount,
            currency: liveCase.currency,
            citedRecordCount: liveCase.recordIds.length,
            assumedPolicy: Object.values(liveCase.policyVersions).some((version) =>
              version.toLowerCase().includes("assumed")
            )
          };

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
      ...(exhausted ? { blockerCode: "wait_exhausted" } : {}),
      ...(evidence === undefined ? {} : { evidence }),
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

  // Evidence only: an edge lights up because its event is in the log.
  const seenEventTypes = new Set(events.map((event) => event.eventType));

  return {
    counts,
    handoffs: HANDOFF_EDGES.map((edge) => ({
      from: edge.from,
      to: edge.to,
      emphasized: seenEventTypes.has(edge.event)
    })),
    roster: ROSTER_AGENTS.map((agent) => {
      const latest = latestByAgent.get(agent);
      const role = ROLE_BY_AGENT[agent] ?? "";

      /**
       * Downstream specialists have no runs of their own yet, so their state is
       * read from the cases that reached them. That is real: a case handed over
       * is work waiting, whoever picks it up. Inventing a run for them would be
       * the same mistake as the specialist that was never written.
       */
      if (latest === undefined) {
        const downstream = downstreamState(agent, casesByRun);

        return downstream === undefined
          ? { agent, role, activity: "Nothing to do", status: "Idle" as AgentStatus, health: "healthy" as AgentHealth }
          : { agent, role, ...downstream, health: "healthy" as AgentHealth };
      }

      return {
            agent,
            role,
            activity: activityFor(agent, latest),
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
