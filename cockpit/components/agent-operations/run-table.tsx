"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AgentOperationsRunRow } from "./types.ts";

/**
 * Live agent run table.
 *
 * Presentation only. State, phase and blocked-ness are decided by the backend
 * read model from the durable event log; nothing here derives status from
 * anything else, and no value is recomputed.
 */

interface RunTableProps {
  runs: AgentOperationsRunRow[];
  selectedRunId?: string | undefined;
  onSelectRun?: ((runId: string) => void) | undefined;
}

function stateVariant(row: AgentOperationsRunRow): "default" | "secondary" | "destructive" {
  if (row.blocked) return "destructive";
  if (row.state === "Ready" || row.state === "Completed") return "default";
  return "secondary";
}

export function RunTable({ runs, selectedRunId, onSelectRun }: RunTableProps) {
  return (
    <Card data-testid="agent-operations-run-table">
      <CardHeader>
        <CardTitle>Agent runs</CardTitle>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="agent-operations-empty">
            No agent runs yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-4">Run</th>
                  <th className="py-2 pr-4">Specialist</th>
                  <th className="py-2 pr-4">State</th>
                  <th className="py-2 pr-4">Phase</th>
                  <th className="py-2 pr-4">Provenance</th>
                  <th className="py-2">Last event</th>
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
                    <td className="py-2 pr-4 font-mono text-xs">{row.runId}</td>
                    <td className="py-2 pr-4">{row.specialist}</td>
                    <td className="py-2 pr-4">
                      <Badge
                        variant={stateVariant(row)}
                        data-testid={`agent-operations-state-${row.runId}`}
                      >
                        {row.state}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">{row.phase}</td>
                    <td className="py-2 pr-4">
                      {row.provenanceMode === "live" ? (
                        <span data-testid={`agent-operations-provenance-${row.runId}`}>live</span>
                      ) : (
                        <Badge
                          variant="outline"
                          data-testid={`agent-operations-provenance-${row.runId}`}
                        >
                          {row.provenanceMode}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 font-mono text-xs">{row.lastEventType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
