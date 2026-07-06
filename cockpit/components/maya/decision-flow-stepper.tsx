"use client";

import {
  BadgeCheckIcon,
  CheckCircle2Icon,
  CheckSquareIcon,
  FileTextIcon,
  RouteIcon,
  SearchIcon,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { mayaAccent } from "./maya-accent.ts";
import type { MayaDecisionFlowStep } from "./maya-workspace-derived.ts";

export function DecisionFlowStepper({ steps }: { steps: readonly MayaDecisionFlowStep[] }) {
  return (
    <section
      aria-label="Decision flow"
      className="grid min-w-0 gap-4 py-1"
      data-testid="maya-decision-flow-stepper"
    >
      <div className="min-w-0 overflow-x-auto pb-1">
        <ol className="grid min-w-[760px] grid-cols-5 gap-0 md:min-w-0 md:grid-cols-5">
        {steps.map((step, index) => (
          <li
            className="relative grid min-w-0 justify-items-center gap-2 px-2 text-center"
            data-state={step.state}
            data-testid="maya-decision-flow-step"
            key={step.key}
          >
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-[calc(50%+2.25rem)] right-[calc(-50%+2.25rem)] top-8 h-0.5 rounded-full",
                  decisionFlowConnectorClass(step.state, steps[index + 1]?.state)
                )}
                data-testid="maya-decision-flow-connector"
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 flex size-16 shrink-0 items-center justify-center rounded-full border-2",
                decisionFlowCircleClass(step)
              )}
            >
              <DecisionFlowIcon stepKey={step.key} />
              {step.state === "done" && step.key !== "verdict" ? (
                <CheckCircle2Icon
                  aria-hidden="true"
                  className="absolute -right-0.5 -bottom-0.5 size-5 rounded-full border border-background bg-background text-success"
                />
              ) : null}
            </span>
            <div className="grid min-w-0 justify-items-center gap-1">
              <span className={cn("max-w-full truncate text-base font-semibold leading-5", decisionFlowLabelClass(step))} title={step.label}>
                {step.label}
              </span>
              <span
                className={cn(
                  "w-full max-w-full truncate text-sm leading-5 text-muted-foreground",
                  step.key === "verdict" && "font-semibold uppercase",
                  step.key === "verdict" && decisionFlowVerdictTextClass(step.supportLabel)
                )}
                title={step.supportLabel}
              >
                {step.supportLabel}
              </span>
            </div>
          </li>
        ))}
        </ol>
      </div>
    </section>
  );
}

function DecisionFlowIcon({ stepKey }: { stepKey: MayaDecisionFlowStep["key"] }) {
  const Icon = decisionFlowIcon(stepKey);

  return <Icon aria-hidden="true" className="size-7" />;
}

function decisionFlowIcon(stepKey: MayaDecisionFlowStep["key"]): LucideIcon {
  if (stepKey === "scenario") {
    return FileTextIcon;
  }
  if (stepKey === "agents") {
    return SearchIcon;
  }
  if (stepKey === "verdict") {
    return BadgeCheckIcon;
  }
  if (stepKey === "action") {
    return RouteIcon;
  }

  return CheckSquareIcon;
}

function decisionFlowCircleClass(step: MayaDecisionFlowStep): string {
  if (step.state === "pending") {
    return "border-border bg-background text-muted-foreground";
  }
  if (step.state === "current") {
    return cn("shadow-[var(--shadow-sm)]", mayaAccent.iconBubble);
  }

  return "border-[color:var(--maya-accent-strong)] bg-[color:var(--maya-accent-strong)] text-white";
}

function decisionFlowConnectorClass(
  state: MayaDecisionFlowStep["state"],
  nextState: MayaDecisionFlowStep["state"] | undefined
): string {
  if (state === "pending" || nextState === "pending") {
    return "bg-border";
  }
  if (state === "current" || nextState === "current") {
    return "bg-[color:var(--maya-accent-border)]";
  }

  return "bg-[color:var(--maya-accent-strong)]";
}

function decisionFlowLabelClass(step: MayaDecisionFlowStep): string {
  if (step.state === "pending") {
    return "text-muted-foreground";
  }

  return "text-foreground";
}

function decisionFlowVerdictTextClass(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized.includes("invalid") || normalized.includes("recovery")) {
    return "text-[color:var(--status-danger-text)]";
  }
  if (normalized.includes("partial") || normalized.includes("split")) {
    return "text-[color:var(--status-warning-text)]";
  }
  if (normalized.includes("valid") || normalized.includes("billing")) {
    return "text-success";
  }

  return "text-muted-foreground";
}
