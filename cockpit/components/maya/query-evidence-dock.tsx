"use client";

import * as React from "react";
import { FileTextIcon, SearchIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  startRealtimeBrowserSession,
  type RealtimeBrowserSession,
  type RealtimeBrowserSessionSnapshot
} from "../../app/realtime-browser-session.ts";
import { AgentTracePanel } from "./agent-trace-panel.tsx";
import { CitedAnswerCard } from "./cited-answer-card.tsx";
import type { MayaEvidencePack, MayaMultimodalDock, QueryEvidenceResponse } from "./types.ts";

const QUERY_QUESTION_CHARACTER_LIMIT = 500;

interface QueryEvidenceDockProps {
  dock: MayaMultimodalDock;
  evidencePack: MayaEvidencePack;
  onOpenChange: (open: boolean) => void;
  onResponse: (response: QueryEvidenceResponse) => void;
  open: boolean;
  recordIds: string[];
  selectedLine: string;
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
  const statusId = React.useId();
  const openRef = React.useRef(open);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const sessionRef = React.useRef<RealtimeBrowserSession | null>(null);
  const sessionTokenRef = React.useRef(0);
  const [error, setError] = React.useState<string | undefined>();
  const [question, setQuestion] = React.useState("");
  const [submittedQuestion, setSubmittedQuestion] = React.useState("");
  const [snapshot, setSnapshot] = React.useState<RealtimeBrowserSessionSnapshot | undefined>();
  const isRunning = snapshot?.status === "connecting" || snapshot?.status === "connected";
  const canShowCitedAnswer =
    snapshot !== undefined &&
    snapshot.status === "answered" &&
    snapshot.answer !== undefined &&
    snapshot.answer.trim().length > 0 &&
    snapshot.deterministicBasis !== undefined &&
    snapshot.deterministicBasis.trim().length > 0 &&
    snapshot.recordIds.length > 0;
  const shouldShowComposer = !isRunning && !canShowCitedAnswer;

  const closeActiveSession = React.useCallback((clearLocalState = true) => {
    sessionTokenRef.current += 1;
    const abortController = abortControllerRef.current;
    abortControllerRef.current = null;
    abortController?.abort();
    const session = sessionRef.current;
    sessionRef.current = null;
    session?.close();
    if (clearLocalState) {
      setError(undefined);
      setQuestion("");
      setSubmittedQuestion("");
      setSnapshot(undefined);
    }
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
    return () => {
      closeActiveSession(false);
    };
  }, [closeActiveSession]);

  function isCurrentSession(sessionToken: number): boolean {
    return openRef.current && sessionTokenRef.current === sessionToken;
  }

  function publishForToken(sessionToken: number, next: RealtimeBrowserSessionSnapshot): void {
    if (!isCurrentSession(sessionToken)) {
      return;
    }

    setSnapshot(next);
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

    const session = sessionRef.current;
    sessionRef.current = null;
    const previousAbortController = abortControllerRef.current;
    abortControllerRef.current = null;
    const activeStartToken = sessionTokenRef.current + 1;
    sessionTokenRef.current = activeStartToken;
    previousAbortController?.abort();
    session?.close();
    setError(undefined);
    setSubmittedQuestion(trimmedQuestion);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    publishForToken(activeStartToken, {
      message: "Starting evidence query through the Realtime browser helper.",
      recordIds,
      status: "connecting"
    });

    try {
      const session = await startRealtimeBrowserSession({
        onSnapshot: (nextSnapshot) => {
          publishForToken(activeStartToken, nextSnapshot);
        },
        question: trimmedQuestion,
        recordIds,
        signal: abortController.signal,
        selectedLineId: selectedLine
      });
      if (!isCurrentSession(activeStartToken)) {
        session.close();
        return;
      }
      sessionRef.current = session;
      publishForToken(activeStartToken, session.getSnapshot());
    } catch {
      if (!isCurrentSession(activeStartToken)) {
        return;
      }

      const failedSnapshot: RealtimeBrowserSessionSnapshot = {
        message: "Realtime browser helper failed before returning a cited answer.",
        recordIds,
        status: "error"
      };
      setError(failedSnapshot.message);
      publishForToken(activeStartToken, failedSnapshot);
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
          <SheetTitle>{canShowCitedAnswer ? "Answer review" : "Query Evidence"}</SheetTitle>
          <SheetDescription>
            {canShowCitedAnswer
              ? "Accepted answer, deterministic basis, and cited records from the current evidence packet."
              : "Ask from the current evidence packet; selected IDs are included as client context."}
          </SheetDescription>
          <div className="flex flex-wrap gap-2" aria-label="Query policy and modes">
            <Badge variant="secondary">Selected evidence context</Badge>
            <Badge variant="outline">Read-only query</Badge>
            <Badge variant="outline">{dock.policyLabel}</Badge>
            {dock.modeOptions.map((mode) => (
              <Badge key={mode} variant="outline">
                {mode}
              </Badge>
            ))}
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
                </div>
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
              </div>
            </AlertDescription>
          </Alert>
          {shouldShowComposer ? (
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
                    <span>{dock.languageLabel}</span>
                  </InputGroupAddon>
                </InputGroup>
                <FieldDescription id={questionHelpId}>
                  Results must include cited record IDs before display.
                </FieldDescription>
              </Field>
            </FieldGroup>
          ) : null}
          {submittedQuestion.length > 0 ? (
            <div className="grid min-w-0 gap-1 rounded-lg border bg-muted/25 p-3" data-testid="maya-submitted-query">
              <span className="text-sm font-medium">Submitted query</span>
              <p className="text-sm text-muted-foreground">{submittedQuestion}</p>
            </div>
          ) : null}
          <div id={statusId} aria-live="polite">
            {canShowCitedAnswer ? null : error !== undefined ? (
              <Alert variant="destructive">
                <AlertTitle>Query error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : snapshot === undefined ? (
              <Alert data-testid="maya-query-readiness-preview">
                <AlertTitle>Ready for cited query</AlertTitle>
                <AlertDescription>
                  <div className="flex flex-col gap-2">
                    <span>No query is running. Read-model trace context is shown as a readiness preview only.</span>
                    <div className="flex flex-wrap gap-1.5" aria-label="Readiness preview agents">
                      {dock.subAgents.map((agent) => (
                        <Badge key={`${agent.name}-${agent.source}`} variant="outline">
                          {agent.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            ) : snapshot.status === "blocked" || snapshot.status === "blocked_uncited_output" ? (
              <Alert>
                <AlertTitle>{snapshot.message}</AlertTitle>
                <AlertDescription>
                  <div className="flex flex-wrap gap-2">
                    {snapshot.recordIds.map((recordId) => (
                      <Badge key={recordId} variant="outline">
                        {recordId}
                      </Badge>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            ) : snapshot.status === "error" ? (
              <Alert variant="destructive">
                <AlertTitle>Query error</AlertTitle>
                <AlertDescription>{snapshot.message}</AlertDescription>
              </Alert>
            ) : isRunning ? null : (
              <Alert>
                <AlertTitle>{snapshot.message}</AlertTitle>
                <AlertDescription>
                  <div className="flex flex-wrap gap-2">
                    {snapshot.recordIds.map((recordId) => (
                      <Badge key={recordId} variant="secondary">
                        {recordId}
                      </Badge>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
          {canShowCitedAnswer ? <CitedAnswerCard evidencePack={evidencePack} response={snapshot} /> : null}
          {isRunning ? <AgentTracePanel response={snapshot} subAgents={dock.subAgents} /> : null}
        </div>
        <SheetFooter className="border-t sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Read-only query. Citations required before answer display.</p>
          <Button
            className="sm:w-auto"
            disabled={isRunning || canShowCitedAnswer || question.trim().length === 0}
            onClick={() => {
              void startQuery();
            }}
            type="button"
          >
            <SearchIcon data-icon="inline-start" />
            Run query
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
