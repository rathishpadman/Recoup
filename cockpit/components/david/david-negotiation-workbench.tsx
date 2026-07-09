"use client";

import * as React from "react";
import { AlertCircleIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CreditRiskAccountModel, DealOptimizerModel } from "../../app/cockpit-data.ts";
import { DavidRecordDisclosure } from "./david-record-disclosure.tsx";

const negotiationOrdersByAccountId: Readonly<Record<string, string>> = {
  "ACC-HAR": "ORD-HARBOR-6534"
};

export function DavidNegotiationWorkbench({ account }: Readonly<{ account: CreditRiskAccountModel }>) {
  const orderId = negotiationOrdersByAccountId[account.accountId];
  const [open, setOpen] = React.useState(false);
  const [model, setModel] = React.useState<DealOptimizerModel | undefined>();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (!open || orderId === undefined || model !== undefined || loading) {
      return;
    }

    const abortController = new AbortController();
    setLoading(true);
    setError(undefined);

    void fetch(`/api/credit/orders/${encodeURIComponent(orderId)}/deals`, {
      cache: "no-store",
      signal: abortController.signal
    })
      .then(async (response) => {
        const body = (await response.json()) as unknown;
        if (!response.ok) {
          const message = readErrorMessage(body) ?? "Credit deal optimizer service unavailable.";
          throw new Error(message);
        }
        setModel(body as DealOptimizerModel);
      })
      .catch((fetchError: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }
        setError(fetchError instanceof Error ? fetchError.message : "Credit deal optimizer service unavailable.");
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [loading, model, open, orderId]);

  if (orderId === undefined) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button disabled type="button" variant="outline">
                <SparklesIcon aria-hidden="true" data-icon="inline-start" />
                Simulate alternatives
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>No governed order source for this account.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button data-testid="david-simulate-alternatives" type="button" variant="outline">
          <SparklesIcon aria-hidden="true" data-icon="inline-start" />
          Simulate alternatives
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-3xl" data-testid="david-negotiation-workbench">
        <SheetHeader className="gap-2">
          <SheetTitle>Fulfilment & Terms Negotiation</SheetTitle>
          <SheetDescription>Read-only expected-value ranking for {account.customer}. Approvals and sends stay gated.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Order {orderId}</Badge>
            <Badge variant="outline">Synthetic 3PL</Badge>
            <Badge variant="outline">POS sell-through</Badge>
            <Badge variant="outline">Cost of capital</Badge>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
              <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
              Loading deterministic deal ranking...
            </div>
          ) : error !== undefined ? (
            <Alert variant="destructive">
              <AlertCircleIcon aria-hidden="true" data-icon="inline-start" />
              <AlertTitle>Deal optimizer unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : model === undefined ? null : (
            <DealOptimizerView model={model} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DealOptimizerView({ model }: Readonly<{ model: DealOptimizerModel }>) {
  const topCandidate = model.rankedCandidates[0];
  return (
    <div className="grid gap-4">
      {topCandidate === undefined ? (
        <Alert variant="destructive">
          <AlertTitle>No ranked deal</AlertTitle>
          <AlertDescription>The deterministic optimizer returned no valid candidates.</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-2 rounded-lg border bg-muted/15 p-3">
          <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Why this ranks first</span>
          <p className="text-sm">
            {topCandidate.candidateId} ranks first at {topCandidate.objectiveValueLabel} across{" "}
            {topCandidate.scenarioCount.toString()} deterministic scenarios.
          </p>
          <div className="grid gap-1 text-xs text-muted-foreground">
            <span>Source hash {model.sourceHash.slice(0, 12)}</span>
            <span>Policy hash {model.policyHash.slice(0, 12)}</span>
          </div>
        </div>
      )}

      <div className="grid gap-3">
        {model.rankedCandidates.map((candidate) => (
          <div className="grid gap-3 rounded-lg border bg-background/80 p-3" key={candidate.candidateId}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={candidate.rank === 1 ? "default" : "outline"}>Rank {candidate.rank.toString()}</Badge>
                  <span className="font-medium">{candidate.candidateId}</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{candidate.terms.releasePctLabel}</span>
                  <span>{candidate.terms.depositPctLabel}</span>
                  <span>{candidate.terms.trancheCountLabel}</span>
                  <span>{candidate.terms.collateralRatioLabel}</span>
                  <span>{candidate.terms.financingSpreadLabel}</span>
                </div>
              </div>
              <strong className="text-base">{candidate.objectiveValueLabel}</strong>
            </div>
            <DavidRecordDisclosure items={candidate.sourceRecordIds} label={`${candidate.sourceRecordIds.length.toString()} cited source records`} />
          </div>
        ))}
      </div>

      {model.rejectedCandidates.length === 0 ? null : (
        <div className="grid gap-2 rounded-lg border bg-muted/15 p-3">
          <span className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Rejected structures</span>
          {model.rejectedCandidates.map((candidate) => (
            <div className="text-sm text-muted-foreground" key={candidate.candidateId}>
              {candidate.candidateId}: {candidate.reason}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function readErrorMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return typeof record.error === "string" ? record.error : undefined;
}
