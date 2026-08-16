import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildCreditRecommendationFlow } from "./credit-recommendation-flow.ts";

interface CreditRecommendationFlowStripProps {
  acknowledged: boolean;
  approved: boolean;
}

/**
 * The same strip on both surfaces. Each one previously showed only its own half, so a
 * recommendation that was approved but never reached the credit lead looked complete on one screen
 * and absent on the other.
 */
export function CreditRecommendationFlowStrip({ acknowledged, approved }: CreditRecommendationFlowStripProps) {
  const flow = buildCreditRecommendationFlow({ acknowledged, approved });

  return (
    <div className="grid min-w-0 gap-1" data-testid="credit-recommendation-flow">
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        {flow.steps.map((step, index) => (
          <span className="flex min-w-0 items-center gap-1.5" key={step.label}>
            {index === 0 ? null : <ChevronRightIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />}
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs",
                step.state === "done" ? "text-muted-foreground" : "",
                step.state === "current" ? "font-medium text-foreground" : "",
                step.state === "waiting" ? "text-muted-foreground/70" : ""
              )}
              data-flow-state={step.state}
            >
              {step.state === "done" ? <CheckIcon aria-hidden="true" className="size-3 shrink-0" /> : null}
              {step.label}
            </span>
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{flow.summary}</p>
    </div>
  );
}
