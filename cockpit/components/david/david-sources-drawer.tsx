"use client";

import { DatabaseIcon, FileStackIcon, FolderKanbanIcon, LockKeyholeIcon, RadarIcon, ShieldCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import type { CreditRiskReviewModel } from "../../app/cockpit-data.ts";
import { DavidRecordDisclosure } from "./david-record-disclosure.tsx";

interface DavidSourcesDrawerProps {
  sources: CreditRiskReviewModel["sources"];
}

export function DavidSourcesDrawer({ sources }: Readonly<DavidSourcesDrawerProps>) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <DatabaseIcon aria-hidden="true" data-icon="button-icon" />
          <span>Sources</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-xl" data-testid="david-sources-drawer">
        <SheetHeader className="gap-2">
          <SheetTitle>Sources and provenance</SheetTitle>
          <SheetDescription>Governed connectors, synthetic flags, and external-action posture for this weekly credit review.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 grid gap-4">
          <div className="grid gap-3">
            {sources.connectors.map((connector) => (
              <div className="grid gap-3 rounded-lg border bg-muted/20 p-3" data-testid="david-source-connector" key={connector.connectorKey}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span>{connectorIcon(connector.connectorKey)}</span>
                    <span className="truncate font-medium">{connector.label}</span>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {connector.synthetic ? <Badge variant="outline">synthetic</Badge> : null}
                    <Badge variant="secondary">{connector.checkedAtLabel}</Badge>
                  </div>
                </div>
                <div className="grid gap-1 text-sm">
                  <span className="text-foreground">{connector.statusLabel}</span>
                  <span className="text-muted-foreground">{connector.sourceModeLabel}</span>
                </div>
                <DavidRecordDisclosure items={connector.proofItems} label={`${connector.proofItems.length.toString()} proof checks`} />
                <DavidRecordDisclosure items={connector.recordIds} label={`${connector.recordIds.length.toString()} source record groups`} variant="secondary" />
              </div>
            ))}
          </div>

          <div className="grid gap-3 rounded-lg border bg-background/80 p-3">
            <div className="flex items-center gap-2">
              <LockKeyholeIcon aria-hidden="true" className="size-4" />
              <span className="font-medium">{sources.externalActionsLabel}</span>
            </div>
            <p className="text-sm text-muted-foreground">Every packet remains draft-only until a human approval receipt is committed.</p>
          </div>

          <div className="grid gap-3 rounded-lg border bg-background/80 p-3">
            <div className="flex items-center gap-2">
              <ShieldCheckIcon aria-hidden="true" className="size-4" />
              <span className="font-medium">{sources.auditTrailLabel}</span>
            </div>
            <p className="text-sm text-muted-foreground">Committed approval receipts remain append-only and render back into `/credit`.</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function connectorIcon(connectorKey: CreditRiskReviewModel["sources"]["connectors"][number]["connectorKey"]) {
  switch (connectorKey) {
    case "sap-odata":
      return <DatabaseIcon aria-hidden="true" className="size-4" />;
    case "supabase-tools":
      return <FileStackIcon aria-hidden="true" className="size-4" />;
    case "bureau-payment-history":
      return <RadarIcon aria-hidden="true" className="size-4" />;
    case "contract-tpm":
      return <FolderKanbanIcon aria-hidden="true" className="size-4" />;
  }
}
