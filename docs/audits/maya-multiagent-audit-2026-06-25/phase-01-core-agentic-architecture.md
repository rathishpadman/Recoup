# Phase 1 — Core Agentic & Architecture Design

**Status:** Complete · **Mode:** static
**Scope:** `src/agents/agentRuntime.ts`, `handoffGraph.ts`, `forensics.ts`, `liveForensicsStream.ts`, `query.ts`, `riskMesh.ts`, `messages.ts`, `src/prompts/*.md`, `config/models.ts`.

## Architectural model (important context)

Recoup runs a **dual-layer architecture** that is unusual and worth understanding before scoring:

1. **Deterministic decision layer** (`forensics.ts` → `core.evaluateRule`, `decisions.deductionVerdict`, `decisionStore`) computes every verdict, routing, and dollar amount in code.
2. **Live agentic overlay** (`liveForensicsStream.ts`) runs the real `@openai/agents` `Runner` with `stream: true` to produce handoff/tool/agent-boundary trace receipts — but its text output is **suppressed** and it computes nothing.

This is a deliberate response to the governing rule *"the model decides what to do, but code computes every dollar"* (INVARIANT I-1). It is the project's biggest differentiator and its biggest framing risk: a naive judge may expect the LLM to *make* decisions. The demo narrative must make this design legible (see Phase 10).

## Findings

| # | Item | Sev | Verdict | Evidence |
|---|---|---|---|---|
| 1.1 | Explicit handoff primitives | C | ✅ Pass | `agentRuntime.ts:24` `handoffs: [recoveryDrafterAgent]`; `asTool()` at `:40,:46` for agents-as-tools. No prompt-string manipulation anywhere. |
| 1.2 | Loop mitigation / `maxTurns` | C | ✅ Pass | `liveForensicsStream.ts:156-167` fails closed if `maxTurns` not a positive integer; `:249,:255` passes `maxTurns` into `runner.run`; bounded `retryCap` with `retryCount` guard `:170-233`. |
| 1.3 | Hyper-specialized agents/prompts | H | ✅ Pass | All 6 prompts are 2–3 lines, one responsibility each (`forensics-investigator.md`, `recovery-drafter.md`, etc.). No mega-prompts. |
| 1.4 | Context isolation across handoff | H | ✅ Pass | `forensics.ts:364-386` handoff packet carries only `citedRecordIds` + `deterministicBasis` + intent, not raw history. Live input is a fixed minimal instruction (`liveForensicsStream.ts:10-11`). |
| 1.5 | Intentional orchestration pattern | H | ✅ Pass | Three patterns used deliberately: sequential handoff (Forensics→Recovery), supervisor (`riskMeshSupervisorAgent` with agent-tools), agents-as-tools (Sentinel/Containment). Documented in `handoffGraph.ts`. |
| 1.6 | Deterministic state transitions | M | ✅ Pass | Verdict/routing/amount come from `decisions.deductionVerdict` and `core.evaluateRule` tools (`forensics.ts:231-252`); `Money` is a `decimal.js`-backed type, never model text. |
| 1.7 | Agent roster matches design | M | ⚠️ Partial | Roster matches, **but** `handoffGraph.ts:3` declares `Forensics → Containment / Intent` as `mode: "handoff"` while `agentRuntime.ts:24` wires only `[recoveryDrafterAgent]`. Containment is actually handled deterministically (`forensics.ts:278-287`), so the graph edge is aspirational/descriptive, not executable. |

## Detailed notes

### Strengths (call these out to judges)
- **Real SDK primitives, not prompt hacks.** This is exactly what OpenAI recommends: handoffs as "a one-way transfer that allows an agent to delegate to another agent," and agents-as-tools for the supervisor pattern ([OpenAI Agents SDK JS/TS](https://openai.github.io/openai-agents-js/)).
- **Loop control is not just present, it is fail-closed.** Most hackathon entries forget `maxTurns` entirely; here a missing/invalid `maxTurns` *aborts* the live run rather than defaulting silently. This exceeds the baseline best practice ([OpenAI — loop control / `MaxTurnsExceededError`](https://openai.github.io/openai-agents-js/)).
- **Context isolation via typed handoff packets** matches the production guidance that agents should pass "clean, targeted payloads … instead of leaking the entire raw historical context" ([TrueFoundry — multi-agent architecture](https://www.truefoundry.com/blog/multi-agent-architecture)).

### Gaps & proposed actions

**Finding 1.7 — handoffGraph vs. runtime mismatch [M].**
The descriptive `recoupHandoffGraph` lists an edge that is not wired as a live SDK handoff. A reviewer comparing the doc to `agentRuntime.ts` will flag this as either a missing handoff or dead documentation.

> **Proposed action:** Either (a) add `containmentIntentAgent` to the Forensics agent's `handoffs` array if a live handoff is intended, or (b) annotate `handoffGraph.ts` to mark which edges are *executable SDK handoffs* vs. *deterministic-service transitions* (e.g. add a `wiring: "sdk-handoff" | "deterministic" | "agents-as-tools"` field). Option (b) is lower-risk and preserves the governance model.
> **Expert citation:** OpenAI's practical-agents guidance stresses that handoffs should be explicit and inspectable; ambiguous/aspirational handoff declarations undermine the "orchestration and handoffs" clarity the SDK is designed to provide ([OpenAI Agents SDK — Orchestration & handoffs](https://openai.github.io/openai-agents-js/)).

### Design-legibility risk (not a code gap, but judge-facing)

The `recoupAgentRoster` stamps every agent with `modelExecution: "blocked: offline build does not invoke live model calls"` (`agentRuntime.ts:73`...), while `liveForensicsStream.ts` *does* invoke the live model when `OPENAI_API_KEY` is set. The two are reconcilable (offline build vs. live overlay), but the wording could read to a judge as "the agents never actually run."

> **Proposed action:** Rename/clarify the roster field to `offlineBuildModelExecution` and surface a runtime status (`live-overlay-active` / `offline-deterministic`) in the trace so the agentic proof is unambiguous.
> **Expert citation:** Winning agent projects are described by judges as feeling "like a product, not a hackathon project" precisely when their agent behavior is legible and demonstrable ([Devpost — judging tips](https://info.devpost.com/blog/hackathon-judging-tips)). Hidden/ambiguous agent execution status works against that.

## Phase 1 score

- Pass: 6/7 critical-and-high items.
- Partial: 1 (doc/runtime handoff mismatch, Medium).
- Gaps: 0 critical.

**Verdict:** The agentic core is **strong and genuinely SDK-native** — well above typical hackathon quality. The only fixes are clarity/legibility, not correctness.
