import { CheckCircle2Icon, CircleAlertIcon, FlaskConicalIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
        className="grid min-h-[72px] min-w-0 items-center gap-3 px-3 py-2 xl:grid-cols-[220px_repeat(5,minmax(88px,1fr))]"
        data-testid="maya-source-readiness-strip"
      >
        <div className="grid min-w-0 gap-1">
          <CardTitle>Source Readiness</CardTitle>
          <CardDescription className="truncate text-xs">System connectivity and data freshness</CardDescription>
        </div>
        {visibleSources.map((source) => (
          <Tooltip key={source.key}>
            <TooltipTrigger asChild>
              <div
                aria-label={`${source.label}: ${source.stateLabel}; ${source.modeLabel}`}
                className={`grid min-h-12 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 overflow-hidden rounded-md border px-2 py-1.5 ${sourceTileClass(
                  source.statusTone
                )}`}
                data-status-tone={source.statusTone}
                data-testid="maya-source-tile"
              >
                <div className="flex size-7 items-center justify-center rounded-md border bg-background/70 text-xs font-semibold text-muted-foreground">
                  {source.mark}
                </div>
                <div className="grid min-w-0 gap-0.5">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-xs font-medium leading-4" title={source.label}>
                      {source.label}
                    </p>
                    <span className={`flex shrink-0 items-center ${sourceStatusClass(source.statusTone)}`}>
                      {sourceStatusIcon(source.statusTone)}
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Badge
                      className="h-5 max-w-full shrink-0 justify-start truncate px-1.5 text-[10px]"
                      data-testid="maya-source-status"
                      title={source.stateLabel}
                      variant={sourceToneVariant(source.statusTone)}
                    >
                      <span className="min-w-0 truncate">{source.stateLabel}</span>
                    </Badge>
                    <p className="hidden min-w-0 truncate text-xs leading-4 text-muted-foreground 2xl:block" title={source.modeLabel}>
                      {source.modeLabel}
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
        ))}
      </CardContent>
    </Card>
  );
}
