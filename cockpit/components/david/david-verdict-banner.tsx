"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CreditRiskAccountModel } from "../../app/cockpit-data.ts";
import { DavidCollapsibleCard } from "./david-collapsible-card.tsx";
import { DavidRecordDisclosure } from "./david-record-disclosure.tsx";
import { davidBadgeVariantByTone, davidBorderClassByTone, davidMutedSurfaceClassByTone } from "./david-verdict-tokens.ts";

export function DavidVerdictBanner({ account }: Readonly<{ account: CreditRiskAccountModel }>) {
  return (
    <DavidCollapsibleCard
      badges={
        <>
          <Badge variant={davidBadgeVariantByTone[account.verdictTone]}>{account.verdict}</Badge>
          <Badge variant="outline">{account.routeLabel}</Badge>
        </>
      }
      className={cn(davidBorderClassByTone[account.verdictTone], davidMutedSurfaceClassByTone[account.verdictTone])}
      defaultOpen={false}
      description={account.routeLine}
      testId="david-verdict-banner"
      title={account.leadLabel}
    >
      <div className="grid gap-1">
        <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Deterministic basis</span>
        <p className="text-sm">{account.verdictBasis}</p>
      </div>
      <DavidRecordDisclosure items={account.recordIds} label={`${account.recordIds.length.toString()} records behind this verdict`} />
    </DavidCollapsibleCard>
  );
}
