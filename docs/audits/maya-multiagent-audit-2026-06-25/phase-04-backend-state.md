# Phase 4 — Backend Engineering & State Management

**Status:** Complete · **Mode:** static
**Scope:** `src/services/cockpitApi.ts`, `liveForensicsStream.ts`, `src/memory/*`, `src/services/conductor.ts` (run budget), `src/audit/supabaseTrail.ts`.

## Findings

| # | Item | Sev | Verdict | Evidence |
|---|---|---|---|---|
| 4.1 | Streaming transport (SSE) | C | ✅ Pass | `/run` streams `text/event-stream` with `flushHeaders()` + `writeSseEvent` (`cockpitApi.ts:502-568`); live agent events via `streamLiveForensicsTraceEvents`. **Server-side `AbortController` aborts on client disconnect** (`:507-510`, `response.on("close")`). |
| 4.2 | Session persistence | H | ✅ Pass (single-operator scope) | Tiered stores: Supabase repo → SQLite → in-memory (`:396-413, :473-474`). Approvals persisted to a **hash-linked Supabase audit chain** with genesis hash + optimistic-concurrency retry (`commitSupabaseApprovalDecision:1396-1439`). Note: session keyed by fixed `"cockpit-run"` (`:485`), not a client thread id. |
| 4.3 | Fail-closed data mode | H | ✅ Pass | `real-backend` is default (`readRecoupDataMode:1195-1197`); every missing source returns 503 + `missingSource` + correlationId via `sendFailClosedJson` (`:1131-1141`). No silent fake data. |
| 4.4 | Async offload / timeout protection | M | ⚠️ Partial | `runForensicsInvestigation` runs **synchronously inside the request** (`:478`); no background queue. SSE holds the connection. No explicit request-timeout middleware. Acceptable for demo scale; a long run blocks that worker. |
| 4.5 | Rate limiting | M | ⚠️ Partial | A **per-run budget controller** caps steps/tokens/retries (`createRunBudgetController`, `runControl.config.phases.*.stepBudget/retryCap`, `:998-1024`) — strong cost-exhaustion defense. But there is **no per-client/IP request-rate limiter** on the endpoints. |
| 4.6 | Graceful error propagation | M | ✅ Pass | Typed error mapping: `ForensicsQueryLineNotFoundError`→404, `ForensicsWorkItemNotFoundError`→404, audit-unavailable→503, already-decided→409 (`:1038-1051, :957-970`). No cascade. |

## Detailed notes

### Standout strengths (these are *production-grade*, not hackathon-grade)
- **Real SSE with proper backpressure/abort.** The server creates an `AbortController` and aborts the live agent stream when the browser closes the connection (`:507-510`) — this is exactly the "signal the backend to kill execution" requirement, and most teams never implement the server side of it. ([OpenAI Agents SDK — streaming](https://openai.github.io/openai-agents-js/)).
- **Tamper-evident audit chain.** Approval decisions are committed with `previousHash`/`sequence` hash-linking and optimistic-concurrency retry on tail mismatch (`:1406-1436`). This is a blockchain-style append-only audit log — a serious trust feature for a finance product.
- **Fail-closed everywhere.** The number of distinct `sendFailClosedJson` branches (settlement rows, risk rows, SAP rows, synthetic rows, config rows) shows the "unknown data fails closed" invariant (I-30) is enforced at every source boundary, with machine-readable `missingSource` tags.
- **Defense-in-depth auth:** constant-time token compare, `human:`-scoped principals, demo-proxy auth with body-hash proof + **single-use nonce replay protection** (`consumedHumanProxyNonces`), CORS allowlist with 403 on cross-origin unsafe methods, correlation IDs.
- **Run-budget controller** is effectively a cost circuit-breaker — it bounds steps, retries, and token usage per phase, which is a more sophisticated answer to "budget exhaustion" than a simple rate limiter.

### Gaps & proposed actions

**4.5 — Add request-rate limiting [M].**
> **Proposed action:** Add a lightweight per-IP/per-principal rate limiter (e.g. `express-rate-limit`) in front of `/forensics/query`, `/run`, and `/approval`. The run-budget controller bounds a single run's cost; a rate limiter bounds *how many runs* a client can trigger.
> **Expert citation:** Production multi-agent guidance prescribes "Rate Limiting Middleware … Global limits protect agent endpoints to prevent budget exhaustion from malicious client loops" ([TrueFoundry — multi-agent architecture](https://www.truefoundry.com/blog/multi-agent-architecture)); the source checklist lists it explicitly.

**4.4 — Offload/timeout for long runs [M].**
> **Proposed action:** For production, move `runForensicsInvestigation` to a background task/worker and stream progress over the existing SSE channel, plus add a hard request timeout. Not needed for the demo dataset but required before real load.
> **Expert citation:** *"Long-running multi-agent routines are offloaded to background queues to protect the web server from timing out"* ([TrueFoundry — multi-agent architecture](https://www.truefoundry.com/blog/multi-agent-architecture)).

**4.2 — Client-scoped session id [Low].**
> **Proposed action:** Thread a client-supplied `session_id`/`thread_id` header through to the memory `sessionId` instead of the hardcoded `"cockpit-run"`, so multiple operators/conversations persist independently.
> **Expert citation:** *"A stateful layer matches incoming session_id/thread_id headers to keep chat threads persistent across stateless runs"* ([TrueFoundry — multi-agent architecture](https://www.truefoundry.com/blog/multi-agent-architecture)).

**Minor:** `consumedHumanProxyNonces` is an in-memory `Set` — it grows unbounded and resets on restart / isn't shared across instances. Fine for demo; for production back it with Redis/Supabase and add TTL eviction.

## Phase 4 score

- Pass: 4/6 (all critical/high pass).
- Partial: 2 (rate limiting, async offload) — both production-hardening, not demo blockers.

**Verdict:** The backend is the **strongest layer in the system** — genuinely production-leaning (SSE+abort, hash-chained audit, fail-closed, budget controller). For the hackathon, lead with the audit chain and fail-closed behavior as trust differentiators.
