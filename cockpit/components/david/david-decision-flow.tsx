"use client";

import {
  Building2Icon,
  CheckCircle2Icon,
  CheckSquareIcon,
  CircleCheckBigIcon,
  PackageCheckIcon,
  Share2Icon
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CreditRiskAccountModel } from "../../app/cockpit-data.ts";
import { davidTextClassByTone } from "./david-verdict-tokens.ts";

interface DavidDecisionFlowProps {
  account: CreditRiskAccountModel;
}

type DavidDecisionFlowStep = {
  key: "account" | "risk-mesh" | "verdict" | "packet" | "approval";
  label: string;
  state: "current" | "done" | "pending";
  supportLabel: string;
};

export function DavidDecisionFlow({ account }: Readonly<DavidDecisionFlowProps>) {
  const steps = buildDavidDecisionFlowSteps(account);

  return (
    <section
      aria-label="Decision flow"
      className="grid gap-3 rounded-lg border bg-background/95 px-4 py-4 shadow-[var(--shadow-xs)]"
      data-testid="david-decision-flow"
    >
      <h2 className="text-sm font-semibold uppercase tracking-normal text-muted-foreground">Decision flow</h2>
      <div className="min-w-0 overflow-x-auto pb-1">
        <ol className="grid min-w-[760px] grid-cols-5 gap-0 md:min-w-0">
          {steps.map((step, index) => (
            <li
              className="relative grid min-w-0 justify-items-center gap-2 px-2 text-center"
              data-state={step.state}
              data-testid="david-decision-flow-step"
              key={step.key}
            >
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-[calc(50%+2.25rem)] right-[calc(-50%+2.25rem)] top-8 h-0.5 rounded-full",
                    decisionFlowConnectorClass(step.state, steps[index + 1]?.state)
                  )}
                  data-testid="david-decision-flow-connector"
                />
              ) : null}
              <span className={cn("relative z-10 flex size-16 shrink-0 items-center justify-center rounded-full border-2", decisionFlowCircleClass(step))}>
                <DavidDecisionFlowIcon stepKey={step.key} />
                {step.state === "done" && step.key !== "verdict" ? (
                  <CheckCircle2Icon
                    aria-hidden="true"
                    className="absolute -bottom-0.5 -right-0.5 size-5 rounded-full border border-background bg-background text-success"
                  />
                ) : null}
              </span>
              <span className="max-w-full truncate text-base font-semibold leading-5" title={step.label}>
                {step.label}
              </span>
              <span
                className={cn(
                  "w-full max-w-full truncate text-sm leading-5 text-muted-foreground",
                  step.key === "verdict" && "font-semibold uppercase",
                  step.key === "verdict" && davidTextClassByTone[account.verdictTone]
                )}
                title={step.supportLabel}
              >
                {step.supportLabel}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function buildDavidDecisionFlowSteps(account: CreditRiskAccountModel): DavidDecisionFlowStep[] {
  return [
    {
      key: "account",
      label: "Account",
      state: "done",
      supportLabel: account.customer
    },
    {
      key: "risk-mesh",
      label: "Risk Mesh assesses",
      state: "done",
      supportLabel: `${account.assessmentSteps.length.toString()} agents done`
    },
    {
      key: "verdict",
      label: "Risk verdict",
      state: "done",
      supportLabel: account.verdict
    },
    {
      key: "packet",
      label: "Action packet",
      state: "done",
      supportLabel: account.routeLabel
    },
    {
      key: "approval",
      label: "Your approval",
      state: account.packet.approvalStatus === "committed" ? "done" : "current",
      supportLabel: account.packet.approvalStatus === "committed" ? "committed" : "pending"
    }
  ];
}

function DavidDecisionFlowIcon({ stepKey }: { stepKey: DavidDecisionFlowStep["key"] }) {
  if (stepKey === "account") {
    return <Building2Icon aria-hidden="true" className="size-7" />;
  }
  if (stepKey === "risk-mesh") {
    return <Share2Icon aria-hidden="true" className="size-7" />;
  }
  if (stepKey === "verdict") {
    return <CircleCheckBigIcon aria-hidden="true" className="size-7" />;
  }
  if (stepKey === "packet") {
    return <PackageCheckIcon aria-hidden="true" className="size-7" />;
  }

  return <CheckSquareIcon aria-hidden="true" className="size-7" />;
}

function decisionFlowCircleClass(step: DavidDecisionFlowStep): string {
  if (step.state === "pending") {
    return "border-border bg-background text-muted-foreground";
  }
  if (step.state === "current") {
    return "border-[color:var(--maya-accent-strong)] bg-[color:var(--maya-accent-surface)] text-[color:var(--maya-accent-strong)] shadow-[var(--shadow-sm)]";
  }

  return "border-[color:var(--maya-accent-strong)] bg-[color:var(--maya-accent-strong)] text-white";
}

function decisionFlowConnectorClass(
  state: DavidDecisionFlowStep["state"],
  nextState: DavidDecisionFlowStep["state"] | undefined
): string {
  if (state === "pending" || nextState === "pending") {
    return "bg-border";
  }
  if (state === "current" || nextState === "current") {
    return "bg-[color:var(--maya-accent-border)]";
  }

  return "bg-[color:var(--maya-accent-strong)]";
}
