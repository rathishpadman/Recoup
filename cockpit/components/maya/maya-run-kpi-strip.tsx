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

function hasHighPriorityKpi(items: MayaKpiItem[]): boolean {
  return items.some((item) => /\bhigh[-\s]?priority\b/iu.test(item.label));
}

type KpiCardModel =
  | {
      kind: "backend";
      item: MayaKpiItem;
    }
  | {
      kind: "contract-gap";
      support: string;
    };

function beatTwoKpiCards(items: MayaKpiItem[]): KpiCardModel[] {
  if (hasHighPriorityKpi(items)) {
    return items.slice(0, 6).map((item) => ({ kind: "backend", item }));
  }

  const [firstItem, ...remainingItems] = items;
  return [
    ...(firstItem === undefined ? [] : [{ kind: "backend" as const, item: firstItem }]),
    { kind: "contract-gap" as const, support: "Needs priority field" },
    ...remainingItems.slice(0, 4).map((item) => ({ kind: "backend" as const, item }))
  ].slice(0, 6);
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
    return "border-[color:color-mix(in_srgb,var(--status-success-text)_22%,var(--border-default))] bg-[color:color-mix(in_srgb,var(--status-success-text)_9%,var(--bg-surface))] text-[color:var(--status-success-text)]";
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

function kpiValueClassName(value: string): string {
  return value.length > 9 ? "text-2xl" : "text-3xl";
}

export function MayaRunKpiStrip({ actionInbox, items, recoveryTracker }: MayaRunKpiStripProps) {
  if (items.length === 0) {
    return <MayaEmptyState description="The run read model returned no KPI rows." title="KPI strip unavailable" />;
  }

  const cards = beatTwoKpiCards(items);

  return (
    <section className="grid min-w-0 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Forensics run KPIs">
      {cards.map((card, index) => {
        const key = card.kind === "backend" ? card.item.label : "high-priority-contract-gap";
        const label = card.kind === "backend" ? card.item.label : "High-priority items";
        const value = card.kind === "backend" ? card.item.value : "--";
        const support = card.kind === "backend" ? card.item.support : card.support;
        const trend = card.kind === "backend" ? support : support;
        const tooltipLabel =
          card.kind === "backend"
            ? support
            : `${support}; ${recoveryTracker.recoveryLines.toString()} recovery lines; ${actionInbox.length.toString()} HITL actions`;

        return (
          <Card className="min-h-[174px] justify-between rounded-lg shadow-none" key={key} size="sm">
            <CardHeader className="gap-5">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg border", kpiIconTone(index))}>
                  {renderKpiIcon(index)}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span aria-label={tooltipLabel} className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
                      <InfoIcon aria-hidden="true" data-icon="kpi-info" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <span>{tooltipLabel}</span>
                  </TooltipContent>
                </Tooltip>
              </div>
              <CardDescription className="min-h-7 text-xs leading-4">{label}</CardDescription>
            </CardHeader>
            <CardContent className="grid min-w-0 gap-3">
              <CardTitle
                className={cn(
                  "min-w-0 overflow-hidden font-semibold leading-none tabular-nums text-ellipsis",
                  kpiValueClassName(value)
                )}
              >
                {value}
              </CardTitle>
              <p className="truncate text-xs text-muted-foreground">{trend}</p>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
