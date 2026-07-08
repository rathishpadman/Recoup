"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ShieldAlertIcon,
  ShieldCheckIcon,
  TimerResetIcon,
  WalletCardsIcon
} from "lucide-react";
import type { CreditRiskReviewModel, CreditRiskVerdictTone } from "../../app/cockpit-data.ts";
import { davidAccent } from "./david-accent.ts";

const queueStatIconByTone: Record<
  CreditRiskVerdictTone,
  typeof ShieldAlertIcon | typeof ShieldCheckIcon | typeof TimerResetIcon | typeof WalletCardsIcon
> = {
  clear: ShieldCheckIcon,
  elevated: TimerResetIcon,
  high: ShieldAlertIcon,
  watch: WalletCardsIcon
};

export function DavidRiskReviewSurface({ model }: Readonly<{ model: CreditRiskReviewModel }>) {
  return (
    <main className={`min-h-svh bg-background text-foreground ${davidAccent.appFrame}`} data-testid="david-risk-review-surface">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6">
        <header className="grid gap-2">
          <p className="text-sm font-medium text-muted-foreground">David credit risk review</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-normal">Credit risk review v2</h1>
            <Badge variant="outline">{model.accounts.length.toString()} accounts</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{model.sourceLabel}</p>
        </header>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Queue summary">
          {model.queueStats.map((stat) => {
            const Icon = queueStatIconByTone[stat.tone];

            return (
              <Card key={stat.key}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                  <Icon className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-semibold">{stat.valueLabel}</p>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(18rem,0.35fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Risk review queue</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {model.accounts.map((account) => (
                <div key={account.accountId} className="grid gap-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{account.customer}</p>
                      <p className="text-sm text-muted-foreground">{account.channel}</p>
                    </div>
                    <Badge variant="outline">{account.verdict}</Badge>
                  </div>
                  <div className="grid gap-1 text-sm text-muted-foreground">
                    <span>{account.exposureLabel} exposure</span>
                    <span>{account.routeLine}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Review snapshot</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                {`${model.accounts.length.toString()} accounts are available for governed review from the weekly credit risk model.`}
              </p>
              <Separator />
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1 rounded-md border p-3">
                  <span className="text-sm font-medium">Portfolio exposure</span>
                  <strong className="text-lg">{model.portfolio.totalExposureLabel}</strong>
                </div>
                <div className="grid gap-1 rounded-md border p-3">
                  <span className="text-sm font-medium">Committed packets</span>
                  <strong className="text-lg">{model.navCounts.actionPackets.toString()}</strong>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
