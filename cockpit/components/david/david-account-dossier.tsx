"use client";

import { ArrowLeftIcon, CheckCircle2Icon, CircleIcon, LayoutGridIcon, RouteIcon, ScaleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { CreditRiskAccountModel } from "../../app/cockpit-data.ts";
import { DavidActionPacket } from "./david-action-packet.tsx";
import { DavidAssessmentTimeline } from "./david-assessment-timeline.tsx";
import { DavidMeshTiles } from "./david-mesh-tiles.tsx";
import { DavidSignalsIn } from "./david-signals-in.tsx";
import { DavidVerdictBanner } from "./david-verdict-banner.tsx";
import { davidBadgeVariantByTone, davidBorderClassByTone, davidMeterClassByTone } from "./david-verdict-tokens.ts";

interface DavidAccountDossierProps {
  account: CreditRiskAccountModel;
  accounts: CreditRiskAccountModel[];
  onClearSelection: () => void;
  onSelectAccount: (accountId: string) => void;
  onTimelinePlaybackComplete: (accountId: string) => void;
  shouldStreamTimeline: boolean;
}

const dossierSteps = [
  { icon: CircleIcon, key: "account", label: "Account" },
  { icon: LayoutGridIcon, key: "mesh", label: "Risk Mesh" },
  { icon: CheckCircle2Icon, key: "verdict", label: "Verdict" },
  { icon: RouteIcon, key: "packet", label: "Packet" },
  { icon: ScaleIcon, key: "approval", label: "Approval" }
] as const;

export function DavidAccountDossier({
  account,
  accounts,
  onClearSelection,
  onSelectAccount,
  onTimelinePlaybackComplete,
  shouldStreamTimeline
}: Readonly<DavidAccountDossierProps>) {
  return (
    <section className="grid gap-4" data-testid="david-account-dossier">
      <Card className="rounded-lg shadow-[var(--shadow-xs)]">
        <CardContent className="grid gap-4 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button onClick={onClearSelection} size="sm" type="button" variant="outline">
              <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
              All accounts
            </Button>
            <div className="flex flex-wrap gap-2">
              {accounts.map((item) => (
                <Button
                  aria-pressed={item.accountId === account.accountId}
                  key={item.accountId}
                  onClick={() => {
                    onSelectAccount(item.accountId);
                  }}
                  size="sm"
                  type="button"
                  variant={item.accountId === account.accountId ? "secondary" : "outline"}
                >
                  {item.customer}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            {dossierSteps.map((step, index) => {
              const Icon = step.icon;
              const isApprovalStep = step.key === "approval";
              const isDone = !isApprovalStep || account.packet.approvalStatus === "committed";
              const isCurrent = isApprovalStep && account.packet.approvalStatus !== "committed";

              return (
                <div className="grid gap-2 rounded-lg border bg-muted/15 p-3" key={step.key}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{`Step ${String(index + 1)}`}</span>
                    <span className={cn("inline-flex size-8 items-center justify-center rounded-full border", isCurrent ? "border-primary/30 bg-primary/10 text-primary" : isDone ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border bg-background text-muted-foreground")}>
                      <Icon aria-hidden="true" className="size-4" data-icon="dossier-step" />
                    </span>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-sm font-medium">{step.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {isApprovalStep ? (account.packet.approvalStatus === "committed" ? "Committed" : "Awaiting review") : "Ready"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg shadow-[var(--shadow-xs)]">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{account.accountId}</Badge>
                <Badge variant="outline">{account.channel}</Badge>
                <Badge variant={davidBadgeVariantByTone[account.verdictTone]}>{account.verdict}</Badge>
                {account.gamingFlag ? <Badge variant="destructive">Flag [D]</Badge> : null}
              </div>
              <div className="grid gap-1">
                <CardTitle className="text-2xl">{account.customer}</CardTitle>
                <p className="text-sm text-muted-foreground">{account.segment}</p>
              </div>
            </div>
            <div className={cn("grid min-w-[18rem] gap-2 rounded-lg border p-4", davidBorderClassByTone[account.verdictTone])}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">{`${account.exposureLabel} exposure`}</span>
                <span className="text-muted-foreground">{`${account.creditLimitLabel} limit`}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", davidMeterClassByTone[account.verdictTone])}
                  style={{ width: `${Math.max(8, Math.min(account.utilisationPercent, 100)).toString()}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>{account.utilisationLabel} utilised</span>
                <span>{account.routeLabel}</span>
              </div>
            </div>
          </div>
          <Separator />
          <div className="grid gap-3 md:grid-cols-4">
            {account.facts.map((fact) => (
              <div className="grid gap-1 rounded-md border bg-background/80 p-3" key={fact.key}>
                <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{fact.label}</span>
                <strong className="text-base">{fact.valueLabel}</strong>
              </div>
            ))}
          </div>
        </CardHeader>
      </Card>

      <DavidAssessmentTimeline
        account={account}
        onPlaybackComplete={onTimelinePlaybackComplete}
        shouldStream={shouldStreamTimeline}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <DavidSignalsIn account={account} />
        <DavidMeshTiles account={account} />
      </div>

      <DavidVerdictBanner account={account} />

      <DavidActionPacket account={account} />
    </section>
  );
}
