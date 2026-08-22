"use client";

import { useState } from "react";

import { ActivityLedger } from "./activity-ledger.tsx";
import { RunTable } from "./run-table.tsx";
import type { AgentOperationsSnapshot } from "./types.ts";

/**
 * Agent Operations workspace.
 *
 * Holds selection state and nothing else. The snapshot arrives already derived
 * from the durable event log, so a reload or a reconnect shows the same thing:
 * this component has no opinion the backend did not give it.
 */

interface AgentOperationsWorkspaceProps {
  snapshot: AgentOperationsSnapshot;
}

export function AgentOperationsWorkspace({ snapshot }: AgentOperationsWorkspaceProps) {
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(undefined);

  return (
    <div className="space-y-4" data-testid="agent-operations-workspace">
      <RunTable
        runs={snapshot.runs}
        selectedRunId={selectedRunId}
        onSelectRun={setSelectedRunId}
      />
      <ActivityLedger events={snapshot.events} runId={selectedRunId} />
    </div>
  );
}
