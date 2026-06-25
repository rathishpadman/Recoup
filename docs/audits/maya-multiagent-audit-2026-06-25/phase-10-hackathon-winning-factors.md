# Phase 10 — Hackathon "Winning Entry" Factors

**Status:** Complete · **Mode:** synthesis (judging lens)
**Scope:** the whole build, evaluated against how AI-agent hackathons are actually judged.

## How these hackathons are judged (research basis)

From the judging research: criteria cluster into **innovation, technical quality, problem relevance/impact, and clarity of explanation** — with "clarity over production value" and "feels like a product, not a hackathon project" repeatedly cited as what separates winners ([Devpost — judging tips](https://info.devpost.com/blog/hackathon-judging-tips); [TAIKAI — judging criteria](https://taikai.network/en/blog/hackathon-judging)). Recent winners (LORE, Gitdefender) won on **legible multi-agent routing** and **solving a real workflow**, not on flashy UI.

## Findings

| # | Item | Sev | Verdict | Notes |
|---|---|---|---|---|
| 10.1 | Real, expensive problem clearly framed | C | ✅ Pass | O2C deduction recovery is a real, costly enterprise pain (working capital leakage). The persona (Maya, deductions analyst) and 12-beat journey make it concrete. |
| 10.2 | "Feels like a product, not a hackathon project" | C | ✅ Pass | Premium design system, real backend, fail-closed behavior, audit chain, SSE streaming, evals — this clears the bar judges explicitly name. |
| 10.3 | Coherent 12-beat demo narrative | H | ✅ Pass (assets exist) | Beats 1–12 screenshotted (login → dashboard → case → evidence → query → trace → cited answer → draft → approval → audit → return). Storyboard documented. |
| 10.4 | Defensible differentiation | C | ✅ Pass | Governed deterministic-money + cited evidence + human-gated actions + tamper-evident audit chain is a **defensible, non-generic** angle vs. "another chatbot agent." |
| 10.5 | Clarity of explanation > polish | H | ⚠️ Partial | The governance model (the best part) is currently *implicit*. The agent-trace visual reads as a data dump (Phase 6.5). Both risk a judge missing the point in a 2–3 min demo. |
| 10.6 | One memorable <2-min wow moment | H | ⚠️ Partial | The raw materials for a wow moment exist (live handoff + cited recovery draft + approval gate refusing to dispatch) but aren't choreographed into a single punchy beat. |

## The winning narrative (recommended)

Lead, in order, with the three things that are simultaneously **true in code** and **rare in the field**:

1. **"The model decides what to look at — code computes every dollar."** Show a recovery amount with its deterministic basis + cited SAP/Supabase record IDs. (Phase 9.1)
2. **"Watch the agents hand off — and watch a human stay in control."** Show Forensics Investigator → Recovery Drafter in the trace, then the approval gate *refusing to dispatch* without a human. (Phases 1, 9.2)
3. **"Every approval is tamper-evident."** Show the hash-linked audit entry. (Phase 4.2)

This sequence converts your three deepest technical strengths (governance, real multi-agent handoff, audit chain) into the demo's emotional arc.

## Gaps & proposed actions (ranked by judge-impact)

**10.5 / 6.5 — Reshape the agent-trace into a legible flow [C — highest ROI].**
> See Phase 6. A horizontal agent-pipeline with handoff arrows makes the multi-agent story *instantly visible*. This is the single change most likely to move a score.
> **Citation:** Winners are praised for legible multi-agent routing ([Devpost](https://info.devpost.com/blog/hackathon-judging-tips)).

**10.6 — Choreograph the wow moment [H].**
> **Proposed action:** Script one continuous ~90s beat: ask a real question → see the handoff animate → get a cited answer with a dollar figure traced to record IDs → click approve → watch it stage a draft (not send) → see the audit hash appear. Rehearse it to land in under 2 minutes.
> **Citation:** "A clear explanation of the problem and working solution [is] preferred over polished presentation" ([Devpost](https://info.devpost.com/blog/hackathon-judging-tips)).

**10.5 — Add a one-line value proposition + trust panel [H].**
> See Phase 9.x. Put the governance guarantees on screen so no judge can miss them.

**Process — ship a clean reviewable branch [C, from Phase 0].**
> Commit the dirty tree (esp. the untracked Next API routes + backend-read-auth) to a clean branch/PR and re-run the proof pack, so judges can reproduce.

## Phase 10 score

- Pass: 4/6 (3 of 4 critical pass). Partial: 2 (clarity/wow choreography).
- No gaps in *substance* — only in *storytelling and reproducibility*.

**Verdict:** The substance is **already winning-tier**. The remaining work is almost entirely **presentation**: make the governance moat explicit, make the agent-trace visual, choreograph one tight wow moment, and ship a clean branch. Do those four and this is a top-contender entry.
