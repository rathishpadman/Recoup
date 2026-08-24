"use client";

import { ArrowRightIcon } from "lucide-react";

import { CollapsiblePanel } from "./collapsible-panel.tsx";
import type { AgentHandoffEdge } from "./types.ts";

/**
 * Handoff graph.
 *
 * FR-OPS-05: an edge is emphasized only after the corresponding durable handoff
 * event exists. That decision belongs to the backend and arrives on the edge;
 * this component reads it and never infers a handoff from a run's status, which
 * would draw work as passed on before anything recorded that it was.
 *
 * Every edge is drawn either way, so the shape of the pipeline stays legible
 * when nothing has happened yet.
 */

interface HandoffGraphProps {
  handoffs: AgentHandoffEdge[];
}

export function HandoffGraph({ handoffs }: HandoffGraphProps) {
  return (
    <CollapsiblePanel testId="agent-operations-handoff-graph" title="Handoffs">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
          {handoffs.map((edge, index) => (
            <li key={`${edge.from}-${edge.to}`} className="flex items-center gap-2">
              {index === 0 ? <Node label={edge.from} active={edge.emphasized} /> : null}
              <ArrowRightIcon
                className={edge.emphasized ? "text-foreground size-4" : "text-muted-foreground/40 size-4"}
                aria-label={edge.emphasized ? "handed off to" : "not handed off to"}
                data-testid={`handoff-edge-${edge.from}-${edge.to}`}
                data-emphasized={edge.emphasized ? "true" : "false"}
              />
              <Node label={edge.to} active={edge.emphasized} />
            </li>
          ))}
      </ol>
    </CollapsiblePanel>
  );
}

function Node({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={
        active
          ? "border-foreground/30 bg-muted rounded-md border px-2.5 py-1 text-sm font-medium"
          : "text-muted-foreground rounded-md border border-dashed px-2.5 py-1 text-sm"
      }
    >
      {label}
    </span>
  );
}
