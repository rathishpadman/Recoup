"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UpstreamCashOrigin } from "../agent-operations/types.ts";

/**
 * Upstream cash origin for a Maya live case.
 *
 * Shows where a case came from and, crucially, how far its numbers can be
 * trusted. `rehearsalOnly` and `assumedPolicy` are backend decisions rendered
 * as visible warnings rather than footnotes, so a reviewer sees the caveat in
 * the same glance as the amount.
 *
 * Amounts are backend-formatted strings. Nothing is parsed or recomputed here.
 */

interface UpstreamCashOriginProps {
  origin: UpstreamCashOrigin;
}

export function UpstreamCashOriginPanel({ origin }: UpstreamCashOriginProps) {
  return (
    <Card data-testid="maya-upstream-cash-origin">
      <CardHeader>
        <CardTitle>Upstream cash origin</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {origin.rehearsalOnly ? (
          <Alert variant="destructive" data-testid="upstream-cash-rehearsal-warning">
            <AlertTitle>Rehearsal data — not live cash</AlertTitle>
            <AlertDescription>
              This case cites a receipt from a non-authoritative source. It does not evidence
              settled funds and must not be used for a customer-facing claim.
            </AlertDescription>
          </Alert>
        ) : null}

        {origin.assumedPolicy ? (
          <Alert data-testid="upstream-cash-assumed-policy-warning">
            <AlertTitle>Unratified allocation policy</AlertTitle>
            <AlertDescription>
              Allocated under an assumed policy version that has not been owner-ratified.
            </AlertDescription>
          </Alert>
        ) : null}

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Case</dt>
          <dd className="font-mono text-xs" data-testid="upstream-cash-case-id">
            {origin.caseId}
          </dd>

          <dt className="text-muted-foreground">Run</dt>
          <dd className="font-mono text-xs">{origin.runId}</dd>

          <dt className="text-muted-foreground">Short payment</dt>
          <dd data-testid="upstream-cash-short-payment">
            {origin.shortPaymentAmount} {origin.currency}
          </dd>

          <dt className="text-muted-foreground">Validated reason</dt>
          <dd>
            <Badge data-testid="upstream-cash-validated-reason">{origin.validatedReason}</Badge>
          </dd>

          <dt className="text-muted-foreground">Provenance</dt>
          <dd data-testid="upstream-cash-provenance">{origin.provenanceMode}</dd>

          <dt className="text-muted-foreground">Cited records</dt>
          <dd data-testid="upstream-cash-cited-records">{origin.citedRecordCount}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}
