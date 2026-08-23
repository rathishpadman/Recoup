"use client";

import { ExternalLinkIcon, LoaderCircleIcon } from "lucide-react";
import { readableTime } from "./display.ts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AgentHealth, AgentRosterRow, AgentStatus } from "./types.ts";

/**
 * Agent roster.
 *
 * A running agent expands to show what it is doing right now, which tool it is
 * using and how long it has been going. That detail is the difference between
 * an operations view and a status light: "Running" alone tells nobody whether
 * to intervene.
 *
 * Every value is backend-formatted. Elapsed times are strings, not durations
 * computed in the browser, so the page cannot drift from the event log.
 */

interface AgentRosterProps {
  rows: AgentRosterRow[];
}

const HEALTH_TONE: Record<AgentHealth, string> = {
  healthy: "bg-emerald-500",
  degraded: "bg-amber-500",
  unavailable: "bg-red-500"
};

function statusVariant(status: AgentStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Blocked") return "destructive";
  if (status === "Running") return "default";
  if (status === "Completed" || status === "Handed off") return "outline";
  return "secondary";
}

const DASH = "—";

export function AgentRoster({ rows }: AgentRosterProps) {
  return (
    <Card data-testid="agent-operations-roster">
      <CardHeader>
        <CardTitle className="italic font-normal text-muted-foreground">Agent roster</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-4 font-normal">Agent</th>
                <th className="py-2 pr-4 font-normal">Status</th>
                <th className="py-2 pr-4 font-normal">Health</th>
                <th className="py-2 pr-4 font-normal">What it does</th>
                <th className="py-2 pr-4 font-normal">Doing now</th>
                <th className="py-2 font-normal">Last run</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <RosterRows key={row.agent} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function RosterRows({ row }: { row: AgentRosterRow }) {
  const running = row.status === "Running";

  return (
    <>
      <tr
        data-testid={`agent-roster-row-${row.agent.replace(/\s+/gu, "-").toLowerCase()}`}
        className={cn("border-t", running && "border-l-2 border-l-teal-600")}
      >
        <td className="py-3 pr-4 font-medium whitespace-nowrap">{row.agent}</td>
        <td className="py-3 pr-4">
          <span className="flex items-center gap-2">
            {running ? (
              <LoaderCircleIcon
                className="size-4 animate-spin text-teal-600"
                data-testid="agent-roster-running-spinner"
                aria-hidden
              />
            ) : null}
            <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
          </span>
        </td>
        <td className="py-3 pr-4">
          <span
            className={cn("inline-block size-2 rounded-full", HEALTH_TONE[row.health])}
            data-testid={`agent-roster-health-${row.health}`}
            aria-label={row.health}
          />
        </td>
        <td className="text-muted-foreground py-3 pr-4">{row.role}</td>
        <td className="py-3 pr-4" data-testid="agent-roster-activity">
          {row.activity}
        </td>
        <td className="py-3 tabular-nums whitespace-nowrap">{readableTime(row.lastRun)}</td>
      </tr>

      {row.currentAction === undefined ? null : (
        <tr className="bg-muted/40" data-testid="agent-roster-current-action">
          <td colSpan={6} className="px-4 py-3">
            <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Current action</dt>
                <dd data-testid="agent-roster-action-label">{row.currentAction.currentAction}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tool</dt>
                <dd data-testid="agent-roster-action-tool">{row.currentAction.tool}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Elapsed</dt>
                <dd className="tabular-nums">{row.currentAction.elapsed}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Trace</dt>
                <dd>
                  {row.currentAction.traceHref === undefined ? (
                    DASH
                  ) : (
                    <a
                      href={row.currentAction.traceHref}
                      data-testid="agent-roster-action-trace"
                      className="inline-flex items-center text-teal-700 underline"
                    >
                      <ExternalLinkIcon className="size-4" aria-label="Open trace" />
                    </a>
                  )}
                </dd>
              </div>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}
