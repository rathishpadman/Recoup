"use client";

import { useState } from "react";

type ApprovalDecision = "approve" | "modify" | "reject";

const decisions: ApprovalDecision[] = ["approve", "modify", "reject"];
const apiBaseUrl = process.env.NEXT_PUBLIC_RECOUP_API_URL ?? "http://127.0.0.1:4317";

export function ApprovalControls({ actionId }: Readonly<{ actionId: string }>) {
  const [status, setStatus] = useState("Awaiting human decision");

  async function submit(decision: ApprovalDecision): Promise<void> {
    setStatus(`Submitting ${decision}`);
    const response = await fetch(`${apiBaseUrl}/approval`, {
      body: JSON.stringify({
        actionId,
        approverId: "human:maya-lead",
        decision
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });

    if (!response.ok) {
      setStatus("Approval rejected by guardrail");
      return;
    }

    setStatus(`Human decision recorded: ${decision}`);
  }

  return (
    <>
      <div className="approval-actions" aria-label="Approval actions">
        {decisions.map((decision) => (
          <button
            key={decision}
            onClick={() => {
              void submit(decision);
            }}
            type="button"
          >
            {decision}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="approval-status">
        {status}
      </p>
    </>
  );
}
