# Speaker notes — Recoup architecture walkthrough

Audience: internal automation solutions team — engineers and solution architects.
Session: **90 minutes.** 12 problem / 40 architecture / 25 demo / 13 discussion.

Per-slide notes are embedded in the deck — press <kbd>S</kbd> to toggle, or open
`index.html?print` for a flat view with every note visible. This document holds what doesn't
belong on a slide: the clock, the Q&A bank, and the framing rules.

---

## Framing rules

**This is a walkthrough, not a readiness review.** Say so in the first thirty seconds. You
are showing how a system is built and where its edges are — you are not asserting that it
is production-grade, and you are not presenting evidence for a decision.

**"Deployed" and "in production" are different claims.** The cockpit and API are deployed
and running against live Supabase, live SAP reads and live Agents SDK runs. They carry
synthetic seed-42 data, and the repository's own real-evidence release gate is blocked.
Never let those two collapse into one another — this audience will notice.

**Keep the product's own vocabulary.** "Evidence pack", "evidence dossier", "cited
evidence", `evidence_refs` are real concepts in the system and should stay. The rule is
about the *session*: the system cites evidence; the deck does not present evidence.

**Every architecture slide carries a maturity chip** — `live`, `offline`, `pending`,
`target`. If someone asks about an unchipped claim, treat that as a gap in the deck.

---

## Deck controls

| Key | Action |
|---|---|
| <kbd>→</kbd> <kbd>↓</kbd> <kbd>Space</kbd> | Next slide |
| <kbd>←</kbd> <kbd>↑</kbd> | Previous |
| <kbd>Home</kbd> / <kbd>End</kbd> | First / last |
| <kbd>S</kbd> | Speaker notes |
| <kbd>T</kbd> | Light / dark |
| <kbd>B</kbd> | Backup section |

`index.html#s10` deep-links to a slide. `index.html?print` gives a flat scroll view with all
notes shown — use it for a PDF export or a handout.

---

## The clock

| Elapsed | Slides | Section |
|---|---|---|
| 0:00 | 1 | Title and framing |
| 0:01 | 2–6 | O2C as a lifeline, and where it leaks |
| 0:12 | 7–9 | Why agentic; the four constraints; three planes |
| 0:20 | **10** | **End-to-end runtime sequence** — the centrepiece |
| 0:25 | 11–12 | Topology and trust boundaries; multi-agent coordination |
| 0:32 | 13–14 | Tool registry; MCP as least privilege |
| 0:38 | 15 | The deterministic financial spine |
| 0:42 | 16–17 | Memory; retrieval and the citation contract |
| 0:47 | 18 | Model routing, prompts and caching |
| 0:51 | 19–20 | Guardrails; verified orchestration |
| 0:56 | 21 | Observability, four layers |
| 0:60 | 22 | Demo running order — then switch to the browser |
| 0:62 | — | **Live demo** (see `demo-runbook.md`) |
| 0:87 | 23–25 | Risk register; maturity map; three patterns |
| — | | Discussion runs into whatever remains |

**Checkpoints.** Slide 6 by 0:12. Slide 10 by 0:20 — if you are late here, you are late for
the whole session. Slide 22 by 0:60.

If you fall behind, compress 16–17 (memory and retrieval) into a single pass. Do **not**
compress 10, 15 or 20 — those three carry the argument.

---

## Four lines worth landing cleanly

1. **Slide 3** — *most of what is taken is arguable, and most of it is never argued.*
   Reframes the problem from collections to cost of proof, which is what makes it an
   automation problem at all.
2. **Slide 10** — *the model occupies steps 4 and 5 only.* Say it after walking the sequence.
3. **Slide 17** — *semantic search is allowed to find evidence, never to introduce it.*
4. **Slide 20** — *most agent systems trust the trace; this one audits it.*

---

## Q&A bank

**"Which topology is authoritative — you showed one graph and mentioned agents outside it."**
Both, at different times. Packet validation (`createAgentHandoffPacket`) prevents an
undeclared edge being constructed; it currently covers one edge, `forensics.ts:381`. Trace
assertion proves a declared edge actually fired; it covers both journeys. So runtime
behaviour is constrained everywhere, and the design-time contract is incomplete. That is on
the risk register.

**"Can topology drift from runtime behaviour?"**
On any edge not covered by packet validation — currently all but one. Trace assertion is
what stops that mattering in practice today. Completing packet coverage is the fix.

**"Why GPT-5.4 rather than mini or nano?"**
There is no tier routing. `reasoning` and `fast` both resolve to `gpt-5.4`; the only
differentiation is `reasoning.effort` and verbosity. `mini` does one job — strict-JSON
counter-offer extraction. `nano` is declared and never referenced. Dead config.

**"Can an agent pick a different model at runtime?"**
No. Models bind per agent at construction from `config/models.ts`, and invariant I-25 forbids
instantiating a non-pinned or fine-tuned model anywhere in the runtime graph.

**"What's the cost lever you haven't pulled?"**
Effort-based routing means you pay 5.4 rates for every agent including the low-effort ones.
Moving those to `mini` is the obvious next optimisation and nobody has done it. Also: cost is
measured but not priced — `costStatus` is hardcoded `pricing_not_configured_not_computed`.

**"How do you know prompt caching isn't leaking evidence between cases?"**
Caching applies to the prefix only, and the prefix is three static layers — governance,
capability, agent prompt. Case and evidence arrive in the suffix. Two cases in the same
capability share governance text and nothing else.

**"How would you debug a slow request in this system?"**
Honestly: with difficulty. There is a correlation ID threaded from the HTTP middleware into
`recoup_agent_usage_runs`, so you can join a business outcome to its agent run, tokens and
latency — but you run that query by hand. No OTel, no structured logging, no trace backend.
Auditability is strong; runtime observability is not, and those are different properties.

**"Isn't this just a workflow with an LLM bolted on?"**
No, and slide 10 is the evidence. The agent decides which evidence would settle a claim and
goes to get it; that branch structure isn't enumerated anywhere. What is fixed is the tool
set and the assertions the output must satisfy.

**"The model still sees the numbers. How is I-1 meaningful?"**
It reads them and reasons about them; it never produces one that reaches a finding.
`proposeHold` lets the model propose a split, then re-runs
`computePartialHoldAmountSplit()` and throws if the numbers disagree.

**"Suppressing all model prose seems extreme."**
It is, and it's a fair debate. In this domain everything true is already in the cited record,
so the narrative adds risk without adding information. In a domain where the prose is the
product you'd make the opposite call.

**"Why MCP if the server runs in-process?"**
The protocol gives a real capability boundary — tool filtering, annotations, per-request
scoping — without hand-rolling it, and the same surface can be exposed externally later
without re-plumbing permissions. `RECOUP_MCP_URL` unset is a deployment choice.

**"Is it production ready?"**
No, and slides 23 and 24 say which parts. The governance spine is mature; the operational
plumbing is behind it. That answer holds up better than a qualified yes.

**"Could we reuse this?"**
The three patterns on slide 25 transfer to anything. The domain logic doesn't. Cheapest thing
to adopt tomorrow is the dependency-cruiser boundary rule; highest-value is invariants with
named tests.

---

## Be careful about

**Slide 3 statistics.** 2–5% / 65–80% / 60% are the repo's own landing-page figures, labelled
on-slide as unverified. I did not find primary sources. If pressed, say exactly that.

**The gold set.** `$112,400` / 20 lines is synthetic seed-42 data for a fictional
manufacturer, NorthBay Brands. Don't let it be heard as a customer case study.

**Demo credentials.** Committed to the repo in nine places. Don't read the password aloud,
and raise it yourself if a security person is in the room.

**Backup screenshots** are from 1–2 July 2026 and may lag the live UI. Check them before the
session rather than discovering a mismatch live.

**Don't oversell memory.** Typed, scoped, PII-rejecting and inspectable — genuinely good. It
is not learned or self-improving, and nobody should leave thinking it is.

**Don't claim "an edge list you cannot go around."** That overstates packet validation, and
an architect who opens `messages.ts` will find one call site.
