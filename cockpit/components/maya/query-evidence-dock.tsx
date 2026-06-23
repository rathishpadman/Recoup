"use client";

import * as React from "react";
import { SearchIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  startRealtimeBrowserSession,
  type RealtimeBrowserSession,
  type RealtimeBrowserSessionSnapshot
} from "../../app/realtime-browser-session.ts";
import { AgentTracePanel } from "./agent-trace-panel.tsx";
import { CitedAnswerCard } from "./cited-answer-card.tsx";
import type { MayaMultimodalDock, QueryEvidenceResponse } from "./types.ts";

interface QueryEvidenceDockProps {
  dock: MayaMultimodalDock;
  onOpenChange: (open: boolean) => void;
  onResponse: (response: QueryEvidenceResponse) => void;
  open: boolean;
  recordIds: string[];
  selectedLine: string;
}

export function QueryEvidenceDock({
  dock,
  onOpenChange,
  onResponse,
  open,
  recordIds,
  selectedLine
}: QueryEvidenceDockProps) {
  const questionId = React.useId();
  const statusId = React.useId();
  const sessionRef = React.useRef<RealtimeBrowserSession | null>(null);
  const [error, setError] = React.useState<string | undefined>();
  const [question, setQuestion] = React.useState("");
  const [snapshot, setSnapshot] = React.useState<RealtimeBrowserSessionSnapshot | undefined>();
  const isRunning = snapshot?.status === "connecting" || snapshot?.status === "connected";
  const canShowCitedAnswer =
    snapshot !== undefined &&
    snapshot.status === "answered" &&
    snapshot.answer !== undefined &&
    snapshot.deterministicBasis !== undefined &&
    snapshot.recordIds.length > 0;

  React.useEffect(() => {
    return () => {
      sessionRef.current?.close();
    };
  }, []);

  function publish(next: RealtimeBrowserSessionSnapshot): void {
    setSnapshot(next);
    onResponse(next);
  }

  async function startQuery(): Promise<void> {
    const trimmedQuestion = question.trim();
    if (isRunning || trimmedQuestion.length === 0) {
      return;
    }

    sessionRef.current?.close();
    sessionRef.current = null;
    setError(undefined);

    publish({
      message: "Starting evidence query through the Realtime browser helper.",
      recordIds,
      status: "connecting"
    });

    try {
      const session = await startRealtimeBrowserSession({
        onSnapshot: publish,
        question: trimmedQuestion
      });
      sessionRef.current = session;
      publish(session.getSnapshot());
    } catch {
      const failedSnapshot: RealtimeBrowserSessionSnapshot = {
        message: "Realtime browser helper failed before returning a cited answer.",
        recordIds,
        status: "error"
      };
      setError(failedSnapshot.message);
      publish(failedSnapshot);
    }
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="sm:max-w-xl" data-testid="maya-query-dock">
        <SheetHeader>
          <SheetTitle>Evidence query</SheetTitle>
          <SheetDescription>{dock.policyLabel}</SheetDescription>
        </SheetHeader>
        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
          <div id={statusId} aria-live="polite">
            {error !== undefined ? (
              <Alert variant="destructive">
                <AlertTitle>Query error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : snapshot === undefined ? (
              <Alert>
                <AlertTitle>Ready for cited query</AlertTitle>
                <AlertDescription>{dock.transcript.english}</AlertDescription>
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
            ) : (
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
          <div className="flex flex-wrap gap-2" aria-label={`${selectedLine} scoped query records`}>
            <Badge variant="secondary">{selectedLine}</Badge>
            {recordIds.map((recordId) => (
              <Badge key={recordId} variant="outline">
                {recordId}
              </Badge>
            ))}
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={questionId}>Question</FieldLabel>
              <InputGroup>
                <InputGroupTextarea
                  aria-describedby={statusId}
                  data-testid="maya-query-input"
                  disabled={isRunning}
                  id={questionId}
                  onChange={(event) => {
                    setQuestion(event.target.value);
                  }}
                  placeholder={dock.promptPlaceholder}
                  value={question}
                />
                <InputGroupAddon align="block-end">
                  <span>{dock.languageLabel}</span>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>{dock.transcript.english}</FieldDescription>
            </Field>
          </FieldGroup>
          <div className="flex flex-wrap gap-2" aria-label="Query modes">
            {dock.modeOptions.map((mode) => (
              <Badge key={mode} variant="outline">
                {mode}
              </Badge>
            ))}
          </div>
          {isRunning ? (
            <div className="flex flex-col gap-2" aria-label="Query loading state">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : null}
          <AgentTracePanel response={snapshot} subAgents={dock.subAgents} />
          {canShowCitedAnswer ? <CitedAnswerCard fallbackRecordIds={recordIds} response={snapshot} /> : null}
        </div>
        <SheetFooter>
          <Button
            disabled={isRunning || question.trim().length === 0}
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
