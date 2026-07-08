"use client";

import { ArrowRightIcon, LockKeyholeIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
        <Card className="rounded-lg shadow-[var(--shadow-xs)]">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">Committed packet ledger</CardTitle>
              <Badge variant="secondary">{`${approvedPackets.length.toString()} committed`}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Verdict</TableHead>
                  <TableHead>Packet</TableHead>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Posture</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvedPackets.map((account) => (
                  <TableRow data-testid="david-action-packet-row" key={account.accountId}>
                    <TableCell className="min-w-[12rem]">
                      <div className="grid gap-1">
                        <span className="font-medium">{account.customer}</span>
                        <span className="text-xs text-muted-foreground">{account.accountId}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant={davidBadgeVariantByTone[account.verdictTone]}>{account.verdict}</Badge>
                        <Badge variant="secondary">{account.packet.routeLabel}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[18rem] whitespace-normal">
                      <div className="grid gap-1">
                        <span className="font-medium">{account.packet.title}</span>
                        <span className="text-xs text-muted-foreground">{account.packet.detail}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="rounded-md border bg-muted/20 px-2 py-1 text-xs" title={account.packet.auditEntryHash}>
                        {formatAuditHash(account.packet.auditEntryHash)}
                      </code>
                    </TableCell>
                    <TableCell className="min-w-[12rem] whitespace-normal">
                      <div className="flex items-start gap-2 text-sm">
                        <LockKeyholeIcon aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground" />
                        <span>External send gated</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
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
            {approvedPackets.map((account) => (
              <DavidRecordDisclosure
                items={account.packet.recordIds}
                key={`${account.accountId}-records`}
                label={`${account.customer}: ${account.packet.recordIds.length.toString()} cited packet records`}
                variant="secondary"
              />
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function formatAuditHash(hash: string | undefined): string {
  if (hash === undefined || hash.length <= 24) {
    return hash ?? "receipt pending";
  }

  return `${hash.slice(0, 12)}...${hash.slice(-8)}`;
}
