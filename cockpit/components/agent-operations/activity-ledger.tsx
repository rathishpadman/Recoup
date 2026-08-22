"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AgentOperationsEvent } from "./types.ts";

/**
 * Append-only activity ledger.
 *
 * Events are rendered in the order the backend produced them and are never
 * reordered, merged or summarised here. Each row shows the safe summary and how
 * many records it cites; the cockpit does not open the records or restate their
 * contents.
 */

interface ActivityLedgerProps {
  events: AgentOperationsEvent[];
  runId?: string | undefined;
}

export function ActivityLedger({ events, runId }: ActivityLedgerProps) {
  const visible = runId === undefined ? events : events.filter((event) => event.runId === runId);

  return (
    <Card data-testid="agent-operations-activity-ledger">
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="activity-ledger-empty">
            No activity recorded.
          </p>
        ) : (
          <ol className="space-y-3">
            {visible.map((event) => (
              <li
                key={event.eventId}
                data-testid={`activity-event-${event.eventId}`}
                className="border-l-2 pl-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{event.eventType}</span>
                  <Badge variant="outline">{event.phase}</Badge>
                  {event.provenanceMode !== "live" ? (
                    <Badge variant="secondary">{event.provenanceMode}</Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm">{event.safeSummary}</p>
                <p className="text-xs text-muted-foreground">
                  cites {event.recordIds.length} record(s) · {event.occurredAt}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
