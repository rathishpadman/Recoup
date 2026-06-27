"use client";

import * as React from "react";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ClipboardCopyIcon,
  LockKeyholeIcon,
  ShieldAlertIcon,
  ShieldCheckIcon
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ApprovalGateResponse } from "./types.ts";

const AUDIT_HASH_PATTERN = /^[a-fA-F0-9]{64}$/u;

interface SelectedActionContext {
  actionLabel: string;
  basis: string;
  recordIds: string[];
  statusLabel: string;
}

interface AuditConfirmationPanelProps {
  onReturnToWorklist: () => void;
  response: ApprovalGateResponse | undefined;
  selectedActionContext: SelectedActionContext;
}

interface ReceiptRow {
  basis: string;
  label: string;
  state: string;
  tone: "available" | "gap" | "waiting";
  value: React.ReactNode;
}

export function AuditConfirmationPanel({ onReturnToWorklist, response, selectedActionContext }: AuditConfirmationPanelProps) {
  const confirmedResponse = confirmedApprovalResponse(response);
  const [copyStatus, setCopyStatus] = React.useState<string | undefined>();
  const [receiptDetailsOpen, setReceiptDetailsOpen] = React.useState(false);
  const rows = confirmedResponse === undefined ? unavailableRows() : confirmedRows(confirmedResponse);
  const gapCount = rows.filter((row) => row.tone === "gap").length;
  const waitingCount = rows.filter((row) => row.tone === "waiting").length;

  React.useEffect(() => {
    setCopyStatus(undefined);
  }, [confirmedResponse?.auditEntryHash]);

  async function copyAuditEntryHash(): Promise<void> {
    if (confirmedResponse === undefined) {
      return;
    }

    try {
      await navigator.clipboard.writeText(confirmedResponse.auditEntryHash);
      setCopyStatus("Audit entry hash copied");
    } catch {
      setCopyStatus("Copy unavailable");
    }
  }

  return (
    <Card className="rounded-lg shadow-none" data-testid="maya-audit-confirmation" size="sm">
      <CardHeader className="gap-3">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid min-w-0 gap-1">
            <CardTitle className="text-2xl leading-tight">Audit confirmation</CardTitle>
            <CardDescription>
              Approval receipt state for the selected draft. No downstream action is inferred.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={confirmedResponse === undefined ? "outline" : "secondary"}>
              {confirmedResponse === undefined ? "Unavailable" : "Human decision recorded"}
            </Badge>
            <Badge variant="outline">Source controlled</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <Alert data-testid="maya-audit-confirmation-state">
          {confirmedResponse === undefined ? (
            <ShieldAlertIcon aria-hidden="true" data-icon="inline-start" />
          ) : (
            <ShieldCheckIcon aria-hidden="true" data-icon="inline-start" />
          )}
          <AlertTitle>
            {confirmedResponse === undefined ? "Audit confirmation unavailable" : "Human decision recorded"}
          </AlertTitle>
          <AlertDescription>
            {confirmedResponse === undefined
              ? "No committed approval receipt is available yet. The audit remains blocked until the source returns a verified human decision and a complete approval receipt."
              : "A committed human approval receipt is available. Fields not returned by the source remain unavailable."}
          </AlertDescription>
        </Alert>

        <section
          className="grid min-w-0 gap-3 rounded-lg border border-border bg-background/80 p-3"
          data-testid="maya-audit-summary-panel"
        >
          <div className="grid min-w-0 gap-3 md:grid-cols-3">
            <SummaryFact
              label="Receipt state"
              value={confirmedResponse === undefined ? "Waiting for committed approval receipt" : "Available"}
            />
            <SummaryFact
              label="Receipt gaps"
              value={gapCount === 0 ? "No missing receipt fields" : `${String(gapCount)} missing receipt fields`}
            />
            <SummaryFact
              label="Receipt proof"
              value="Open details for field availability"
            />
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Receipt fields remain source-owned. Approval finality is not recovery dispatch, ERP write-back, Billing routing, or case closure.
          </p>
        </section>

        <Collapsible
          className="grid min-w-0 gap-3"
          data-testid="maya-audit-receipt-details"
          onOpenChange={setReceiptDetailsOpen}
          open={receiptDetailsOpen}
        >
          <CollapsibleTrigger asChild>
            <Button className="w-fit justify-start" type="button" variant="outline">
              <ChevronDownIcon aria-hidden="true" className={receiptDetailsOpen ? "rotate-180" : undefined} data-icon="inline-start" />
              Audit receipt details
            </Button>
          </CollapsibleTrigger>
          {receiptDetailsOpen ? (
            <CollapsibleContent className="min-w-0 overflow-x-auto rounded-lg border border-border bg-background">
              <div className="border-b px-3 py-2 text-sm text-muted-foreground">
                {waitingCount === 0 ? "No unavailable receipt fields" : `${String(waitingCount)} unavailable receipt fields`}
              </div>
              <ReceiptTable
                copyButton={
                  confirmedResponse === undefined ? undefined : (
                    <HashCopyButton copyStatus={copyStatus} onCopy={() => void copyAuditEntryHash()} />
                  )
                }
                rows={rows}
              />
            </CollapsibleContent>
          ) : null}
        </Collapsible>

        <Separator />

        <section className="grid min-w-0 gap-3" data-testid="maya-audit-selected-action-context">
          <div className="grid min-w-0 gap-1">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <LockKeyholeIcon aria-hidden="true" data-icon="inline-start" />
              Selected action context
            </h3>
            <p className="text-sm text-muted-foreground">
              These are selected action citations, not committed audit receipt citations.
            </p>
          </div>
          <div className="grid min-w-0 gap-3">
            <ContextFact label="Selected action" value={selectedActionContext.actionLabel} />
            <ContextFact label="Selected draft status" value={selectedActionContext.statusLabel} />
            <ContextFact label="Selected basis" value={selectedActionContext.basis} />
            <div className="grid min-w-0 gap-1.5">
              <span className="text-sm font-medium">Selected action citations</span>
              <span className="text-sm text-muted-foreground">
                {selectedActionContext.recordIds.length === 0 ? "No selected action citations attached." : "Cited evidence available."}
              </span>
              <SelectedActionSourceDetails recordIds={selectedActionContext.recordIds} />
            </div>
          </div>
        </section>
      </CardContent>
      <CardFooter className="flex flex-wrap justify-end gap-2">
        <Button onClick={onReturnToWorklist} type="button" variant="outline">
          <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
          Return to worklist
        </Button>
      </CardFooter>
    </Card>
  );
}

function SummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="break-words text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

function confirmedApprovalResponse(response: ApprovalGateResponse | undefined): ApprovalGateResponse | undefined {
  if (response === undefined) {
    return undefined;
  }

  const hasCommittedStatus = response.status === "human_decided";
  const hasActionId = typeof response.actionId === "string" && response.actionId.trim().length > 0;
  if (!hasActionId || !hasCommittedStatus || !AUDIT_HASH_PATTERN.test(response.auditEntryHash)) {
    return undefined;
  }

  return response;
}

function unavailableRows(): ReceiptRow[] {
  return [
    {
      basis: "Requires status === human_decided and a valid 64-hex auditEntryHash from the backend.",
      label: "Audit entry hash",
      state: "Unavailable",
      tone: "waiting",
      value: "Waiting for committed approval receipt"
    },
    {
      basis: "The current approval response/read model does not expose previousHash.",
      label: "Previous hash",
      state: "Backend contract gap",
      tone: "gap",
      value: "Backend contract gap"
    },
    {
      basis: "A committed response actionId is required before rendering a receipt reference.",
      label: "Decision/action reference",
      state: "Unavailable",
      tone: "waiting",
      value: "Waiting for committed approval receipt"
    },
    {
      basis: "Decision outcome renders only from a committed backend approval response.",
      label: "Decision outcome",
      state: "Unavailable",
      tone: "waiting",
      value: "Waiting for committed approval receipt"
    },
    {
      basis: "The browser read model does not expose the verified human approver for Beat 11.",
      label: "Human approver",
      state: "Backend contract gap",
      tone: "gap",
      value: "Backend contract gap"
    },
    {
      basis: "The browser must not create a commit time; backend-owned committedAt is not exposed.",
      label: "Committed timestamp",
      state: "Backend contract gap",
      tone: "gap",
      value: "Backend contract gap"
    },
    {
      basis: "Committed audit receipt citations unavailable. Selected action citations are shown separately below.",
      label: "Cited record IDs",
      state: "Unavailable",
      tone: "waiting",
      value: "Committed audit receipt citations unavailable"
    },
    {
      basis: "Approval finality is not recovery dispatch, ERP write-back, Billing routing, or case closure.",
      label: "Action state",
      state: "Unavailable",
      tone: "waiting",
      value: "Waiting for committed approval receipt"
    }
  ];
}

function confirmedRows(response: ApprovalGateResponse): ReceiptRow[] {
  return [
    {
      basis: "Backend returned status === human_decided and a valid 64-hex auditEntryHash.",
      label: "Audit entry hash",
      state: "Available",
      tone: "available",
      value: <HashValue value={response.auditEntryHash} />
    },
    {
      basis: "The current approval response/read model does not expose previousHash.",
      label: "Previous hash",
      state: "Backend contract gap",
      tone: "gap",
      value: "Backend contract gap"
    },
    {
      basis: "Rendered exactly from the backend approval response actionId.",
      label: "Decision/action reference",
      state: "Available",
      tone: "available",
      value: response.actionId
    },
    {
      basis: "Rendered exactly from the backend approval response decision.",
      label: "Decision outcome",
      state: "Available",
      tone: "available",
      value: decisionLabel(response.decision)
    },
    {
      basis:
        response.approverId === undefined
          ? "The current approval response type does not expose approverId or a display principal."
          : "Rendered exactly from the persisted backend approval receipt approverId.",
      label: "Human approver",
      state: response.approverId === undefined ? "Backend contract gap" : "Available",
      tone: response.approverId === undefined ? "gap" : "available",
      value: response.approverId ?? "Backend contract gap"
    },
    {
      basis: "The browser must not create a commit time; backend-owned committedAt is not exposed.",
      label: "Committed timestamp",
      state: "Backend contract gap",
      tone: "gap",
      value: "Backend contract gap"
    },
    {
      basis:
        response.recordIds === undefined
          ? "The current immediate approval response does not expose committed audit recordIds."
          : "Rendered exactly from persisted backend approval receipt recordIds.",
      label: "Cited record IDs",
      state: response.recordIds === undefined ? "Backend contract gap" : "Available",
      tone: response.recordIds === undefined ? "gap" : "available",
      value:
        response.recordIds === undefined ? (
          "Committed audit receipt citations unavailable"
        ) : (
          <SelectedActionSourceDetails recordIds={response.recordIds} />
        )
    },
    {
      basis: "The response status confirms only the human decision, not external dispatch or case closure.",
      label: "Action state",
      state: "Available",
      tone: "available",
      value: response.status
    }
  ];
}

function ReceiptTable({ copyButton, rows }: { copyButton: React.ReactNode | undefined; rows: ReceiptRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[22%]">Receipt field</TableHead>
          <TableHead className="w-[18%]">State</TableHead>
          <TableHead className="w-[30%]">Value</TableHead>
          <TableHead>Deterministic basis</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.label}>
            <TableCell className="whitespace-normal font-medium">{row.label}</TableCell>
            <TableCell className="whitespace-normal">
              <Badge variant={badgeVariantForTone(row.tone)}>{row.state}</Badge>
            </TableCell>
            <TableCell className="min-w-0 whitespace-normal">
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 break-words">{row.value}</span>
                {row.label === "Audit entry hash" ? copyButton : null}
              </div>
            </TableCell>
            <TableCell className="whitespace-normal text-muted-foreground">{row.basis}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function HashCopyButton({ copyStatus, onCopy }: { copyStatus: string | undefined; onCopy: () => void }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button aria-label="Copy audit entry hash" onClick={onCopy} size="icon-sm" type="button" variant="ghost">
            <ClipboardCopyIcon data-icon="inline-start" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <span>{copyStatus ?? "Copy audit entry hash"}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function HashValue({ value }: { value: string }) {
  return <code className="break-all font-mono text-xs">{value}</code>;
}

function ContextFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-sm font-medium">{label}</span>
      <span className="break-words text-sm text-muted-foreground">{value}</span>
    </div>
  );
}

function RecordIdStrip({ recordIds }: { recordIds: string[] }) {
  if (recordIds.length === 0) {
    return (
      <Badge className="w-fit" variant="outline">
        No selected action citations
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Selected action citations">
      {recordIds.map((recordId) => (
        <Badge className="max-w-full truncate" key={recordId} title={recordId} variant="secondary">
          {recordId}
        </Badge>
      ))}
    </div>
  );
}

function SelectedActionSourceDetails({ recordIds }: { recordIds: string[] }) {
  return (
    <Collapsible className="grid min-w-0 gap-2" data-testid="maya-audit-selected-action-source-details">
      <CollapsibleTrigger asChild>
        <Button className="w-fit justify-start" size="sm" type="button" variant="outline">
          <ChevronDownIcon aria-hidden="true" data-icon="inline-start" />
          Selected action source details
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <RecordIdStrip recordIds={recordIds} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function badgeVariantForTone(tone: ReceiptRow["tone"]): React.ComponentProps<typeof Badge>["variant"] {
  switch (tone) {
    case "available":
      return "secondary";
    case "gap":
    case "waiting":
      return "outline";
  }
}

function decisionLabel(decision: ApprovalGateResponse["decision"]): string {
  switch (decision) {
    case "approve":
      return "Approve";
    case "modify":
      return "Modify";
    case "reject":
      return "Reject";
  }
}
