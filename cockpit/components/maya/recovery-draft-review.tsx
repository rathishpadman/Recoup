"use client";

import * as React from "react";
import {
  FileTextIcon,
  MessageSquareTextIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
  XIcon
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApprovalGateDialog } from "./approval-gate-dialog.tsx";
import { MayaEmptyState } from "./maya-empty-state.tsx";
import type {
  ApprovalGateResponse,
  MayaActionInboxItem,
  MayaApprovalAction,
  MayaEvidencePack,
  MayaSelectedCase,
  MayaWorklistItem
} from "./types.ts";

interface RecoveryDraftReviewProps {
  actionInbox: MayaActionInboxItem[];
  approvalActions: MayaApprovalAction[];
  draft: MayaSelectedCase["draft"];
  evidencePack: MayaEvidencePack;
  onApprovalResponse: (response: ApprovalGateResponse) => void;
  selectedLineId: string;
  selectedWorklistItem: MayaWorklistItem | undefined;
}

type DraftCommandIntent = "open-approval" | "reject" | "request-changes";

const backendGapLabels = [
  "Packet display ID not exposed",
  "Case account and currency not exposed",
  "Approval owner and timestamps not exposed",
  "Audit hash waits for human decision"
] as const;

export function RecoveryDraftReview({
  actionInbox,
  approvalActions,
  draft,
  evidencePack,
  onApprovalResponse,
  selectedLineId,
  selectedWorklistItem
}: RecoveryDraftReviewProps) {
  const [commandIntent, setCommandIntent] = React.useState<DraftCommandIntent | undefined>();
  const [approvalDialogOpen, setApprovalDialogOpen] = React.useState(false);
  const modifyAction = approvalActions.find((action) => action.decision === "modify");
  const rejectAction = approvalActions.find((action) => action.decision === "reject");
  const canOpenApproval = approvalActions.length > 0;

  return (
    <section className="flex min-w-0 flex-col gap-3" data-testid="maya-recovery-draft-review">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-2xl leading-tight">Recovery Draft Review</CardTitle>
            <Badge variant="secondary">Human approval required</Badge>
          </div>
          <CardDescription>
            Review the backend-staged recovery draft. No external action before human approval.
          </CardDescription>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-3">
          <HeaderFact label="Selected line" value={selectedLineId} />
          <HeaderFact label="Draft status" value={draft.statusLabel} />
          <HeaderFact label="Work item" value={selectedWorklistItem?.scenarioLabel ?? "Contract gap"} />
        </div>
      </div>

      <Alert data-testid="maya-draft-hitl-warning">
        <TriangleAlertIcon aria-hidden="true" data-icon="inline-start" />
        <AlertTitle>Human approval required before any external action</AlertTitle>
        <AlertDescription>
          This is a draft packet. The screen only prepares a human review posture; it does not record a decision,
          mutate systems, or contact anyone.
        </AlertDescription>
      </Alert>

      <div className="grid min-w-0 items-start gap-3 pb-24 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="rounded-lg shadow-none" data-testid="maya-draft-packet-panel" size="sm">
          <CardHeader className="gap-3">
            <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="grid min-w-0 gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{draft.actionLabel}</CardTitle>
                  <Badge variant="outline">Draft only</Badge>
                  <Badge variant="secondary">{draft.statusLabel}</Badge>
                </div>
                <CardDescription>Backend draft label and status from the selected detail packet</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2" aria-label="Draft basis record IDs">
                <RecordIdStrip recordIds={evidencePack.recordIds} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-4">
            <Tabs defaultValue="summary">
              <TabsList>
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="evidence">Evidence</TabsTrigger>
                <TabsTrigger value="message">Message</TabsTrigger>
                <TabsTrigger value="audit-basis">Audit basis</TabsTrigger>
              </TabsList>
              <TabsContent className="mt-4" value="summary">
                <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(280px,0.82fr)_minmax(220px,0.5fr)]">
                  <div className="grid min-w-0 gap-3">
                    <SectionKicker>Draft packet</SectionKicker>
                    <FactBlock label="Draft label" value={draft.actionLabel} />
                    <FactBlock label="Selected line" value={selectedLineId} />
                    <FactBlock label="Recipient" value="Contract gap" />
                  </div>
                  <div
                    aria-label="Backend amount, read-only"
                    aria-readonly="true"
                    className="grid min-w-0 gap-2 rounded-lg border bg-muted/30 p-4"
                    data-testid="maya-draft-readonly-amount"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <ShieldCheckIcon aria-hidden="true" data-icon="inline-start" />
                      <span className="text-sm font-medium">Backend amount, read-only</span>
                    </div>
                    <strong className="text-3xl leading-tight tabular-nums">{draft.amount}</strong>
                    <p className="text-sm text-muted-foreground">
                      Displayed exactly from the selected draft read model. Calculation-detail fields are not exposed.
                    </p>
                  </div>
                  <div className="grid min-w-0 gap-3 rounded-lg border bg-muted/20 p-3">
                    <SectionKicker>Draft status</SectionKicker>
                    <Badge className="w-fit" variant="secondary">
                      {draft.statusLabel}
                    </Badge>
                    <span className="text-sm text-muted-foreground">Human approval remains required.</span>
                    <span className="text-sm text-muted-foreground">Audit hash pending until human decision.</span>
                  </div>
                </div>
                <Separator className="my-4" />
                <Alert>
                  <FileTextIcon aria-hidden="true" data-icon="inline-start" />
                  <AlertTitle>Deterministic draft basis</AlertTitle>
                  <AlertDescription>{draft.basis}</AlertDescription>
                </Alert>
                <Separator className="my-4" />
                <EvidenceTable evidencePack={evidencePack} />
              </TabsContent>
              <TabsContent className="mt-4" value="evidence">
                <EvidenceTable evidencePack={evidencePack} />
              </TabsContent>
              <TabsContent className="mt-4" value="message">
                <MayaEmptyState
                  description="The current draft read model does not expose a recovery message body."
                  title="Draft message unavailable"
                />
              </TabsContent>
              <TabsContent className="mt-4" value="audit-basis">
                <div className="flex min-w-0 flex-col gap-4">
                  <Alert>
                    <FileTextIcon aria-hidden="true" data-icon="inline-start" />
                    <AlertTitle>Deterministic draft basis</AlertTitle>
                    <AlertDescription>{draft.basis}</AlertDescription>
                  </Alert>
                  <RecordIdStrip recordIds={evidencePack.recordIds} />
                  {actionInbox.length === 0 ? (
                    <MayaEmptyState description="The action inbox read model returned no draft rows." title="Action inbox unavailable" />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Draft label</TableHead>
                          <TableHead>Line</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {actionInbox.map((item) => (
                          <TableRow key={item.actionId}>
                            <TableCell className="min-w-48 whitespace-normal">
                              <div className="flex flex-col gap-1">
                                <span className="font-medium">{item.actionLabel}</span>
                                <span className="text-sm text-muted-foreground">{item.basis}</span>
                              </div>
                            </TableCell>
                            <TableCell>{item.lineId}</TableCell>
                            <TableCell>{item.amount}</TableCell>
                            <TableCell>{item.statusLabel}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card className="rounded-lg shadow-none" data-testid="maya-draft-context-rail" size="sm">
          <CardHeader>
            <CardTitle>Case context</CardTitle>
            <CardDescription>Read-model facts for the opened work item</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {selectedWorklistItem === undefined ? (
              <Alert>
                <TriangleAlertIcon aria-hidden="true" data-icon="inline-start" />
                <AlertTitle>Contract gap</AlertTitle>
                <AlertDescription>The selected worklist row is unavailable for this draft review.</AlertDescription>
              </Alert>
            ) : (
              <div className="grid min-w-0 gap-2">
                <ContextFact label="Customer" value={selectedWorklistItem.customerLabel} />
                <ContextFact label="Scenario" value={selectedWorklistItem.scenarioLabel} />
                <ContextFact label="Selected line" value={selectedLineId} />
                <ContextFact label="Worklist amount" value={selectedWorklistItem.amount} />
                <ContextFact label="Queue" value={selectedWorklistItem.queueLabel} />
                <ContextFact label="Routing" value={selectedWorklistItem.routingLabel} />
                <ContextFact label="Verdict" value={selectedWorklistItem.verdictLabel} />
                <ContextFact label="Evidence" value={selectedWorklistItem.evidenceLabel} />
              </div>
            )}
            <Separator />
            <div className="grid min-w-0 gap-2" data-testid="maya-draft-rail-gate">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionKicker>Draft gate</SectionKicker>
                <Badge variant="secondary">{draft.statusLabel}</Badge>
              </div>
              <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <ContextFact label="Draft label" value={draft.actionLabel} />
                <ContextFact label="Draft amount" value={draft.amount} />
              </div>
              <Alert className="py-2">
                <TriangleAlertIcon aria-hidden="true" data-icon="inline-start" />
                <AlertTitle>Human approval required</AlertTitle>
                <AlertDescription>Local review only; external action remains blocked.</AlertDescription>
              </Alert>
            </div>
            <Separator />
            <div className="grid min-w-0 gap-2" data-testid="maya-draft-rail-record-ids">
              <SectionKicker>Evidence records</SectionKicker>
              <RecordIdStrip recordIds={evidencePack.recordIds} />
            </div>
            <Separator />
            <div className="grid min-w-0 gap-2" data-testid="maya-draft-rail-human-decisions">
              <SectionKicker>Human decisions</SectionKicker>
              {approvalActions.length === 0 ? (
                <Badge className="w-fit" variant="outline">
                  No decisions exposed
                </Badge>
              ) : (
                <div className="grid min-w-0 gap-2">
                  {approvalActions.map((action) => (
                    <div
                      className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-2 py-1.5"
                      key={action.decision}
                    >
                      <span className="text-sm font-medium">{humanDecisionLabel(action.decision)}</span>
                      <Badge variant={action.requiresReason ? "secondary" : "outline"}>
                        {action.requiresReason ? "Reason required" : "Reason optional"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Separator />
            <div className="grid min-w-0 gap-2" data-testid="maya-draft-rail-backend-gaps">
              <SectionKicker>Backend gaps</SectionKicker>
              <ul className="grid min-w-0 gap-1 text-xs text-muted-foreground">
                {backendGapLabels.map((gapLabel) => (
                  <li className="flex gap-2" key={gapLabel}>
                    <span aria-hidden="true">-</span>
                    <span>{gapLabel}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card
        className="sticky bottom-0 rounded-lg shadow-none"
        data-testid="maya-draft-command-bar"
        size="sm"
      >
        <CardContent className="flex min-w-0 flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <TriangleAlertIcon aria-hidden="true" data-icon="inline-start" />
              <span className="font-medium">No external action before human approval</span>
            </div>
            <span className="text-sm text-muted-foreground">Command buttons prepare the next human step locally only.</span>
            <span className="text-sm text-muted-foreground" data-testid="maya-draft-command-intent">
              {commandIntent === undefined ? "No draft command prepared" : commandIntentLabel(commandIntent)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={modifyAction === undefined}
              onClick={() => {
                setCommandIntent("request-changes");
              }}
              type="button"
              variant="outline"
            >
              <MessageSquareTextIcon data-icon="inline-start" />
              Request changes
            </Button>
            <Button
              disabled={rejectAction === undefined}
              onClick={() => {
                setCommandIntent("reject");
              }}
              type="button"
              variant="outline"
            >
              <XIcon data-icon="inline-start" />
              Reject draft
            </Button>
            <Button
              disabled={!canOpenApproval}
              onClick={() => {
                setCommandIntent("open-approval");
                setApprovalDialogOpen(true);
              }}
              type="button"
            >
              <ShieldCheckIcon data-icon="inline-start" />
              Open approval
            </Button>
          </div>
        </CardContent>
      </Card>
      <ApprovalGateDialog
        actionId={draft.actionId}
        actions={approvalActions}
        draft={draft}
        onOpenChange={setApprovalDialogOpen}
        onResponse={onApprovalResponse}
        open={approvalDialogOpen}
        recordIds={evidencePack.recordIds}
      />
    </section>
  );
}

function commandIntentLabel(commandIntent: DraftCommandIntent): string {
  switch (commandIntent) {
    case "open-approval":
      return "Open approval prepared";
    case "reject":
      return "Reject draft prepared";
    case "request-changes":
      return "Request changes prepared";
  }
}

function humanDecisionLabel(decision: MayaApprovalAction["decision"]): string {
  switch (decision) {
    case "approve":
      return "Approval review";
    case "modify":
      return "Change request";
    case "reject":
      return "Rejection review";
  }
}

function EvidenceTable({ evidencePack }: { evidencePack: MayaEvidencePack }) {
  if (evidencePack.documents.length === 0) {
    return <MayaEmptyState description="The selected draft returned no evidence documents." title="Supporting evidence unavailable" />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="maya-draft-evidence-table">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionKicker>Supporting evidence</SectionKicker>
        <Badge variant="outline">Cited evidence</Badge>
      </div>
      <ScrollArea className="max-h-[24rem]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Evidence item</TableHead>
              <TableHead>Citation</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Verification</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {evidencePack.documents.map((document) => (
              <TableRow data-testid="maya-draft-evidence-row" key={document.citationId}>
                <TableCell className="w-[42%] whitespace-normal align-top">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{document.documentType}</Badge>
                      <Badge variant="secondary">{document.relevance}</Badge>
                      <span className="font-medium">{document.description}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{document.summary}</span>
                  </div>
                </TableCell>
                <TableCell className="w-[22%] whitespace-normal align-top">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="font-medium">{document.citationId}</span>
                    <span className="text-sm text-muted-foreground">{document.documentId}</span>
                  </div>
                </TableCell>
                <TableCell className="w-[18%] whitespace-normal align-top">{document.sourceLabel}</TableCell>
                <TableCell className="w-[18%] whitespace-normal align-top">{document.verifiedLabel}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}

function HeaderFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 rounded-md border bg-muted/20 p-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-medium" title={value}>
        {value}
      </span>
    </div>
  );
}

function FactBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function ContextFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-medium" title={value}>
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

function SectionKicker({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-medium">{children}</span>;
}
