# Speaker notes — Recoup architecture walkthrough

Audience: automation solution architects. Session: **90 minutes.**
16 slides, ~60 presenter beats.

Per-slide notes live in the deck — press <kbd>S</kbd> for speaker view, or open
`index.html?print-pdf` for a flat export with every fragment and note visible. This file
holds the clock, the framing rules, the Q&A bank, and the evidence appendix.

---

## Framing rules

**It is a walkthrough, not a readiness review.** Say so in the first thirty seconds. You are
showing how the system is built and where its edges are.

**"Deployed" and "in production" are different claims.** The system runs against live
services carrying synthetic data, and the release gate for real evidence is still closed.
Never let those collapse into one another — this room will notice.

**Every architecture slide carries a maturity chip.** If someone asks about an unlabelled
claim, that is a gap in the deck, not a question to improvise around.

**Say "swap-ready" or "contract-first", never "plug-and-play".** A live connector still needs
credentials, a schema probe and a readiness promotion.

**Keep the product's own vocabulary.** "Evidence pack", "cited evidence", "evidence scope" are
real concepts in the system. The rule is about the session: the system cites evidence; the
deck does not present evidence.

---

## Deck controls

| Key | Action |
|---|---|
| <kbd>→</kbd> <kbd>Space</kbd> | Next fragment, then next slide |
| <kbd>←</kbd> | Back |
| <kbd>S</kbd> | Speaker view — notes, timer, next slide |
| <kbd>O</kbd> | Overview grid |
| <kbd>T</kbd> | Light / dark |
| <kbd>L</kbd> | Jump to the seven-layer map |
| <kbd>D</kbd> | Jump to the demo stage |
| <kbd>Alt</kbd>+click | Zoom into a diagram region; click again to return |
| <kbd>Esc</kbd> | Exit overview or zoom |

`index.html#/12` deep-links to a slide, `#/12/2` to a fragment.
`index.html?print-pdf` then print-to-PDF gives a handout with fragments expanded.

**Speaker view needs a popup**: allow it once on the presenting machine before the session.

---

## The clock

| Elapsed | Slides | Section |
|---|---|---|
| 0:00 | 1 | Title and framing |
| 0:02 | 2–3 | Where deductions and credit sit; the CPG operating problem |
| 0:10 | 4 | The settlement run everything is measured against |
| 0:14 | **5** | **Seven-layer map** — the anchor |
| 0:20 | **6** | **Journey: one case through all seven layers** |
| 0:28 | 7–8 | Agents and orchestration; pattern selection and restraint |
| 0:36 | 9–10 | Capability boundary; deterministic decision spine |
| 0:44 | **11** | **Adapter and evidence fabric** — the source swap |
| 0:52 | 12–13 | State and models; safety, HITL and consequence |
| 0:60 | 14 | Evaluation and observability |
| 0:64 | 15 | Production truth |
| 0:68 | 16 | Transferable patterns, then switch to the demo |
| 0:70 | — | **Live demo** — see `demo-runbook.md` |
| 0:88 | — | Close and discussion |

**Checkpoints.** Slide 5 by 0:14. Slide 11 by 0:44. Browser open by 0:70.

If you are behind, compress 12–14 into a single pass — say the headline of each and move.
Do not compress 5, 6, 10 or 11; those four carry the argument.

---

## Five lines worth landing cleanly

1. **Slide 2** — O2C failures either delay cash, consume working capital, or permanently erode
   margin. Deductions are mostly the third.
2. **Slide 3** — the strongest credit signal a manufacturer owns is the customer's own
   deduction behaviour: first-party and current, where a bureau score is neither.
3. **Slide 6** — the model occupies two of the ten steps.
4. **Slide 10** — deterministic controls bound the *class* of failure, not its existence.
5. **Slide 11** — replacing a source changes the boundary implementation. Agents, tools and the
   decision spine do not move.

---

## Q&A bank

**"Which orchestration patterns are you actually using?"**
Single agent with tools, sequential, and supervisor with agents-as-tools. Not concurrent
fan-out, not group chat, not maker-checker agents, not adaptive planning. The SDK handoff
mechanism exists but the next agent is prescribed and then asserted, so it is not open
dynamic routing. Slide 8 has the full table.

**"Is the adapter layer real or is it a diagram?"**
Real, with a readiness model in code: each connector reports ready, ready_synthetic,
blocked_credentials_required or blocked_schema_required, and a source is not promoted until a
credential check and a schema probe pass. There are invariant tests asserting the honest split
between live SAP and synthetic non-SAP.

**"So are the non-SAP connectors live?"**
No. Bureau, TPM, documents and remittance are served from governed source tables today. That
proves the contract, the canonical mapping, provenance and service behaviour. It does not
prove connectivity to a third-party platform. Live execution is deferred.

**"What does it cost to swap a source?"**
The boundary implementation plus its readiness checks. The canonical contract, the tools, the
deterministic core and the agents are untouched — that is the whole point of the layer.

**"Why is MCP not your integration layer?"**
MCP governs what an agent may ask for. Adapters govern how a source is reached. An agent gets
scoped questions, never a connection — there is no general-purpose ERP query door.

**"The model still sees numbers. What does determinism actually buy?"**
It bounds the failure class. The model cannot assert a consequential amount or dispatch an
action. It does not make agent judgement harmless — a poor tool choice still costs coverage
and latency.

**"Can an agent change its own model?"**
No. Models bind per agent at construction, and an invariant forbids instantiating a non-pinned
model anywhere in the runtime graph. Routing today is by reasoning effort, not model tier, and
one declared tier is unused — moving low-effort agents to a smaller model is the obvious next
cost lever and has not been pulled.

**"How do you know prompt caching isn't leaking evidence between cases?"**
Only the prefix is cached, and the prefix is static governance and capability text. Case
evidence sits after the cache boundary by construction.

**"How would you debug a slow request?"**
With difficulty. A correlation identifier threads from the request into the run record, so the
join exists — but you run the query by hand. No distributed tracing, no structured logging.
Auditability is strong; runtime observability is not.

**"Is it production ready?"**
No, and slide 15 says which parts. The governance spine is mature; the operational plumbing is
behind it. Highest-value fix is putting the existing gates into CI.

**"What would we reuse?"**
The four patterns on slide 16. Cheapest to adopt is the module-boundary rule; highest value is
invariants with named tests; most transferable to an integration-heavy programme is the
canonical evidence contract with readiness states.

---

## Be careful about

**Slide 4 statistics.** The industry ranges are illustrative and unsourced, and are labelled
that way on the slide. The business case rests on the settlement run, not on them. If pressed,
say exactly that.

**The gold set** is synthetic seed-42 data for a fictional manufacturer. Not a customer case
study.

**Demo credentials** are committed to the repository in nine places. Do not read the password
aloud; raise it yourself if a security person is in the room.

**Handoff coverage.** If asked, be straight: the declared-topology check guards one edge today,
runtime trace assertion guards both journeys. Behaviour is constrained everywhere; the
design-time contract is incomplete. It is on the register.

**Do not claim** a custom graph engine, loop engineering, agent debate, maker-checker agents,
concurrent agents, adaptive planning, live non-SAP connectors, distributed tracing, or
zero-code integration. None of those exist here.

---

## Evidence appendix

Module paths were deliberately kept off the slides — they compete with the architecture for
attention. Use these when a claim is challenged.

| Claim | Where it lives |
|---|---|
| Seven layers map to directories | `cockpit/`, `src/agents/`, `src/services/conductor.ts`, `src/services/serviceLayer.ts` + `src/mcp/`, `src/core/`, `src/adapters/`, SAP + Supabase |
| Agent roster and model binding | `src/agents/agentRuntime.ts`, `config/models.ts` |
| Declared handoff topology | `src/agents/handoffGraph.ts`, `src/agents/messages.ts` |
| Trace assertion and run budgets | `src/services/conductor.ts`, `forensicsQuerySession.ts`, `creditRiskQuerySession.ts` |
| Capability registry and classes | `src/services/serviceLayer.ts`, `src/services/permissionEngine.ts` |
| Scoped capability boundary | `src/mcp/server.ts`, `src/agents/mcpGateway.ts` |
| Money type and rules | `src/types/money.ts`, `src/core/rules/`, `src/types/variance.ts` |
| Hold recomputation and clamp | `src/core/partialHold.ts`, `src/guardrails/tool/amountClamp.ts` |
| **Adapter fabric and readiness** | `src/adapters/connectorRegistry.ts`, `enterpriseReadOnly.ts`, `sapOData.ts` |
| **Readiness is tested** | `tests/invariants/connector-readiness.test.ts` |
| Memory taxonomy and compaction | `src/memory/schema.ts`, `src/memory/compaction.ts` |
| Prompt assembly and caching | `src/agents/promptAssembly.ts`, `config/openaiPromptCache.ts` |
| Guardrails at three boundaries | `src/guardrails/input/`, `tool/`, `output/` |
| Approval and segregation of duties | `src/services/approvals.ts` |
| Audit chain | `src/audit/trail.ts` |
| No ERP write path | `tests/invariants/no-erp-writeback.test.ts` + module-graph rule |
| Gold set totals | `RECONCILIATION_LEDGER.md` §4, `tests/evals/gold-set-parity.test.ts` |
| The 28 active invariants | `INVARIANTS.md` |

---

## Rebuilding the deck

`slides.html` is the only file worth editing. Then:

```bash
node build.mjs      # inlines reveal + theme into index.html
```

The build fails if the output contains non-ASCII characters or external references — both are
regressions that only show up on someone else's machine.
