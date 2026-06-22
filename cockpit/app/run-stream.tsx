"use client";

import { useEffect, useState } from "react";

const apiBaseUrl = process.env.NEXT_PUBLIC_RECOUP_API_URL ?? "http://127.0.0.1:4317";
const streamEventTypes = ["status", "finding", "verdict"] as const;

interface StreamEvent {
  type: string;
  payload: {
    kind?: string;
  };
}

export function RunStream() {
  const [events, setEvents] = useState<StreamEvent[]>([]);

  useEffect(() => {
    const source = new EventSource(`${apiBaseUrl}/run`);
    const append = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as StreamEvent;
      setEvents((current) => [...current, event].slice(0, 9));
    };

    for (const type of streamEventTypes) {
      source.addEventListener(type, append);
    }

    return () => {
      source.close();
    };
  }, []);

  const visibleEvents = events.length > 0 ? events : [{ type: "status", payload: { kind: "connecting" } }];

  return (
    <ol className="run-event-list" aria-label="Live trace event feed">
      {visibleEvents.map((event, index) => (
        <li key={`${event.type}-${String(index)}`}>
          <span>{eventTypeLabel(event)}</span>
          <code>{eventStatusLabel(event)}</code>
        </li>
      ))}
    </ol>
  );
}

function eventTypeLabel(event: StreamEvent): string {
  if (event.type === "finding") {
    return "Recovery activity";
  }

  if (event.type === "verdict") {
    return "Queue updated";
  }

  if (event.payload.kind === "service-tool") {
    return "Source matched";
  }

  if (event.payload.kind === "model-context") {
    return "Case scoped";
  }

  if (event.payload.kind === "model-text-delta") {
    return "Draft prepared";
  }

  if (event.payload.kind === "agent-boundary") {
    return "Reviewer gate";
  }

  return "Recovery activity";
}

function eventStatusLabel(event: StreamEvent): string {
  if (event.type === "status") {
    if (event.payload.kind === "connecting") {
      return "opening run";
    }

    if (event.payload.kind === "service-tool") {
      return "source matched";
    }

    if (event.payload.kind === "model-context") {
      return "case scoped";
    }

    if (event.payload.kind === "model-text-delta") {
      return "draft prepared";
    }

    if (event.payload.kind === "agent-boundary") {
      return "reviewer gate";
    }

    return "run active";
  }

  if (event.type === "finding") {
    return "recovery activity";
  }

  if (event.type === "verdict") {
    return "queue updated";
  }

  return "run active";
}
