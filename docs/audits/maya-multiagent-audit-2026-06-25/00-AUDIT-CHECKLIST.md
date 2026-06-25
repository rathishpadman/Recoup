# Recoup / Maya Multi-Agent Full-Stack Audit — Master Checklist

**Date:** 2026-06-25
**Auditor:** Independent review (Claude Opus 4.8)
**Subject:** Maya Deduction Forensics multi-agent solution on the `@openai/agents` (TypeScript) stack
**Reference design:** `docs/maya-shadcn-independent-audit-technical-design.md`
**Branch:** `codex/guardrail-riskmesh-hardening` (working tree dirty — see Phase 0)
**Mode:** Static code/architecture audit + visual (look-and-feel) review of the shadcn cockpit.

---

## How to read this audit

This audit is delivered as a **folder of phase-wise markdown files**. Each phase file contains:

1. **Scope** — what was inspected (files, `file:line`).
2. **Findings table** — each checklist item scored:
   - ✅ **Pass** — implemented to best-practice standard.
   - ⚠️ **Partial** — present but with a gap or risk.
   - ❌ **Gap** — missing or incorrect.
   - ⏭️ **N/A** — intentionally out of scope (with rationale), not counted as a gap.
3. **Proposed actions** — concrete remediation for every ⚠️/❌, each with an **expert citation** (OpenAI docs, SDK docs, or recognised practitioner sources) explaining *how* to fix it.
4. **Severity** — `[C]` critical / judge-visible · `[H]` high · `[M]` medium.

A final `SUMMARY.md` aggregates scores, top strengths, top risks, and a prioritised remediation backlog.

---

## Stack ground truth (confirmed from repo)

| Layer | Technology | Evidence |
|---|---|---|
| Agent runtime | `@openai/agents@^0.1.0` (TS, not Python) | `package.json` |
| Pinned models | reasoning `gpt-5.5`, fast `gpt-5.4`(+mini/nano), realtime `gpt-realtime-2` | `config/models.ts` |
| Backend | Express 5 (`cockpitApi.ts`, port 4317) | `package.json`, design doc |
| Frontend | Next 16 + React 19 + shadcn 4 + Tailwind 4 + Radix | `package.json` |
| Validation | Zod 3.25 | `package.json` |
| Persistence | in-memory / SQLite / Supabase | `src/memory/*` |
| Tool protocol | MCP SDK 1.29 (Streamable HTTP) | `src/mcp/server.ts` |
| AI SDK | `ai@^5` (Vercel AI SDK) | `package.json` |
| Agents present | forensics, recoveryDrafter, riskMesh, sentinel, containment, query (+ handoffGraph, agentRuntime, liveForensicsStream) | `src/agents/*` |

**Checklist-vocabulary mapping:** the source checklist uses Python-SDK terms. They are mapped to the actual TS SDK primitives:
`@input_guardrail` → `defineInputGuardrail`/`InputGuardrail`; Pydantic → Zod tool schemas; `Runner.run_streamed()` → `run(..., { stream: true })` / `StreamedRunResult`; `context_variables` → `RunContext`; `output_type` → `outputType`; Celery → Node async/SSE offload.

---

## Phase map (10 dimensions)

| Phase | File | Focus | Source checklist § |
|---|---|---|---|
| 0 | `phase-00-scope-inventory.md` | Working-tree state, agent/tool inventory, what's real vs. claimed | — |
| 1 | `phase-01-core-agentic-architecture.md` | Handoffs, loop control, specialization, context isolation, orchestration | §1 |
| 2 | `phase-02-tooling-schemas-security.md` | Zod tool schemas, guardrails, sandboxing, MCP boundary, secrets, auth | §2 |
| 3 | `phase-03-openai-sdk-cost.md` | Responses/Agents API, structured outputs, reasoning effort, compaction, tokens | §3 |
| 4 | `phase-04-backend-state.md` | Streaming transport, session persistence, async offload, rate limiting, fail-closed | §4 |
| 5 | `phase-05-frontend-ux-architecture.md` | Live states, handoff cues, abort, no-business-truth, optimistic, a11y | §5 |
| 6 | `phase-06-browser-look-and-feel.md` | **Premium look & feel vs. modern apps** (visual-only browser review) | §6 (reframed) |
| 7 | `phase-07-observability-tracing-evals.md` | SDK tracing, eval harness in CI, gold cases, cost/latency visibility | added |
| 8 | `phase-08-reliability-failure-handling.md` | Deterministic fallback, retries, raw-text suppression, error propagation | added |
| 9 | `phase-09-governance-trust.md` | Code-computes-money, HITL gating, honest provenance, SAP honesty | added (domain moat) |
| 10 | `phase-10-hackathon-winning-factors.md` | Problem relevance, product-feel, demo narrative, differentiation, wow | added |

---

## The full checklist (all items the audit will score)

### Phase 1 — Core Agentic & Architecture
- [ ] **[C]** Explicit handoff primitives (SDK `handoff()`/`Agent`, not prompt swapping)
- [ ] **[C]** Loop mitigation (`maxTurns` / turn caps; `MaxTurnsExceededError` handled)
- [ ] **[H]** Hyper-specialized single-responsibility agents & prompts
- [ ] **[H]** Context isolation across handoff (clean payload, not full history)
- [ ] **[H]** Intentional orchestration pattern (supervisor/sequential/parallel justified)
- [ ] **[M]** Deterministic state transitions (routing/verdict code-computed)
- [ ] **[M]** Agent roster matches documented design

### Phase 2 — Tooling, Schemas & Security
- [ ] **[C]** Strict Zod tool schemas with descriptions
- [ ] **[C]** Input & output guardrails (injection/extraction/safety)
- [ ] **[C]** No-mutation sandboxing; zero ERP write path; SAP read-only
- [ ] **[H]** MCP exposes only read/draft tools; internal tools hidden
- [ ] **[H]** Secrets hygiene (no secrets in code/logs/tests; PII rejection)
- [ ] **[H]** Auth fail-closed on protected routes
- [ ] **[M]** Bounded concurrency on parallel tool calls
- [ ] **[M]** Guardrail trips emit trace/audit events

### Phase 3 — OpenAI SDK Usage & Cost
- [ ] **[C]** Modern Responses/Agents runner (no legacy hand-rolling)
- [ ] **[H]** Native structured outputs (`outputType`)
- [ ] **[H]** Reasoning-effort tuning per task; models pinned
- [ ] **[H]** Context compaction active
- [ ] **[M]** Token accounting captured/archived
- [ ] **[M]** Prompt/vector caching where applicable

### Phase 4 — Backend Engineering & State
- [ ] **[C]** Streaming transport (SSE/WebSocket) to UI
- [ ] **[H]** Session persistence keyed by session/thread id
- [ ] **[H]** Fail-closed data mode (no fake data)
- [ ] **[M]** Async offload / timeout protection
- [ ] **[M]** Rate limiting on agent endpoints
- [ ] **[M]** Graceful error propagation (no cascade)

### Phase 5 — Frontend & UX Architecture
- [ ] **[C]** Live execution states (not dead spinner)
- [ ] **[C]** Handoff visual cues
- [ ] **[H]** Active stream cancellation (`AbortController`)
- [ ] **[H]** Frontend owns no business truth (provenanced read models only)
- [ ] **[M]** Optimistic message delivery
- [ ] **[M]** Citation parity in UI
- [ ] **[M]** Accessibility (keyboard, focus, ARIA)

### Phase 6 — Browser Look & Feel (PREMIUM / MODERN-APP BAR)
- [ ] **[C]** Visual hierarchy & spacing rhythm comparable to Linear/Vercel/Stripe-tier apps
- [ ] **[C]** Typography scale, weight, and legibility are premium
- [ ] **[C]** Color/contrast system coherent (light/dark), no muddy or default-Bootstrap feel
- [ ] **[H]** Component polish: cards, tables, dialogs, chips, tabs feel modern (radius, shadow, border tokens)
- [ ] **[H]** Density & information design (worklist/case workspace readable, not cramped)
- [ ] **[H]** Motion/feedback (hover, focus, transitions, skeletons) feels alive but restrained
- [ ] **[H]** Responsive integrity at 375/768/1024/1440 (no overflow/clipping)
- [ ] **[M]** Empty/loading/error states are designed, not raw
- [ ] **[M]** Iconography consistent (single icon family, correct sizing)
- [ ] **[M]** Brand identity present and consistent (logo, accent, voice)

### Phase 7 — Observability, Tracing & Evals
- [ ] **[C]** SDK tracing across agent/tool/handoff spans (no raw model text leak)
- [ ] **[H]** Eval harness scores trajectories in CI (`verify:release`)
- [ ] **[H]** Gold cases (valid/invalid/partial) exist or gap owned
- [ ] **[M]** Cost/latency/token visibility per step

### Phase 8 — Reliability & Failure Handling
- [ ] **[H]** Deterministic fallback when live agent run fails
- [ ] **[M]** Idempotency / retry safety
- [ ] **[M]** Raw model text never used as business truth

### Phase 9 — Governance & Trust (domain moat)
- [ ] **[C]** "Code computes every dollar" (I-1)
- [ ] **[C]** Human-in-the-loop gating on all external actions (I-7/I-20/I-23)
- [ ] **[H]** Honest provenance; unknown fails closed (I-30)
- [ ] **[H]** SAP honesty (failed probe never shown green; S7/S8 fail-closed)

### Phase 10 — Hackathon "Winning Entry" Factors
- [ ] **[C]** Real, expensive problem clearly framed
- [ ] **[C]** "Feels like a product, not a hackathon project"
- [ ] **[H]** Coherent 12-beat demo narrative
- [ ] **[H]** Defensible differentiation (governed deterministic money + cited evidence)
- [ ] **[M]** Clarity over polish; working flow
- [ ] **[M]** One memorable <2-min wow moment

---

## Out-of-scope (scored ⏭️ N/A, not gaps)

- Legacy route `cockpit/app/forensics/page.tsx`
- ERP write-back / autonomous external execution (governance prohibits — I-26)
- Fixture-only acceptance as proof of real backend
- Live load/perf testing under production traffic

---

## Method & limitations

- **Static-first:** findings come from reading code and tracing wiring. Where a claim can only be confirmed by running the app/tests, it is marked **"needs live run"**.
- **Look-and-feel:** Phase 6 reviews the shadcn cockpit visually (existing `output/playwright/**` screenshots and, if approved, a live browser pass). It judges *premium feel*, not functional wiring.
- **No source changes:** only audit `.md` files are written. No application code is modified.

---

## Reference sources (cited throughout)

- OpenAI Agents SDK (JS/TS): https://openai.github.io/openai-agents-js/
- OpenAI — A practical guide to building agents: https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/
- OpenAI — Guardrails & human review: https://developers.openai.com/api/docs/guides/agents/guardrails-approvals
- Multi-agent architecture in production — TrueFoundry: https://www.truefoundry.com/blog/multi-agent-architecture
- Agent guardrails best practices — Arthur AI: https://www.arthur.ai/blog/best-practices-for-building-agents-guardrails
- AI agents 2026 (memory/evals/guardrails) — Furmanets: https://andriifurmanets.com/blogs/ai-agents-2026-practical-architecture-tools-memory-evals-guardrails
- Hackathon judging — Devpost: https://info.devpost.com/blog/hackathon-judging-tips
- Hackathon judging criteria — TAIKAI: https://taikai.network/en/blog/hackathon-judging
