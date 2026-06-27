import {
  AlertTriangleIcon,
  ClipboardListIcon,
  ClockIcon,
  FlagIcon,
  InfoIcon,
  ShieldCheckIcon,
  WalletCardsIcon
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MayaEmptyState } from "./maya-empty-state.tsx";
import type { MayaActionInboxItem, MayaKpiItem, MayaRecoveryTracker } from "./types.ts";

interface MayaRunKpiStripProps {
  actionInbox: MayaActionInboxItem[];
  items: MayaKpiItem[];
  recoveryTracker: MayaRecoveryTracker;
}

function renderKpiIcon(index: number) {
  if (index === 1) {
    return <FlagIcon aria-hidden="true" data-icon="kpi-card" />;
  }

  if (index === 2) {
    return <ShieldCheckIcon aria-hidden="true" data-icon="kpi-card" />;
  }

  if (index === 3) {
    return <AlertTriangleIcon aria-hidden="true" data-icon="kpi-card" />;
  }

  if (index === 4) {
    return <ClockIcon aria-hidden="true" data-icon="kpi-card" />;
  }

  if (index === 5) {
    return <WalletCardsIcon aria-hidden="true" data-icon="kpi-card" />;
  }

  return <ClipboardListIcon aria-hidden="true" data-icon="kpi-card" />;
}

function kpiIconTone(index: number): string {
  if (index === 1) {
    return "border-destructive/20 bg-destructive/10 text-destructive";
  }

  if (index === 2) {
    return "border-border bg-muted/20 text-muted-foreground";
  }

  if (index === 3) {
    return "border-[color:color-mix(in_srgb,var(--color-accent)_24%,var(--border-default))] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,var(--bg-surface))] text-[color:var(--color-accent)]";
  }

  if (index === 4) {
    return "border-[color:color-mix(in_srgb,var(--color-primary)_20%,var(--border-default))] bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--bg-surface))] text-primary";
  }

  if (index === 5) {
    return "border-[color:color-mix(in_srgb,var(--color-primary-subtle)_30%,var(--border-default))] bg-[color:color-mix(in_srgb,var(--color-primary-subtle)_14%,var(--bg-surface))] text-[color:var(--color-primary-deep)]";
  }

  return "border-[color:color-mix(in_srgb,var(--color-primary)_20%,var(--border-default))] bg-[color:color-mix(in_srgb,var(--color-primary)_7%,var(--bg-surface))] text-primary";
}

export function MayaRunKpiStrip({ items }: MayaRunKpiStripProps) {
  if (items.length === 0) {
    return <MayaEmptyState description="No run KPI rows are available for this session." kind="generic" title="KPI strip unavailable" />;
  }

  return (
    <section
      className="grid min-w-0 gap-3 md:grid-cols-3 xl:grid-cols-6"
      aria-label="Forensics run KPIs"
      data-testid="maya-run-kpi-strip"
    >
      {items.map((item, index) => {
        return (
          <Card
            className="min-h-[166px] justify-between rounded-lg border-border/80 bg-card shadow-[var(--shadow-sm)]"
            data-kpi-label={item.label}
            data-testid="maya-kpi-card"
            key={item.label}
            size="sm"
          >
            <CardHeader className="gap-5">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className={cn("flex size-12 shrink-0 items-center justify-center rounded-lg border", kpiIconTone(index))}>
                  {renderKpiIcon(index)}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span aria-label={item.support} className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
                      <InfoIcon aria-hidden="true" data-icon="kpi-info" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <span>{item.support}</span>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="grid min-w-0 gap-1.5">
                <CardDescription className="min-h-4 text-[11px] leading-4">{item.label}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid min-w-0 gap-2">
              <CardTitle
                className="min-w-0 text-2xl font-semibold leading-none tabular-nums truncate"
                title={item.value}
              >
                {item.value}
              </CardTitle>
              <p className="truncate text-xs text-muted-foreground">{item.support}</p>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
