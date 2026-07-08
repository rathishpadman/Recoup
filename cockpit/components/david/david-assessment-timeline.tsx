"use client";

import * as React from "react";
import {
  Building2Icon,
  CheckCircle2Icon,
  DatabaseIcon,
  GavelIcon,
  RadarIcon,
  ShieldAlertIcon,
  SparklesIcon,
  WalletCardsIcon
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CreditRiskAccountModel, CreditRiskAssessmentStep } from "../../app/cockpit-data.ts";
import { DavidRecordDisclosure } from "./david-record-disclosure.tsx";
import { davidBadgeVariantByTone, davidBorderClassByTone, davidMutedSurfaceClassByTone } from "./david-verdict-tokens.ts";

interface DavidAssessmentTimelineProps {
  account: CreditRiskAccountModel;
  onVisibleCountChange?: (visibleCount: number) => void;
  onPlaybackComplete: (accountId: string) => void;
  shouldStream: boolean;
}

const revealDurationMs = 500;

export function DavidAssessmentTimeline({
  account,
  onVisibleCountChange,
  onPlaybackComplete,
  shouldStream
}: Readonly<DavidAssessmentTimelineProps>) {
  const steps = account.assessmentSteps;
  const [visibleCount, setVisibleCount] = React.useState(shouldStream ? 0 : steps.length);

  React.useEffect(() => {
    if (!shouldStream) {
      setVisibleCount(steps.length);
      return;
    }

    if (steps.length === 0) {
      onPlaybackComplete(account.accountId);
      return;
    }

    setVisibleCount(0);
    const stepDelayMs = Math.max(55, Math.floor(revealDurationMs / steps.length));
    const timeoutIds: number[] = [];

    for (let index = 0; index < steps.length; index += 1) {
      const timeoutId = window.setTimeout(() => {
        setVisibleCount(index + 1);
        if (index + 1 === steps.length) {
          onPlaybackComplete(account.accountId);
        }
      }, stepDelayMs * (index + 1));
      timeoutIds.push(timeoutId);
    }

    return () => {
      timeoutIds.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
    };
  }, [account.accountId, onPlaybackComplete, shouldStream, steps]);

  React.useEffect(() => {
    onVisibleCountChange?.(visibleCount);
  }, [onVisibleCountChange, visibleCount]);

  const visibleSteps = steps.slice(0, visibleCount);
  const nextStep = visibleCount < steps.length ? steps[visibleCount] : undefined;
  const isStreaming = shouldStream && visibleCount < steps.length;

  return (
    <Card className="rounded-lg shadow-[var(--shadow-xs)]" data-testid="david-assessment-timeline">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="text-base">Agent assessment</CardTitle>
            <p className="text-sm text-muted-foreground">Overnight trace replay from governed retrievers, rules, and packet drafting.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{`${steps.length.toString()} steps`}</Badge>
            <Badge variant={isStreaming ? "secondary" : "outline"}>{isStreaming ? "Assessing" : "Ready"}</Badge>
          </div>
        </div>
        {nextStep === undefined ? null : (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            Replaying {nextStep.agentName}.
          </div>
        )}
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3" data-testid="david-assessment-step-list">
          {visibleSteps.map((step, index) => (
            <DavidAssessmentStep account={account} index={index} key={step.key} step={step} />
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function DavidAssessmentStep({
  account,
  index,
  step
}: Readonly<{ account: CreditRiskAccountModel; index: number; step: CreditRiskAssessmentStep }>) {
  return (
    <li
      className={cn(
        "grid gap-3 rounded-lg border p-3 md:grid-cols-[2.5rem_minmax(0,1fr)]",
        step.isFinal ? davidBorderClassByTone[account.verdictTone] : "border-border bg-background",
        step.isFinal ? davidMutedSurfaceClassByTone[account.verdictTone] : ""
      )}
      data-agent-name={step.agentName}
      data-step-key={step.key}
      data-testid="david-assessment-step"
      data-tool-label={step.toolLabel}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-md border bg-background/90",
          step.isFinal ? davidBorderClassByTone[account.verdictTone] : "border-border"
        )}
      >
        {step.isFinal ? <CheckCircle2Icon aria-hidden="true" className="size-4" /> : stepIcon(step, index)}
      </span>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-1">
            <div className="font-medium">{step.agentName}</div>
            <div className="text-xs text-muted-foreground">
              {step.sourceLabel}
              {step.toolLabel === undefined ? null : ` · ${step.toolLabel}`}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{`Step ${String(index + 1)}`}</Badge>
            <Badge variant="secondary">Overnight</Badge>
            {step.isFinal && step.verdictLabel !== undefined ? (
              <Badge variant={davidBadgeVariantByTone[account.verdictTone]}>{step.verdictLabel}</Badge>
            ) : null}
          </div>
        </div>
        <div className="rounded-md border bg-background/80 px-3 py-2 text-sm font-medium">{step.didLine}</div>
        <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">{step.foundLine}</div>
        <DavidRecordDisclosure items={step.recordIds} label={`${step.recordIds.length.toString()} trace records`} />
      </div>
    </li>
  );
}

function stepIcon(step: CreditRiskAssessmentStep, index: number) {
  if (step.key.includes(":sap")) {
    return <Building2Icon aria-hidden="true" className="size-4" data-icon="assessment-step" />;
  }

  if (step.key.includes(":supabase")) {
    return <DatabaseIcon aria-hidden="true" className="size-4" data-icon="assessment-step" />;
  }

  if (step.key.includes(":payment-history")) {
    return <RadarIcon aria-hidden="true" className="size-4" data-icon="assessment-step" />;
  }

  if (step.key.includes(":sentinel")) {
    return <SparklesIcon aria-hidden="true" className="size-4" data-icon="assessment-step" />;
  }

  if (step.key.includes(":risk-mesh")) {
    return <WalletCardsIcon aria-hidden="true" className="size-4" data-icon="assessment-step" />;
  }

  if (step.key.includes(":containment")) {
    return <ShieldAlertIcon aria-hidden="true" className="size-4" data-icon="assessment-step" />;
  }

  if (step.key.includes(":decision")) {
    return <GavelIcon aria-hidden="true" className="size-4" data-icon="assessment-step" />;
  }

  return <span className="text-xs font-semibold">{String(index + 1)}</span>;
}
