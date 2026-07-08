"use client";

import { ArrowRightIcon, ShieldAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CreditRiskAccountModel } from "../../app/cockpit-data.ts";

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
                <div className="flex flex-wrap gap-2">
                  {citedRecordIds.map((recordId) => (
                    <Badge key={`${account.accountId}-${recordId}`} variant="outline">
                      {recordId}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
