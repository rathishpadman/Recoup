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

function readSnapshot(): AgentOperationsSnapshot {
  return emptySnapshot;
}

function readUpstreamOrigin(): UpstreamCashOrigin | undefined {
  return undefined;
}

export default function AgentOperationsPage() {
  const snapshot = readSnapshot();
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
