"use client";

import * as React from "react";
import {
  AlertCircleIcon,
  ClipboardListIcon,
  FileLockIcon,
  FileTextIcon,
  LockIcon,
  ShieldCheckIcon
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentTracePanel } from "./agent-trace-panel.tsx";
import { AuditConfirmationPanel } from "./audit-confirmation-panel.tsx";
import { EvidenceDossier } from "./evidence-dossier.tsx";
import { MayaEmptyState } from "./maya-empty-state.tsx";
import { QueryEvidenceDock } from "./query-evidence-dock.tsx";
import { RecoveryDraftReview } from "./recovery-draft-review.tsx";
import type {
  MayaActionInboxItem,
  MayaJourneyItem,
  MayaMultimodalDock,
  MayaSelectedCase,
  MayaSourceTile,
  MayaWorklistItem
} from "./types.ts";

interface DeductionCaseWorkspaceProps {
  actionInbox: MayaActionInboxItem[];
  hasBackendDetail: boolean;
  journey: MayaJourneyItem[];
  multimodalDock: MayaMultimodalDock;
  selected: MayaSelectedCase;
  selectedWorklistItem: MayaWorklistItem | undefined;
  sourceTiles: MayaSourceTile[];
}

export function DeductionCaseWorkspace({
  actionInbox,
  hasBackendDetail,
  journey,
  multimodalDock,
  selected,
  selectedWorklistItem,
  sourceTiles
}: DeductionCaseWorkspaceProps) {
  const [queryDockOpen, setQueryDockOpen] = React.useState(false);
  const canShowBackendDetail =
    hasBackendDetail && selectedWorklistItem !== undefined && selectedWorklistItem.lineIds.includes(selected.lineId);
  const selectedLineIndex = selectedWorklistItem?.lineIds.indexOf(selected.lineId) ?? -1;
  const selectedLinePosition =
    canShowBackendDetail && selectedLineIndex >= 0
      ? `Line ${String(selectedLineIndex + 1)} of ${String(selectedWorklistItem.lineCount)}`
      : "Selected line unavailable";
  const amount = selectedWorklistItem?.amount ?? selected.draft.amount;
  const title = selectedWorklistItem?.scenarioLabel ?? selected.draft.actionLabel;
  const customer = selectedWorklistItem?.customerLabel ?? "Unavailable";

  return (
    <section className="flex min-w-0 flex-col gap-3" data-testid="maya-case-workspace">
      <Card className="rounded-lg shadow-none" size="sm">
        <CardHeader className="gap-4">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="grid min-w-0 gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>Worklist</span>
                <span aria-hidden="true">/</span>
                <span className="truncate">{selectedWorklistItem?.lineId ?? selected.lineId}</span>
              </div>
              <div className="grid min-w-0 gap-1">
                <CardTitle className="text-2xl leading-tight">{title}</CardTitle>
                <CardDescription className="text-sm">{customer}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2" data-testid="maya-case-detail-backend-status">
                {selectedWorklistItem === undefined ? (
                  <Badge variant="outline">Contract gap</Badge>
                ) : (
                  <>
                    <Badge variant="secondary">{selectedWorklistItem.verdictLabel}</Badge>
                    <Badge variant="outline">{selectedWorklistItem.routingLabel}</Badge>
                    <Badge variant="outline">{selectedWorklistItem.queueLabel}</Badge>
                    <Badge variant="outline">{selectedWorklistItem.confidenceLabel}</Badge>
                  </>
                )}
                {canShowBackendDetail ? <Badge variant="outline">{selected.draft.statusLabel}</Badge> : null}
              </div>
            </div>
            <div
              aria-label="Read-only amount"
              aria-readonly="true"
              className="grid min-w-56 gap-1 rounded-lg border bg-muted/30 p-3 text-right"
              data-testid="maya-case-overview-readonly-amount"
            >
              <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                <LockIcon aria-hidden="true" data-icon="inline-start" />
                <span>Amount read-only</span>
              </div>
              <strong className="text-2xl tabular-nums">{amount}</strong>
              <span className="text-xs text-muted-foreground">Backend formatted</span>
            </div>
          </div>
          <Separator />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <CaseFact label="Customer" value={customer} />
            <CaseFact label="Customer ID" value={selectedWorklistItem?.customerId ?? "Unavailable"} />
            <CaseFact label="Scenario type" value={selectedWorklistItem?.scenarioType ?? "Unavailable"} />
            <CaseFact label="Lines" value={selectedWorklistItem?.lineCount.toString() ?? "Unavailable"} />
            <CaseFact label="Evidence" value={selectedWorklistItem?.evidenceLabel ?? "Unavailable"} />
          </div>
        </CardHeader>
      </Card>

      <Card className="rounded-lg shadow-none" size="sm">
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="grid min-w-0 gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Selected line</Badge>
                <span className="text-sm text-muted-foreground">{selectedLinePosition}</span>
              </div>
              <p className="text-sm font-medium">{canShowBackendDetail ? selected.lineId : selectedWorklistItem?.lineId ?? "Unavailable"}</p>
            </div>
            <div className="flex flex-wrap gap-1" aria-label="Opened work item line IDs">
              {selectedWorklistItem?.lineIds.map((lineId) => (
                <Badge key={`case-line-${lineId}`} variant={lineId === selected.lineId ? "secondary" : "outline"}>
                  {lineId}
                </Badge>
              )) ?? <Badge variant="outline">Unavailable</Badge>}
            </div>
          </div>
          {canShowBackendDetail ? null : <CaseContractGap />}
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="trace">Agent Trace</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-3" data-testid="maya-case-overview" value="overview">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
            <div className="flex min-w-0 flex-col gap-3">
              <Card className="rounded-lg shadow-none" size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheckIcon aria-hidden="true" data-icon="inline-start" />
                    Deterministic basis summary
                  </CardTitle>
                  <CardDescription>
                    {canShowBackendDetail ? "Backend selected detail packet" : "Backend row-switch gap"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4" data-testid="maya-case-deterministic-basis">
                  {canShowBackendDetail ? (
                    <>
                      <p className="text-sm text-muted-foreground">{selected.draft.basis}</p>
                      <div className="grid gap-3 md:grid-cols-2" data-testid="maya-case-primary-draft-facts">
                        <CaseFact label="Draft action" value={selected.draft.actionLabel} />
                        <CaseFact label="Status" value={selected.draft.statusLabel} />
                      </div>
                      <Separator />
                      <RecordIdStrip recordIds={selected.evidencePack.recordIds} />
                    </>
                  ) : (
                    <CaseContractGap />
                  )}
                </CardContent>
              </Card>
              <Card className="rounded-lg shadow-none" size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ClipboardListIcon aria-hidden="true" data-icon="inline-start" />
                    Case notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MayaEmptyState
                    description="No notes read/write contract is exposed for this case overview."
                    title="Notes unavailable"
                  />
                </CardContent>
              </Card>
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              <Alert>
                <FileTextIcon aria-hidden="true" data-icon="inline-start" />
                <AlertTitle>{canShowBackendDetail ? "Evidence dossier available" : "Evidence detail unavailable"}</AlertTitle>
                <AlertDescription>
                  {canShowBackendDetail
                    ? `${selected.evidencePack.documents.length.toString()} backend evidence documents and ${selected.evidencePack.recordIds.length.toString()} record IDs are attached to this opened line.`
                    : "This opened row is a fetched worklist row, but the backend has not exposed row-switched evidence detail."}
                </AlertDescription>
              </Alert>
              <Card className="rounded-lg shadow-none" size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileLockIcon aria-hidden="true" data-icon="inline-start" />
                    Draft and approval
                  </CardTitle>
                  <CardDescription>
                    {canShowBackendDetail ? selected.draft.statusLabel : "Unavailable until backend detail maps to this row"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Alert data-testid="maya-case-draft-readonly-status">
                    <LockIcon aria-hidden="true" data-icon="inline-start" />
                    <AlertTitle>Read-only draft status</AlertTitle>
                    <AlertDescription>
                      {canShowBackendDetail
                        ? "Backend draft status is displayed for this opened line. This overview exposes status and evidence context only."
                        : "Draft status is unavailable until backend detail maps to this row."}
                    </AlertDescription>
                  </Alert>
                  <Separator />
                  <div className="flex flex-wrap gap-2" aria-label="Draft read-only facts">
                    <Badge variant={canShowBackendDetail ? "secondary" : "outline"}>
                      {canShowBackendDetail ? selected.draft.statusLabel : "Unavailable"}
                    </Badge>
                    <Badge variant="outline">Read-only overview</Badge>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-lg shadow-none" size="sm">
                <CardHeader>
                  <CardTitle className="text-base">Case timeline</CardTitle>
                  <CardDescription>Read-only Maya journey rows</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {journey.length === 0 ? (
                    <MayaEmptyState description="The Maya journey read model returned no timeline rows." title="Timeline unavailable" />
                  ) : (
                    journey.map((item) => (
                      <div className="grid gap-1 border-l pl-3" key={`${item.timestamp}-${item.label}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium">{item.label}</span>
                          <Badge variant="outline">{item.status}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">{item.timestamp}</span>
                        <RecordIdStrip recordIds={item.recordIds} />
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        <TabsContent className="mt-3" value="evidence">
          {canShowBackendDetail ? (
            <EvidenceDossier
              deterministicBasis={selected.draft.basis}
              draftStatusLabel={selected.draft.statusLabel}
              evidencePack={selected.evidencePack}
              onQueryEvidence={() => {
                setQueryDockOpen(true);
              }}
              sourceTiles={sourceTiles}
            />
          ) : (
            <DetailGapCard title="Evidence unavailable" />
          )}
        </TabsContent>
        <TabsContent className="mt-3" value="trace">
          {canShowBackendDetail ? (
            <AgentTracePanel response={undefined} subAgents={multimodalDock.subAgents} />
          ) : (
            <DetailGapCard title="Agent trace unavailable" />
          )}
        </TabsContent>
        <TabsContent className="mt-3" value="draft">
          {canShowBackendDetail ? (
            <RecoveryDraftReview
              actionInbox={actionInbox}
              approvalActions={selected.approvalActions}
              draft={selected.draft}
              evidencePack={selected.evidencePack}
              selectedLineId={selected.lineId}
              selectedWorklistItem={selectedWorklistItem}
            />
          ) : (
            <DetailGapCard title="Draft unavailable" />
          )}
        </TabsContent>
        <TabsContent className="mt-3" value="audit">
          {canShowBackendDetail ? <AuditConfirmationPanel journey={journey} response={undefined} /> : <DetailGapCard title="Audit unavailable" />}
        </TabsContent>
      </Tabs>
      {canShowBackendDetail ? (
        <QueryEvidenceDock
          dock={multimodalDock}
          evidencePack={selected.evidencePack}
          onOpenChange={setQueryDockOpen}
          onResponse={() => undefined}
          open={queryDockOpen}
          recordIds={selected.evidencePack.recordIds}
          selectedLine={selected.lineId}
        />
      ) : null}
    </section>
  );
}

function CaseFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 rounded-md border bg-muted/20 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-medium" title={value}>
        {value}
      </span>
    </div>
  );
}

function RecordIdStrip({ recordIds }: { recordIds: string[] }) {
  if (recordIds.length === 0) {
    return (
      <Badge className="w-fit" variant="outline">
        No record IDs
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Backend record IDs">
      {recordIds.map((recordId) => (
        <Badge className="max-w-full truncate" key={recordId} title={recordId} variant="secondary">
          {recordId}
        </Badge>
      ))}
    </div>
  );
}

function CaseContractGap() {
  return (
    <Alert data-testid="maya-case-detail-contract-gap">
      <AlertCircleIcon aria-hidden="true" data-icon="inline-start" />
      <AlertTitle>Contract gap</AlertTitle>
      <AlertDescription>
        Detailed evidence is unavailable for this row until the backend exposes row switching.
      </AlertDescription>
    </Alert>
  );
}

function DetailGapCard({ title }: { title: string }) {
  return (
    <Card className="rounded-lg shadow-none" size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Backend row-switch gap</CardDescription>
      </CardHeader>
      <CardContent>
        <CaseContractGap />
      </CardContent>
      <CardFooter>
        <Badge variant="outline">Read model required</Badge>
      </CardFooter>
    </Card>
  );
}
