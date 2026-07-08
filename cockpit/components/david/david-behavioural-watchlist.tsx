"use client";

import { ArrowRightIcon, ListChecksIcon, ShieldAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CreditRiskAccountModel } from "../../app/cockpit-data.ts";
import { DavidRecordDisclosure } from "./david-record-disclosure.tsx";

interface DavidBehaviouralWatchlistProps {
  accounts: CreditRiskAccountModel[];
  onOpenAccount: (accountId: string) => void;
}

export function DavidBehaviouralWatchlist({ accounts, onOpenAccount }: Readonly<DavidBehaviouralWatchlistProps>) {
  const watchlistAccounts = accounts.filter((account) => account.gamingFlag);
  const watchlistRows = watchlistAccounts.map((account) => {
    const citedSignals = account.signals.filter((signal) => containmentScenarioIds.has(signal.scenarioId));
    const citedRecordIds = [...new Set(citedSignals.flatMap((signal) => signal.recordIds))];
    const handoffLabels = [...new Set(citedSignals.map((signal) => handoffLabel(signal.meshPosition, signal.feedsMesh)))];

    return { account, citedRecordIds, citedSignals, handoffLabels };
  });

  return (
    <section className="grid gap-4" data-testid="david-behavioural-watchlist">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold leading-tight">Behavioural watchlist</h1>
        <p className="text-sm text-muted-foreground">Accounts with a governed gaming flag [D] stay visible here with the cited deduction scenarios that triggered containment review.</p>
      </header>

      <Card className="rounded-lg shadow-[var(--shadow-xs)]">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Containment scenario ledger</CardTitle>
            <Badge variant="secondary">{`${watchlistRows.length.toString()} flagged account${watchlistRows.length === 1 ? "" : "s"}`}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Flag</TableHead>
                <TableHead>Cited scenarios</TableHead>
                <TableHead>Handoff</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {watchlistRows.map(({ account, citedSignals, handoffLabels }) => (
                <TableRow data-testid="david-watchlist-row" key={account.accountId}>
                  <TableCell className="min-w-[13rem] align-top">
                    <div className="grid gap-1">
                      <span className="font-medium">{account.customer}</span>
                      <span className="text-xs text-muted-foreground">{account.routeLine}</span>
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="destructive">Flag [D]</Badge>
                      <Badge variant="outline">{account.routeLabel}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[25rem] whitespace-normal align-top">
                    <div className="grid gap-2">
                      <div className="flex items-center gap-2">
                        <ShieldAlertIcon aria-hidden="true" className="size-4 text-destructive" />
                        <span className="font-medium">{`${citedSignals.length.toString()} cited scenario${citedSignals.length === 1 ? "" : "s"}`}</span>
                      </div>
                      {citedSignals.map((signal) => (
                        <div className="grid gap-1 border-t pt-2 first:border-t-0 first:pt-0" key={`${account.accountId}-${signal.scenarioId}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">{signal.scenarioId}</Badge>
                            <Badge variant="outline">{signal.verdict}</Badge>
                            <span className="text-xs text-muted-foreground">{signal.routeLabel}</span>
                          </div>
                          <p className="text-sm text-foreground">{signal.basis}</p>
                          <span className="text-xs text-muted-foreground">{signal.note}</span>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[12rem] whitespace-normal align-top">
                    <div className="flex items-start gap-2 text-sm">
                      <ListChecksIcon aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground" />
                      <div className="grid gap-1">
                        {handoffLabels.map((label) => (
                          <span key={`${account.accountId}-${label}`}>{label}</span>
                        ))}
                        <span className="text-xs text-muted-foreground">Human approval required before external action.</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <Button
                      onClick={() => {
                        onOpenAccount(account.accountId);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <ArrowRightIcon aria-hidden="true" data-icon="inline-start" />
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {watchlistRows.map(({ account, citedRecordIds }) => (
            <DavidRecordDisclosure
              items={citedRecordIds}
              key={`${account.accountId}-watchlist-records`}
              label={`${account.customer}: ${citedRecordIds.length.toString()} watchlist records`}
            />
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

const containmentScenarioIds = new Set(["S3", "S6"]);

function handoffLabel(meshPosition: string, feedsMesh: string): string {
  return meshPosition === feedsMesh ? `${meshPosition} handoff` : `${meshPosition} -> ${feedsMesh} handoff`;
}
