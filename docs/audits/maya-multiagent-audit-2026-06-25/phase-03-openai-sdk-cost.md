# Phase 3 — OpenAI SDK Usage & Cost Optimization

**Status:** Complete · **Mode:** static
**Scope:** `src/agents/liveForensicsStream.ts`, `agentRuntime.ts`, `config/models.ts`, `src/memory/compaction.ts`, `scripts/provisionOpenAiEvidenceVectorStore.ts`.

## Findings

| # | Item | Sev | Verdict | Evidence |
|---|---|---|---|---|
| 3.1 | Modern Responses/Agents runner | C | ✅ Pass | Uses `@openai/agents` `Runner` + `OpenAIProvider` (`liveForensicsStream.ts:262-267`), which runs on the Responses API under the hood. No legacy hand-rolled `chat.completions` loop. |
| 3.2 | Native structured outputs (`outputType`) | H | ⚠️ Partial (by design) | No `Agent` declares `outputType`. Business-structured data comes from **deterministic Zod tools** (`decisions.deductionVerdict`, etc.), not from model output — consistent with "code computes every dollar." Acceptable, but means the SDK's structured-output primitive is unused. |
| 3.3 | Reasoning-effort tuning per task | H | ⚠️ Partial | Cost is tuned by **model tier per agent** (forensics→`gpt-5.5` reasoning; recovery/sentinel/containment→`gpt-5.4` fast; mini/nano available) in `config/models.ts` + `agentRuntime.ts`. But no explicit `reasoning.effort`/`modelSettings` is set (grep: none in `src`). Models **are** pinned (I-25 ✅). |
| 3.4 | Context compaction | H | ✅ Pass (deterministic) | `compactMemoryRecords` (`compaction.ts:22-37`) deterministically summarizes memory records (preserved categories + deduped recordIds + trust level). It is structural, not LLM-generated — appropriate for governance. |
| 3.5 | Token accounting | M | ⚠️ Partial | Live stream reads cumulative usage (`liveForensicsStream.ts:328-367`), surfaces via `onTokenUsage`, and returns `tokenUsage` in the run result. Capture exists; **archiving** the per-run usage for audit is noted as a follow-up in the design doc but not yet persisted. |
| 3.6 | Prompt / vector caching | M | ⚠️ Partial | A `provision:openai-evidence-vector-store` script exists (vector-store reuse). Explicit prompt caching is not configured. |

## Detailed notes

### Strengths
- **Model-tier routing is a legitimate cost strategy.** Assigning the expensive reasoning model only to the Forensics Investigator and Risk-Mesh Supervisor, and the fast model to drafting/advisory agents, directly implements the "map reasoning cost to task complexity" principle — just via model selection rather than the `effort` knob. Pinned models also guarantee reproducible spend.
- **Deterministic compaction avoids a classic agent failure.** LLM auto-summarization can silently drop or fabricate facts; here compaction preserves cited `recordIds` losslessly, which is the right call for an audit product.
- **Token usage is already plumbed end-to-end**, which most hackathon entries never bother to wire.

### Gaps & proposed actions

**3.3 — Add explicit reasoning-effort tuning [H].**
> **Proposed action:** For routing/extraction-style calls (e.g. the live status-stream agent, or any future classifier agent) set `modelSettings: { reasoning: { effort: "low" } }`, and reserve `high` for the Forensics Investigator. This compounds with model-tier routing for further token savings.
> **Expert citation:** OpenAI's reasoning models expose `reasoning.effort` specifically so callers can trade tokens for depth; production guidance recommends mapping effort to task complexity (low for routing/extraction, high for complex logic) — the same principle the source checklist cites. See OpenAI Agents SDK model configuration ([OpenAI Agents SDK JS/TS](https://openai.github.io/openai-agents-js/)).

**3.5 — Persist token/cost per run [M].**
> **Proposed action:** Write `tokenUsage` (and derived cost) into the audit/memory store keyed by `sessionId`, so each Maya run carries a cost receipt. The plumbing already returns the number; only persistence is missing.
> **Expert citation:** *"Observability built for agent chains should track token usage, latency, tool calls, and cost attribution across every workflow step"* ([TrueFoundry — multi-agent architecture](https://www.truefoundry.com/blog/multi-agent-architecture)).

**3.2 — `outputType` (optional, only if model ever returns data) [Low].**
> **Proposed action:** Keep as-is. If a future agent must return structured data (not just narrative), use `outputType` with a Zod schema rather than parsing JSON from a string.
> **Expert citation:** OpenAI Agents SDK exposes `outputType` for native structured outputs precisely to avoid markdown-JSON parsing ([OpenAI Agents SDK JS/TS](https://openai.github.io/openai-agents-js/)).

## Phase 3 score

- Pass: 2/6 fully; 4 partial; 0 gaps.
- The partials are **cost-optimization headroom**, not defects. The architecture already pins models and routes by tier.

**Verdict:** Cost posture is **reasonable and reproducible**. The biggest easy win is adding `reasoning.effort` and persisting token receipts — both small changes with clear judge-facing payoff ("we track cost per run").
