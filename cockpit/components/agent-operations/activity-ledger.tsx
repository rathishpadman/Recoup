"use client";

import { CollapsiblePanel } from "./collapsible-panel.tsx";
import { EmptyPanel } from "./run-detail.tsx";
import { readableClock, readableOutcome, readablePhase, readableSpecialist } from "./display.ts";
import type { AgentOperationsEvent } from "./types.ts";

/**
 * Event ledger.
 *
 * Events are rendered in the order the backend produced them and are never
 * reordered, merged or summarised here. Each row shows the backend-formatted
 * time, the specialist, the phase, the safe summary, the outcome and the cited
 * record IDs, which is what FR-OPS-04 asks for. The cockpit does not open those
 * records or restate their contents.
 */

interface ActivityLedgerProps {
  events: AgentOperationsEvent[];
  runId?: string | undefined;
}

export function ActivityLedger({ events, runId }: ActivityLedgerProps) {
  const visible = runId === undefined ? [] : events.filter((event) => event.runId === runId);

  return (
    <CollapsiblePanel testId="agent-operations-activity-ledger" title="Event ledger">
      {visible.length === 0 ? (
        <EmptyPanel
          testId="activity-ledger-empty"
          hint="Select a run from the table to view its event history."
        />
      ) : (
        /**
         * The rows scroll inside the panel. Left to grow, a run with a dozen
         * events sets the height of the whole page and pushes everything below
         * it out of reach.
         */
        <div className="max-h-96 overflow-y-auto" data-testid="activity-ledger-scroll">
          <table className="w-full text-sm">
            <thead className="bg-card sticky top-0">
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-4 font-normal">Time</th>
                <th className="py-2 pr-4 font-normal">Specialist</th>
                <th className="py-2 pr-4 font-normal">Phase</th>
                <th className="py-2 pr-4 font-normal">Event</th>
                <th className="py-2 pr-4 font-normal">Outcome</th>
                <th className="py-2 font-normal">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((event) => (
                <tr
                  key={event.eventId}
                  data-testid={`activity-event-${event.eventId}`}
                  className="border-t align-top"
                >
                  <td className="py-3 pr-4 tabular-nums whitespace-nowrap">{readableClock(event.time)}</td>
                  <td
                    className="py-3 pr-4 whitespace-nowrap"
                    data-testid={`activity-event-specialist-${event.eventId}`}
                  >
                    {readableSpecialist(event.specialist)}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap" data-testid={`activity-event-phase-${event.eventId}`}>
                    {readablePhase(event.phase)}
                  </td>
                  <td className="py-3 pr-4">{event.event}</td>
                  <td
                    className="py-3 pr-4 whitespace-nowrap"
                    data-testid={`activity-event-outcome-${event.eventId}`}
                  >
                    {readableOutcome(event.outcome)}
                  </td>
                  <td
                    className="py-3 font-mono text-xs break-all"
                    data-testid={`activity-event-records-${event.eventId}`}
                  >
                    {event.recordIds.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CollapsiblePanel>
  );
}
