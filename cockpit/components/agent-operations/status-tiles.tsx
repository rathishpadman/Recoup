"use client";

import { AlertTriangleIcon, ClockIcon, LayoutListIcon, PlayCircleIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AgentOperationsCounts } from "./types.ts";

/**
 * The four counters across the top of the workspace.
 *
 * Counts arrive already computed by the backend read model. Deriving them here
 * from the runs array would let the tiles and the table disagree whenever the
 * table is filtered, which is exactly the confusion an operations view must not
 * introduce.
 */

interface StatusTilesProps {
  counts: AgentOperationsCounts;
}

const TILES = [
  { key: "active", label: "Active", Icon: PlayCircleIcon, tone: "text-teal-600" },
  { key: "queued", label: "Queued", Icon: LayoutListIcon, tone: "text-sky-600" },
  { key: "waiting", label: "Waiting", Icon: ClockIcon, tone: "text-amber-600" },
  {
    key: "needsAttention",
    label: "Needs attention",
    Icon: AlertTriangleIcon,
    tone: "text-red-600"
  }
] as const;

export function StatusTiles({ counts }: StatusTilesProps) {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      data-testid="agent-operations-status-tiles"
    >
      {TILES.map(({ key, label, Icon, tone }) => (
        <Card key={key} data-testid={`agent-operations-tile-${key}`}>
          <CardContent className="flex items-center gap-4 p-5">
            <span className={cn("rounded-lg bg-muted p-2", tone)}>
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="flex flex-col">
              <span className="text-sm text-muted-foreground">{label}</span>
              <span
                className="text-2xl font-semibold tabular-nums"
                data-testid={`agent-operations-count-${key}`}
              >
                {counts[key]}
              </span>
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
