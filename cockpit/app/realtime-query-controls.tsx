"use client";

import { useState } from "react";
import { MicrophoneIcon as Microphone } from "@phosphor-icons/react/dist/csr/Microphone";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/csr/ShieldCheck";

type RealtimeStatus = "idle" | "requesting" | "issued" | "blocked" | "error";

interface RealtimeClientSecretResult {
  auditPolicy?: {
    externalActions: "none";
    recordIds: string[];
    retention: string;
  };
  deterministicBasis?: string;
  model?: string;
  status: "blocked_missing_credentials" | "issued";
  transport?: "webrtc";
}

export function RealtimeQueryControls() {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [message, setMessage] = useState("Credential-gated WebRTC client secret path with audit-only retention.");
  const [auditRetention, setAuditRetention] = useState("Recoup stores no raw audio or uncited transcript for this query.");
  const [recordIds, setRecordIds] = useState(["OPENAI-REALTIME-POLICY"]);

  async function requestRealtimeSession(): Promise<void> {
    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length === 0) {
      setStatus("blocked");
      setMessage("Ask a scoped question before requesting a Realtime session.");
      return;
    }

    setStatus("requesting");
    setMessage("Requesting audit-scoped Realtime session");
    try {
      const response = await fetch("/api/query/realtime-client-secret", {
        body: JSON.stringify({ question: trimmedQuestion }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const result = (await response.json()) as RealtimeClientSecretResult;

      setAuditRetention(result.auditPolicy?.retention ?? auditRetention);
      setRecordIds(result.auditPolicy?.recordIds ?? recordIds);

      if (!response.ok || result.status === "blocked_missing_credentials") {
        setStatus("blocked");
        setMessage("Realtime credentials unavailable. Offline cited answer remains active.");
        return;
      }

      setStatus("issued");
      setMessage(`WebRTC session ready for ${result.model ?? "pinned Realtime model"} with OpenAI-Safety-Identifier bound.`);
    } catch {
      setStatus("error");
      setMessage("Realtime session service unavailable.");
    }
  }

  return (
    <div className={`query-box realtime-card ${status}`} aria-label="Conversational query">
      <div className="query-heading">
        <Microphone size={18} />
        <label htmlFor="recoup-query">Realtime query</label>
        <span>{statusLabel(status)}</span>
      </div>
      <div className="query-input-row">
        <input
          id="recoup-query"
          onChange={(event) => {
            setQuestion(event.target.value);
          }}
          placeholder="Ask about a cited account, deduction, or action"
          value={question}
        />
        <button
          disabled={status === "requesting"}
          onClick={() => {
            void requestRealtimeSession();
          }}
          type="button"
        >
          <PaperPlaneTilt size={15} />
          Request session
        </button>
      </div>
      <p aria-live="polite">{message}</p>
      <div className="query-audit">
        <ShieldCheck size={16} />
        <span>{auditRetention}</span>
      </div>
      <div className="record-strip">
        {recordIds.map((recordId, index) => (
          <code key={`${recordId}-${String(index)}`}>{recordId}</code>
        ))}
      </div>
      <small>External actions: none. OpenAI-Safety-Identifier is applied server-side.</small>
    </div>
  );
}

function statusLabel(status: RealtimeStatus): string {
  if (status === "issued") {
    return "ready";
  }

  if (status === "blocked") {
    return "blocked";
  }

  if (status === "requesting") {
    return "requesting";
  }

  if (status === "error") {
    return "offline";
  }

  return "audit gated";
}
