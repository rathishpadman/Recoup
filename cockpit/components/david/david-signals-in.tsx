"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CreditRiskAccountModel } from "../../app/cockpit-data.ts";
import { davidBadgeVariantByTone, davidBorderClassByTone, davidMutedSurfaceClassByTone } from "./david-verdict-tokens.ts";

export function DavidSignalsIn({ account }: Readonly<{ account: CreditRiskAccountModel }>) {
  return (
    <Card className="rounded-lg shadow-[var(--shadow-xs)]">
      <CardHeader className="gap-1">
        <CardTitle className="text-base">Signals in - from deduction forensics</CardTitle>
        <p className="text-sm text-muted-foreground">
          {account.gamingFlag
            ? "Closed-loop signals include the behavioural handoff [D] and cited deduction scenarios."
            : "Signals stay read-only and route through governed review before any external packet is approved."}
        </p>
      </CardHeader>
      <CardContent className="grid gap-3">
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
            <div className="flex flex-wrap gap-2">
              {signal.recordIds.map((recordId) => (
                <Badge key={recordId} variant="outline">
                  {recordId}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
