"use client";

import { ArrowRightIcon, ShieldAlertIcon, TimerResetIcon, UsersIcon, WalletCardsIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CreditRiskAccountModel, CreditRiskReviewModel, CreditRiskVerdict } from "../../app/cockpit-data.ts";
import {
  davidBadgeVariantByTone,
  davidBorderClassByTone,
  davidMeterClassByTone,
  davidMutedSurfaceClassByTone,
  davidTextClassByTone
} from "./david-verdict-tokens.ts";

interface DavidAccountQueueProps {
  accounts: CreditRiskAccountModel[];
  filter: "ALL" | CreditRiskVerdict;
  greetingName: string;
  onFilterChange: (filter: "ALL" | CreditRiskVerdict) => void;
  onSelectAccount: (accountId: string) => void;
  queueStats: CreditRiskReviewModel["queueStats"];
  selectedAccountId: string | null;
  sourceLabel: string;
}

const filterOptions: ReadonlyArray<{ label: string; value: "ALL" | CreditRiskVerdict }> = [
  { label: "All", value: "ALL" },
  { label: "High", value: "HIGH" },
  { label: "Elevated", value: "ELEVATED" },
  { label: "Watch", value: "WATCH" },
  { label: "Clear", value: "CLEAR" }
];

function queueStatIcon(key: CreditRiskReviewModel["queueStats"][number]["key"]) {
  if (key === "accounts") {
    return <UsersIcon aria-hidden="true" className="size-4" data-icon="queue-stat" />;
  }

  if (key === "high") {
    return <ShieldAlertIcon aria-hidden="true" className="size-4" data-icon="queue-stat" />;
  }

  if (key === "elevated") {
    return <TimerResetIcon aria-hidden="true" className="size-4" data-icon="queue-stat" />;
  }

  return <WalletCardsIcon aria-hidden="true" className="size-4" data-icon="queue-stat" />;
}

export function DavidAccountQueue({
  accounts,
  filter,
  greetingName,
  onFilterChange,
  onSelectAccount,
  queueStats,
  selectedAccountId,
  sourceLabel
}: Readonly<DavidAccountQueueProps>) {
  return (
    <section className="grid gap-4" data-testid="david-risk-review-queue">
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold leading-tight">{`Good morning, ${greetingName}.`}</h1>
            <p className="text-sm text-muted-foreground">{`${accounts.length.toString()} governed reviews are ready from the weekly credit risk run.`}</p>
          </div>
          <Badge variant="outline">{sourceLabel}</Badge>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {queueStats.map((stat) => (
          <Card className={cn("rounded-lg shadow-[var(--shadow-xs)]", davidBorderClassByTone[stat.tone])} key={stat.key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              <span className={cn("inline-flex size-8 items-center justify-center rounded-md border", davidBorderClassByTone[stat.tone], davidTextClassByTone[stat.tone])}>
                {queueStatIcon(stat.key)}
              </span>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{stat.valueLabel}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {filterOptions.map((option) => (
            <Button
              aria-pressed={filter === option.value}
              className={cn(filter === option.value ? "border-primary/35 bg-primary/10 text-primary" : "")}
              key={option.value}
              onClick={() => {
                onFilterChange(option.value);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {option.label}
            </Button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{`${accounts.length.toString()} account${accounts.length === 1 ? "" : "s"} visible`}</p>
      </div>

      <div className="grid gap-3">
        {accounts.length === 0 ? (
          <Card className="rounded-lg border-dashed shadow-none">
            <CardContent className="py-10 text-sm text-muted-foreground" data-testid="david-queue-empty-state">
              No accounts match the current search or verdict filter.
            </CardContent>
          </Card>
        ) : (
          accounts.map((account) => {
            const isSelected = selectedAccountId === account.accountId;

            return (
              <button
                className={cn(
                  "grid gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-muted/35",
                  davidBorderClassByTone[account.verdictTone],
                  davidMutedSurfaceClassByTone[account.verdictTone],
                  isSelected ? "ring-2 ring-primary/20" : "ring-0"
                )}
                data-account-id={account.accountId}
                data-selected={isSelected}
                data-testid="david-queue-account-row"
                key={account.accountId}
                onClick={() => {
                  onSelectAccount(account.accountId);
                }}
                type="button"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{account.customer}</h2>
                      <Badge variant="outline">{account.channel}</Badge>
                      {account.gamingFlag ? <Badge variant="destructive">Flag [D]</Badge> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">{account.routeLine}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={davidBadgeVariantByTone[account.verdictTone]}>{account.verdict}</Badge>
                    <ArrowRightIcon aria-hidden="true" className="size-4 text-muted-foreground" data-icon="queue-row" />
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <div className="grid gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{`${account.exposureLabel} exposure`}</span>
                      <span className="text-sm text-muted-foreground">{`${account.creditLimitLabel} limit`}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", davidMeterClassByTone[account.verdictTone])}
                        style={{ width: `${Math.max(8, Math.min(account.utilisationPercent, 100)).toString()}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                      <span>{account.utilisationLabel} utilised</span>
                      <span>{account.segment}</span>
                    </div>
                  </div>
                  <dl className="grid gap-2 sm:grid-cols-3">
                    <div className="grid gap-1 rounded-md border bg-background/80 p-3">
                      <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">DSO</dt>
                      <dd className="text-sm font-semibold">{account.dsoLabel}</dd>
                    </div>
                    <div className="grid gap-1 rounded-md border bg-background/80 p-3">
                      <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Disputes</dt>
                      <dd className="text-sm font-semibold">{`${account.openDisputeCount.toString()} / ${account.openDisputeAmountLabel}`}</dd>
                    </div>
                    <div className="grid gap-1 rounded-md border bg-background/80 p-3">
                      <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Unsupported</dt>
                      <dd className="text-sm font-semibold">{account.unsupportedAmountLabel}</dd>
                    </div>
                  </dl>
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
