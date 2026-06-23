"use client";

import * as React from "react";
import { ShieldCheckIcon } from "lucide-react";
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
import type { MayaApprovalAction, MayaSelectedCase } from "./types.ts";

interface ApprovalGateDialogProps {
  actionId: string;
  actions: MayaApprovalAction[];
  draft: MayaSelectedCase["draft"];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  recordIds: string[];
}

export function ApprovalGateDialog({ actionId, actions, draft, onOpenChange, open, recordIds }: ApprovalGateDialogProps) {
  const reasonTextareaId = React.useId();

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Human approval</AlertDialogTitle>
          <AlertDialogDescription>{draft.statusLabel}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex min-w-0 flex-col gap-4">
          <Alert>
            <AlertTitle>Approval dispatch disabled</AlertTitle>
            <AlertDescription>This review route renders the HITL gate without submitting decisions.</AlertDescription>
          </Alert>
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
              <Textarea defaultValue="" disabled id={reasonTextareaId} />
              <FieldDescription>{draft.basis}</FieldDescription>
            </Field>
          </FieldGroup>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button disabled key={action.decision} type="button" variant="outline">
                <ShieldCheckIcon data-icon="inline-start" />
                {action.label}
              </Button>
            ))}
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
