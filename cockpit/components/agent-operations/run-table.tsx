"use client";

import { FileTextIcon } from "lucide-react";
import { readableSpecialist, readableTime } from "./display.ts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { RUNS_EMPTY_MESSAGE, type AgentOperationsRunRow } from "./types.ts";

/**
 * Runs table.
 *
 * Presentation only. Status and blocked-ness are decided by the backend read
 * model from the durable event log; nothing here derives status from a
 * timestamp or recomputes an elapsed time.
 *
 * The empty state names what the workspace is waiting for rather than saying
 * "no data", because an operator seeing an empty table needs to know whether
 * something is broken or nothing has arrived.
 */

interface RunTableProps {
  runs: AgentOperationsRunRow[];
  selectedRunId?: string | undefined;
  onSelectRun?: ((runId: string) => void) | undefined;
}

function statusVariant(row: AgentOperationsRunRow): "default" | "secondary" | "destructive" | "outline" {
  if (row.blocked) return "destructive";
  if (row.status === "Completed" || row.status === "Handed off") return "default";
  return "secondary";
}

const DASH = "—";

export function RunTable({ runs, selectedRunId, onSelectRun }: RunTableProps) {
  return (
    <Card data-testid="agent-operations-run-table">
      <CardHeader>
        <CardTitle className="italic font-normal text-muted-foreground">Runs</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-4 font-normal">Run ID</th>
                <th className="py-2 pr-4 font-normal">Agent</th>
                <th className="py-2 pr-4 font-normal">Scenario</th>
                <th className="py-2 pr-4 font-normal">Customer</th>
                <th className="py-2 pr-4 font-normal">Status</th>
                <th className="py-2 pr-4 font-normal">Queued at</th>
                <th className="py-2 pr-4 font-normal">Started at</th>
                <th className="py-2 pr-4 font-normal">Completed at</th>
                <th className="py-2 font-normal">Elapsed</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((row) => (
                <tr
                  key={row.runId}
                  data-testid={`agent-operations-run-${row.runId}`}
                  onClick={() => onSelectRun?.(row.runId)}
                  className={cn(
                    "cursor-pointer border-t",
                    selectedRunId === row.runId && "bg-muted"
                  )}
                >
                  <td className="py-3 pr-4 font-mono text-xs">{row.runId}</td>
                  <td className="py-3 pr-4">{readableSpecialist(row.agent)}</td>
                  <td className="py-3 pr-4">{row.scenario ?? DASH}</td>
                  <td className="py-3 pr-4">{row.customer ?? DASH}</td>
                  <td className="py-3 pr-4">
                    <Badge
                      variant={statusVariant(row)}
                      data-testid={`agent-operations-state-${row.runId}`}
                    >
                      {row.status}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 tabular-nums">{readableTime(row.queuedAt)}</td>
                  <td className="py-3 pr-4 tabular-nums">{readableTime(row.startedAt)}</td>
                  <td className="py-3 pr-4 tabular-nums">{readableTime(row.completedAt)}</td>
                  <td className="py-3 tabular-nums">{row.elapsed ?? DASH}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {runs.length === 0 ? (
          <div
            className="flex flex-col items-center gap-3 py-16 text-muted-foreground"
            data-testid="agent-operations-empty"
          >
            <FileTextIcon className="size-8" aria-hidden />
            <p className="text-sm">{RUNS_EMPTY_MESSAGE}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
