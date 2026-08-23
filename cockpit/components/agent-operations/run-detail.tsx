"use client";

import { FileTextIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card data-testid="agent-operations-run-detail">
      <CardHeader>
        <CardTitle>Run details</CardTitle>
      </CardHeader>
      <CardContent>
        {detail === undefined ? (
          <EmptyPanel
            testId="run-detail-empty"
            hint="Select a run from the table to view details."
          />
        ) : (
          <dl className="space-y-4 text-sm">
            <Field label="Run ID">
              <span className="font-mono text-xs" data-testid="run-detail-run-id">
                {detail.runId}
              </span>
            </Field>
            <Field label="Agent">{detail.agent}</Field>
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
            <Field label="Started at">{detail.startedAt ?? DASH}</Field>
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
              <div className="space-y-3 border-t pt-4" data-testid="run-detail-evidence">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Allocation
                </p>
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
                {!detail.evidence.assumedPolicy ? null : (
                  <Badge variant="secondary" data-testid="run-detail-assumed-policy">
                    Assumed policy, not ratified
                  </Badge>
                )}
              </div>
            )}
            {detail.blockerCode === undefined ? null : (
              <Field label="Blocker">
                <span data-testid="run-detail-blocker">{detail.blockerCode}</span>
              </Field>
            )}
          </dl>
        )}
      </CardContent>
    </Card>
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
