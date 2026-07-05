"use client";

import { ActivityIcon, CheckCircle2Icon, ChevronDownIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  buildAgentInvestigationTimelineSteps,
  resolveMayaWorklistReason,
  type MayaAgentInvestigationTimelineStep
} from "./maya-workspace-derived.ts";
import { verdictBadgeVariant } from "./verdict-badge-variant.ts";
import type { MayaEvidencePack, MayaWorklistItem, QueryEvidenceResponse } from "./types.ts";

interface AgentInvestigationTimelineProps {
  evidencePack: MayaEvidencePack;
  response?: QueryEvidenceResponse | undefined;
  selectedWorklistItem?: MayaWorklistItem | undefined;
}

export function AgentInvestigationTimeline({
  evidencePack,
  response,
  selectedWorklistItem
}: AgentInvestigationTimelineProps) {
  const steps = buildAgentInvestigationTimelineSteps({
    evidenceDocuments: evidencePack.documents,
    evidenceRecordIds: evidencePack.recordIds,
    ...(selectedWorklistItem === undefined ? {} : { reason: resolveMayaWorklistReason(selectedWorklistItem) }),
    ...(selectedWorklistItem?.recommendedActionLabel === undefined
      ? {}
      : { recommendedActionLabel: selectedWorklistItem.recommendedActionLabel }),
    trace: response?.trace ?? [],
    ...(selectedWorklistItem?.verdict === undefined ? {} : { verdict: selectedWorklistItem.verdict }),
    ...(selectedWorklistItem?.verdictLabel === undefined ? {} : { verdictLabel: selectedWorklistItem.verdictLabel })
  });
  const verdictLabel = selectedWorklistItem?.verdictLabel ?? "Verdict";

  return (
    <Collapsible
      className="rounded-lg border bg-card shadow-[var(--shadow-sm)]"
      data-testid="maya-agent-investigation-drawer"
      defaultOpen={false}
    >
      <CollapsibleTrigger asChild>
        <Button
          className="h-auto w-full justify-between gap-3 px-4 py-3 text-left"
          data-testid="maya-agent-investigation-trigger"
          type="button"
          variant="ghost"
        >
          <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-semibold">
              Agent investigation · {steps.length.toString()} {steps.length === 1 ? "step" : "steps"} · {verdictLabel}
            </span>
            {selectedWorklistItem?.verdictLabel === undefined ? null : (
              <Badge data-verdict={selectedWorklistItem.verdict} variant={verdictBadgeVariant(selectedWorklistItem.verdict)}>
                {selectedWorklistItem.verdictLabel}
              </Badge>
            )}
          </span>
          <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="rounded-none border-0 shadow-none" data-testid="maya-agent-investigation-timeline" size="sm">
          <CardHeader className="flex flex-row items-start justify-between gap-3 border-t">
            <div className="grid min-w-0 gap-1">
              <CardTitle className="text-base">Overnight agent steps</CardTitle>
              <p className="text-sm text-muted-foreground">Verdict path and cited evidence for this case.</p>
            </div>
            <Badge className="shrink-0" variant="outline">
              {evidencePack.documents.length.toString()} documents
            </Badge>
          </CardHeader>
          <CardContent>
            {steps.length === 0 ? (
              <Alert data-testid="maya-agent-investigation-empty">
                <ActivityIcon aria-hidden="true" data-icon="inline-start" />
                <AlertTitle>Investigation steps unavailable</AlertTitle>
                <AlertDescription>
                  {evidencePack.documents.length.toString()} evidence documents and {evidencePack.recordIds.length.toString()} cited records are attached.
                </AlertDescription>
              </Alert>
            ) : (
              <ol className="grid gap-2" data-testid="maya-agent-investigation-step-list">
                {steps.map((step, index) => (
                  <AgentInvestigationStep index={index} key={step.key} step={step} />
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AgentInvestigationStep({ index, step }: { index: number; step: MayaAgentInvestigationTimelineStep }) {
  return (
    <li
      className="grid gap-3 rounded-lg border bg-background p-3 shadow-none sm:grid-cols-[2rem_minmax(0,1fr)]"
      data-agent-name={step.agentName}
      data-phase={step.phase}
      data-record-count={step.citationRecordIds.length}
      data-source-label={step.sourceLabel}
      data-testid="maya-agent-investigation-step"
      data-tool-name={step.toolLabel}
      data-verdict={step.verdict}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-8 items-center justify-center rounded-md border text-xs font-semibold",
          step.isFinal ? "border-[color:var(--border-strong)] bg-muted text-foreground" : "bg-muted"
        )}
      >
        {step.isFinal ? <CheckCircle2Icon aria-hidden="true" className="size-4" /> : initialsFromAgent(step.agentName, index)}
      </span>
      <div className="grid min-w-0 gap-2">
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="truncate font-medium" title={step.agentName}>
              {step.agentName}
            </div>
            <div className="text-xs text-muted-foreground">
              {step.sourceLabel}
              {step.toolLabel === undefined ? null : ` · ${step.toolLabel}`}
            </div>
          </div>
          <Badge className="w-fit" variant="secondary">
            {formatTracePhase(step.phase)}
          </Badge>
        </div>
        <div className="text-sm font-medium" data-testid="maya-agent-investigation-did-line">
          {step.didLine}
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label={`${step.agentName} cited evidence`}>
          {step.citationRecordChips.length === 0 ? (
            <Badge variant="outline">Citations in trace details</Badge>
          ) : (
            <>
              {step.citationRecordChips.slice(0, 3).map((chip) => (
                <Badge
                  className="max-w-full truncate"
                  data-testid="maya-agent-investigation-record-chip"
                  key={`${step.key}-${chip.recordId}`}
                  variant="outline"
                >
                  {chip.label}
                </Badge>
              ))}
              {step.citationRecordChips.length > 3 ? (
                <Badge data-testid="maya-agent-investigation-record-overflow" variant="outline">
                  +{(step.citationRecordChips.length - 3).toString()} more
                </Badge>
              ) : null}
            </>
          )}
        </div>
        {step.citationRecordIds.length === 0 ? null : (
          <Collapsible className="rounded-md border bg-muted/20" data-testid="maya-agent-investigation-record-disclosure">
            <CollapsibleTrigger asChild>
              <Button className="h-auto w-fit gap-2 px-2 py-1 text-xs" type="button" variant="ghost">
                Citation details
                <ChevronDownIcon aria-hidden="true" className="size-3" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t p-2">
              <div className="flex flex-wrap gap-1.5" aria-label={`${step.agentName} raw citation records`}>
                {step.citationRecordIds.map((recordId) => (
                  <Badge className="max-w-full truncate" key={`${step.key}-raw-${recordId}`} title={recordId} variant="secondary">
                    {recordId}
                  </Badge>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            step.isFinal ? "border-[color:var(--border-strong)] bg-muted/60" : "bg-muted/40"
          )}
        >
          {step.isFinal && step.verdictLabel !== undefined ? (
            <div className="mb-1">
              <Badge data-verdict={step.verdict} variant={verdictBadgeVariant(step.verdict)}>
                VERDICT: {step.verdictLabel}
              </Badge>
            </div>
          ) : null}
          <span data-testid={step.isFinal ? "maya-agent-investigation-final-finding" : "maya-agent-investigation-finding"}>
            {step.foundLine}
          </span>
        </div>
      </div>
    </li>
  );
}

function initialsFromAgent(agentName: string, index: number): string {
  const initials = agentName
    .split(/\s+/u)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("")
    .slice(0, 2);

  return initials.length > 0 ? initials : (index + 1).toString();
}

function formatTracePhase(phase: string): string {
  return phase.slice(0, 1).toUpperCase() + phase.slice(1).replace(/_/gu, " ");
}
