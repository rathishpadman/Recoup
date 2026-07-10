"use client";

import * as React from "react";
import { AlertCircleIcon, CheckCircle2Icon, FileTextIcon, Loader2Icon, MicIcon, SearchIcon, SparklesIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  startRealtimeBrowserSession,
  type RealtimeBrowserSession,
  type RealtimeBrowserSessionSnapshot
} from "../../app/realtime-browser-session.ts";
import { AgentTracePanel } from "./agent-trace-panel.tsx";
import { mayaAccent } from "./maya-accent.ts";
import {
  buildAgentChecklistRows,
  buildConductorSummary,
  buildConductorRunningLine,
  buildCopilotDrawerTrigger,
  buildQueryEvidenceSnapshot,
  buildCopilotVerdictBand,
  resolveMayaWorklistReason,
  countEvidenceSourceLabels,
  semanticRetrievalBadgeFromDocument
} from "./maya-workspace-derived.ts";
import type { MayaCopilotCaseOption } from "./maya-workspace-derived.ts";
import type {
  MayaEvidencePack,
  MayaMultimodalDock,
  MayaQueryPromptDockContract,
  MayaWorklistItem,
  QueryEvidenceBackendResponse,
  QueryEvidenceResponse
} from "./types.ts";

const QUERY_QUESTION_CHARACTER_LIMIT = 500;
const WORKSPACE_CASE_PICKER_VALUE = "__workspace__";
const MICROPHONE_FIRST_QUESTION_PROMPT = "Voice question from microphone for the selected evidence packet.";
const COPILOT_SOFT_PANEL_CLASS =
  "border-[color:var(--maya-accent-surface-strong)] bg-[color:var(--maya-accent-surface-muted)]";
const COPILOT_SOFT_BUTTON_CLASS =
  "border-[color:var(--maya-accent-surface-strong)] bg-background text-foreground hover:border-[color:var(--maya-accent-border)] hover:bg-[color:var(--maya-accent-surface-muted)]";

type EvidenceDocument = MayaEvidencePack["documents"][number];
type QueryMode = "text" | "voice";
type VoiceSessionStatus =
  | "answered"
  | "blocked"
  | "connecting"
  | "ended"
  | "error"
  | "hearing"
  | "idle"
  | "listening"
  | "processing"
  | "requesting";

interface QueryEvidenceDockProps {
  caseOptions?: MayaCopilotCaseOption[] | undefined;
  dock: MayaQueryPromptDockContract;
  evidencePack: MayaEvidencePack;
  onOpenChange: (open: boolean) => void;
  onResponse: (response: QueryEvidenceResponse) => void;
  open: boolean;
  queryScope?: "line" | "workspace";
  recordIds: string[];
  selectedLine: string;
  selectedWorklistItem?: MayaWorklistItem | undefined;
  settlementRunId?: string;
}

interface QueryEvidenceSnapshotEnvelope {
  evidenceIdentity: string;
  response: QueryEvidenceResponse;
}

export function QueryEvidenceDock({
  caseOptions = [],
  dock,
  evidencePack,
  onOpenChange,
  onResponse,
  open,
  queryScope = "line",
  recordIds,
  selectedLine,
  selectedWorklistItem,
  settlementRunId
}: QueryEvidenceDockProps) {
  const questionId = React.useId();
  const questionHelpId = React.useId();
  const promptChipDescriptionPrefix = React.useId();
  const statusId = React.useId();
  const openRef = React.useRef(open);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const realtimeAbortControllerRef = React.useRef<AbortController | null>(null);
  const realtimeSessionRef = React.useRef<RealtimeBrowserSession | null>(null);
  const remoteAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const sessionTokenRef = React.useRef(0);
  const onResponseRef = React.useRef(onResponse);
  onResponseRef.current = onResponse;
  const [casePickerLineId, setCasePickerLineId] = React.useState(WORKSPACE_CASE_PICKER_VALUE);
  const activeCaseOption =
    queryScope === "workspace" && casePickerLineId !== WORKSPACE_CASE_PICKER_VALUE
      ? caseOptions.find((option) => option.lineId === casePickerLineId)
      : undefined;
  const activeQueryScope: "line" | "workspace" = activeCaseOption === undefined ? queryScope : "line";
  const activeSelectedLine = activeCaseOption?.lineId ?? selectedLine;
  const activeRecordIds = activeCaseOption?.recordIds ?? recordIds;
  const activeEvidencePack = React.useMemo<MayaEvidencePack>(() => {
    if (activeCaseOption === undefined) {
      return evidencePack;
    }

    return {
      documents: [],
      provenance: {
        ...evidencePack.provenance,
        recordIds: activeCaseOption.recordIds
      },
      recordIds: activeCaseOption.recordIds
    };
  }, [activeCaseOption, evidencePack]);
  const activeSelectedWorklistItem =
    activeCaseOption?.workItem ?? (queryScope === "workspace" ? undefined : selectedWorklistItem);
  const selectedEvidenceIdentity = React.useMemo(
    () => buildSelectedEvidenceIdentity(activeSelectedLine, activeRecordIds, activeQueryScope, settlementRunId),
    [activeQueryScope, activeRecordIds, activeSelectedLine, settlementRunId]
  );
  const selectedEvidenceResetResponse = React.useMemo(
    () => buildStoppedQuerySnapshot(activeSelectedLine, activeRecordIds, activeEvidencePack.recordIds),
    [activeEvidencePack.recordIds, activeRecordIds, activeSelectedLine]
  );
  const activeEvidenceSourceCount = React.useMemo(
    () => countEvidenceSourceLabels(activeEvidencePack.documents),
    [activeEvidencePack.documents]
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
  const [activeQueryMode, setActiveQueryMode] = React.useState<QueryMode | undefined>();
  const [voiceSessionStatus, setVoiceSessionStatus] = React.useState<VoiceSessionStatus>("idle");
  const [voiceInputTranscript, setVoiceInputTranscript] = React.useState("");
  const [voiceAssistantTranscript, setVoiceAssistantTranscript] = React.useState("");
  const [voiceStatusMessage, setVoiceStatusMessage] = React.useState("");
  const snapshot =
    snapshotEnvelope?.evidenceIdentity === selectedEvidenceIdentity ? snapshotEnvelope.response : undefined;
  const isRunning = snapshot?.status === "connecting";
  const isTextQueryRunning = isRunning && activeQueryMode === "text";
  const isVoiceQueryRunning = isRunning && activeQueryMode === "voice";
  const shouldShowStopQuery = isTextQueryRunning || isVoiceQueryRunning;
  const isVoiceListening = activeQueryMode === "voice" && (voiceSessionStatus === "listening" || voiceSessionStatus === "hearing");
  const statusChipLabel = queryStatusChipLabel(snapshot, activeQueryMode === "voice" ? voiceSessionStatus : undefined);
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

  const closeActiveSession = React.useCallback((options: { resetComposer?: boolean; resetParentTrace?: boolean } = {}) => {
    sessionTokenRef.current += 1;
    const abortController = abortControllerRef.current;
    abortControllerRef.current = null;
    abortController?.abort();
    const realtimeAbortController = realtimeAbortControllerRef.current;
    realtimeAbortControllerRef.current = null;
    realtimeAbortController?.abort();
    const realtimeSession = realtimeSessionRef.current;
    realtimeSessionRef.current = null;
    realtimeSession?.close();
    setVoiceSessionStatus("idle");
    setVoiceInputTranscript("");
    setVoiceAssistantTranscript("");
    setVoiceStatusMessage("");
    setActiveQueryMode(undefined);
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
    const previousRealtimeAbortController = realtimeAbortControllerRef.current;
    realtimeAbortControllerRef.current = null;
    previousRealtimeAbortController?.abort();
    realtimeSessionRef.current?.close();
    realtimeSessionRef.current = null;
    const activeStartToken = sessionTokenRef.current + 1;
    sessionTokenRef.current = activeStartToken;
    const activeEvidenceIdentity = selectedEvidenceIdentity;
    const workspaceSettlementRunId = activeQueryScope === "workspace" ? settlementRunId?.trim() : undefined;
    previousAbortController?.abort();
    setError(undefined);
    setActiveQueryMode("text");
    setVoiceSessionStatus("idle");
    setSubmittedQuestion(trimmedQuestion);
    if (activeQueryScope === "workspace" && (workspaceSettlementRunId === undefined || workspaceSettlementRunId.length === 0)) {
      const message = "Maya needs the current settlement run before workspace questions. Refresh Maya and try again.";
      const failedSnapshot: QueryEvidenceResponse = {
        citations: [],
        message,
        recordIds: activeRecordIds,
        status: "error",
        trace: []
      };
      setError(message);
      publishForToken(activeStartToken, activeEvidenceIdentity, failedSnapshot);
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    publishForToken(activeStartToken, activeEvidenceIdentity, {
      citations: [],
      message: "Starting query.",
      recordIds: activeRecordIds,
      status: "connecting",
      trace: []
    });

    try {
      const response = await fetch("/api/forensics/query", {
        body: JSON.stringify(
          activeQueryScope === "workspace"
            ? {
                question: trimmedQuestion,
                scope: "workspace",
                settlementRunId: workspaceSettlementRunId
              }
            : {
                question: trimmedQuestion,
                recordIds: activeRecordIds,
                selectedLineId: activeSelectedLine
              }
        ),
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
        buildQueryEvidenceSnapshot({
          evidencePackRecordIds: activeEvidencePack.recordIds,
          queryScope: activeQueryScope,
          recordIds: activeRecordIds,
          response: body as QueryEvidenceBackendResponse,
          selectedLine: activeSelectedLine,
        })
      );
    } catch (caught) {
      if (!isCurrentSession(activeStartToken)) {
        return;
      }

      const failedSnapshot: QueryEvidenceResponse = {
        citations: [],
        message: caught instanceof Error ? caught.message : "Forensics query failed before returning a cited answer.",
        recordIds: activeRecordIds,
        status: "error",
        trace: []
      };
      setError(failedSnapshot.message);
      publishForToken(activeStartToken, activeEvidenceIdentity, failedSnapshot);
    }
  }

  async function startVoiceQuery(): Promise<void> {
    const trimmedQuestion = question.trim();
    if (isRunning) {
      return;
    }
    const voiceQuestion = trimmedQuestion.length === 0 ? MICROPHONE_FIRST_QUESTION_PROMPT : trimmedQuestion;

    const previousAbortController = abortControllerRef.current;
    abortControllerRef.current = null;
    previousAbortController?.abort();
    const previousRealtimeAbortController = realtimeAbortControllerRef.current;
    realtimeAbortControllerRef.current = null;
    previousRealtimeAbortController?.abort();
    realtimeSessionRef.current?.close();
    realtimeSessionRef.current = null;

    const activeStartToken = sessionTokenRef.current + 1;
    sessionTokenRef.current = activeStartToken;
    const activeEvidenceIdentity = selectedEvidenceIdentity;
    const abortController = new AbortController();
    realtimeAbortControllerRef.current = abortController;
    setActiveQueryMode("voice");
    setVoiceSessionStatus("requesting");
    setError(undefined);
    setSubmittedQuestion(trimmedQuestion.length === 0 ? "Listening for your voice question." : trimmedQuestion);
    setVoiceInputTranscript("");
    setVoiceAssistantTranscript("");
    setVoiceStatusMessage("Listening");

    publishForToken(activeStartToken, activeEvidenceIdentity, {
      citations: [],
      message: "Requesting voice evidence session.",
      recordIds: activeRecordIds,
      status: "connecting",
      trace: []
    });

    try {
      const realtimeSession = await startRealtimeBrowserSession({
        onSnapshot: (voiceSnapshot) => {
          if (!isCurrentSession(activeStartToken) || latestEvidenceIdentityRef.current !== activeEvidenceIdentity) {
            return;
          }

          setVoiceSessionStatus(toVoiceSessionStatus(voiceSnapshot.status));
          setVoiceInputTranscript(voiceSnapshot.inputTranscript ?? "");
          setVoiceAssistantTranscript(voiceSnapshot.assistantTranscript ?? "");
          setVoiceStatusMessage(voiceSnapshot.message);
          if ((voiceSnapshot.inputTranscript?.trim().length ?? 0) > 0) {
            setSubmittedQuestion(voiceSnapshot.inputTranscript ?? "");
          }
          const nextSnapshot = toVoiceQueryEvidenceSnapshot({
            evidencePack: activeEvidencePack,
            realtimeSnapshot: voiceSnapshot
          });
          if (nextSnapshot.status === "error") {
            setError("Voice permission or session setup failed. Text query is still available.");
          } else {
            setError(undefined);
          }
          publishForToken(activeStartToken, activeEvidenceIdentity, nextSnapshot);
        },
        question: voiceQuestion,
        recordIds: activeRecordIds,
        remoteAudio: remoteAudioRef.current,
        selectedLineId: activeSelectedLine,
        signal: abortController.signal
      });
      if (!isCurrentSession(activeStartToken)) {
        realtimeSession.close();
        return;
      }
      realtimeSessionRef.current = realtimeSession;
    } catch {
      if (!isCurrentSession(activeStartToken)) {
        return;
      }

      const message = "Voice evidence session unavailable. Text query is still available.";
      setVoiceSessionStatus("error");
      setError(message);
      publishForToken(activeStartToken, activeEvidenceIdentity, {
        citations: [],
        message,
        recordIds: activeRecordIds,
        status: "error",
        trace: []
      });
    }
  }

  return (
    <Sheet onOpenChange={handleOpenChange} open={open}>
      <SheetContent
        className={cn(mayaAccent.appFrame, "gap-0 data-[side=right]:sm:max-w-[var(--maya-query-dock-max-width)]")}
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
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[color:var(--persona-maya-accent)] text-white shadow-sm">
              <SparklesIcon aria-hidden="true" className="size-5" />
            </span>
            <div className="grid min-w-0 gap-1">
              <SheetTitle>Recoup Copilot</SheetTitle>
              <SheetDescription>
                Conductor · {dock.subAgents.length.toString()} agents ready
              </SheetDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Query policy">
            <Badge variant={isRunning ? "secondary" : "outline"}>{statusChipLabel}</Badge>
            {isVoiceListening ? (
              <Badge className={cn("gap-1.5", mayaAccent.pill)} data-testid="maya-query-voice-recording-indicator" variant="secondary">
                <span className="size-2 rounded-full bg-[color:var(--persona-maya-accent)] motion-safe:animate-pulse" />
                Listening
              </Badge>
            ) : null}
            <Badge variant="outline">Query Evidence</Badge>
            <Badge variant="secondary">Case evidence</Badge>
            <Badge variant="secondary">Read-only query</Badge>
          </div>
        </SheetHeader>
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
          <Alert aria-label="Case evidence packet" className={COPILOT_SOFT_PANEL_CLASS} data-testid="maya-selected-evidence-context">
            <FileTextIcon aria-hidden="true" data-icon="inline-start" />
            <AlertTitle>{activeQueryScope === "workspace" ? "Settlement run packet" : "Case evidence packet"}</AlertTitle>
            <AlertDescription>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{activeQueryScope === "workspace" ? "Workspace evidence packet" : "Case evidence packet"}</span>
                  <Badge className={mayaAccent.pill} data-testid="maya-query-selected-line" variant="secondary">
                    {activeQueryScope === "workspace" ? "Workspace" : "Selected case"}
                  </Badge>
                  <Badge variant="outline">{`${activeRecordIds.length.toString()} records`}</Badge>
                  {activeEvidenceSourceCount === 0 ? null : (
                    <Badge variant="outline">{`${activeEvidenceSourceCount.toString()} sources`}</Badge>
                  )}
                </div>
              </div>
            </AlertDescription>
          </Alert>
          {queryScope === "workspace" && caseOptions.length > 0 ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="maya-query-case-picker">
              <span className="text-sm font-medium">Case focus</span>
              <Select
                onValueChange={(value) => {
                  closeActiveSession();
                  setCasePickerLineId(value);
                }}
                value={activeCaseOption === undefined ? WORKSPACE_CASE_PICKER_VALUE : activeCaseOption.lineId}
              >
                <SelectTrigger aria-label="Choose copilot case focus" className="max-w-full" size="sm">
                  <SelectValue placeholder="Workspace" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WORKSPACE_CASE_PICKER_VALUE}>Workspace</SelectItem>
                  {caseOptions.map((option) => (
                    <SelectItem key={option.lineId} value={option.lineId}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="outline">
                {activeCaseOption === undefined ? `${caseOptions.length.toString()} cases` : activeCaseOption.customerLabel}
              </Badge>
            </div>
          ) : null}
          <Accordion collapsible type="single">
            <AccordionItem data-testid="maya-query-source-details" value="source-details">
              <AccordionTrigger>Evidence details</AccordionTrigger>
              <AccordionContent>
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5" aria-label="Cited records">
                    {activeRecordIds.length === 0 ? (
                      <Badge data-testid="maya-query-record-id" variant="outline">
                        No record IDs
                      </Badge>
                    ) : (
                      activeRecordIds.map((recordId) => (
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
                    <Badge className={mayaAccent.pill} variant="secondary">Case evidence</Badge>
                    <Badge variant="outline">{dock.policyLabel}</Badge>
                    {dock.modeOptions.map((mode) => (
                      <Badge key={mode} variant="outline">
                        {mode}
                      </Badge>
                    ))}
                  </div>
                  <QueryEvidenceDocumentDisclosure documents={activeEvidencePack.documents} />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <div className="flex flex-wrap gap-2" aria-label="Backend suggested evidence questions">
            {promptSuggestions.map((prompt) => {
              const promptChipDescriptionId = buildPromptSuggestionDescriptionId(promptChipDescriptionPrefix, prompt);
              const promptChipDeterministicBasis = prompt.provenance.deterministicBasis;
              const suggestionRecordCount = dedupeRecordIds([...prompt.recordIds, ...prompt.provenance.recordIds]).length;

              return (
                <React.Fragment key={buildPromptSuggestionKey(prompt)}>
                  <Button
                    aria-describedby={promptChipDescriptionId}
                    className={cn("h-auto min-h-9 justify-between gap-2 whitespace-normal text-left", COPILOT_SOFT_BUTTON_CLASS)}
                    data-testid="maya-query-prompt-chip"
                    disabled={isRunning}
                    onClick={() => {
                      setQuestion(prompt.question);
                    }}
                    type="button"
                    variant="outline"
                  >
                    <span data-testid="maya-query-prompt-question">{prompt.question}</span>
                    <Badge data-testid="maya-query-prompt-record-count" variant="outline">{`${suggestionRecordCount.toString()} records`}</Badge>
                  </Button>
                  <span className="sr-only" id={promptChipDescriptionId}>
                    {buildPromptSuggestionDescription(prompt, promptChipDeterministicBasis)}
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
                className={cn("ml-auto grid max-w-[88%] min-w-0 gap-1 rounded-lg border p-3", mayaAccent.proofPanel)}
                data-testid="maya-submitted-query"
              >
                <span className="text-sm font-medium">You</span>
                <p className="text-sm text-muted-foreground" data-testid="maya-query-user-message">
                  {voiceInputTranscript.trim().length > 0 ? voiceInputTranscript : submittedQuestion}
                </p>
              </div>
            ) : null}
            {activeQueryMode === "voice" && voiceStatusMessage.trim().length > 0 ? (
              <div className="text-sm text-muted-foreground" data-testid="maya-voice-transcript-state">
                {voiceStatusMessage}
              </div>
            ) : null}
            {activeQueryMode === "voice" && canShowCitedAnswer && voiceAssistantTranscript.trim().length > 0 ? (
              <div
                className={cn("mr-auto grid max-w-[88%] min-w-0 gap-1 rounded-lg border p-3", COPILOT_SOFT_PANEL_CLASS)}
                data-testid="maya-query-assistant-transcript"
              >
                <span className="text-sm font-medium">Recoup Copilot</span>
                <p className="text-sm text-muted-foreground">{voiceAssistantTranscript}</p>
              </div>
            ) : null}
            <div id={statusId} aria-live="polite">
              {canShowCitedAnswer ? (
                <>
                  <CopilotStoryPanel
                    dock={dock}
                    evidencePack={activeEvidencePack}
                    mode={activeQueryMode ?? "text"}
                    selectedLine={activeQueryScope === "workspace" ? undefined : activeSelectedLine}
                    selectedWorklistItem={activeSelectedWorklistItem}
                    submittedQuestion={submittedQuestion}
                    snapshot={snapshot}
                  />
                </>
              ) : error !== undefined ? (
                <Alert variant="destructive">
                  <AlertTitle>Query error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : snapshot === undefined ? (
                <Alert data-testid="maya-query-readiness-preview">
                  <AlertTitle>Suggested investigations</AlertTitle>
                  <AlertDescription>
                    <div className="flex flex-col gap-2">
                      <span>The overnight investigation is complete. Ask a follow-up from the selected evidence packet.</span>
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
                <CopilotStoryPanel
                  dock={dock}
                  evidencePack={activeEvidencePack}
                  mode={activeQueryMode ?? "text"}
                  selectedLine={activeQueryScope === "workspace" ? undefined : activeSelectedLine}
                  selectedWorklistItem={activeSelectedWorklistItem}
                  submittedQuestion={submittedQuestion}
                  snapshot={snapshot}
                />
              ) : (
                <Alert>
                  <AlertTitle>{snapshot.message}</AlertTitle>
                  <AlertDescription>
                    <div className="flex flex-wrap gap-2">
                  <Badge className={mayaAccent.pill} variant="secondary">{`${snapshot.recordIds.length.toString()} records`}</Badge>
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
                    evidencePack={activeEvidencePack}
                    recordIds={activeRecordIds}
                    response={snapshot}
                    selectedLine={activeSelectedLine}
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
          <audio ref={remoteAudioRef} aria-hidden="true" />
        </div>
        <SheetFooter className="border-t border-primary/10 sm:flex-row sm:items-center sm:justify-between">
          {shouldShowStopQuery ? (
            <Button
              className={cn("sm:w-auto", mayaAccent.outlineButton)}
              onClick={() => {
                closeActiveSession({ resetComposer: false, resetParentTrace: true });
              }}
              type="button"
              variant="outline"
            >
              Stop query
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                aria-label="Ask by voice"
                className={cn("sm:w-auto", mayaAccent.outlineButton)}
                onClick={() => {
                  void startVoiceQuery();
                }}
                type="button"
                variant="outline"
              >
                <MicIcon data-icon="inline-start" />
                Voice
              </Button>
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
            </div>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function CopilotStoryPanel({
  dock,
  evidencePack,
  mode,
  selectedLine,
  selectedWorklistItem,
  submittedQuestion,
  snapshot
}: {
  dock: MayaQueryPromptDockContract;
  evidencePack: MayaEvidencePack;
  mode: QueryMode;
  selectedLine: string | undefined;
  selectedWorklistItem: MayaWorklistItem | undefined;
  submittedQuestion: string;
  snapshot: QueryEvidenceResponse;
}) {
  const fallbackAgentNames = snapshot.modelExecution?.mode === "live_openai_agents"
    ? snapshot.modelExecution.agentNames
    : dock.subAgents.map((agent) => agent.name);
  const checklistRows = buildAgentChecklistRows({
    evidenceDocuments: evidencePack.documents,
    fallbackAgentNames,
    message: snapshot.message,
    question: submittedQuestion,
    status: snapshot.status,
    trace: snapshot.trace
  });
  const conductorSummary = buildConductorSummary({
    ...(selectedWorklistItem?.customerLabel === undefined ? {} : { customerLabel: selectedWorklistItem.customerLabel }),
    evidenceDocuments: evidencePack.documents,
    question: submittedQuestion,
    queryScope: selectedLine === undefined ? "workspace" : "line",
    ...(selectedLine === undefined ? {} : { selectedLineLabel: selectedLine }),
    subAgentNames: fallbackAgentNames
  });
  const runningLine = buildConductorRunningLine({
    evidenceDocuments: evidencePack.documents,
    question: submittedQuestion,
    queryScope: selectedLine === undefined ? "workspace" : "line"
  });
  const checklistStatusLabel =
    snapshot.status === "connecting"
      ? "Specialist checks running"
      : snapshot.status === "blocked" && snapshot.message.startsWith("Query stopped;")
        ? "Query stopped"
      : snapshot.status === "blocked"
        ? "Specialist checks blocked"
      : snapshot.status === "answered"
        ? "Specialist checks complete"
        : "Specialist checks require review";
  const verdictBand =
    selectedWorklistItem === undefined
      ? undefined
      : buildCopilotVerdictBand({
          basis: displayAnswerWithoutInlineRecordIds(resolveMayaWorklistReason(selectedWorklistItem), selectedWorklistItem.lineIds),
          workItem: selectedWorklistItem
        });

  return (
    <div className="grid min-w-0 gap-3">
      <div
        className={cn("grid min-w-0 gap-2 rounded-lg border p-3", COPILOT_SOFT_PANEL_CLASS)}
        data-testid="maya-query-assistant-message"
        data-citation-count={snapshot.citations.length}
        data-query-mode={mode}
        data-record-count={snapshot.recordIds.length}
      >
        <div className="flex min-w-0 items-start gap-3" data-testid="maya-copilot-conductor-summary">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[color:var(--persona-maya-accent)] text-white">
            C
          </span>
          <div className="grid min-w-0 gap-1">
            <span className="text-sm font-semibold">Conductor</span>
            <p className="text-sm leading-6 text-muted-foreground">{conductorSummary}</p>
            {snapshot.status === "connecting" ? (
              <p className="text-sm leading-6 text-muted-foreground">{runningLine}</p>
            ) : null}
            {snapshot.answer === undefined ? null : (
              <p className="text-sm leading-6" data-testid="maya-query-assistant-answer">
                {displayAnswerWithoutInlineRecordIds(snapshot.answer, [
                  ...snapshot.recordIds,
                  ...snapshot.citations.map((citation) => citation.recordId)
                ])}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-2" data-testid="maya-copilot-agent-checklist">
          <span className="text-xs font-semibold text-muted-foreground">{checklistStatusLabel}</span>
          {checklistRows.length === 0 ? (
            <span className="text-sm text-muted-foreground">Agent checklist unavailable.</span>
          ) : (
            checklistRows.map((row) => (
              <div className="flex items-center gap-2 text-sm" data-testid="maya-copilot-agent-row" key={row.key}>
                <span className="flex size-6 items-center justify-center rounded-md border bg-background text-xs font-semibold">
                  {agentInitials(row.agentName)}
                </span>
                <span className="min-w-0 flex-1 truncate">{row.agentName}</span>
                {row.state === "complete" ? (
                  <CheckCircle2Icon aria-hidden="true" className="size-4 text-success" />
                ) : row.state === "stopped" ? (
                  <Loader2Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                ) : row.state === "blocked" ? (
                  <AlertCircleIcon aria-hidden="true" className="size-4 text-destructive" />
                ) : (
                  <Loader2Icon aria-hidden="true" className="size-4 animate-spin text-muted-foreground" />
                )}
              </div>
            ))
          )}
        </div>

        {verdictBand === undefined ? null : (
          <CopilotVerdictBandPanel band={verdictBand} citedRecordCount={snapshot.recordIds.length} />
        )}
      </div>

      <CopilotDepthDrawer
        label="Citations"
        testId="maya-copilot-citations-drawer"
        value={`${snapshot.citations.length.toString()} records`}
      >
        <div className="grid gap-2" data-testid="maya-copilot-citation-records">
          {snapshot.citations.length === 0 ? (
            <Badge variant="outline">No citations</Badge>
          ) : (
            snapshot.citations.map((citation, index) => {
              const semanticBadge = semanticBadgeForCitation(citation, evidencePack.documents);
              return (
                <div
                  className={cn("grid gap-1 rounded-md border p-2 text-sm", COPILOT_SOFT_PANEL_CLASS)}
                  data-record-id={citation.recordId}
                  data-testid="maya-copilot-citation-row"
                  key={`${citation.recordId}-${citation.documentId ?? "citation"}-${index.toString()}`}
                >
                  <div className="flex flex-wrap gap-1.5">
                    <Badge className={cn("max-w-full truncate", mayaAccent.pill)} data-testid="maya-query-citation-record" title={citation.recordId} variant="secondary">
                      {citation.recordId}
                    </Badge>
                    {semanticBadge === undefined ? null : (
                      <Badge data-testid="maya-query-citation-semantic-badge" variant="outline">
                        {semanticBadge}
                      </Badge>
                    )}
                  </div>
                  <dl className="grid gap-1">
                    <ModelFact label="Basis" value={citation.deterministicBasis} />
                    <ModelFact label="Document" value={citation.documentId} />
                    <ModelFact label="Source" value={citation.source} />
                    <ModelFact label="Summary" value={citation.summary} />
                  </dl>
                </div>
              );
            })
          )}
        </div>
      </CopilotDepthDrawer>
      <CopilotDepthDrawer
        label="Trace"
        testId="maya-copilot-trace-drawer"
        value={`${snapshot.trace.length.toString()} steps`}
      >
        <AgentTracePanel
          evidencePack={evidencePack}
          recordIds={snapshot.recordIds}
          response={snapshot}
          selectedLine={selectedLine ?? "workspace"}
        />
      </CopilotDepthDrawer>
      <CopilotDepthDrawer
        label="Model execution"
        testId="maya-copilot-model-drawer"
        value={snapshot.modelExecution?.mode ?? "unavailable"}
      >
        <ModelExecutionFacts response={snapshot} />
      </CopilotDepthDrawer>
    </div>
  );
}

function CopilotVerdictBandPanel({
  band,
  citedRecordCount
}: {
  band: ReturnType<typeof buildCopilotVerdictBand>;
  citedRecordCount: number;
}) {
  return (
    <div className={cn("grid gap-1 rounded-lg border p-3 text-sm", copilotVerdictBandClass(band.tone))} data-testid="maya-copilot-verdict-band">
      <span className="font-semibold">{band.verdictLabel}</span>
      <span className="text-xs font-medium" data-testid="maya-copilot-verdict-cited-count">
        Verified against {citedRecordCount.toString()} cited records
      </span>
      <span>
        Route: <b>{band.routeLabel}</b> · {band.actionLabel} · {band.amountLabel}
      </span>
      <span className="text-xs opacity-90">{band.basis}</span>
    </div>
  );
}

function CopilotDepthDrawer({
  children,
  label,
  testId,
  value
}: {
  children: React.ReactNode;
  label: string;
  testId: string;
  value: string;
}) {
  return (
    <Collapsible className={cn("rounded-lg border", COPILOT_SOFT_PANEL_CLASS)} data-testid={testId}>
      <CollapsibleTrigger asChild>
        <Button className="h-auto w-full justify-start rounded-none px-3 py-2 text-sm font-semibold" type="button" variant="ghost">
          {buildCopilotDrawerTrigger(label, value)}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="hidden border-t p-3 data-[state=open]:block">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ModelExecutionFacts({ response }: { response: QueryEvidenceResponse }) {
  const execution = response.modelExecution;
  if (execution === undefined) {
    return (
      <dl className="grid gap-1 text-sm">
        <ModelFact label="Basis" value={response.deterministicBasis} />
        <ModelFact label="Mode" value="unavailable" />
      </dl>
    );
  }

  if (execution.mode === "live_realtime_tool_bridge") {
    return (
      <dl className="grid gap-1 text-sm">
        <ModelFact label="Basis" value={response.deterministicBasis} />
        <ModelFact label="Mode" value={execution.mode} />
        <ModelFact label="Model" value={execution.model} />
        <ModelFact label="Tool" value={execution.toolName} />
        <ModelFact label="Tool route" value={execution.toolRouteStatus} />
        <ModelFact label="Selected line" value={execution.selectedLineId} />
        <ModelFact label="Records" value={execution.recordCount.toString()} />
        <ModelFact label="Citation parity" value={execution.citationParity} />
        <ModelFact label="Raw model text" value={execution.rawModelTextPolicy} />
      </dl>
    );
  }

  if (execution.mode !== "live_openai_agents") {
    return (
      <dl className="grid gap-1 text-sm">
        <ModelFact label="Basis" value={response.deterministicBasis} />
        <ModelFact label="Mode" value={execution.mode} />
        <ModelFact label="Reason" value={execution.reason} />
      </dl>
    );
  }

  return (
    <dl className="grid gap-1 text-sm">
      <ModelFact label="Basis" value={response.deterministicBasis} />
      <ModelFact label="Mode" value={execution.mode} />
      <ModelFact label="Agents" value={execution.agentNames.join(", ")} />
      <ModelFact label="Handoffs" value={execution.handoffCount.toString()} />
      <ModelFact label="Raw model text" value={execution.rawModelTextPolicy} />
      <ModelFact label="Tokens" value={execution.tokenUsage?.toString()} />
    </dl>
  );
}

function ModelFact({ label, value }: { label: string; value: string | undefined }) {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{value}</dd>
    </div>
  );
}

function QueryEvidenceDocumentDisclosure({ documents }: { documents: EvidenceDocument[] }) {
  if (documents.length === 0) {
    return (
      <Badge className="w-fit" data-testid="maya-query-evidence-document" variant="outline">
        No evidence documents
      </Badge>
    );
  }

  return (
    <div className="grid min-w-0 gap-2" aria-label="Selected evidence documents">
      {documents.map((document) => (
        <div
          className={cn("grid min-w-0 gap-2 rounded-md border p-2 text-xs", mayaAccent.proofMutedPanel)}
          data-testid="maya-query-evidence-document"
          key={`${document.citationId}-${document.documentId}`}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge className={mayaAccent.pill} variant="secondary">{document.citationId}</Badge>
            {document.evidenceId === undefined ? null : <Badge variant="outline">{document.evidenceId}</Badge>}
            {document.receiptId === undefined ? null : <Badge variant="outline">{document.receiptId}</Badge>}
          </div>
          <dl className="grid min-w-0 gap-1">
            <QueryEvidenceMetadataRow label="Content hash" value={document.contentHash} />
            <QueryEvidenceMetadataRow label="Storage URI" value={document.storageUri} />
            <QueryEvidenceMetadataRow label="Source freshness" value={document.sourceFreshness} />
            <QueryEvidenceMetadataRow label="Deterministic basis" value={document.deterministicComparisonBasis} />
          </dl>
        </div>
      ))}
    </div>
  );
}

function QueryEvidenceMetadataRow({ label, value }: { label: string; value: string | undefined }) {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  return (
    <div className="grid min-w-0 grid-cols-[6.75rem_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-mono text-[11px]">{value}</dd>
    </div>
  );
}

function toVoiceQueryEvidenceSnapshot(input: {
  evidencePack: MayaEvidencePack;
  realtimeSnapshot: RealtimeBrowserSessionSnapshot;
}): QueryEvidenceResponse {
  const { evidencePack, realtimeSnapshot } = input;
  const recordIds = dedupeRecordIds(realtimeSnapshot.recordIds);
  const deterministicBasis = realtimeSnapshot.deterministicBasis;
  const modelExecutionField =
    realtimeSnapshot.modelExecution === undefined ? {} : { modelExecution: realtimeSnapshot.modelExecution };
  const citations =
    deterministicBasis === undefined
      ? []
      : recordIds.map((recordId) => {
          const document = evidenceDocumentForRecordId(recordId, evidencePack.documents);
          return {
            deterministicBasis,
            ...(document?.documentId === undefined ? {} : { documentId: document.documentId }),
            recordId,
            ...(document?.sourceLabel === undefined ? {} : { source: document.sourceLabel }),
            ...(document?.summary === undefined ? {} : { summary: document.summary })
          };
        });

  if (
    realtimeSnapshot.status === "answered" &&
    realtimeSnapshot.answer !== undefined &&
    realtimeSnapshot.answer.trim().length > 0 &&
    realtimeSnapshot.deterministicBasis !== undefined &&
    recordIds.length > 0
  ) {
    return {
      answer: realtimeSnapshot.answer,
      citations,
      deterministicBasis: realtimeSnapshot.deterministicBasis,
      message: "Cited voice answer returned from selected evidence.",
      ...modelExecutionField,
      recordIds,
      status: "answered",
      trace: []
    };
  }

  if (
    realtimeSnapshot.status === "connecting" ||
    realtimeSnapshot.status === "connected" ||
    realtimeSnapshot.status === "hearing" ||
    realtimeSnapshot.status === "processing"
  ) {
    return {
      citations: [],
      message: realtimeSnapshot.message,
      recordIds,
      status: "connecting",
      trace: []
    };
  }

  if (realtimeSnapshot.status === "error") {
    return {
      citations,
      ...(realtimeSnapshot.deterministicBasis === undefined ? {} : { deterministicBasis: realtimeSnapshot.deterministicBasis }),
      message: realtimeSnapshot.message,
      ...modelExecutionField,
      recordIds,
      status: "error",
      trace: []
    };
  }

  return {
    citations,
    ...(realtimeSnapshot.deterministicBasis === undefined ? {} : { deterministicBasis: realtimeSnapshot.deterministicBasis }),
    message: realtimeSnapshot.message,
    ...modelExecutionField,
    recordIds,
    status: "blocked",
    trace: []
  };
}

function buildSelectedEvidenceIdentity(
  selectedLine: string,
  recordIds: readonly string[],
  queryScope: "line" | "workspace",
  settlementRunId: string | undefined
): string {
  return JSON.stringify({
    queryScope,
    recordIds: recordIds.map((recordId) => recordId.trim()),
    selectedLine: selectedLine.trim(),
    settlementRunId: settlementRunId?.trim()
  });
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

function buildPromptSuggestionDescription(
  prompt: NonNullable<MayaMultimodalDock["promptSuggestions"]>[number],
  deterministicBasis: string
): string {
  const recordIds = dedupeRecordIds([...prompt.recordIds, ...prompt.provenance.recordIds]);
  return `${recordIds.length.toString()} cited records available in Evidence details. Basis: ${deterministicBasis.trim()}`;
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

function queryStatusChipLabel(
  response: QueryEvidenceResponse | undefined,
  voiceStatus: VoiceSessionStatus | undefined
): string {
  if (voiceStatus === "requesting") {
    return "Requesting";
  }
  if (voiceStatus === "connecting") {
    return "Connecting";
  }
  if (voiceStatus === "listening") {
    return "Listening";
  }
  if (voiceStatus === "hearing") {
    return "Hearing you";
  }
  if (voiceStatus === "processing") {
    return "Processing";
  }
  if (voiceStatus === "answered") {
    return "Answered";
  }
  if (voiceStatus === "blocked") {
    return "Blocked";
  }
  if (voiceStatus === "error") {
    return "Error";
  }
  if (response === undefined) {
    return "Idle";
  }
  if (response.status === "connecting") {
    return "Running";
  }
  if (response.status === "answered") {
    return "Complete";
  }
  if (response.status === "blocked") {
    return "Blocked";
  }

  return "Error";
}

function toVoiceSessionStatus(status: RealtimeBrowserSessionSnapshot["status"]): VoiceSessionStatus {
  if (status === "connected") {
    return "listening";
  }
  if (status === "hearing") {
    return "hearing";
  }
  if (status === "processing") {
    return "processing";
  }
  if (status === "connecting") {
    return "connecting";
  }
  if (status === "answered") {
    return "answered";
  }
  if (status === "blocked" || status === "blocked_uncited_output") {
    return "blocked";
  }
  if (status === "ended") {
    return "ended";
  }

  return "error";
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

  return redacted.length === 0 ? "Answer details are available with citations in evidence details." : redacted;
}

function agentInitials(agentName: string): string {
  return agentName
    .split(/\s+/u)
    .map((part) => part.slice(0, 1))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function copilotVerdictBandClass(tone: ReturnType<typeof buildCopilotVerdictBand>["tone"]): string {
  if (tone === "valid") {
    return "border-success-border bg-success-surface text-success";
  }
  if (tone === "invalid") {
    return "border-[color:var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[color:var(--status-danger-text)]";
  }
  if (tone === "partial") {
    return "border-[color:var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[color:var(--status-warning-text)]";
  }

  return "border-border bg-muted/40 text-foreground";
}

function semanticBadgeForCitation(
  citation: QueryEvidenceResponse["citations"][number],
  documents: readonly EvidenceDocument[]
): string | undefined {
  const matched = evidenceDocumentForCitation(citation, documents);

  return matched === undefined ? undefined : semanticRetrievalBadgeFromDocument(matched);
}

function evidenceDocumentForCitation(
  citation: QueryEvidenceResponse["citations"][number],
  documents: readonly EvidenceDocument[]
): EvidenceDocument | undefined {
  return documents.find(
    (document) =>
      document.documentId === citation.documentId ||
      document.documentId === citation.recordId ||
      document.citationId === citation.documentId ||
      document.citationId === citation.recordId
  );
}

function evidenceDocumentForRecordId(recordId: string, documents: readonly EvidenceDocument[]): EvidenceDocument | undefined {
  return documents.find(
    (document) =>
      document.documentId === recordId ||
      document.citationId === recordId ||
      document.evidenceId === recordId ||
      document.sourceRecordId === recordId
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
