"use client";

import { useEffect, useRef, useState } from "react";
import { MicrophoneIcon as Microphone } from "@phosphor-icons/react/dist/csr/Microphone";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/dist/csr/PaperPlaneTilt";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import {
  startRealtimeBrowserSession,
  type RealtimeBrowserSession,
  type RealtimeBrowserSessionSnapshot
} from "./realtime-browser-session.ts";

type RealtimeStatus = "idle" | "requesting" | "connecting" | "connected" | "answered" | "blocked" | "ended" | "error";
const auditPolicyRecordIds = ["OPENAI-REALTIME-POLICY"];
const realtimeClientSecretPath = "/api/query/realtime-client-secret";
const realtimeReadyCopy = "WebRTC session ready";

export function RealtimeQueryControls() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef<RealtimeBrowserSession | null>(null);
  const startInFlightRef = useRef(false);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [message, setMessage] = useState("Credential-gated WebRTC client secret path with audit-only retention.");
  const [auditRetention] = useState("Recoup stores no raw audio or uncited transcript for this query.");
  const [recordIds, setRecordIds] = useState(auditPolicyRecordIds);
  const [answer, setAnswer] = useState<string | undefined>(undefined);
  const [deterministicBasis, setDeterministicBasis] = useState<string | undefined>(undefined);

  useEffect(() => {
    return () => {
      sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, []);

  async function requestRealtimeSession(): Promise<void> {
    if (startInFlightRef.current) {
      return;
    }

    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length === 0) {
      setStatus("blocked");
      setMessage("Ask a scoped question before requesting a Realtime session.");
      return;
    }

    startInFlightRef.current = true;
    sessionRef.current?.close();
    sessionRef.current = null;
    setAnswer(undefined);
    setDeterministicBasis(undefined);
    setStatus("requesting");
    setMessage("Requesting audit-scoped Realtime session");
    try {
      const session = await startRealtimeBrowserSession({
        onSnapshot: (snapshot: RealtimeBrowserSessionSnapshot) => {
          setStatus(toControlStatus(snapshot.status));
          setMessage(
            snapshot.status === "connected" && !snapshot.message.includes(realtimeReadyCopy)
              ? `${realtimeReadyCopy}. ${snapshot.message}`
              : snapshot.message
          );
          setRecordIds(snapshot.recordIds);
          if (snapshot.answer !== undefined) {
            setAnswer(snapshot.answer);
          }
          if (snapshot.deterministicBasis !== undefined) {
            setDeterministicBasis(snapshot.deterministicBasis);
          }
        },
        question: trimmedQuestion,
        remoteAudio: audioRef.current
      });
      sessionRef.current = session;
    } catch {
      setStatus("error");
      setMessage("Realtime session service unavailable.");
    } finally {
      startInFlightRef.current = false;
    }
  }

  function endRealtimeSession(): void {
    sessionRef.current?.close();
    sessionRef.current = null;
  }

  return (
    <div
      className={`query-box realtime-card ${status}`}
      aria-label="Conversational query"
      data-secret-route={realtimeClientSecretPath}
    >
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
          disabled={isRealtimeSessionBusy(status)}
          onClick={() => {
            void requestRealtimeSession();
          }}
          type="button"
        >
          <PaperPlaneTilt size={15} />
          Request session
        </button>
        <button
          disabled={sessionRef.current === null}
          onClick={endRealtimeSession}
          type="button"
        >
          End
        </button>
      </div>
      <p aria-live="polite">{message}</p>
      <audio ref={audioRef} aria-hidden="true" />
      <div className="query-audit">
        <ShieldCheck size={16} />
        <span>{auditRetention}</span>
      </div>
      {answer === undefined ? null : (
        <div className="query-answer">
          <strong>Cited answer</strong>
          <p>{answer}</p>
        </div>
      )}
      <div className="record-strip">
        {recordIds.map((recordId, index) => (
          <code key={`${recordId}-${String(index)}`}>{recordId}</code>
        ))}
      </div>
      {deterministicBasis === undefined ? null : <small>{deterministicBasis}</small>}
      <small>External actions: none. OpenAI-Safety-Identifier is applied server-side; blocked uncited output is hidden.</small>
    </div>
  );
}

function statusLabel(status: RealtimeStatus): string {
  if (status === "answered") {
    return "answered";
  }

  if (status === "connected") {
    return "connected";
  }

  if (status === "connecting") {
    return "connecting";
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

  if (status === "ended") {
    return "ended";
  }

  return "audit gated";
}

function toControlStatus(status: RealtimeBrowserSessionSnapshot["status"]): RealtimeStatus {
  if (status === "answered") {
    return "answered";
  }
  if (status === "connected") {
    return "connected";
  }
  if (status === "connecting") {
    return "connecting";
  }
  if (status === "ended") {
    return "ended";
  }
  if (status === "blocked" || status === "blocked_uncited_output") {
    return "blocked";
  }

  return "error";
}

function isRealtimeSessionBusy(status: RealtimeStatus): boolean {
  return status === "requesting" || status === "connecting" || status === "connected";
}
