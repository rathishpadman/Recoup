"use client";

import { CheckCircle2Icon, CircleIcon, LoaderCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DavidWalkthroughStripProps {
  displayName: string;
  hasCommittedApproval: boolean;
  hasSelectedAccount: boolean;
}

type WalkthroughState = "active" | "done" | "pending";

function stateIcon(state: WalkthroughState) {
  if (state === "done") {
    return <CheckCircle2Icon aria-hidden="true" className="size-4" data-icon="walkthrough-step" />;
  }

  if (state === "active") {
    return <LoaderCircleIcon aria-hidden="true" className="size-4" data-icon="walkthrough-step" />;
  }

  return <CircleIcon aria-hidden="true" className="size-4" data-icon="walkthrough-step" />;
}

function stateClasses(state: WalkthroughState): string {
  if (state === "done") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  if (state === "active") {
    return "border-primary/25 bg-primary/10 text-primary";
  }

  return "border-border bg-muted/40 text-muted-foreground";
}

export function DavidWalkthroughStrip({
  displayName,
  hasCommittedApproval,
  hasSelectedAccount
}: Readonly<DavidWalkthroughStripProps>) {
  const steps: Array<{ key: string; label: string; state: WalkthroughState }> = [
    { key: "sign-in", label: "Sign in", state: "done" },
    { key: "risk-review", label: "Risk review", state: hasSelectedAccount ? "done" : "active" },
    { key: "risk-mesh", label: "Risk Mesh assesses", state: hasSelectedAccount ? (hasCommittedApproval ? "done" : "active") : "pending" },
    {
      key: "verdict-packet",
      label: "Verdict & action packet",
      state: hasCommittedApproval ? "done" : hasSelectedAccount ? "active" : "pending"
    }
  ];

  return (
    <section className="grid gap-3 rounded-lg border bg-background/95 px-4 py-3" data-testid="david-walkthrough-strip">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Recoup . Prototype</Badge>
          <span className="text-sm text-muted-foreground">{`${displayName} - Director, Credit & Collections`}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {steps.map((step) => (
          <div
            className={cn("inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium", stateClasses(step.state))}
            key={step.key}
          >
            {stateIcon(step.state)}
            <span>{step.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
