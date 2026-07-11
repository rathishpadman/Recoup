export type RealtimeBrowserSessionStatus =
  | "answered"
  | "blocked"
  | "blocked_uncited_output"
  | "connected"
  | "connecting"
  | "ended"
  | "error"
  | "hearing"
  | "processing";

export interface RealtimeBrowserSessionSnapshot {
  answer?: string;
  assistantTranscript?: string;
  deterministicBasis?: string;
  inputTranscript?: string;
  message: string;
  modelExecution?: RealtimeToolBridgeModelExecution;
  recordIds: string[];
  status: RealtimeBrowserSessionStatus;
}

export interface RealtimeToolBridgeModelExecution {
  citationParity?: "same_record_ids";
  deterministicBasis: "OpenAI Realtime tool bridge + Recoup deterministic query.answer guard";
  mode: "live_realtime_tool_bridge";
  model?: string;
  rawModelTextPolicy: "suppressed";
  recordCount: number;
  selectedLineId?: string;
  toolName: string;
  toolRouteStatus: "ok";
}

export interface RealtimeBrowserSession {
  close: () => void;
  getSnapshot: () => RealtimeBrowserSessionSnapshot;
}

export interface StartRealtimeBrowserSessionInput {
  createPeerConnection?: () => RTCPeerConnection;
  fetcher?: typeof fetch;
  mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  mode?: "query_tool" | "transcription_only";
  onInputTranscriptCompleted?: (transcript: string) => Promise<void> | void;
  onSnapshot?: (snapshot: RealtimeBrowserSessionSnapshot) => void;
  question: string;
  recordIds: readonly string[];
  remoteAudio?: HTMLAudioElement | null;
  selectedLineId: string;
  signal?: AbortSignal;
  toolEndpoint?: string;
}

type LegacyRealtimeBrowserSessionInput = Omit<StartRealtimeBrowserSessionInput, "recordIds" | "selectedLineId"> & {
  recordIds?: never;
  selectedLineId?: never;
};

type RealtimeBrowserSessionInput = StartRealtimeBrowserSessionInput | LegacyRealtimeBrowserSessionInput;

interface ClientSecretResult {
  auditPolicy?: {
    externalActions: "none";
    recordIds: string[];
    retention: string;
  };
  clientSecret?: { value?: string };
  deterministicBasis?: string;
  model?: string;
  status: "blocked_missing_credentials" | "issued";
  transport?: "webrtc";
}

interface SelectedQueryScope {
  recordIds: string[];
  selectedLineId: string;
}

const realtimeCallsUrl = "https://api.openai.com/v1/realtime/calls";
const realtimeToolUrl = "/api/query/realtime-tool";
const policyRecordIds = ["OPENAI-REALTIME-POLICY"];
const realtimeToolBridgeDeterministicBasis =
  "OpenAI Realtime tool bridge + Recoup deterministic query.answer guard" as const;

export async function startRealtimeBrowserSession({
  createPeerConnection = () => new RTCPeerConnection(),
  fetcher = fetch,
  mediaDevices = navigator.mediaDevices,
  mode = "query_tool",
  onInputTranscriptCompleted,
  onSnapshot,
  question,
  recordIds,
  remoteAudio = null,
  selectedLineId,
  signal,
  toolEndpoint = realtimeToolUrl
}: RealtimeBrowserSessionInput): Promise<RealtimeBrowserSession> {
  const trimmedQuestion = question.trim();
  const hasTypedQuestion = trimmedQuestion.length > 0 && !isMicrophoneFirstQuestionPrompt(trimmedQuestion);
  const clientSecretQuestion = trimmedQuestion.length > 0 ? trimmedQuestion : "Voice question from microphone for the selected evidence packet.";
  const selectedQueryScope = normalizeSelectedQueryScope({
    ...(recordIds === undefined ? {} : { recordIds }),
    ...(selectedLineId === undefined ? {} : { selectedLineId })
  });
  const scopedRecordIds = selectedQueryScope?.recordIds ?? policyRecordIds;
  let snapshot: RealtimeBrowserSessionSnapshot = {
    message: "Voice session idle.",
    recordIds: scopedRecordIds,
    status: "ended"
  };
  const localTracks: MediaStreamTrack[] = [];
  const abortController = new AbortController();
  const cleanupState: {
    dataChannel?: RTCDataChannel;
    peerConnection?: RTCPeerConnection;
  } = {};
  const handledToolCallIds = new Set<string>();
  const pendingToolCallIds = new Set<string>();
  let externallyCancelled = signal?.aborted ?? false;
  let transcriptionCompleted = false;

  function publish(next: RealtimeBrowserSessionSnapshot): void {
    if (externallyCancelled) {
      return;
    }

    snapshot = next;
    onSnapshot?.(snapshot);
  }

  function cleanupResources(): void {
    abortController.abort();
    signal?.removeEventListener("abort", cancelFromExternalSignal);
    cleanupState.dataChannel?.close();
    cleanupState.peerConnection?.close();
    stopLocalInputTracks();
    if (remoteAudio !== null) {
      remoteAudio.srcObject = null;
    }
  }

  function stopLocalInputTracks(): void {
    for (const track of localTracks) {
      track.stop();
    }
  }

  async function completeTranscription(transcript: string): Promise<void> {
    if (mode !== "transcription_only" || transcriptionCompleted || transcript.length === 0) {
      return;
    }

    transcriptionCompleted = true;
    cleanupResources();
    try {
      await onInputTranscriptCompleted?.(transcript);
    } catch {
      publish({
        ...snapshot,
        message: "Workspace voice query failed after transcription.",
        status: "error"
      });
    }
  }

  function cancelFromExternalSignal(): void {
    externallyCancelled = true;
    snapshot = { ...snapshot, message: "Realtime session cancelled.", status: "ended" };
    cleanupResources();
  }

  function cancelledSession(): RealtimeBrowserSession | undefined {
    if (!externallyCancelled) {
      return undefined;
    }

    snapshot = { ...snapshot, message: "Realtime session cancelled.", status: "ended" };
    cleanupResources();
    return { close, getSnapshot: () => snapshot };
  }

  function close(): void {
    cleanupResources();
    publish({ ...snapshot, message: "Realtime session ended.", status: "ended" });
  }

  if (signal !== undefined && !signal.aborted) {
    signal.addEventListener("abort", cancelFromExternalSignal, { once: true });
  }

  const cancelledBeforeStart = cancelledSession();
  if (cancelledBeforeStart !== undefined) {
    return cancelledBeforeStart;
  }

  publish({
    message: "Requesting audit-scoped Realtime session.",
    recordIds: scopedRecordIds,
    status: "connecting"
  });

  let secretResponse: Response;
  let secret: ClientSecretResult;
  try {
    secretResponse = await fetcher("/api/query/realtime-client-secret", {
      body: JSON.stringify({
        ...(mode === "transcription_only" ? { mode } : {}),
        question: clientSecretQuestion,
        ...(mode === "transcription_only" || selectedQueryScope === undefined
          ? {}
          : { recordIds: [...selectedQueryScope.recordIds], selectedLineId: selectedQueryScope.selectedLineId })
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: abortController.signal
    });
    const cancelledAfterSecretResponse = cancelledSession();
    if (cancelledAfterSecretResponse !== undefined) {
      return cancelledAfterSecretResponse;
    }

    secret = (await secretResponse.json()) as ClientSecretResult;
    const cancelledAfterSecretBody = cancelledSession();
    if (cancelledAfterSecretBody !== undefined) {
      return cancelledAfterSecretBody;
    }
  } catch (error) {
    const cancelledAfterSecretError = cancelledSession();
    if (cancelledAfterSecretError !== undefined) {
      return cancelledAfterSecretError;
    }

    throw error;
  }
  const clientSecret = secret.clientSecret?.value;

  if (!secretResponse.ok || secret.status !== "issued" || clientSecret === undefined || !clientSecret.startsWith("ek_")) {
    publish({
      message: "Realtime credentials unavailable. Offline cited answer remains active.",
      recordIds: secret.auditPolicy?.recordIds ?? policyRecordIds,
      status: "blocked"
    });
    return { close, getSnapshot: () => snapshot };
  }

  try {
    const cancelledBeforeMedia = cancelledSession();
    if (cancelledBeforeMedia !== undefined) {
      return cancelledBeforeMedia;
    }

    const mediaStream = await mediaDevices.getUserMedia({ audio: true });
    for (const track of mediaStream.getTracks()) {
      localTracks.push(track);
    }
    const cancelledAfterMedia = cancelledSession();
    if (cancelledAfterMedia !== undefined) {
      return cancelledAfterMedia;
    }

    const peerConnection = createPeerConnection();
    cleanupState.peerConnection = peerConnection;
    peerConnection.ontrack = (event) => {
      if (remoteAudio !== null) {
        remoteAudio.srcObject = event.streams[0] ?? null;
        remoteAudio.autoplay = true;
      }
    };
    for (const track of localTracks) {
      peerConnection.addTrack(track, mediaStream);
    }
    const dataChannel = peerConnection.createDataChannel("oai-events");
    cleanupState.dataChannel = dataChannel;
    dataChannel.addEventListener("message", (event) => {
      void handleRealtimeEvent(String(event.data), {
          cleanupResources,
          dataChannel,
          fallbackQuestion: clientSecretQuestion,
          fetcher,
          getSnapshot: () => snapshot,
          handledToolCallIds,
          mode,
          onInputTranscriptCompleted: completeTranscription,
          pendingToolCallIds,
          publish,
          ...(secret.model === undefined ? {} : { realtimeModel: secret.model }),
          selectedQueryScope,
          stopLocalInputTracks,
          toolEndpoint
        })
        .catch(() => {
          cleanupResources();
          publish({
            ...snapshot,
            message: "Realtime cited query failed closed.",
            status: "error"
          });
        });
    });

    const offer = await peerConnection.createOffer();
    const cancelledAfterOffer = cancelledSession();
    if (cancelledAfterOffer !== undefined) {
      return cancelledAfterOffer;
    }

    await peerConnection.setLocalDescription(offer);
    const cancelledAfterLocalDescription = cancelledSession();
    if (cancelledAfterLocalDescription !== undefined) {
      return cancelledAfterLocalDescription;
    }

    const answerResponse = await fetcher(realtimeCallsUrl, {
      body: offer.sdp ?? "",
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        "Content-Type": "application/sdp"
      },
      method: "POST",
      signal: abortController.signal
    });
    const cancelledAfterSdpResponse = cancelledSession();
    if (cancelledAfterSdpResponse !== undefined) {
      return cancelledAfterSdpResponse;
    }

    if (!answerResponse.ok) {
      publish({
        message: "Realtime SDP exchange failed.",
        recordIds: secret.auditPolicy?.recordIds ?? policyRecordIds,
        status: "error"
      });
      cleanupResources();
      return { close, getSnapshot: () => snapshot };
    }

    const answerSdp = await answerResponse.text();
    const cancelledAfterSdpBody = cancelledSession();
    if (cancelledAfterSdpBody !== undefined) {
      return cancelledAfterSdpBody;
    }

    await peerConnection.setRemoteDescription({
      sdp: answerSdp,
      type: "answer"
    });
    const cancelledAfterRemoteDescription = cancelledSession();
    if (cancelledAfterRemoteDescription !== undefined) {
      return cancelledAfterRemoteDescription;
    }

    dataChannel.addEventListener("open", () => {
      if (externallyCancelled) {
        return;
      }

      if (mode === "query_tool" && hasTypedQuestion) {
        dataChannel.send(
          JSON.stringify({
            item: {
              content: [{ text: trimmedQuestion, type: "input_text" }],
              role: "user",
              type: "message"
            },
            type: "conversation.item.create"
          })
        );
        dataChannel.send(JSON.stringify({ type: "response.create" }));
      }
    });
  } catch {
    const cancelledAfterSetupError = cancelledSession();
    if (cancelledAfterSetupError !== undefined) {
      return cancelledAfterSetupError;
    }

    publish({
      message: "Realtime session setup failed.",
      recordIds: secret.auditPolicy?.recordIds ?? policyRecordIds,
      status: "error"
    });
    cleanupResources();
    return { close, getSnapshot: () => snapshot };
  }

  publish({
    ...(secret.deterministicBasis === undefined ? {} : { deterministicBasis: secret.deterministicBasis }),
    message: `WebRTC session ready for ${secret.model ?? "pinned Realtime model"} with OpenAI-Safety-Identifier bound.`,
    recordIds: secret.auditPolicy?.recordIds ?? policyRecordIds,
    status: "connected"
  });

  return { close, getSnapshot: () => snapshot };
}

function isMicrophoneFirstQuestionPrompt(question: string): boolean {
  return question === "Voice question from microphone for the selected evidence packet.";
}

async function handleRealtimeEvent(
  rawEvent: string,
  context: {
    dataChannel: RTCDataChannel;
    cleanupResources: () => void;
    fallbackQuestion: string;
    fetcher: typeof fetch;
    getSnapshot: () => RealtimeBrowserSessionSnapshot;
    handledToolCallIds: Set<string>;
    mode: "query_tool" | "transcription_only";
    onInputTranscriptCompleted: (transcript: string) => Promise<void>;
    pendingToolCallIds: Set<string>;
    publish: (snapshot: RealtimeBrowserSessionSnapshot) => void;
    realtimeModel?: string;
    selectedQueryScope: SelectedQueryScope | undefined;
    stopLocalInputTracks: () => void;
    toolEndpoint: string;
  }
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawEvent) as unknown;
  } catch {
    return;
  }

  if (!isObject(parsed)) {
    return;
  }

  const toolCall = readRealtimeFunctionCall(parsed);
  if (toolCall !== undefined) {
    if (context.mode === "query_tool" && !context.handledToolCallIds.has(toolCall.callId)) {
      context.handledToolCallIds.add(toolCall.callId);
      context.pendingToolCallIds.add(toolCall.callId);
      try {
        await handleRealtimeToolCall(toolCall, context);
      } finally {
        context.pendingToolCallIds.delete(toolCall.callId);
      }
    }
    return;
  }

  const eventType = typeof parsed["type"] === "string" ? parsed["type"] : "";
  if (context.getSnapshot().status === "answered" && isMicrophoneInputEvent(eventType)) {
    return;
  }
  if (eventType === "input_audio_buffer.speech_started") {
    const current = context.getSnapshot();
    context.publish({
      ...current,
      message: "Hearing you...",
      status: "hearing"
    });
    return;
  }

  if (eventType === "input_audio_buffer.speech_stopped") {
    const current = context.getSnapshot();
    context.publish({
      ...current,
      message: "Processing...",
      status: "processing"
    });
    return;
  }

  if (
    eventType === "conversation.item.input_audio_transcription.delta" ||
    eventType === "input_audio_transcription.delta"
  ) {
    const current = context.getSnapshot();
    const delta = readRealtimeTranscriptDelta(parsed);
    context.publish({
      ...current,
      ...(delta.length === 0 ? {} : { inputTranscript: `${current.inputTranscript ?? ""}${delta}` }),
      message: "Hearing you...",
      status: "hearing"
    });
    return;
  }

  if (
    eventType === "conversation.item.input_audio_transcription.completed" ||
    eventType === "conversation.item.input_audio_transcription.done" ||
    eventType === "input_audio_transcription.completed"
  ) {
    const current = context.getSnapshot();
    const transcript = readRealtimeTranscriptText(parsed);
    context.publish({
      ...current,
      ...(transcript.length === 0 ? {} : { inputTranscript: transcript }),
      message: "Processing...",
      status: "processing"
    });
    if (context.mode === "transcription_only") {
      await context.onInputTranscriptCompleted(transcript);
    }
    return;
  }

  if (
    eventType === "response.output_audio_transcript.delta" ||
    eventType === "response.audio_transcript.delta"
  ) {
    const current = context.getSnapshot();
    context.publish({
      ...current,
      message: "Assistant answer playing.",
      status: current.status === "answered" ? "answered" : "processing"
    });
    return;
  }

  if (
    eventType === "response.output_audio_transcript.done" ||
    eventType === "response.audio_transcript.done"
  ) {
    const current = context.getSnapshot();
    context.publish({
      ...current,
      message: current.status === "answered" ? current.message : "Assistant answer played.",
      status: current.status === "answered" ? "answered" : "processing"
    });
    return;
  }

  if (parsed["type"] === "recoup.cited_answer") {
    const text = typeof parsed["text"] === "string" ? parsed["text"] : undefined;
    const deterministicBasis =
      typeof parsed["deterministicBasis"] === "string" ? parsed["deterministicBasis"] : undefined;
    const citedAnswer = readCitedAnswer({
      ...(text === undefined ? {} : { answer: text }),
      ...(deterministicBasis === undefined ? {} : { deterministicBasis }),
      citationParity: parsed["citationParity"],
      recordIds: parsed["recordIds"]
    });
    if (citedAnswer !== undefined) {
      const current = context.getSnapshot();
      context.publish({
        answer: citedAnswer.answer,
        assistantTranscript: citedAnswer.answer,
        deterministicBasis: citedAnswer.deterministicBasis,
        ...(current.inputTranscript === undefined ? {} : { inputTranscript: current.inputTranscript }),
        message: "Cited Realtime answer received.",
        recordIds: citedAnswer.recordIds,
        status: "answered"
      });
      return;
    }

    context.cleanupResources();
    publishBlockedCitationParity(context.publish, policyRecordIds);
    return;
  }

  if (parsed["type"] === "response.done") {
    if (context.mode === "transcription_only") {
      return;
    }
    const current = context.getSnapshot();
    if (current.status === "answered") {
      return;
    }
    if (context.pendingToolCallIds.size > 0) {
      context.publish({
        ...current,
        message: "Waiting for cited query result...",
        status: "processing"
      });
      return;
    }
    context.cleanupResources();
    context.publish({
      ...(current.deterministicBasis === undefined ? {} : { deterministicBasis: current.deterministicBasis }),
      ...(current.inputTranscript === undefined ? {} : { inputTranscript: current.inputTranscript }),
      message: "Blocked uncited Realtime output; deterministic query answer remains required.",
      recordIds: current.recordIds,
      status: "blocked_uncited_output"
    });
  }
}

async function handleRealtimeToolCall(
  toolCall: RealtimeFunctionCall,
  {
    cleanupResources,
    dataChannel,
    fallbackQuestion,
    fetcher,
    getSnapshot,
    publish,
    realtimeModel,
    selectedQueryScope,
    stopLocalInputTracks,
    toolEndpoint
  }: {
    cleanupResources: () => void;
    dataChannel: RTCDataChannel;
    fallbackQuestion: string;
    fetcher: typeof fetch;
    getSnapshot: () => RealtimeBrowserSessionSnapshot;
    publish: (snapshot: RealtimeBrowserSessionSnapshot) => void;
    realtimeModel?: string;
    selectedQueryScope: SelectedQueryScope | undefined;
    stopLocalInputTracks: () => void;
    toolEndpoint: string;
  }
): Promise<void> {
  const currentBeforeTool = getSnapshot();
  const response = await fetcher(toolEndpoint, {
    body: JSON.stringify({
      argumentsJson: scopedToolArgumentsJson(
        toolCall,
        selectedQueryScope,
        readNonEmptyString(currentBeforeTool.inputTranscript) ?? fallbackQuestion
      ),
      name: toolCall.name
    }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  const result = (await response.json()) as RealtimeToolRouteResult;

  if (!response.ok || result.status !== "ok") {
    cleanupResources();
    publish({
      deterministicBasis: result.deterministicBasis ?? "Realtime tool bridge blocked the requested tool call.",
      message: "Blocked Realtime tool call.",
      recordIds: result.recordIds ?? policyRecordIds,
      status: "blocked"
    });
    return;
  }

  const citedAnswer = readCitedAnswer(result.output);
  if (isRealtimeQueryAnswerToolName(toolCall.name) && citedAnswer === undefined) {
    cleanupResources();
    publish({
      deterministicBasis: result.deterministicBasis,
      message: "Blocked cited Realtime answer without matching voice/text citation parity.",
      recordIds: result.recordIds,
      status: "blocked_uncited_output"
    });
    return;
  }

  const output = isRealtimeQueryAnswerToolName(toolCall.name)
    ? sanitizedRealtimeQueryToolOutput(result.output)
    : result.output;
  if (citedAnswer !== undefined) {
    const current = getSnapshot();
    publish({
      answer: citedAnswer.answer,
      assistantTranscript: citedAnswer.answer,
      deterministicBasis: citedAnswer.deterministicBasis,
      ...(current.inputTranscript === undefined ? {} : { inputTranscript: current.inputTranscript }),
      message: "Cited Realtime answer received.",
      modelExecution: buildRealtimeToolBridgeModelExecution({
        citedAnswer,
        model: realtimeModel,
        selectedQueryScope,
        toolName: toolCall.name
      }),
      recordIds: citedAnswer.recordIds,
      status: "answered"
    });
    stopLocalInputTracks();
  }

  try {
    dataChannel.send(
      JSON.stringify({
        item: {
          call_id: toolCall.callId,
          output: JSON.stringify(output),
          type: "function_call_output"
        },
        type: "conversation.item.create"
      })
    );
    dataChannel.send(JSON.stringify({ type: "response.create" }));
  } catch {
    cleanupResources();
    return;
  }

  if (citedAnswer !== undefined) {
    return;
  }

}

function readRealtimeTranscriptDelta(event: Record<string, unknown>): string {
  const delta = event["delta"];
  if (typeof delta === "string") {
    return delta;
  }

  return "";
}

function isMicrophoneInputEvent(eventType: string): boolean {
  return (
    eventType === "input_audio_buffer.speech_started" ||
    eventType === "input_audio_buffer.speech_stopped" ||
    eventType.startsWith("conversation.item.input_audio_transcription.") ||
    eventType.startsWith("input_audio_transcription.")
  );
}

function readRealtimeTranscriptText(event: Record<string, unknown>): string {
  const transcript = event["transcript"];
  if (typeof transcript === "string") {
    return transcript;
  }
  const text = event["text"];
  if (typeof text === "string") {
    return text;
  }

  return readRealtimeTranscriptDelta(event);
}

function normalizeSelectedQueryScope(input: {
  recordIds?: readonly string[];
  selectedLineId?: string;
}): SelectedQueryScope | undefined {
  const selectedLineId = input.selectedLineId?.trim();
  const recordIds = input.recordIds?.map((recordId) => recordId.trim()).filter((recordId) => recordId.length > 0);
  if (selectedLineId === undefined || selectedLineId.length === 0 || recordIds === undefined || recordIds.length === 0) {
    return undefined;
  }

  return {
    recordIds: Array.from(new Set([selectedLineId, ...recordIds])),
    selectedLineId
  };
}

function scopedToolArgumentsJson(
  toolCall: RealtimeFunctionCall,
  selectedQueryScope: SelectedQueryScope | undefined,
  fallbackQuestion: string
): string {
  if (!isRealtimeQueryAnswerToolName(toolCall.name) || selectedQueryScope === undefined) {
    return toolCall.argumentsJson;
  }

  return JSON.stringify({
    question: fallbackQuestion,
    recordIds: selectedQueryScope.recordIds,
    selectedLineId: selectedQueryScope.selectedLineId
  });
}

function isRealtimeQueryAnswerToolName(name: string): boolean {
  return name === "query.answer" || name === "query_answer";
}

interface RealtimeFunctionCall {
  argumentsJson: string;
  callId: string;
  name: string;
}

type RealtimeToolRouteResult =
  | {
      deterministicBasis: string;
      output: unknown;
      recordIds: string[];
      status: "ok";
      toolName: string;
    }
  | {
      deterministicBasis?: string;
      recordIds?: string[];
      status: "blocked_tool";
      toolName?: string;
    };

function readRealtimeFunctionCall(event: Record<string, unknown>): RealtimeFunctionCall | undefined {
  if (event["type"] === "response.output_item.done" && isObject(event["item"])) {
    return readFunctionCallFields(event["item"], true);
  }

  if (event["type"] === "response.function_call_arguments.done") {
    return readFunctionCallFields(event, false);
  }

  return undefined;
}

function readFunctionCallFields(value: Record<string, unknown>, requireFunctionCallType: boolean): RealtimeFunctionCall | undefined {
  if (
    requireFunctionCallType &&
    value["type"] !== undefined &&
    value["type"] !== "function_call" &&
    value["type"] !== "function_call_arguments"
  ) {
    return undefined;
  }

  const name = typeof value["name"] === "string" ? value["name"] : undefined;
  const argumentsJson = typeof value["arguments"] === "string" ? value["arguments"] : undefined;
  const callId = typeof value["call_id"] === "string" ? value["call_id"] : undefined;
  if (name === undefined || argumentsJson === undefined || callId === undefined) {
    return undefined;
  }

  return { argumentsJson, callId, name };
}

function readCitedAnswer(output: unknown):
  | {
      answer: string;
      deterministicBasis: string;
      recordIds: string[];
    }
  | undefined {
  if (!isObject(output)) {
    return undefined;
  }

  const answer = typeof output["answer"] === "string" ? output["answer"] : undefined;
  const deterministicBasis = typeof output["deterministicBasis"] === "string" ? output["deterministicBasis"] : undefined;
  const recordIds = readStrictStringArray(output["recordIds"]);
  if (
    answer === undefined ||
    deterministicBasis === undefined ||
    recordIds === undefined ||
    recordIds.length === 0 ||
    !hasValidCitationParity(output, recordIds)
  ) {
    return undefined;
  }

  return { answer, deterministicBasis, recordIds };
}

function buildRealtimeToolBridgeModelExecution(input: {
  citedAnswer: { recordIds: string[] };
  model: string | undefined;
  selectedQueryScope: SelectedQueryScope | undefined;
  toolName: string;
}): RealtimeToolBridgeModelExecution {
  return {
    citationParity: "same_record_ids",
    deterministicBasis: realtimeToolBridgeDeterministicBasis,
    mode: "live_realtime_tool_bridge",
    ...(input.model === undefined ? {} : { model: input.model }),
    rawModelTextPolicy: "suppressed",
    recordCount: input.citedAnswer.recordIds.length,
    ...(input.selectedQueryScope === undefined ? {} : { selectedLineId: input.selectedQueryScope.selectedLineId }),
    toolName: normalizeRealtimeToolName(input.toolName),
    toolRouteStatus: "ok"
  };
}

function sanitizedRealtimeQueryToolOutput(output: unknown): unknown {
  if (!isObject(output)) {
    return output;
  }

  const safeOutput: Record<string, unknown> = { ...output };
  delete safeOutput["modelExecution"];
  return safeOutput;
}

function normalizeRealtimeToolName(name: string): string {
  return name.replaceAll("_", ".");
}

function hasValidCitationParity(output: Record<string, unknown>, recordIds: readonly string[]): boolean {
  const citationParity = output["citationParity"];
  if (!isObject(citationParity)) {
    return false;
  }

  return (
    citationParity["parity"] === "same_record_ids" &&
    sameStringArray(readStrictStringArray(citationParity["textRecordIds"]), recordIds) &&
    sameStringArray(readStrictStringArray(citationParity["voiceRecordIds"]), recordIds)
  );
}

function publishBlockedCitationParity(
  publish: (snapshot: RealtimeBrowserSessionSnapshot) => void,
  recordIds: string[]
): void {
  publish({
    message: "Blocked cited Realtime answer without matching voice/text citation parity.",
    recordIds,
    status: "blocked_uncited_output"
  });
}

function readStrictStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.every((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0)
    ? value
    : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function sameStringArray(left: readonly string[] | undefined, right: readonly string[]): boolean {
  if (left === undefined) {
    return false;
  }

  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
