# ADR-001 — MCP as the Governed Data Plane for All Agent Source Access

- **Status:** Proposed (recommended for the hackathon build)
- **Date:** 2026-06-25
- **Deciders:** Recoup team
- **Context owner:** Maya Deduction Forensics multi-agent solution
- **Related:** `docs/audits/maya-multiagent-audit-2026-06-25/phase-02-tooling-schemas-security.md`, `SUMMARY.md`, `src/mcp/server.ts`, `src/services/serviceLayer.ts`

---

## 1. Context

Recoup runs six agents (Forensics Investigator, Recovery Drafter, Risk-Mesh Supervisor, Sentinel, Containment/Intent, Conversational Query) on the `@openai/agents` (TypeScript) stack. Today:

- Agents and the deterministic services reach Supabase and SAP **in-process** by calling `invokeServiceTool(name, input, context)` directly (e.g. `src/agents/forensics.ts:435-465`).
- A **real, spec-compliant MCP server already exists** (`src/mcp/server.ts`): Streamable HTTP transport, bearer auth, and tool-visibility filtering (`visibility: "mcp"` vs `"internal"`).
- That MCP server is started separately (`npm run dev:mcp`) and is **not on the demo runtime path** — it is an external-facing facade today.

This created a credibility gap for the demo: MCP is implemented and tested, but a judge who probes will find the live flow does not use it.

We want a narrative that is **true, demonstrable, and consistent with our governance invariants** (I-1 code computes every dollar; I-26 no ERP write; I-30 unknown data fails closed): *every agent reaches Supabase and SAP only through the MCP gateway, never with direct credentials.*

### Forces
- **Credibility:** the claim must be literally true and visible in the trace, not aspirational.
- **Governance:** the deterministic decision/dollar core must NOT become model- or MCP-reachable.
- **Latency & risk:** the demo must not regress; on-stage failure risk must stay low.
- **Effort:** hackathon timeline — prefer connecting what exists over rewriting it.

---

## 2. Decision

Adopt a **three-plane architecture** with MCP as the **data plane** for all source access.

| Plane | Responsibility | Reaches Supabase/SAP? | On MCP? |
|---|---|---|---|
| **Reasoning plane** | The 6 agents — investigate, draft, advise, converse | No — they only call tools | call tools via MCP |
| **Data plane (MCP gateway)** | `src/mcp/server.ts` wrapping Supabase + SAP OData read-only adapters; injects credentials, filters tools, enforces read-only/draft, logs every call | ✅ Yes — the only component that does | ✅ Is the MCP server |
| **Control plane (deterministic core)** | `decisions.deductionVerdict`, `core.evaluateRule`, dollar math, approvals persistence | Reads cited inputs only | ❌ Deliberately NOT exposed via MCP |

**Concretely:** the agent overlay (`liveForensicsStream` / `forensicsQuerySession`) calls the MCP-visible retrieval tools (`retrieval.sap`, `retrieval.docs`, `retrieval.tpm`, `retrieval.bureau`, `query.answer`, `audit.read`, `sources.r1Read`) through an in-process `MCPServerStreamableHttp` client attached to the agents. Agents hold **no** Supabase/SAP credentials; the gateway injects them.

The deterministic decision/dollar core stays in-process and remains structurally absent from the MCP tool list.

### Scope chosen: Option 1 (demo-credible)
Route the **agent overlay's** source reads through MCP now. Keep the deterministic core in-process. (See §5; Option 2 — routing the service layer's own reads through MCP — is deferred to future work.)

---

## 3. Why this is best practice (2026)

This is the documented **MCP gateway / data-plane** pattern, not a bespoke design:

- *"An MCP gateway looks like just another MCP server exposing tools… behind the scenes it injects required secrets, enforces permissions, and returns results without revealing sensitive data to the model."* — [Composio — MCP Gateways guide](https://composio.dev/content/mcp-gateways-guide)
- *"An MCP gateway centralizes credential management… when an agent makes a request, the gateway injects the appropriate credentials before forwarding it, eliminating the need for agents to handle sensitive data directly."* — [CData — 7 MCP architecture patterns](https://medium.com/cdata-software/7-key-mcp-architecture-patterns-for-enterprise-data-integration-8f6a3fcd7cf4)
- *"Create a separate dedicated service account per agent and grant only the necessary roles (viewer, not admin)."* — [Google Cloud — securing agent MCP interactions](https://docs.cloud.google.com/sql/docs/postgres/secure-agent-interactions-mcp)
- *"Use `MCPServerStreamableHttp` when you want to control the transport yourself and keep the server in your own infrastructure while keeping latency low… Streamable HTTP is the recommended transport."* — [OpenAI Agents SDK — MCP](https://openai.github.io/openai-agents-python/mcp/)
- *"Starting with a lightweight gateway is a best practice — it prevents significant refactoring later."* — [Composio](https://composio.dev/content/mcp-gateways-guide)

We already started the gateway; this decision connects the client side.

---

## 4. Alternatives considered

| Option | Summary | Why rejected / deferred |
|---|---|---|
| **A. Keep MCP external-only** | Leave the current state; MCP is a side door for outside agents | Not credible in the demo; judge probing finds in-process path |
| **B. External agent connects to our MCP** | Demo a stock Claude/Cursor agent calling our tools | Real but "doesn't fit the demo narrative" (per team); side-show, not core flow |
| **C. Use the official Supabase MCP server** | Point agents at the public Supabase MCP | **Rejected hard** — it exposes raw SQL/writes; detonates I-1/I-26/I-30. We must use our own governed facade |
| **D. Option 2 — route the deterministic service layer's reads through MCP too** | Even the in-process core reads sources via MCP | Architecturally purest, but a real refactor of `ServiceInvocationContext` + an extra hop; higher on-stage risk. **Deferred to future work** |
| **E. (Chosen) Option 1 — agent overlay reads via MCP gateway** | Agents call MCP retrieval tools; deterministic core stays in-process | True, demonstrable in trace + server logs, preserves all invariants, low risk |

---

## 5. Implementation sketch (Option 1)

1. **Gateway:** run `src/mcp/server.ts` in-process (or as a localhost sidecar) so the agents can reach it over Streamable HTTP with no network egress. Ensure governed Supabase config is loaded (it already fail-closes with 503 otherwise).
2. **Attach MCP to agents:** in `src/agents/agentRuntime.ts`, give the retrieval-using agents an `MCPServerStreamableHttp` pointing at `http://127.0.0.1:<MCP_PORT>/mcp` with the bearer token. The SDK auto-lists the filtered tools.
3. **Route overlay reads:** in `liveForensicsStream.ts` / `forensicsQuerySession.ts`, ensure the agent's evidence retrieval calls resolve to the MCP tools (`retrieval.*`, `query.answer`, `audit.read`) rather than direct `invokeServiceTool`.
4. **Credential isolation:** confirm the agents receive **no** `SUPABASE_*` / `SAP_*` env; only the MCP server process does. This makes "agents are credential-less" literally true.
5. **Make it visible:** surface MCP tool-call rows in the existing Agent Trace panel and (for the live demo) tail the MCP server request log on screen.
6. **Keep the control plane off MCP:** verify `decisions.deductionVerdict`, `core.evaluateRule`, `core.riskMeshClosedLoop`, `approvals.decide` remain `visibility: "internal"` (already enforced; locked by `tests/invariants/mcp-visibility.test.ts`).

**Effort:** ~0.5–1 day. **Risk:** low (deterministic core untouched). **Latency:** negligible (in-process localhost).

---

## 6. Consequences

### Positive
- **Credential-less agents:** no agent holds a Supabase/SAP secret; the gateway injects them — textbook least-privilege.
- **Single governed chokepoint:** one place enforces read-only, SAP-no-write, tool filtering, and full call logging/observability.
- **Demonstrable:** MCP calls appear in the agent trace and server logs — the claim is provable on stage.
- **Invariants preserved:** deterministic money/decision core stays in-process and off MCP (I-1, I-26).
- **Differentiated pitch:** "our agents are credential-less; MCP is the only thing that touches SAP and Supabase" — a slide few teams can show.

### Negative / costs
- One extra in-process serialization hop per source read (negligible locally).
- The MCP server must be running for the live flow → one more process to manage; mitigate with an in-process start and a healthcheck before demo.
- `tools/call` requires governed Supabase config (already true in real-backend mode) — rehearse to avoid a 503 on stage.

### Honest-claims guardrail (say these, not more)
- ✅ "Every **source/evidence read** (Supabase + SAP) flows through our MCP gateway; agents hold no DB/SAP credentials."
- ✅ "SAP access is **read-only OData** through the gateway — no ERP write path."
- ✅ "The deterministic **money/decision core is intentionally not exposed** via MCP."
- ❌ Do **not** say "all six agents do everything via MCP" or "the demo runs entirely on MCP" — the decision core is in-process by design.

---

## 7. References

- OpenAI Agents SDK — MCP: https://openai.github.io/openai-agents-python/mcp/
- OpenAI — MCP and Connectors: https://platform.openai.com/docs/guides/tools-connectors-mcp
- Composio — MCP Gateways: A Developer's Guide to AI Agent Architecture (2026): https://composio.dev/content/mcp-gateways-guide
- CData — 7 Key MCP Architecture Patterns for Enterprise Data Integration: https://medium.com/cdata-software/7-key-mcp-architecture-patterns-for-enterprise-data-integration-8f6a3fcd7cf4
- Google Cloud — Best practices for securing agent interactions with MCP: https://docs.cloud.google.com/sql/docs/postgres/secure-agent-interactions-mcp
- Traefik — What is an MCP Gateway: https://traefik.io/glossary/mcp-gateway-explained
- Recoup — `src/mcp/server.ts`, `src/services/serviceLayer.ts`, `tests/invariants/mcp-visibility.test.ts`
