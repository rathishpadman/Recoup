"use client";

import * as React from "react";
import { CheckIcon, ChevronDownIcon, PencilIcon, ShieldCheckIcon, XIcon } from "lucide-react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { mayaAccent } from "./maya-accent.ts";
import type { ApprovalGateResponse, MayaApprovalAction, MayaSelectedCase } from "./types.ts";

const NOTE_CHARACTER_LIMIT = 500;
const alreadyDecidedMessage = "Action already has a human decision.";

interface ApprovalGateDialogProps {
  actionId: string;
  actions: MayaApprovalAction[];
  approverLabel?: string;
  caseLabel: string;
  committedApproval?: ApprovalGateResponse | undefined;
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
  error?: unknown;
  status?: unknown;
}

export function ApprovalGateDialog({
  actionId,
  actions,
  approverLabel,
  caseLabel,
  committedApproval,
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
  const [duplicateConflict, setDuplicateConflict] = React.useState(false);
  const matchingCommittedApproval = committedApproval?.actionId === actionId ? committedApproval : undefined;
  const terminalApproval = success ?? matchingCommittedApproval;
  const hasTerminalDecision = terminalApproval !== undefined || duplicateConflict;
  const approvalEligibilityUnavailable = !evidenceReviewEligibilityAvailable;
  const eligibilityStatusLabel =
    evidenceReviewEligibilityStatusLabel?.trim() ??
    (evidenceReviewEligibilityAvailable ? "Ready for human approval" : "Eligibility unavailable");
  const orderedActions = React.useMemo(
    () => actions.map((action) => action).sort((left, right) => decisionSortIndex(left.decision) - decisionSortIndex(right.decision)),
    [actions]
  );
  const reasonRequiredVisible = actions.some((action) => action.requiresReason);
  const reasonError =
    error === "Reason required before this human decision is recorded."
      ? "Reason required before this human decision is recorded."
      : undefined;
  const duplicateDecisionError = error?.startsWith("Decision already recorded") === true;
  const approvalQuestionLabel =
    orderedActions.find((action) => action.decision === "approve")?.label ?? draft.actionLabel;

  React.useEffect(() => {
    setError(undefined);
    setReason("");
    setSubmitting(false);
    setDuplicateConflict(false);
    setSuccess(matchingCommittedApproval);
  }, [actionId, matchingCommittedApproval]);

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) {
      setError(undefined);
    }
    onOpenChange(nextOpen);
  }

  function isDecisionDisabled(action: MayaApprovalAction): boolean {
    return (
      hasTerminalDecision ||
      submitting ||
      approvalEligibilityUnavailable ||
      (action.requiresReason && reason.trim().length === 0)
    );
  }

  async function submitDecision(action: MayaApprovalAction): Promise<void> {
    const trimmedReason = reason.trim();
    if (hasTerminalDecision) {
      setError(formatAlreadyApprovedMessage(terminalApproval));
      return;
    }
    if (approvalEligibilityUnavailable) {
      setError("Evidence review status and approval availability are unavailable for this draft.");
      return;
    }
    if (action.requiresReason && trimmedReason.length === 0) {
      setError("Reason required before this human decision is recorded.");
      return;
    }

    setError(undefined);
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
      const result = (await response.json().catch(() => ({}))) as ApprovalGateRouteResult;

      if (!response.ok) {
        if (response.status === 409 || result.error === alreadyDecidedMessage) {
          setDuplicateConflict(true);
          setError(formatAlreadyApprovedMessage(terminalApproval));
          return;
        }
        setError("Approval service rejected the human decision.");
        return;
      }

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
        className="grid max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden border-primary/15 p-0 sm:max-w-xl"
        data-testid="maya-approval-gate-dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-primary/10 bg-primary/5 p-4">
          <AlertDialogHeader className="place-items-start gap-1.5 text-left">
            <div className="grid gap-1">
              <AlertDialogTitle>Approve {approvalQuestionLabel}?</AlertDialogTitle>
              <AlertDialogDescription>Review the case facts and record your decision.</AlertDialogDescription>
            </div>
          </AlertDialogHeader>
          <AlertDialogCancel asChild disabled={submitting}>
            <Button aria-label="Close approval dialog" disabled={submitting} size="icon" type="button" variant="ghost">
              <XIcon aria-hidden="true" data-icon="inline-start" />
            </Button>
          </AlertDialogCancel>
        </div>

        <div className="flex min-w-0 flex-col gap-3 overflow-y-auto p-4" data-testid="maya-approval-primary-view">
          {error === undefined ? null : (
            <Alert variant={duplicateDecisionError ? "default" : "destructive"}>
              <AlertTitle>{duplicateDecisionError ? "Decision already recorded" : "Approval failed"}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {terminalApproval === undefined ? null : (
            <Alert data-testid="maya-approval-success-receipt">
              <ShieldCheckIcon aria-hidden="true" data-icon="inline-start" />
              <AlertTitle>Approval response recorded</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-2">
                <span>Receipt {shortReceipt(terminalApproval.auditEntryHash)} recorded.</span>
                {terminalApproval.status === undefined ? null : (
                  <Badge className={mayaAccent.pill} variant="secondary">{terminalApproval.status}</Badge>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid min-w-0">
            <ApprovalFactRow label="Case">
              <span className="font-medium">{caseLabel}</span>
            </ApprovalFactRow>
            <Separator />
            <ApprovalFactRow label="Amount">
              <span className="font-medium">{draft.amount}</span>
            </ApprovalFactRow>
            <Separator />
            <ApprovalFactRow label="Why">
              <span>{draft.basis}</span>
            </ApprovalFactRow>
          </div>

          <FieldGroup>
            <Field data-invalid={reasonError === undefined ? undefined : true}>
              <FieldLabel htmlFor={reasonTextareaId}>Note / reason</FieldLabel>
              <Textarea
                aria-invalid={reasonError === undefined ? undefined : true}
                disabled={submitting || hasTerminalDecision}
                id={reasonTextareaId}
                maxLength={NOTE_CHARACTER_LIMIT}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
                placeholder="Document the human reason without secrets or PII."
                readOnly={hasTerminalDecision}
                value={reason}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FieldDescription>
                  {reasonRequiredVisible ? "Request changes and Reject require a reason." : "Reason is optional."}
                </FieldDescription>
                <FieldDescription data-testid="maya-approval-note-counter">
                  {reason.length.toString()} / {NOTE_CHARACTER_LIMIT.toString()}
                </FieldDescription>
              </div>
              <FieldError>{reasonError}</FieldError>
            </Field>
          </FieldGroup>

          <ApprovalDetailsDisclosure
            actionId={actionId}
            approverLabel={approverLabel}
            eligibilityStatusLabel={eligibilityStatusLabel}
            recordIds={recordIds}
            statusLabel={draft.statusLabel}
          />
        </div>

        <AlertDialogFooter className="border-primary/10">
          {!hasTerminalDecision ? (
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
                <Button className={mayaAccent.outlineButton} disabled={submitting} type="button" variant="outline">
                  Cancel
                </Button>
              </AlertDialogCancel>
            </div>
          ) : (
            <AlertDialogCancel asChild>
              <Button className={mayaAccent.outlineButton} type="button" variant="outline">
                Close
              </Button>
            </AlertDialogCancel>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ApprovalFactRow({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="grid min-w-0 gap-2 py-2 md:grid-cols-[6rem_minmax(0,1fr)]">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex min-w-0 flex-col gap-1.5 text-sm">{children}</div>
    </div>
  );
}

function ApprovalDetailsDisclosure({
  actionId,
  approverLabel,
  eligibilityStatusLabel,
  recordIds,
  statusLabel
}: {
  actionId: string;
  approverLabel: string | undefined;
  eligibilityStatusLabel: string;
  recordIds: string[];
  statusLabel: string;
}) {
  return (
    <Collapsible className="grid min-w-0 gap-2" data-testid="maya-approval-details">
      <CollapsibleTrigger asChild>
        <Button className={cn("w-fit justify-start", mayaAccent.outlineButton)} size="sm" type="button" variant="outline">
          <ChevronDownIcon aria-hidden="true" data-icon="inline-start" />
          Details
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={cn("grid gap-3 rounded-md border p-3 text-sm", mayaAccent.proofMutedPanel)}>
          <DetailRow label="Eligibility" value={eligibilityStatusLabel} />
          <DetailRow label="Draft status" value={statusLabel} />
          <DetailRow label="Action ID" value={actionId} />
          <DetailRow label="Reviewer" value={approverLabel?.trim()} />
          <div className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">Cited records</span>
            <div className="flex flex-wrap gap-1.5" aria-label="Approval cited records">
              {recordIds.length === 0 ? (
                <Badge variant="outline">No record IDs</Badge>
              ) : (
                recordIds.map((recordId) => (
                  <Badge className={cn("max-w-full truncate", mayaAccent.pill)} key={recordId} title={recordId} variant="secondary">
                    {recordId}
                  </Badge>
                ))
              )}
            </div>
          </div>
          <p className="text-muted-foreground">
            This records the reviewer decision for the prepared draft. Email remains locked until an approved decision is returned.
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DetailRow({ label, value }: { label: string; value: string | undefined }) {
  if (value === undefined || value.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="break-words">{value}</span>
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

function formatAlreadyApprovedMessage(approval: ApprovalGateResponse | undefined): string {
  if (approval === undefined) {
    return "Decision already recorded - receipt is already recorded.";
  }

  return `Decision already recorded - receipt ${shortReceipt(approval.auditEntryHash)} recorded.`;
}

function shortReceipt(receipt: string): string {
  return receipt.slice(0, 8);
}
