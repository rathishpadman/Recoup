"use client";

import { ArrowLeftIcon, CheckCircle2Icon, ClipboardCheckIcon, ShieldAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { CreditRiskAccountModel } from "../../app/cockpit-data.ts";
import { DavidActionPacket } from "./david-action-packet.tsx";
import { DavidAssessmentTimeline } from "./david-assessment-timeline.tsx";
import { DavidDecisionFlow } from "./david-decision-flow.tsx";
import { DavidMeshTiles } from "./david-mesh-tiles.tsx";
import { DavidSignalsIn } from "./david-signals-in.tsx";
import { DavidVerdictBanner } from "./david-verdict-banner.tsx";
import {
  davidBadgeVariantByTone,
  davidBorderClassByTone,
  davidMeterClassByTone,
  davidTextClassByTone
} from "./david-verdict-tokens.ts";

interface DavidAccountDossierProps {
  account: CreditRiskAccountModel;
  accounts: CreditRiskAccountModel[];
  onClearSelection: () => void;
  onSelectAccount: (accountId: string) => void;
  onTimelinePlaybackComplete: (accountId: string) => void;
  onTimelineVisibleCountChange: (accountId: string, visibleCount: number) => void;
  shouldStreamTimeline: boolean;
}

export function DavidAccountDossier({
  account,
  accounts,
  onClearSelection,
  onSelectAccount,
  onTimelinePlaybackComplete,
  onTimelineVisibleCountChange,
  shouldStreamTimeline
}: Readonly<DavidAccountDossierProps>) {
  return (
    <section className="grid gap-4" data-testid="david-account-dossier">
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/90 px-3 py-3 shadow-[var(--shadow-xs)]"
        data-testid="david-account-dossier-toolbar"
      >
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

      <DavidDecisionFlow account={account} />

      <DavidWorkflowCommandStrip account={account} />

      <section className="grid gap-4 rounded-lg border bg-background/95 p-4 shadow-[var(--shadow-xs)]" data-testid="david-account-summary">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{account.accountId}</Badge>
              <Badge variant="outline">{account.channel}</Badge>
              <Badge variant={davidBadgeVariantByTone[account.verdictTone]}>{account.verdict}</Badge>
              {account.gamingFlag ? <Badge variant="destructive">Flag [D]</Badge> : null}
            </div>
            <div className="grid gap-1">
              <h2 className="text-2xl font-semibold leading-tight">{account.customer}</h2>
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
        <div className="grid gap-2 md:grid-cols-4">
          {account.facts.map((fact) => (
            <div className="grid min-h-16 gap-1 rounded-md border bg-muted/15 px-3 py-2" key={fact.key}>
              <span className="text-xs font-medium text-muted-foreground">{fact.label}</span>
              <strong className="text-base">{fact.valueLabel}</strong>
            </div>
          ))}
        </div>
      </section>

      <DavidAssessmentTimeline
        account={account}
        onPlaybackComplete={onTimelinePlaybackComplete}
        onVisibleCountChange={(visibleCount) => {
          onTimelineVisibleCountChange(account.accountId, visibleCount);
        }}
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

function DavidWorkflowCommandStrip({ account }: Readonly<{ account: CreditRiskAccountModel }>) {
  const approvalLabel = account.packet.approvalStatus === "committed" ? "Committed" : "Awaiting review";
  const nextAction =
    account.packet.approvalStatus === "committed"
      ? "Approval recorded; external send remains gated"
      : "Review deterministic basis, then approve action packet";
  const verdictLabel = `${account.verdict} risk`;

  return (
    <section
      className={cn(
        "grid gap-4 rounded-lg border px-4 py-4 shadow-[var(--shadow-sm)] lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]",
        davidBorderClassByTone[account.verdictTone]
      )}
      data-priority="primary"
      data-testid="david-workflow-command-strip"
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex size-9 items-center justify-center rounded-md border bg-background/90">
            <ShieldAlertIcon aria-hidden="true" className={cn("size-4", davidTextClassByTone[account.verdictTone])} />
          </span>
          <div className="grid gap-0.5">
            <span className="text-xs font-medium text-muted-foreground">Workflow status</span>
            <strong className="text-lg leading-tight">{`${verdictLabel} / ${account.routeLabel}`}</strong>
          </div>
        </div>
        <p className="max-w-4xl text-sm text-muted-foreground">{account.routeLine}</p>
      </div>

      <div className="grid gap-3 rounded-md border bg-background/80 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {account.packet.approvalStatus === "committed" ? (
              <CheckCircle2Icon aria-hidden="true" className="size-4 text-success" />
            ) : (
              <ClipboardCheckIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            )}
            <span className="text-sm font-semibold">{approvalLabel}</span>
          </div>
          <Badge variant={account.packet.approvalStatus === "committed" ? "secondary" : davidBadgeVariantByTone[account.verdictTone]}>
            {account.packet.routeLabel}
          </Badge>
        </div>
        <div className="grid gap-1">
          <span className="text-xs font-medium text-muted-foreground">Next action</span>
          <span className="text-sm">{nextAction}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md border bg-muted/15 px-2.5 py-2">
            <span className="block text-xs text-muted-foreground">Exposure</span>
            <strong>{account.exposureLabel}</strong>
          </div>
          <div className="rounded-md border bg-muted/15 px-2.5 py-2">
            <span className="block text-xs text-muted-foreground">Utilisation</span>
            <strong>{`${account.utilisationLabel} utilised`}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
