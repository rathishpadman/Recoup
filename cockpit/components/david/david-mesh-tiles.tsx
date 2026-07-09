"use client";

import { AlertTriangleIcon, Building2Icon, FileWarningIcon, ShieldAlertIcon, TruckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CreditRiskAccountModel, CreditRiskMeshPosition } from "../../app/cockpit-data.ts";
import { DavidRecordDisclosure } from "./david-record-disclosure.tsx";
import {
  davidBadgeVariantByTone,
  davidBorderClassByTone,
  davidMutedSurfaceClassByTone,
  davidTextClassByTone
} from "./david-verdict-tokens.ts";

function meshIcon(position: CreditRiskMeshPosition) {
  if (position === "Credit") {
    return <Building2Icon aria-hidden="true" className="size-4" data-icon="mesh-tile" />;
  }

  if (position === "Fulfilment") {
    return <TruckIcon aria-hidden="true" className="size-4" data-icon="mesh-tile" />;
  }

  if (position === "Billing") {
    return <FileWarningIcon aria-hidden="true" className="size-4" data-icon="mesh-tile" />;
  }

  return <ShieldAlertIcon aria-hidden="true" className="size-4" data-icon="mesh-tile" />;
}

export function DavidMeshTiles({ account }: Readonly<{ account: CreditRiskAccountModel }>) {
  return (
    <section className="grid gap-3 md:grid-cols-2" data-testid="david-mesh-tiles">
      {account.meshPositions.map((position) => (
        <Card
          className={cn("rounded-lg shadow-[var(--shadow-xs)]", davidBorderClassByTone[position.statusTone], davidMutedSurfaceClassByTone[position.statusTone])}
          key={position.position}
        >
          <CardHeader className="gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={cn("inline-flex size-9 items-center justify-center rounded-md border bg-background/90", davidBorderClassByTone[position.statusTone], davidTextClassByTone[position.statusTone])}>
                  {meshIcon(position.position)}
                </span>
                <CardTitle className="text-base">{position.position}</CardTitle>
              </div>
              <Badge variant={davidBadgeVariantByTone[position.statusTone]}>{position.status}</Badge>
            </div>
            <div className="grid gap-1">
              <p className="text-sm font-medium">{position.keyMetric}</p>
              <p className="text-sm text-muted-foreground">{position.interpretation}</p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-1">
              <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Driver signals</span>
              <span className="text-sm">{position.driverSignals}</span>
            </div>
            {position.contractGap ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/6 p-3 text-sm text-destructive">
                <div className="mb-1 flex items-center gap-2 font-medium">
                  <AlertTriangleIcon aria-hidden="true" className="size-4" data-icon="mesh-gap" />
                  Contract gap
                </div>
                <p>{position.contractGapReason ?? "Deterministic basis unavailable."}</p>
              </div>
            ) : (
              <div className="grid gap-1">
                <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Deterministic basis</span>
                <p className="text-sm">{position.deterministicBasis}</p>
              </div>
            )}
            <DavidRecordDisclosure items={position.recordIds} label={`${position.recordIds.length.toString()} source records`} />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
