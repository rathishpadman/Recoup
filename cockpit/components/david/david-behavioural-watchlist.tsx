"use client";

import { ArrowRightIcon, ListChecksIcon, ShieldAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CreditRiskAccountModel } from "../../app/cockpit-data.ts";
import { DavidRecordDisclosure } from "./david-record-disclosure.tsx";

interface DavidBehaviouralWatchlistProps {
  accounts: CreditRiskAccountModel[];
  onOpenAccount: (accountId: string) => void;
}

export function DavidBehaviouralWatchlist({ accounts, onOpenAccount }: Readonly<DavidBehaviouralWatchlistProps>) {
  const watchlistAccounts = accounts.filter((account) => account.gamingFlag);

  return (
    <section className="grid gap-4" data-testid="david-behavioural-watchlist">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold leading-tight">Behavioural watchlist</h1>
        <p className="text-sm text-muted-foreground">Accounts with a governed gaming flag [D] stay visible here with the cited deduction scenarios that triggered containment review.</p>
      </header>

      <div className="grid gap-3">
        {watchlistAccounts.map((account) => {
          const gamingSignals = account.signals.filter((signal) => signal.gamingFlag);
          const citedRecordIds = [...new Set(gamingSignals.flatMap((signal) => signal.recordIds))];

          return (
            <Card className="rounded-lg shadow-[var(--shadow-xs)]" data-testid="david-watchlist-row" key={account.accountId}>
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">{account.customer}</CardTitle>
                      <Badge variant="destructive">Flag [D]</Badge>
                      <Badge variant="outline">{account.routeLabel}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{account.routeLine}</p>
                  </div>
                  <Button
                    onClick={() => {
                      onOpenAccount(account.accountId);
                    }}
                    type="button"
                    variant="outline"
                  >
                    <ArrowRightIcon aria-hidden="true" data-icon="inline-start" />
                    Open account
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="flex items-center gap-2">
                  <ShieldAlertIcon aria-hidden="true" className="size-4 text-destructive" />
                  <span className="font-medium">{`${gamingSignals.length.toString()} gaming-linked signal${gamingSignals.length === 1 ? "" : "s"}`}</span>
                </div>
                <div className="grid gap-2">
                  {gamingSignals.map((signal) => (
                    <div className="grid gap-2 rounded-md border bg-muted/20 p-3" key={`${account.accountId}-${signal.scenarioId}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{signal.scenarioId}</Badge>
                        <Badge variant="outline">{signal.verdict}</Badge>
                        <span className="text-xs text-muted-foreground">{signal.routeLabel}</span>
                      </div>
                      <p className="text-sm text-foreground">{signal.basis}</p>
                      <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                        <span>{signal.note}</span>
                        <span>{`${signal.meshPosition} handoff . ${signal.feedsMesh}`}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background/70 p-3 text-sm">
                  <ListChecksIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                  <span className="font-medium">Containment review handoff</span>
                  <span className="text-muted-foreground">No hold or term action leaves the cockpit without human approval.</span>
                </div>
                <DavidRecordDisclosure items={citedRecordIds} label={`${citedRecordIds.length.toString()} watchlist records`} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
