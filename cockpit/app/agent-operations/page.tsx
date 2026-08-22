import { AgentOperationsWorkspace } from "@/components/agent-operations/agent-operations-workspace";
import { UpstreamCashOriginPanel } from "@/components/maya/upstream-cash-origin";
import type {
  AgentOperationsSnapshot,
  UpstreamCashOrigin
} from "@/components/agent-operations/types";

/**
 * Agent Operations route.
 *
 * The snapshot is rendered as supplied. This page performs no derivation: the
 * backend read model decides state, blocked-ness, provenance and both warning
 * flags, and the route only passes them through.
 *
 * While the cash rollout stage is below `shadow` there is no live data to read,
 * so the route renders an empty snapshot rather than fabricating rows. That is
 * the same fail-closed posture the backend takes.
 */

export const dynamic = "force-dynamic";

/**
 * The roster is the fixed set of specialists the workspace reports on, so it is
 * present even with no runs. Counts are zero and every agent is idle, which is
 * the truthful picture below the shadow rollout stage.
 */
const emptySnapshot: AgentOperationsSnapshot = {
  counts: { active: 0, queued: 0, waiting: 0, needsAttention: 0 },
  roster: [
    { agent: "Cash Application", status: "Idle", health: "healthy" },
    { agent: "Deduction Forensics", status: "Idle", health: "healthy" },
    { agent: "Recovery Drafter", status: "Idle", health: "healthy" },
    { agent: "Maya Queue", status: "Idle", health: "healthy" }
  ],
  runs: [],
  events: [],
  cursor: "0"
};

/**
 * Reads the snapshot the backend assembled.
 *
 * Nothing is derived here. The backend decides what is exposed from the
 * rollout stage and the kill switch, so an empty snapshot arriving over the
 * wire is an answer rather than an absence.
 *
 * An unreachable backend also renders the empty snapshot. Below the exposing
 * stage there is legitimately no backend to reach, and the empty state is the
 * truthful picture there; the API route returns 502 for callers that need to
 * tell an outage apart from a quiet system.
 */
async function readSnapshot(): Promise<AgentOperationsSnapshot> {
  const apiBaseUrl = process.env.RECOUP_API_URL ?? "http://127.0.0.1:4317";

  try {
    const response = await fetch(`${apiBaseUrl}/agent-operations`, { cache: "no-store" });

    if (!response.ok) {
      return emptySnapshot;
    }

    return (await response.json()) as AgentOperationsSnapshot;
  } catch {
    return emptySnapshot;
  }
}

function readUpstreamOrigin(): UpstreamCashOrigin | undefined {
  return undefined;
}

export default async function AgentOperationsPage() {
  const snapshot = await readSnapshot();
  const origin = readUpstreamOrigin();

  return (
    <main className="space-y-6 p-6" data-testid="agent-operations-page">
      <header>
        <h1 className="text-2xl font-semibold">Agent Operations</h1>
        <p className="text-sm text-muted-foreground">
          Live agent state derived from durable workflow events.
        </p>
      </header>

      <AgentOperationsWorkspace snapshot={snapshot} />

      {origin === undefined ? null : <UpstreamCashOriginPanel origin={origin} />}
    </main>
  );
}
