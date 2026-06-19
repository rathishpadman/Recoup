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
    <ol>
      {visibleEvents.map((event, index) => (
        <li key={`${event.type}-${String(index)}`}>
          <span>{event.type}</span>
          <code>{event.type === "status" ? event.payload.kind : event.type}</code>
        </li>
      ))}
    </ol>
  );
}
