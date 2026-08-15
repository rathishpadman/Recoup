"use client";

import * as React from "react";
import { ShieldCheckIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ApprovalGateResponse } from "./types.ts";

interface CreditRecommendationApprovalProps {
  actionId: string;
  basis: string;
  changeLabel: string;
  onApproved: (response: ApprovalGateResponse) => void;
  title: string;
}

interface ApprovalRouteResult {
  actionId?: string;
  approverId?: string;
  auditEntryHash?: string;
  decision?: string;
  error?: string;
  status?: string;
}

const alreadyDecidedMessage = "Action already has a committed human decision.";

/**
 * Sends one advisory credit recommendation to David. Approval is a human gate, so the change is
 * restated and confirmed before anything is committed, and the response is only accepted when it
 * carries the audit hash proving the decision was recorded.
 */
export function CreditRecommendationApproval({
  actionId,
  basis,
  changeLabel,
  onApproved,
  title
}: CreditRecommendationApprovalProps) {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  async function submit(): Promise<void> {
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
        setError(
          response.status === 409 || result.error === alreadyDecidedMessage
            ? "This recommendation already has a committed human decision."
            : "Approval service rejected the human decision."
        );
        return;
      }

      if (
        result.actionId !== actionId ||
        typeof result.auditEntryHash !== "string" ||
        result.decision !== "approve" ||
        (result.status !== undefined && result.status !== "human_decided")
      ) {
        setError("Approval service returned an incomplete audit confirmation.");
        return;
      }

      onApproved({
        actionId: result.actionId,
        ...(typeof result.approverId === "string" ? { approverId: result.approverId } : {}),
        auditEntryHash: result.auditEntryHash,
        decision: "approve",
        status: "human_decided"
      });
      setOpen(false);
    } catch {
      setError("Approval service is unavailable.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        data-testid="maya-credit-recommendation-approve"
        onClick={() => {
          setError(undefined);
          setOpen(true);
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <ShieldCheckIcon aria-hidden="true" data-icon="inline-start" />
        Send to David
      </Button>
      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogContent data-testid="maya-credit-recommendation-approval-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>
              {changeLabel}. Approving records a human decision and sends this to David as a governed signal. It does not
              change the credit account by itself.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">{basis}</p>
          {error === undefined ? null : (
            <Alert variant="destructive">
              <AlertTitle>Not recorded</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="maya-credit-recommendation-approve-confirm"
              disabled={submitting}
              onClick={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              {submitting ? "Recording decision" : "Approve and send"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
