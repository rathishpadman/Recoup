"use client";

import { useState } from "react";

import { ActivityLedger } from "./activity-ledger.tsx";
import { AgentRoster } from "./agent-roster.tsx";
import { HandoffGraph } from "./handoff-graph.tsx";
import { RunDetailPanel } from "./run-detail.tsx";
import { RunTable } from "./run-table.tsx";
import { StatusTiles } from "./status-tiles.tsx";
import type { AgentOperationsSnapshot, RunDetail } from "./types.ts";

/**
 * Agent Operations workspace.
 *
 * Layout follows the approved ImageGen cues: counters across the top, roster
 * and runs on the left, run details and event ledger on the right.
 *
 * The component holds selection state and nothing else. The snapshot arrives
 * already derived from the durable event log, so a reload or a reconnect shows
 * the same thing: this component has no opinion the backend did not give it.
 */

interface AgentOperationsWorkspaceProps {
  snapshot: AgentOperationsSnapshot;
}

export function AgentOperationsWorkspace({ snapshot }: AgentOperationsWorkspaceProps) {
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(undefined);

  const selectedRun = snapshot.runs.find((run) => run.runId === selectedRunId);

  const detail: RunDetail | undefined =
    selectedRun === undefined
      ? undefined
      : {
          runId: selectedRun.runId,
          agent: selectedRun.agent,
          ...(selectedRun.scenario === undefined ? {} : { scenario: selectedRun.scenario }),
          ...(selectedRun.customer === undefined ? {} : { customer: selectedRun.customer }),
          status: selectedRun.status,
          ...(selectedRun.startedAt === undefined ? {} : { startedAt: selectedRun.startedAt }),
          ...(selectedRun.elapsed === undefined ? {} : { elapsed: selectedRun.elapsed }),
          ...(selectedRun.caseId === undefined ? {} : { caseId: selectedRun.caseId }),
          ...(selectedRun.evidence === undefined ? {} : { evidence: selectedRun.evidence }),
          ...(selectedRun.blockerCode === undefined ? {} : { blockerCode: selectedRun.blockerCode })
        };

  return (
    <div className="space-y-4" data-testid="agent-operations-workspace">
      <StatusTiles counts={snapshot.counts} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <AgentRoster rows={snapshot.roster} />
          <RunTable
            runs={snapshot.runs}
            selectedRunId={selectedRunId}
            onSelectRun={setSelectedRunId}
          />
        </div>

        <div className="space-y-4">
          <HandoffGraph handoffs={snapshot.handoffs} />
          <RunDetailPanel detail={detail} />
          <ActivityLedger events={snapshot.events} runId={selectedRunId} />
        </div>
      </div>
    </div>
  );
}
