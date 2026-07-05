"use client";

import * as React from "react";
import { RefreshCwIcon, SendIcon } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface EmailDraftDialogProps {
  body: string;
  canCheckDeliveryStatus: boolean;
  checkingDeliveryStatus: boolean;
  deliveryStatus?: EmailDeliveryStatus | undefined;
  deliveryStatusError?: string | undefined;
  error?: string | undefined;
  onBodyChange: (value: string) => void;
  onCheckDeliveryStatus: () => void;
  onOpenChange: (open: boolean) => void;
  onSend: () => void;
  onSubjectChange: (value: string) => void;
  open: boolean;
  sentLabel?: string | undefined;
  sending: boolean;
  subject: string;
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

export function EmailDraftDialog({
  body,
  canCheckDeliveryStatus,
  checkingDeliveryStatus,
  deliveryStatus,
  deliveryStatusError,
  error,
  onBodyChange,
  onCheckDeliveryStatus,
  onOpenChange,
  onSend,
  onSubjectChange,
  open,
  sentLabel,
  sending,
  subject
}: EmailDraftDialogProps) {
  const subjectId = React.useId();
  const bodyId = React.useId();
  const alreadySent = sentLabel !== undefined;

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent className="max-w-2xl" data-testid="maya-email-draft-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Review email draft</AlertDialogTitle>
          <AlertDialogDescription>
            Subject and body are editable. Send remains tied to the approved action for this case.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm" htmlFor={subjectId}>
            <span className="font-medium">Subject</span>
            <input
              className="h-9 rounded-md border bg-background px-3 text-sm"
              disabled={alreadySent || sending}
              id={subjectId}
              onChange={(event) => {
                onSubjectChange(event.target.value);
              }}
              value={subject}
            />
          </label>
          <label className="grid gap-1 text-sm" htmlFor={bodyId}>
            <span className="font-medium">Body</span>
            <Textarea
              className="min-h-64"
              disabled={alreadySent || sending}
              id={bodyId}
              onChange={(event) => {
                onBodyChange(event.target.value);
              }}
              value={body}
            />
          </label>
          {error === undefined ? null : (
            <Alert variant="destructive">
              <AlertTitle>Email not sent</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {sentLabel === undefined ? null : (
            <Alert data-testid="maya-email-sent-status">
              <AlertTitle>Email sent</AlertTitle>
              <AlertDescription className="grid gap-3">
                <span data-testid="maya-email-sent-label">{sentLabel}</span>
                <Button
                  className="w-fit"
                  data-testid="maya-email-check-delivery-status"
                  disabled={!canCheckDeliveryStatus || checkingDeliveryStatus}
                  onClick={onCheckDeliveryStatus}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RefreshCwIcon data-icon="inline-start" />
                  {checkingDeliveryStatus ? "Checking delivery status" : "Check delivery status"}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {deliveryStatusError === undefined ? null : (
            <Alert variant="destructive">
              <AlertTitle>Email status unavailable</AlertTitle>
              <AlertDescription>{deliveryStatusError}</AlertDescription>
            </Alert>
          )}
          {deliveryStatus === undefined ? null : (
            <Alert data-testid="maya-email-delivery-status">
              <AlertTitle>Delivery status</AlertTitle>
              <AlertDescription>
                <dl className="grid gap-1 text-sm">
                  <DeliveryFact label="Provider event" value={deliveryStatus.status ?? deliveryStatus.lastEvent ?? "Pending"} />
                  <DeliveryFact label="Provider ID" value={deliveryStatus.providerEmailId} />
                  <DeliveryFact
                    label="Body check"
                    value={deliveryStatus.providerBodyHashVerified === true ? "Provider body hash matched approved draft" : undefined}
                  />
                  <DeliveryFact label="Text hash" value={shortHash(deliveryStatus.bodyTextHash)} />
                  <DeliveryFact label="HTML hash" value={shortHash(deliveryStatus.bodyHtmlHash)} />
                  <DeliveryFact label="Action" value={deliveryStatus.actionId} />
                  <DeliveryFact label="Line" value={deliveryStatus.lineId} />
                  <DeliveryFact label="Recipient group" value={deliveryStatus.recipientGroup === "billing" ? "Billing" : "Recovery"} />
                  <DeliveryFact label="Created" value={deliveryStatus.createdAt} />
                  <DeliveryFact label="Subject" value={deliveryStatus.subject} />
                </dl>
              </AlertDescription>
            </Alert>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={sending}>Close</AlertDialogCancel>
          <Button
            data-testid="maya-email-send"
            disabled={alreadySent || sending || subject.trim().length === 0 || body.trim().length === 0}
            onClick={onSend}
            type="button"
          >
            <SendIcon data-icon="inline-start" />
            {alreadySent ? "Sent" : sending ? "Sending" : "Send"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function shortHash(value: string | undefined): string | undefined {
  return value === undefined || value.length < 12 ? undefined : value.slice(0, 12);
}

function DeliveryFact({ label, value }: { label: string; value: string | undefined }) {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2" data-testid="maya-email-delivery-fact">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{value}</dd>
    </div>
  );
}
