# Speaker notes — Recoup, 60-minute session

Audience: internal automation solutions team — engineers and solution architects.
Split: **10 business / 20 architecture / 25 demo / 5 Q&A.**

Per-slide notes are embedded in the deck itself — press <kbd>S</kbd> to toggle them, or open
`index.html?print` for a flat view with every note visible. This document holds what doesn't
belong on a slide: the clock, the Q&A bank, and the things to be careful about.

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
| 0:00 | 1 | Title |
| 0:01 | 2–6 | Act I — O2C as a lifeline, and where it leaks |
| 0:10 | 7–8 | Why agentic, and the four constraints |
| 0:14 | 9–12 | Three planes, handoff graph, tools, MCP |
| 0:22 | 13–15 | Memory, retrieval, guardrails |
| 0:27 | 16–17 | Verified orchestration, production posture |
| 0:31 | 18 | Demo running order — then switch to the browser |
| 0:33 | — | **Live demo** (see `demo-runbook.md`) |
| 0:55 | 19 | Close and Q&A |

**Checkpoints.** Slide 6 by 0:10. Slide 18 by 0:31. If you are behind at slide 12, compress
13–15 into a single pass — say the headline of each and move. Do not compress 16, it is the
strongest slide in the deck.

If you are *ahead*, the place to spend it is slide 10 (the handoff graph) and slide 17 (the gap
list) — both reward discussion.

---

## Three lines worth landing cleanly

1. **Slide 3** — *most of what is taken is arguable, and most of it is never argued.* This is what
   reframes the problem from collections to cost of proof, which is what makes it an automation
   problem at all.
2. **Slide 14** — *semantic search is allowed to find evidence, never to introduce it.*
3. **Slide 16** — *most agent systems trust the trace; this one audits it.*

Everything else can be paraphrased. These three carry the argument.

---

## Q&A bank

**"Isn't this just a workflow with an LLM bolted on?"**
No, and the handoff graph is the evidence. The agent decides which evidence would settle a claim
and goes to get it — that branch structure is not enumerated anywhere. What *is* fixed is the set
of tools it may use and the assertions its output must satisfy. Constrained agency, not a workflow.

**"The model still sees the numbers. How is I-1 meaningful?"**
It reads them and reasons about them. It never produces one that reaches a finding or a decision.
Concretely: `proposeHold` lets the model propose a split, then re-runs
`computePartialHoldAmountSplit()` and throws if the model's numbers disagree. The model's
arithmetic is never trusted, only its judgement about what to look at.

**"Suppressing all model prose seems extreme."**
It is, and it's a legitimate design debate — invite it. The defence: in this domain everything true
is already in the cited record, so the narrative adds risk without adding information. In a domain
where the prose *is* the product, you'd make the opposite call.

**"Why MCP if the server runs in-process?"**
Two reasons. The protocol gives a real capability boundary — tool filtering, annotations,
per-request scoping — without hand-rolling it. And the same surface can be exposed to an external
client without re-plumbing the permission model. `RECOUP_MCP_URL` unset is a deployment choice,
not an architectural one.

**"What happens when the model is simply wrong about which evidence matters?"**
It retrieves the wrong documents, the deterministic rules don't fire, and no finding is produced.
That's a miss, not a false positive. The FP gates (I-5, I-22) are release blockers precisely
because a miss is recoverable and a wrong recovery claim sent to a customer is not.

**"How much does a run cost?"**
Tokens, cached tokens and latency are recorded per run in `recoup_agent_usage_runs`, and rolled up
daily. Dollar cost is *not* computed — `costStatus` is hardcoded
`pricing_not_configured_not_computed`. Say that rather than estimating.

**"Could we reuse this for [their process]?"**
The three patterns on slide 19 transfer to anything. The domain logic doesn't. The most portable
single artifact is the invariants-with-named-tests discipline, and the cheapest thing to adopt
tomorrow is the dependency-cruiser boundary rule.

**"Is it production ready?"**
No, and slide 17 says which parts. The governance spine is unusually mature; the operational
plumbing behind it is not — no CI running the tests, no timeouts on outbound calls, rate limiting
off by default, in-process state that won't scale horizontally, single tenant. That's the honest
answer and it holds up better than a qualified yes.

---

## Be careful about

**Sourcing on slide 3.** The 2–5% / 65–80% / 60% figures are the repo's own landing-page numbers,
attributed there as industry estimates. They are not independently audited, and I haven't verified
them against a primary source. Fine for an internal session; say so if pressed, and attribute them
properly before any external reuse.

**The word "production".** The app is deployed and running against live Supabase, live SAP reads
and live Agents SDK runs — so "production" is fair for the deployment. It is not carrying real
invoices for a real customer. Keep that distinction crisp; this audience will notice if you blur it.

**Demo credentials.** Committed to the repo in nine files. Don't read the password aloud, and if a
security person is in the room, raise it before they do.

**The gold set.** `$112,400` / 20 lines is synthetic seed-42 data, not a real customer's ledger.
Slide 5 says NorthBay Brands, which is the fictional manufacturer. Don't let it be heard as a case
study.

**Don't oversell the memory tiers.** It's typed, scoped, PII-rejecting and inspectable — genuinely
good. It is not a learned or self-improving memory, and nobody should leave thinking it is.
