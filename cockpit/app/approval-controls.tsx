"use client";

import { useState, type ReactNode } from "react";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";

type ApprovalDecision = "approve" | "modify" | "reject";
type ApprovalIntent = ApprovalDecision | "defer";

const decisions: ApprovalIntent[] = ["approve", "modify", "reject", "defer"];
const decisionLabels: Record<ApprovalIntent, string> = {
  approve: "Approve draft",
  modify: "Modify",
  reject: "Reject",
  defer: "Defer"
};
const decisionIcons = {
  approve: <Check size={15} />,
  modify: <PencilSimple size={15} />,
  reject: <X size={15} />,
  defer: <ClockCounterClockwise size={15} />
} satisfies Record<ApprovalIntent, ReactNode>;

export function ApprovalControls({ actionId }: Readonly<{ actionId: string }>) {
  const [activeDecision, setActiveDecision] = useState<ApprovalIntent | undefined>();
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("Awaiting human decision");
  const [submitting, setSubmitting] = useState(false);

  async function submit(decision: ApprovalDecision, decisionReason?: string): Promise<void> {
    setSubmitting(true);
    setStatus(`Submitting ${decision}`);
    try {
      const response = await fetch("/api/approval", {
        body: JSON.stringify({
          actionId,
          decision,
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
      setActiveDecision(undefined);
      setReason("");
      setStatus(`Human decision recorded: ${result.decision}. Audit ${result.auditEntryHash.slice(0, 8)}`);
    } catch {
      setStatus("Approval service unavailable");
    } finally {
      setSubmitting(false);
    }
  }

  function chooseDecision(decision: ApprovalIntent): void {
    if (decision === "approve") {
      void submit(decision);
      return;
    }

    setActiveDecision(decision);
    setStatus("Reason required before this human decision is recorded.");
  }

  function submitReasonedDecision(): void {
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 8) {
      setStatus("Reason required before this human decision is recorded.");
      return;
    }

    if (activeDecision === "defer") {
      setActiveDecision(undefined);
      setReason("");
      setStatus("Decision deferred: reason captured for human follow-up.");
      return;
    }

    if (activeDecision !== undefined) {
      void submit(activeDecision, trimmedReason);
    }
  }

  return (
    <>
      <div className="approval-actions" aria-label="Approval actions">
        {decisions.map((decision) => (
          <button
            disabled={submitting}
            key={decision}
            onClick={() => {
              chooseDecision(decision);
            }}
            type="button"
          >
            {decisionIcons[decision]}
            {decisionLabels[decision]}
          </button>
        ))}
      </div>
      {activeDecision === undefined ? null : (
        <div className="approval-reason-panel">
          <label htmlFor="approval-reason">Reason required for {decisionLabels[activeDecision].toLowerCase()}</label>
          <textarea
            disabled={submitting}
            id="approval-reason"
            onChange={(event) => {
              setReason(event.target.value);
            }}
            placeholder="Capture the human rationale before this decision continues."
            rows={3}
            value={reason}
          />
          <button disabled={submitting} onClick={submitReasonedDecision} type="button">
            Continue with {decisionLabels[activeDecision].toLowerCase()}
          </button>
        </div>
      )}
      <p aria-live="polite" className="approval-status">
        {status}
      </p>
    </>
  );
}
