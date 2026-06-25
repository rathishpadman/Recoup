# Recoup / Maya Multi-Agent Full-Stack Audit — Executive Summary

**Date:** 2026-06-25 · **Auditor:** Independent (Claude Opus 4.8) · **Mode:** static code/architecture + visual review
**Branch:** `codex/guardrail-riskmesh-hardening` (working tree dirty) · **Stack:** `@openai/agents` (TS), Express 5, Next 16, shadcn, Zod, Supabase, MCP

Read alongside the phase files (`phase-00` … `phase-10`) and the checklist (`00-AUDIT-CHECKLIST.md`).

---

## Headline verdict

**This is a top-tier, genuinely production-leaning multi-agent build — well above typical hackathon quality.** The agentic core is SDK-native (real handoffs, agents-as-tools, `maxTurns`), the security/governance posture is enforced in code (not slides), the backend is hardened (SSE + abort, fail-closed, tamper-evident audit chain), and there is a real CI eval gate. **The remaining work is mostly presentation and a few production-hardening items — not correctness.**

The biggest risks to *winning* are **storytelling and reproducibility**, not engineering: the governance moat is under-sold, the agent-trace visual reads as a data dump, and load-bearing files are uncommitted.

## Scorecard (by dimension)

| Phase | Dimension | Pass | Partial | Gap | Headline |
|---|---|---|---|---|---|
| 1 | Core Agentic & Architecture | 6 | 1 | 0 | Real SDK handoffs + fail-closed `maxTurns`; minor doc/runtime handoff mismatch |
| 2 | Tooling, Schemas & Security | 6 | 3 | 0 | Exceptional Zod discipline + layered guardrails; concurrency/observability polish |
| 3 | OpenAI SDK & Cost | 2 | 4 | 0 | Model-tier routing works; add `reasoning.effort` + persist token receipts |
| 4 | Backend & State | 4 | 2 | 0 | Strongest layer: SSE+abort, hash-chained audit, fail-closed; add rate limiter |
| 5 | Frontend & UX Architecture | 7 | 0 | 0 | Race-safe streaming, AbortController, a11y, governance-defending UI |
| 6 | Browser Look & Feel | 8 | 2 | 0 | Premium design system; **agent-trace map too dense** |
| 7 | Observability, Tracing & Evals | 1 | 3 | 0 | Real CI eval gate; SDK tracing off by design; gold set pending |
| 8 | Reliability & Failure Handling | 3 | 0 | 0 | Deterministic fallback by construction — robust to LLM outage |
| 9 | Governance & Trust | 4 | 0 | 0 | **The moat** — fully enforced in code |
| 10 | Hackathon Winning Factors | 4 | 2 | 0 | Winning substance; under-told story |
| | **Total** | **45** | **17** | **0** | **Zero critical gaps** |

**No ❌ critical gaps were found.** All shortfalls are ⚠️ partials = polish, production-hardening, or narrative.

## Top 5 strengths (lead with these)

1. **Governed determinism (the moat).** Model plans; code computes every dollar; humans approve every action — enforced via typed `Money`, deterministic decision tools, amount-clamp guards, draft-only side-effects, and an approval tool that *refuses to execute*. (Phase 9)
2. **Tamper-evident audit chain.** Hash-linked, optimistic-concurrency approval log. (Phase 4.2)
3. **SDK-native multi-agent core.** Real `handoff()` + `asTool()` + fail-closed `maxTurns`. (Phase 1)
4. **Fail-closed everything + deterministic fallback.** Robust to Supabase/SAP/OpenAI outage by construction. (Phases 4, 8)
5. **Premium design system + real CI eval gate.** "Editorial Enterprise" tokens; `verify:release` accuracy bars. (Phases 6, 7)

## Prioritized remediation backlog

### P0 — Do before judging (presentation + reproducibility; hours of work)
| # | Action | Phase | Why |
|---|---|---|---|
| 1 | **Commit dirty tree to a clean branch/PR** (esp. untracked `cockpit/app/api/*` routes + `backend-read-auth.ts`) and re-run proof pack | 0 | Load-bearing files are uncommitted → judges can't reproduce |
| 2 | **Reshape the Agent-Trace map into a horizontal agent-flow diagram** with handoff arrows + progressive disclosure | 6.5 / 10.5 | Converts the strongest technical asset into the strongest visual one |
| 3 | **Make the governance model the demo headline** + add a one-screen "trust panel" | 9.x / 10.5 | The moat is currently implicit |
| 4 | **Choreograph one <2-min wow beat** (question → handoff → cited $ → approve → audit hash) | 10.6 | Judges reward a clear working flow |
| 5 | **Approve a starter gold eval set (8–12 cases)** so `verify:release` shows green bars | 7.3 | Turns "we have evals" into "we pass our evals" |

### P1 — Strong, low-effort engineering wins
| # | Action | Phase |
|---|---|---|
| 6 | Add explicit in-run **"Stop" button** (abort plumbing already exists) | 5.3 |
| 7 | Re-enable tasteful **drawer motion** (reduced-motion guarded) | 6.6 |
| 8 | Add `reasoning.effort` tuning + **persist per-run token/cost** receipts | 3.3 / 3.5 |
| 9 | Add **request rate-limiting** middleware on agent endpoints | 4.5 |
| 10 | Reconcile `handoffGraph.ts` vs runtime (annotate edge wiring) | 1.7 |

### P2 — Production-hardening (post-hackathon)
| # | Action | Phase |
|---|---|---|
| 11 | Bounded-concurrency pool for Supabase evidence fan-out | 2.7 |
| 12 | Wire SDK-native `defineOutputGuardrail` + emit guardrail-trip telemetry | 2.8 / 2.9 |
| 13 | Opt-in, **PII-redacted trace exporter** for external observability | 7.1 |
| 14 | Background-queue offload + request timeouts for long runs | 4.4 |
| 15 | Client-scoped `session_id`; durable/TTL nonce store | 4.2 |
| 16 | Virtualize long trace lists | 5.x / 6 |

## Verification status (what this audit could and couldn't confirm)

| Confirmed statically ✅ | Needs a live run ⚠️ |
|---|---|
| Agent/handoff/tool wiring, guardrails, fail-closed logic, schemas, auth, audit chain, eval framework, design tokens | Test/E2E *pass* status (claimed green in docs); live token counts/trace; motion/responsive look-and-feel; Lighthouse a11y/perf scores |

**Recommended live pass (optional, on request):** boot API + cockpit, run `npm run verify` + `npm run test:e2e:maya-real`, and a **look-and-feel-only browser pass** (chrome-devtools `lighthouse_audit` + hover/focus/responsive capture per Phase 6).

## Bottom line

The engineering is **already winning-tier with zero critical gaps**. Spend the remaining time on **P0 presentation + reproducibility**: ship a clean branch, make the agent-trace visual, surface the governance moat, choreograph one tight wow moment, and show green eval bars. Do those and this is a strong contender to win.
