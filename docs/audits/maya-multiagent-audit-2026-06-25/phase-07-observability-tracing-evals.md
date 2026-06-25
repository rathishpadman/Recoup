# Phase 7 — Observability, Tracing & Evals

**Status:** Complete · **Mode:** static
**Scope:** `src/agents/liveForensicsStream.ts`, `src/services/conductor.ts` (hook receipts + run budget), `evals/harness.ts`, `evals/releaseReadiness.ts`, `evals/releaseReadinessCli.ts`.

## Findings

| # | Item | Sev | Verdict | Evidence |
|---|---|---|---|---|
| 7.1 | SDK tracing across agent/tool/handoff | C | ⚠️ Partial (by design) | OpenAI SDK tracing is **deliberately disabled** (`liveForensicsStream.ts:264-267` `tracingDisabled: true`, `traceIncludeSensitiveData: false`). Observability is instead delivered via **deterministic hook receipts** (`conductor.ts:185-225` emits `agent_start/agent_end/agent_tool_start/agent_tool_end/handoff`) surfaced in the UI trace rail. Auditable in-app, but no external trace dashboard. |
| 7.2 | Eval harness scores in CI | H | ✅ Pass (framework) | `verify:release` runs `releaseReadinessCli.ts` → `buildCurrentReleaseReadinessReport`. Three metric gates with owner thresholds: **deduction-validity accuracy, intent precision, arbitration agreement** (`harness.ts:39-58`, `releaseReadiness.ts:66-91`). Gates **fail closed** when the label manifest is absent (`releaseReadiness.ts:116-122`, required count → ∞). |
| 7.3 | Gold cases (valid/invalid/partial) | H | ⚠️ Partial | The eval *framework* requires **owner-approved** intent + arbitration label manifests (`buildReleaseOwnerInputRequest:212-258`). Until the owner supplies them, the gate is blocked by design. The gold dataset is **pending owner sign-off** (confirmed in design-doc Known Gaps). |
| 7.4 | Cost / latency / token visibility per step | M | ⚠️ Partial | Per-phase token usage, step budget, and retry caps are tracked via the run-budget controller (`conductor.ts`, Phase 4.5). Captured but not persisted/dashboarded (see Phase 3.5). |

## Detailed notes

### Strengths
- **This project actually has evals** — most hackathon entries have zero. `verify:release` is a real release gate that computes accuracy/precision/agreement against thresholds and *blocks the build* when gold labels are missing. That is textbook eval-driven development: *"ship evaluation in CI"* and *"deterministic tool mocks in CI"* ([TrueFoundry — multi-agent architecture](https://www.truefoundry.com/blog/multi-agent-architecture); [AI agents 2026 — evals](https://andriifurmanets.com/blogs/ai-agents-2026-practical-architecture-tools-memory-evals-guardrails)).
- **Fail-closed evals** are the right governance posture: an unproven model can't pass the gate by default.
- **Hook receipts are a legitimate trace substitute** — they capture the agent lifecycle (start/tool/handoff/end) with cited recordIds and deterministic basis, and feed the UI trace rail. The agentic proof is real even with SDK tracing off.

### The key tradeoff to make explicit

Disabling SDK tracing protects against raw-model-text leakage (consistent with the governance model), but it forfeits OpenAI's trace dashboard and any external observability tool integration. For a hackathon *demo*, the in-app trace rail is arguably better (self-contained, no external login). For *production*, you'll want both.

### Gaps & proposed actions

**7.1 — Add an opt-in, sanitized trace exporter [H for production, Low for demo].**
> **Proposed action:** Keep `tracingDisabled: true` by default, but add an env-gated path that enables the SDK tracer with a **custom span processor that redacts model text/PII** before export (you already have `redactPiiForModelContext`). This gives external observability without violating the raw-text suppression rule.
> **Expert citation:** *"By tracing LLM application requests, you can create telemetry … helping you monitor guardrail behavior and quickly spot errors and latency."* Production agent observability should track token usage, latency, tool calls, and cost across every step ([TrueFoundry — multi-agent architecture](https://www.truefoundry.com/blog/multi-agent-architecture)); OpenAI Agents SDK supports custom trace processors/exporters ([OpenAI Agents SDK JS/TS — tracing](https://openai.github.io/openai-agents-js/)).

**7.2 / 7.3 — Land a starter gold set for the demo [H].**
> **Proposed action:** Have the owner approve a small but real labeled set (valid/invalid/partial deduction + intent + arbitration cases) so `verify:release` shows *green metric bars* during judging rather than a blocked gate. Even 8–12 labeled cases turns "we have an eval framework" into "we pass our eval bars."
> **Expert citation:** *"Evaluate full trajectories … tool choice correctness, argument validity, step count, policy compliance … add judge-based scoring only with a rubric"* ([AI agents 2026 — evals](https://andriifurmanets.com/blogs/ai-agents-2026-practical-architecture-tools-memory-evals-guardrails)). A populated reference dataset is what makes the eval real.

**7.4 — Emit guardrail-trip + per-run cost telemetry [M].** (See Phase 2.8 / 3.5.)
> **Proposed action:** Persist per-run token/cost and guardrail-trip counts to the audit store so the trace rail can show a "this run cost N tokens, M guardrails fired" footer — a strong trust signal.

## Phase 7 score

- Pass: 1/4 fully; 3 partial; 0 gaps.
- The partials are **deliberate tradeoffs + pending owner data**, not missing engineering. The eval *framework* is a genuine strength.

**Verdict:** Observability/eval maturity is **far above hackathon norm** — there is a real CI eval gate and a real in-app trace. The two highest-value moves are (1) approve a starter gold set so the eval bars show green, and (2) add a redacted, opt-in trace exporter for production observability.
