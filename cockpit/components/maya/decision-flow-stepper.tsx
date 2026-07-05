"use client";

import { CheckCircle2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { MayaDecisionFlowStep } from "./maya-workspace-derived.ts";

export function DecisionFlowStepper({ steps }: { steps: readonly MayaDecisionFlowStep[] }) {
  return (
    <Card className="rounded-lg shadow-none" data-testid="maya-decision-flow-stepper" size="sm">
      <CardContent className="grid gap-2 p-3 md:grid-cols-5">
        {steps.map((step, index) => (
          <div
            className={`grid min-w-0 gap-2 rounded-md border p-3 ${decisionFlowStepClass(step.state)}`}
            data-state={step.state}
            data-testid="maya-decision-flow-step"
            key={step.key}
          >
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-semibold">
                {step.state === "done" ? <CheckCircle2Icon aria-hidden="true" className="size-3.5" /> : index + 1}
              </span>
              <Badge variant={step.state === "current" ? "secondary" : "outline"}>{step.state}</Badge>
            </div>
            <div className="grid min-w-0 gap-1">
              <span className="truncate text-sm font-medium" title={step.label}>
                {step.label}
              </span>
              <span className="line-clamp-2 text-xs leading-4 text-muted-foreground" title={step.supportLabel}>
                {step.supportLabel}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function decisionFlowStepClass(state: MayaDecisionFlowStep["state"]): string {
  if (state === "done") {
    return "bg-success-surface/30 border-success-border";
  }
  if (state === "current") {
    return "bg-muted/40 border-ring";
  }

  return "bg-background";
}
