import { Fragment } from "react";
import { ArrowRightIcon, CheckCircle2Icon, FileSearchIcon, ShieldAlertIcon } from "lucide-react";
import { Badge } from "../ui/badge.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.tsx";
import { Separator } from "../ui/separator.tsx";
import { cn } from "../../lib/utils.ts";
import type { ForensicsCockpitModel } from "../../app/cockpit-data.ts";
import { mayaAccent } from "./maya-accent.ts";
import { groupContainmentEvidenceLinks } from "./maya-workspace-derived.ts";

interface ContainmentBriefCardProps {
  panel: ForensicsCockpitModel["containmentPanel"] | undefined;
}

type ContainmentTone = ForensicsCockpitModel["containmentPanel"]["methodologyReasons"][number]["tone"];

/**
 * Tone is carried by the row's icon rather than by a filled panel behind every row: the reason
 * list is scannable without turning each entry into its own coloured card.
 */
const toneIconClassName: Record<ContainmentTone, string> = {
  critical: "text-danger",
  evidence: "text-info",
  safe: "text-neutral-status",
  warning: "text-warning"
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
          {methodologyReasons.length > 0 ? (
            <div className="grid min-w-0 divide-y divide-border/60 rounded-md border">
              {methodologyReasons.map((reason) => (
                <div className="grid min-w-0 gap-1 px-3 py-2.5" data-tone={reason.tone} key={reason.label}>
                  <div className="flex min-w-0 items-center gap-2">
                    {reason.tone === "safe" ? (
                      <CheckCircle2Icon aria-hidden="true" className={cn("size-4 shrink-0", toneIconClassName[reason.tone])} />
                    ) : (
                      <ShieldAlertIcon aria-hidden="true" className={cn("size-4 shrink-0", toneIconClassName[reason.tone])} />
                    )}
                    <p className="min-w-0 flex-1 text-sm font-medium text-foreground">
                      {methodologyReasonDisplayLabel(reason.label)}
                    </p>
                    <span className="shrink-0 text-sm tabular-nums text-foreground">{reason.value}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{reason.thresholdLabel}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{reason.reason}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid min-w-0 gap-1 rounded-md border px-3 py-2.5" data-tone="safe">
              <p className="text-sm font-medium text-foreground">Legacy read-model compatibility</p>
              <p className="text-sm text-muted-foreground">
                The containment candidate remains review-only while the latest governed methodology details warm in the read model cache.
              </p>
            </div>
          )}
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
        <div className="grid min-w-0 gap-1">
          <p className="text-sm font-medium text-foreground">Why Maya sees this</p>
          <p className="text-sm text-muted-foreground">{panel.componentReadoutLabel}</p>
          <p className="text-sm text-muted-foreground">{actionBasisLabel}</p>
          <p className="text-sm text-muted-foreground">{panel.actionPostureLabel}</p>
        </div>
        <EvidenceLinkGrid links={evidenceLinks} />
        <details className="group/provenance rounded-md border" data-testid="maya-containment-provenance">
          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-foreground marker:content-none">
            Governed basis and cited record IDs
          </summary>
          <div className="grid min-w-0 gap-4 border-t px-3 py-3">
            <dl className="grid min-w-0 gap-x-4 gap-y-2 md:grid-cols-[200px_minmax(0,1fr)]">
              {panel.basisRows.map((row) => (
                <Fragment key={row.label}>
                  <dt className="text-sm text-muted-foreground">{row.label}</dt>
                  <dd className="m-0 break-words text-sm text-foreground">{row.value}</dd>
                </Fragment>
              ))}
            </dl>
            <RecordBadgeRow label={panel.recordStripLabel} values={panel.recordIds} />
          </div>
        </details>
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

/**
 * One row per evidence family, not per record. A containment case can cite dozens of records; a row
 * each made the panel mostly repetition of the same sentence. The record IDs stay one click away.
 */
function EvidenceLinkGrid({ links }: EvidenceLinkGridProps) {
  const groups = groupContainmentEvidenceLinks(links);

  return (
    <section className="grid min-w-0 gap-2" aria-label="Cited containment evidence">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Cited evidence</p>
        <Badge variant="outline">{links.length.toString()} cited records</Badge>
      </div>
      <div className="grid min-w-0 divide-y divide-border/60 rounded-md border">
        {groups.map((group) => (
          <details className="min-w-0 px-3 py-2.5" data-tone={group.tone} key={group.label}>
            <summary className="grid min-w-0 cursor-pointer list-none gap-1 md:grid-cols-[minmax(0,1fr)_auto] md:items-baseline md:gap-4 marker:content-none">
              <span className="grid min-w-0 gap-1">
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                  <FileSearchIcon aria-hidden="true" className={cn("size-4 shrink-0", toneIconClassName[group.tone])} />
                  <span className="truncate">{group.label}</span>
                </span>
                <span className="text-sm text-muted-foreground">{group.reason}</span>
              </span>
              <span className="text-xs text-muted-foreground md:text-right">{group.countLabel}</span>
            </summary>
            <div className="flex min-w-0 flex-wrap gap-1.5 pt-2">
              {group.recordIds.map((recordId) => (
                <code
                  className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground"
                  id={containmentEvidenceAnchorId(recordId)}
                  key={recordId}
                >
                  {recordId}
                </code>
              ))}
            </div>
          </details>
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
