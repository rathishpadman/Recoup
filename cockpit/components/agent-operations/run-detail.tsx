"use client";

import { FileTextIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CollapsiblePanel } from "./collapsible-panel.tsx";
import { readableSpecialist, readableTime } from "./display.ts";
import { NO_RUN_SELECTED_TITLE, type RunDetail } from "./types.ts";

/**
 * Run details panel.
 *
 * Shows the selected run, or an explicit empty state. Both are rendered from
 * backend values; the panel never derives an elapsed time or infers a status
 * from a timestamp.
 */

interface RunDetailPanelProps {
  detail?: RunDetail | undefined;
}

const DASH = "—";

export function RunDetailPanel({ detail }: RunDetailPanelProps) {
  return (
    <CollapsiblePanel testId="agent-operations-run-detail" title="Run details">
      {detail === undefined ? (
          <EmptyPanel
            testId="run-detail-empty"
            hint="Select a run from the table to view details."
          />
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div className="col-span-2">
              <Field label="Run ID">
                <span className="font-mono text-xs" data-testid="run-detail-run-id">
                  {detail.runId}
                </span>
              </Field>
            </div>
            <Field label="Agent">{readableSpecialist(detail.agent)}</Field>
            <Field label="Scenario">{detail.scenario ?? DASH}</Field>
            <Field label="Customer">
              <span data-testid="run-detail-customer">{detail.customer ?? DASH}</span>
            </Field>
            <Field label="Status">
              <Badge
                variant={detail.status === "Blocked" ? "destructive" : "secondary"}
                data-testid="run-detail-status"
              >
                {detail.status}
              </Badge>
            </Field>
            <Field label="Started at">{readableTime(detail.startedAt)}</Field>
            <Field label="Elapsed">
              <span className="tabular-nums">{detail.elapsed ?? DASH}</span>
            </Field>
            {detail.caseId === undefined ? null : (
              <Field label="Case">
                <span className="font-mono text-xs" data-testid="run-detail-case-id">
                  {detail.caseId}
                </span>
              </Field>
            )}
            {detail.evidence === undefined ? null : (
              <div className="col-span-2 space-y-3 border-t pt-4" data-testid="run-detail-evidence">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Allocation
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Field label="Short payment">
                  {/* Backend-formatted. The cockpit never computes a money value. */}
                  <span className="tabular-nums" data-testid="run-detail-short-payment">
                    {detail.evidence.shortPaymentAmount} {detail.evidence.currency}
                  </span>
                </Field>
                <Field label="Validated reason">
                  <span data-testid="run-detail-validated-reason">
                    {detail.evidence.validatedReason}
                  </span>
                </Field>
                <Field label="Claimed reason">{detail.evidence.claimedReason}</Field>
                <Field label="Evidence">
                  <span className="font-mono text-xs break-all" data-testid="run-detail-evidence-ids">
                    {detail.evidence.receiptId}, {detail.evidence.allocationId},{" "}
                    {detail.evidence.remittanceId}
                  </span>
                </Field>
                <Field label="Cited records">
                  <span className="tabular-nums">{detail.evidence.citedRecordCount}</span>
                </Field>
                </div>
                {!detail.evidence.assumedPolicy ? null : (
                  <Badge variant="secondary" data-testid="run-detail-assumed-policy">
                    Assumed policy, not ratified
                  </Badge>
                )}
              </div>
            )}
            {detail.blockerCode === undefined ? null : (
              <Field label="Why it stopped">
                <span data-testid="run-detail-blocker">{detail.blockerCode}</span>
              </Field>
            )}
          </dl>
      )}
    </CollapsiblePanel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

export function EmptyPanel({ testId, hint }: { testId: string; hint: string }) {
  return (
    <div
      className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground"
      data-testid={testId}
    >
      <FileTextIcon className="size-8" aria-hidden />
      <p className="text-sm font-medium">{NO_RUN_SELECTED_TITLE}</p>
      <p className="text-xs">{hint}</p>
    </div>
  );
}
