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
              <div className="grid gap-2 rounded-lg border bg-muted/20 p-3" data-testid="david-source-connector" key={connector.connectorKey}>
                <div className="flex flex-wrap items-center gap-2">
                  <span>{connectorIcon(connector.connectorKey)}</span>
                  <span className="font-medium">{connector.label}</span>
                  {connector.synthetic ? <Badge variant="outline">synthetic</Badge> : null}
                </div>
                <p className="text-sm text-muted-foreground">{connector.statusLabel}</p>
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
            <p className="text-sm text-muted-foreground">Committed approval receipts remain append-only and render back into `/credit/v2`.</p>
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
