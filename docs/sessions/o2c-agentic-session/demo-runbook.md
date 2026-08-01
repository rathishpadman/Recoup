# Demo runbook — Recoup, 25 minutes

Runs at roughly the **70-minute mark** of a 90-minute session, straight off slide 16.

- Cockpit: `https://recoup-self-eta.vercel.app`
- API: `https://recoup-api.onrender.com`
- Return to the deck with <kbd>D</kbd> (demo stage) or <kbd>L</kbd> (architecture map)

> **Deployed is not production.** Live services, live agent runs, synthetic seed-42 data, and
> the release gate for real evidence still closed. Slide 15 sets this out — do not blur it here.

---

## Why the demo is not embedded in the deck

It was asked for, and it cannot work. Two independent reasons:

1. **The session cookie is `SameSite=Lax`.** A cross-site iframe does not receive it, so every
   persona route would redirect and the frame would show a login wall rather than the product.
   Making it work needs `SameSite=None; Secure`, which is a runtime change and out of scope here.
2. **The published deck runs under a strict CSP** that blocks external hosts, so an embedded
   frame is dead there regardless.

The app itself is not the obstacle — it sets no frame-blocking headers. If a genuinely embedded
demo becomes important, the clean route is serving the deck from the cockpit's own origin so it
is same-site. That is a change under `cockpit/` and a separate decision.

**What to do instead:** present from a second window. Slide 16 is the stage; you switch to a
browser that is already open and logged in, and come back with <kbd>D</kbd>.

---

## Pre-flight

### T-30 — credentials

Logins are `Maya`, `david` and `CFO`. The shared password is **deliberately not repeated here** —
it is committed at `docs/supabase-demo-login-schema.sql`. Read it from there.

> If a security-minded person is in the room, raise it before they do: those credentials are in
> the repository in nine places. Fine for a synthetic demo tenant, not fine for anything else.

### T-15 — warm the backend

Render spins down when idle and a cold start will eat the first two minutes.

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://recoup-api.onrender.com/healthz   # want 200
```

A `503` is not necessarily a cold start — `/healthz` returns 503 when governed config is missing,
which is deliberate fail-closed behaviour. If it stays 503 and responds fast, that is a config
problem and you should plan on the backup path.

Then load each route once so the read models are warm:

```
/forensics/shadcn   /run   /credit   /credit/command
/governance/agents  /governance/memory  /governance/trace
/governance/evals-finops  /cfo
```

### T-5 — windows

Route access is enforced per persona, so one session cannot cover all three journeys.

| Window | Login | Reaches |
|---|---|---|
| 1 | `Maya` | `/forensics`, `/forensics/shadcn`, `/run` |
| 2 | `david` | `/credit`, `/credit/command` |
| 3 | `CFO` | `/cfo`, all `/governance/*` |

Also: zoom to ~90% on a 1080p projector so tables do not wrap · silence notifications · have the
captured walkthrough open in a fourth tab · allow the speaker-view popup once.

---

## The click path

Every step carries the architecture layer it exercises. Say the layer out loud — that is what
turns the demo into proof of the map rather than a product tour.

### Maya — deduction forensics · 11 min

| | Step | Layer |
|---|---|---|
| 1 | **The worklist.** Totals match slide 4 — 20 lines, `$112,400`, split 7 / 13. Say plainly: same checked-in set the build asserts against. | `L1` |
| 2 | **Open S3** — Crestline, `$21,300`, the shortage where delivery was signed in full. The case from slide 6. | `L1` |
| 3 | **Evidence dossier.** Walk the cited record IDs. Every figure has an ID beside it and the verdict names the rule that produced it. | `L6` |
| 4 | **Investigation timeline.** Tool calls and the handoff. Note what is absent — no model prose. | `L2` `L3` |
| 5 | **Live run** on `/run`. Narrate the phases while the stream arrives. | `L3` |
| 6 | **Copilot query** — "why is this invalid?" Show the cited answer, then say the answer rendered only because the trace evidenced a source read and the required handoff. | `L3` `L4` |
| 7 | **Approval gate.** Approve. The action is now approved, not sent. The proposer could not have approved it. | `HITL` |
| 8 | **Audit record.** Cited IDs and deterministic basis, appended. | `L5` |

### David — credit and containment · 8 min

| | Step | Layer |
|---|---|---|
| 1 | **Harbor Foods.** DSO drifting 32 to 51 days. Name the guard that stops distress being treated as gaming. | `L6` |
| 2 | **Sentinel and Containment positions** — advisory, narrative only. | `L2` |
| 3 | **Risk-Mesh arbitration.** The supervisor gathered positions; deterministic code arbitrated. | `L5` |
| 4 | **Partial release.** Composite `51.25`, band 40–60, `55%` release: `$352K` ships, `$288K` back-orders. Recomputed and rejected if a caller disagrees. | `L5` |
| 5 | **Draft-only terms packet**, then the approval gate. Draft, not dispatch. | `HITL` |

### CFO — governance · 6 min

| | Step | Layer |
|---|---|---|
| 1 | **`/governance/agents`** — the topology, live. Note it renders the *declared* graph; the credit pair sits outside it, as on slide 7. | `L2` `L3` |
| 2 | **`/governance/connectors`** — readiness states per source. This is slide 11 in the running system. | `L6` |
| 3 | **`/governance/memory`** — typed categories as an inspectable surface. | `L2` |
| 4 | **`/governance/trace`** — cited trace timeline, record counts per event. | `L3` |
| 5 | **`/governance/evals-finops`** — gates and token economics. Cost is measured, not priced. | cross-cutting |
| 6 | **`/cfo`** — exposure, projected recovery, supervised autonomy. | `L1` |

`/governance/connectors` is new to this run order and worth the minute — it is the only place
the adapter readiness model is visible in the running product.

---

## When something breaks

| Symptom | What it means | What to do |
|---|---|---|
| **503 with a `missingSource` label** | Fail-closed on missing config or source rows. Correct behaviour, not a crash. | Name it as designed. The system refuses to show a number it cannot source. Then continue or go to backup. |
| **First load hangs 30–60s** | Render cold start | Keep talking. If it does not come up, go to backup. |
| **Copilot answer blocked** | `blocked_live_agent_trace` or `blocked_missing_credentials` | This is slide 6 step 9 happening live. Read the state off the screen and say which proof was missing. An honest block argues the design better than a smooth answer. |
| **SAP source health red** | Upstream sandbox unavailable | Show `/governance/connectors` — the readiness model reporting a real failure is itself the demo. |
| **SSE stream stalls** | Connection dropped mid-run | Reload `/run`. The deterministic result is unaffected; say so. |
| **Login fails** | Supabase-backed auth down | Backup path. There is no offline login mode. |
| **Page paints stale data** | 24h stale-serve allowance in the read-model cache | Acknowledge as a demo allowance and continue. |

**Backup path** — narrate the same click path over the captured walkthrough:

- `docs/audit/real-evidence-baseline/2026-07-01/screenshots/` — 19 captures, one per route
- `docs/audit/real-evidence-preview/2026-07-02-430565d/` — 2 captures

**These are from 1–2 July 2026 and may lag the live UI.** Open them during pre-flight and
compare. If they have drifted, recapture the Maya and governance routes before the session.

**Keep the same case.** If you fall back, stay on S3 with the same record IDs. Switching
scenario breaks the continuity that makes the demo evidence rather than a tour.

---

## Cut list, in order

1. `/credit/command` — the dark command centre. Photogenic, not structural.
2. `/governance/evals-finops` — state the numbers instead of showing them.
3. The negotiation workbench — go from the score straight to the terms packet.
4. `/forensics` classic surface, if you were going to show it alongside the primary one.

**Never cut:** the approval gate, `/governance/agents`, `/governance/connectors`, or
`/governance/trace`. Those four are the payoff for slides 5 through 11.

---

## After

- The demo is the proof of the map. If someone asks a layer question afterwards, press
  <kbd>L</kbd> and answer against the diagram rather than from memory.
- Anything raised that belongs on the risk register (slide 15) goes there — it is meant to be a
  working document.
