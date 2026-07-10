"use client";

import * as React from "react";
import { CheckCircle2Icon, ShieldCheckIcon, XIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DavidApprovalGateDialogProps {
  actionId: string;
  approvalDescription?: string | undefined;
  governedApprovalDescription?: string | undefined;
  open: boolean;
  onApproved: () => void;
  onOpenChange: (open: boolean) => void;
  packetDetail: string;
  packetTitle: string;
  recordIds: string[];
  routeLabel: string;
  submitLabel?: string | undefined;
  submittingLabel?: string | undefined;
  titleOverride?: string | undefined;
}

interface DavidApprovalGateCopyOverrides {
  approvalDescription?: string | undefined;
  governedApprovalDescription?: string | undefined;
  submitLabel?: string | undefined;
  submittingLabel?: string | undefined;
}

export function buildDavidApprovalGateCopy(overrides: DavidApprovalGateCopyOverrides): {
  approvalDescription: string;
  governedApprovalDescription: string;
  submitLabel: string;
  submittingLabel: string;
} {
  return {
    approvalDescription:
      overrides.approvalDescription ?? "This records the human decision only. External send remains gated after approval.",
    governedApprovalDescription:
      overrides.governedApprovalDescription ??
      "The approval route will refresh `/credit` and wait for the backend receipt before this packet changes to committed.",
    submitLabel: overrides.submitLabel ?? "Approve and refresh",
    submittingLabel: overrides.submittingLabel ?? "Recording decision..."
  };
}

export function buildDavidApprovalGateTitle(packetTitle: string, titleOverride?: string): string {
  return titleOverride ?? `Send ${packetTitle}?`;
}

interface ApprovalRouteResult {
  actionId?: unknown;
  auditEntryHash?: unknown;
  decision?: unknown;
  error?: unknown;
  status?: unknown;
}

export function DavidApprovalGateDialog({
  actionId,
  approvalDescription,
  governedApprovalDescription,
  open,
  onApproved,
  onOpenChange,
  packetDetail,
  packetTitle,
  recordIds,
  routeLabel,
  submitLabel,
  submittingLabel,
  titleOverride
}: Readonly<DavidApprovalGateDialogProps>) {
  const [error, setError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);
  const copy = buildDavidApprovalGateCopy({
    approvalDescription,
    governedApprovalDescription,
    submitLabel,
    submittingLabel
  });
  const dialogTitle = buildDavidApprovalGateTitle(packetTitle, titleOverride);

  React.useEffect(() => {
    if (!open) {
      setError(undefined);
      setSubmitting(false);
    }
  }, [open]);

  async function submitApproval(): Promise<void> {
    setError(undefined);
    setSubmitting(true);

    try {
      const response = await fetch("/api/approval", {
        body: JSON.stringify({ actionId, decision: "approve" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const result = (await response.json().catch(() => ({}))) as ApprovalRouteResult;

      if (!response.ok) {
        setError(typeof result.error === "string" ? result.error : "Approval service rejected the governed action packet.");
        return;
      }

      if (
        result.actionId !== actionId ||
        result.decision !== "approve" ||
        result.status !== "human_decided" ||
        typeof result.auditEntryHash !== "string" ||
        !/^[a-f0-9]{64}$/iu.test(result.auditEntryHash)
      ) {
        setError("Approval service returned an incomplete governed receipt.");
        return;
      }

      onApproved();
    } catch {
      setError("Approval service unavailable.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent className="sm:max-w-lg" data-testid="david-approval-gate-dialog">
        <AlertDialogHeader className="gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="grid gap-1 text-left">
              <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
              <AlertDialogDescription>{copy.approvalDescription}</AlertDialogDescription>
            </div>
            <AlertDialogCancel asChild>
              <Button aria-label="Close approval dialog" disabled={submitting} size="icon" type="button" variant="ghost">
                <XIcon aria-hidden="true" className="size-4" />
              </Button>
            </AlertDialogCancel>
          </div>
        </AlertDialogHeader>

        <div className="grid gap-4">
          {error === undefined ? null : (
            <Alert variant="destructive">
              <AlertTitle>Approval failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Alert>
            <ShieldCheckIcon aria-hidden="true" data-icon="inline-start" />
            <AlertTitle>Governed approval</AlertTitle>
            <AlertDescription>{copy.governedApprovalDescription}</AlertDescription>
          </Alert>

          <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{routeLabel}</Badge>
              <Badge variant="outline">{actionId}</Badge>
              <Badge variant="secondary">{`${recordIds.length.toString()} records`}</Badge>
            </div>
            <div className="font-medium">{packetTitle}</div>
            <p className="text-muted-foreground">{packetDetail}</p>
          </div>
        </div>

        <AlertDialogFooter className="flex flex-wrap gap-2">
          <AlertDialogCancel asChild>
            <Button disabled={submitting} type="button" variant="outline">
              Cancel
            </Button>
          </AlertDialogCancel>
          <Button disabled={submitting} onClick={() => void submitApproval()} type="button">
            <CheckCircle2Icon aria-hidden="true" data-icon="inline-start" />
            {submitting ? copy.submittingLabel : copy.submitLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
