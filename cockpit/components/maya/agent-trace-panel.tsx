import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MayaEmptyState } from "./maya-empty-state.tsx";
import type { MayaSubAgent, QueryEvidenceResponse } from "./types.ts";

interface AgentTracePanelProps {
  response: QueryEvidenceResponse | undefined;
  subAgents: MayaSubAgent[];
}

export function AgentTracePanel({ response, subAgents }: AgentTracePanelProps) {
  return (
    <Card data-testid="maya-agent-trace">
      <CardHeader>
        <CardTitle>Agent trace</CardTitle>
        <CardDescription>{response?.message}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-3">
        {response !== undefined ? (
          <Alert>
            <AlertTitle>{response.message}</AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap gap-2">
                {response.recordIds.map((recordId) => (
                  <Badge key={recordId} variant="secondary">
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
          <Accordion type="multiple">
            {subAgents.map((agent) => (
              <AccordionItem key={`${agent.name}-${agent.source}`} value={`${agent.name}-${agent.source}`}>
                <AccordionTrigger>{agent.name}</AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-muted-foreground">Query</span>
                      <span>{agent.query}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-muted-foreground">Source</span>
                      <span>{agent.source}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-muted-foreground">Artifact</span>
                      <span>{agent.keyArtifact}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge variant="outline">{agent.statusLabel}</Badge>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-sm text-muted-foreground">{agent.artifacts}</p>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
