# Cash Application — Human Browser Test Plan

**Target:** Agent Operations workspace and the Maya upstream-cash-origin panel
**Build:** branch `claude/project-instructions-check-g7cuvg`
**Automated coverage already passing:** 2116 unit/integration/invariant tests, 13/13 routed browser checks

This plan covers what a person should check by hand. It deliberately does **not**
repeat what the automated suite already proves; it focuses on judgement calls a
test cannot make — does the screen read correctly, is the warning noticeable, does
an empty state look deliberate rather than broken.

---

## 0. Setup (5 minutes)

```bash
npm ci
export RECOUP_SUPABASE_READ_MODEL_TABLE=nonexistent_table_local_only
npx next build cockpit
npx next start cockpit -p 3947
```

Open `http://127.0.0.1:3947/agent-operations`.

**Why the read-model redirect:** `.env.local` points at production Supabase with a
service-role key. Pointing the read-model table at a name that does not exist makes
every cache load and upsert fail closed, so a local browsing session cannot write to
production. Do not skip it.

**Flags.** All cash flags are **off** by default and the screen is expected to be
empty. Tests 1–4 run with flags off. Tests 5–8 need them on:

```bash
export RECOUP_CASH_REHEARSAL_ENABLED=true
export RECOUP_CASH_DEMO_POLICY_ENABLED=true
```

---

## Part A — Flags off: the screen must look deliberate, not broken

### T-01 · Empty state reads as intentional

1. Open `/agent-operations`.
2. Look at the four tiles, the roster, and the Runs table.

**Pass:** All four counters read `0`. The roster lists Cash Application, Deduction
Forensics, Recovery Drafter and Maya Queue, each `Idle` with a green health dot and
`—` in every metric column. The Runs table shows *"Waiting for a verified remittance
email."* Run details and Event ledger both say *"No run selected."*

**Fail:** Any spinner that never resolves, a blank card with no message, `undefined`,
`NaN`, `null`, or a red error state.

**What this is really testing:** an operator opening this cold must be able to tell
"nothing has happened yet" apart from "the page is broken". Those look identical if
the empty states are careless.

---

### T-02 · No fabricated data

1. With flags off, read every value on the page.

**Pass:** No customer name, no invoice number, no monetary amount, no run ID anywhere.

**Fail:** Any placeholder that looks like real data — a sample customer, a demo
amount, a fake run ID.

**Why it matters:** a screenshot of this page must never be mistakable for real
activity. Placeholder rows are how a demo becomes a false claim.

---

### T-03 · Reload stability

1. Reload the page five times.
2. Navigate away to `/forensics` and back.

**Pass:** Identical every time. No flash of content that then disappears.

**Fail:** Counts that change between loads, or content appearing on one load only.

---

### T-04 · Console is clean

1. Open DevTools → Console. Reload.

**Pass:** No errors originating from the page.

**Known and acceptable — ignore these two:**
- `fonts.googleapis.com` — blocked in sandboxed/offline environments
- `/_vercel/insights/script.js` 404 — only exists on a Vercel deployment

**Fail:** Any React warning, hydration mismatch, or uncaught exception.

---

## Part B — Flags on: rehearsal data must announce itself

Restart the server with both cash flags set, then re-open the page.

### T-05 · The rehearsal warning is impossible to miss

1. Navigate to a Maya case carrying an upstream cash origin.
2. Find the `Upstream cash origin` panel.

**Pass:** A destructive-styled alert reading **"Rehearsal data — not live cash"**,
positioned *above* the amount, visible without scrolling or expanding anything.

**Fail:** The warning is below the fold, collapsed, greyed out, or subtle enough that
your eye goes to the amount first.

**This is the single most important check in this plan.** Everything else is
correctness; this one is about whether a reviewer can be misled. Judge it as a
stranger would: glance at the panel for two seconds, then look away. Did you register
that the money is not real?

---

### T-06 · The assumed-policy warning is present

**Pass:** A second alert reading **"Unratified allocation policy"**, and the policy
version rendered somewhere visible ends in `-ASSUMED`.

**Fail:** The amount is shown with no indication the allocation policy is unratified.

**Context:** fifteen allocation-policy values are implementer assumptions, not owner
decisions. They are registered in
`docs/evidence/2026-08-22-cash-application-phase-0-evidence-record.md`. This badge is
the only thing standing between "a demo figure" and "a number someone quotes".

---

### T-07 · Money is backend-formatted

1. Read the short-payment amount and currency.

**Pass:** Exactly two decimal places, currency code beside it, e.g. `250.00 USD`.

**Fail:** `250`, `250.0`, `$250`, `250.000`, or a locale-formatted variant.

**Why:** the cockpit performs no arithmetic and no formatting — it renders the string
the backend produced. A differently-formatted number means something is reformatting
money in the browser, which the design forbids.

---

### T-08 · Run selection drives both panels

1. Click a row in the Runs table.

**Pass:** Run details populates with the run ID and status; Event ledger fills with
that run's events **in chronological order**. Clicking a second run replaces both.

**Fail:** Events from two runs mixed, events out of order, or a panel that stays on
"No run selected."

---

## Part C — Accessibility and responsive (10 minutes)

### T-09 · Keyboard only

1. Put the mouse away. `Tab` through the page.

**Pass:** Every interactive row is reachable, focus is always visible, `Enter`
selects a run.

**Fail:** A focus trap, an invisible focus ring, or a row reachable only by mouse.

### T-10 · Narrow viewport

1. Resize to 375px wide.

**Pass:** Tables scroll horizontally *inside their own container*. The page body never
scrolls sideways. The rehearsal warning stays legible and above the amount.

**Fail:** The whole page scrolls sideways, or the warning is pushed off-screen.

### T-11 · Colour is not the only signal

1. Enable a greyscale filter (DevTools → Rendering → Emulate vision deficiencies →
   Achromatopsia).

**Pass:** Blocked runs are still distinguishable from healthy ones by text or icon,
not only by red. Health dots still carry meaning.

**Fail:** Status is conveyed by colour alone.

---

## Part D — What you cannot test, and why

Recording these so nobody signs off on something that was never exercised.

| Not testable | Reason |
|---|---|
| Real cash settlement | No live settlement source exists. D-02 is open: SAP returned HTTP 401 and the Supabase proxy holds invoice entities only. The SAP adapter returns `contract_gap` by design rather than guessing an entity. |
| AC-01 end to end from a real mailbox | Needs a ratified provider (D-03) and the private scanner (D-04). |
| Straight-through effectiveness (AC-19) | A rate computed from replay data is not an effectiveness claim, and §17.6 forbids publishing one. |
| Visual-gate score ≥4/5 | No approved ImageGen cues supplied. The gate is recorded as **not scored** rather than passed. |
| Production behaviour | Nothing is deployed. Rollout stage defaults to `disabled`. |

**If a tester reports "the cash amounts look fake" — that is a pass, not a bug.**
They are fake, and the UI is supposed to say so.

---

## Part E — Seeded scenarios, and how to remove them afterwards

`scripts/cashE2eScenarios.ts` seeds ten fixtures. They are real rows in the real
`recoup_cash_receipts` table, not mocks — the pipeline reads them the same way it
would read anything else, which is the point: a fixture the code can tell apart
from production data proves nothing.

Each one exercises a different branch. Repeating the happy path with different
numbers would give ten green checks and one tested path.

| ID | Scenario | What a tester should see |
|---|---|---|
| `E2E-SC-01` | Happy path short payment | Run reaches `Ready`, a live case is created, short payment 250.00 USD |
| `E2E-SC-02` | Full payment, nothing deducted | Run reaches `Ready`, short payment 0.00, no deduction to investigate |
| `E2E-SC-03` | Duplicate delivery of the same remittance | Second run reuses the same run id and case id; exactly one case exists |
| `E2E-SC-04` | No receipt has arrived yet | Run halts at `AwaitingCashReceipt`, no case created, one resume scheduled |
| `E2E-SC-05` | Receipt exists but is not settled | Lookup reports `pending`, run does not allocate, no case created |
| `E2E-SC-06` | Settled receipt older than the freshness window | Lookup reports `stale` despite the row claiming fresh; no allocation |
| `E2E-SC-07` | Reversed receipt | Lookup reports `pending` rather than settled; no allocation |
| `E2E-SC-08` | Cross-currency receipt (EUR) | Contract gap: no approved FX policy, the amount is never converted |
| `E2E-SC-09` | Unmapped claimed reason code | Run halts at `ReasonReview`, allocation exists, no case created |
| `E2E-SC-10` | Large multi-line remittance | Allocation covers every line; reconciliation identities balanced |

`E2E-SC-04` deliberately has **no receipt row**. The absence is the fixture. If a
run against it produces an allocation, SA-CA-01 has been broken and that is a
stop-everything finding, not a bug report.

### Running them

```bash
npx tsx scripts/cashE2eScenarios.ts verify   # prints the ten and their expectations
npx tsx scripts/cashE2eScenarios.ts seed     # inserts the nine receipt rows
npx tsx scripts/cashE2eScenarios.ts reset    # removes them again
```

### Why reset is safe to run against production

Every row the seed writes carries the `E2E-` prefix in its primary key, and reset
deletes strictly by that prefix across twelve tables in child-first order. Reset
cannot remove a row the seed did not create — that is the whole safety design, not
a convention someone is expected to remember.

This was verified against the live database rather than assumed. Before reset:
nine `E2E-` receipts and four `REHEARSAL-` receipts. After reset: `e2e_rows: 0`,
`rehearsal_rows: 4`. The four rehearsal rows that the reset had every opportunity
to remove were still there.

Re-seeding restored `e2e_seeded: 9, rehearsal_intact: 4`, so the cycle is
repeatable — a tester can seed, break things, reset and start again without
coordinating with anyone.

**Reset when the session ends.** These rows are visible to anything reading the
cash tables, and a stale `E2E-` row surviving into a later demo would be indistin-
guishable from real data to someone who was not in the room.

---

## Reporting

For each test record: ID, pass/fail, browser + version, and a screenshot for any
failure.

**Escalate immediately, ahead of anything else, if:**
- The rehearsal warning is missing, subtle, or below the fold (T-05)
- Any amount renders without the assumed-policy badge (T-06)
- Any customer or monetary data appears with flags off (T-02)

Those three are the difference between an honest demo and a misleading one. Ordinary
layout bugs can wait.

---

## Appendix — testids for automated follow-up

```
agent-operations-page              agent-operations-workspace
agent-operations-status-tiles      agent-operations-tile-{active,queued,waiting,needsAttention}
agent-operations-count-{active,queued,waiting,needsAttention}
agent-operations-roster            agent-roster-row-{cash-application,deduction-forensics,...}
agent-roster-health-healthy        agent-roster-current-action
agent-operations-run-table         agent-operations-empty
agent-operations-run-detail        run-detail-{run-id,status,blocker}
agent-operations-activity-ledger   activity-ledger-empty
maya-upstream-cash-origin          upstream-cash-rehearsal-warning
upstream-cash-assumed-policy-warning
upstream-cash-{case-id,short-payment,validated-reason,provenance,cited-records}
```

Existing automated runs:

```bash
npx tsx tests/e2e/agent-operations-routed-e2e.ts   # 13 checks, booted server
npx tsx tests/e2e/agent-operations-live-e2e.ts     # 13 checks, rendered markup
npm run test                                        # 2116 tests
```
