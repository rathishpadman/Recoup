import { loadLocalRuntimeEnvFiles } from "../../../config/localRuntimeEnv.ts";
import { requireRouteAccess } from "../demo-auth.ts";
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
  handoffs: [],
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
 *
 * The read is bounded. This page renders on every request and the backend it
 * calls can be cold, so an unbounded fetch would let a slow upstream hang a
 * page that has to render either way.
 */
const SNAPSHOT_READ_TIMEOUT_MS = 2_500;

async function readSnapshot(): Promise<AgentOperationsSnapshot> {
  // Read through the runtime env loader rather than process.env directly, the
  // way every other route that reaches the backend already does. It also picks
  // up .env and .env.local, which is what a local cockpit run relies on.
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const apiBaseUrl = runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317";

  try {
    const response = await fetch(`${apiBaseUrl}/agent-operations`, {
      cache: "no-store",
      signal: AbortSignal.timeout(SNAPSHOT_READ_TIMEOUT_MS)
    });

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
  // Gated like every other business surface. The snapshot carries customer
  // identity and money once the cash flags are on, so the route may not answer
  // an anonymous caller.
  await requireRouteAccess("/agent-operations");

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
