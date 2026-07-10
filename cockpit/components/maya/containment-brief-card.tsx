import { ArrowRightIcon, CheckCircle2Icon, FileSearchIcon, ShieldAlertIcon } from "lucide-react";
import { Badge } from "../ui/badge.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.tsx";
import { Separator } from "../ui/separator.tsx";
import { cn } from "../../lib/utils.ts";
import type { ForensicsCockpitModel } from "../../app/cockpit-data.ts";
import { mayaAccent } from "./maya-accent.ts";

interface ContainmentBriefCardProps {
  panel: ForensicsCockpitModel["containmentPanel"] | undefined;
}

type ContainmentTone = ForensicsCockpitModel["containmentPanel"]["methodologyReasons"][number]["tone"];

const toneClassName: Record<ContainmentTone, string> = {
  critical: "border-[color:var(--status-danger-border)] bg-[var(--status-danger-bg)] text-danger",
  evidence: "border-[color:var(--status-info-border)] bg-[var(--status-info-bg)] text-info",
  safe: "border-[color:var(--status-neutral-border)] bg-[var(--status-neutral-bg)] text-neutral-status",
  warning: "border-[color:var(--status-warning-border)] bg-[var(--status-warning-bg)] text-warning"
};

export function ContainmentBriefCard({ panel }: ContainmentBriefCardProps) {
  if (panel === undefined) {
    return null;
  }

  const methodologyReasons = Array.isArray(panel.methodologyReasons) ? panel.methodologyReasons : [];
  const evidenceLinks = Array.isArray(panel.evidenceLinks) ? panel.evidenceLinks : [];
  const actionBasisLabel =
    typeof panel.actionBasisLabel === "string" && panel.actionBasisLabel.length > 0
      ? panel.actionBasisLabel
      : "Governed containment basis is preserved in the cited backend read model; no external action is staged.";

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
              <CardDescription className="text-xs leading-5">
                Read-only behavioral containment candidate. No hold, freeze, or external action is staged from this view.
              </CardDescription>
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
        <section className="grid min-w-0 gap-3" aria-label="Governed gaming methodology">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="grid min-w-0 gap-1">
              <p className="text-base font-semibold text-foreground">Why {panel.customerLabel} was selected</p>
              <p className="text-sm text-muted-foreground">
                Governed gaming methodology: repeat invalid shortage plus pricing pattern, value floor, promo correlation, and no-wrongful-containment guard.
              </p>
            </div>
            <Badge className="rounded-full" variant="secondary">
              Governed gaming methodology
            </Badge>
          </div>
          <div className="grid min-w-0 gap-2 md:grid-cols-2">
            {methodologyReasons.length > 0 ? (
              methodologyReasons.map((reason) => (
              <div
                className={cn("grid min-w-0 gap-2 rounded-md border p-3", toneClassName[reason.tone])}
                data-tone={reason.tone}
                key={reason.label}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="grid min-w-0 gap-1">
                    <p className="font-semibold">{methodologyReasonDisplayLabel(reason.label)}</p>
                    <p className="text-sm">{reason.reason}</p>
                  </div>
                  {reason.tone === "safe" ? (
                    <CheckCircle2Icon aria-hidden="true" className="size-4 shrink-0" />
                  ) : (
                    <ShieldAlertIcon aria-hidden="true" className="size-4 shrink-0" />
                  )}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium">
                  <span className="rounded-full bg-background/70 px-2 py-1">{reason.value}</span>
                  <span className="rounded-full bg-background/70 px-2 py-1">{reason.thresholdLabel}</span>
                </div>
              </div>
              ))
            ) : (
              <div
                className={cn("grid min-w-0 gap-2 rounded-md border p-3 md:col-span-2", toneClassName.safe)}
                data-tone="safe"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="grid min-w-0 gap-1">
                    <p className="font-semibold">Legacy read-model compatibility</p>
                    <p className="text-sm">
                      The containment candidate remains review-only while the latest governed methodology details warm in the read model cache.
                    </p>
                  </div>
                  <CheckCircle2Icon aria-hidden="true" className="size-4 shrink-0" />
                </div>
              </div>
            )}
          </div>
        </section>
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
          <p className="text-sm font-semibold text-foreground">Why Maya sees this</p>
          <p className="text-sm text-foreground">{panel.componentReadoutLabel}</p>
          <p className="text-sm text-foreground">{actionBasisLabel}</p>
          <p className="text-sm text-muted-foreground">{panel.actionPostureLabel}</p>
        </div>
        <EvidenceLinkGrid links={evidenceLinks} />
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

interface EvidenceLinkGridProps {
  links: ForensicsCockpitModel["containmentPanel"]["evidenceLinks"];
}

function EvidenceLinkGrid({ links }: EvidenceLinkGridProps) {
  return (
    <section className="grid min-w-0 gap-2" aria-label="Clickable containment evidence">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Clickable evidence</p>
        <Badge variant="outline">{links.length.toString()} cited records</Badge>
      </div>
      <div className="grid min-w-0 gap-2 md:grid-cols-2">
        {links.map((link) => {
          const evidenceId = containmentEvidenceAnchorId(link.recordId);

          return (
            <a
              aria-label={`Open containment evidence ${link.recordId}`}
              className={cn(
                "grid min-w-0 gap-1 rounded-md border p-3 no-underline transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                toneClassName[link.tone]
              )}
              data-tone={link.tone}
              href={`#${evidenceId}`}
              key={link.recordId}
            >
              <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                <FileSearchIcon aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">{link.label}</span>
              </span>
              <code className="break-all rounded bg-background/70 px-2 py-1 text-xs">{link.recordId}</code>
              <span className="text-xs leading-5">{link.reason}</span>
            </a>
          );
        })}
      </div>
      <div className="grid min-w-0 gap-2">
        {links.map((link) => (
          <div
            className="grid min-w-0 gap-1 rounded-md border border-border/70 bg-background/75 p-3"
            id={containmentEvidenceAnchorId(link.recordId)}
            key={`${link.recordId}-detail`}
          >
            <p className="text-sm font-semibold text-foreground">{link.label}</p>
            <p className="text-sm text-muted-foreground">{link.reason}</p>
            <code className="w-fit rounded bg-muted px-2 py-1 text-xs text-foreground">{link.recordId}</code>
          </div>
        ))}
      </div>
    </section>
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

function containmentEvidenceAnchorId(recordId: string): string {
  return `maya-containment-evidence-${recordId.replace(/[^A-Za-z0-9_-]/gu, "-")}`;
}

function methodologyReasonDisplayLabel(label: string): string {
  return label === "Value at risk floor" ? "Value floor" : label;
}
