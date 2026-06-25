# Phase 9 — Governance & Trust (Domain Moat)

**Status:** Complete · **Mode:** static
**Scope:** synthesis across `forensics.ts`, `serviceLayer.ts`, `cockpitApi.ts`, `guardrails/**`, `agentRuntime.ts`, prompts, `AGENTS.md`/`INVARIANTS.md` rules.

> This dimension is the project's **competitive moat**: a *governed* multi-agent system where the model orchestrates but never computes money, and every external action is human-gated. It directly answers the #1 enterprise objection to agentic AI ("I can't let an LLM move my money").

## Findings

| # | Item | Sev | Verdict | Evidence |
|---|---|---|---|---|
| 9.1 | "Code computes every dollar" (I-1) | C | ✅ Pass | `Money` is `decimal.js`-backed (`types/money.js`); amounts come only from `decisions.deductionVerdict`/`core.evaluateRule` (`forensics.ts:231-252`); `clampToComputedDelta` bounds any requested amount to the computed delta (`guardrails/tool/amountClamp.ts`). **Every prompt explicitly forbids the model from computing dollars** (`forensics-investigator.md`, `recovery-drafter.md`, `risk-mesh-supervisor.md`, etc.). |
| 9.2 | Human-in-the-loop gating on all external actions (I-7/I-20/I-23) | C | ✅ Pass | All `actions.*` tools are `sideEffectClass: "draft_only"` (`serviceLayer.ts:166-170`); `approvals.decide` **throws rather than executes** (`:280`); `/approval` requires verified human auth + commits to a hash-linked audit chain (`cockpitApi.ts:909-971`). No external dispatch path exists. |
| 9.3 | Honest provenance; unknown fails closed (I-30) | H | ✅ Pass | Every governed source has a fail-closed 503 with machine-readable `missingSource` (`cockpitApi.ts` `sendFailClosedJson`, ~15 branches); business fields carry `MayaFieldProvenance`; UI re-checks citation scope and downgrades to "blocked" (Phase 5.4). |
| 9.4 | SAP honesty (failed probe never green; S7/S8 fail-closed) | H | ✅ Pass (per design + code) | `sourceHealth` uses read-only GET metadata probes; failed probe → blocked/unavailable, not connected (design doc §Source Health). `retrieval.sap` throws without Supabase SAP evidence (`serviceLayer.ts:522-531`). No ERP write client anywhere (I-26). |

## Detailed notes

### Why this is the moat (lead with this to judges)
- **The governance model is enforced in code at every layer, not asserted in slides:** typed `Money`, deterministic decision tools, amount-clamp guard, prompt-level prohibitions, draft-only side-effect classes, an approval tool that *refuses to execute*, fail-closed source reads, and a tamper-evident audit chain. This is defense-in-depth governance.
- **It inverts the usual agentic risk.** Most agent demos ask "what if we let the AI act?" This one demonstrates "the AI decides *what to look at*, deterministic code computes *every number*, and a human approves *every action*." That is the posture regulated finance buyers actually require.
- **The audit chain (Phase 4.2)** makes approvals tamper-evident — a trust feature most products don't have at all, let alone at a hackathon.

### Expert framing for the pitch
> *"In production, an agent is not a prompt — it's a distributed system where the LLM happens to be the planner/executor … make state transitions deterministic, add trace-level observability."* ([TrueFoundry — multi-agent architecture](https://www.truefoundry.com/blog/multi-agent-architecture)). Recoup is a textbook realization: the LLM plans/narrates; deterministic services own state and money.
>
> OpenAI's own guidance pairs guardrails with **human review/approval** as the safety model for consequential actions ([OpenAI — Guardrails & human review](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals)). Recoup's draft-only + human-approval gate is exactly this pattern, enforced structurally.

### Gaps & proposed actions

**9.x — Make the governance model the headline of the demo [C — narrative, not code].**
> **Proposed action:** Open the demo with one sentence — *"The model decides what to investigate; code computes every dollar; a human approves every action"* — and visually prove it in three beats: (1) the agent trace (model planning), (2) the deterministic basis + cited record IDs on a dollar figure, (3) the human-approval gate refusing to dispatch. This is the strongest story in the build and is currently *implicit*.
> **Expert citation:** Judges reward solutions that "feel like a product, not a hackathon project" and that solve "something real" ([Devpost — judging tips](https://info.devpost.com/blog/hackathon-judging-tips); [TAIKAI — judging criteria](https://taikai.network/en/blog/hackathon-judging)). Governance-as-trust is a real, defensible enterprise problem.

**9.x — Add a one-screen "trust panel" [M].**
> **Proposed action:** A small always-visible panel summarizing the four guarantees with live status: dollars=code-computed, actions=human-gated, provenance=cited, ERP=read-only. Turns invariants into a visible product feature.

## Phase 9 score

- Pass: 4/4 (both critical pass). Gaps: 0.

**Verdict:** Governance is **fully enforced in code** and is the project's defining strength. The only "gap" is that this moat is currently under-sold in the *narrative* — fix that and it becomes the winning differentiator (Phase 10).
