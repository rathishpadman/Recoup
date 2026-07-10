"use client";

import * as React from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  Loader2Icon,
  MessageSquareTextIcon,
  SendIcon,
  WandSparklesIcon
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CreditRiskAccountModel, CreditRiskQueryResponse, CreditRiskReviewModel } from "../../app/cockpit-data.ts";
import { davidBadgeVariantByTone } from "./david-verdict-tokens.ts";

interface DavidCopilotDockProps {
  activeSuggestionId: string | null;
  copilot: CreditRiskReviewModel["copilot"];
  onActivateSuggestion: (suggestionId: CreditRiskReviewModel["copilot"]["suggestions"][number]["suggestionId"]) => void;
  selectedAccount?: CreditRiskAccountModel | undefined;
  timelineVisibleCount: number;
}

interface CreditQueryState {
  error?: string | undefined;
  question: string;
  response?: CreditRiskQueryResponse | undefined;
  status: "error" | "idle" | "loading" | "success";
}

export function DavidCopilotDock({
  activeSuggestionId,
  copilot,
  onActivateSuggestion,
  selectedAccount,
  timelineVisibleCount
}: Readonly<DavidCopilotDockProps>) {
  const activeSuggestion = copilot.suggestions.find((suggestion) => suggestion.suggestionId === activeSuggestionId);
  const defaultQuestion =
    activeSuggestion?.question ??
    (selectedAccount === undefined
      ? "Which account should I open first?"
      : `Why is ${selectedAccount.customer} ${selectedAccount.verdict.toLowerCase()} risk?`);
  const [queryText, setQueryText] = React.useState(defaultQuestion);
  const [queryStates, setQueryStates] = React.useState<Record<string, CreditQueryState>>({});
  const selectedAccountId = selectedAccount?.accountId;
  const queryState = selectedAccountId === undefined ? undefined : queryStates[selectedAccountId];

  const runCreditQuery = React.useCallback(
    async (question: string) => {
      if (selectedAccount === undefined) {
        return;
      }

      const normalizedQuestion = question.trim();
      if (normalizedQuestion.length === 0) {
        return;
      }

      setQueryStates((current) => ({
        ...current,
        [selectedAccount.accountId]: {
          question: normalizedQuestion,
          status: "loading"
        }
      }));

      try {
        const response = await fetch("/api/credit/query", {
          body: JSON.stringify({
            accountId: selectedAccount.accountId,
            question: normalizedQuestion,
            recordIds: selectedAccount.recordIds
          }),
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json"
          },
          method: "POST"
        });
        const body = (await response.json()) as CreditRiskQueryResponse | { error?: string };
        if (!response.ok) {
          throw new Error("error" in body && typeof body.error === "string" ? body.error : "Credit risk query failed.");
        }

        setQueryStates((current) => ({
          ...current,
          [selectedAccount.accountId]: {
            question: normalizedQuestion,
            response: body as CreditRiskQueryResponse,
            status: "success"
          }
        }));
      } catch (error) {
        setQueryStates((current) => ({
          ...current,
          [selectedAccount.accountId]: {
            error: error instanceof Error ? error.message : "Credit risk query failed.",
            question: normalizedQuestion,
            status: "error"
          }
        }));
      }
    },
    [selectedAccount]
  );

  React.useEffect(() => {
    setQueryText(defaultQuestion);
  }, [defaultQuestion]);

  React.useEffect(() => {
    if (selectedAccount === undefined) {
      return;
    }

    const existing = queryStates[selectedAccount.accountId];
    if (existing !== undefined) {
      return;
    }

    void runCreditQuery(defaultQuestion);
  }, [defaultQuestion, queryStates, runCreditQuery, selectedAccount]);

  const isLoading = queryState?.status === "loading";
  const liveResponse = queryState?.response;

  return (
    <aside className="grid gap-4 xl:sticky xl:top-5 xl:self-start" data-testid="david-copilot-dock">
      <Card className="rounded-lg shadow-[var(--shadow-xs)]">
        <CardHeader className="gap-3">
          <div className="grid gap-1">
            <CardTitle className="text-base">{copilot.title}</CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{copilot.conductorLabel}</span>
              <span>·</span>
              <span>{copilot.readinessLabel}</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{copilot.note}</p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void runCreditQuery(queryText);
            }}
          >
            <div className="flex gap-2">
              <Input
                aria-label="Ask David credit copilot"
                disabled={selectedAccount === undefined || isLoading}
                onChange={(event) => {
                  setQueryText(event.target.value);
                }}
                placeholder="Ask about selected account evidence"
                value={queryText}
              />
              <Button disabled={selectedAccount === undefined || isLoading || queryText.trim().length === 0} type="submit">
                {isLoading ? <Loader2Icon aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : <SendIcon aria-hidden="true" data-icon="inline-start" />}
                Ask
              </Button>
            </div>
          </form>

          <div className="grid gap-2">
            {copilot.suggestions.map((suggestion) => (
              <Button
                className="justify-start"
                key={suggestion.suggestionId}
                onClick={() => {
                  onActivateSuggestion(suggestion.suggestionId);
                  setQueryText(suggestion.question);
                }}
                type="button"
                variant={activeSuggestionId === suggestion.suggestionId ? "secondary" : "outline"}
              >
                <MessageSquareTextIcon aria-hidden="true" data-icon="inline-start" />
                <span className="truncate">{suggestion.question}</span>
              </Button>
            ))}
          </div>

          {selectedAccount === undefined ? (
            <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              Select an account to start the live credit investigation.
            </div>
          ) : (
            <div className="grid gap-3" data-testid="david-copilot-active-state">
              <div className="grid gap-2 rounded-lg border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={davidBadgeVariantByTone[selectedAccount.verdictTone]}>{selectedAccount.verdict}</Badge>
                  <Badge variant="outline">{selectedAccount.customer}</Badge>
                  {isLoading ? <Badge variant="secondary">Running</Badge> : null}
                </div>
                <p className="text-sm text-muted-foreground">{selectedAccount.copilotConductorLine}</p>
              </div>

              <LiveQueryPanel queryState={queryState} response={liveResponse} />

              <div className="grid gap-2">
                {selectedAccount.assessmentSteps.slice(0, 4).map((step, index) => {
                  const state =
                    index < timelineVisibleCount
                      ? "done"
                      : index === timelineVisibleCount && timelineVisibleCount < selectedAccount.assessmentSteps.length
                        ? "current"
                        : "pending";

                  return (
                    <div className="flex items-start gap-3 rounded-lg border bg-background/80 p-3" data-testid="david-copilot-checklist-step" key={step.key}>
                      <span className="mt-0.5">
                        {state === "done" ? (
                          <CheckCircle2Icon aria-hidden="true" className="size-4 text-emerald-600 dark:text-emerald-300" />
                        ) : state === "current" ? (
                          <WandSparklesIcon aria-hidden="true" className="size-4 text-primary" />
                        ) : (
                          <CircleDashedIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                        )}
                      </span>
                      <div className="grid gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{step.agentName}</span>
                          <Badge variant="outline">{state === "done" ? "Done" : state === "current" ? "Assessing" : "Queued"}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{step.foundLine}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </aside>
  );
}

type CreditRiskModelExecution = NonNullable<CreditRiskQueryResponse["modelExecution"]>;

function modelExecutionLabel(mode: CreditRiskModelExecution["mode"] | undefined): string {
  if (mode === "live_openai_agents") {
    return "Live agents";
  }
  if (mode === "blocked_missing_credentials") {
    return "Credentials blocked";
  }
  if (mode === "blocked_live_agent_trace") {
    return "Trace blocked";
  }

  return "Unavailable";
}

function sourceReadModeLabel(mode: CreditRiskModelExecution["sourceReadMode"]): string {
  if (mode === "live_sdk_mcp") {
    return "SDK source read";
  }

  return "Governed source read";
}

function rawModelTextPolicyLabel(policy: CreditRiskModelExecution["rawModelTextPolicy"]): string {
  if (policy === "suppressed") {
    return "Raw model text suppressed";
  }

  return "Raw model text unavailable";
}

function LiveQueryPanel({
  queryState,
  response
}: Readonly<{ queryState?: CreditQueryState | undefined; response?: CreditRiskQueryResponse | undefined }>) {
  if (queryState === undefined || queryState.status === "idle") {
    return (
      <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        Open an account to run the selected-account investigation.
      </div>
    );
  }

  if (queryState.status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3 text-sm" data-testid="david-copilot-live-loading">
        <Loader2Icon aria-hidden="true" className="size-4 animate-spin text-primary" />
        <span>Running Credit Sentinel live trace.</span>
      </div>
    );
  }

  if (queryState.status === "error") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-destructive/35 bg-destructive/5 p-3 text-sm" data-testid="david-copilot-live-error">
        <AlertCircleIcon aria-hidden="true" className="mt-0.5 size-4 text-destructive" />
        <span>{queryState.error}</span>
      </div>
    );
  }

  if (response === undefined) {
    return null;
  }

  const modelExecution = response.modelExecution;
  const tokenUsage = modelExecution?.tokenUsage ?? modelExecution?.tokenUsageSnapshot?.totalTokens;
  const cachedTokens = modelExecution?.promptCache?.cachedTokens ?? modelExecution?.tokenUsageSnapshot?.cachedTokens;

  return (
    <div className="grid gap-3 rounded-lg border bg-background/85 p-3" data-testid="david-copilot-live-result">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={modelExecution?.mode === "live_openai_agents" ? "secondary" : "outline"}>
          {modelExecutionLabel(modelExecution?.mode)}
        </Badge>
        {modelExecution?.sourceReadMode === undefined ? null : (
          <Badge variant="outline">{sourceReadModeLabel(modelExecution.sourceReadMode)}</Badge>
        )}
        {modelExecution?.handoffCount === undefined ? null : <Badge variant="outline">{`${modelExecution.handoffCount.toString()} handoff`}</Badge>}
        {tokenUsage === undefined ? null : <Badge variant="outline">{`${tokenUsage.toString()} tokens`}</Badge>}
        {cachedTokens === undefined ? null : <Badge variant="outline">{`${cachedTokens.toString()} cached`}</Badge>}
      </div>
      {response.answer === undefined ? (
        <p className="text-sm text-muted-foreground">{modelExecution?.reason ?? "Live investigation is unavailable."}</p>
      ) : (
        <p className="text-sm font-medium">{response.answer}</p>
      )}
      {response.policyRationale === undefined ? null : <DavidPolicyRationalePanel rationale={response.policyRationale} />}
      {response.negotiationDraft === undefined ? null : <DavidNegotiationDraftPanel draft={response.negotiationDraft} />}
      <div className="grid gap-2 text-xs text-muted-foreground">
        <span>{`${response.citations.length.toString()} citations · ${response.trace.length.toString()} trace rows`}</span>
        {modelExecution?.rawModelTextPolicy === undefined ? null : <span>{rawModelTextPolicyLabel(modelExecution.rawModelTextPolicy)}</span>}
      </div>
      <div className="grid gap-1">
        {response.trace.slice(0, 3).map((event, index) => (
          <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-2 py-1 text-xs" key={`${event.agentName}-${event.hook}-${String(index)}`}>
            <span className="truncate">{event.agentName}</span>
            <span className="truncate text-muted-foreground">{event.toolName ?? event.hook}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DavidPolicyRationalePanel({
  rationale
}: Readonly<{ rationale: NonNullable<CreditRiskQueryResponse["policyRationale"]> }>) {
  const firstCitation = rationale.citations[0];

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/15 p-3" data-testid="david-copilot-policy-rationale">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={rationale.status === "available" ? "secondary" : "outline"}>Policy rationale</Badge>
        <Badge variant="outline">{rationale.message}</Badge>
      </div>
      <div className="grid gap-1 text-sm">
        <span className="font-medium">Exact policy row</span>
        <span className="text-muted-foreground">
          {rationale.executablePolicySource} / {rationale.policyKey} = {rationale.policyValueText}
        </span>
      </div>
      {firstCitation === undefined ? (
        <p className="text-sm text-muted-foreground">No vector rationale citation is available for this policy question.</p>
      ) : (
        <div className="grid gap-1 text-sm">
          <span className="font-medium">Vector rationale</span>
          <span className="text-muted-foreground">{firstCitation.content}</span>
          <span className="text-xs text-muted-foreground">{firstCitation.recordId}</span>
        </div>
      )}
      <div className="grid gap-1 text-xs text-muted-foreground">
        <span>Policy hash {rationale.policyHash.slice(0, 12)}</span>
        <span>{rationale.deterministicBasis}</span>
      </div>
    </div>
  );
}

export function DavidNegotiationDraftPanel({
  draft
}: Readonly<{ draft: NonNullable<CreditRiskQueryResponse["negotiationDraft"]> }>) {
  const topCandidate = draft.model.rankedCandidates[0];

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/15 p-3" data-testid="david-copilot-negotiation-draft">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Agent-drafted</Badge>
        <Badge variant="outline">Engine-priced</Badge>
        <Badge variant="outline">{draft.model.orderId}</Badge>
      </div>
      {topCandidate === undefined ? (
        <p className="text-sm text-muted-foreground">No policy-valid agent-drafted option was priced by the deterministic engine.</p>
      ) : (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="grid gap-1">
              <span className="text-sm font-medium">{topCandidate.candidateId}</span>
              <span className="text-xs text-muted-foreground">
                {topCandidate.terms.releasePctLabel} / {topCandidate.terms.depositPctLabel} / {topCandidate.terms.trancheCountLabel}
              </span>
            </div>
            <strong className="text-sm">{topCandidate.objectiveValueLabel}</strong>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{topCandidate.terms.collateralRatioLabel}</span>
            <span>{topCandidate.terms.financingSpreadLabel}</span>
            <span>{topCandidate.scenarioCount.toString()} scenarios</span>
          </div>
        </div>
      )}
      {draft.model.rejectedCandidates.length === 0 ? null : (
        <div className="grid gap-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Rejected structures</span>
          {draft.model.rejectedCandidates.map((candidate) => (
            <span key={candidate.candidateId}>
              {candidate.candidateId}: {candidate.reason}
            </span>
          ))}
        </div>
      )}
      <div className="grid gap-1 text-xs text-muted-foreground">
        <span>Source hash {draft.model.sourceHash.slice(0, 12)}</span>
        <span>Policy hash {draft.model.policyHash.slice(0, 12)}</span>
        <span>{draft.deterministicBasis}</span>
      </div>
    </div>
  );
}
