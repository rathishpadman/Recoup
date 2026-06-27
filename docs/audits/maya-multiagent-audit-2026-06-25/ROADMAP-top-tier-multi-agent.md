# Roadmap — Top-Tier Multi-Agent Capabilities for Recoup

- **Status:** Proposed roadmap (consolidates the superiority gap analysis + ADR-001/002)
- **Date:** 2026-06-26
- **Companions:** `ADR-001-mcp-data-plane.md`, `SPEC-001-mcp-data-plane-option1.md`, `ADR-002-rag-vector-data-source.md`, `SPEC-002-rag-vector-evidence.md`

## Framing — what "top-tier" means for *this* solution

Recoup's moat is **governed determinism**: code computes every dollar (I-1), humans gate every external action (I-7/I-20/I-23), every decision cites record IDs + deterministic basis (I-17), unknown data fails closed (I-30). Therefore "top-tier" here is **not more autonomy** — it is deeper **verification, throughput, observability, and provable quality**. Every feature below makes the agents *more accountable*, never more free to decide money.

> Pitch line: *"We didn't make the agents more autonomous — we made them more accountable: they retrieve evidence agentically, challenge each other, pause for human approval inside the loop, run in parallel, and we measure all of it with evals — while code still computes every dollar."*

## Anti-patterns to explicitly avoid (would make us worse, not superior)
- Open-ended planner / autonomous goal pursuit that mutates state.
- Model emitting the final dollar/verdict/limit/hold.
- Free agent-to-agent negotiation that bypasses the deterministic core or HITL gates.

---

## The capability set (10 features)

Legend — Priority: **P0** demo-defining · **P1** strong · **P2** depth. Each row: current state → what to add → integration touchpoints (real files) → governance fit → effort.

### P0 — build these for the "superior" claim

#### 1. Reviewer / Devil's-Advocate verifier agent
- **Now:** chain is `Forensics Investigator → Recovery Drafter` (`agentRuntime.ts:handoffs`). No independent re-check of evidence-vs-verdict.
- **Add:** a read-only Reviewer agent that, before HITL, asserts every cited record actually supports the verdict/routing and flags "citation does not support claim." Chain becomes `Investigator → Reviewer → Recovery`.
- **Touchpoints:** `src/agents/agentRuntime.ts` (new agent + handoff), `src/prompts/reviewer.md` (new), `src/agents/forensics.ts` / `forensicsQuerySession.ts` (emit a `review` trace receipt; reuse `assertFinalAgentOutput` for the deterministic check), `cockpit/components/maya/agent-trace-panel.tsx` (render the review node).
- **Governance fit:** advisory + read-only; produces a *challenge*, not a decision. Strongest trust amplifier.
- **Effort:** ~0.5–1 day.

#### 2. SDK-native human-in-the-loop interrupts (approve-in-the-loop)
- **Now:** approvals are out-of-band POSTs (`cockpitApi.ts /approval`); the agent run does not suspend/resume.
- **Add:** use the Agents SDK tool-approval interruption — agent hits a draft/recovery action, run **suspends**, human approves in cockpit, run **resumes**. Makes HITL a first-class part of the agent loop.
- **Touchpoints:** `src/agents/agentRuntime.ts` (mark action tools `needsApproval`), `src/agents/liveForensicsStream.ts` / `src/services/forensicsQuerySession.ts` (handle `interruptions`, persist run state to `src/memory/*`, resume), `cockpit/components/maya/approval-gate-dialog.tsx` (drive resume), `src/services/cockpitApi.ts` (resume endpoint).
- **Governance fit:** perfect — strengthens the existing human-gate invariants by making them part of the loop.
- **Effort:** ~1–1.5 days.

#### 3. Parallel investigation (fan-out / fan-in)
- **Now:** deduction lines processed sequentially (`forensics.ts` per-line loop).
- **Add:** bounded-concurrency fan-out of per-line investigators + a deterministic reducer that assembles the run. Visible "swarm" in the trace.
- **Touchpoints:** `src/agents/forensics.ts` (concurrency pool over `deductionLines`; reuse `mergeEvidenceDocuments`), `src/services/conductor.ts` (run-budget per parallel branch), `agent-trace-panel.tsx` (concurrent lanes). Bound the pool (ties to Phase 2.7).
- **Governance fit:** reducer stays deterministic; no change to who computes dollars.
- **Effort:** ~1 day.

#### 4. Trajectory evals + gold-case suite (LLM-as-judge in CI)
- **Now:** `verify:release` exists but thin on tool-choice/trajectory scoring (Phase 7).
- **Add:** 10–15 labeled valid/invalid/partial gold deductions; score each run on: correct verdict, correct routing, citations within scope, **no model-computed money**, required handoff present, reviewer-pass. Run in `verify`.
- **Touchpoints:** `evals/` (new gold dataset + scorer), `package.json` (`verify` includes it), `tests/invariants/*` (assert scorer wired).
- **Governance fit:** measures the governance itself; pure upside.
- **Effort:** ~1 day.

### P1 — strong differentiators

#### 5. Agentic RAG (ADR-002 Option 2)
- **Now:** classic RAG specced (SPEC-002); retrieval is a pre-fetched pipeline step.
- **Add:** agent-driven, multi-hop retrieval over `retrieval.docs` (via MCP), verifier-gated sufficiency, bounded by `maxTurns`. See `ADR-002 §7`.
- **Touchpoints:** ADR-001/SPEC-001 (MCP-attached retrieval) + item #1 (verifier) + `forensicsQuerySession.ts` (let `tool_called` events drive evidence).
- **Governance fit:** every hit still passes the deterministic grounding gate; dollars stay deterministic.
- **Effort:** ~1–2 days (on top of classic RAG + MCP).

#### 6. Real trace export (OpenAI Traces / OpenTelemetry)
- **Now:** live Runner sets `tracingDisabled: true` (`liveForensicsStream.ts:266`); only custom hook receipts exist.
- **Add:** enable SDK trace export (sensitive-data-off) for replayable, inspectable runs; optionally OTel.
- **Touchpoints:** `src/agents/liveForensicsStream.ts` (Runner `tracingDisabled:false` + exporter, keep `traceIncludeSensitiveData:false`), config/env for the exporter.
- **Governance fit:** raw model text already suppressed; export metadata only.
- **Effort:** ~0.5 day.

#### 7. Confidence-aware escalation / adaptive model routing
- **Now:** `decisionConfidenceThreshold` exists but doesn't drive escalation; models pinned per tier (`config/models.ts`).
- **Add:** when confidence < threshold, escalate (deeper model and/or mandatory human review); add `reasoning.effort` tuning (Phase 3.3).
- **Touchpoints:** `src/agents/forensics.ts` (escalation branch on confidence), `agentRuntime.ts` / `config/models.ts` (effort + tier), trace receipt for escalation.
- **Governance fit:** escalation only raises scrutiny; never lowers it.
- **Effort:** ~1 day.

#### 8. SDK-native input/output guardrails on live agents
- **Now:** custom guard fns in the deterministic layer, not attached to live agents (Phase 2.9).
- **Add:** `defineOutputGuardrail` / input guardrail on the live agents delegating to existing `assertFinalAgentOutput`, so guardrail trips are SDK-traced and run in parallel.
- **Touchpoints:** `src/agents/agentRuntime.ts` (attach guardrails), `src/guardrails/output/final.ts` (reuse), trace receipts on trip.
- **Governance fit:** makes existing protection visible and idiomatic.
- **Effort:** ~0.5 day.

### P2 — depth (post-demo)

#### 9. Semantic long-term memory (precedent recall / memory-RAG)
- **Now:** memory store + deterministic compaction only (`src/memory/*`).
- **Add:** semantic recall over prior resolved cases ("how did we resolve similar deductions/limit breaches?"), advisory only. Composes with ADR-002 (vector over the memory corpus).
- **Touchpoints:** `src/memory/*` (embed + recall), a `retrieval.precedent` read-only tool, cockpit advisory panel.
- **Governance fit:** advisory; never auto-applies a precedent.
- **Effort:** ~1.5 days.

#### 10. Multi-agent debate for contested verdicts
- **Now:** Risk-Mesh has arbitration, but not for the core deduction verdict.
- **Add:** for low-confidence/ambiguous deductions, a second independent investigator + deterministic arbitration of their cited findings (pairs with #1 and #7).
- **Touchpoints:** `src/agents/agentRuntime.ts` (second investigator), `src/core/arbitration.ts` (reuse), trace receipts.
- **Governance fit:** arbitration is deterministic over cited evidence; model debate informs, code decides.
- **Effort:** ~1.5–2 days.

---

## Priority matrix

| Feature | Priority | Governance fit | Effort | Demo wow |
|---|---|---|---|---|
| 1 Reviewer/verifier agent | P0 | ★★★ | 0.5–1d | High |
| 2 SDK HITL interrupts | P0 | ★★★ | 1–1.5d | High |
| 3 Parallel investigation | P0 | ★★ | 1d | High |
| 4 Trajectory evals + gold cases | P0 | ★★★ | 1d | Med (judge-facing) |
| 5 Agentic RAG | P1 | ★★ | 1–2d | High |
| 6 Trace export | P1 | ★★★ | 0.5d | Med |
| 7 Confidence escalation | P1 | ★★★ | 1d | Med |
| 8 SDK guardrails on agents | P1 | ★★ | 0.5d | Low-Med |
| 9 Semantic memory | P2 | ★★ | 1.5d | Med |
| 10 Multi-agent debate | P2 | ★★ | 1.5–2d | Med-High |

## Recommended phasing

- **Phase A (foundation, already specced):** MCP data plane (ADR-001/SPEC-001) + classic RAG (ADR-002/SPEC-002).
- **Phase B (P0 superiority, ~3–4 days):** #1 Reviewer → #2 HITL interrupts → #3 Parallel → #4 Evals. This is the set that earns the "top-tier" label.
- **Phase C (P1 upgrades, ~2–3 days):** #5 Agentic RAG → #6 Trace export → #7 Escalation → #8 SDK guardrails.
- **Phase D (P2 depth):** #9 Semantic memory → #10 Debate.

## Cross-cutting acceptance criteria (apply to every feature)
1. No model-computed money/verdict/limit/hold reaches a finding (I-1).
2. Every external action remains human-gated (I-7/I-20/I-23).
3. Every agent step yields a trace receipt with record IDs + deterministic basis (I-17).
4. Unknown/insufficient data fails closed (I-30).
5. `npm run verify` green; new behavior covered by tests + a gold-case eval.

## What to claim once Phase B ships
- "Parallel multi-agent investigation with an independent reviewer that challenges every citation."
- "Human approval is in-the-loop: the agent suspends and resumes around a human decision."
- "Agent quality is measured continuously against labeled gold cases."
- "Evidence is retrieved agentically over an MCP gateway and re-grounded to record IDs — code still computes every dollar."
