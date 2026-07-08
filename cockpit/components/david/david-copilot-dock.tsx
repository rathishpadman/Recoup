"use client";

import { CheckCircle2Icon, CircleDashedIcon, MessageSquareTextIcon, WandSparklesIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CreditRiskAccountModel, CreditRiskReviewModel } from "../../app/cockpit-data.ts";
import { davidBadgeVariantByTone } from "./david-verdict-tokens.ts";

interface DavidCopilotDockProps {
  activeSuggestionId: string | null;
  copilot: CreditRiskReviewModel["copilot"];
  onActivateSuggestion: (suggestionId: CreditRiskReviewModel["copilot"]["suggestions"][number]["suggestionId"]) => void;
  selectedAccount?: CreditRiskAccountModel | undefined;
  timelineVisibleCount: number;
}

export function DavidCopilotDock({
  activeSuggestionId,
  copilot,
  onActivateSuggestion,
  selectedAccount,
  timelineVisibleCount
}: Readonly<DavidCopilotDockProps>) {
  const activeSuggestion = copilot.suggestions.find((suggestion) => suggestion.suggestionId === activeSuggestionId);

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
          <Input disabled placeholder={copilot.disabledInputPlaceholder} />

          <div className="grid gap-2">
            {copilot.suggestions.map((suggestion) => (
              <Button
                className="justify-start"
                key={suggestion.suggestionId}
                onClick={() => {
                  onActivateSuggestion(suggestion.suggestionId);
                }}
                type="button"
                variant={activeSuggestionId === suggestion.suggestionId ? "secondary" : "outline"}
              >
                <MessageSquareTextIcon aria-hidden="true" data-icon="inline-start" />
                <span className="truncate">{suggestion.question}</span>
              </Button>
            ))}
          </div>

          {activeSuggestion === undefined ? (
            <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              Select a suggested prompt to replay the assessment path for the current account.
            </div>
          ) : selectedAccount === undefined ? (
            <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              Select an account to populate the copilot checklist.
            </div>
          ) : (
            <div className="grid gap-3" data-testid="david-copilot-active-state">
              <div className="grid gap-2 rounded-lg border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={davidBadgeVariantByTone[selectedAccount.verdictTone]}>{selectedAccount.verdict}</Badge>
                  <Badge variant="outline">{selectedAccount.customer}</Badge>
                </div>
                <div className="font-medium">{activeSuggestion.question}</div>
                <p className="text-sm text-muted-foreground">{selectedAccount.copilotConductorLine}</p>
              </div>

              <div className="grid gap-2">
                {selectedAccount.assessmentSteps.map((step, index) => {
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
