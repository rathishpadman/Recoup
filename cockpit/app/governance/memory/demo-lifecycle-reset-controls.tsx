"use client";

import { useRouter } from "next/navigation.js";
import { useState } from "react";

interface ApprovalAuditReceiptForReset {
  actionId: string;
  auditEntryHash: string;
  decision: string;
  recordIds: string[];
  status: "human_decided";
}

interface DemoLifecycleResetControlsProps {
  approvalAuditReceipts: ApprovalAuditReceiptForReset[];
}

type ResetState =
  | { actionId: string; message: string; status: "failed" | "resetting" | "succeeded" }
  | { actionId?: undefined; message: string; status: "idle" };

export function DemoLifecycleResetControls({ approvalAuditReceipts }: DemoLifecycleResetControlsProps) {
  const router = useRouter();
  const [resetState, setResetState] = useState<ResetState>({
    message: "Demo reset controls are ready for approved lifecycle receipts.",
    status: "idle"
  });

  async function resetApprovalLifecycle(actionId: string): Promise<void> {
    setResetState({ actionId, message: "Resetting demo lifecycle receipt.", status: "resetting" });

    try {
      const response = await fetch("/api/admin/demo-reset", {
        body: JSON.stringify({ actionId }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });

      if (!response.ok) {
        setResetState({
          actionId,
          message: "Reset unavailable from governed backend sources.",
          status: "failed"
        });
        return;
      }

      setResetState({ actionId, message: "Demo lifecycle reset recorded.", status: "succeeded" });
      router.refresh();
    } catch {
      setResetState({
        actionId,
        message: "Reset service unavailable.",
        status: "failed"
      });
    }
  }

  return (
    <section className="governance-rail-section" data-testid="governance-demo-lifecycle-reset">
      <strong>Demo lifecycle reset</strong>
      <span>Reset only persisted approval receipts. Source evidence, SAP reads, and audit reset receipts are preserved.</span>
      {approvalAuditReceipts.length === 0 ? (
        <span>No resettable approval decisions.</span>
      ) : (
        <div className="demo-reset-list">
          {approvalAuditReceipts.map((receipt) => {
            const isResetting = resetState.status === "resetting" && resetState.actionId === receipt.actionId;
            return (
              <div className="demo-reset-row" key={receipt.actionId}>
                <div>
                  <span>{decisionLabel(receipt.decision)} decision</span>
                  <code>{receipt.actionId}</code>
                </div>
                <button
                  aria-label={`Reset demo lifecycle for ${receipt.actionId}`}
                  disabled={isResetting}
                  onClick={() => {
                    void resetApprovalLifecycle(receipt.actionId);
                  }}
                  type="button"
                >
                  {isResetting ? "Resetting" : "Reset"}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <span aria-live="polite" data-reset-state={resetState.status}>
        {resetState.message}
      </span>
    </section>
  );
}

function decisionLabel(decision: string): string {
  if (decision === "approve") {
    return "Approved";
  }

  if (decision === "modify") {
    return "Changes requested";
  }

  if (decision === "reject") {
    return "Rejected";
  }

  return "Human";
}
