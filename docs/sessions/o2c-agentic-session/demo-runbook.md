# Demo runbook — Recoup session, Act III

Live demo against the **deployed environment**. 25 minutes, three personas, one settlement run — running at roughly the 62-minute mark of a 90-minute session.

> **Deployed is not production.** It runs against live Supabase, live SAP reads and live Agents SDK
> runs, carrying synthetic seed-42 data. The repository's own real-evidence release gate is blocked.
> Keep that distinction crisp; slide 24 sets it out.

- Cockpit: `https://recoup-self-eta.vercel.app`
- API: `https://recoup-api.onrender.com`
- Deck: `docs/sessions/o2c-agentic-session/index.html` — leave it open on slide 22 (the running order) so you can glance back.

---

## Pre-flight

### T-30 — credentials

The three demo logins are `Maya`, `david` and `CFO`. The shared password is **not repeated in this
runbook on purpose** — it is already committed at `docs/supabase-demo-login-schema.sql` (search for
`recoup_demo_users`). Read it from there before the session.

> Worth raising if a security-minded person is in the room: those credentials are checked into the
> repository in nine places. It is fine for a synthetic demo tenant and it would not be fine for
> anything else. Better to say it yourself than be asked.

### T-15 — warm the backend

Render spins the API down when idle, and a cold start will eat the first two minutes of your demo.

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://recoup-api.onrender.com/healthz   # want 200
```

A `503` here is not necessarily a cold start — `/healthz` returns 503 when run-control config is
missing from Supabase, which is deliberate fail-closed behaviour. Retry a few times; if it stays
503 with a fast response, that is a config problem, not a warm-up problem, and you should plan on
the backup path.

Then load each demo route once so the read-model caches are warm:

```
/forensics/shadcn   /run   /credit   /credit/command
/governance/agents  /governance/memory  /governance/trace
/governance/evals-finops  /cfo
```

### T-5 — browser setup

Three windows, already logged in, so you never burn a minute re-authenticating mid-flow. Route
access is enforced per persona in `config/cockpitDemoProfiles.ts` — one session cannot cover all
three journeys.

| Window | Login | Routes it can reach |
|---|---|---|
| 1 | `Maya` | `/forensics`, `/forensics/shadcn`, `/run` |
| 2 | `david` | `/credit`, `/credit/command` |
| 3 | `CFO` | `/cfo`, all `/governance/*` |

Also: zoom to ~90% on a 1080p projector so tables don't wrap · close notification surfaces ·
have the backup screenshot folder open in a fourth tab.

---

## The click path

### Beat 1 — Maya, deduction forensics · 12 min

**`/forensics/shadcn`**

1. **The worklist.** Land here and stay for a moment. Point out that the totals match slide 5 —
   20 lines, `$112,400`, split 7 / 13. Say plainly: *these are the same numbers from the deck,
   because they come from the same checked-in gold set the build asserts against.*
2. **Open S3 — Crestline, `$21,300` shortage.** The one where the POD shows a full signed delivery.
   This is the hero case; it is unambiguous and it has real documents behind it.
3. **The evidence dossier.** Walk the cited record IDs. The point to make: every figure on screen
   has a record ID next to it, and the verdict names the rule that produced it. Nothing here is a
   model assertion.
4. **The investigation timeline.** Show the tool calls and the handoff. Note what is *absent* —
   there is no model prose, because the output guard replaces it.

**`/run`**

5. **Trigger a live run.** The SSE stream, the tool status rail, the trace visualiser. Let it run;
   narrate the phases (`supervisor → query → retrieval → decision`) while it streams.
6. **Ask the copilot** *"why is this deduction invalid?"* Then show the cited answer card. Say:
   the answer was built deterministically first, and it only rendered because the trace proved a
   successful MCP source read and the Forensics → Recovery Drafter handoff. That is slide 20,
   running.

**Back to the worklist**

7. **The approval gate.** Open it, approve, show the audit hash. Emphasise: the action is now
   `approved`, not `sent`. Nothing left the building. The proposer could not have approved this.

### Beat 2 — David, credit and containment · 8 min

**`/credit`**

1. **Harbor Foods.** DSO drifting 32 → 51 days. Distressed but honest — and name the guard that
   protects exactly this customer from being treated as a gamer: `noWrongfulContainment`.
2. **The partial-hold score.** Six criteria, composite **51.25**, band 40–60. Walk two or three
   criteria and their weights. The point: the weights are config, the score is code, and an agent
   may *propose* a weight change but it is clamped to governance bands and routed to a human.
3. **The split.** 55% release — **`$352K` ships now, `$288K` back-orders** on revised terms.
   Deterministic, reproducible, and `proposeHold` throws if a caller's numbers disagree with the core.
4. **The negotiation workbench**, then the **draft-only terms packet** and the approval gate.
   Again: draft, not dispatch.

**`/credit/command`** — 60 seconds on the dark command centre, then move on. It is the one dark
surface in the product and it photographs well, but it is not load-bearing for the argument.

### Beat 3 — CFO, governance · 5 min

This is the payoff for Act II. Move briskly; each screen needs about a minute.

1. **`/governance/agents`** — the handoff graph from slide 12, rendered live from
   `src/agents/handoffGraph.ts`. Put the slide back up beside it if you can. Note aloud that
   this renders the *declared* graph and the credit pair sits outside it — the nuance from slide 12.
2. **`/governance/memory`** — the eleven typed categories as an inspectable surface.
3. **`/governance/trace`** — the cited trace timeline; point at the cited-record counts per event.
4. **`/governance/evals-finops`** — eval gates and token economics. Mention that cost is measured
   but not yet priced, matching what you said on slide 21.
5. **`/cfo`** — close on exposure, projected recovery, and supervised autonomy.

---

## When something breaks

| Symptom | What it means | What to do |
|---|---|---|
| Route returns **503** with a `missingSource` label | Fail-closed on missing Supabase config or source rows. **This is correct behaviour**, not a crash. | Name it as designed behaviour under I-30 provenance honesty — the system refuses to show a plausible number it cannot source. Then move on or go to backup. |
| First page load hangs ~30–60s | Render cold start | Keep talking; it will come up. If it doesn't, go to backup. |
| Copilot answer is blocked | `blocked_live_agent_trace` or `blocked_missing_credentials` | This is slide 20 happening in front of them. Read the state name off the screen and explain which proof was missing. An honest block demonstrates the argument better than a smooth answer. |
| A page paints stale data | 24h stale-serve allowance in the read-model cache | Acknowledge it as a demo allowance and carry on. |
| Login fails | Supabase-backed login is down | Backup path — there is no offline login mode. |

**Backup path** — press <kbd>B</kbd> in the deck for the route inventory, then narrate the same
click path over the captured screenshots:

- `docs/audit/real-evidence-baseline/2026-07-01/screenshots/` — 19 captures, one per route
- `docs/audit/real-evidence-preview/2026-07-02-430565d/` — 2 captures

**These are from 1–2 July 2026 and may lag the live UI.** Open them during pre-flight and compare
against the running app; discovering a mismatch mid-demo is worse than not having a fallback. If
they have drifted, recapture the Maya and governance routes before the session.

---

## Cut list, in order

At 90 minutes the demo is no longer the squeeze point. If you are still behind at the 20-minute
mark of the demo, cut in this order:

1. `/credit/command` — the dark command centre. Pretty, not structural.
2. `/governance/evals-finops` — mention the numbers instead of showing them.
3. `/credit` negotiation workbench — go straight from the score to the terms packet.
4. `/forensics` classic surface, if you were planning to show it alongside the shadcn one.

**Never cut:** the approval gate (Beat 1 step 7), `/governance/agents`, or `/governance/trace`.
Those three are the payoff for the entire architecture section — without them Act II was theory.

---

## After the session

- The three open questions on slide 25 are genuinely open. Capture the answers.
- If anyone asks for the code walkthrough, the five files listed on slide 25 are the right entry
  points, in that order.
- Anything raised that belongs on the risk register (slide 23) should go there rather than into a
  side channel — the register is meant to be a working document.
