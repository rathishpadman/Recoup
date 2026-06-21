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
  remoteAudio?: HTMLAudioElement | null;
  toolEndpoint?: string;
}

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
  remoteAudio = null,
  toolEndpoint = realtimeToolUrl
}: StartRealtimeBrowserSessionInput): Promise<RealtimeBrowserSession> {
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

  function publish(next: RealtimeBrowserSessionSnapshot): void {
    snapshot = next;
    onSnapshot?.(snapshot);
  }

  function cleanupResources(): void {
    abortController.abort();
    cleanupState.dataChannel?.close();
    cleanupState.peerConnection?.close();
    for (const track of localTracks) {
      track.stop();
    }
    if (remoteAudio !== null) {
      remoteAudio.srcObject = null;
    }
  }

  function close(): void {
    cleanupResources();
    publish({ ...snapshot, message: "Realtime session ended.", status: "ended" });
  }

  if (trimmedQuestion.length === 0) {
    return { close, getSnapshot: () => snapshot };
  }

  publish({
    message: "Requesting audit-scoped Realtime session.",
    recordIds: policyRecordIds,
    status: "connecting"
  });

  const secretResponse = await fetcher("/api/query/realtime-client-secret", {
    body: JSON.stringify({ question: trimmedQuestion }),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal: abortController.signal
  });
  const secret = (await secretResponse.json()) as ClientSecretResult;
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
    const mediaStream = await mediaDevices.getUserMedia({ audio: true });
    for (const track of mediaStream.getTracks()) {
      localTracks.push(track);
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
    await peerConnection.setLocalDescription(offer);
    const answerResponse = await fetcher(realtimeCallsUrl, {
      body: offer.sdp ?? "",
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        "Content-Type": "application/sdp"
      },
      method: "POST",
      signal: abortController.signal
    });

    if (!answerResponse.ok) {
      publish({
        message: "Realtime SDP exchange failed.",
        recordIds: secret.auditPolicy?.recordIds ?? policyRecordIds,
        status: "error"
      });
      cleanupResources();
      return { close, getSnapshot: () => snapshot };
    }

    await peerConnection.setRemoteDescription({
      sdp: await answerResponse.text(),
      type: "answer"
    });
    dataChannel.addEventListener("open", () => {
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
    const recordIds = Array.isArray(parsed["recordIds"])
      ? parsed["recordIds"].filter((value): value is string => typeof value === "string" && value.length > 0)
      : [];
    if (text !== undefined && deterministicBasis !== undefined && recordIds.length > 0) {
      context.publish({
        answer: text,
        deterministicBasis,
        message: "Cited Realtime answer received.",
        recordIds,
        status: "answered"
      });
    }
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

  const citedAnswer = readCitedAnswer(result.output);
  if (citedAnswer !== undefined) {
    publish({
      answer: citedAnswer.answer,
      deterministicBasis: citedAnswer.deterministicBasis,
      message: "Cited Realtime answer received.",
      recordIds: citedAnswer.recordIds,
      status: "answered"
    });
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
  const recordIds = Array.isArray(output["recordIds"])
    ? output["recordIds"].filter((recordId): recordId is string => typeof recordId === "string" && recordId.length > 0)
    : [];
  if (answer === undefined || deterministicBasis === undefined || recordIds.length === 0) {
    return undefined;
  }

  return { answer, deterministicBasis, recordIds };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
