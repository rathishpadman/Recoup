"use client";

import * as React from "react";
import { ApprovalGateDialog } from "./approval-gate-dialog.tsx";
import { DeductionCaseWorkspace } from "./deduction-case-workspace.tsx";
import { DeductionWorklistTable } from "./deduction-worklist-table.tsx";
import { MayaEmptyState } from "./maya-empty-state.tsx";
import { MayaRunKpiStrip } from "./maya-run-kpi-strip.tsx";
import { MayaWorkspaceShell } from "./maya-workspace-shell.tsx";
import { QueryEvidenceDock } from "./query-evidence-dock.tsx";
import { SourceReadinessStrip } from "./source-readiness-strip.tsx";
import type { ApprovalGateResponse, MayaForensicsSurfaceProps, QueryEvidenceResponse } from "./types.ts";

export function MayaForensicsSurface({ connectors, model, session }: MayaForensicsSurfaceProps) {
  const [queryOpen, setQueryOpen] = React.useState(false);
  const [approvalOpen, setApprovalOpen] = React.useState(false);
  const [queryResponse, setQueryResponse] = React.useState<QueryEvidenceResponse | undefined>();
  const [approvalResponse, setApprovalResponse] = React.useState<ApprovalGateResponse | undefined>();
  const selectedWorklistItem = model.worklist.find((item) => item.lineIds.includes(model.selected.lineId));

  return (
    <MayaWorkspaceShell session={session}>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.86fr)]">
        <section className="flex min-w-0 flex-col gap-4" aria-label="Maya queue">
          <MayaRunKpiStrip items={model.kpiStrip} />
          <SourceReadinessStrip connectors={connectors} />
          <DeductionWorklistTable activeLineId={model.selected.lineId} items={model.worklist} />
        </section>
        {selectedWorklistItem === undefined ? (
          <MayaEmptyState
            description="The selected line ID was not present in the worklist read model."
            title="Read-model mismatch"
          />
        ) : (
          <DeductionCaseWorkspace
            actionInbox={model.actionInbox}
            journey={model.mayaJourney}
            multimodalDock={model.multimodalDock}
            onOpenApproval={() => {
              setApprovalOpen(true);
            }}
            onOpenQuery={() => {
              setQueryOpen(true);
            }}
            {...(approvalResponse === undefined ? {} : { approvalResponse })}
            {...(queryResponse === undefined ? {} : { queryResponse })}
            selected={model.selected}
            selectedWorklistItem={selectedWorklistItem}
          />
        )}
      </div>
      <QueryEvidenceDock
        dock={model.multimodalDock}
        onOpenChange={setQueryOpen}
        onResponse={setQueryResponse}
        open={queryOpen}
        recordIds={model.selected.evidencePack.recordIds}
        selectedLine={model.selected.lineId}
      />
      <ApprovalGateDialog
        actions={model.selected.approvalActions}
        actionId={model.selected.draft.actionId}
        draft={model.selected.draft}
        onOpenChange={setApprovalOpen}
        onResponse={setApprovalResponse}
        open={approvalOpen}
        recordIds={model.selected.evidencePack.recordIds}
      />
    </MayaWorkspaceShell>
  );
}
