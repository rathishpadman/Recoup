"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CreditRiskAccountModel } from "../../app/cockpit-data.ts";
import { DavidCollapsibleCard } from "./david-collapsible-card.tsx";
import { CreditRecommendationAcknowledge } from "./credit-recommendation-acknowledge.tsx";
import { DavidRecordDisclosure } from "./david-record-disclosure.tsx";
import { CreditRecommendationFlowStrip } from "../shared/credit-recommendation-flow-strip.tsx";
import { davidBadgeVariantByTone, davidBorderClassByTone, davidMutedSurfaceClassByTone } from "./david-verdict-tokens.ts";

export function DavidSignalsIn({ account }: Readonly<{ account: CreditRiskAccountModel }>) {
  // An approved recommendation used to become just another row in a list; nothing marked it as
  // new, so a closed-loop handoff could sit unread indefinitely.
  const unacknowledgedCount = account.signals.filter(
    (signal) => signal.scenarioId.startsWith("credit-recommendation:") && signal.acknowledgedAt === undefined
  ).length;

  return (
    <DavidCollapsibleCard
      badges={
        <>
          <Badge variant="outline">{`${account.signals.length.toString()} signals`}</Badge>
          {unacknowledgedCount === 0 ? null : (
            <Badge data-testid="david-signals-unacknowledged" variant="review">
              {`${unacknowledgedCount.toString()} awaiting acknowledgement`}
            </Badge>
          )}
        </>
      }
      defaultOpen
      description={
        account.gamingFlag
          ? "Closed-loop signals include the behavioural handoff [D] - a deduction-side gaming flag - and cited deduction scenarios."
          : "Signals stay read-only and route through governed review before any external packet is approved."
      }
      testId="david-signals-in"
      title="Signals in"
    >
      {account.signals.map((signal) => (
        <div
          className={cn(
            "grid gap-3 rounded-lg border p-3",
            davidBorderClassByTone[signal.tone],
            davidMutedSurfaceClassByTone[signal.tone],
            signal.gamingFlag ? "border-destructive/40" : ""
          )}
          key={signal.scenarioId}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{signal.label ?? signal.scenarioId}</Badge>
              <Badge variant={davidBadgeVariantByTone[signal.tone]}>{signal.verdictLabel ?? signal.verdict}</Badge>
              <Badge variant="outline">{signal.meshPosition}</Badge>
              {signal.gamingFlag ? <Badge variant="destructive">Flag [D]</Badge> : null}
            </div>
            <span className="text-sm text-muted-foreground">{signal.routeLabel}</span>
          </div>
          <div className="grid gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{signal.note}</p>
              {signal.amount === undefined ? null : <span className="text-sm tabular-nums">{signal.amount}</span>}
            </div>
            <p className="text-sm text-muted-foreground">{signal.basis}</p>
            {signal.scenarioId.startsWith("credit-recommendation:") ? (
              <div className="grid gap-2">
                <CreditRecommendationFlowStrip acknowledged={signal.acknowledgedAt !== undefined} approved />
                <CreditRecommendationAcknowledge
                  {...(signal.acknowledgedAt === undefined ? {} : { acknowledgedAt: signal.acknowledgedAt })}
                  actionId={signal.scenarioId}
                />
              </div>
            ) : null}
          </div>
          <DavidRecordDisclosure items={signal.recordIds} label={`${signal.recordIds.length.toString()} cited records`} />
        </div>
      ))}
    </DavidCollapsibleCard>
  );
}
