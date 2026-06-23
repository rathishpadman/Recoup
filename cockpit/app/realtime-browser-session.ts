export type RealtimeBrowserSessionStatus =
  | "answered"
  | "blocked"
  | "blocked_uncited_output"
  | "connected"
  | "connecting"
  | "ended"
  | "error";

export interface RealtimeBrowserSessionSnapshot {
  answer?: string;
  deterministicBasis?: string;
  message: string;
  recordIds: string[];
  status: RealtimeBrowserSessionStatus;
}

export interface RealtimeBrowserSession {
  close: () => void;
  getSnapshot: () => RealtimeBrowserSessionSnapshot;
}

export interface StartRealtimeBrowserSessionInput {
  createPeerConnection?: () => RTCPeerConnection;
  fetcher?: typeof fetch;
  mediaDevices?: Pick<MediaDevices, "getUserMedia">;
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

const realtimeCallsUrl = "https://api.openai.com/v1/realtime/calls";
const realtimeToolUrl = "/api/query/realtime-tool";
const policyRecordIds = ["OPENAI-REALTIME-POLICY"];

export async function startRealtimeBrowserSession({
  createPeerConnection = () => new RTCPeerConnection(),
  fetcher = fetch,
  mediaDevices = navigator.mediaDevices,
  onSnapshot,
  question,
  recordIds,
  remoteAudio = null,
  selectedLineId,
  signal,
  toolEndpoint = realtimeToolUrl
}: RealtimeBrowserSessionInput): Promise<RealtimeBrowserSession> {
  const trimmedQuestion = question.trim();
  let snapshot: RealtimeBrowserSessionSnapshot = {
    message: "Ask a scoped question before requesting a Realtime session.",
    recordIds: policyRecordIds,
    status: "blocked"
  };
  const localTracks: MediaStreamTrack[] = [];
  const abortController = new AbortController();
  const cleanupState: {
    dataChannel?: RTCDataChannel;
    peerConnection?: RTCPeerConnection;
  } = {};
  let externallyCancelled = signal?.aborted ?? false;

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
    for (const track of localTracks) {
      track.stop();
    }
    if (remoteAudio !== null) {
      remoteAudio.srcObject = null;
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

  if (trimmedQuestion.length === 0) {
    return { close, getSnapshot: () => snapshot };
  }

  publish({
    message: "Requesting audit-scoped Realtime session.",
    recordIds: policyRecordIds,
    status: "connecting"
  });

  let secretResponse: Response;
  let secret: ClientSecretResult;
  try {
    secretResponse = await fetcher("/api/query/realtime-client-secret", {
      body: JSON.stringify({
        question: trimmedQuestion,
        ...(recordIds === undefined ? {} : { recordIds: [...recordIds] }),
        ...(selectedLineId === undefined ? {} : { selectedLineId })
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
        dataChannel,
        fetcher,
        getSnapshot: () => snapshot,
        publish,
        toolEndpoint
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

async function handleRealtimeEvent(
  rawEvent: string,
  context: {
    dataChannel: RTCDataChannel;
    fetcher: typeof fetch;
    getSnapshot: () => RealtimeBrowserSessionSnapshot;
    publish: (snapshot: RealtimeBrowserSessionSnapshot) => void;
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
    await handleRealtimeToolCall(toolCall, context);
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
      context.publish({
        answer: citedAnswer.answer,
        deterministicBasis: citedAnswer.deterministicBasis,
        message: "Cited Realtime answer received.",
        recordIds: citedAnswer.recordIds,
        status: "answered"
      });
      return;
    }

    publishBlockedCitationParity(context.publish, policyRecordIds);
    return;
  }

  if (parsed["type"] === "response.done") {
    const current = context.getSnapshot();
    context.publish({
      ...(current.deterministicBasis === undefined ? {} : { deterministicBasis: current.deterministicBasis }),
      message: "Blocked uncited Realtime output; deterministic query answer remains required.",
      recordIds: current.recordIds,
      status: "blocked_uncited_output"
    });
  }
}

async function handleRealtimeToolCall(
  toolCall: RealtimeFunctionCall,
  {
    dataChannel,
    fetcher,
    publish,
    toolEndpoint
  }: {
    dataChannel: RTCDataChannel;
    fetcher: typeof fetch;
    publish: (snapshot: RealtimeBrowserSessionSnapshot) => void;
    toolEndpoint: string;
  }
): Promise<void> {
  const response = await fetcher(toolEndpoint, {
    body: JSON.stringify({
      argumentsJson: toolCall.argumentsJson,
      name: toolCall.name
    }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  const result = (await response.json()) as RealtimeToolRouteResult;

  if (!response.ok || result.status !== "ok") {
    publish({
      deterministicBasis: result.deterministicBasis ?? "Realtime tool bridge blocked the requested tool call.",
      message: "Blocked Realtime tool call.",
      recordIds: result.recordIds ?? policyRecordIds,
      status: "blocked"
    });
    return;
  }

  const citedAnswer = readCitedAnswer(result.output);
  if (toolCall.name === "query.answer" && citedAnswer === undefined) {
    publish({
      deterministicBasis: result.deterministicBasis,
      message: "Blocked cited Realtime answer without matching voice/text citation parity.",
      recordIds: result.recordIds,
      status: "blocked_uncited_output"
    });
    return;
  }

  dataChannel.send(
    JSON.stringify({
      item: {
        call_id: toolCall.callId,
        output: JSON.stringify(result.output),
        type: "function_call_output"
      },
      type: "conversation.item.create"
    })
  );
  dataChannel.send(JSON.stringify({ type: "response.create" }));

  if (citedAnswer !== undefined) {
    publish({
      answer: citedAnswer.answer,
      deterministicBasis: citedAnswer.deterministicBasis,
      message: "Cited Realtime answer received.",
      recordIds: citedAnswer.recordIds,
      status: "answered"
    });
    return;
  }

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

function sameStringArray(left: readonly string[] | undefined, right: readonly string[]): boolean {
  if (left === undefined) {
    return false;
  }

  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
