"use client";

import * as React from "react";
import { useRouter } from "next/navigation.js";
import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  FileSearchIcon,
  LockKeyholeIcon,
  ScaleIcon
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { CreditRiskAccountModel } from "../../app/cockpit-data.ts";
import { DavidApprovalGateDialog } from "./david-approval-gate-dialog.tsx";
import { DavidCollapsibleCard } from "./david-collapsible-card.tsx";
import { DavidNegotiationWorkbench } from "./david-negotiation-workbench.tsx";
import { DavidRecordDisclosure } from "./david-record-disclosure.tsx";
import {
  davidBadgeVariantByTone,
  davidBorderClassByTone,
  davidMutedSurfaceClassByTone,
  davidTextClassByTone
} from "./david-verdict-tokens.ts";

const receiptWaitTimeoutMs = 8000;

export function DavidActionPacket({ account }: Readonly<{ account: CreditRiskAccountModel }>) {
  const router = useRouter();
  const [approvalDialogOpen, setApprovalDialogOpen] = React.useState(false);
  const [basisReviewed, setBasisReviewed] = React.useState(account.packet.approvalStatus === "committed");
  const [receiptRefreshPending, setReceiptRefreshPending] = React.useState(false);
  const [receiptRefreshError, setReceiptRefreshError] = React.useState<string | undefined>();

  React.useEffect(() => {
    setApprovalDialogOpen(false);
    setBasisReviewed(account.packet.approvalStatus === "committed");
    setReceiptRefreshError(undefined);
    if (account.packet.approvalStatus === "committed") {
      setReceiptRefreshPending(false);
      return;
    }

    if (!receiptRefreshPending) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setReceiptRefreshPending(false);
      setReceiptRefreshError("Committed approval receipt did not return yet. Refresh the route and confirm the backend read-back.");
    }, receiptWaitTimeoutMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [account.accountId, account.packet.actionId, account.packet.approvalStatus, receiptRefreshPending]);

  const canSendPacket = basisReviewed && !receiptRefreshPending && account.packet.approvalStatus !== "committed";
  const hasCommittedReceipt = account.packet.approvalStatus === "committed" && account.packet.auditEntryHash !== undefined;
  const workflowState = actionPacketWorkflowState({
    basisReviewed,
    hasCommittedReceipt,
    receiptRefreshPending
  });

  return (
    <>
      <DavidCollapsibleCard
        badges={
          <>
            <Badge variant={davidBadgeVariantByTone[account.verdictTone]}>{account.packet.routeLabel}</Badge>
            <Badge variant={hasCommittedReceipt ? "secondary" : "outline"}>
              {hasCommittedReceipt ? "Committed" : "Awaiting review"}
            </Badge>
          </>
        }
        dataWorkflowState={workflowState}
        defaultOpen={false}
        description={account.packet.detail}
        testId="david-action-packet"
        title="Outcome and action packet"
      >
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(14rem,0.38fr)]">
            <div className="grid gap-1">
              <div className="text-base font-semibold">{account.packet.title}</div>
              <p className="text-sm text-muted-foreground">{account.packet.detail}</p>
            </div>
            <div
              className={cn(
                "grid min-w-[14rem] gap-1 rounded-lg border p-3",
                davidBorderClassByTone[account.verdictTone],
                davidMutedSurfaceClassByTone[account.verdictTone]
              )}
            >
              <span className="text-xs font-medium text-muted-foreground">Packet</span>
              <strong>{account.packet.title}</strong>
              <span className="text-sm text-muted-foreground">{`${account.packet.recordIds.length.toString()} cited records attached`}</span>
            </div>
          </div>

          <div className="divide-y rounded-md border bg-background/80">
            {account.packet.rows.map((row) => (
              <div
                className="grid gap-2 px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                data-testid="david-action-packet-row"
                key={`${account.packet.actionId}-${row.kind}-${row.label}`}
              >
                <div className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{packetKindLabel(row.kind)}</Badge>
                    <span className="font-medium">{row.label}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{row.detail}</p>
                </div>
                <strong className="text-right text-base">{row.amountLabel}</strong>
              </div>
            ))}
          </div>

          <div className="grid gap-3 rounded-lg border bg-muted/15 p-3">
            <label className="flex items-start gap-3">
              <Checkbox
                checked={basisReviewed}
                disabled={account.packet.approvalStatus === "committed" || receiptRefreshPending}
                onCheckedChange={(checked) => {
                  setBasisReviewed(checked === true);
                }}
              />
              <span className="grid gap-1">
                <span className="font-medium">Mark basis reviewed</span>
                <span className="text-sm text-muted-foreground">Required before the governed action packet can be approved.</span>
              </span>
            </label>

            <div className="flex flex-wrap gap-2" data-can-send={canSendPacket} data-testid="david-action-packet-command-bar">
              <Sheet>
                <SheetTrigger asChild>
                  <Button type="button" variant="outline">
                    <FileSearchIcon aria-hidden="true" data-icon="inline-start" />
                    Inspect basis
                  </Button>
                </SheetTrigger>
                <SheetContent className="sm:max-w-xl" data-testid="david-action-packet-basis-sheet">
                  <SheetHeader className="gap-2">
                    <SheetTitle>{account.packet.title}</SheetTitle>
                    <SheetDescription>Read-only deterministic basis and cited records for this governed packet.</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 grid gap-4">
                    <div className="grid gap-1">
                      <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Basis</span>
                      <p className="text-sm">{account.packet.basis}</p>
                    </div>
                    <div className="grid gap-2 rounded-lg border bg-muted/20 p-3">
                      <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Deterministic basis</span>
                      <div className="grid gap-2">
                        {Object.entries(account.packet.deterministicBasis).map(([key, value]) => (
                          <div className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)]" key={key}>
                            <span className="text-sm font-medium">{formatBasisKey(key)}</span>
                            <span className="break-words text-sm text-muted-foreground">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <DavidRecordDisclosure items={account.packet.recordIds} label={`${account.packet.recordIds.length.toString()} cited records`} />
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              <DavidNegotiationWorkbench account={account} />

              <Button
                data-testid="david-send-action-packet"
                disabled={!canSendPacket}
                onClick={() => {
                  setApprovalDialogOpen(true);
                }}
                type="button"
              >
                <ScaleIcon aria-hidden="true" data-icon="inline-start" />
                {hasCommittedReceipt ? "Approval committed" : "Send action packet"}
              </Button>
            </div>
          </div>

          {receiptRefreshError === undefined ? null : (
            <Alert variant="destructive">
              <AlertTitle>Backend receipt unavailable</AlertTitle>
              <AlertDescription>{receiptRefreshError}</AlertDescription>
            </Alert>
          )}

          {receiptRefreshPending ? (
            <Alert data-testid="david-action-packet-refreshing">
              <ExternalLinkIcon aria-hidden="true" data-icon="inline-start" />
              <AlertTitle>Refreshing governed receipt</AlertTitle>
              <AlertDescription>The route is waiting for `/credit` to return the committed approval hash from the backend.</AlertDescription>
            </Alert>
          ) : hasCommittedReceipt ? (
            <Alert data-testid="david-action-packet-receipt">
              <CheckCircle2Icon aria-hidden="true" data-icon="inline-start" />
              <AlertTitle>Audit receipt available</AlertTitle>
              <AlertDescription className="grid gap-2">
                <span>Human decision recorded. External send remains gated.</span>
                <div className="grid gap-1">
                  <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Audit hash</span>
                  <code
                    className={cn("w-fit rounded-md border bg-background px-2 py-1 text-xs", davidTextClassByTone[account.verdictTone])}
                    title={account.packet.auditEntryHash}
                  >
                    {formatAuditHash(account.packet.auditEntryHash)}
                  </code>
                </div>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert data-testid="david-action-packet-awaiting">
              <LockKeyholeIcon aria-hidden="true" data-icon="inline-start" />
              <AlertTitle>External send remains gated</AlertTitle>
              <AlertDescription>No committed approval receipt is available yet for this action packet.</AlertDescription>
            </Alert>
          )}
      </DavidCollapsibleCard>

      <DavidApprovalGateDialog
        actionId={account.packet.actionId}
        onApproved={() => {
          setApprovalDialogOpen(false);
          setReceiptRefreshError(undefined);
          setReceiptRefreshPending(true);
          router.refresh();
        }}
        onOpenChange={setApprovalDialogOpen}
        open={approvalDialogOpen}
        packetDetail={account.packet.detail}
        packetTitle={account.packet.title}
        recordIds={account.packet.recordIds}
        routeLabel={account.packet.routeLabel}
      />
    </>
  );
}

function actionPacketWorkflowState(input: {
  basisReviewed: boolean;
  hasCommittedReceipt: boolean;
  receiptRefreshPending: boolean;
}): "awaiting-review" | "committed" | "ready" | "refreshing" {
  if (input.receiptRefreshPending) {
    return "refreshing";
  }
  if (input.hasCommittedReceipt) {
    return "committed";
  }

  return input.basisReviewed ? "ready" : "awaiting-review";
}

function formatBasisKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]/gu, " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function packetKindLabel(kind: CreditRiskAccountModel["packet"]["rows"][number]["kind"]): string {
  switch (kind) {
    case "hold":
      return "Hold review";
    case "limit":
      return "Limit guardrail";
    case "monitor":
      return "Monitor";
    case "reduce":
      return "Limit reduction";
    case "release":
      return "Standard release";
  }
}

function formatAuditHash(hash: string | undefined): string {
  if (hash === undefined || hash.length <= 24) {
    return hash ?? "receipt pending";
  }

  return `${hash.slice(0, 12)}...${hash.slice(-8)}`;
}
