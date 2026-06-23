import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

function sourceToneRule(statusTone: MayaSourceTile["statusTone"]): string {
  if (statusTone === "ready") {
    return "before:bg-[color:var(--status-success-text)]";
  }

  if (statusTone === "blocked") {
    return "before:bg-destructive";
  }

  return "before:bg-[color:var(--color-accent)]";
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
        className="grid min-h-[78px] min-w-0 items-center gap-3 px-3 py-2 xl:grid-cols-[220px_repeat(5,minmax(96px,1fr))]"
      >
        <div className="grid min-w-0 gap-1">
          <CardTitle>Source Readiness</CardTitle>
          <CardDescription className="truncate text-xs">System connectivity and data freshness</CardDescription>
        </div>
        {visibleSources.map((source) => (
          <Tooltip key={source.key}>
            <TooltipTrigger asChild>
              <div
                className={`relative grid min-h-12 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 overflow-hidden rounded-md pt-2 before:absolute before:inset-x-0 before:top-0 before:h-0.5 ${sourceToneRule(
                  source.statusTone
                )}`}
              >
                <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-xs font-semibold text-muted-foreground">
                  {source.mark}
                </div>
                <div className="grid min-w-0 gap-1">
                  <div className="grid min-w-0 gap-0.5">
                    <p className="min-w-0 truncate text-xs font-medium leading-4" title={source.label}>
                      {source.label}
                    </p>
                    <Badge
                      className="h-5 max-w-full shrink-0 justify-start truncate px-1.5 text-[10px]"
                      title={source.stateLabel}
                      variant={sourceToneVariant(source.statusTone)}
                    >
                      <span className="min-w-0 truncate">{source.stateLabel}</span>
                    </Badge>
                  </div>
                  <p className="min-w-0 truncate text-xs leading-4 text-muted-foreground" title={source.modeLabel}>
                    {source.modeLabel}
                  </p>
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
