"use client";

import * as React from "react";
import { CheckIcon, PencilIcon, XIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { ApprovalGateResponse, MayaApprovalAction, MayaSelectedCase } from "./types.ts";

interface ApprovalGateDialogProps {
  actionId: string;
  actions: MayaApprovalAction[];
  draft: MayaSelectedCase["draft"];
  onOpenChange: (open: boolean) => void;
  onResponse: (response: ApprovalGateResponse) => void;
  open: boolean;
  recordIds: string[];
}

export function ApprovalGateDialog({
  actionId,
  actions,
  draft,
  onOpenChange,
  onResponse,
  open,
  recordIds
}: ApprovalGateDialogProps) {
  const reasonTextareaId = React.useId();
  const [error, setError] = React.useState<string | undefined>();
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState<ApprovalGateResponse | undefined>();

  async function submitDecision(action: MayaApprovalAction): Promise<void> {
    const trimmedReason = reason.trim();
    if (action.requiresReason && trimmedReason.length === 0) {
      setError("Reason required before this human decision is recorded.");
      return;
    }

    setError(undefined);
    setSuccess(undefined);
    setSubmitting(true);

    try {
      const response = await fetch("/api/approval", {
        body: JSON.stringify({
          actionId,
          decision: action.decision,
          ...(trimmedReason.length === 0 ? {} : { reason: trimmedReason })
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });

      if (!response.ok) {
        setError("Approval service rejected the human decision.");
        return;
      }

      const result = (await response.json()) as Partial<ApprovalGateResponse>;
      if (typeof result.auditEntryHash !== "string" || result.decision !== action.decision) {
        setError("Approval service returned an incomplete audit confirmation.");
        return;
      }

      const approvalResponse: ApprovalGateResponse = {
        ...(typeof result.actionId === "string" ? { actionId: result.actionId } : {}),
        auditEntryHash: result.auditEntryHash,
        decision: result.decision,
        ...(typeof result.status === "string" ? { status: result.status } : {})
      };
      setReason("");
      setSuccess(approvalResponse);
      onResponse(approvalResponse);
    } catch {
      setError("Approval service unavailable.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Human approval</AlertDialogTitle>
          <AlertDialogDescription>{draft.statusLabel}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex min-w-0 flex-col gap-4">
          {error === undefined ? null : (
            <Alert variant="destructive">
              <AlertTitle>Approval failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success === undefined ? (
            <Alert>
              <AlertTitle>Awaiting human decision</AlertTitle>
              <AlertDescription>{draft.basis}</AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <AlertTitle>Approval response recorded</AlertTitle>
              <AlertDescription>
                <div className="flex flex-col gap-2">
                  <span>{success.auditEntryHash}</span>
                  {success.status === undefined ? null : <Badge variant="secondary">{success.status}</Badge>}
                </div>
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Action ID</span>
              <span className="font-medium">{actionId}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Draft</span>
              <span className="font-medium">{draft.actionLabel}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Approval record IDs">
            {recordIds.map((recordId) => (
              <Badge key={recordId} variant="secondary">
                {recordId}
              </Badge>
            ))}
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={reasonTextareaId}>Reason</FieldLabel>
              <Textarea
                disabled={submitting}
                id={reasonTextareaId}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
                value={reason}
              />
              <FieldDescription>Required for actions marked with reason required.</FieldDescription>
            </Field>
          </FieldGroup>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Close</AlertDialogCancel>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button
                disabled={submitting || (action.requiresReason && reason.trim().length === 0)}
                key={action.decision}
                onClick={() => {
                  void submitDecision(action);
                }}
                type="button"
                variant="outline"
              >
                <DecisionIcon decision={action.decision} />
                {action.label}
                {action.requiresReason ? <Badge variant="secondary">Reason required</Badge> : null}
              </Button>
            ))}
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DecisionIcon({ decision }: { decision: MayaApprovalAction["decision"] }) {
  switch (decision) {
    case "approve":
      return <CheckIcon data-icon="inline-start" />;
    case "modify":
      return <PencilIcon data-icon="inline-start" />;
    case "reject":
      return <XIcon data-icon="inline-start" />;
  }
}
