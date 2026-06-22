"use client";

import { useId, useState, type ReactNode } from "react";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";

type ApprovalDecision = "approve" | "modify" | "reject";
interface ApprovalActionView {
  decision: ApprovalDecision;
  label: string;
  requiresReason: boolean;
}

const decisionIcons = {
  approve: <Check size={15} />,
  modify: <PencilSimple size={15} />,
  reject: <X size={15} />
} satisfies Record<ApprovalDecision, ReactNode>;

const fallbackActions: ApprovalActionView[] = [
  { decision: "approve", label: "Approve draft", requiresReason: false },
  { decision: "modify", label: "Modify", requiresReason: true },
  { decision: "reject", label: "Reject", requiresReason: true }
];

export function ApprovalControls({
  actionId,
  actions = fallbackActions
}: Readonly<{ actionId: string; actions?: ApprovalActionView[] }>) {
  const [activeAction, setActiveAction] = useState<ApprovalActionView | undefined>();
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("Awaiting human decision");
  const [submitting, setSubmitting] = useState(false);
  const reasonTextareaId = `${useId()}-approval-reason`;

  async function submit(action: ApprovalActionView, decisionReason?: string): Promise<void> {
    setSubmitting(true);
    setStatus(`Submitting ${action.label.toLowerCase()}`);
    try {
      const response = await fetch("/api/approval", {
        body: JSON.stringify({
          actionId,
          decision: action.decision,
          ...(decisionReason === undefined ? {} : { reason: decisionReason })
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });

      if (!response.ok) {
        setStatus("Approval rejected by guardrail");
        return;
      }

      const result = (await response.json()) as { auditEntryHash: string; decision: ApprovalDecision };
      setActiveAction(undefined);
      setReason("");
      setStatus(`Human decision recorded: ${action.label}. Audit ${result.auditEntryHash.slice(0, 8)}`);
    } catch {
      setStatus("Approval service unavailable");
    } finally {
      setSubmitting(false);
    }
  }

  function chooseDecision(action: ApprovalActionView): void {
    if (!action.requiresReason) {
      void submit(action);
      return;
    }

    setActiveAction(action);
    setStatus("Reason required before this human decision is recorded.");
  }

  function submitReasonedDecision(): void {
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 8) {
      setStatus("Reason required before this human decision is recorded.");
      return;
    }

    if (activeAction !== undefined) {
      void submit(activeAction, trimmedReason);
    }
  }

  return (
    <>
      <div className="approval-actions" aria-label="Approval actions">
        {actions.map((action) => (
          <button
            disabled={submitting}
            key={action.decision}
            onClick={() => {
              chooseDecision(action);
            }}
            type="button"
          >
            {decisionIcons[action.decision]}
            {action.label}
          </button>
        ))}
      </div>
      {activeAction === undefined ? null : (
        <div className="approval-reason-panel">
          <label htmlFor={reasonTextareaId}>Reason required for {activeAction.label.toLowerCase()}</label>
          <textarea
            disabled={submitting}
            id={reasonTextareaId}
            onChange={(event) => {
              setReason(event.target.value);
            }}
            placeholder="Capture the human rationale before this decision continues."
            rows={3}
            value={reason}
          />
          <button disabled={submitting} onClick={submitReasonedDecision} type="button">
            Continue with {activeAction.label.toLowerCase()}
          </button>
        </div>
      )}
      <p aria-live="polite" className="approval-status">
        {status}
      </p>
    </>
  );
}
