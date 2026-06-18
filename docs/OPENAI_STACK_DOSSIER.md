# Recoup v2 — OpenAI Stack Dossier (Phase B)

**Status:** Authoritative stack reference for the SDD (Phase D) and System Design (Phase E). Verified against OpenAI sources as of **June 2026**. Pairs with `RECONCILIATION_LEDGER.md`.
**Purpose:** answer the rubric's *Use of OpenAI Capabilities* axis with a defensible, current mapping — "use all possible OpenAI stack" without force-fitting deprecated or unavailable pieces.
**Inputs folded in (V5):** `Architectural_Blueprint…` (Node/TS monolith, harness, security), `Best-Practice_Patterns…` (guardrails/defense-in-depth — fully mined in Phase F).

---

## 1. Resolved `[VERIFY]` items

| ID | Question | Verified finding (June 2026) | Decision |
|---|---|---|---|
| **V1** | TS availability of Agents SDK subagents / code-mode / long-horizon harness | The April 15 2026 "next evolution" (sandbox, harness, subagents-beta, code-mode) **launched Python-first; TypeScript support is planned, not shipped.** TS *does* have Agents, **SandboxAgent**, handoffs, agents-as-tools, guardrails, built-in HITL, Sessions, Tracing, Realtime. | Design on **TS-stable primitives** (handoffs + agents-as-tools + HITL). Subagents = roadmap. `[VERIFY-TS]` exact status at build start. |
| **V2** | Do ChatKit / the Evals API survive the AgentKit winddown? | **ChatKit survives** — Agent Builder deprecated 2026-06-03 (shutdown Nov 30 2026), ChatKit remains, usable with your own server-side agent. **The Evals *platform* is being deprecated** (with a documented OpenAI-Evals→Promptfoo migration path). Reusable prompt objects also deprecated. | **ChatKit allowed** for the cockpit chat surface (optional). **Eval gates = code-based harness** (ours; Promptfoo optional). Keep prompts in `src/prompts/`, not stored prompt objects. |

**Three further current facts that change the design:**
- **Realtime API is GA**; the Realtime *Beta* was removed 2026-05-12 — use the GA interface with **`gpt-realtime-2`**.
- **Assistants API is sunsetting (2026-08-26)** → use the **Responses API + Conversations API** for state. Do not build on Assistants.
- A **Secure MCP Tunnel** exists for connecting OpenAI products to **private / on-prem MCP servers** without public exposure — directly relevant to a real SAP retrieval path.

---

## 2. Capability → OpenAI component map (the core artifact)

Legend: **TS** = TS-stable today · `det` = deterministic code (no model) · HITL = human approval gate.

| Recoup capability | Agent(s) & primitive | Model (pinned) | Deterministic core (code) | OpenAI features used |
|---|---|---|---|---|
| **B. Deduction Forensics & Recovery** (hero · Maya) | Investigator agent; Recovery-Drafter agent; **agents-as-tools** for parallel per-line fan-out | `gpt-5.5` (classify, reasoning=medium/high); `gpt-5.4` (draft correspondence) | POD/timestamp match, duplicate detection, promo-accrual check, $ quantification — all `det` | Responses API · structured outputs (Zod) · **fileSearchTool** (evidence dossier) · function tools (SAP retrieve, Billing-route *draft-only*) · guardrails · tracing |
| **A. Closed-Loop Risk Mesh** (David) | Supervisory/orchestrator agent gathering credit/fulfilment/billing/collections **positions via agents-as-tools**; **handoff** to approver | `gpt-5.5` (arbitration narrative, reasoning=high) | **P&L-weighted arbitration score computed in code**; agent explains, never computes | Agents-as-tools · handoffs · structured outputs · immutable negotiation log → audit |
| **C. Dynamic Credit Sentinel** (David) | Sentinel agent: synthesizes risk narrative + proposes term structure | `gpt-5.4` (narrative + proposal); `gpt-5.4-mini` (signal extraction) | **R-score + R-drift** from payment behavior; trigger thresholds — all `det` | Function tools (bureau/news/EDI ingest) · structured outputs (term proposal) · HITL approval |
| **D. Behavioral Containment** (Maya→David) | Intent-classifier agent; partial-hold proposer | `gpt-5.4` (intent over history); `gpt-5.4-nano` (cheap pattern features) | **Gaming-candidate gate**; **6-criteria partial-hold composite + score→ratio function** (Appendix G) — all `det` | Structured outputs · guardrails (no-wrongful-containment check) · HITL |
| **Conversational query / cockpit chat** (all personas) | Query agent answering with cited evidence | `gpt-realtime-2` (voice, GA Realtime) + `gpt-5.4` (text) | retrieval joins on the same data the dashboards show | **Realtime API (GA)** · fileSearchTool · Conversations API · optional **ChatKit** embed |
| **HITL approval inbox** (cross-cutting) | Tool-call approval gating, routed analyst→lead→finance | n/a (control plane) | authority routing, SoD checks — `det` | Agents SDK **built-in human-in-the-loop** / tool `needsApproval` · Conversations API |
| **Audit & explainability** (cross-cutting) | output hooks on every finding & decision | n/a | immutable, hash-chained trail; explainability tripwire — `det` | **AgentHooks** (`on_start`/`on_end`) · tracing |
| **Retrieval layer** (cross-cutting) | evidence + signal access | embeddings model `[VERIFY]` (`text-embedding-3-large` baseline) | source adapters, reconciliation — `det` | **fileSearchTool** + vector store · **MCP** (SAP OData) · **Secure MCP Tunnel** (private SAP at scale) · Responses API **Connectors** |

> Load-bearing rule preserved: **every dollar and every decision threshold is computed in `det` code; models classify, retrieve, narrate, and draft — they never compute the number that drives an external action.** This is also the strongest *Technical Excellence* and *Auditability* story.

---

## 3. Model selection & routing (pinned identifiers)

| Identifier | Role in Recoup | Why | Notes |
|---|---|---|---|
| `gpt-5.5` | Hero reasoning: forensic classification, Risk-Mesh arbitration narrative | Flagship; `reasoning.effort` none→`xhigh`; ~1.05M ctx | Reserve `high` for arbitration/ambiguous; reasoning tokens billed as output |
| `gpt-5.4` | Recovery drafting, Sentinel narrative, intent classification, text chat | Frontier quality at ~½ flagship cost | Default workhorse |
| `gpt-5.4-mini` | Signal/feature extraction, routing sub-tasks | Strong price/performance | |
| `gpt-5.4-nano` | High-volume cheap pattern features, pre-filters | Budget tier | |
| `gpt-realtime-2` | Conversational-query **voice** | GA Realtime default | WebRTC (browser) / WebSocket (server) |
| Codex build model `[VERIFY-V7]` | **Build only** (Codex CLI / Codex cloud) | Coding-agent specialist selected by current Codex availability | Never in product runtime; verify the current Codex model/default at setup time |
| embeddings `[VERIFY]` | Vector store for evidence dossiers | retrieval | confirm current embedding model at build |

**Routing principle:** 70–90% of calls to mini/nano/`5.4`; escalate to `5.5` only for hero decisions. Prompt-cache the static system/policy blocks (≈90% input saving). Cap `max_output`; dial `reasoning.effort` down on simple tasks. **No fine-tuning / RFT** (GPT-5.x family not fine-tunable; platform winding down).

---

## 4. Agents SDK primitives — what we build on vs. defer

**Use now (TypeScript-stable):** Agents · Handoffs · Agents-as-tools · Tools (function / hosted / **MCP**) · **Human-in-the-loop** (tool approval) · **Sessions** + Conversations API · **Tracing** · **AgentHooks** (`on_start`/`on_end`) · **fileSearchTool** · context **compaction** for long runs · **SandboxAgent** (only where a tool needs a real workspace). **Guardrails:** use agent-level input/output guardrails at workflow edges and tool guardrails around every custom function-tool call that produces a decision or action, especially across manager/handoff workflows.

> Guardrail implementation note: agent-level input guardrails run at the initial workflow boundary and agent-level output guardrails run on the final output. Recoup release-critical checks must therefore sit on decision-producing service/function tools as well as final outputs, especially across handoffs and agents-as-tools.

**Defer / roadmap (`[VERIFY-TS]`):** subagents primitive, code-mode, long-horizon harness — Python-first; revisit at build start. Our handoff + agents-as-tools design covers the same fan-out/delegation needs without them.

---

## 5. Day-1 hackathon build vs. Scalability narrative (deferred)

The Blueprint advocates a fuller production stack; per the locked scope these are the **scalability story**, not Day-1 code — consistent with "modular monolith now, extract at hexagonal ports when load justifies it."

| Concern | Day-1 (build) | Scalability narrative (deferred) |
|---|---|---|
| Runtime | Node 22 + TS **modular monolith** behind ALB; `src/{agents,tools,memory,workflows,mcp,prompts,middleware,types}` + `tests/` | Extract async agent/worker tier at ports |
| Rate-limit resilience | SDK retry + backoff; bounded concurrency | **BullMQ + Redis** (token-bucket, exp. backoff) |
| Long-running + durable HITL | In-process HITL + Conversations API | **Temporal.io** (durable execution, signals/queries) |
| Interop | In-process handoffs/agents-as-tools | **A2A protocol** (Agent Card, JSON-RPC 2.0/SSE) |
| Secrets | Per-env `.env`, no client-side keys, no flat key | **KMS / Vault**, IP allowlist, cost hard-caps, **Secure MCP Tunnel** to on-prem SAP |
| Connectors | MCP adapter per source (SAP OData, doc repo, TPM, bureau) | **Connector Registry** (admin-governed) |
| Chat UI | Vercel AI SDK + SSE streaming (or ChatKit embed) | ChatKit at org scale; Langfuse observability |

---

## 6. Explicit "do NOT use" list (deprecated / unavailable — June 2026)

- **Agent Builder** (visual) — deprecated; shuts down Nov 30 2026. *(Symphony, separately, is fine as a build-time Codex orchestrator only.)*
- **Hosted Evals platform** — deprecated → use code-based harness (Promptfoo optional).
- **Assistants API** — sunsetting → Responses + Conversations API.
- **Realtime API Beta** — removed → GA Realtime + `gpt-realtime-2`.
- **Fine-tuning / RFT on GPT-5.x** — unavailable; platform winding down.
- **Reusable prompt objects** — deprecated → prompts live in `src/prompts/`.
- **`dangerouslyAllowBrowser`**, flat single API key — security anti-patterns (Blueprint §Security).

---

## 7. How this maps to the six rubric axes

| Axis | Where the stack earns it |
|---|---|
| Innovation | Agent-to-agent **arbitration** (Risk Mesh) + deterministic value-optimizing partial hold — beyond chatbot/automation |
| Impact & Measurement | Code-based eval gates on the S1–S8 gold set; recovered-$ / DSO / prevented-leakage KPIs |
| Real-World Relevance | NorthBay CPG reality, SAP retrieval path, 2 deep personas, real deduction taxonomy |
| **Use of OpenAI Capabilities** | Responses API, Agents SDK (handoffs/agents-as-tools/guardrails/HITL/tracing/fileSearch), GPT-5.5/5.4 routing, Realtime voice, MCP + Secure Tunnel, Codex (build) |
| Technical Excellence | Deterministic core + LLM judgement separation; tool/service guardrails at decision/action boundaries; immutable audit; typed (Zod) contracts |
| Scalability | Modular-monolith→ports; BullMQ/Temporal/A2A/Connector-Registry path; config-not-rebuild multi-entity |

---

## 8. `[VERIFY]` carried forward

| ID | Item | Resolve in |
|---|---|---|
| V1 (TS) | Subagents / code-mode TS availability at build start | Phase D / build |
| V3 | Concrete SAP S/4HANA sandbox (open dependency) | before SDD §9 lock |
| V6 | Current embeddings model identifier | SDD §retrieval |
| V7 | Confirm the current Codex CLI / Codex cloud build model and default model behavior at setup time | Phase G |

---

*End of Phase B. Next: Phase C — INVARIANTS.md rewrite (machine-verifiable contract), then Phase D — SDD.*
