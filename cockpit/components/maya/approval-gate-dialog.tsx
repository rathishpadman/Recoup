"use client";

import * as React from "react";
import { CheckIcon, ChevronDownIcon, PencilIcon, ShieldCheckIcon, TriangleAlertIcon, XIcon } from "lucide-react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { ApprovalGateResponse, MayaApprovalAction, MayaSelectedCase } from "./types.ts";

const NOTE_CHARACTER_LIMIT = 500;

interface ApprovalGateDialogProps {
  actionId: string;
  actions: MayaApprovalAction[];
  approverLabel?: string;
  draft: MayaSelectedCase["draft"];
  evidenceReviewEligibilityAvailable?: boolean;
  evidenceReviewEligibilityStatusLabel?: string | undefined;
  onOpenChange: (open: boolean) => void;
  onResponse: (response: ApprovalGateResponse) => void;
  open: boolean;
  recordIds: string[];
}

interface ApprovalGateRouteResult {
  actionId?: unknown;
  approverId?: unknown;
  auditEntryHash?: unknown;
  decision?: unknown;
  status?: unknown;
}

export function ApprovalGateDialog({
  actionId,
  actions,
  approverLabel,
  draft,
  evidenceReviewEligibilityAvailable = false,
  evidenceReviewEligibilityStatusLabel,
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
  const approvalEligibilityUnavailable = !evidenceReviewEligibilityAvailable;
  const eligibilityStatusLabel =
    evidenceReviewEligibilityStatusLabel?.trim() ??
    (evidenceReviewEligibilityAvailable ? "Ready for human approval" : "Eligibility unavailable");
  const orderedActions = React.useMemo(
    () => actions.map((action) => action).sort((left, right) => decisionSortIndex(left.decision) - decisionSortIndex(right.decision)),
    [actions]
  );
  const reasonRequiredVisible = actions.some((action) => action.requiresReason);
  const approverDisplay = approverLabel?.trim();
  const approverText =
    approverDisplay === undefined || approverDisplay.length === 0 ? "Verified human principal unavailable" : approverDisplay;
  const reasonError =
    error === "Reason required before this human decision is recorded."
      ? "Reason required before this human decision is recorded."
      : undefined;

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) {
      setError(undefined);
    }
    onOpenChange(nextOpen);
  }

  function isDecisionDisabled(action: MayaApprovalAction): boolean {
    return submitting || approvalEligibilityUnavailable || (action.requiresReason && reason.trim().length === 0);
  }

  async function submitDecision(action: MayaApprovalAction): Promise<void> {
    const trimmedReason = reason.trim();
    if (approvalEligibilityUnavailable) {
      setError("Evidence review status and approval availability are unavailable for this draft.");
      return;
    }
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

      const result = (await response.json()) as ApprovalGateRouteResult;
      if (
        typeof result.actionId !== "string" ||
        result.actionId !== actionId ||
        typeof result.auditEntryHash !== "string" ||
        result.decision !== action.decision ||
        (result.status !== undefined && result.status !== "human_decided")
      ) {
        setError("Approval service returned an incomplete audit confirmation.");
        return;
      }

      const approvalResponse: ApprovalGateResponse = {
        actionId: result.actionId,
        ...(typeof result.approverId === "string" ? { approverId: result.approverId } : {}),
        auditEntryHash: result.auditEntryHash,
        decision: action.decision,
        ...(result.status === "human_decided" ? { status: result.status } : {})
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
    <AlertDialog onOpenChange={handleOpenChange} open={open}>
      <AlertDialogContent
        className="grid max-h-[calc(100vh-2rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl"
        data-testid="maya-approval-gate-dialog"
      >
        <div className="flex items-start justify-between gap-4 p-4">
          <AlertDialogHeader className="place-items-start gap-1.5 text-left">
            <div className="flex items-start gap-3">
              <TriangleAlertIcon aria-hidden="true" className="mt-0.5" data-icon="inline-start" />
              <div className="grid gap-1">
                <AlertDialogTitle>Human approval required</AlertDialogTitle>
                <AlertDialogDescription>
                  Opening this dialog does not dispatch anything. No action will be taken until you choose an option.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogCancel asChild disabled={submitting}>
            <Button aria-label="Close human approval dialog" disabled={submitting} size="icon" type="button" variant="ghost">
              <XIcon aria-hidden="true" data-icon="inline-start" />
            </Button>
          </AlertDialogCancel>
        </div>

        <Separator />

        <div className="flex min-w-0 flex-col gap-3 overflow-y-auto p-4">
          {approvalEligibilityUnavailable ? (
            <Alert data-testid="maya-approval-eligibility-alert">
              <TriangleAlertIcon aria-hidden="true" data-icon="inline-start" />
              <AlertTitle>Approval unavailable</AlertTitle>
              <AlertDescription>
                <Badge className="mr-2" variant="outline">
                  {eligibilityStatusLabel}
                </Badge>
                Evidence review status and approval eligibility are unavailable for this draft. Decision buttons stay disabled
                until the approval source provides eligibility. External action remains blocked.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert data-testid="maya-approval-eligibility-alert">
              <ShieldCheckIcon aria-hidden="true" data-icon="inline-start" />
              <AlertTitle>{eligibilityStatusLabel}</AlertTitle>
              <AlertDescription>
                Evidence eligibility is available for this draft. External action remains blocked until a human records a
                decision.
              </AlertDescription>
            </Alert>
          )}

          {error === undefined ? null : (
            <Alert variant="destructive">
              <AlertTitle>Approval failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success === undefined ? null : (
            <Alert>
              <AlertTitle>Approval response recorded</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-2">
                <span>Committed receipt returned by the approval service.</span>
                {success.status === undefined ? null : <Badge variant="secondary">{success.status}</Badge>}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid min-w-0">
            <ApprovalFactRow label="Approver">
              <span className="font-medium">{approverText}</span>
              <Badge className="w-fit" variant="outline">
                Approval owner pending
              </Badge>
            </ApprovalFactRow>
            <Separator />
            <ApprovalFactRow label="Action">
              <span className="font-medium">{draft.actionLabel}</span>
              <span className="text-muted-foreground">{draft.basis}</span>
            </ApprovalFactRow>
            <Separator />
            <ApprovalFactRow label="Status">
              <Badge className="w-fit" variant="secondary">
                {draft.statusLabel}
              </Badge>
              <span className="text-muted-foreground">External action remains blocked.</span>
            </ApprovalFactRow>
            <Separator />
            <ApprovalFactRow label="Basis">
              <span>{draft.basis}</span>
            </ApprovalFactRow>
            <Separator />
            <ApprovalFactRow label="Cited records">
              <span className="text-muted-foreground">
                {recordIds.length === 0 ? "No cited evidence records are attached." : "Cited evidence available."}
              </span>
              <ApprovalSourceDetails recordIds={recordIds} />
            </ApprovalFactRow>
          </div>

          <FieldGroup>
            <Field data-invalid={reasonError === undefined ? undefined : true}>
              <FieldLabel htmlFor={reasonTextareaId}>Note / reason</FieldLabel>
              <Textarea
                aria-invalid={reasonError === undefined ? undefined : true}
                disabled={submitting}
                id={reasonTextareaId}
                maxLength={NOTE_CHARACTER_LIMIT}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
                placeholder="Document the human reason without secrets or PII."
                value={reason}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FieldDescription>
                  {reasonRequiredVisible
                    ? "Request changes and Reject require a human reason when approval eligibility exists."
                    : "Reason is optional when approval eligibility exists."}
                </FieldDescription>
                <FieldDescription data-testid="maya-approval-note-counter">
                  {reason.length.toString()} / {NOTE_CHARACTER_LIMIT.toString()}
                </FieldDescription>
              </div>
              <FieldError>{reasonError}</FieldError>
            </Field>
          </FieldGroup>
        </div>

        <AlertDialogFooter className="flex-col items-stretch justify-start gap-3 sm:flex-col sm:justify-start">
          <div className="flex flex-wrap gap-2">
            {orderedActions.map((action) => (
              <Button
                disabled={isDecisionDisabled(action)}
                key={action.decision}
                onClick={() => {
                  void submitDecision(action);
                }}
                type="button"
                variant={decisionButtonVariant(action.decision, approvalEligibilityUnavailable)}
              >
                <DecisionIcon decision={action.decision} />
                {decisionButtonLabel(action.decision)}
                {action.requiresReason ? <Badge variant="secondary">Reason required</Badge> : null}
              </Button>
            ))}
            <AlertDialogCancel asChild disabled={submitting}>
              <Button disabled={submitting} type="button" variant="outline">
                Cancel
              </Button>
            </AlertDialogCancel>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheckIcon aria-hidden="true" data-icon="inline-start" />
            <span>Your decision, note, and timestamp will be recorded with the draft.</span>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ApprovalFactRow({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="grid min-w-0 gap-2 py-2 md:grid-cols-[8.5rem_minmax(0,1fr)]">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex min-w-0 flex-col gap-1.5 text-sm">{children}</div>
    </div>
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

function ApprovalSourceDetails({ recordIds }: { recordIds: string[] }) {
  return (
    <Collapsible className="grid min-w-0 gap-2" data-testid="maya-approval-source-details">
      <CollapsibleTrigger asChild>
        <Button className="w-fit justify-start" size="sm" type="button" variant="outline">
          <ChevronDownIcon aria-hidden="true" data-icon="inline-start" />
          Approval source details
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-wrap gap-1.5" aria-label="Approval cited records">
          {recordIds.length === 0 ? (
            <Badge variant="outline">No record IDs</Badge>
          ) : (
            recordIds.map((recordId) => (
              <Badge className="max-w-full truncate" key={recordId} title={recordId} variant="secondary">
                {recordId}
              </Badge>
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function decisionButtonLabel(decision: MayaApprovalAction["decision"]): string {
  switch (decision) {
    case "approve":
      return "Approve";
    case "modify":
      return "Request changes";
    case "reject":
      return "Reject";
  }
}

function decisionButtonVariant(
  decision: MayaApprovalAction["decision"],
  approvalEligibilityUnavailable: boolean
): React.ComponentProps<typeof Button>["variant"] {
  if (approvalEligibilityUnavailable) {
    return "outline";
  }

  switch (decision) {
    case "approve":
      return "default";
    case "modify":
      return "outline";
    case "reject":
      return "destructive";
  }
}

function decisionSortIndex(decision: MayaApprovalAction["decision"]): number {
  switch (decision) {
    case "approve":
      return 0;
    case "reject":
      return 1;
    case "modify":
      return 2;
  }
}
