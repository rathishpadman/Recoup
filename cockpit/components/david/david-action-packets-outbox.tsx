"use client";

import { ArrowRightIcon, CheckCircle2Icon, LockKeyholeIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CreditRiskAccountModel } from "../../app/cockpit-data.ts";
import { DavidRecordDisclosure } from "./david-record-disclosure.tsx";
import { davidBadgeVariantByTone } from "./david-verdict-tokens.ts";

interface DavidActionPacketsOutboxProps {
  accounts: CreditRiskAccountModel[];
  onOpenAccount: (accountId: string) => void;
}

export function DavidActionPacketsOutbox({ accounts, onOpenAccount }: Readonly<DavidActionPacketsOutboxProps>) {
  const approvedPackets = accounts.filter((account) => account.packet.approvalStatus === "committed");

  return (
    <section className="grid gap-4" data-testid="david-action-packets-outbox">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold leading-tight">Action packets</h1>
        <p className="text-sm text-muted-foreground">Committed governed packets render here after the backend approval receipt is written.</p>
      </header>

      {approvedPackets.length === 0 ? (
        <Card className="rounded-lg border-dashed shadow-none">
          <CardContent className="py-10 text-sm text-muted-foreground" data-testid="david-action-packets-empty-state">
            No committed action packets are available yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {approvedPackets.map((account) => (
            <Card className="rounded-lg shadow-[var(--shadow-xs)]" data-testid="david-action-packet-row" key={account.accountId}>
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">{account.customer}</CardTitle>
                      <Badge variant={davidBadgeVariantByTone[account.verdictTone]}>{account.verdict}</Badge>
                      <Badge variant="secondary">{account.packet.routeLabel}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{account.packet.detail}</p>
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
                <div className="flex flex-wrap items-center gap-2">
                  <CheckCircle2Icon aria-hidden="true" className="size-4 text-emerald-600 dark:text-emerald-300" />
                  <span className="font-medium">{account.packet.title}</span>
                </div>
                <p className="text-sm text-muted-foreground">{account.packet.basis}</p>
                <div className="grid gap-2 rounded-md border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="flex items-center gap-2">
                    <LockKeyholeIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                    <div className="grid gap-0.5">
                      <span className="text-sm font-medium">External send remains gated</span>
                      <span className="text-xs text-muted-foreground">Approval receipt is committed; packet dispatch is still draft-only.</span>
                    </div>
                  </div>
                  <Badge variant="outline">Not sent</Badge>
                </div>
                <DavidRecordDisclosure items={account.packet.recordIds} label={`${account.packet.recordIds.length.toString()} cited packet records`} variant="secondary" />
                <div className="grid gap-1">
                  <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Audit hash</span>
                  <code className="break-all rounded-md border bg-muted/20 px-2 py-1 text-xs">{account.packet.auditEntryHash}</code>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
