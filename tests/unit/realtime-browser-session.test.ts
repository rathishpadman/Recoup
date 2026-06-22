import { describe, expect, it } from "vitest";
import { startRealtimeBrowserSession } from "../../cockpit/app/realtime-browser-session.js";

describe("Realtime browser session helper", () => {
  it("does not request a client secret, microphone, or peer connection for a blank question", async () => {
    const fakes = createRealtimeFakes();
    const result = await startRealtimeBrowserSession({
      createPeerConnection: fakes.createPeerConnection,
      fetcher: fakes.fetcher,
      mediaDevices: fakes.mediaDevices,
      question: " "
    });

    expect(result.getSnapshot().status).toBe("blocked");
    expect(fakes.fetchCalls).toEqual([]);
    expect(fakes.mediaCalls).toEqual([]);
    expect(fakes.peerConnections).toEqual([]);
  });

  it("requests the local cockpit proxy before opening microphone or peer connection", async () => {
    const fakes = createRealtimeFakes();
    fakes.enqueueJsonResponse({
      auditPolicy: {
        externalActions: "none",
        recordIds: ["OPENAI-REALTIME-POLICY"],
        retention: "Audit hashes and cited record ids only; no raw audio."
      },
      clientSecret: { value: "ek_test_client_secret" },
      deterministicBasis: "credential gate",
      model: "gpt-realtime-2",
      status: "issued",
      transport: "webrtc"
    });
    fakes.enqueueTextResponse("v=0\r\ns=answer");

    const result = await startRealtimeBrowserSession({
      createPeerConnection: fakes.createPeerConnection,
      fetcher: fakes.fetcher,
      mediaDevices: fakes.mediaDevices,
      question: "Why is Harbor blocked?"
    });

    expect(result.getSnapshot().status).toBe("connected");
    expect(fakes.events.slice(0, 3)).toEqual([
      "fetch:/api/query/realtime-client-secret",
      "media:getUserMedia",
      "peer:create"
    ]);
    expect(fakes.fetchCalls[0]?.url).toBe("/api/query/realtime-client-secret");
    expect(fakes.fetchCalls[0]?.body).toBe(JSON.stringify({ question: "Why is Harbor blocked?" }));
    expect(JSON.stringify(fakes.fetchCalls[0])).not.toContain("safetyIdentifier");
    expect(JSON.stringify(fakes.fetchCalls[0])).not.toContain("OPENAI_API_KEY");
    expect(fakes.mediaCalls).toEqual([{ audio: true }]);
    expect(fakes.fetchCalls[1]?.url).toBe("https://api.openai.com/v1/realtime/calls");
    expect(fakes.fetchCalls[1]?.headers).toMatchObject({
      Authorization: "Bearer ek_test_client_secret",
      "Content-Type": "application/sdp"
    });
    expect(JSON.stringify(result)).not.toContain("ek_test_client_secret");
  });

  it("blocks non-ephemeral client secrets before opening microphone or peer connection", async () => {
    const fakes = createRealtimeFakes();
    fakes.enqueueJsonResponse({
      auditPolicy: {
        externalActions: "none",
        recordIds: ["OPENAI-REALTIME-POLICY"],
        retention: "Audit hashes only."
      },
      clientSecret: { value: "sk_leaked_server_secret" },
      deterministicBasis: "credential gate",
      model: "gpt-realtime-2",
      status: "issued",
      transport: "webrtc"
    });

    const result = await startRealtimeBrowserSession({
      createPeerConnection: fakes.createPeerConnection,
      fetcher: fakes.fetcher,
      mediaDevices: fakes.mediaDevices,
      question: "Why is Harbor blocked?"
    });

    expect(result.getSnapshot()).toMatchObject({
      recordIds: ["OPENAI-REALTIME-POLICY"],
      status: "blocked"
    });
    expect(fakes.mediaCalls).toEqual([]);
    expect(fakes.peerConnections).toEqual([]);
  });

  it("blocks uncited model output instead of surfacing it as an answer", async () => {
    const fakes = createConnectedRealtimeFakes();
    const result = await startRealtimeBrowserSession({
      createPeerConnection: fakes.createPeerConnection,
      fetcher: fakes.fetcher,
      mediaDevices: fakes.mediaDevices,
      question: "Why is Harbor blocked?"
    });

    fakes.lastDataChannel.dispatchMessage(
      JSON.stringify({
        response: { output_text: "Harbor should be blocked." },
        type: "response.done"
      })
    );

    expect(result.getSnapshot().answer).toBeUndefined();
    expect(result.getSnapshot().status).toBe("blocked_uncited_output");
  });

  it("accepts cited deterministic query output", async () => {
    const fakes = createConnectedRealtimeFakes();
    const result = await startRealtimeBrowserSession({
      createPeerConnection: fakes.createPeerConnection,
      fetcher: fakes.fetcher,
      mediaDevices: fakes.mediaDevices,
      question: "Why is Harbor blocked?"
    });

    fakes.lastDataChannel.dispatchMessage(
      JSON.stringify({
        deterministicBasis: "query.answer + cited records",
        citationParity: {
          textRecordIds: ["CUST-HARBOR"],
          voiceRecordIds: ["CUST-HARBOR"],
          parity: "same_record_ids"
        },
        recordIds: ["CUST-HARBOR"],
        text:
          "Harbor's cited answer must disclose governed config/runtime injection and VERIFY-PROD calibration remain pending.",
        type: "recoup.cited_answer"
      })
    );

    expect(result.getSnapshot()).toMatchObject({
      answer:
        "Harbor's cited answer must disclose governed config/runtime injection and VERIFY-PROD calibration remain pending.",
      deterministicBasis: "query.answer + cited records",
      recordIds: ["CUST-HARBOR"],
      status: "answered"
    });
  });

  it("blocks cited Realtime answer events that do not carry matching voice/text citation parity", async () => {
    const fakes = createConnectedRealtimeFakes();
    const result = await startRealtimeBrowserSession({
      createPeerConnection: fakes.createPeerConnection,
      fetcher: fakes.fetcher,
      mediaDevices: fakes.mediaDevices,
      question: "Why is Harbor blocked?"
    });

    fakes.lastDataChannel.dispatchMessage(
      JSON.stringify({
        deterministicBasis: "query.answer + cited records",
        recordIds: ["CUST-HARBOR"],
        text: "Harbor should not display without parity.",
        type: "recoup.cited_answer"
      })
    );

    expect(result.getSnapshot().answer).toBeUndefined();
    expect(result.getSnapshot()).toMatchObject({
      recordIds: ["OPENAI-REALTIME-POLICY"],
      status: "blocked_uncited_output"
    });

    fakes.lastDataChannel.dispatchMessage(
      JSON.stringify({
        deterministicBasis: "query.answer + cited records",
        citationParity: {
          textRecordIds: ["CUST-HARBOR"],
          voiceRecordIds: ["ORDER-HARBOR-640K"],
          parity: "same_record_ids"
        },
        recordIds: ["CUST-HARBOR"],
        text: "Harbor should not display with mismatched parity.",
        type: "recoup.cited_answer"
      })
    );

    expect(result.getSnapshot().answer).toBeUndefined();
    expect(result.getSnapshot()).toMatchObject({
      recordIds: ["OPENAI-REALTIME-POLICY"],
      status: "blocked_uncited_output"
    });

    fakes.lastDataChannel.dispatchMessage(
      JSON.stringify({
        deterministicBasis: "query.answer + cited records",
        citationParity: {
          textRecordIds: ["CUST-HARBOR", 7],
          voiceRecordIds: ["CUST-HARBOR"],
          parity: "same_record_ids"
        },
        recordIds: ["CUST-HARBOR"],
        text: "Harbor should not display with malformed parity.",
        type: "recoup.cited_answer"
      })
    );

    expect(result.getSnapshot().answer).toBeUndefined();
    expect(result.getSnapshot()).toMatchObject({
      recordIds: ["OPENAI-REALTIME-POLICY"],
      status: "blocked_uncited_output"
    });
  });

  it("bridges Realtime function calls through the guarded local tool route and surfaces cited output", async () => {
    const fakes = createConnectedRealtimeFakes();
    fakes.enqueueJsonResponse({
      deterministicBasis: "Realtime tool allowlist + service-layer Zod validation.",
      output: {
        answer: "Harbor is blocked from cited deterministic state.",
        citationParity: {
          textRecordIds: ["CUST-HARBOR"],
          voiceRecordIds: ["CUST-HARBOR"],
          parity: "same_record_ids"
        },
        deterministicBasis: "query.answer + cited records",
        recordIds: ["CUST-HARBOR"]
      },
      recordIds: ["CUST-HARBOR"],
      status: "ok",
      toolName: "query.answer"
    });
    const result = await startRealtimeBrowserSession({
      createPeerConnection: fakes.createPeerConnection,
      fetcher: fakes.fetcher,
      mediaDevices: fakes.mediaDevices,
      question: "Why is Harbor blocked?"
    });

    fakes.lastDataChannel.dispatchMessage(
      JSON.stringify({
        item: {
          arguments: JSON.stringify({ question: "Why is Harbor blocked?" }),
          call_id: "call-query-answer",
          name: "query.answer",
          type: "function_call"
        },
        type: "response.output_item.done"
      })
    );
    await waitForMicrotasks();

    expect(fakes.fetchCalls[2]?.url).toBe("/api/query/realtime-tool");
    expect(fakes.fetchCalls[2]?.body).toBe(
      JSON.stringify({
        argumentsJson: JSON.stringify({ question: "Why is Harbor blocked?" }),
        name: "query.answer"
      })
    );
    expect(fakes.lastDataChannel.sentMessages.some((message) => message.includes("function_call_output"))).toBe(true);
    expect(result.getSnapshot()).toMatchObject({
      answer: "Harbor is blocked from cited deterministic state.",
      deterministicBasis: "query.answer + cited records",
      recordIds: ["CUST-HARBOR"],
      status: "answered"
    });
  });

  it("blocks Realtime tool output without matching citation parity before display", async () => {
    const fakes = createConnectedRealtimeFakes();
    fakes.enqueueJsonResponse({
      deterministicBasis: "Realtime tool allowlist + service-layer Zod validation.",
      output: {
        answer: "Harbor should not display without parity.",
        deterministicBasis: "query.answer + cited records",
        recordIds: ["CUST-HARBOR"]
      },
      recordIds: ["CUST-HARBOR"],
      status: "ok",
      toolName: "query.answer"
    });
    const result = await startRealtimeBrowserSession({
      createPeerConnection: fakes.createPeerConnection,
      fetcher: fakes.fetcher,
      mediaDevices: fakes.mediaDevices,
      question: "Why is Harbor blocked?"
    });

    fakes.lastDataChannel.dispatchMessage(
      JSON.stringify({
        item: {
          arguments: JSON.stringify({ question: "Why is Harbor blocked?" }),
          call_id: "call-query-answer",
          name: "query.answer",
          type: "function_call"
        },
        type: "response.output_item.done"
      })
    );
    await waitForMicrotasks();

    expect(result.getSnapshot().answer).toBeUndefined();
    expect(result.getSnapshot()).toMatchObject({
      recordIds: ["CUST-HARBOR"],
      status: "blocked_uncited_output"
    });
    expect(fakes.lastDataChannel.sentMessages.some((message) => message.includes("function_call_output"))).toBe(false);
    expect(fakes.lastDataChannel.sentMessages.some((message) => message.includes("response.create"))).toBe(false);
  });

  it("bridges Realtime function-call argument completion events through the guarded tool route", async () => {
    const fakes = createConnectedRealtimeFakes();
    fakes.enqueueJsonResponse({
      deterministicBasis: "Realtime tool allowlist + service-layer Zod validation.",
      output: {
        answer: "Harbor uses cited deterministic state.",
        citationParity: {
          textRecordIds: ["CUST-HARBOR"],
          voiceRecordIds: ["CUST-HARBOR"],
          parity: "same_record_ids"
        },
        deterministicBasis: "query.answer + cited records",
        recordIds: ["CUST-HARBOR"]
      },
      recordIds: ["CUST-HARBOR"],
      status: "ok",
      toolName: "query.answer"
    });
    const result = await startRealtimeBrowserSession({
      createPeerConnection: fakes.createPeerConnection,
      fetcher: fakes.fetcher,
      mediaDevices: fakes.mediaDevices,
      question: "Why is Harbor blocked?"
    });

    fakes.lastDataChannel.dispatchMessage(
      JSON.stringify({
        arguments: JSON.stringify({ question: "Why is Harbor blocked?" }),
        call_id: "call-query-arguments-done",
        name: "query.answer",
        type: "response.function_call_arguments.done"
      })
    );
    await waitForMicrotasks();

    expect(fakes.fetchCalls[2]?.url).toBe("/api/query/realtime-tool");
    expect(result.getSnapshot()).toMatchObject({
      answer: "Harbor uses cited deterministic state.",
      deterministicBasis: "query.answer + cited records",
      recordIds: ["CUST-HARBOR"],
      status: "answered"
    });
  });

  it("cleans up local resources when setup fails after microphone access", async () => {
    const fakes = createConnectedRealtimeFakes();
    fakes.failCreateOffer = true;

    const result = await startRealtimeBrowserSession({
      createPeerConnection: fakes.createPeerConnection,
      fetcher: fakes.fetcher,
      mediaDevices: fakes.mediaDevices,
      question: "Why is Harbor blocked?"
    });

    expect(result.getSnapshot().status).toBe("error");
    expect(fakes.lastDataChannel.closed).toBe(true);
    expect(fakes.peerConnections[0]?.closed).toBe(true);
    expect(fakes.mediaStream.tracks.every((track) => track.stopped)).toBe(true);
  });

  it("preserves error status when the SDP exchange fails", async () => {
    const fakes = createRealtimeFakes();
    fakes.enqueueJsonResponse({
      auditPolicy: {
        externalActions: "none",
        recordIds: ["OPENAI-REALTIME-POLICY"],
        retention: "Audit hashes only."
      },
      clientSecret: { value: "ek_test_client_secret" },
      deterministicBasis: "credential gate",
      model: "gpt-realtime-2",
      status: "issued",
      transport: "webrtc"
    });
    fakes.enqueueTextResponse("failed", 500);

    const result = await startRealtimeBrowserSession({
      createPeerConnection: fakes.createPeerConnection,
      fetcher: fakes.fetcher,
      mediaDevices: fakes.mediaDevices,
      question: "Why is Harbor blocked?"
    });

    expect(result.getSnapshot().status).toBe("error");
    expect(result.getSnapshot().message).toBe("Realtime SDP exchange failed.");
    expect(fakes.mediaStream.tracks.every((track) => track.stopped)).toBe(true);
  });

  it("closes local tracks, data channels, and peer connections", async () => {
    const fakes = createConnectedRealtimeFakes();
    const result = await startRealtimeBrowserSession({
      createPeerConnection: fakes.createPeerConnection,
      fetcher: fakes.fetcher,
      mediaDevices: fakes.mediaDevices,
      question: "Why is Harbor blocked?"
    });

    result.close();

    expect(result.getSnapshot().status).toBe("ended");
    expect(fakes.lastDataChannel.closed).toBe(true);
    expect(fakes.peerConnections[0]?.closed).toBe(true);
    expect(fakes.mediaStream.tracks.every((track) => track.stopped)).toBe(true);
  });
});

function createConnectedRealtimeFakes(): ReturnType<typeof createRealtimeFakes> {
  const fakes = createRealtimeFakes();
  fakes.enqueueJsonResponse({
    auditPolicy: {
      externalActions: "none",
      recordIds: ["OPENAI-REALTIME-POLICY"],
      retention: "Audit hashes only."
    },
    clientSecret: { value: "ek_test_client_secret" },
    deterministicBasis: "credential gate",
    model: "gpt-realtime-2",
    status: "issued",
    transport: "webrtc"
  });
  fakes.enqueueTextResponse("v=0\r\ns=answer");

  return fakes;
}

function createRealtimeFakes() {
  const queuedResponses: Response[] = [];
  const fetchCalls: Array<{ body?: BodyInit | null; headers?: HeadersInit; url: string }> = [];
  const mediaCalls: Array<{ audio: true }> = [];
  const peerConnections: FakePeerConnection[] = [];
  const events: string[] = [];
  const mediaStream = new FakeMediaStream();
  let lastDataChannel = new FakeDataChannel();
  let failCreateOffer = false;

  return {
    createPeerConnection: () => {
      events.push("peer:create");
      const peer = new FakePeerConnection();
      peer.failCreateOffer = failCreateOffer;
      peerConnections.push(peer);
      lastDataChannel = peer.dataChannel;
      return peer as unknown as RTCPeerConnection;
    },
    enqueueJsonResponse: (body: unknown) => {
      queuedResponses.push(
        new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status: 200 })
      );
    },
    enqueueTextResponse: (body: string, status = 200) => {
      queuedResponses.push(new Response(body, { headers: { "content-type": "application/sdp" }, status }));
    },
    events,
    get failCreateOffer() {
      return failCreateOffer;
    },
    set failCreateOffer(value: boolean) {
      failCreateOffer = value;
    },
    fetchCalls,
    fetcher: (url: RequestInfo | URL, init?: RequestInit) => {
      const stringUrl = stringifyRequestUrl(url);
      events.push(`fetch:${stringUrl}`);
      const fetchCall: { body?: BodyInit | null; headers?: HeadersInit; url: string } = { url: stringUrl };
      if (init?.body !== undefined) {
        fetchCall.body = init.body;
      }
      if (init?.headers !== undefined) {
        fetchCall.headers = init.headers;
      }
      fetchCalls.push(fetchCall);
      const response = queuedResponses.shift();
      if (response === undefined) {
        throw new Error("No fake response queued.");
      }

      return Promise.resolve(response);
    },
    get lastDataChannel() {
      return lastDataChannel;
    },
    mediaCalls,
    mediaDevices: {
      getUserMedia: (constraints: MediaStreamConstraints) => {
        events.push("media:getUserMedia");
        mediaCalls.push(constraints as { audio: true });
        return Promise.resolve(mediaStream as unknown as MediaStream);
      }
    },
    mediaStream,
    peerConnections
  };
}

class FakeDataChannel {
  closed = false;
  sentMessages: string[] = [];
  private listeners = new Map<string, Array<(event: { data?: string }) => void>>();

  addEventListener(type: string, listener: (event: { data?: string }) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  close(): void {
    this.closed = true;
  }

  dispatchMessage(data: string): void {
    for (const listener of this.listeners.get("message") ?? []) {
      listener({ data });
    }
  }

  send(message: string): void {
    this.sentMessages.push(message);
  }
}

class FakePeerConnection {
  closed = false;
  readonly dataChannel = new FakeDataChannel();
  failCreateOffer = false;
  ontrack: ((event: { streams: FakeMediaStream[] }) => void) | null = null;

  addTrack(): void {}

  close(): void {
    this.closed = true;
  }

  createDataChannel(): FakeDataChannel {
    return this.dataChannel;
  }

  createOffer(): Promise<RTCSessionDescriptionInit> {
    if (this.failCreateOffer) {
      return Promise.reject(new Error("createOffer failed"));
    }

    return Promise.resolve({ sdp: "v=0\r\ns=offer", type: "offer" });
  }

  setLocalDescription(): Promise<void> {
    return Promise.resolve();
  }

  setRemoteDescription(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeMediaStream {
  readonly tracks = [new FakeMediaTrack()];

  getTracks(): FakeMediaTrack[] {
    return this.tracks;
  }
}

class FakeMediaTrack {
  stopped = false;

  stop(): void {
    this.stopped = true;
  }
}

function stringifyRequestUrl(url: RequestInfo | URL): string {
  if (typeof url === "string") {
    return url;
  }

  if (url instanceof URL) {
    return url.href;
  }

  return url.url;
}

async function waitForMicrotasks(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
