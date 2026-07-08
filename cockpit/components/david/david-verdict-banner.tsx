"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CreditRiskAccountModel } from "../../app/cockpit-data.ts";
import { davidBadgeVariantByTone, davidBorderClassByTone, davidMutedSurfaceClassByTone } from "./david-verdict-tokens.ts";

export function DavidVerdictBanner({ account }: Readonly<{ account: CreditRiskAccountModel }>) {
  return (
    <Card className={cn("rounded-lg shadow-[var(--shadow-xs)]", davidBorderClassByTone[account.verdictTone], davidMutedSurfaceClassByTone[account.verdictTone])}>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={davidBadgeVariantByTone[account.verdictTone]}>{account.verdict}</Badge>
          <CardTitle className="text-base">{account.leadLabel}</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">{account.routeLine}</p>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1">
          <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Deterministic basis</span>
          <p className="text-sm">{account.verdictBasis}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {account.recordIds.map((recordId) => (
            <Badge key={recordId} variant="outline">
              {recordId}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
