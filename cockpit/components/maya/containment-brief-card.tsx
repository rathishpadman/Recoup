import { ArrowRightIcon, ShieldAlertIcon } from "lucide-react";
import { Badge } from "../ui/badge.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.tsx";
import { Separator } from "../ui/separator.tsx";
import { cn } from "../../lib/utils.ts";
import type { ForensicsCockpitModel } from "../../app/cockpit-data.ts";
import { mayaAccent } from "./maya-accent.ts";

interface ContainmentBriefCardProps {
  panel: ForensicsCockpitModel["containmentPanel"] | undefined;
}

export function ContainmentBriefCard({ panel }: ContainmentBriefCardProps) {
  if (panel === undefined) {
    return null;
  }

  return (
    <Card
      aria-label={panel.statusLabel}
      className={cn("rounded-lg shadow-[var(--shadow-sm)]", mayaAccent.subtleCard)}
      data-testid="maya-containment-brief"
      size="sm"
    >
      <CardHeader className="gap-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg border", mayaAccent.iconBubble)}>
              <ShieldAlertIcon aria-hidden="true" className="size-4" />
            </div>
            <div className="grid min-w-0 gap-1">
              <CardTitle className="text-lg font-semibold text-foreground">{panel.statusLabel}</CardTitle>
              <CardDescription className="text-xs leading-5">{panel.handoff.label}</CardDescription>
            </div>
          </div>
          <Badge className="max-w-full justify-start rounded-full" variant="review">
            {panel.handoff.status}
          </Badge>
        </div>
        <div className="grid min-w-0 gap-3 md:grid-cols-3">
          <DetailCell label="Customer" value={panel.customerLabel} />
          <DetailCell label="Intent" value={panel.intentLabel} />
          <DetailCell label="Posture" value={panel.postureLabel} />
        </div>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        <Separator />
        <div className="grid min-w-0 gap-2 rounded-md border border-border/70 bg-background/80 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="grid min-w-0 gap-1">
            <p className="text-xs font-medium text-muted-foreground">{panel.handoff.label}</p>
            <p className="text-sm font-semibold text-foreground">{panel.handoff.target}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ArrowRightIcon aria-hidden="true" className="size-3.5" />
            <span>{panel.handoff.status}</span>
          </div>
        </div>
        <div className="grid min-w-0 gap-2">
          {panel.basisRows.map((row) => (
            <div
              className="grid min-w-0 gap-1 rounded-md border border-border/60 bg-background/70 px-3 py-2 md:grid-cols-[180px_minmax(0,1fr)] md:items-center"
              key={row.label}
            >
              <span className="text-xs font-medium text-muted-foreground">{row.label}</span>
              <span className="break-words text-sm font-medium text-foreground">{row.value}</span>
            </div>
          ))}
        </div>
        <div className="grid min-w-0 gap-2 rounded-md border border-dashed border-border/70 bg-background/70 p-3">
          <p className="text-sm text-foreground">{panel.componentReadoutLabel}</p>
          <p className="text-sm text-muted-foreground">{panel.actionPostureLabel}</p>
        </div>
        <RecordBadgeRow label="Behavioral evidence IDs" values={panel.behavioralEvidenceIds} />
        <RecordBadgeRow label={panel.recordStripLabel} values={panel.recordIds} />
      </CardContent>
    </Card>
  );
}

interface DetailCellProps {
  label: string;
  value: string;
}

function DetailCell({ label, value }: DetailCellProps) {
  return (
    <div className="grid min-w-0 gap-1 rounded-md border border-border/70 bg-background/75 px-3 py-2">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="break-words text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

interface RecordBadgeRowProps {
  label: string;
  values: string[];
}

function RecordBadgeRow({ label, values }: RecordBadgeRowProps) {
  return (
    <div className="grid min-w-0 gap-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex min-w-0 flex-wrap gap-2">
        {values.map((value) => (
          <Badge className="max-w-full justify-start rounded-full font-medium" key={value} variant="outline">
            <span className="break-all">{value}</span>
          </Badge>
        ))}
      </div>
    </div>
  );
}
