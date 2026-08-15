"use client";

import * as React from "react";
import {
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  FileTextIcon,
  ShieldCheckIcon
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { AgentTracePanel } from "./agent-trace-panel.tsx";
import { AgentInvestigationTimeline } from "./agent-investigation-timeline.tsx";
import { AuditConfirmationPanel } from "./audit-confirmation-panel.tsx";
import { DecisionFlowStepper } from "./decision-flow-stepper.tsx";
import { mayaAccent } from "./maya-accent.ts";
import {
  buildCaseScopedQueryRecordIds,
  buildCitedRecordChips,
  groupEvidenceFactCardsByLine,
  buildEvidencePacketAvailabilityLabel,
  buildVerdictLead,
  countEvidenceSourceLabels,
  deriveDecisionFlowSteps,
  findContrastCase,
  resolveMayaWorklistReasonDetail
} from "./maya-workspace-derived.ts";
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
  detail: MayaWorkItemDetail;
  hasBackendDetail: boolean;
  journey: MayaJourneyItem[];
  multimodalDock: MayaMultimodalDock;
  onApprovalResponse?: ((lineId: string, response: ApprovalGateResponse) => void) | undefined;
  onQueryDockOpenChange?: ((open: boolean) => void) | undefined;
  onQueryDockIntentConsumed?: (() => void) | undefined;
  onReturnToWorklist: () => void;
  onSelectLine: (lineId: string) => void;
  openQueryDockLineId?: string | undefined;
  recommendedAction: MayaWorkItemDetail["recommendedAction"];
  selected: MayaSelectedCase;
  selectedWorklistItem: MayaWorklistItem | undefined;
  sourceTiles: MayaSourceTile[];
  worklist: MayaWorklistItem[];
}

export function DeductionCaseWorkspace({
  actionInbox,
  approvalReceipt,
  auditState,
  detail,
  hasBackendDetail,
  multimodalDock,
  onApprovalResponse,
  onQueryDockOpenChange,
  onQueryDockIntentConsumed,
  onReturnToWorklist,
  onSelectLine,
  openQueryDockLineId,
  recommendedAction,
  selected,
  selectedWorklistItem,
  worklist
}: DeductionCaseWorkspaceProps) {
  const [queryDockOpen, setQueryDockOpen] = React.useState(false);
  const [queryResponse, setQueryResponse] = React.useState<QueryEvidenceResponse | undefined>();
  const [approvalResponse, setApprovalResponse] = React.useState<ApprovalGateResponse | undefined>();
  const canShowBackendDetail =
    hasBackendDetail && selectedWorklistItem !== undefined && selectedWorklistItem.lineIds.includes(selected.lineId);
  const selectedLineIndex = selectedWorklistItem?.lineIds.indexOf(selected.lineId) ?? -1;
  const selectedLinePosition =
    selectedWorklistItem !== undefined && selectedLineIndex >= 0
      ? `Line ${String(selectedLineIndex + 1)} of ${String(selectedWorklistItem.lineIds.length)}`
      : "Selected line unavailable";
  const selectedLineDisplayLabel = selectedLineIndex >= 0 ? `Line ${String(selectedLineIndex + 1)}` : "Opened line";
  const amount = selectedWorklistItem?.amount ?? selected.draft.amount;
  const title = selectedWorklistItem?.workItemLabel ?? selected.draft.actionLabel;
  const customer = selectedWorklistItem?.customerLabel ?? "Unavailable";
  const reasonWorkItem = canShowBackendDetail ? detail.workItem : selectedWorklistItem;
  const reasonDetail = resolveSelectedWorklistReasonDetail(reasonWorkItem);
  const reason = reasonDetail.text;
  const contrastCase = findContrastCase(worklist, selectedWorklistItem);
  const selectedActionContext = {
    actionLabel: recommendedAction.actionLabel,
    basis: recommendedAction.basis ?? selected.draft.basis,
    recordIds: selected.evidencePack.recordIds,
    statusLabel: auditState.statusLabel
  };
  const caseScopedQueryRecordIds = React.useMemo(
    () => buildCaseScopedQueryRecordIds(detail.workItem, { selectedEvidenceRecordIds: selected.evidencePack.recordIds }),
    [detail.workItem, selected.evidencePack.recordIds]
  );
  const selectedEvidenceIdentity = JSON.stringify({
    lineId: selected.lineId,
    recordIds: selected.evidencePack.recordIds
  });
  const committedApprovalResponse = approvalResponse ?? approvalReceipt;
  const decisionFlowSteps = deriveDecisionFlowSteps({
    ...(committedApprovalResponse === undefined ? {} : { approvalResponse: committedApprovalResponse }),
    detail,
    ...(selectedWorklistItem === undefined ? {} : { workItem: selectedWorklistItem })
  });
  const handleApprovalResponse = React.useCallback(
    (response: ApprovalGateResponse) => {
      setApprovalResponse(response);
      onApprovalResponse?.(selected.lineId, response);
    },
    [onApprovalResponse, selected.lineId]
  );
  React.useEffect(() => {
    setApprovalResponse(undefined);
    setQueryResponse(undefined);
  }, [selectedEvidenceIdentity]);

  React.useEffect(() => {
    if (openQueryDockLineId === undefined || openQueryDockLineId !== selected.lineId) {
      return;
    }

    setQueryDockOpen(true);
    onQueryDockOpenChange?.(true);
    onQueryDockIntentConsumed?.();
  }, [onQueryDockIntentConsumed, onQueryDockOpenChange, openQueryDockLineId, selected.lineId]);

  function handleQueryDockOpenChange(open: boolean): void {
    setQueryDockOpen(open);
    onQueryDockOpenChange?.(open);
    if (!open) {
      setQueryResponse((current) => (current?.status === "connecting" ? undefined : current));
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-3" data-testid="maya-case-workspace">
      <section data-testid="maya-case-detail-b1-stepper">
        <DecisionFlowStepper steps={decisionFlowSteps} />
      </section>
      <section className="grid min-w-0 gap-3" data-testid="maya-case-detail-b2-dossier-head">
        <Card
          className={cn("rounded-lg shadow-[var(--shadow-sm)]", mayaAccent.subtleCard)}
          data-testid="maya-case-overview"
          size="sm"
        >
          <CardHeader className="gap-4">
            <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="grid min-w-0 gap-2">
                <Button
                  className={cn("w-fit", mayaAccent.outlineButton)}
                  data-testid="maya-case-return-to-worklist"
                  onClick={onReturnToWorklist}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
                  Return to worklist
                </Button>
                <div className="grid min-w-0 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedWorklistItem === undefined ? null : (
                      <StaticStatusBadge
                        data-verdict={selectedWorklistItem.verdict}
                        variant={verdictBadgeVariant(selectedWorklistItem.verdict)}
                      >
                        {selectedWorklistItem.verdict === "valid" ? (
                          <CheckCircle2Icon aria-hidden="true" data-icon="inline-start" />
                        ) : null}
                        {selectedLineDisplayLabel}
                      </StaticStatusBadge>
                    )}
                    <CardTitle className="text-2xl leading-tight">{title}</CardTitle>
                  </div>
                  <CardDescription className="text-sm">{customer}</CardDescription>
                  <p className="max-w-3xl text-sm leading-6 text-foreground" data-testid="maya-case-dossier-reason">
                    {reason}
                  </p>
                </div>
              </div>
              <div
                aria-label="Deducted SAP amount"
                aria-readonly="true"
                className={cn("grid min-w-56 gap-1 rounded-lg border p-3 text-right", mayaAccent.proofPanel)}
                data-testid="maya-case-overview-readonly-amount"
              >
                <span className="text-xs text-muted-foreground">Deducted (SAP) - Case total</span>
                <strong className="text-2xl tabular-nums">{amount}</strong>
                <span className="text-xs text-muted-foreground">
                  This line {selected.draft.amount} · {selectedWorklistItem?.lineCount.toString() ?? "0"} posted lines
                </span>
              </div>
            </div>
            <Separator />
            <div className="flex flex-wrap gap-2" data-testid="maya-case-detail-backend-status">
              {selectedWorklistItem === undefined ? (
                <StaticStatusBadge>Source detail pending</StaticStatusBadge>
              ) : (
                <>
                  <StaticStatusBadge data-verdict={selectedWorklistItem.verdict} variant={verdictBadgeVariant(selectedWorklistItem.verdict)}>
                    {selectedWorklistItem.verdictLabel}
                  </StaticStatusBadge>
                  <StaticStatusBadge>{selectedWorklistItem.queueLabel}</StaticStatusBadge>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2" aria-label="Line selector" data-testid="maya-line-selector">
              <span className="text-xs text-muted-foreground">Lines</span>
              {selectedWorklistItem?.lineIds.map((lineId, index) => (
                <Button
                  aria-label={`Line ${String(index + 1)}`}
                  aria-pressed={lineId === selected.lineId}
                  data-testid="maya-case-line-chip"
                  key={`case-line-${lineId}`}
                  onClick={() => {
                    onSelectLine(lineId);
                  }}
                  size="sm"
                  type="button"
                  variant={lineId === selected.lineId ? "secondary" : "outline"}
                >
                  Line {String(index + 1)}
                </Button>
              )) ?? <StaticStatusBadge>Unavailable</StaticStatusBadge>}
              <span className="text-xs text-muted-foreground" data-testid="maya-selected-line-label">
                {selectedLinePosition}
              </span>
            </div>
            {contrastCase === undefined || selectedWorklistItem === undefined ? null : (
              <Alert
                className="border-[color:var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[color:var(--status-warning-text)]"
                data-testid="maya-case-contrast-callout"
              >
                <AlertTitle>
                  Same {contrastCase.familyLabel} family
                </AlertTitle>
                <AlertDescription>
                  <div className="grid gap-2 text-sm">
                    <p>
                      {selectedWorklistItem.verdictLabel} here; {contrastCase.verdictLabel} on {contrastCase.workItemLabel}.
                    </p>
                    <dl className="grid gap-1 text-xs sm:grid-cols-[auto_minmax(0,1fr)]">
                      <dt className="text-muted-foreground">This case</dt>
                      <dd>{contrastCase.selectedReason}</dd>
                      <dt className="text-muted-foreground">Other case</dt>
                      <dd>{contrastCase.contrastReason}</dd>
                    </dl>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            {canShowBackendDetail ? null : <CaseContractGap />}
          </CardHeader>
        </Card>
      </section>

      <section data-testid="maya-case-detail-b3-investigation">
        <AgentInvestigationTimeline
          evidencePack={selected.evidencePack}
          response={queryResponse}
          selectedWorklistItem={reasonWorkItem}
        />
      </section>

      <section className="grid gap-3" data-testid="maya-case-detail-b4-evidence">
        {canShowBackendDetail ? (
          <EvidenceFactCards evidencePack={selected.evidencePack} />
        ) : (
          <DetailGapCard title="Evidence unavailable" />
        )}
      </section>

      <section data-testid="maya-case-detail-b5-verdict">
        {canShowBackendDetail ? (
          <DeterministicBasisBand
            preferredRecordIds={[selected.lineId, ...selected.evidencePack.documents.map((document) => document.documentId)]}
            reason={reason}
            recordIds={selected.evidencePack.recordIds}
            evidenceDocuments={selected.evidencePack.documents}
            verdict={selectedWorklistItem.verdict}
            verdictLabel={selectedWorklistItem.verdictLabel}
            sourceLabel={reasonDetail.sourceLabel}
            workItem={detail.workItem}
          />
        ) : (
          <DetailGapCard title="Verdict unavailable" />
        )}
      </section>

      <section data-testid="maya-case-detail-b6-outcome">
        {canShowBackendDetail ? (
          <RecoveryDraftReview
            actionInbox={actionInbox}
            approvalActions={selected.approvalActions}
            creditRecommendations={detail.creditRecommendations}
            draft={selected.draft}
            evidencePack={selected.evidencePack}
            onApprovalResponse={handleApprovalResponse}
            approvalReceipt={approvalReceipt}
            selectedLineId={selected.lineId}
            selectedWorklistItem={detail.workItem}
          />
        ) : (
          <DetailGapCard title="Recommended Action unavailable" />
        )}
      </section>

      <section className="grid min-w-0 gap-2" data-testid="maya-case-detail-b7-depth-drawers">
        <CaseDepthDrawer label="Audit & provenance" testId="maya-case-depth-drawer-audit-provenance" value={auditState.statusLabel}>
          <div className="grid gap-4">
            <section className="grid gap-2" data-testid="maya-depth-agent-trace-section">
              <h3 className="text-sm font-semibold">Agent trace</h3>
              <AgentTracePanel
                evidencePack={selected.evidencePack}
                recordIds={selected.evidencePack.recordIds}
                response={queryResponse}
                selectedLine={selected.lineId}
              />
            </section>
            <section className="grid gap-2" data-testid="maya-depth-audit-section">
              <h3 className="text-sm font-semibold">Audit</h3>
              {canShowBackendDetail ? (
                <AuditConfirmationPanel
                  onReturnToWorklist={onReturnToWorklist}
                  response={approvalResponse ?? approvalReceipt}
                  selectedActionContext={selectedActionContext}
                />
              ) : (
                <CaseContractGap />
              )}
            </section>
            <section className="grid gap-2" data-testid="maya-depth-evidence-packet-section">
              <h3 className="text-sm font-semibold">Evidence packet</h3>
              <p className="text-sm font-medium" data-testid="maya-evidence-packet-availability">
                {buildEvidencePacketAvailabilityLabel(selected.evidencePack)}
              </p>
              <RecordIdStrip recordIds={selected.evidencePack.recordIds} />
            </section>
            <section className="grid gap-2" data-testid="maya-depth-line-source-section">
              <h3 className="text-sm font-semibold">Line source</h3>
              <p className="text-sm text-muted-foreground">{selectedLinePosition}</p>
              <RecordIdStrip recordIds={[selected.lineId]} />
            </section>
            <section className="grid gap-2" data-testid="maya-depth-draft-source-section">
              <h3 className="text-sm font-semibold">Draft source</h3>
              <p className="text-sm text-muted-foreground">
                {selected.evidencePack.recordIds.length.toString()} cited records
              </p>
              <RecordIdStrip recordIds={dedupeRecordIds([selected.lineId, ...selected.evidencePack.recordIds])} />
            </section>
          </div>
        </CaseDepthDrawer>
      </section>
      {canShowBackendDetail ? (
        <QueryEvidenceDock
          dock={multimodalDock}
          evidencePack={selected.evidencePack}
          onOpenChange={handleQueryDockOpenChange}
          onResponse={setQueryResponse}
          open={queryDockOpen}
          recordIds={caseScopedQueryRecordIds}
          selectedLine={selected.lineId}
          selectedWorklistItem={detail.workItem}
        />
      ) : null}
    </section>
  );
}

function CaseDepthDrawer({
  children,
  label,
  testId,
  value
}: {
  children: React.ReactNode;
  label: string;
  testId: string;
  value: string;
}) {
  return (
    <Collapsible className="grid min-w-0 gap-2 rounded-lg border bg-background px-3 py-2 shadow-none" data-testid={testId}>
      <CollapsibleTrigger asChild>
        <Button
          className="h-9 w-full justify-start gap-2 px-0 text-sm font-semibold shadow-none"
          data-testid="maya-case-depth-drawer-trigger"
          type="button"
          variant="ghost"
        >
          <ChevronDownIcon aria-hidden="true" data-icon="inline-start" />
          {label} · {value}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="hidden pb-2 data-[state=open]:block">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function dedupeRecordIds(recordIds: readonly string[]): string[] {
  return [...new Set(recordIds.map((recordId) => recordId.trim()).filter((recordId) => recordId.length > 0))];
}

function resolveSelectedWorklistReasonDetail(item: MayaWorklistItem | undefined): ReturnType<typeof resolveMayaWorklistReasonDetail> {
  return item === undefined
    ? {
        source: "deduction_reason",
        sourceLabel: "Deduction reason",
        text: "Case detail is unavailable until the governed detail packet is ready."
      }
    : resolveMayaWorklistReasonDetail(item);
}

function EvidenceFactCards({ evidencePack }: { evidencePack: MayaSelectedCase["evidencePack"] }) {
  const [open, setOpen] = React.useState(false);
  const sourceCount = countEvidenceSourceLabels(evidencePack.documents);
  const sourceLabels = [...new Set(evidencePack.documents.map((document) => document.sourceLabel.trim()).filter((label) => label.length > 0))];
  const visibleSourceLabels = sourceLabels.slice(0, 3);
  const hiddenSourceLabelCount = sourceLabels.length - visibleSourceLabels.length;
  const evidenceIdentity = evidencePack.documents.map((document) => document.documentId).join("|");

  React.useEffect(() => {
    setOpen(false);
  }, [evidenceIdentity]);

  if (evidencePack.documents.length === 0) {
    return <DetailGapCard title="Evidence unavailable" />;
  }

  return (
    <Collapsible
      className="grid min-w-0 gap-0 rounded-lg border bg-card shadow-[var(--shadow-sm)]"
      data-testid="maya-evidence-fact-cards"
      onOpenChange={setOpen}
      open={open}
    >
      <CollapsibleTrigger asChild>
        <Button
          className="h-auto w-full justify-between gap-3 px-4 py-3 text-left"
          data-testid="maya-evidence-fact-cards-trigger"
          type="button"
          variant="ghost"
        >
          <span className="inline-flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="font-semibold">Evidence retrieved</span>
            <Badge variant="outline">{evidencePack.documents.length.toString()} documents</Badge>
            {sourceCount > 0 ? <Badge variant="secondary">{sourceCount.toString()} sources</Badge> : null}
            {visibleSourceLabels.map((label) => (
              <Badge className="max-w-full truncate" key={label} title={label} variant="outline">
                {label}
              </Badge>
            ))}
            {hiddenSourceLabelCount > 0 ? <Badge variant="outline">{`+${hiddenSourceLabelCount.toString()}`}</Badge> : null}
          </span>
          <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t p-4">
      <div className="grid gap-3">
        {groupEvidenceFactCardsByLine(evidencePack.documents).map((group) => (
          <Collapsible
            className="rounded-lg border bg-background/60"
            data-line-id={group.lineId}
            data-testid="maya-evidence-line-group"
            defaultOpen
            key={group.label}
          >
            <CollapsibleTrigger asChild>
              <Button
                className="h-auto w-full justify-between gap-2 px-3 py-2 text-left"
                data-testid="maya-evidence-line-group-trigger"
                type="button"
                variant="ghost"
              >
                <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-semibold">{group.label}</span>
                  <Badge variant="outline">{group.countLabel}</Badge>
                </span>
                <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t p-3">
            <div className="grid gap-3 md:grid-cols-2">
        {group.cards.map((card) => {
          const hasDocumentContent = card.documentHref !== undefined;

          return (
            <Card
              className={cn("rounded-lg shadow-none", mayaAccent.subtleCard)}
              data-document-id={card.documentId}
              data-testid="maya-evidence-fact-card"
              key={card.documentId}
              size="sm"
            >
              <CardHeader className="gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-base" data-testid="maya-evidence-fact-card-title">
                    {card.title}
                  </CardTitle>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Badge variant="outline">{card.sourceLabel}</Badge>
                    {card.semanticRetrievalBadge === undefined ? null : (
                      <Badge className={mayaAccent.pill} data-testid="maya-evidence-semantic-badge" variant="secondary">
                        {card.semanticRetrievalBadge}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm" data-testid="maya-evidence-fact-card-body">
                {card.rows.map((row) => (
                  <EvidenceFact key={`${card.documentId}-${row.label}`} label={row.label} value={row.value} />
                ))}
              </CardContent>
              <CardFooter className="grid gap-2">
                {hasDocumentContent ? (
                  <Button asChild className="w-fit" data-testid="maya-evidence-open-link" size="sm" variant="outline">
                    <a href={card.documentHref} rel="noreferrer" target="_blank">
                      <ExternalLinkIcon aria-hidden="true" data-icon="inline-start" />
                      Open evidence
                    </a>
                  </Button>
                ) : null}
                {hasDocumentContent ? (
                  <Collapsible className="rounded-md border bg-background/80" data-testid="maya-evidence-document-viewer">
                  <CollapsibleTrigger asChild>
                    <Button
                      className="h-auto w-full justify-between gap-2 px-3 py-2 text-left"
                      data-testid="maya-evidence-document-view-trigger"
                      type="button"
                      variant="ghost"
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <FileTextIcon aria-hidden="true" className="size-4 shrink-0" />
                        <span className="truncate">Preview evidence</span>
                      </span>
                      <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t p-2">
                    <div className="grid gap-2">
                      {card.documentSummary === undefined ? null : (
                        <p className="text-sm text-muted-foreground" data-testid="maya-evidence-document-summary">
                          {card.documentSummary}
                        </p>
                      )}
                      {card.documentHref === undefined ? null : (
                        <>
                        <iframe
                          className="h-56 w-full rounded-md border bg-background"
                          data-testid="maya-evidence-document-frame"
                          src={card.documentHref}
                          title={`Document preview for ${card.documentId}`}
                        />
                        <Button asChild className="w-fit" size="sm" variant="outline">
                          <a href={card.documentHref} rel="noreferrer" target="_blank">
                            <ExternalLinkIcon aria-hidden="true" data-icon="inline-start" />
                            Open evidence
                          </a>
                        </Button>
                        </>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
                ) : null}
                <Collapsible className="rounded-md border bg-muted/30" data-testid="maya-evidence-provenance-disclosure">
                  <CollapsibleTrigger asChild>
                    <Button
                      className="h-auto w-full justify-between gap-2 px-3 py-2 text-left"
                      data-testid="maya-evidence-provenance-trigger"
                      type="button"
                      variant="ghost"
                    >
                      <span>More details · {card.provenanceRows.length.toString()} fields</span>
                      <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="grid gap-1 border-t p-2 text-sm">
                    {card.provenanceRows.map((row) => (
                      <EvidenceFact
                        key={`${card.documentId}-provenance-${row.label}`}
                        label={row.label}
                        testId="maya-evidence-provenance-row"
                        value={row.value}
                      />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              </CardFooter>
            </Card>
          );
        })}
            </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function EvidenceFact({
  label,
  testId = "maya-evidence-fact-row",
  value
}: {
  label: string;
  testId?: string;
  value: string;
}) {
  const content = (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium" title={value}>
        {value}
      </span>
    </>
  );

  if (testId === "maya-evidence-fact-row") {
    return (
      <div
        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3"
        data-label={label}
        data-testid="maya-evidence-fact-row"
        data-value={value}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3"
      data-label={label}
      data-testid={testId}
      data-value={value}
    >
      {content}
    </div>
  );
}

function DeterministicBasisBand({
  evidenceDocuments,
  preferredRecordIds,
  reason,
  recordIds,
  sourceLabel,
  verdict,
  verdictLabel,
  workItem
}: {
  evidenceDocuments: MayaSelectedCase["evidencePack"]["documents"];
  preferredRecordIds: string[];
  reason: string;
  recordIds: string[];
  sourceLabel: string;
  verdict: string | undefined;
  verdictLabel: string;
  workItem: MayaWorklistItem;
}) {
  const citedChips = buildCitedRecordChips(recordIds, preferredRecordIds, evidenceDocuments);
  const visibleCitedChips = citedChips.slice(0, 3);
  return (
    <Alert className={`border ${deterministicBasisBandClass(verdict)}`} data-testid="maya-deterministic-basis-band">
      <ShieldCheckIcon aria-hidden="true" data-icon="inline-start" />
      <AlertTitle className="flex flex-wrap items-center gap-2">
        <Badge data-verdict={verdict} variant={verdictBadgeVariant(verdict)}>
          {verdictLabel}
        </Badge>
        <span>Deterministic basis</span>
      </AlertTitle>
      <AlertDescription>
        <div className="grid gap-3" data-testid="maya-case-deterministic-basis">
          <p className="text-sm font-medium text-foreground" data-testid="maya-verdict-lead">
            {buildVerdictLead(workItem)}
          </p>
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Why the agents decided this</span>
              <Badge className="w-fit" data-testid="maya-case-reason-source" variant="outline">
                {sourceLabel}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground" data-testid="maya-case-deterministic-basis-body">
              {reason}
            </p>
          </div>
          {citedChips.length === 0 ? (
            <Badge className="w-fit" variant="outline">Cited records unavailable</Badge>
          ) : (
            <div className="grid gap-2" data-testid="maya-deterministic-basis-document-details">
              <div className="flex flex-wrap gap-1.5">
              {visibleCitedChips.map((chip) => (
                <Badge
                  className={cn("max-w-full truncate", mayaAccent.pill)}
                  data-testid="maya-verdict-cited-record"
                  key={chip.recordId}
                  variant="secondary"
                >
                  {chip.label}
                </Badge>
              ))}
              {citedChips.length > visibleCitedChips.length ? (
                <Badge className={cn("max-w-full truncate", mayaAccent.pill)} variant="secondary">
                  +{(citedChips.length - visibleCitedChips.length).toString()} more
                </Badge>
              ) : null}
              </div>
              <Collapsible className="rounded-md border bg-background/70" data-testid="maya-verdict-cited-record-disclosure">
                <CollapsibleTrigger asChild>
                  <Button className="h-auto w-fit gap-2 px-2 py-1 text-xs" type="button" variant="ghost">
                    All {citedChips.length.toString()} cited records
                    <ChevronDownIcon aria-hidden="true" className="size-3" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t p-2">
                  <RecordIdStrip recordIds={recordIds} />
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

function deterministicBasisBandClass(verdict: string | undefined): string {
  const variant = verdictBadgeVariant(verdict);
  if (variant === "valid") {
    return "border-success-border bg-success-surface/40 text-success";
  }
  if (variant === "invalid" || variant === "dispute") {
    return "border-[color:var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[color:var(--status-danger-text)]";
  }
  if (variant === "review") {
    return "border-[color:var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[color:var(--status-warning-text)]";
  }

  return "bg-muted/30";
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
      ? mayaAccent.pill
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
        <Badge className={cn("max-w-full truncate", mayaAccent.pill)} key={recordId} title={recordId} variant="secondary">
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
      <AlertTitle>Source detail pending</AlertTitle>
      <AlertDescription>
        Detailed evidence is unavailable until a governed detail packet is requested for this row.
      </AlertDescription>
    </Alert>
  );
}

function DetailGapCard({ title }: { title: string }) {
  return (
    <Card className={cn("rounded-lg shadow-none", mayaAccent.subtleCard)} size="sm">
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
