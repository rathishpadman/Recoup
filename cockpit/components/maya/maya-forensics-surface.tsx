"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { DeductionWorklistTable } from "./deduction-worklist-table.tsx";
import { MayaEmptyState } from "./maya-empty-state.tsx";
import { MayaRunKpiStrip } from "./maya-run-kpi-strip.tsx";
import { MayaWorkspaceShell } from "./maya-workspace-shell.tsx";
import { SourceReadinessStrip } from "./source-readiness-strip.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MayaForensicsSurfaceProps, MayaWorklistItem } from "./types.ts";

export function MayaForensicsSurface({ connectors, model, session }: MayaForensicsSurfaceProps) {
  const [selectedWorklistItem, setSelectedWorklistItem] = React.useState<MayaWorklistItem | undefined>();
  const selectedHasBackendDetail =
    selectedWorklistItem !== undefined && selectedWorklistItem.lineIds.includes(model.selected.lineId);

  return (
    <MayaWorkspaceShell
      pendingActionCount={model.actionInbox.length}
      refreshedLabel={connectors.lastRefreshedLabel}
      session={session}
      worklistCount={model.worklist.length}
    >
      <section className="flex min-w-0 flex-1 flex-col gap-3" aria-label="Maya morning run summary">
        <MayaRunKpiStrip actionInbox={model.actionInbox} items={model.kpiStrip} recoveryTracker={model.recoveryTracker} />
        <SourceReadinessStrip connectors={connectors} />
        <div className="grid min-h-0 min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
          <section className="min-w-0" aria-label="Maya queue">
            <DeductionWorklistTable
              items={model.worklist}
              onSelectItem={setSelectedWorklistItem}
              {...(selectedWorklistItem === undefined ? {} : { selectedLineId: selectedWorklistItem.lineId })}
            />
          </section>
          <aside className="min-w-0" aria-label="Work item starter">
            <Card className="min-h-[568px] rounded-lg" data-testid="maya-work-item-pane" size="sm">
              {selectedWorklistItem === undefined ? (
                <CardContent className="flex min-h-[568px] flex-col items-center justify-center px-8">
                  <MayaEmptyState
                    description="View details, evidence, and workflow actions for the selected item."
                    title="Select a deduction to open its work item"
                  />
                </CardContent>
              ) : (
                <>
                  <CardHeader>
                    <CardTitle>Work item</CardTitle>
                    <CardDescription>UI-selected fetched row</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-4">
                    <div className="flex min-w-0 flex-col gap-4" data-testid="maya-selected-work-item">
                      <div className="grid gap-1">
                        <p className="text-sm text-muted-foreground">{selectedWorklistItem.customerLabel}</p>
                        <h2 className="text-xl font-semibold leading-tight">{selectedWorklistItem.scenarioLabel}</h2>
                        <div className="flex flex-wrap gap-1" aria-label="Selected work item line IDs">
                          {selectedWorklistItem.lineIds.map((lineId) => (
                            <Badge key={`selected-${lineId}`} variant="outline">
                              {lineId}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="grid gap-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Amount</span>
                          <strong className="tabular-nums">{selectedWorklistItem.amount}</strong>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Verdict</span>
                          <Badge variant="secondary">{selectedWorklistItem.verdictLabel}</Badge>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Queue</span>
                          <span>{selectedWorklistItem.queueLabel}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Evidence</span>
                          <span>{selectedWorklistItem.evidenceScoreLabel}</span>
                        </div>
                      </div>
                      <div className="grid gap-2 rounded-lg border p-3">
                        <p className="text-sm font-medium">Recommended action</p>
                        <p className="text-sm text-muted-foreground">{selectedWorklistItem.recommendedActionLabel}</p>
                        <Badge className="justify-self-start" variant="outline">
                          {selectedWorklistItem.confidenceLabel}
                        </Badge>
                      </div>
                      <div className="grid gap-2 rounded-lg border p-3">
                        <p className="text-sm font-medium">Backend fixed selected record</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedHasBackendDetail
                            ? "The current fixed evidence packet corresponds to this row."
                            : "Detailed evidence is unavailable for this row until the backend exposes row switching."}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </>
              )}
            </Card>
          </aside>
        </div>
      </section>
    </MayaWorkspaceShell>
  );
}
