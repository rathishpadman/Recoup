# Cash Application — client demo script

**Runs in:** 12–15 minutes
**Surface:** `/agent-operations`, then the Maya case the run hands off to
**Artifacts:** `assets/remittance-advice-PAY-1001.pdf`, `assets/remittance-PAY-1001.csv`,
`assets/remittance-email-draft.md`

---

## Read this before you present

**The cash is not real, and the demo says so on screen.** Settlement comes from a
rehearsal proxy, not a bank or an ERP. The allocation policy is a set of assumed
values that no owner has ratified, and every amount the interface shows carries a
badge saying exactly that.

That is a feature to demonstrate, not a caveat to rush past. The one thing a
finance audience needs to believe is that the system will not invent money, and
the clearest proof available today is that it refuses to present invented money
as real. If someone says "those numbers look fake" — agree with them. They are,
and the screen is telling the truth.

**Do not claim a straight-through rate or an effectiveness figure.** No live
settlement source exists yet (decision D-02 is open), so any rate quoted today
would be computed from replay data. The specification forbids publishing one and
the audience will be right to challenge it.

---

## Setup (do this before they join)

```bash
export RECOUP_CASH_ROLLOUT_STAGE=shadow
export RECOUP_CASH_REHEARSAL_ENABLED=true
export RECOUP_CASH_DEMO_POLICY_ENABLED=true
export RECOUP_SUPABASE_READ_MODEL_TABLE=nonexistent_table_local_only

npx tsx scripts/cashE2eScenarios.ts seed
npx next build cockpit
RECOUP_API_URL=http://127.0.0.1:4317 npx next start cockpit -p 3947
```

Open `http://127.0.0.1:3947/agent-operations` and leave it on screen.

Have a second terminal ready with the reset command already typed, so you can
clear the demo data in front of them at the end:

```bash
npx tsx scripts/cashE2eScenarios.ts reset
```

---

## Act 1 — The screen before anything happens (2 min)

**Show:** `/agent-operations` with no runs.

**Say:** "This is the operations view. Four counters, the specialists we run, and
the runs themselves. Right now nothing has happened, and I want you to notice
that the screen says so — 'Waiting for a verified remittance email' — rather than
showing an empty grid you have to interpret."

**The point to land:** an operator opening this cold can tell "nothing has
happened yet" apart from "this is broken". Those look identical if the empty
states are careless.

---

## Act 2 — A customer short-pays an invoice (4 min)

**Show:** open `assets/remittance-advice-PAY-1001.pdf` on screen.

**Say:** "Northwind owes us 1,250 dollars on invoice INV-2026-0912. They have
paid us 1,000 and kept 250 back, and they say two pallets arrived damaged. This
is the everyday case — it is not fraud and it is not a mistake, it is a claim we
now have to work."

**Then:** send the email from `assets/remittance-email-draft.md` with both
attachments.

**Say, while it lands:** "The PDF is what a person reads. The CSV is what the
system parses. We never lift a number out of a rendered document with a model —
if a figure is going to move money, it comes from a structured field or it does
not come at all."

---

## Act 3 — The run appears and completes (3 min)

**Show:** refresh `/agent-operations`.

**Expected on screen — these are the values the pipeline actually produces:**

| Where | Value |
|---|---|
| Runs table | one row, agent `cash_application`, status `Completed` |
| Agent roster | Cash Application no longer `Idle`; it carries the run id |
| Applied to invoice | `1000.00` |
| Deduction | `250.00` |
| Unapplied | `0.00` |
| Reconciliation | `balanced` |
| Invoice balance | `1250.00` before, `0.00` after internal allocation |
| Claimed reason | `DMG` → validated `DEP` by rule `RULE-DMG` |
| Policy cited | `demo-allocation-policy-v1-ASSUMED` |

**Say:** "Two identities have to hold before this run is allowed to finish, and
they are enforced in the code rather than checked afterwards. Everything received
is either applied, deducted or explicitly unapplied — nothing evaporates. And the
invoice balance moves by exactly what we applied to it."

**Point at the policy version.** "That `-ASSUMED` suffix is deliberate. Nobody
has signed off on this policy, so every allocation that used it says so, in the
receipt, permanently. When your treasury team ratifies the real one, the runs
that used the assumed values remain distinguishable forever."

---

## Act 4 — The system refuses to guess (4 min)

This is the act that decides whether a finance audience trusts the product. Pick
two, not all four.

**Unmapped reason code** — resend with `claimed_reason_code` set to `ZZZ`.
Run stops at `ReasonReview`. "It has a valid allocation. It knows the money. It
will not put a reason on the claim that nobody approved, so it stops and asks."

**No settlement yet** — remove the seeded receipt for `PAY-1001`.
Run stops at `AwaitingCashReceipt`, no case is created. "We will not allocate
against money we cannot evidence. The rule is that an allocation must cite an
authoritative settled receipt, and if there isn't one, there is no allocation."

**A stale receipt** — the seeded `E2E-SC-06` row is sixty days old and its stored
freshness flag still says `fresh`. The system reports it stale anyway. "The row
claims to be current. We recompute freshness when we read it, because a flag
written yesterday is a statement about yesterday."

**A euro receipt against a dollar invoice** — reported as a contract gap.
"No approved FX policy exists, so it does not convert. Picking a rate here would
be the system deciding what the money is worth."

**The line that matters:** every one of these is a refusal, and every refusal is
visible. Nothing fails silently and nothing guesses forward.

---

## Act 5 — Hand-off and provenance (2 min)

**Show:** the Maya case the completed run created, and the upstream-cash-origin
panel on it.

**Expected:** two warnings on the panel — the cited receipt did not come from an
authoritative source, and the allocation cites an unratified policy. Both are set
by the backend; the screen cannot decide for itself that something is fine.

**Say:** "The case that reaches the analyst carries where it came from. They are
not told 'here is a deduction' — they are told 'here is a deduction, this is the
receipt it rests on, and here is why you should not treat it as final yet.'"

---

## Close, and clean up in front of them

```bash
npx tsx scripts/cashE2eScenarios.ts reset
```

**Say:** "Everything I just showed you is seeded demo data, and it all carries an
`E2E-` prefix. The reset deletes strictly by that prefix, so it cannot touch
anything else in the database. I am running it now rather than telling you I
will."

Then confirm on screen that the runs are gone and the counters are back to zero.

---

## Questions you should expect, and honest answers

**"Is this connected to our SAP?"**
Not yet. The adapter is written and the entity mapping is deliberately an input
rather than a hardcoded guess — that decision (D-02) belongs to your treasury
team, and until they make it the adapter reports a contract gap instead of
picking an entity on their behalf.

**"What is your straight-through rate?"**
We do not have one and I will not quote one. Every run you have seen used replay
data. A rate computed from that would not be an effectiveness claim.

**"How do we know it will not misallocate?"**
Three things, in order of how much they should reassure you. The reconciliation
identities are enforced when the allocation is constructed, so an unbalanced one
cannot be built. The event log is append-only at the database, not by convention
— the runtime role holds no UPDATE or DELETE on it. And no allocation exists
without a cited settled receipt.

**"What happens when something goes wrong in production?"**
Five independent kill switches, each of which beats the rollout stage without a
redeploy. Turning off the operations view stops the display and not the work,
which is deliberate: an incident response that silently halted processing would
be worse than the incident.

**"Can we see it on real data?"**
That needs D-02 for the settlement source and a ratified allocation policy.
Until both exist, showing you real data would mean showing you numbers produced
by assumed rules, which is the thing this design is built to prevent.
