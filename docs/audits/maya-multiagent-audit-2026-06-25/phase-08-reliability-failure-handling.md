# Phase 8 — Reliability & Failure Handling

**Status:** Complete · **Mode:** static
**Scope:** `src/services/forensicsQuerySession.ts`, `src/agents/liveForensicsStream.ts`, `src/agents/query.ts`, `src/services/conductor.ts`.

## Findings

| # | Item | Sev | Verdict | Evidence |
|---|---|---|---|---|
| 8.1 | Deterministic fallback when live agent fails | H | ✅ Pass (excellent) | The query session computes the deterministic cited answer + citations from `runForensicsInvestigation` **independently** of the live run; `modelExecution` carries the live status (`live_openai_agents` / `blocked_live_agent_trace` / `blocked_missing_credentials`) without nulling the answer (`forensicsQuerySession.ts:42-90`). The live stream retries then emits `"failed closed; deterministic forensics run continued"` (`liveForensicsStream.ts:220-231`). |
| 8.2 | Idempotency / retry safety | M | ✅ Pass | Live stream retries are bounded by `retryCap` with a `retryCount` guard (`liveForensicsStream.ts:170-233`); approval commit uses optimistic-concurrency retry on audit-tail mismatch and rejects double-commit with `"already committed"` (Phase 4.2). MCP tools annotated `idempotentHint: true`. |
| 8.3 | Raw model text never used as business truth | M | ✅ Pass (enforced) | `rawModelTextPolicy: "suppressed"` is a type-level contract (`forensicsQuerySession.ts:48`); `mapRunStreamEvent` converts model text deltas into a *suppressed* status event, never surfacing content (`liveForensicsStream.ts:275-280`). |

## Detailed notes

### Standout strengths
- **Fail-open-to-deterministic is the right reliability model for this domain.** The visible answer is always the deterministic, cited one; the live agent run is an *enhancement* whose failure degrades the run to "deterministic only" rather than breaking it. This is the single most important reliability property for a finance product: the LLM can be down and the cockpit still produces a correct, cited answer.
- **Three explicit failure modes are typed**, not implicit: missing credentials, blocked live trace, and live success. A judge can see exactly how the system behaves when OpenAI is unavailable.
- **Bounded retries + abort propagation** (Phase 4.1/5.3) mean failures can't loop or leak.

### Gaps & proposed actions

**8.x — Surface the degradation state in the UI [Low].**
> **Proposed action:** When `modelExecution.mode === "blocked_live_agent_trace"`, show a small, honest badge in the trace rail ("Deterministic answer · live agent trace unavailable") rather than only encoding it in the payload. This turns a reliability feature into a visible trust signal.
> **Expert citation:** Production agent guidance treats graceful degradation as a first-class, *observable* state, not a silent fallback ([TrueFoundry — multi-agent architecture](https://www.truefoundry.com/blog/multi-agent-architecture)).

**8.x — Document the failure matrix [Low].**
> **Proposed action:** Add a short "what happens when X fails" table (OpenAI down, Supabase down, SAP probe fails) to the demo doc. The behaviors already exist in code; making them explicit is a strong trust narrative for judges.

## Phase 8 score

- Pass: 3/3. Gaps: 0. Two **Low** visibility enhancements.

**Verdict:** Reliability is a **genuine strength** and a differentiator. The deterministic-fallback design means the product is robust to LLM/API failure by construction — exactly what an enterprise finance buyer (and a discerning judge) wants to see.
