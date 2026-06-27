"use client";

import * as React from "react";
import { FileTextIcon, SearchIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AgentTracePanel } from "./agent-trace-panel.tsx";
import { CitedAnswerCard } from "./cited-answer-card.tsx";
import type {
  MayaEvidencePack,
  MayaMultimodalDock,
  MayaQueryPromptDockContract,
  QueryEvidenceBackendResponse,
  QueryEvidenceResponse
} from "./types.ts";

const QUERY_QUESTION_CHARACTER_LIMIT = 500;

interface QueryEvidenceDockProps {
  dock: MayaQueryPromptDockContract;
  evidencePack: MayaEvidencePack;
  onOpenChange: (open: boolean) => void;
  onResponse: (response: QueryEvidenceResponse) => void;
  open: boolean;
  recordIds: string[];
  selectedLine: string;
}

interface QueryEvidenceSnapshotEnvelope {
  evidenceIdentity: string;
  response: QueryEvidenceResponse;
}

export function QueryEvidenceDock({
  dock,
  evidencePack,
  onOpenChange,
  onResponse,
  open,
  recordIds,
  selectedLine
}: QueryEvidenceDockProps) {
  const questionId = React.useId();
  const questionHelpId = React.useId();
  const promptChipDescriptionPrefix = React.useId();
  const statusId = React.useId();
  const openRef = React.useRef(open);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const sessionTokenRef = React.useRef(0);
  const onResponseRef = React.useRef(onResponse);
  onResponseRef.current = onResponse;
  const selectedEvidenceIdentity = React.useMemo(
    () => buildSelectedEvidenceIdentity(selectedLine, recordIds),
    [recordIds, selectedLine]
  );
  const selectedEvidenceResetResponse = React.useMemo(
    () => buildStoppedQuerySnapshot(selectedLine, recordIds, evidencePack.recordIds),
    [evidencePack.recordIds, recordIds, selectedLine]
  );
  const selectedEvidenceResetResponseRef = React.useRef(selectedEvidenceResetResponse);
  selectedEvidenceResetResponseRef.current = selectedEvidenceResetResponse;
  const latestEvidenceIdentityRef = React.useRef(selectedEvidenceIdentity);
  latestEvidenceIdentityRef.current = selectedEvidenceIdentity;
  const resetEvidenceIdentityRef = React.useRef(selectedEvidenceIdentity);
  const [error, setError] = React.useState<string | undefined>();
  const [question, setQuestion] = React.useState("");
  const [submittedQuestion, setSubmittedQuestion] = React.useState("");
  const [snapshotEnvelope, setSnapshotEnvelope] = React.useState<QueryEvidenceSnapshotEnvelope | undefined>();
  const snapshot =
    snapshotEnvelope?.evidenceIdentity === selectedEvidenceIdentity ? snapshotEnvelope.response : undefined;
  const isRunning = snapshot?.status === "connecting";
  const canShowCitedAnswer =
    snapshot !== undefined &&
    snapshot.status === "answered" &&
    snapshot.answer !== undefined &&
    snapshot.answer.trim().length > 0 &&
    snapshot.deterministicBasis !== undefined &&
    snapshot.deterministicBasis.trim().length > 0 &&
    snapshot.recordIds.length > 0;
  const promptSuggestions = React.useMemo(
    () => dedupePromptSuggestions(dock.promptSuggestions ?? []),
    [dock.promptSuggestions]
  );
  const citedAnswerCard = canShowCitedAnswer ? <CitedAnswerCard evidencePack={evidencePack} response={snapshot} /> : null;

  const closeActiveSession = React.useCallback((options: { resetComposer?: boolean; resetParentTrace?: boolean } = {}) => {
    sessionTokenRef.current += 1;
    const abortController = abortControllerRef.current;
    abortControllerRef.current = null;
    abortController?.abort();
    if (options.resetParentTrace === true) {
      onResponseRef.current(selectedEvidenceResetResponseRef.current);
    }
    if (options.resetComposer !== false) {
      setError(undefined);
      setQuestion("");
      setSubmittedQuestion("");
    }
    setSnapshotEnvelope(undefined);
  }, []);

  React.useEffect(() => {
    if (openRef.current !== open) {
      openRef.current = open;
      if (!open) {
        closeActiveSession();
      }
    }
  }, [closeActiveSession, open]);

  React.useEffect(() => {
    if (resetEvidenceIdentityRef.current === selectedEvidenceIdentity) {
      return;
    }

    resetEvidenceIdentityRef.current = selectedEvidenceIdentity;
    closeActiveSession();
  }, [closeActiveSession, selectedEvidenceIdentity]);

  React.useEffect(() => {
    return () => {
      closeActiveSession({ resetComposer: false });
    };
  }, [closeActiveSession]);

  function isCurrentSession(sessionToken: number): boolean {
    return openRef.current && sessionTokenRef.current === sessionToken;
  }

  function publishForToken(sessionToken: number, evidenceIdentity: string, next: QueryEvidenceResponse): void {
    if (!isCurrentSession(sessionToken) || latestEvidenceIdentityRef.current !== evidenceIdentity) {
      return;
    }

    setSnapshotEnvelope({ evidenceIdentity, response: next });
    onResponse(next);
  }

  function handleOpenChange(nextOpen: boolean): void {
    openRef.current = nextOpen;
    if (!nextOpen) {
      closeActiveSession();
    }
    onOpenChange(nextOpen);
  }

  async function startQuery(): Promise<void> {
    const trimmedQuestion = question.trim();
    if (isRunning || trimmedQuestion.length === 0) {
      return;
    }

    const previousAbortController = abortControllerRef.current;
    abortControllerRef.current = null;
    const activeStartToken = sessionTokenRef.current + 1;
    sessionTokenRef.current = activeStartToken;
    const activeEvidenceIdentity = selectedEvidenceIdentity;
    previousAbortController?.abort();
    setError(undefined);
    setSubmittedQuestion(trimmedQuestion);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    publishForToken(activeStartToken, activeEvidenceIdentity, {
      citations: [],
      message: "Starting query.",
      recordIds,
      status: "connecting",
      trace: []
    });

    try {
      const response = await fetch("/api/forensics/query", {
        body: JSON.stringify({
          question: trimmedQuestion,
          recordIds,
          selectedLineId: selectedLine
        }),
        cache: "no-store",
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: abortController.signal,
      });

      if (!isCurrentSession(activeStartToken)) {
        return;
      }

      const body = (await response.json()) as QueryEvidenceBackendResponse | { error?: string };
      if (!response.ok) {
        const message = "error" in body && typeof body.error === "string" ? body.error : "Forensics query failed.";
        throw new Error(message);
      }

      publishForToken(
        activeStartToken,
        activeEvidenceIdentity,
        toQueryEvidenceSnapshot(body as QueryEvidenceBackendResponse, recordIds, selectedLine, evidencePack.recordIds)
      );
    } catch (caught) {
      if (!isCurrentSession(activeStartToken)) {
        return;
      }

      const failedSnapshot: QueryEvidenceResponse = {
        citations: [],
        message: caught instanceof Error ? caught.message : "Forensics query failed before returning a cited answer.",
        recordIds,
        status: "error",
        trace: []
      };
      setError(failedSnapshot.message);
      publishForToken(activeStartToken, activeEvidenceIdentity, failedSnapshot);
    }
  }

  return (
    <Sheet onOpenChange={handleOpenChange} open={open}>
      <SheetContent
        className="gap-0 data-[side=right]:sm:max-w-[var(--maya-query-dock-max-width)]"
        data-answer-mode={canShowCitedAnswer ? "review" : "drawer"}
        data-testid="maya-query-dock"
        overlayClassName="bg-transparent backdrop-blur-none supports-backdrop-filter:backdrop-blur-none"
        side="right"
        style={
          {
            "--maya-query-dock-max-width": canShowCitedAnswer ? "min(936px, calc(100vw - 280px))" : "456px",
            animation: "none",
            backgroundColor: "var(--bg-surface)",
            opacity: 1
          } as React.CSSProperties
        }
      >
        <SheetHeader className="gap-3">
          <SheetTitle>{canShowCitedAnswer ? "Cited response" : "Query Evidence"}</SheetTitle>
          <SheetDescription>
            {canShowCitedAnswer
              ? "Answer and source disclosures from the current evidence packet."
              : "Ask from the current evidence packet."}
          </SheetDescription>
          <div className="flex flex-wrap gap-2" aria-label="Query policy">
            <Badge variant="secondary">Selected evidence context</Badge>
            <Badge variant="secondary">Read-only query</Badge>
          </div>
        </SheetHeader>
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
          <Alert aria-label="Client-selected case context" data-testid="maya-selected-evidence-context">
            <FileTextIcon aria-hidden="true" data-icon="inline-start" />
            <AlertTitle>Selected evidence packet</AlertTitle>
            <AlertDescription>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span>Client-selected case context</span>
                  <Badge data-testid="maya-query-selected-line" variant="secondary">
                    {selectedLine}
                  </Badge>
                  <Badge variant="outline">{`${recordIds.length.toString()} records`}</Badge>
                  <Badge variant="outline">{`${evidencePack.documents.length.toString()} sources`}</Badge>
                </div>
              </div>
            </AlertDescription>
          </Alert>
          <Accordion collapsible type="single">
            <AccordionItem data-testid="maya-query-source-details" value="source-details">
              <AccordionTrigger>Source details</AccordionTrigger>
              <AccordionContent>
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5" aria-label="Selected evidence record IDs">
                    {recordIds.length === 0 ? (
                      <Badge data-testid="maya-query-record-id" variant="outline">
                        No record IDs
                      </Badge>
                    ) : (
                      recordIds.map((recordId) => (
                        <Badge
                          className="max-w-full truncate"
                          data-testid="maya-query-record-id"
                          key={recordId}
                          title={recordId}
                          variant="outline"
                        >
                          {recordId}
                        </Badge>
                      ))
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5" aria-label="Query source policy and modes">
                    <Badge variant="secondary">Selected evidence context</Badge>
                    <Badge variant="outline">{dock.policyLabel}</Badge>
                    {dock.modeOptions.map((mode) => (
                      <Badge key={mode} variant="outline">
                        {mode}
                      </Badge>
                    ))}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <div className="flex flex-wrap gap-2" aria-label="Backend suggested evidence questions">
            {promptSuggestions.map((prompt) => {
              const promptChipDescriptionId = buildPromptSuggestionDescriptionId(promptChipDescriptionPrefix, prompt);

              return (
                <React.Fragment key={buildPromptSuggestionKey(prompt)}>
                  <Button
                    aria-describedby={promptChipDescriptionId}
                    data-testid="maya-query-prompt-chip"
                    disabled={isRunning}
                    onClick={() => {
                      setQuestion(prompt.question);
                    }}
                    title={prompt.provenance.deterministicBasis}
                    type="button"
                    variant="outline"
                  >
                    {prompt.question}
                  </Button>
                  <span className="sr-only" id={promptChipDescriptionId}>
                    {buildPromptSuggestionDescription(prompt)}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={questionId}>Your question</FieldLabel>
              <InputGroup>
                <InputGroupTextarea
                  aria-describedby={`${statusId} ${questionHelpId}`}
                  data-testid="maya-query-input"
                  disabled={isRunning}
                  id={questionId}
                  maxLength={QUERY_QUESTION_CHARACTER_LIMIT}
                  onChange={(event) => {
                    setQuestion(event.target.value);
                  }}
                  placeholder={dock.promptPlaceholder}
                  value={question}
                />
                <InputGroupAddon align="block-end" className="justify-between">
                  <span>{`${question.length.toString()} / ${QUERY_QUESTION_CHARACTER_LIMIT.toString()}`}</span>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription id={questionHelpId}>
                Answers display only with cited evidence.
              </FieldDescription>
            </Field>
          </FieldGroup>
          <section
            aria-label="Maya evidence query conversation"
            className="grid min-w-0 gap-3"
            data-testid="maya-query-conversation"
          >
            {submittedQuestion.length > 0 ? (
              <div
                className="ml-auto grid max-w-[88%] min-w-0 gap-1 rounded-lg border bg-muted/25 p-3"
                data-testid="maya-submitted-query"
              >
                <span className="text-sm font-medium">You</span>
                <p className="text-sm text-muted-foreground" data-testid="maya-query-user-message">
                  {submittedQuestion}
                </p>
              </div>
            ) : null}
            <div id={statusId} aria-live="polite">
              {canShowCitedAnswer ? (
                <div className="grid min-w-0 gap-3">
                  <div className="grid min-w-0 gap-2 rounded-lg border bg-background p-3" data-testid="maya-query-assistant-message">
                    <span className="text-sm font-medium">Maya</span>
                    <p className="text-sm leading-6 text-muted-foreground" data-testid="maya-query-assistant-answer">
                      {displayAnswerWithoutInlineRecordIds(snapshot.answer ?? "", snapshot.recordIds)}
                    </p>
                    <div className="flex flex-wrap gap-1.5" aria-label="Assistant citation summary">
                      <Badge variant="secondary">{`${snapshot.citations.length.toString()} citations`}</Badge>
                      <Badge variant="outline">{`${snapshot.recordIds.length.toString()} record IDs`}</Badge>
                      <Badge variant="outline">Basis available in trace details</Badge>
                    </div>
                  </div>
                  {citedAnswerCard}
                </div>
              ) : error !== undefined ? (
                <Alert variant="destructive">
                  <AlertTitle>Query error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : snapshot === undefined ? (
                <Alert data-testid="maya-query-readiness-preview">
                  <AlertTitle>Ready for an evidence-backed question</AlertTitle>
                  <AlertDescription>
                    <div className="flex flex-col gap-2">
                      <span>Maya will answer inside this conversation and keep sources behind details.</span>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : snapshot.status === "blocked" ? (
                <Alert>
                  <AlertTitle>{snapshot.message}</AlertTitle>
                  <AlertDescription>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{`${snapshot.recordIds.length.toString()} records`}</Badge>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : snapshot.status === "error" ? (
                <Alert variant="destructive">
                  <AlertTitle>Query error</AlertTitle>
                  <AlertDescription>{snapshot.message}</AlertDescription>
                </Alert>
              ) : isRunning ? (
                <div className="grid min-w-0 gap-2 rounded-lg border bg-background p-3" data-testid="maya-query-assistant-message">
                  <span className="text-sm font-medium">Maya</span>
                  <p className="text-sm leading-6 text-muted-foreground">Maya is checking evidence.</p>
                  <div className="flex flex-wrap gap-1.5" aria-label="Assistant running summary">
                    <Badge variant="secondary">Checking citations</Badge>
                    <Badge variant="outline">{`${snapshot.recordIds.length.toString()} records`}</Badge>
                  </div>
                </div>
              ) : (
                <Alert>
                  <AlertTitle>{snapshot.message}</AlertTitle>
                  <AlertDescription>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{`${snapshot.recordIds.length.toString()} records`}</Badge>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </section>
          <Accordion collapsible type="single">
            <AccordionItem data-testid="maya-query-trace-details" value="trace-details">
              <AccordionTrigger>Trace details</AccordionTrigger>
              <AccordionContent>
                {snapshot !== undefined ? (
                  <AgentTracePanel
                    evidencePack={evidencePack}
                    recordIds={recordIds}
                    response={snapshot}
                    selectedLine={selectedLine}
                  />
                ) : null}
                {snapshot === undefined ? (
                  <Alert>
                    <AlertTitle>Trace unavailable</AlertTitle>
                    <AlertDescription>Run a query to load trace details.</AlertDescription>
                  </Alert>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
        <SheetFooter className="border-t sm:flex-row sm:items-center sm:justify-between">
          {isRunning ? (
            <Button
              className="sm:w-auto"
              onClick={() => {
                closeActiveSession({ resetComposer: false, resetParentTrace: true });
              }}
              type="button"
              variant="outline"
            >
              Stop query
            </Button>
          ) : (
            <Button
              className="sm:w-auto"
              disabled={question.trim().length === 0}
              onClick={() => {
                void startQuery();
              }}
              type="button"
            >
              <SearchIcon data-icon="inline-start" />
              Run query
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function toQueryEvidenceSnapshot(
  response: QueryEvidenceBackendResponse,
  recordIds: readonly string[],
  selectedLine: string,
  evidencePackRecordIds: readonly string[]
): QueryEvidenceResponse {
  const selectedScopeRecordIds = dedupeRecordIds([selectedLine, ...recordIds, ...evidencePackRecordIds]);
  const selectedScope = new Set(selectedScopeRecordIds);
  const citedRecordIds = dedupeRecordIds(response.citations.map((citation) => citation.recordId));
  const citationsWithinSelectedScope = response.citations.every((citation) =>
    selectedScope.has(citation.recordId.trim())
  );
  const citationsHaveBasis = response.citations.every((citation) => citation.deterministicBasis.trim().length > 0);
  const blockedRecordIds = dedupeRecordIds([...citedRecordIds, ...selectedScopeRecordIds]);
  const hasAnswer =
    response.answer !== undefined &&
    response.answer.trim().length > 0 &&
    response.deterministicBasis !== undefined &&
    response.deterministicBasis.trim().length > 0 &&
    response.citations.length > 0 &&
    response.trace.length > 0 &&
    citationsWithinSelectedScope &&
    citationsHaveBasis;
  let message = "Forensics query returned no cited answer.";
  if (hasAnswer) {
    message = "Cited answer returned from selected evidence.";
  } else if (!citationsWithinSelectedScope) {
    message = "Forensics query cited records outside the selected evidence packet.";
  }
  const modelExecutionField =
    response.modelExecution === undefined ? {} : { modelExecution: response.modelExecution };

  if (hasAnswer && response.answer !== undefined && response.deterministicBasis !== undefined) {
    return {
      ...modelExecutionField,
      answer: response.answer,
      citations: response.citations,
      deterministicBasis: response.deterministicBasis,
      message,
      recordIds: citedRecordIds,
      status: "answered",
      trace: response.trace
    };
  }

  return {
    ...modelExecutionField,
    citations: response.citations,
    message,
    recordIds: blockedRecordIds,
    status: "blocked",
    trace: response.trace
  };
}

function buildSelectedEvidenceIdentity(selectedLine: string, recordIds: readonly string[]): string {
  return JSON.stringify({ recordIds: recordIds.map((recordId) => recordId.trim()), selectedLine: selectedLine.trim() });
}

function buildStoppedQuerySnapshot(
  selectedLine: string,
  recordIds: readonly string[],
  evidencePackRecordIds: readonly string[]
): QueryEvidenceResponse {
  return {
    citations: [],
    message: "Query stopped; selected evidence process map is ready.",
    recordIds: dedupeRecordIds([selectedLine, ...recordIds, ...evidencePackRecordIds]),
    status: "blocked",
    trace: []
  };
}

function buildPromptSuggestionKey(prompt: NonNullable<MayaMultimodalDock["promptSuggestions"]>[number]): string {
  return JSON.stringify({
    deterministicBasis: prompt.provenance.deterministicBasis.trim(),
    label: prompt.label.trim(),
    question: prompt.question.trim(),
    recordIds: dedupeRecordIds([...prompt.recordIds, ...prompt.provenance.recordIds]).sort()
  });
}

function buildPromptSuggestionDescriptionId(
  prefix: string,
  prompt: NonNullable<MayaMultimodalDock["promptSuggestions"]>[number]
): string {
  return `${prefix}-${buildPromptSuggestionKey(prompt).replace(/[^A-Za-z0-9_-]/gu, "-")}`;
}

function buildPromptSuggestionDescription(prompt: NonNullable<MayaMultimodalDock["promptSuggestions"]>[number]): string {
  const recordIds = dedupeRecordIds([...prompt.recordIds, ...prompt.provenance.recordIds]);
  return `Basis: ${prompt.provenance.deterministicBasis}. Record IDs: ${
    recordIds.length === 0 ? "No record IDs" : recordIds.join(", ")
  }.`;
}

function dedupeRecordIds(recordIds: readonly string[]): string[] {
  return [...new Set(recordIds.map((recordId) => recordId.trim()).filter((recordId) => recordId.length > 0))];
}

function dedupePromptSuggestions(
  prompts: readonly NonNullable<MayaMultimodalDock["promptSuggestions"]>[number][]
): NonNullable<MayaMultimodalDock["promptSuggestions"]> {
  const seen = new Set<string>();
  return prompts.filter((prompt) => {
    const normalizedQuestion = prompt.question.trim().replace(/\s+/gu, " ").toLowerCase();
    if (normalizedQuestion.length === 0 || seen.has(normalizedQuestion)) {
      return false;
    }
    seen.add(normalizedQuestion);
    return true;
  }).slice(0, 4);
}

function displayAnswerWithoutInlineRecordIds(answer: string, recordIds: readonly string[]): string {
  const trimmedAnswer = answer.trim();
  const withoutTrailingRecordList = trimmedAnswer
    .replace(/\s*(?:The answer is limited to cited record IDs|Cited record IDs|Record IDs)\s*:\s*[^.]+\.?\s*$/iu, "")
    .trim();
  const redacted = [...recordIds]
    .sort((left, right) => right.length - left.length)
    .reduce((current, recordId) => {
      const escapedRecordId = escapeRegExp(recordId);
      return current
        .replace(new RegExp(`\\bLine\\s+${escapedRecordId}\\b`, "gu"), "The selected line")
        .replace(new RegExp(escapedRecordId, "gu"), "a cited record");
    }, withoutTrailingRecordList)
    .replace(/\s+/gu, " ")
    .trim();

  return redacted.length === 0 ? "Answer details are available with citations in source details." : redacted;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
