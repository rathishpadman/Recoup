"use client";

import * as React from "react";
import {
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  FileLockIcon,
  FileTextIcon,
  LockIcon,
  ShieldCheckIcon
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AgentTracePanel } from "./agent-trace-panel.tsx";
import { AuditConfirmationPanel } from "./audit-confirmation-panel.tsx";
import { EvidenceDossier } from "./evidence-dossier.tsx";
import { MayaEmptyState } from "./maya-empty-state.tsx";
import { QueryEvidenceDock } from "./query-evidence-dock.tsx";
import { RecoveryDraftReview } from "./recovery-draft-review.tsx";
import { verdictBadgeVariant, type VerdictBadgeVariant } from "./verdict-badge-variant.ts";
import type {
  ApprovalGateResponse,
  MayaActionInboxItem,
  MayaJourneyItem,
  MayaMultimodalDock,
  QueryEvidenceResponse,
  MayaSelectedCase,
  MayaSourceTile,
  MayaWorkItemDetail,
  MayaWorklistItem
} from "./types.ts";

interface DeductionCaseWorkspaceProps {
  actionInbox: MayaActionInboxItem[];
  approvalReceipt?: MayaWorkItemDetail["approvalReceipt"];
  auditState: MayaWorkItemDetail["auditState"];
  hasBackendDetail: boolean;
  journey: MayaJourneyItem[];
  multimodalDock: MayaMultimodalDock;
  onQueryDockIntentConsumed?: (() => void) | undefined;
  onReturnToWorklist: () => void;
  openQueryDockLineId?: string | undefined;
  recommendedAction: MayaWorkItemDetail["recommendedAction"];
  selected: MayaSelectedCase;
  selectedWorklistItem: MayaWorklistItem | undefined;
  sourceTiles: MayaSourceTile[];
}

export function DeductionCaseWorkspace({
  actionInbox,
  approvalReceipt,
  auditState,
  hasBackendDetail,
  journey,
  multimodalDock,
  onQueryDockIntentConsumed,
  onReturnToWorklist,
  openQueryDockLineId,
  recommendedAction,
  selected,
  selectedWorklistItem,
  sourceTiles
}: DeductionCaseWorkspaceProps) {
  const [queryDockOpen, setQueryDockOpen] = React.useState(false);
  const [queryResponse, setQueryResponse] = React.useState<QueryEvidenceResponse | undefined>();
  const [approvalResponse, setApprovalResponse] = React.useState<ApprovalGateResponse | undefined>();
  const [displayLineId, setDisplayLineId] = React.useState(selected.lineId);
  const canShowBackendDetail =
    hasBackendDetail && selectedWorklistItem !== undefined && selectedWorklistItem.lineIds.includes(selected.lineId);
  const selectedLineIndex = selectedWorklistItem?.lineIds.indexOf(displayLineId) ?? -1;
  const selectedLinePosition =
    selectedWorklistItem !== undefined && selectedLineIndex >= 0
      ? `Line ${String(selectedLineIndex + 1)} of ${String(selectedWorklistItem.lineIds.length)}`
      : "Selected line unavailable";
  const amount = selectedWorklistItem?.amount ?? selected.draft.amount;
  const title = selectedWorklistItem?.scenarioLabel ?? selected.draft.actionLabel;
  const customer = selectedWorklistItem?.customerLabel ?? "Unavailable";
  const selectedActionContext = {
    actionLabel: recommendedAction.actionLabel,
    basis: recommendedAction.basis ?? selected.draft.basis,
    recordIds: selected.evidencePack.recordIds,
    statusLabel: auditState.statusLabel
  };
  const selectedEvidenceIdentity = JSON.stringify({
    lineId: selected.lineId,
    recordIds: selected.evidencePack.recordIds
  });

  React.useEffect(() => {
    setApprovalResponse(undefined);
    setQueryResponse(undefined);
  }, [selectedEvidenceIdentity]);

  React.useEffect(() => {
    setDisplayLineId(selected.lineId);
  }, [selected.lineId, selectedWorklistItem?.lineId]);

  React.useEffect(() => {
    if (openQueryDockLineId === undefined || openQueryDockLineId !== selected.lineId) {
      return;
    }

    setQueryDockOpen(true);
    onQueryDockIntentConsumed?.();
  }, [onQueryDockIntentConsumed, openQueryDockLineId, selected.lineId]);

  function handleQueryDockOpenChange(open: boolean): void {
    setQueryDockOpen(open);
    if (!open) {
      setQueryResponse((current) => (current?.status === "connecting" ? undefined : current));
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-3" data-testid="maya-case-workspace">
      <Card className="rounded-lg shadow-[var(--shadow-sm)]" size="sm">
        <CardHeader className="gap-4">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="grid min-w-0 gap-2">
              <Button
                className="w-fit"
                data-testid="maya-case-return-to-worklist"
                onClick={onReturnToWorklist}
                size="sm"
                type="button"
                variant="outline"
              >
                <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
                Return to worklist
              </Button>
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>Worklist</span>
                <span aria-hidden="true">/</span>
                <span className="truncate">Selected case</span>
              </div>
              <div className="grid min-w-0 gap-1">
                <CardTitle className="text-2xl leading-tight">{title}</CardTitle>
                <CardDescription className="text-sm">{customer}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2" data-testid="maya-case-detail-backend-status">
                {selectedWorklistItem === undefined ? (
                  <StaticStatusBadge>Source detail pending</StaticStatusBadge>
                ) : (
                  <>
                    <StaticStatusBadge
                      data-verdict={selectedWorklistItem.verdict}
                      variant={verdictBadgeVariant(selectedWorklistItem.verdict)}
                    >
                      {selectedWorklistItem.verdict === "valid" ? (
                        <CheckCircle2Icon aria-hidden="true" data-icon="inline-start" />
                      ) : null}
                      {selectedWorklistItem.verdictLabel}
                    </StaticStatusBadge>
                    <StaticStatusBadge>{selectedWorklistItem.queueLabel}</StaticStatusBadge>
                  </>
                )}
              </div>
            </div>
            <div
              aria-label="Read-only amount"
              aria-readonly="true"
              className="grid min-w-56 gap-1 rounded-lg border bg-muted/30 p-3 text-right"
              data-testid="maya-case-overview-readonly-amount"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button aria-label="Amount source details" className="ml-auto" size="icon-sm" type="button" variant="outline">
                    <LockIcon aria-hidden="true" data-icon="inline-start" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <span>Amount is displayed from the source read model and cannot be edited here.</span>
                </TooltipContent>
              </Tooltip>
              <strong className="text-2xl tabular-nums">{amount}</strong>
              <span className="text-xs text-muted-foreground">Source read-only</span>
            </div>
          </div>
          <Separator />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <CaseFact label="Customer" value={customer} />
            <CaseFact label="Customer ID" value={selectedWorklistItem?.customerId ?? "Unavailable"} />
            <CaseFact label="Scenario type" value={selectedWorklistItem?.scenarioType ?? "Unavailable"} />
            <CaseFact label="Lines" value={selectedWorklistItem?.lineCount.toString() ?? "Unavailable"} />
            <CaseFact label="Evidence" value={selectedWorklistItem?.evidenceLabel ?? "Unavailable"} />
            <CaseFact label="Confidence" value={selectedWorklistItem?.confidenceLabel ?? "Unavailable"} />
          </div>
        </CardHeader>
      </Card>

      <Card className="rounded-lg shadow-none" size="sm">
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="grid min-w-0 gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <StaticStatusBadge>Selected line</StaticStatusBadge>
                <span className="text-sm text-muted-foreground" data-testid="maya-selected-line-label">
                  {selectedLinePosition}
                </span>
              </div>
              <p className="text-sm font-medium">Line source metadata available</p>
              {displayLineId === selected.lineId ? null : (
                <p className="text-xs text-muted-foreground">
                  Detail remains grounded to the opened line until source detail is available for this line.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-1" aria-label="Line selector" data-testid="maya-line-selector">
              {selectedWorklistItem?.lineIds.map((lineId, index) => (
                <Button
                  aria-label={`Line ${String(index + 1)}`}
                  aria-pressed={lineId === displayLineId}
                  key={`case-line-${lineId}`}
                  onClick={() => {
                    setDisplayLineId(lineId);
                  }}
                  type="button"
                  variant={lineId === displayLineId ? "secondary" : "outline"}
                >
                  Line {String(index + 1)}
                </Button>
              )) ?? <StaticStatusBadge>Unavailable</StaticStatusBadge>}
            </div>
          </div>
          <SourceRecordDetails
            recordIds={[displayLineId]}
            testId="maya-case-line-source-details"
            title="Line source details"
          />
          {canShowBackendDetail ? null : <CaseContractGap />}
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger data-testid="maya-case-agent-trace-tab" value="trace">
            Agent Trace
          </TabsTrigger>
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
                    {canShowBackendDetail ? "Selected detail packet" : "Source detail pending"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4" data-testid="maya-case-deterministic-basis">
                  {canShowBackendDetail ? (
                    <>
                      <p className="text-sm text-muted-foreground">{selected.draft.basis}</p>
                      <div className="grid gap-3 md:grid-cols-2" data-testid="maya-case-primary-draft-facts">
                        <CaseFact label="Draft action" value={selected.draft.actionLabel} />
                        <CaseFact label="Status" value={selected.draft.statusLabel} />
                        <CaseFact label="Audit state" value={auditState.statusLabel} />
                      </div>
                      <Separator />
                      <SourceRecordDetails
                        recordIds={selected.evidencePack.recordIds}
                        testId="maya-case-basis-source-details"
                        title="Basis source details"
                      />
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
                    ? `${selected.evidencePack.documents.length.toString()} evidence documents and ${selected.evidencePack.recordIds.length.toString()} record IDs are attached to this opened line.`
                    : "This work item is selected, but evidence detail is not available for this line."}
                </AlertDescription>
              </Alert>
              <Card className="rounded-lg shadow-none" size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileLockIcon aria-hidden="true" data-icon="inline-start" />
                    Draft and approval
                  </CardTitle>
                  <CardDescription>
                    {canShowBackendDetail ? auditState.statusLabel : "Unavailable until detail maps to this row"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Alert data-testid="maya-case-draft-readonly-status">
                    <LockIcon aria-hidden="true" data-icon="inline-start" />
                    <AlertTitle>Read-only draft status</AlertTitle>
                    <AlertDescription>
                      {canShowBackendDetail
                        ? "Draft status is displayed for this opened line. This overview exposes status and evidence context only."
                        : "Draft status is unavailable until detail maps to this row."}
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
                    <MayaEmptyState description="The Maya journey has no timeline rows." title="Timeline unavailable" />
                  ) : (
                    journey.map((item) => (
                      <div className="grid gap-1 border-l pl-3" key={`${item.timestamp}-${item.label}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium">{item.label}</span>
                          <Badge variant="outline">{item.status}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">{item.timestamp}</span>
                        <SourceRecordDetails
                          recordIds={item.recordIds}
                          testId="maya-case-timeline-source-details"
                          title="Timeline source details"
                        />
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
          <AgentTracePanel
            evidencePack={selected.evidencePack}
            recordIds={selected.evidencePack.recordIds}
            response={queryResponse}
            selectedLine={selected.lineId}
          />
        </TabsContent>
        <TabsContent className="mt-3" value="draft">
          {canShowBackendDetail ? (
            <RecoveryDraftReview
              actionInbox={actionInbox}
              approvalActions={selected.approvalActions}
              draft={selected.draft}
              evidencePack={selected.evidencePack}
              onApprovalResponse={setApprovalResponse}
              selectedLineId={selected.lineId}
              selectedWorklistItem={selectedWorklistItem}
            />
          ) : (
            <DetailGapCard title="Draft unavailable" />
          )}
        </TabsContent>
        <TabsContent className="mt-3" value="audit">
          {canShowBackendDetail ? (
            <AuditConfirmationPanel
              onReturnToWorklist={onReturnToWorklist}
              response={approvalResponse ?? approvalReceipt}
              selectedActionContext={selectedActionContext}
            />
          ) : (
            <DetailGapCard title="Audit unavailable" />
          )}
        </TabsContent>
      </Tabs>
      {canShowBackendDetail ? (
        <QueryEvidenceDock
          dock={multimodalDock}
          evidencePack={selected.evidencePack}
          onOpenChange={handleQueryDockOpenChange}
          onResponse={setQueryResponse}
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

const staticStatusBadgeClassByVariant: Record<VerdictBadgeVariant, string> = {
  dispute: "border-[color:var(--status-dispute-border)] bg-[var(--status-dispute-bg)] text-[color:var(--status-dispute-text)]",
  info: "border-[color:var(--status-info-border)] bg-[var(--status-info-bg)] text-[color:var(--status-info-text)]",
  invalid: "border-[color:var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[color:var(--status-danger-text)]",
  neutralStatus:
    "border-[color:var(--status-neutral-border)] bg-[var(--status-neutral-bg)] text-[color:var(--status-neutral-text)]",
  review: "border-[color:var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[color:var(--status-warning-text)]",
  valid: "border-success-border bg-success-surface text-success"
};

function StaticStatusBadge({
  className = "",
  variant,
  ...props
}: React.ComponentProps<"span"> & { variant?: VerdictBadgeVariant }) {
  const variantClassName =
    variant === undefined
      ? "border-border bg-background text-muted-foreground"
      : staticStatusBadgeClassByVariant[variant];

  return (
    <span
      className={`inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium leading-none ${variantClassName} ${className}`}
      data-testid="maya-static-status-badge"
      {...props}
    />
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

function SourceRecordDetails({
  recordIds,
  testId,
  title
}: {
  recordIds: string[];
  testId: string;
  title: string;
}) {
  return (
    <Collapsible className="grid min-w-0 gap-2" data-testid={testId}>
      <CollapsibleTrigger asChild>
        <Button className="w-fit justify-start" size="sm" type="button" variant="outline">
          <ChevronDownIcon aria-hidden="true" data-icon="inline-start" />
          {title}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <RecordIdStrip recordIds={recordIds} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function CaseContractGap() {
  return (
    <Alert data-testid="maya-case-detail-contract-gap">
      <AlertCircleIcon aria-hidden="true" data-icon="inline-start" />
      <AlertTitle>Source detail pending</AlertTitle>
      <AlertDescription>
        Detailed evidence is unavailable until a governed detail packet is requested for this row.
      </AlertDescription>
    </Alert>
  );
}

function DetailGapCard({ title }: { title: string }) {
  return (
    <Card className="rounded-lg shadow-none" size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Source detail pending</CardDescription>
      </CardHeader>
      <CardContent>
        <CaseContractGap />
      </CardContent>
      <CardFooter>
        <Badge variant="outline">Detail required</Badge>
      </CardFooter>
    </Card>
  );
}
