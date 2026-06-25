# SPEC-001 — Route Agent Source Access Through the MCP Gateway (ADR-001, Option 1)

- **Status:** Ready to implement
- **Date:** 2026-06-25
- **Implements:** `ADR-001-mcp-data-plane.md` (Option 1 — agent overlay reads via MCP)
- **SDK confirmed:** `@openai/agents@0.1.11` exports `MCPServerStreamableHttp` and `Agent` accepts `mcpServers: [...]`. `hostedMcpTool` also available (not used here).
- **Effort:** ~0.5–1 day · **Risk:** low (deterministic decision/dollar core untouched) · **No source changed yet — this is a plan.**

---

## 0. Goal & acceptance criteria

**Goal:** Make it literally true and demonstrable that *the agents reach Supabase + SAP only through the MCP gateway*, while the deterministic decision/dollar core stays in-process and off MCP.

**Acceptance criteria (Definition of Done):**
1. The Forensics Investigator (and Recovery Drafter) agents have an `MCPServerStreamableHttp` attached via `mcpServers`.
2. During a Maya query/run, the agent makes **real MCP tool calls** to `retrieval.*` / `query.answer` / `audit.read`, visible as `tool_called`/`tool_output` events in the agent trace.
3. The agents receive **no** `SUPABASE_*` / `SAP_*` credentials; only the MCP server process does.
4. The deterministic answer, citations, and `decisions.deductionVerdict`/`core.*` remain in-process and **absent** from the MCP tool list (existing invariant still passes).
5. `npm run verify` green; new tests assert (1)+(2)+(4).
6. Demo: MCP server request log shows the agent's calls live.

**Honest claim unlocked:** "Agents are credential-less; every SAP/Supabase read is an MCP call; the money/decision core is deliberately not exposed."

---

## 1. Current state (what we're changing)

| File | Today | Change |
|---|---|---|
| `src/agents/agentRuntime.ts` | Agents have `handoffs`/`tools` but **no `mcpServers`**; retrieval is not an agent tool | Attach an `MCPServerStreamableHttp` to forensics/recovery agents |
| `src/agents/liveForensicsStream.ts` | Runs `forensicsInvestigatorAgent` streamed; suppresses text; captures hook receipts. Does **not** drive tool calls | Connect MCP server before run; update input so the model calls retrieval tools; close after |
| `src/services/forensicsQuerySession.ts` | Deterministic answer + live overlay; expects `agent_handoff` receipt | Also assert ≥1 retrieval `tool_*` receipt (so "via MCP" is provable) |
| `src/services/cockpitApi.ts` | Does not start the MCP server | Start `createMcpStreamableHttpApp` in-process (or require `dev:mcp`) so agents can reach `/mcp` on localhost |
| `src/agents/forensics.ts` | Deterministic retrieval via `invokeServiceTool` | **Unchanged** (control plane stays in-process) |
| `tests/invariants/mcp-visibility.test.ts` | Locks visibility boundary | Keep; add agent-attachment + tool-call trace tests |

> Key design point: the **deterministic retrieval in `forensics.ts` stays** (it computes citations). The **agent overlay additionally calls MCP retrieval tools** so the trace proves source access flows through the gateway. This keeps governance intact while making the narrative true. (If you later want the deterministic reads themselves to go through MCP, that's ADR-001 Option 2 / future work.)

---

## 2. Implementation steps

### Step 1 — MCP client factory (new file `src/agents/mcpGateway.ts`)

```ts
import { MCPServerStreamableHttp } from "@openai/agents";
import type { RuntimeEnv } from "../../config/env.js";

export interface RecoupMcpGatewayConfig {
  url: string;            // e.g. http://127.0.0.1:4318/mcp
  authToken: string;      // RECOUP_MCP_AUTH_TOKEN
  principal?: string;     // RECOUP_MCP_CLIENT_PRINCIPAL
  capabilities?: string;  // RECOUP_MCP_CLIENT_CAPABILITIES (e.g. "draft_action")
}

export function readMcpGatewayConfig(env: RuntimeEnv): RecoupMcpGatewayConfig | undefined {
  const authToken = env.RECOUP_MCP_AUTH_TOKEN?.trim();
  if (authToken === undefined || authToken.length === 0) return undefined;
  const port = env.MCP_PORT?.trim() && Number.isInteger(Number(env.MCP_PORT)) ? Number(env.MCP_PORT) : 4318;
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    authToken,
    ...(env.RECOUP_MCP_CLIENT_PRINCIPAL?.trim() ? { principal: env.RECOUP_MCP_CLIENT_PRINCIPAL.trim() } : {}),
    ...(env.RECOUP_MCP_CLIENT_CAPABILITIES?.trim() ? { capabilities: env.RECOUP_MCP_CLIENT_CAPABILITIES.trim() } : {})
  };
}

export function createRecoupMcpServer(config: RecoupMcpGatewayConfig): MCPServerStreamableHttp {
  return new MCPServerStreamableHttp({
    url: config.url,
    name: "recoup-governed-gateway",
    // SDK forwards these as request headers to the Streamable HTTP transport:
    requestInit: {
      headers: {
        authorization: `Bearer ${config.authToken}`,
        ...(config.principal ? { "x-recoup-mcp-principal": config.principal } : {})
      }
    }
    // Optional: cacheToolsList: true to avoid re-listing on every run
  });
}
```

> Verify the exact option names against `MCPServerStreamableHttpOptions` in `node_modules/@openai/agents-core/dist/*.d.ts` (the type is exported). The headers go through the transport's `requestInit`/`fetch` options; adjust if the installed minor names it differently.

### Step 2 — Attach the gateway to the agents (`src/agents/agentRuntime.ts`)

Make the agent factory accept an optional MCP server and attach it. Because `agentRuntime.ts` currently constructs agents at module load, refactor to a factory so the gateway (env-dependent) can be injected:

```ts
export function createForensicsInvestigatorAgent(mcpServers: MCPServerStreamableHttp[] = []): Agent {
  return new Agent({
    name: "Forensics Investigator",
    model: runtimeModels.reasoning,
    instructions: loadAgentPrompt(promptFiles.forensicsInvestigator),
    handoffs: [recoveryDrafterAgent],
    ...(mcpServers.length > 0 ? { mcpServers } : {})
  });
}
```

Keep the existing module-level `forensicsInvestigatorAgent` (no MCP) for offline/unit tests; use the factory on the live path.

### Step 3 — Connect/close around the live run (`src/agents/liveForensicsStream.ts`)

In `runOpenAIForensicsAgentStream` (or its caller), before running:

```ts
const gatewayConfig = readMcpGatewayConfig(env);
const mcpServers: MCPServerStreamableHttp[] = [];
if (gatewayConfig) {
  const server = createRecoupMcpServer(gatewayConfig);
  await server.connect();           // lists the filtered tools
  mcpServers.push(server);
}
const agent = createForensicsInvestigatorAgent(mcpServers);
try {
  return await runner.run(agent, input, { maxTurns, stream: true, signal });
} finally {
  await Promise.all(mcpServers.map((s) => s.close()));   // always clean up
}
```

The existing `mapRunStreamEvent` already maps `tool_called`/`tool_output` run-item events into `service-tool` status events — so MCP tool calls will surface in the trace **with no extra mapping work**.

### Step 4 — Make the model actually call retrieval tools (`buildLiveForensicsQueryInput` in `forensicsQuerySession.ts`)

Add an explicit instruction so the agent invokes the gateway (otherwise the model may answer without a tool call):

```
"Before handing off, call the retrieval tools (retrieval.sap / retrieval.docs / query.answer)
 over the Recoup MCP gateway to confirm the cited record IDs. Do not compute dollars, verdicts,
 routings, approvals, or external actions — those come only from deterministic Recoup code."
```

Raw text stays suppressed; the answer stays deterministic. Only the **trace** gains real MCP tool-call receipts.

### Step 5 — Prove "via MCP" in the guard (`runForensicsQuerySessionWithLiveAgents`)

Add a check alongside the existing `hasRecoveryHandoff`:

```ts
const hasMcpRetrieval = liveRun.hookReceipts.some(
  (r) => (r.hook === "agent_tool_start" || r.hook === "agent_tool_end") &&
         (r.toolName?.startsWith("retrieval.") || r.toolName === "query.answer" || r.toolName === "audit.read")
);
if (!hasMcpRetrieval) {
  return blockedLiveAgentQueryResponse("blocked_live_agent_trace",
    "Live trace did not include an MCP gateway retrieval call.");
}
```

This makes the demo claim self-enforcing: no MCP retrieval ⇒ no live answer badge.

### Step 6 — Start the gateway in-process (`src/services/cockpitApi.ts` bootstrap)

For demo reliability, start the Streamable HTTP MCP app inside the API process (so there's one fewer terminal and no race):

```ts
import { createMcpStreamableHttpApp } from "../mcp/server.js";
// in the bootstrap block:
const mcpApp = createMcpStreamableHttpApp({ env: runtimeEnv });
const mcpServer = mcpApp.listen(readMcpPort(runtimeEnv.MCP_PORT), "127.0.0.1");
process.once("SIGTERM", () => mcpServer.close());
```

Alternatively keep `npm run dev:mcp` as a separate process and document it as a prerequisite. In-process is safer on stage.

### Step 7 — Credential isolation (the part that makes the claim true)

- The **MCP server** process loads `SUPABASE_*` / `SAP_*` (it already does via `loadOptionalMcpServiceContext`).
- The **agent run** must NOT pass those into the agent/model context. Confirm `liveForensicsStream` builds its input from record IDs + question only (it already does) and that no source credentials are placed in `instructions` or `input`. Add a guard/test asserting the live input contains no `SUPABASE_`/`SAP_` substrings.

---

## 3. Test plan

| Test | Asserts |
|---|---|
| `tests/invariants/mcp-visibility.test.ts` (existing) | decision/compute/approval tools still `visibility:"internal"` and absent from `listTools()` |
| **NEW** `tests/unit/agent-mcp-gateway.test.ts` | `createForensicsInvestigatorAgent([server])` sets `mcpServers`; `readMcpGatewayConfig` builds the localhost URL + bearer header; returns `undefined` when token missing |
| **NEW** `tests/unit/forensics-query-mcp-trace.test.ts` | With a stub MCP runner emitting `tool_called(retrieval.sap)` + the Forensics→Recovery handoff, `runForensicsQuerySessionWithLiveAgents` returns `mode:"live_openai_agents"`; with no retrieval tool call it returns `blocked_live_agent_trace` |
| **NEW** credential-isolation test | live agent input string contains no `SUPABASE_`/`SAP_` token |
| `npm run verify` | lint + typecheck + full suite + depcruise + release readiness green |

---

## 4. Risks & rollback

| Risk | Mitigation |
|---|---|
| MCP server not running ⇒ agent run fails | In-process start (Step 6) + healthcheck before demo; if gateway config absent, fall back to current behavior (no `mcpServers`) so nothing regresses |
| SDK option name for headers differs in 0.1.11 | Confirm against `MCPServerStreamableHttpOptions` d.ts before coding; the type is exported |
| Model doesn't call the tool | Explicit instruction (Step 4) + the Step 5 guard fails closed, so you never *claim* MCP without proof |
| Added latency | In-process localhost transport; enable `cacheToolsList` to skip re-listing |
| Governance regression | Decision/dollar core untouched; depcruise + mcp-visibility test keep the boundary |

**Rollback:** the change is gated on `readMcpGatewayConfig(env) !== undefined`. Unset `RECOUP_MCP_AUTH_TOKEN` (or a feature flag) and the agents run exactly as today.

---

## 5. Demo runbook delta (what changes on stage)

1. Start API (gateway now in-process) + cockpit.
2. Open a tiny terminal tailing MCP gateway request logs.
3. Run a Maya query → the **Agent Trace** shows `tool_called retrieval.sap` / `query.answer` rows, and the gateway log shows the matching inbound calls.
4. Talk track: *"The agent just pulled SAP and Supabase evidence — but it did it through our MCP gateway. The agent has no database credentials; the gateway injects them, keeps SAP read-only, and refuses to expose our decision engine."*

---

## 6. Out of scope (future work)

- ADR-001 **Option 2**: routing the deterministic service-layer source reads themselves through MCP.
- Per-agent dedicated MCP principals/capabilities (one service identity per agent) — nice hardening, not needed for the demo.
- Resuming MCP sessions across stateless workers via `session_id` (the transport exposes it).
