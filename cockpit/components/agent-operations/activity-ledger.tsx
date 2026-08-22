"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyPanel } from "./run-detail.tsx";
import type { AgentOperationsEvent } from "./types.ts";

/**
 * Event ledger.
 *
 * Events are rendered in the order the backend produced them and are never
 * reordered, merged or summarised here. Each row shows the backend-formatted
 * time and the safe summary; the cockpit does not open the cited records or
 * restate their contents.
 */

interface ActivityLedgerProps {
  events: AgentOperationsEvent[];
  runId?: string | undefined;
}

export function ActivityLedger({ events, runId }: ActivityLedgerProps) {
  const visible = runId === undefined ? [] : events.filter((event) => event.runId === runId);

  return (
    <Card data-testid="agent-operations-activity-ledger">
      <CardHeader>
        <CardTitle>Event ledger</CardTitle>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <EmptyPanel
            testId="activity-ledger-empty"
            hint="Select a run from the table to view its event history."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-4 font-normal">Time</th>
                <th className="py-2 font-normal">Event</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((event) => (
                <tr
                  key={event.eventId}
                  data-testid={`activity-event-${event.eventId}`}
                  className="border-t align-top"
                >
                  <td className="py-3 pr-4 tabular-nums whitespace-nowrap">{event.time}</td>
                  <td className="py-3">{event.event}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
