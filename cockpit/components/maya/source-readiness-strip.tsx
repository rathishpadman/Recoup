import { CheckCircle2Icon, CircleAlertIcon, FlaskConicalIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ConnectorReadinessCockpitModel } from "../../app/cockpit-data.ts";
import type { MayaSourceTile } from "./types.ts";

interface SourceReadinessStripProps {
  connectors: ConnectorReadinessCockpitModel;
}

function sourceToneVariant(statusTone: MayaSourceTile["statusTone"]): "default" | "destructive" | "outline" | "secondary" {
  if (statusTone === "ready") {
    return "secondary";
  }

  if (statusTone === "blocked") {
    return "destructive";
  }

  return "outline";
}

function sourceTileClass(statusTone: MayaSourceTile["statusTone"]): string {
  if (statusTone === "ready") {
    return "border-[color:color-mix(in_srgb,var(--status-success-text)_28%,var(--border-default))] bg-[color:color-mix(in_srgb,var(--status-success-text)_5%,var(--bg-surface))] text-foreground";
  }

  if (statusTone === "blocked") {
    return "border-destructive/35 bg-destructive/10 text-foreground";
  }

  return "border-border bg-muted/30 text-foreground";
}

function sourceStatusClass(statusTone: MayaSourceTile["statusTone"]): string {
  if (statusTone === "ready") {
    return "text-[color:var(--status-success-text)]";
  }

  if (statusTone === "blocked") {
    return "text-destructive";
  }

  return "text-muted-foreground";
}

function sourceStatusIcon(statusTone: MayaSourceTile["statusTone"]) {
  if (statusTone === "ready") {
    return <CheckCircle2Icon aria-hidden="true" data-icon="source-status" />;
  }

  if (statusTone === "blocked") {
    return <CircleAlertIcon aria-hidden="true" data-icon="source-status" />;
  }

  return <FlaskConicalIcon aria-hidden="true" data-icon="source-status" />;
}

function displaySourceLabel(label: string): string {
  const [primaryLabel] = label.split("/").map((part) => part.trim());

  return primaryLabel === undefined || primaryLabel.length === 0 ? label : primaryLabel;
}

function displaySourceMode(modeLabel: string): string {
  const normalizedMode = modeLabel.toLocaleLowerCase();
  if (normalizedMode.includes("synthetic table")) {
    return "Table";
  }

  if (normalizedMode.includes("synthetic evidence")) {
    return "Proof";
  }

  if (normalizedMode.includes("synthetic")) {
    return "Synthetic";
  }

  if (normalizedMode.includes("read-only")) {
    return "Read";
  }

  if (normalizedMode.includes("live")) {
    return "Live";
  }

  return modeLabel;
}

export function SourceReadinessStrip({ connectors }: SourceReadinessStripProps) {
  if (connectors.sourceTiles.length === 0) {
    return (
      <Alert>
        <AlertTitle>Source readiness unavailable</AlertTitle>
        <AlertDescription>The connector read model returned no source readiness rows.</AlertDescription>
      </Alert>
    );
  }

  const visibleSources = connectors.sourceTiles.slice(0, 5);

  return (
    <Card className="rounded-lg py-0 shadow-none" size="sm">
      <CardContent
        aria-label={connectors.lastRefreshedLabel}
        className="grid min-h-[58px] min-w-0 items-center gap-3 px-3 py-1 lg:grid-cols-[214px_minmax(0,1fr)]"
        data-testid="maya-source-readiness-strip"
      >
        <div className="grid min-w-0 gap-1">
          <CardTitle>Source Readiness</CardTitle>
          <CardDescription className="truncate text-xs leading-3">System connectivity and data freshness</CardDescription>
        </div>
        <div className="grid min-w-0 gap-2 md:grid-cols-5">
          {visibleSources.map((source) => {
            const displayLabel = displaySourceLabel(source.label);
            const displayMode = displaySourceMode(source.modeLabel);

            return (
              <Tooltip key={source.key}>
                <TooltipTrigger asChild>
                  <div
                    aria-label={`${source.label}: ${source.stateLabel}; ${source.modeLabel}`}
                    className={cn(
                      "grid min-h-10 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 overflow-hidden rounded-md border px-2 py-0.5",
                      sourceTileClass(source.statusTone)
                    )}
                    data-status-tone={source.statusTone}
                    data-testid="maya-source-tile"
                  >
                    <div className="flex size-6 items-center justify-center rounded-md border bg-background/70 text-xs font-semibold text-muted-foreground">
                      {source.mark}
                    </div>
                    <div className="grid min-w-0 gap-0.5">
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <p className="min-w-0 text-xs font-medium leading-4" title={source.label}>
                          {displayLabel}
                        </p>
                        <span className={cn("flex shrink-0 items-center", sourceStatusClass(source.statusTone))}>
                          {sourceStatusIcon(source.statusTone)}
                        </span>
                      </div>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Badge
                          className="h-4 max-w-full shrink-0 justify-start px-1.5 text-[10px]"
                          data-testid="maya-source-status"
                          title={source.stateLabel}
                          variant={sourceToneVariant(source.statusTone)}
                        >
                          <span>{source.stateLabel}</span>
                        </Badge>
                        <p className="min-w-0 text-[10px] leading-3 text-muted-foreground" title={source.modeLabel}>
                          {displayMode}
                        </p>
                      </div>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-72">
                  <span>{source.detail}</span>
                  {source.proofItems.map((proof) => (
                    <span key={`${source.key}-${proof}`}>{proof}</span>
                  ))}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
