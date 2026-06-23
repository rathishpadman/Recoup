"use client";

import * as React from "react";
import { FileSearchIcon, NotebookPenIcon, UserRoundCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeductionWorklistTable } from "./deduction-worklist-table.tsx";
import { MayaEmptyState } from "./maya-empty-state.tsx";
import { MayaRunKpiStrip } from "./maya-run-kpi-strip.tsx";
import { MayaWorkspaceShell } from "./maya-workspace-shell.tsx";
import { SourceReadinessStrip } from "./source-readiness-strip.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { MayaForensicsSurfaceProps, MayaWorklistItem } from "./types.ts";

export function MayaForensicsSurface({ connectors, model, session }: MayaForensicsSurfaceProps) {
  const [selectedWorklistItem, setSelectedWorklistItem] = React.useState<MayaWorklistItem | undefined>();
  const backendSelectedWorklistItem = React.useMemo(
    () => model.worklist.find((item) => item.lineIds.includes(model.selected.lineId)),
    [model.selected.lineId, model.worklist]
  );
  const fallbackSelectedWorklistItem = model.worklist.at(0);
  const initialSelectedWorklistItem = backendSelectedWorklistItem ?? fallbackSelectedWorklistItem;
  const visibleSelectedWorklistItem = selectedWorklistItem ?? initialSelectedWorklistItem;
  let selectedHasBackendDetail = false;
  if (selectedWorklistItem !== undefined) {
    selectedHasBackendDetail = selectedWorklistItem.lineIds.includes(model.selected.lineId);
  } else if (initialSelectedWorklistItem !== undefined) {
    selectedHasBackendDetail = initialSelectedWorklistItem.lineIds.includes(model.selected.lineId);
  }

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
        <div className="grid min-h-0 min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="min-w-0" aria-label="Maya queue">
            <DeductionWorklistTable
              items={model.worklist}
              onSelectItem={setSelectedWorklistItem}
              {...(visibleSelectedWorklistItem === undefined ? {} : { selectedLineId: visibleSelectedWorklistItem.lineId })}
            />
          </section>
          <aside className="min-w-0" aria-label="Work item starter">
            <Card className="min-h-[568px] rounded-lg shadow-none" data-testid="maya-work-item-pane" size="sm">
              {visibleSelectedWorklistItem === undefined ? (
                <CardContent className="flex min-h-[568px] flex-col items-center justify-center px-8">
                  <MayaEmptyState
                    description="View details, evidence, and workflow actions for the selected item."
                    title="Select a deduction to open its work item"
                  />
                </CardContent>
              ) : (
                <>
                  <CardHeader>
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="grid min-w-0 gap-1">
                        <CardTitle className="truncate">{visibleSelectedWorklistItem.customerLabel}</CardTitle>
                        <CardDescription className="truncate">{visibleSelectedWorklistItem.lineId}</CardDescription>
                      </div>
                      <Badge className="shrink-0" variant="outline">
                        Advisory only
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-5">
                    <div className="flex min-w-0 flex-col gap-4" data-testid="maya-selected-work-item">
                      <div className="grid gap-1">
                        <p className="text-sm text-muted-foreground">Scenario</p>
                        <h2 className="text-xl font-semibold leading-tight">{visibleSelectedWorklistItem.scenarioLabel}</h2>
                        <div className="flex flex-wrap gap-1" aria-label="Selected work item line IDs">
                          {visibleSelectedWorklistItem.lineIds.map((lineId) => (
                            <Badge key={`selected-${lineId}`} variant="outline">
                              {lineId}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Separator />
                      <div className="grid gap-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Amount</span>
                          <strong className="tabular-nums">{visibleSelectedWorklistItem.amount}</strong>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Verdict</span>
                          <Badge variant="secondary">{visibleSelectedWorklistItem.verdictLabel}</Badge>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Queue</span>
                          <span>{visibleSelectedWorklistItem.queueLabel}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Routing</span>
                          <span>{visibleSelectedWorklistItem.routingLabel}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Evidence</span>
                          <span>{visibleSelectedWorklistItem.evidenceScoreLabel}</span>
                        </div>
                      </div>
                      <Separator />
                      <div className="grid gap-3">
                        <div
                          className="grid gap-2 rounded-lg border bg-muted/35 p-3"
                          data-testid="maya-selected-advisory-callout"
                        >
                          <div className="flex items-center gap-2">
                            <UserRoundCheckIcon aria-hidden="true" data-icon="inline-start" />
                            <p className="text-sm font-medium">Recommended action</p>
                          </div>
                          <p className="text-sm">{visibleSelectedWorklistItem.recommendedActionLabel}</p>
                          <p className="text-xs text-muted-foreground">Advisory only. Human approval remains required for external action.</p>
                          <Badge className="justify-self-start" variant="outline">
                            {visibleSelectedWorklistItem.confidenceLabel}
                          </Badge>
                        </div>
                        <div className="grid gap-1.5">
                          <p className="text-sm font-medium">Read-model detail packet</p>
                          <p className="text-sm text-muted-foreground" data-testid="maya-selected-row-contract-note">
                            {selectedHasBackendDetail
                              ? "The current fixed evidence packet corresponds to this row."
                              : "Detailed evidence is unavailable for this row until the backend exposes row switching."}
                          </p>
                        </div>
                        <div className="grid gap-2">
                          <Button
                            data-testid="maya-local-row-action-open"
                            onClick={() => {
                              setSelectedWorklistItem(visibleSelectedWorklistItem);
                            }}
                            size="sm"
                            type="button"
                          >
                            <FileSearchIcon aria-hidden="true" data-icon="inline-start" />
                            Open investigation
                          </Button>
                          <Button data-testid="maya-local-row-action-add-note" disabled size="sm" type="button" variant="outline">
                            <NotebookPenIcon aria-hidden="true" data-icon="inline-start" />
                            Add note
                          </Button>
                        </div>
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
