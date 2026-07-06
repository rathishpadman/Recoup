"use client";

import * as React from "react";
import {
  ChevronDownIcon,
  FileTextIcon,
  MailIcon,
  RouteIcon,
  ShieldCheckIcon,
  TriangleAlertIcon
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ApprovalGateDialog } from "./approval-gate-dialog.tsx";
import { EmailDraftDialog } from "./email-draft-dialog.tsx";
import { mayaAccent } from "./maya-accent.ts";
import {
  buildDraftLetterPreview,
  buildEmailDraft,
  buildOutcomeActionPackages,
  buildRoutingBanner,
  deriveEmailRecipientGroups,
  resolveMayaWorklistReason,
  type MayaEmailDraft
} from "./maya-workspace-derived.ts";
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
  approvalReceipt?: ApprovalGateResponse | undefined;
  approvalActions: MayaApprovalAction[];
  draft: MayaSelectedCase["draft"];
  evidencePack: MayaEvidencePack;
  onApprovalResponse: (response: ApprovalGateResponse) => void;
  selectedLineId: string;
  selectedWorklistItem: MayaWorklistItem | undefined;
}

interface EmailSendReceipt {
  actionId: string;
  lineId: string;
  providerEmailId: string;
  recipientGroup: "billing" | "recovery";
  statusToken: string;
}

interface EmailDeliveryStatus {
  actionId: string;
  bodyHtmlHash?: string | undefined;
  bodyTextHash?: string | undefined;
  createdAt?: string | undefined;
  lastEvent?: string | undefined;
  lineId: string;
  providerBodyHashVerified?: boolean | undefined;
  providerEmailId: string;
  recipientGroup: "billing" | "recovery";
  status?: string | undefined;
  subject?: string | undefined;
}

export function RecoveryDraftReview({
  actionInbox,
  approvalReceipt,
  approvalActions,
  draft,
  evidencePack,
  onApprovalResponse,
  selectedLineId,
  selectedWorklistItem
}: RecoveryDraftReviewProps) {
  const [approvalDialogOpen, setApprovalDialogOpen] = React.useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = React.useState(false);
  const [emailDraft, setEmailDraft] = React.useState<MayaEmailDraft | undefined>();
  const [emailDraftKey, setEmailDraftKey] = React.useState<string | undefined>();
  const [emailSubject, setEmailSubject] = React.useState("");
  const [emailBody, setEmailBody] = React.useState("");
  const [emailError, setEmailError] = React.useState<string | undefined>();
  const [emailSending, setEmailSending] = React.useState(false);
  const [emailSentLabel, setEmailSentLabel] = React.useState<string | undefined>();
  const [emailSendReceipt, setEmailSendReceipt] = React.useState<EmailSendReceipt | undefined>();
  const [emailDeliveryStatus, setEmailDeliveryStatus] = React.useState<EmailDeliveryStatus | undefined>();
  const [emailStatusError, setEmailStatusError] = React.useState<string | undefined>();
  const [emailStatusLoading, setEmailStatusLoading] = React.useState(false);
  const [localApprovalResponse, setLocalApprovalResponse] = React.useState<ApprovalGateResponse | undefined>();
  const [evidenceReviewed, setEvidenceReviewed] = React.useState(false);
  const committedApproval = localApprovalResponse ?? approvalReceipt;
  const canSendEmail =
    committedApproval?.status === "human_decided" &&
    committedApproval.decision === "approve" &&
    committedApproval.actionId === draft.actionId &&
    selectedWorklistItem !== undefined;
  const approvalStatusLabel = committedApproval?.status === "human_decided" ? "Human decision recorded" : draft.statusLabel;
  const canOpenApproval = approvalActions.length > 0 && evidenceReviewed;
  const draftApprovalEligibility = (draft as { approvalEligibility?: { available?: boolean; statusLabel?: string } }).approvalEligibility;
  const evidenceReviewEligibilityAvailable = (draftApprovalEligibility?.available ?? false) && evidenceReviewed;
  const evidenceReviewEligibilityStatusLabel = evidenceReviewed
    ? draftApprovalEligibility?.statusLabel
    : "Mark evidence reviewed first";
  const draftSourceRecordIds = dedupeSourceRecordIds([selectedLineId, ...evidencePack.recordIds]);
  const emailRecipientGroups = selectedWorklistItem === undefined ? [] : deriveEmailRecipientGroups(selectedWorklistItem);
  const reason = selectedWorklistItem === undefined ? draft.basis : resolveMayaWorklistReason(selectedWorklistItem);
  const routingBanner = selectedWorklistItem === undefined ? undefined : buildRoutingBanner(selectedWorklistItem);
  const actionPackages = buildOutcomeActionPackages({
    actionInbox,
    draft,
    selectedLineId
  });
  const draftPreviews =
    selectedWorklistItem === undefined
      ? []
      : emailRecipientGroups.flatMap((recipientGroup) => {
          const preview = buildDraftLetterPreview({
            draft,
            evidenceRecordIds: evidencePack.recordIds,
            reason,
            recipientGroup,
            workItem: selectedWorklistItem
          });
          return preview === undefined ? [] : [preview];
        });

  React.useEffect(() => {
    setApprovalDialogOpen(false);
    setEmailDialogOpen(false);
    setEmailDraft(undefined);
    setEmailDraftKey(undefined);
    setEmailSubject("");
    setEmailBody("");
    setEmailError(undefined);
    setEmailSending(false);
    setEmailSentLabel(undefined);
    setEmailSendReceipt(undefined);
    setEmailDeliveryStatus(undefined);
    setEmailStatusError(undefined);
    setEmailStatusLoading(false);
    setLocalApprovalResponse(undefined);
    setEvidenceReviewed(false);
  }, [draft.actionId, selectedLineId]);

  return (
    <section className="flex min-w-0 flex-col gap-3" data-testid="maya-recovery-draft-review">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-2xl leading-tight">Outcome</CardTitle>
          <Badge variant="secondary">{approvalStatusLabel}</Badge>
          <Badge variant="outline">Human approval required</Badge>
        </div>
        <CardDescription>External send gated.</CardDescription>
      </div>

      {routingBanner === undefined ? (
        <Alert data-testid="maya-outcome-routing-banner">
          <TriangleAlertIcon aria-hidden="true" data-icon="inline-start" />
          <AlertTitle>Routing unavailable</AlertTitle>
          <AlertDescription>The selected work item is unavailable for this outcome.</AlertDescription>
        </Alert>
      ) : (
        <Alert className={cn("border", mayaAccent.proofPanel)} data-testid="maya-outcome-routing-banner">
          <RouteIcon aria-hidden="true" data-icon="inline-start" />
          <AlertTitle className="flex flex-wrap items-center gap-2">
            <span>{routingBanner.title}</span>
            <Badge variant="secondary">{routingBanner.amountLabel}</Badge>
          </AlertTitle>
          <AlertDescription>
            {routingBanner.routeLine}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.7fr)]">
        <Card className={cn("rounded-lg shadow-none", mayaAccent.subtleCard)} size="sm">
          <CardHeader className="gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="grid gap-1">
                <CardTitle>Recommended action</CardTitle>
                <CardDescription>Gated for review.</CardDescription>
              </div>
              <SourceRecordDetails
                recordIds={draftSourceRecordIds}
                testId="maya-draft-source-details"
                title="Draft source"
              />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2" data-testid="maya-outcome-action-packages">
              {actionPackages.map((actionPackage) => (
                <div
                  className={cn("grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_auto]", mayaAccent.proofMutedPanel)}
                  data-testid="maya-outcome-action-package"
                  key={actionPackage.key}
                >
                  <div className="grid min-w-0 gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileTextIcon aria-hidden="true" data-icon="inline-start" />
                      <span className="font-medium">{actionPackage.title}</span>
                      <Badge variant="outline">{actionPackage.statusLabel}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{actionPackage.basis}</p>
                    <span className="text-xs text-muted-foreground">Selected case line</span>
                  </div>
                  <strong className="self-start text-right tabular-nums">{actionPackage.amount}</strong>
                </div>
              ))}
            </div>

            <section className="grid gap-2" data-testid="maya-draft-message-section">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">Draft letter preview</CardTitle>
                <Badge variant="outline">{approvalStatusLabel}</Badge>
              </div>
              {draftPreviews.length === 0 ? (
                <Alert data-testid="maya-draft-letter-preview">
                  <TriangleAlertIcon aria-hidden="true" data-icon="inline-start" />
                  <AlertTitle>Draft preview unavailable</AlertTitle>
                  <AlertDescription>The selected work item is unavailable for this draft.</AlertDescription>
                </Alert>
              ) : (
                draftPreviews.map((draftPreview) => (
                  <div
                    className="grid gap-2 rounded-md border bg-background p-3"
                    data-testid="maya-draft-letter-preview"
                    key={draftPreview.recipientGroup}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{draftPreview.recipientGroup === "billing" ? "Billing" : "Recovery"}</Badge>
                      <span className="text-sm font-medium" data-testid="maya-draft-letter-subject">
                        {draftPreview.subject}
                      </span>
                    </div>
                    <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground" data-testid="maya-draft-letter-body">
                      {draftPreview.body}
                    </pre>
                  </div>
                ))
              )}
            </section>
          </CardContent>
        </Card>

        <Card className={cn("rounded-lg shadow-none", mayaAccent.subtleCard)} size="sm">
          <CardHeader>
            <CardTitle>Gate</CardTitle>
            <CardDescription>Email stays blocked until committed approval.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <label className={cn("flex cursor-pointer items-start gap-3 rounded-md border p-3", mayaAccent.proofMutedPanel)}>
              <input
                checked={evidenceReviewed}
                className="mt-1 size-4 accent-primary"
                data-testid="maya-evidence-reviewed-toggle"
                onChange={(event) => {
                  setEvidenceReviewed(event.currentTarget.checked);
                }}
                type="checkbox"
              />
              <span className="grid gap-1">
                <span className="font-medium">Mark evidence reviewed</span>
                <span className="text-sm text-muted-foreground">Unlocks approval for this draft.</span>
              </span>
            </label>

            <div className="grid gap-2" data-testid="maya-draft-rail-human-decisions">
              {approvalActions.map((action) => (
                <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2" key={action.decision}>
                  <span className="text-sm font-medium">{humanDecisionLabel(action.decision)}</span>
                  <Badge variant={action.requiresReason ? "secondary" : "outline"}>
                    {action.requiresReason ? "Reason required" : "Reason optional"}
                  </Badge>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2" data-testid="maya-draft-command-bar">
              <Button
                disabled={!canOpenApproval}
                onClick={() => {
                  setApprovalDialogOpen(true);
                }}
                type="button"
              >
                <ShieldCheckIcon data-icon="inline-start" />
                Open approval
              </Button>
              <Button
                className={mayaAccent.outlineButton}
                onClick={() => {
                  document.querySelector('[data-testid="maya-deterministic-basis-band"]')?.scrollIntoView({ block: "center" });
                }}
                type="button"
                variant="outline"
              >
                Inspect basis
              </Button>
              {emailRecipientGroups.map((recipientGroup) => (
                <Button
                  data-testid="maya-email-draft-action"
                  disabled={!canSendEmail}
                  key={`email-action-${recipientGroup}`}
                  onClick={() => {
                    openEmailDraft(recipientGroup);
                  }}
                  type="button"
                  variant="outline"
                >
                  <MailIcon data-icon="inline-start" />
                  Draft email to {recipientGroup === "billing" ? "Billing" : "Recovery"}
                </Button>
              ))}
            </div>

            <Alert data-testid="maya-draft-hitl-warning">
              <TriangleAlertIcon aria-hidden="true" data-icon="inline-start" />
              <AlertTitle>External send gated</AlertTitle>
              <AlertDescription>
                A receipt records the reviewer decision only; email, ERP postings, Billing tasks, and case closure remain separate.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      <EmailDraftDialog
        body={emailBody}
        canCheckDeliveryStatus={emailSendReceipt !== undefined}
        checkingDeliveryStatus={emailStatusLoading}
        deliveryStatus={emailDeliveryStatus}
        deliveryStatusError={emailStatusError}
        error={emailError}
        onBodyChange={setEmailBody}
        onCheckDeliveryStatus={() => {
          void checkEmailDeliveryStatus();
        }}
        onOpenChange={setEmailDialogOpen}
        onSend={() => {
          void sendEmailDraft();
        }}
        onSubjectChange={setEmailSubject}
        open={emailDialogOpen}
        sentLabel={emailSentLabel}
        sending={emailSending}
        subject={emailSubject}
      />
      <ApprovalGateDialog
        actionId={draft.actionId}
        actions={approvalActions}
        caseLabel={
          selectedWorklistItem === undefined
            ? "Selected case"
            : `${selectedWorklistItem.customerLabel} · ${selectedWorklistItem.workItemLabel}`
        }
        committedApproval={committedApproval}
        draft={draft}
        evidenceReviewEligibilityAvailable={evidenceReviewEligibilityAvailable}
        evidenceReviewEligibilityStatusLabel={evidenceReviewEligibilityStatusLabel}
        onOpenChange={setApprovalDialogOpen}
        onResponse={(response) => {
          setLocalApprovalResponse(response);
          onApprovalResponse(response);
        }}
        open={approvalDialogOpen}
        recordIds={evidencePack.recordIds}
      />
    </section>
  );

  function openEmailDraft(recipientGroup: "billing" | "recovery"): void {
    if (selectedWorklistItem === undefined || !canSendEmail) {
      return;
    }

    const nextDraft = buildEmailDraft({
      evidenceRecordIds: evidencePack.recordIds,
      reason,
      recipientGroup,
      recommendedActionLabel: selectedWorklistItem.recommendedActionLabel,
      workItem: selectedWorklistItem
    });
    const nextDraftKey = buildEmailDraftKey(draft.actionId, selectedLineId, recipientGroup);
    const sameSentDraft = emailDraftKey === nextDraftKey && emailSendReceipt !== undefined;
    setEmailDraft(nextDraft);
    setEmailDraftKey(nextDraftKey);
    setEmailSubject(nextDraft.subject);
    setEmailBody(nextDraft.body);
    setEmailError(undefined);
    if (!sameSentDraft) {
      setEmailSentLabel(undefined);
      setEmailSendReceipt(undefined);
      setEmailDeliveryStatus(undefined);
      setEmailStatusError(undefined);
    }
    setEmailDialogOpen(true);
  }

  async function sendEmailDraft(): Promise<void> {
    if (
      emailDraft === undefined ||
      selectedWorklistItem === undefined ||
      !canSendEmail ||
      emailSendReceipt !== undefined ||
      emailSentLabel !== undefined
    ) {
      return;
    }

    setEmailDraftKey(buildEmailDraftKey(draft.actionId, selectedLineId, emailDraft.recipientGroup));
    setEmailSending(true);
    setEmailError(undefined);
    setEmailSentLabel(undefined);
    setEmailSendReceipt(undefined);
    setEmailDeliveryStatus(undefined);
    setEmailStatusError(undefined);
    try {
      const response = await fetch("/api/email", {
        body: JSON.stringify({
          actionId: draft.actionId,
          body: emailBody,
          lineId: selectedLineId,
          recipientGroup: emailDraft.recipientGroup,
          subject: emailSubject
        }),
        cache: "no-store",
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const payload = (await response.json()) as {
        actionId?: string;
        error?: string;
        lineId?: string;
        missing?: string[];
        providerEmailId?: string;
        recipientGroup?: "billing" | "recovery";
        status?: string;
        statusToken?: string;
      };
      if (!response.ok) {
        const missing = Array.isArray(payload.missing) && payload.missing.length > 0 ? ` Missing: ${payload.missing.join(", ")}.` : "";
        throw new Error(`${payload.error ?? "Email send failed."}${missing}`);
      }

      setEmailSentLabel(`${payload.status ?? "sent"} - ${payload.providerEmailId ?? "provider id unavailable"}`);
      if (
        payload.providerEmailId !== undefined &&
        payload.providerEmailId.trim().length > 0 &&
        payload.statusToken !== undefined &&
        payload.statusToken.trim().length > 0
      ) {
        setEmailSendReceipt({
          actionId: payload.actionId ?? draft.actionId,
          lineId: payload.lineId ?? selectedLineId,
          providerEmailId: payload.providerEmailId,
          recipientGroup: payload.recipientGroup ?? emailDraft.recipientGroup,
          statusToken: payload.statusToken
        });
      }
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : "Email send failed.");
    } finally {
      setEmailSending(false);
    }
  }

  async function checkEmailDeliveryStatus(): Promise<void> {
    if (emailSendReceipt === undefined) {
      return;
    }

    setEmailStatusLoading(true);
    setEmailStatusError(undefined);
    try {
      const params = new URLSearchParams({
        actionId: emailSendReceipt.actionId,
        lineId: emailSendReceipt.lineId,
        providerEmailId: emailSendReceipt.providerEmailId,
        recipientGroup: emailSendReceipt.recipientGroup
      });
      const response = await fetch(`/api/email?${params.toString()}`, {
        cache: "no-store",
        headers: { "x-recoup-email-status-token": emailSendReceipt.statusToken },
        method: "GET"
      });
      const payload = (await response.json()) as EmailDeliveryStatus & { error?: string; missing?: string[] };
      if (!response.ok) {
        const missing = Array.isArray(payload.missing) && payload.missing.length > 0 ? ` Missing: ${payload.missing.join(", ")}.` : "";
        throw new Error(`${payload.error ?? "Email status read failed."}${missing}`);
      }

      setEmailDeliveryStatus({
        actionId: payload.actionId,
        bodyHtmlHash: payload.bodyHtmlHash,
        bodyTextHash: payload.bodyTextHash,
        createdAt: payload.createdAt,
        lastEvent: payload.lastEvent,
        lineId: payload.lineId,
        providerBodyHashVerified: payload.providerBodyHashVerified,
        providerEmailId: payload.providerEmailId,
        recipientGroup: payload.recipientGroup,
        status: payload.status,
        subject: payload.subject
      });
    } catch (error) {
      setEmailStatusError(error instanceof Error ? error.message : "Email status read failed.");
    } finally {
      setEmailStatusLoading(false);
    }
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

function buildEmailDraftKey(actionId: string, lineId: string, recipientGroup: "billing" | "recovery"): string {
  return `${actionId}\u0000${lineId}\u0000${recipientGroup}`;
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
    <div className="grid min-w-0 gap-2 rounded-md border p-2 text-sm" data-testid={testId}>
      <div className="grid gap-1">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">Case line attached</span>
        <span className="text-muted-foreground">{recordIds.length.toString()} cited records attached</span>
      </div>
      <Collapsible className="grid min-w-0 gap-2">
        <CollapsibleTrigger asChild>
          <Button className={cn("w-fit justify-start", mayaAccent.outlineButton)} size="sm" type="button" variant="outline">
            <ChevronDownIcon aria-hidden="true" data-icon="inline-start" />
            Details
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="hidden data-[state=open]:block">
          <RecordIdStrip recordIds={recordIds} />
        </CollapsibleContent>
      </Collapsible>
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
    <div className="flex flex-wrap gap-1.5" aria-label="Evidence record IDs">
      {recordIds.map((recordId) => (
        <Badge className={cn("max-w-full truncate", mayaAccent.pill)} key={recordId} title={recordId} variant="secondary">
          {recordId}
        </Badge>
      ))}
    </div>
  );
}

function dedupeSourceRecordIds(recordIds: readonly string[]): string[] {
  return [...new Set(recordIds.map((recordId) => recordId.trim()).filter((recordId) => recordId.length > 0))];
}
