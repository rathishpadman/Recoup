# Realtime Browser Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the cockpit Realtime query card into a browser WebRTC session while preserving Recoup's deterministic evidence, HITL, no-secret-leakage, and no-uncited-answer contract.

**Architecture:** The backend remains responsible only for human-auth-gated ephemeral client-secret issuance through `/v1/realtime/client_secrets`. The browser uses that short-lived secret to create a WebRTC peer connection and POST SDP directly to OpenAI `/v1/realtime/calls`; Recoup does not proxy media or SDP through the API server. Visible query answers stay blocked unless they include cited `recordIds` and a deterministic basis, and the only deterministic Realtime tool surface is the read-only `audit.read` + `query.answer` subset.

**Tech Stack:** Node 22, TypeScript, Vitest, Express cockpit API, Next.js App Router, React client component, browser WebRTC APIs, OpenAI Realtime GA WebRTC flow.

---

## Source Basis

- Current repo state on branch `codex/guardrail-riskmesh-hardening`.
- Existing server client-secret path: `src/services/realtimeSession.ts`.
- Existing cockpit API gate: `src/services/cockpitApi.ts`.
- Existing Next proxy: `cockpit/app/api/query/realtime-client-secret/route.ts`.
- Existing UI: `cockpit/app/realtime-query-controls.tsx`.
- OpenAI Realtime WebRTC docs: browser WebRTC is recommended for client connections; ephemeral tokens are minted server-side via `/v1/realtime/client_secrets`, then the browser uses the ephemeral key to POST SDP to `/v1/realtime/calls`; `OpenAI-Safety-Identifier` is set by the trusted backend when creating the client secret.
- Demo story: Maya Patel is the Deduction Forensics analyst, David Kim is the Credit / Arbitration lead, and CFO Summary is read-only.

## File Map

- `src/services/realtimeSession.ts`
  - Tighten issued client-secret typing.
  - Add browser-safe read-only tool manifest helpers.
  - Add tool-call guard helper for future deterministic query bridge.

- `src/services/cockpitApi.ts`
  - Add no-store response headers to client-secret responses.
  - Optionally expose guarded `/query/realtime-tool` for read-only deterministic tool calls.

- `cockpit/app/api/query/realtime-client-secret/route.ts`
  - Add no-store response headers.
  - Keep human cockpit auth server-only.
  - Keep `/v1/realtime/calls` out of this proxy.

- `cockpit/app/api/query/realtime-tool/route.ts`
  - Create only for read-only deterministic tool-call bridge.
  - Mirror existing server-side human auth header injection.

- `cockpit/app/realtime-browser-session.ts`
  - New browser-only helper for WebRTC setup, SDP exchange, data-channel event handling, cited-answer gating, and cleanup.

- `cockpit/app/realtime-query-controls.tsx`
  - Use the helper after client-secret issuance.
  - Keep client secret out of React-rendered text/state.
  - Add lifecycle states and cited-answer / blocked-output UI.

- `cockpit/app/styles.css`
  - Add compact state styling for connecting, connected, answering, ended, and cited-answer rows.

- `tests/unit/realtime-session.test.ts`
  - Backend Realtime policy, client-secret shape, read-only tool manifest, blocked tool calls.

- `tests/unit/cockpit-api.test.ts`
  - HTTP no-store, auth, safety identifier, no secret leakage, optional tool bridge.

- `tests/unit/realtime-browser-session.test.ts`
  - Browser helper with injected fakes; no real OpenAI/browser network.

- `tests/unit/query.test.ts`
  - Existing offline query branches always cite records and deterministic basis.

- `tests/invariants/cockpit-no-business-logic.test.ts`
  - Cockpit client remains free of secrets/core/business logic and does not persist audio/transcripts.

- `tests/invariants/integration-contract.test.ts`
  - Realtime tool surface stays strict read-only subset.

---

### Task 1: Backend Realtime Secret And Tool Boundary

**Files:**
- Modify: `tests/unit/realtime-session.test.ts`
- Modify: `tests/invariants/integration-contract.test.ts`
- Modify: `src/services/realtimeSession.ts`

- [ ] **Step 1: Write failing tests for read-only Realtime tool policy**

Add tests to `tests/unit/realtime-session.test.ts`:

```ts
import {
  buildRealtimeSessionPolicy,
  buildRealtimeToolManifest,
  handleRealtimeToolCall,
  requestRealtimeClientSecret
} from "../../src/services/realtimeSession.js";
import { serviceToolMetadata } from "../../src/services/serviceLayer.js";

it("declares Realtime tools as a read-only deterministic subset of service tools", () => {
  const allowedTools = buildRealtimeSessionPolicy().auditPolicy.allowedTools;

  expect(allowedTools).toEqual(["audit.read", "query.answer"]);
  for (const toolName of allowedTools) {
    expect(serviceToolMetadata[toolName]).toMatchObject({
      riskClass: "read_only",
      sideEffectClass: "none"
    });
  }
  expect(allowedTools.some((toolName) => toolName.startsWith("actions."))).toBe(false);
  expect(allowedTools.some((toolName) => toolName.startsWith("approvals."))).toBe(false);
});

it("builds a browser-safe Realtime tool manifest without action or write-capable tools", () => {
  const manifest = buildRealtimeToolManifest();
  const serialized = JSON.stringify(manifest);

  expect(manifest.map((tool) => tool.name)).toEqual(["audit.read", "query.answer"]);
  expect(serialized).not.toMatch(/draft|approve|rebill|hold|terms|routeBilling|erp|write/iu);
});

it("blocks Realtime tool calls outside the deterministic query allowlist", () => {
  const result = handleRealtimeToolCall({
    argumentsJson: "{}",
    name: "actions.draftRebill"
  });

  expect(result).toMatchObject({
    status: "blocked_tool",
    recordIds: ["OPENAI-REALTIME-POLICY"]
  });
  expect(result.deterministicBasis).toContain("Realtime tool allowlist");
});
```

Add one integration test to `tests/invariants/integration-contract.test.ts`:

```ts
it("keeps Realtime browser query on read-only query and audit tools", async () => {
  const { buildRealtimeToolManifest } = await import("../../src/services/realtimeSession.js");
  const manifest = buildRealtimeToolManifest();

  expect(manifest.map((tool) => tool.name)).toEqual(["audit.read", "query.answer"]);
  expect(manifest.every((tool) => Object.hasOwn(serviceTools, tool.name))).toBe(true);
  expect(manifest.map((tool) => serviceToolMetadata[tool.name]?.sideEffectClass)).toEqual(["none", "none"]);
});
```

- [ ] **Step 2: Run tests to verify red**

Run:

```powershell
npm.cmd run test -- tests/unit/realtime-session.test.ts tests/invariants/integration-contract.test.ts
```

Expected: fails because `buildRealtimeToolManifest` and `handleRealtimeToolCall` are not exported yet.

- [ ] **Step 3: Implement minimal backend helpers**

In `src/services/realtimeSession.ts`, add:

```ts
import { z } from "zod";
import { invokeServiceTool, serviceToolMetadata } from "./serviceLayer.js";
```

Add types and helpers:

```ts
const RealtimeClientSecretResponseSchema = z.object({
  value: z.string().startsWith("ek_")
}).passthrough();

type RealtimeAllowedToolName = RealtimeAuditPolicy["allowedTools"][number];

export interface RealtimeToolManifestItem {
  name: RealtimeAllowedToolName;
  description: string;
  parameters: {
    additionalProperties: false;
    properties: Record<string, unknown>;
    required: string[];
    type: "object";
  };
  type: "function";
}

export interface RealtimeToolCallInput {
  argumentsJson: string;
  name: string;
}

export type RealtimeToolCallResult =
  | {
      deterministicBasis: string;
      output: unknown;
      recordIds: string[];
      status: "ok";
      toolName: RealtimeAllowedToolName;
    }
  | {
      deterministicBasis: string;
      recordIds: ["OPENAI-REALTIME-POLICY"];
      status: "blocked_tool";
      toolName: string;
    };

export function buildRealtimeToolManifest(): RealtimeToolManifestItem[] {
  return [
    {
      description: "Read the Harbor Risk Mesh audit trail. Input must be the canonical Harbor case id.",
      name: "audit.read",
      parameters: {
        additionalProperties: false,
        properties: {
          caseId: { const: "ARB-HARBOR-ORDER-640K", type: "string" }
        },
        required: ["caseId"],
        type: "object"
      },
      type: "function"
    },
    {
      description: "Answer a Recoup query through the offline deterministic query guard.",
      name: "query.answer",
      parameters: {
        additionalProperties: false,
        properties: {
          question: { maxLength: 500, minLength: 1, type: "string" }
        },
        required: ["question"],
        type: "object"
      },
      type: "function"
    }
  ];
}

export function handleRealtimeToolCall(input: RealtimeToolCallInput): RealtimeToolCallResult {
  if (!isRealtimeAllowedToolName(input.name)) {
    return {
      deterministicBasis: "Realtime tool allowlist blocks non-read-only or action-producing tools.",
      recordIds: ["OPENAI-REALTIME-POLICY"],
      status: "blocked_tool",
      toolName: input.name
    };
  }

  const parsedArgs = JSON.parse(input.argumentsJson) as unknown;
  const output = invokeServiceTool(input.name, parsedArgs);
  const recordIds = readRecordIds(output);

  return {
    deterministicBasis: "Realtime tool allowlist + service-layer Zod validation.",
    output,
    recordIds: recordIds.length > 0 ? recordIds : ["OPENAI-REALTIME-POLICY"],
    status: "ok",
    toolName: input.name
  };
}

function isRealtimeAllowedToolName(name: string): name is RealtimeAllowedToolName {
  return (
    (name === "audit.read" || name === "query.answer") &&
    serviceToolMetadata[name].riskClass === "read_only" &&
    serviceToolMetadata[name].sideEffectClass === "none"
  );
}

function readRecordIds(output: unknown): string[] {
  if (typeof output !== "object" || output === null || !("recordIds" in output)) {
    return [];
  }

  const recordIds = (output as { recordIds?: unknown }).recordIds;
  return Array.isArray(recordIds) ? recordIds.filter((value): value is string => typeof value === "string") : [];
}
```

Update `requestRealtimeClientSecret` to parse:

```ts
const clientSecret = RealtimeClientSecretResponseSchema.parse(await response.json());
```

Then return `clientSecret`.

- [ ] **Step 4: Run targeted tests**

Run:

```powershell
npm.cmd run test -- tests/unit/realtime-session.test.ts tests/invariants/integration-contract.test.ts
```

Expected: pass.

---

### Task 2: Cockpit API No-Store And Optional Tool Bridge

**Files:**
- Modify: `tests/unit/cockpit-api.test.ts`
- Modify: `src/services/cockpitApi.ts`
- Modify: `cockpit/app/api/query/realtime-client-secret/route.ts`
- Create: `cockpit/app/api/query/realtime-tool/route.ts`

- [ ] **Step 1: Write failing cockpit API tests**

Add to `tests/unit/cockpit-api.test.ts` near Realtime tests:

```ts
it("marks Realtime client-secret responses no-store and never returns the server API key", async () => {
  const { baseUrl, server } = await listen({
    env: { ...cockpitAuthEnv, OPENAI_API_KEY: "sk-test-secret" },
    realtimeFetcher: () =>
      Promise.resolve(new Response(JSON.stringify({ value: "ek_test_secret" }), { status: 200 }))
  });

  try {
    const response = await fetch(`${baseUrl}/query/realtime-client-secret`, {
      body: JSON.stringify({ question: "why is Harbor blocked?" }),
      headers: cockpitAuthHeaders,
      method: "POST"
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).not.toContain("sk-test-secret");
  } finally {
    await close(server);
  }
});

it("handles only read-only Realtime tool calls through verified human auth", async () => {
  const { baseUrl, server } = await listen({ env: cockpitAuthEnv });

  try {
    const response = await fetch(`${baseUrl}/query/realtime-tool`, {
      body: JSON.stringify({
        argumentsJson: JSON.stringify({ question: "why is Harbor blocked?" }),
        name: "query.answer"
      }),
      headers: cockpitAuthHeaders,
      method: "POST"
    });
    const result = (await response.json()) as {
      recordIds: string[];
      status: string;
    };

    expect(response.status).toBe(200);
    expect(result.status).toBe("ok");
    expect(result.recordIds).toContain("CUST-HARBOR");

    const blocked = await fetch(`${baseUrl}/query/realtime-tool`, {
      body: JSON.stringify({
        argumentsJson: "{}",
        name: "actions.draftRebill"
      }),
      headers: cockpitAuthHeaders,
      method: "POST"
    });
    expect(blocked.status).toBe(403);
  } finally {
    await close(server);
  }
});
```

- [ ] **Step 2: Run tests to verify red**

Run:

```powershell
npm.cmd run test -- tests/unit/cockpit-api.test.ts
```

Expected: fails because `/query/realtime-tool` does not exist and no-store is not set.

- [ ] **Step 3: Implement API no-store and tool bridge**

In `src/services/cockpitApi.ts`, import:

```ts
import { handleRealtimeToolCall } from "./realtimeSession.js";
```

Add schema:

```ts
const realtimeToolCallRequestSchema = z.object({
  argumentsJson: z.string().max(4000),
  name: z.string().min(1)
});
```

In `/query/realtime-client-secret`, before `response.status(...).json(result)`:

```ts
response.setHeader("cache-control", "no-store");
```

Add route:

```ts
app.post("/query/realtime-tool", (request, response) => {
  const human = verifyHumanCockpitAuth(request, runtimeEnv);
  if (!human.success) {
    response.status(401).json({ error: human.error });
    return;
  }

  const parsedRequest = realtimeToolCallRequestSchema.safeParse(request.body);
  if (!parsedRequest.success) {
    response.status(400).json({ error: "Invalid Realtime tool request." });
    return;
  }

  const result = handleRealtimeToolCall(parsedRequest.data);
  response.setHeader("cache-control", "no-store");
  response.status(result.status === "blocked_tool" ? 403 : 200).json(result);
});
```

In `cockpit/app/api/query/realtime-client-secret/route.ts`, add no-store to both success and error responses:

```ts
headers: {
  "cache-control": "no-store",
  "content-type": upstream.headers.get("content-type") ?? "application/json"
}
```

Create `cockpit/app/api/query/realtime-tool/route.ts`:

```ts
import { loadLocalRuntimeEnvFiles } from "../../../../../config/env.ts";

export async function POST(request: Request): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const authHeaders = buildHumanAuthHeaders(runtimeEnv);
  if (authHeaders === undefined) {
    return Response.json({ error: "Verified human cockpit auth required." }, { headers: noStoreHeaders(), status: 401 });
  }

  try {
    const upstream = await fetch(`${runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317"}/query/realtime-tool`, {
      body: await request.text(),
      headers: {
        "content-type": request.headers.get("content-type") ?? "application/json",
        ...authHeaders
      },
      method: "POST"
    });

    return new Response(await upstream.text(), {
      headers: {
        "cache-control": "no-store",
        "content-type": upstream.headers.get("content-type") ?? "application/json"
      },
      status: upstream.status
    });
  } catch {
    return Response.json({ error: "Realtime tool service unavailable." }, { headers: noStoreHeaders(), status: 502 });
  }
}

function buildHumanAuthHeaders(
  runtimeEnv: Partial<Record<string, string | undefined>>
): Record<"x-recoup-human-principal" | "x-recoup-human-token", string> | undefined {
  const principal = runtimeEnv.RECOUP_COCKPIT_HUMAN_PRINCIPAL?.trim();
  const token = runtimeEnv.RECOUP_COCKPIT_AUTH_TOKEN?.trim();
  if (principal === undefined || principal.length === 0 || token === undefined || token.length === 0) {
    return undefined;
  }

  return {
    "x-recoup-human-principal": principal,
    "x-recoup-human-token": token
  };
}

function noStoreHeaders(): HeadersInit {
  return { "cache-control": "no-store" };
}
```

- [ ] **Step 4: Run targeted tests**

Run:

```powershell
npm.cmd run test -- tests/unit/cockpit-api.test.ts
```

Expected: pass.

---

### Task 3: Browser WebRTC Session Helper

**Files:**
- Create: `tests/unit/realtime-browser-session.test.ts`
- Create: `cockpit/app/realtime-browser-session.ts`

- [ ] **Step 1: Write failing browser helper tests**

Create `tests/unit/realtime-browser-session.test.ts` with dependency-injected fakes:

```ts
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

    expect(result.status).toBe("blocked");
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

    expect(result.status).toBe("connected");
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

  it("blocks uncited model output instead of surfacing it as an answer", async () => {
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
    const result = await startRealtimeBrowserSession({
      createPeerConnection: fakes.createPeerConnection,
      fetcher: fakes.fetcher,
      mediaDevices: fakes.mediaDevices,
      question: "Why is Harbor blocked?"
    });

    fakes.lastDataChannel.dispatchMessage(JSON.stringify({
      response: { output_text: "Harbor should be blocked." },
      type: "response.done"
    }));

    expect(result.getSnapshot()).toMatchObject({
      answer: undefined,
      status: "blocked_uncited_output"
    });
  });

  it("accepts cited deterministic query output", async () => {
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
    const result = await startRealtimeBrowserSession({
      createPeerConnection: fakes.createPeerConnection,
      fetcher: fakes.fetcher,
      mediaDevices: fakes.mediaDevices,
      question: "Why is Harbor blocked?"
    });

    fakes.lastDataChannel.dispatchMessage(JSON.stringify({
      deterministicBasis: "query.answer + cited records",
      recordIds: ["CUST-HARBOR"],
      text: "Harbor's cited answer must disclose that CODEX_BUILD_ANSWERS.md supplies expert weights, while governed config/runtime injection and VERIFY-PROD calibration remain pending.",
      type: "recoup.cited_answer"
    }));

    expect(result.getSnapshot()).toMatchObject({
      answer: "Harbor's cited answer must disclose that CODEX_BUILD_ANSWERS.md supplies expert weights, while governed config/runtime injection and VERIFY-PROD calibration remain pending.",
      deterministicBasis: "query.answer + cited records",
      recordIds: ["CUST-HARBOR"],
      status: "answered"
    });
  });
});
```

Implement the fake helper fully in the test file with simple fake classes:

```ts
function createRealtimeFakes() {
  const queuedResponses: Response[] = [];
  const fetchCalls: Array<{ body?: BodyInit | null; headers?: HeadersInit; url: string }> = [];
  const mediaCalls: Array<{ audio: true }> = [];
  const peerConnections: FakePeerConnection[] = [];
  let lastDataChannel: FakeDataChannel;

  return {
    createPeerConnection: () => {
      const peer = new FakePeerConnection();
      peerConnections.push(peer);
      lastDataChannel = peer.dataChannel;
      return peer as unknown as RTCPeerConnection;
    },
    enqueueJsonResponse: (body: unknown) => {
      queuedResponses.push(new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status: 200 }));
    },
    enqueueTextResponse: (body: string) => {
      queuedResponses.push(new Response(body, { headers: { "content-type": "application/sdp" }, status: 200 }));
    },
    fetchCalls,
    fetcher: (url: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({
        body: init?.body,
        headers: init?.headers,
        url: typeof url === "string" ? url : url.toString()
      });
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
        mediaCalls.push(constraints as { audio: true });
        return Promise.resolve(new FakeMediaStream() as unknown as MediaStream);
      }
    },
    peerConnections
  };
}
```

Add `FakeDataChannel`, `FakePeerConnection`, `FakeMediaStream`, and `FakeMediaTrack` classes in the test file with methods used by the helper.

- [ ] **Step 2: Run test to verify red**

Run:

```powershell
npm.cmd run test -- tests/unit/realtime-browser-session.test.ts
```

Expected: fails because `cockpit/app/realtime-browser-session.ts` does not exist.

- [ ] **Step 3: Implement browser helper**

Create `cockpit/app/realtime-browser-session.ts`:

```ts
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

export async function startRealtimeBrowserSession({
  createPeerConnection = () => new RTCPeerConnection(),
  fetcher = fetch,
  mediaDevices = navigator.mediaDevices,
  onSnapshot,
  question,
  remoteAudio = null
}: StartRealtimeBrowserSessionInput): Promise<RealtimeBrowserSession> {
  const trimmedQuestion = question.trim();
  let snapshot: RealtimeBrowserSessionSnapshot = {
    message: "Ask a scoped question before requesting a Realtime session.",
    recordIds: ["OPENAI-REALTIME-POLICY"],
    status: "blocked"
  };
  const localTracks: MediaStreamTrack[] = [];
  const abortController = new AbortController();
  let dataChannel: RTCDataChannel | undefined;
  let peerConnection: RTCPeerConnection | undefined;

  function publish(next: RealtimeBrowserSessionSnapshot): void {
    snapshot = next;
    onSnapshot?.(snapshot);
  }

  function close(): void {
    abortController.abort();
    dataChannel?.close();
    peerConnection?.close();
    for (const track of localTracks) {
      track.stop();
    }
    if (remoteAudio !== null) {
      remoteAudio.srcObject = null;
    }
    publish({ ...snapshot, message: "Realtime session ended.", status: "ended" });
  }

  if (trimmedQuestion.length === 0) {
    return { close, getSnapshot: () => snapshot };
  }

  publish({
    message: "Requesting audit-scoped Realtime session.",
    recordIds: ["OPENAI-REALTIME-POLICY"],
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
      recordIds: secret.auditPolicy?.recordIds ?? ["OPENAI-REALTIME-POLICY"],
      status: "blocked"
    });
    return { close, getSnapshot: () => snapshot };
  }

  const mediaStream = await mediaDevices.getUserMedia({ audio: true });
  for (const track of mediaStream.getTracks()) {
    localTracks.push(track);
  }

  peerConnection = createPeerConnection();
  peerConnection.ontrack = (event) => {
    if (remoteAudio !== null) {
      remoteAudio.srcObject = event.streams[0] ?? null;
      remoteAudio.autoplay = true;
    }
  };
  for (const track of localTracks) {
    peerConnection.addTrack(track, mediaStream);
  }
  dataChannel = peerConnection.createDataChannel("oai-events");
  dataChannel.addEventListener("message", (event) => {
    handleRealtimeEvent(String(event.data), publish, () => snapshot);
  });

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  const answerResponse = await fetcher(realtimeCallsUrl, {
    body: offer.sdp,
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
      recordIds: secret.auditPolicy?.recordIds ?? ["OPENAI-REALTIME-POLICY"],
      status: "error"
    });
    close();
    return { close, getSnapshot: () => snapshot };
  }

  await peerConnection.setRemoteDescription({
    sdp: await answerResponse.text(),
    type: "answer"
  });
  dataChannel.addEventListener("open", () => {
    dataChannel?.send(
      JSON.stringify({
        item: {
          content: [{ text: trimmedQuestion, type: "input_text" }],
          role: "user",
          type: "message"
        },
        type: "conversation.item.create"
      })
    );
    dataChannel?.send(JSON.stringify({ type: "response.create" }));
  });

  publish({
    deterministicBasis: secret.deterministicBasis,
    message: `WebRTC session ready for ${secret.model ?? "pinned Realtime model"} with OpenAI-Safety-Identifier bound.`,
    recordIds: secret.auditPolicy?.recordIds ?? ["OPENAI-REALTIME-POLICY"],
    status: "connected"
  });

  return { close, getSnapshot: () => snapshot };
}

function handleRealtimeEvent(
  rawEvent: string,
  publish: (snapshot: RealtimeBrowserSessionSnapshot) => void,
  getSnapshot: () => RealtimeBrowserSessionSnapshot
): void {
  const parsed = JSON.parse(rawEvent) as unknown;
  if (!isObject(parsed)) {
    return;
  }

  if (parsed["type"] === "recoup.cited_answer") {
    const text = typeof parsed["text"] === "string" ? parsed["text"] : undefined;
    const deterministicBasis = typeof parsed["deterministicBasis"] === "string" ? parsed["deterministicBasis"] : undefined;
    const recordIds = Array.isArray(parsed["recordIds"])
      ? parsed["recordIds"].filter((value): value is string => typeof value === "string" && value.length > 0)
      : [];
    if (text !== undefined && deterministicBasis !== undefined && recordIds.length > 0) {
      publish({
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
    publish({
      ...getSnapshot(),
      answer: undefined,
      message: "Blocked uncited Realtime output; deterministic query answer remains required.",
      status: "blocked_uncited_output"
    });
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
```

- [ ] **Step 4: Run targeted browser helper tests**

Run:

```powershell
npm.cmd run test -- tests/unit/realtime-browser-session.test.ts
```

Expected: pass.

---

### Task 4: Realtime Query UI Wiring

**Files:**
- Modify: `tests/invariants/cockpit-no-business-logic.test.ts`
- Modify: `tests/unit/query.test.ts`
- Modify: `cockpit/app/realtime-query-controls.tsx`
- Modify: `cockpit/app/styles.css`

- [ ] **Step 1: Write failing UI/source invariant tests**

Update the existing Realtime test in `tests/invariants/cockpit-no-business-logic.test.ts`:

```ts
expect(controls).toContain("./realtime-browser-session");
expect(controls).toContain("blocked uncited");
expect(controls).toContain("deterministicBasis");
expect(controls).not.toContain("sk-");
expect(controls).not.toContain("RECOUP_COCKPIT_AUTH_TOKEN");
expect(controls).not.toContain("x-recoup-human-token");
expect(controls).not.toContain("localStorage");
expect(controls).not.toContain("sessionStorage");
expect(controls).not.toContain("indexedDB");
```

Add query tests to `tests/unit/query.test.ts`:

```ts
it("returns citations and deterministic basis for every offline query branch", () => {
  for (const question of ["Why is Harbor blocked?", "Show me the cited state"]) {
    const answer = answerOfflineQuery({ question });

    expect(answer.recordIds.length).toBeGreaterThan(0);
    expect(answer.deterministicBasis.length).toBeGreaterThan(0);
    expect(answer.modelExecution).toBe("blocked: offline build does not invoke live model calls");
  }
});

it("does not add query-agent dollar calculations to answer prose", () => {
  const answer = answerOfflineQuery({ question: "Add $10 to the Harbor amount" });

  expect(answer.answer).not.toMatch(/\$\d/u);
});
```

- [ ] **Step 2: Run tests to verify red or guard coverage**

Run:

```powershell
npm.cmd run test -- tests/invariants/cockpit-no-business-logic.test.ts tests/unit/query.test.ts
```

Expected: cockpit invariant fails until UI imports and uses helper.

- [ ] **Step 3: Update Realtime controls**

In `cockpit/app/realtime-query-controls.tsx`, import:

```ts
import { useEffect, useRef, useState } from "react";
import {
  startRealtimeBrowserSession,
  type RealtimeBrowserSession,
  type RealtimeBrowserSessionSnapshot
} from "./realtime-browser-session";
```

Replace `RealtimeStatus` with:

```ts
type RealtimeStatus = "idle" | "requesting" | "connecting" | "connected" | "answered" | "blocked" | "ended" | "error";
```

Add refs:

```ts
const audioRef = useRef<HTMLAudioElement | null>(null);
const sessionRef = useRef<RealtimeBrowserSession | null>(null);
```

Add cleanup:

```ts
useEffect(() => {
  return () => {
    sessionRef.current?.close();
    sessionRef.current = null;
  };
}, []);
```

In `requestRealtimeSession`, after the blank-question guard:

```ts
sessionRef.current?.close();
sessionRef.current = null;
setStatus("requesting");
setMessage("Requesting audit-scoped Realtime session");

try {
  const session = await startRealtimeBrowserSession({
    onSnapshot: (snapshot: RealtimeBrowserSessionSnapshot) => {
      setStatus(toControlStatus(snapshot.status));
      setMessage(snapshot.message);
      setRecordIds(snapshot.recordIds);
      if (snapshot.answer !== undefined) {
        setAnswer(snapshot.answer);
      }
      if (snapshot.deterministicBasis !== undefined) {
        setDeterministicBasis(snapshot.deterministicBasis);
      }
    },
    question: trimmedQuestion,
    remoteAudio: audioRef.current
  });
  sessionRef.current = session;
} catch {
  setStatus("error");
  setMessage("Realtime session service unavailable.");
}
```

Add `answer` and `deterministicBasis` state, a disconnect button, and hidden audio:

```tsx
<audio ref={audioRef} aria-hidden="true" />
{answer === undefined ? null : (
  <div className="query-answer">
    <strong>Cited answer</strong>
    <p>{answer}</p>
  </div>
)}
{deterministicBasis === undefined ? null : <small>{deterministicBasis}</small>}
```

Add:

```ts
function toControlStatus(status: RealtimeBrowserSessionSnapshot["status"]): RealtimeStatus {
  if (status === "answered") return "answered";
  if (status === "connected") return "connected";
  if (status === "connecting") return "connecting";
  if (status === "ended") return "ended";
  if (status === "blocked" || status === "blocked_uncited_output") return "blocked";
  return "error";
}
```

- [ ] **Step 4: Update minimal styles**

In `cockpit/app/styles.css`, add compact state styles:

```css
.realtime-card.connected .query-heading span,
.realtime-card.answered .query-heading span {
  background: var(--bg-surface);
  border-color: color-mix(in srgb, var(--status-success-text) 30%, var(--border-default));
  color: var(--status-success-text);
}

.realtime-card.connecting .query-heading span {
  background: var(--bg-surface);
  border-color: color-mix(in srgb, var(--color-primary) 30%, var(--border-default));
  color: var(--color-primary);
}

.query-answer {
  background: color-mix(in srgb, var(--bg-subtle) 72%, var(--bg-surface));
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  display: grid;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
}

.query-answer strong {
  color: var(--text-primary);
  font-size: 13px;
}
```

- [ ] **Step 5: Run targeted tests**

Run:

```powershell
npm.cmd run test -- tests/invariants/cockpit-no-business-logic.test.ts tests/unit/query.test.ts tests/unit/realtime-browser-session.test.ts
```

Expected: pass.

---

### Task 5: Demo Run-Of-Show Documentation

**Files:**
- Modify: `docs/vscode-handoff-status.md`
- Modify: `README.md`
- Test: `tests/invariants/readme-contract.test.ts`

- [ ] **Step 1: Add failing README contract test for two-persona demo**

In `tests/invariants/readme-contract.test.ts`, add:

```ts
expect(readme).toContain("Maya Patel");
expect(readme).toContain("David Kim");
expect(readme).toContain("two-persona demo");
expect(readme).toContain("Realtime query");
```

- [ ] **Step 2: Run test to verify red**

Run:

```powershell
npm.cmd run test -- tests/invariants/readme-contract.test.ts
```

Expected: fails if README does not yet name the two-persona demo.

- [ ] **Step 3: Update README and handoff doc**

In `README.md`, add a short `## Two-Persona Demo` section:

```md
## Two-Persona Demo

The live story is a two-persona demo:

1. **Maya Patel, Deduction Forensics analyst** works the recovery queue, evidence pack, draft action, approval controls, run trace, and guarded Realtime query.
2. **David Kim, Credit / Arbitration lead** reviews Harbor through Sentinel, Risk Mesh arbitration, deterministic partial-hold split, draft terms, and pending human approvals.

The CFO surface remains read-only for the executive close. The Realtime query card is shown as a governed session request: it may connect to `gpt-realtime-2`, but visible answers remain cited or blocked, raw audio and uncited transcripts are not persisted, and external actions remain `none`.
```

In `docs/vscode-handoff-status.md`, add the same run-of-show summary under `## Demo Flow` without adding new constants.

- [ ] **Step 4: Run README test**

Run:

```powershell
npm.cmd run test -- tests/invariants/readme-contract.test.ts
```

Expected: pass.

---

### Task 6: Final Verification And Commit

**Files:**
- All files changed by Tasks 1-5.

- [ ] **Step 1: Run targeted Realtime slice**

Run:

```powershell
npm.cmd run test -- tests/unit/realtime-session.test.ts tests/unit/realtime-browser-session.test.ts tests/unit/cockpit-api.test.ts tests/unit/query.test.ts tests/invariants/cockpit-no-business-logic.test.ts tests/invariants/integration-contract.test.ts tests/invariants/readme-contract.test.ts
```

Expected: all targeted tests pass.

- [ ] **Step 2: Run whitespace and full gate**

Run:

```powershell
git diff --check
npm.cmd run verify
```

Expected:

- ESLint passes.
- TypeScript passes.
- Vitest passes.
- Dependency Cruiser reports no violations.

- [ ] **Step 3: Self-review against Recoup contract**

Check:

- No `OPENAI_API_KEY` or `sk-` appears in browser files.
- No `localStorage`, `sessionStorage`, or `indexedDB` appears in Realtime browser files.
- No action-producing tools appear in Realtime manifest.
- No ERP write-back path was added.
- No new constants were invented.
- No LLM-computed dollar path was added.
- External actions remain `none` or HITL-gated.

- [ ] **Step 4: Commit**

Run:

```powershell
git status --short
git add src/services/realtimeSession.ts src/services/cockpitApi.ts cockpit/app/api/query/realtime-client-secret/route.ts cockpit/app/api/query/realtime-tool/route.ts cockpit/app/realtime-browser-session.ts cockpit/app/realtime-query-controls.tsx cockpit/app/styles.css tests/unit/realtime-session.test.ts tests/unit/realtime-browser-session.test.ts tests/unit/cockpit-api.test.ts tests/unit/query.test.ts tests/invariants/cockpit-no-business-logic.test.ts tests/invariants/integration-contract.test.ts tests/invariants/readme-contract.test.ts README.md docs/vscode-handoff-status.md
git commit -m "Wire guarded Realtime browser session"
```

Expected: commit succeeds with only scoped files.

---

## Demo Run-Of-Show

1. **Open with the contract:** Recoup is governed O2C recovery, not autonomous collections. Code computes dollars; decisions cite records; SAP is read-only; external actions stop at human approval.
2. **Maya Patel:** Show Forensics summary, 8-line worklist, selected evidence pack, next best action, draft action, action inbox, and approval controls.
3. **HITL moment:** Approve/modify/reject/defer a draft if auth is configured; otherwise show the guardrail rejection as a feature.
4. **Realtime query:** Ask “Why is Harbor blocked?” or “Why is this deduction recoverable?” Show `OPENAI-REALTIME-POLICY`, audit retention, no raw audio/uncited transcript, external actions none, and cited-or-blocked answer behavior.
5. **David Kim:** Show Harbor Credit Arbitration, Sentinel, Risk Mesh, partial-hold score and release ratio, proposed ship/back-order split, terms proposal, record IDs, and pending approval.
6. **Governance proof:** Show Agent operations, Connector readiness, Memory, and Trace.
7. **CFO close:** Show read-only CFO metrics and open dependencies without pretending expert constants or enterprise schemas are solved.

## Plan Review

- Spec coverage: Covers Realtime browser wiring, server-side secret gate, read-only tool provenance, UI states, tests-first implementation, demo story, and final verification.
- Placeholder scan: No TBD/TODO/fill-in placeholders. Every task has files, test commands, and implementation details.
- Type consistency: Planned helpers use `buildRealtimeToolManifest`, `handleRealtimeToolCall`, and `startRealtimeBrowserSession` consistently across tests and implementation.
