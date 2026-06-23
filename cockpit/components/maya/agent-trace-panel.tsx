import { ActivityIcon, CircleAlertIcon, CircleDashedIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MayaEmptyState } from "./maya-empty-state.tsx";
import type { MayaSubAgent, QueryEvidenceResponse } from "./types.ts";

interface AgentTracePanelProps {
  response: QueryEvidenceResponse | undefined;
  subAgents: MayaSubAgent[];
}

export function AgentTracePanel({ response, subAgents }: AgentTracePanelProps) {
  const isTraceRunning = response?.status === "connecting" || response?.status === "connected";
  const isBlocked = response?.status === "blocked" || response?.status === "blocked_uncited_output";
  const isError = response?.status === "error";

  return (
    <Card data-testid="maya-agent-trace" size="sm">
      <CardHeader>
        <CardTitle>Trace rail</CardTitle>
        <CardDescription>Session-level query state with static read-model evidence context.</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-2.5">
        {isTraceRunning ? (
          <Alert data-testid="maya-trace-running-session">
            <ActivityIcon aria-hidden="true" data-icon="inline-start" />
            <AlertTitle>Realtime evidence session {response.status}</AlertTitle>
            <AlertDescription>
              <div className="flex flex-col gap-2.5">
                <span>{response.message}</span>
                <div className="flex flex-wrap gap-1.5" aria-label="Running trace record IDs">
                  {response.recordIds.map((recordId) => (
                    <Badge key={recordId} variant="secondary">
                      {recordId}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-col gap-2" aria-label="Session-level trace loading">
                  <Skeleton data-testid="maya-trace-running-skeleton" className="h-4 w-full" />
                  <Skeleton data-testid="maya-trace-running-skeleton" className="h-4 w-1/2" />
                </div>
              </div>
            </AlertDescription>
          </Alert>
        ) : isBlocked ? (
          <Alert>
            <CircleAlertIcon aria-hidden="true" data-icon="inline-start" />
            <AlertTitle>{response.message}</AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap gap-1.5">
                {response.recordIds.map((recordId) => (
                  <Badge key={recordId} variant="outline">
                    {recordId}
                  </Badge>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        ) : isError ? (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" data-icon="inline-start" />
            <AlertTitle>Query error</AlertTitle>
            <AlertDescription>{response.message}</AlertDescription>
          </Alert>
        ) : response !== undefined ? (
          <Alert>
            <AlertTitle>{response.message}</AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap gap-1.5">
                {response.recordIds.map((recordId) => (
                  <Badge key={recordId} variant="outline">
                    {recordId}
                  </Badge>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
        {subAgents.length === 0 ? (
          <MayaEmptyState description="The read model returned no trace rows." title="Trace unavailable" />
        ) : (
          <div className="flex min-w-0 flex-col gap-2" data-testid="maya-static-context-table">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">Read-model context rows</span>
              <Badge variant="outline">Static evidence context</Badge>
            </div>
            <Separator />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Context</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Backend label</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subAgents.map((agent) => (
                  <TableRow data-testid="maya-static-context-row" key={traceContextValue(agent)}>
                    <TableCell className="w-[46%] whitespace-normal align-top">
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="font-medium">{agent.name}</span>
                          <Badge variant="outline">Read-model evidence context</Badge>
                        </div>
                        <span className="text-sm text-muted-foreground">{agent.query}</span>
                        <span className="text-sm text-muted-foreground">{agent.artifacts}</span>
                      </div>
                    </TableCell>
                    <TableCell className="w-[30%] whitespace-normal align-top">
                      <div className="flex min-w-0 flex-col gap-1">
                        <span>{agent.source}</span>
                        <span className="text-sm text-muted-foreground">{agent.keyArtifact}</span>
                      </div>
                    </TableCell>
                    <TableCell className="w-[24%] whitespace-normal align-top">
                      <Badge variant="outline">{agent.statusLabel}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Alert>
          <CircleDashedIcon aria-hidden="true" data-icon="inline-start" />
          <AlertTitle>Backend trace-step contract gap</AlertTitle>
          <AlertDescription>
            Per-step progress is unavailable in the current read model; rows above are static evidence context.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

function traceContextValue(agent: MayaSubAgent): string {
  return `${agent.name}-${agent.source}`;
}
