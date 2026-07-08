"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CreditRiskAccountModel } from "../../app/cockpit-data.ts";
import { DavidCollapsibleCard } from "./david-collapsible-card.tsx";
import { DavidRecordDisclosure } from "./david-record-disclosure.tsx";
import { davidBadgeVariantByTone, davidBorderClassByTone, davidMutedSurfaceClassByTone } from "./david-verdict-tokens.ts";

export function DavidSignalsIn({ account }: Readonly<{ account: CreditRiskAccountModel }>) {
  return (
    <DavidCollapsibleCard
      badges={<Badge variant="outline">{`${account.signals.length.toString()} signals`}</Badge>}
      defaultOpen={false}
      description={
        account.gamingFlag
          ? "Closed-loop signals include the behavioural handoff [D] and cited deduction scenarios."
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
              <Badge variant="outline">{signal.scenarioId}</Badge>
              <Badge variant={davidBadgeVariantByTone[signal.tone]}>{signal.verdict}</Badge>
              <Badge variant="outline">{signal.meshPosition}</Badge>
              {signal.gamingFlag ? <Badge variant="destructive">Flag [D]</Badge> : null}
            </div>
            <span className="text-sm text-muted-foreground">{signal.routeLabel}</span>
          </div>
          <div className="grid gap-1">
            <p className="text-sm font-medium">{signal.note}</p>
            <p className="text-sm text-muted-foreground">{signal.basis}</p>
          </div>
          <DavidRecordDisclosure items={signal.recordIds} label={`${signal.recordIds.length.toString()} cited records`} />
        </div>
      ))}
    </DavidCollapsibleCard>
  );
}
