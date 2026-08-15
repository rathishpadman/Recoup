# Handoff — Workstream B, plus two open UI findings

Written 2026-08-15. Pick this up cold: every file path and line reference below was verified
against `main` at the time of writing.

## Status — all three delivered on `claude/workstream-b-implementation-8ecd2d`

| Item | Commit | Notes |
|---|---|---|
| Finding 1 — vector evidence line grouping | `9e4f06a` | `evidenceDocumentView` now derives `lineId` from the `VECTOR-EVIDENCE-<lineId>` documentId |
| Workstream B — credit actions on Recovery | `d522979` | Derivation shared by the read model and the approval resolver via `src/services/creditRecommendation.ts` |
| Finding 2 — trace process-map prose | `d57f372` | Per-node citation scoping plus one explanation per kind |

The three defaults were answered by the requester: **downgrade one band** (capped at HIGH) with the
recommendation dated from the credit snapshot's `asOfDate`; **every Recovery case**, no amount
threshold; **account-level terms**, tightened one rung down the governed ladder `60/45/30/15`
(floor Net 15) — that ladder is expert-owned and was supplied by the requester, and it lives beside
`verdictByRank` in `creditRiskModel.ts` so the governed config hash is untouched.

Verified against the real backend: all four manifest lines (`S1-L1`, `S3-L1`, `S6-L1`, `S8-L1`)
carry `lineId` on their vector document; `S5-L1` yields `WATCH -> ELEVATED` and `Net 45 -> Net 30`
both `pending_human`; `S1-L1` yields none; `S3-L1` holds at `HIGH`. Full suite green (174 files,
1603 tests) with no contract assertion edited.

**Still open — pre-existing, not from this work:** `npm run test:e2e:maya-real` fails at the first
work item because `assertCanonicalEvidenceMetadata` applies canonical receipt assertions to every
document in the pack, including vector-store hits that have no `EVD-` id or `RECON-` receipt:
`Maya detail S1-L1 evidence document VECTOR-EVIDENCE-S1-L1 omitted canonical evidenceId.` This
reproduces on `eeca343` (main) with the changes absent.

**Deploy:** Workstream B and Finding 1 both change read-model/evidence-pack shape, so the
`recoup_cockpit_read_models` purge below is required. Finding 2 is presentation-only.

Standing instructions from the requester: **goal-based, TDD (failing test first, red/green
proof on every one), surgical changes, full regression plus browser/E2E verification, and no
silent rewriting of contract assertions.**

---

## Workstream B — credit actions on Recovery, and the David handoff

### Goal
When Maya's case routes to Recovery, she sees two concrete credit recommendations; approving
them puts a governed signal in front of David.

### This is connect-existing, not build-new

| Piece | Location |
|---|---|
| Attachment point for the recommendations | `buildForensicsWorkItemDetailCockpitModel` — `src/services/cockpitModel.ts:911` |
| Recovery discriminator | `decision.routing === "recovery"` — `src/services/cockpitModel.ts:687` |
| Risk band the downgrade moves | `verdictByRank` = `CLEAR \| WATCH \| ELEVATED \| HIGH` — `src/services/creditRiskModel.ts:420` |
| Signal shape for David's inbox | `CreditSignalModel` — `src/services/creditRiskModel.ts:245` |
| Signal builder | `buildSignals(deductions, deductionLines, contractTpm)` — `src/services/creditRiskModel.ts:998` |
| Terms action already awaiting David | `run.termsAction` → "Stage revised terms" — `src/services/cockpitModel.ts:1204` |
| Maya's recommendation builder | `buildOutcomeActionPackages` — `cockpit/components/maya/maya-workspace-derived.ts:605` |
| David's inbound panel | `DavidSignalsIn` renders `account.signals` — `cockpit/components/david/david-signals-in.tsx:10` |

No new tables. No new approval mechanism. David already has an approval inbox and a
"Signals in" surface.

### Success criteria
1. Recovery case → exactly two advisory recommendations: band downgrade and terms change
2. Billing / valid case → zero credit recommendations
3. Both `pending_human`; nothing mutates the credit account model directly
4. Maya approval → entry in `account.signals` carrying case, amount, basis, cited record IDs
5. Non-Recovery paths byte-identical to today

### TDD sequence

| # | Failing test first | Then implement |
|---|---|---|
| 1 | `tests/unit/cockpit.test.ts` — Recovery decision yields 2 credit recommendations; Billing yields 0 | derivation in `cockpitModel.ts` |
| 2 | `tests/unit/cockpit.test.ts` — recommendations are advisory; credit account model unchanged | assert immutability |
| 3 | `tests/unit/cockpit.test.ts` — downgrade is exactly one band via `verdictByRank`, never skips to `HIGH` | band step helper |
| 4 | `tests/unit/credit-risk-model.test.ts` — approved recommendation appears in `account.signals` with basis + recordIds | extend `buildSignals` input |
| 5 | `tests/unit/maya-workspace-derived.test.ts` — card renders label, current→proposed, gate state | derived card helper |

Red/green proof on each: stash the implementation, confirm the test fails, restore.

### E2E
Extend `tests/e2e/maya-real-backend-e2e.ts`: open a Recovery case (S3/S5/S6), assert both
recommendation cards present and `pending_human`; open a Billing case, assert absent. Then
assert the signal lands in `david-signals-in` after approval.

Browser regression via the isolated stack — see "Local verification harness" below.

### Surgical boundary
Do **not** touch: `holdAction` / `termsAction` behaviour, David's verdict computation, decision
routing, the approval write path, or the existing deduction-derived signals in `buildSignals`.
Additive only.

### Three defaults in force — confirm or override before starting
- **Downgrade size:** one band (`WATCH → ELEVATED`), not straight to `HIGH`
- **Trigger:** every Recovery case, no amount threshold
- **Terms scope:** the customer account, since terms are account-level in the model

---

## Open finding 1 — vector-store evidence groups outside its line

**Observed:** on a Crestline case the dossier shows `S3-L1 … S3-L4` (2 documents each) and then
a separate **Case-wide evidence** group holding the OpenAI vector-store document.

**Why:** `groupEvidenceFactCardsByLine`
(`cockpit/components/maya/maya-workspace-derived.ts`) groups on `card.lineId`, and `lineId` is
populated only for canonical documents by `evidenceDocumentLineId` in
`src/services/cockpitModel.ts`. Vector documents never get one, so they fall into the trailing
case-wide group.

**Why that is probably wrong:** vector documents are line-bound after all. `mapSearchResults`
enforces `result.attributes.record_id === line.lineId` and mints
`documentId = VECTOR-EVIDENCE-<lineId>` (`src/adapters/openAiVectorStore.ts:117`). The line is
right there in the identifier.

**Fix:** derive `lineId` for vector documents from the `VECTOR-EVIDENCE-<lineId>` documentId so
they group under their own line. Keep the case-wide group as a fallback for anything genuinely
unscoped. Test first: a vector document for `S3-L1` groups under `S3-L1`, not case-wide.

---

## Open finding 2 — trace process-map cards repeat near-identical prose

**Observed:** with ~20 process nodes, most cards read identically — *"Evidence reasoning step
completed. / Maya evaluated the evidence step and kept the supporting record in Trace details. /
46 evidence links"* — differing only in the step number and kind chip.

**Where:** the compact process map, `cockpit/components/maya/agent-trace-panel.tsx` around
`data-testid="maya-agent-process-map"`. The repeated sentences come from
`formatPrimaryProcessNodeCaption` and `formatPrimaryProcessNodeMessage`, which return generic
per-kind copy. This is **not** the detail block thinned in PR #19.

**Note:** the `46 evidence links` badge repeats the whole-answer citation count on every card,
so it reads as if each step had 46 links of its own.

**Options, roughly in order of payoff:**
1. **Collapse runs of the same kind** — nine consecutive `Retrieve` nodes become one row reading
   `Retrieve ×9`, expandable. Biggest reduction, keeps every step reachable.
2. **Drop the generic sentence** — show only what differs per node (kind, label, its own record
   count). The boilerplate carries no information once you have read it once.
3. **Per-node counts, not the global one** — show that node's own evidence count, or omit the
   badge where it equals the answer-wide total.
4. **List, not cards** — a dense ordered list instead of a 5-column card grid.

Recommendation: 2 + 3 first (small, no layout change), then 1 if it is still long.

**Test plan — write these before touching the panel:**

| # | Failing test first | Then implement |
|---|---|---|
| 1 | `tests/unit/maya-workspace-derived.test.ts` — a node caption/message helper returns text that differs between two nodes of the same kind, or returns nothing | move the generic copy out of the per-node render |
| 2 | same file — the per-node evidence count reflects that node's own records, not the answer-wide citation total | pass the node's own count |
| 3 | same file — consecutive nodes of one kind collapse to a single grouped entry carrying the run length (only if option 1 is taken) | grouping helper |
| 4 | `tests/invariants/maya-shadcn-qa-contract.test.ts` — the compact map renders no two nodes with identical body text | assert after the change |

Then: full suite green **without editing any of the contract assertions listed below**, plus a
browser run measuring rendered card count and confirming zero console errors. If a contract
assertion genuinely must change, change one at a time and state in the PR why that specific
guarantee no longer applies.

**Contract caution — PR #19 hit this.** These assertions constrain the trace panel and must each
be re-derived deliberately, never bulk-edited:
- `tests/invariants/maya-shadcn-boundary.test.ts:438` — `formatTraceTransportLabel` must exist
- `tests/invariants/maya-shadcn-qa-contract.test.ts:988` — source-trust/transport formatters must
  **not** appear on the compact map
- `tests/invariants/maya-shadcn-qa-contract.test.ts:2463` — `formatTraceRetrievalSourceLabel`
  must be a findable function definition
- `tests/invariants/maya-shadcn-qa-contract.test.ts:2517` / `:2527` — compact label avoids raw
  backend fields; raw summary text stays behind Trace details
- `cockpit-no-business-logic.test.ts:296` and `maya-shadcn-boundary.test.ts:455` — the string
  `"No record IDs"` must be present in the panel

---

## Local verification harness

Scripts used throughout this work live in the session scratchpad and are **not** in the repo.
Recreate as needed:

- **Isolated stack** — start the API with `createCockpitApi` (never `startCockpitApiRuntime`,
  which starts the source-health poller and writes to production) plus `next dev cockpit`. Set
  `RECOUP_SUPABASE_READ_MODEL_TABLE` to a table name that does not exist so every read-model
  load and upsert fails closed and nothing is written to Supabase.
- **Browser session** — mint the Maya demo cookie in-process with `signDemoSession` from
  `cockpit/app/demo-auth.ts`, exactly as `tests/e2e/maya-real-backend-e2e.ts` does. Do not type
  into the login form.
- **Route note** — the shadcn workbench is `/forensics/shadcn`; the landing route is Overview, so
  click `maya-header-work-items-link` before opening a case.

## Deploy checklist

After any merge that changes the **evidence-pack or read-model shape** (Workstream B likely
does; presentation-only changes do not):

```sql
delete from recoup_cockpit_read_models
where model_key like 'maya:forensics:work-item:%:v3' or model_key = 'maya:forensics:v1';
```

Then re-verify all 8 work items: documents carry `lineId`, vector documents present on the four
manifest lines (`S1-L1`, `S3-L1`, `S6-L1`, `S8-L1`), and `cache=hit` on a second request.

**PostgREST returns 403 on DELETE for this table.** Use the Supabase MCP `execute_sql`, not the
REST API. This purge was missed once after PR #16 and left grouping broken on cached cases.
