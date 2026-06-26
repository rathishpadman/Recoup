"use client";

import * as React from "react";
import { CheckCircle2Icon, CircleAlertIcon, FlaskConicalIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ConnectorReadinessCockpitModel, MayaFieldProvenance, SourceHealthResult } from "../../app/cockpit-data.ts";
import type { MayaSourceTile } from "./types.ts";

interface SourceReadinessStripProps {
  connectors: ConnectorReadinessCockpitModel;
}

export const sourceReadinessRefreshIntervalMs = 15 * 60 * 1000;

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
  return label;
}

function displayStateLabel(stateLabel: string): string {
  if (stateLabel === "Connected") {
    return "OK";
  }

  if (stateLabel === "Synthetic") {
    return "Synth";
  }

  return stateLabel;
}

function displayCheckedAt(checkedAtIso: string): string {
  const checkedAt = new Date(checkedAtIso);
  if (Number.isNaN(checkedAt.getTime())) {
    return "Checked time unavailable";
  }

  return `Checked ${new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    timeZoneName: "short"
  }).format(checkedAt)}`;
}

export function SourceReadinessStrip({ connectors }: SourceReadinessStripProps) {
  const [currentConnectors, setCurrentConnectors] = React.useState(connectors);
  const [sourceRefreshError, setSourceRefreshError] = React.useState<string | undefined>();

  React.useEffect(() => {
    setCurrentConnectors(connectors);
    setSourceRefreshError(undefined);
  }, [connectors]);

  React.useEffect(() => {
    let active = true;
    const refreshConnectors = async (): Promise<void> => {
      try {
        const response = await fetch("/api/connectors", { cache: "no-store" });
        if (!response.ok) {
          if (active) {
            setSourceRefreshError(`Connector refresh failed with HTTP ${response.status.toString()}.`);
          }
          return;
        }
        const next = (await response.json()) as unknown;
        if (active && isConnectorReadinessModel(next)) {
          setCurrentConnectors(next);
          setSourceRefreshError(undefined);
          return;
        }
        if (active) {
          setSourceRefreshError("Connector refresh returned an invalid readiness model.");
        }
      } catch {
        if (active) {
          setSourceRefreshError("Connector refresh failed before a backend response.");
        }
        return;
      }
    };
    const timer = window.setInterval(() => {
      void refreshConnectors();
    }, sourceReadinessRefreshIntervalMs);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (currentConnectors.sourceTiles.length === 0) {
    return (
      <Alert>
        <AlertTitle>Source readiness unavailable</AlertTitle>
        <AlertDescription>The connector read model returned no source readiness rows.</AlertDescription>
      </Alert>
    );
  }
  const checkedAtLabel = displayCheckedAt(currentConnectors.checkedAtIso);

  return (
    <Card className="rounded-lg py-0 shadow-none" size="sm">
      <CardContent
        aria-label={`${checkedAtLabel}; ${currentConnectors.lastRefreshedLabel}`}
        className="grid min-h-[58px] min-w-0 items-center gap-3 px-3 py-1.5 lg:grid-cols-[190px_minmax(0,1fr)]"
        data-testid="maya-source-readiness-strip"
      >
        {sourceRefreshError === undefined ? null : (
          <Alert
            aria-live="polite"
            className="min-w-0 py-2 lg:col-span-2"
            data-testid="maya-source-refresh-status"
            role="status"
          >
            <CircleAlertIcon aria-hidden="true" data-icon="source-refresh-status" />
            <AlertTitle>Refresh failed</AlertTitle>
            <AlertDescription>{sourceRefreshError}</AlertDescription>
          </Alert>
        )}
        <div className="grid min-w-0 gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <CardTitle>Source Readiness</CardTitle>
            <Badge className="h-5 px-1.5 text-[10px]" variant="outline">
              {currentConnectors.sourceTiles.length.toString()} sources
            </Badge>
          </div>
          <CardDescription className="truncate text-xs leading-3">{checkedAtLabel}</CardDescription>
        </div>
        <div className="grid min-w-0 grid-cols-[repeat(7,minmax(104px,1fr))] gap-1.5">
          {currentConnectors.sourceTiles.map((source) => {
            const displayLabel = displaySourceLabel(source.label);
            const displayState = displayStateLabel(source.stateLabel);
            const sourceCheckedAtLabel = displayCheckedAt(source.checkedAtIso);

            return (
              <Tooltip key={source.key}>
                <TooltipTrigger asChild>
                  <div
                    aria-label={`${source.label}: ${source.stateLabel}; ${source.modeLabel}; ${sourceCheckedAtLabel}`}
                    className={cn(
                      "grid min-h-10 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 overflow-hidden rounded-md border px-1.5 py-1",
                      sourceTileClass(source.statusTone)
                    )}
                    data-status-tone={source.statusTone}
                    data-testid="maya-source-tile"
                  >
                    <div className="flex size-6 items-center justify-center rounded-md border bg-background/70 text-xs font-semibold text-muted-foreground">
                      {source.mark}
                    </div>
                    <div className="grid min-w-0 gap-0.5">
                      <div className="min-w-0">
                        <p className="min-w-0 break-words text-[10px] font-semibold leading-3" title={source.label}>
                          {displayLabel}
                        </p>
                      </div>
                      <div className="flex min-w-0 items-center gap-1">
                        <span className={cn("flex shrink-0 items-center leading-none", sourceStatusClass(source.statusTone))}>
                          {sourceStatusIcon(source.statusTone)}
                        </span>
                        <Badge
                          className="h-4 max-w-full shrink-0 justify-start px-0.5 text-[9px]"
                          data-testid="maya-source-status"
                          title={source.stateLabel}
                          variant={sourceToneVariant(source.statusTone)}
                        >
                          <span>{displayState}</span>
                        </Badge>
                      </div>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="flex max-w-72 flex-col gap-1">
                  <span>{source.detail}</span>
                  <span>{source.modeLabel}</span>
                  <span>{sourceCheckedAtLabel}</span>
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

function isConnectorReadinessModel(value: unknown): value is ConnectorReadinessCockpitModel {
  if (!isRecord(value)) {
    return false;
  }

  const sourceHealth = value.sourceHealth;
  const sourceTiles = value.sourceTiles;
  const connectors = value.connectors;

  return (
    value.surface === "connector-readiness" &&
    typeof value.checkedAtIso === "string" &&
    typeof value.lastRefreshedLabel === "string" &&
    isMayaFieldProvenance(value.provenance) &&
    Array.isArray(sourceHealth) &&
    sourceHealth.every(isSourceHealthResult) &&
    Array.isArray(sourceTiles) &&
    sourceTiles.every(isSourceTile) &&
    Array.isArray(connectors) &&
    connectors.every(isConnectorReadinessEntry)
  );
}

function isSourceHealthResult(value: unknown): value is SourceHealthResult {
  return (
    isRecord(value) &&
    typeof value.sourceName === "string" &&
    isOneOf(value.status, ["connected", "degraded", "blocked"] as const) &&
    isOneOf(value.sourceMode, ["live", "synthetic_static_table", "unavailable"] as const) &&
    typeof value.checkedAtIso === "string" &&
    typeof value.latencyMs === "number" &&
    isStringArray(value.proofItems) &&
    isStringArray(value.recordIds) &&
    isOptionalString(value.lastError)
  );
}

function isSourceTile(value: unknown): value is ConnectorReadinessCockpitModel["sourceTiles"][number] {
  return (
    isRecord(value) &&
    typeof value.checkedAtIso === "string" &&
    typeof value.detail === "string" &&
    typeof value.key === "string" &&
    typeof value.label === "string" &&
    typeof value.mark === "string" &&
    typeof value.modeLabel === "string" &&
    isStringArray(value.proofItems) &&
    isMayaFieldProvenance(value.provenance) &&
    typeof value.stateLabel === "string" &&
    isOneOf(value.statusTone, ["ready", "synthetic", "blocked"] as const) &&
    typeof value.summary === "string"
  );
}

function isConnectorReadinessEntry(value: unknown): value is ConnectorReadinessCockpitModel["connectors"][number] {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.status === "string" &&
    isStringArray(value.allowedOperations) &&
    isStringArray(value.missingCredentialEnvNames) &&
    isStringArray(value.missingSourceContractInputs) &&
    isConnectorProof(value.proof) &&
    isStringArray(value.requiredInputs) &&
    typeof value.reason === "string" &&
    isOptionalString(value.liveContractStatus) &&
    isOptionalString(value.sourceTableName) &&
    isOptionalStringArray(value.toolDataTableNames) &&
    (value.sourceContractMode === undefined ||
      isOneOf(value.sourceContractMode, ["live_source_contract", "synthetic_static_table"] as const)) &&
    (value.sourceMode === undefined || isOneOf(value.sourceMode, ["live", "synthetic_static_table"] as const))
  );
}

function isConnectorProof(value: unknown): value is ConnectorReadinessCockpitModel["connectors"][number]["proof"] {
  return (
    isRecord(value) &&
    typeof value.credentialsConfigured === "boolean" &&
    typeof value.externalWritesAllowed === "boolean" &&
    typeof value.schemaValidated === "boolean" &&
    typeof value.sourceContractConfigured === "boolean"
  );
}

function isMayaFieldProvenance(value: unknown): value is MayaFieldProvenance {
  return (
    isRecord(value) &&
    typeof value.deterministicBasis === "string" &&
    isStringArray(value.recordIds) &&
    isOneOf(value.sourceKind, ["agent_trace", "derived_backend", "operator_session", "sap_odata", "supabase"] as const) &&
    typeof value.sourceName === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalStringArray(value: unknown): value is string[] | undefined {
  return value === undefined || isStringArray(value);
}

function isOneOf<const T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === "string" && allowed.includes(value);
}
