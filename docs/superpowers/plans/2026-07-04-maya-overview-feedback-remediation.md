# Maya Overview — Feedback Verification & Remediation Plan (2026-07-04)

**How this was produced:** Live browser test of the running app (cockpit dev on `:3001`, real API on `:4318`, logged in as Maya) compared against the reference `docs/Recoup_Maya_Journey (1).html`, plus a code/data-flow deep dive. Each item below states what was confirmed, the root cause with file references, and the recommended fix.

**Scope note:** Items 5 and 7 require backend contract changes that the 2026-07-03 rework plan explicitly froze. They are called out as **needs approval** rather than silently folded into UI work.

---

## 1. "decision proof" / "data proof" chips — REMOVE from business header

**Confirmed.** Both chips render at the top of every Maya screen.

- **What they are:** truncated SHA hashes proving data provenance — `data proof` = source snapshot hash, `decision proof` = decision receipt hash, from `businessFreshness.sourceHash` / `receiptHash`.
- **Where:** `cockpit/components/maya/maya-forensics-surface.tsx` lines ~1283–1311 (two render sites).
- **Why they exist:** governance/audit proof. Useful to auditors, meaningless to Maya — exactly the "developer-facing microcopy" the rework plan said to remove from Maya screens.

**Fix**
1. Remove both `Badge`s from the Maya header render paths.
2. Preserve auditability: move the full hashes into an existing disclosure (e.g. the freshness line's `title` tooltip, or the Source details drawer). Do not delete them from governance/audit pages.
3. Update `tests/invariants/maya-shadcn-qa-contract.test.ts` and any e2e assertions on `forensics-source-hash` / `forensics-receipt-hash` to expect them in the disclosure location instead of the header.

**Effort:** Small. **Risk:** Low (test updates only).

---

## 2. Recoup Copilot launcher → floating bottom-right

**Confirmed.** The launcher renders in the page header (top), via `headerAction={<RecoupAgentLauncher …/>}` at `maya-forensics-surface.tsx:1222/1250` and inline at `:1171`. The wrapper class `maya-recoup-agent-float` exists but is not fixed-positioned.

**Fix**
1. In `cockpit/app/styles.css`, make `.maya-recoup-agent-float` a true FAB: `position: fixed; right: 24px; bottom: 24px; z-index: 40;` with a shadow; keep the pill shape.
2. Render the launcher once at the shell level (inside `MayaWorkspaceShell` children) instead of three `headerAction` sites, so it floats on Overview, Worklist, and case detail consistently.
3. Hide the FAB while the dock Sheet is open (it opens from the right and would overlap): condition on the existing dock-open state.
4. Keep `data-testid="recoup-agent-launcher"` and the aria-label; update `tests/e2e/cockpit-premium-e2e.ts` viewport checks if they assert header placement.

**Effort:** Small. **Risk:** Low. Mobile: verify the FAB does not cover the last worklist row (add `padding-bottom` to main content).

---

## 3. KPI summary cards — visual upgrade (icons, typography, verdict-coloured amounts)

**Confirmed.** Current cards are flat: muted 14px label, plain `text-2xl` count, **amount in default foreground colour** for all four cards; the only signal is a 3px left border (`overviewCardAccentClass`, `maya-forensics-surface.tsx:350`). The reference HTML uses icon chips, larger numerals, and verdict-tinted values.

**Fix** (all in `maya-forensics-surface.tsx` card render, ~lines 697–717; keep shadcn `Card` + `mayaAccent` teal set, no purple/indigo):
1. **Icon chip per card** (lucide, already in the dep tree): Deduction cases → `Inbox`/`FolderSearch` (neutral); Valid → Billing → `CheckCircle2` (green); Invalid → Recovery → `XCircle` (red); Partial → Split → `SplitSquareHorizontal`/`CircleDollarSign` (amber). Render as a 36px rounded-md tile with the matching `-surface`/`-border` status token background, top-left of the card.
2. **Typography hierarchy:** label `text-xs font-medium uppercase tracking-wide text-muted-foreground`; count `text-3xl font-semibold tabular-nums`; amount `text-base font-semibold tabular-nums` **coloured by bucket** — `text-success` (valid), `text-[color:var(--status-danger-text)]` (invalid), `text-[color:var(--status-warning-text)]` (partial), default for the total card. The colour tokens already exist (`sourcePillClass` uses them).
3. **Support line** stays `text-xs text-muted-foreground`.
4. **Optional polish** (matches KPI dashboard best practice): share-of-run percentage under the amount (e.g. "57% of run value") — derivable from existing amounts, no new data; subtle `hover:shadow-sm transition-shadow`.
5. Extend `buildOverviewSummaryCards` card model with an `icon` key only if you keep icon selection in the component; otherwise keep the helper pure (recommended: map accent → icon in the component, no helper change).
6. Update the card-content assertions in `tests/e2e/maya-real-backend-e2e.ts` (`assertRenderedOverviewSummaryCardsMatchBackend`) only if label text changes — icons/colours don't break it.

**Effort:** Small–medium. **Risk:** Low.

---

## 4. Worklist verdict pills → "Valid / Invalid / Partial" + quick filters

**Confirmed.** Overview case rows show backend `verdictLabel` strings ("Valid deduction", "Recovery"); there is no verdict quick filter — only the free-text input (`maya-overview-case-concentration-filter`).

**Fix** (UI-only; no model change — `normalizeMayaVerdict` already buckets the raw verdicts):
1. **Pill label mapping** in the row render: bucket `valid` → "Valid", `invalid` → "Invalid", `partial` → "Partial"; keep the original `verdictLabel` in a `title` tooltip so the precise routing language isn't lost. Apply the same in `deduction-worklist-table.tsx` rows/cards/rail.
2. **Quick filter chips** above the list: `All (8) · Valid (3) · Invalid (4) · Partial (1)` with counts from the same bucketing; wire into the existing filter/sort state (`overviewCaseFilter` sits alongside a new `overviewVerdictFilter`); chips use the verdict status tokens (green/red/amber outline when active).
3. Add `data-testid="maya-overview-verdict-filter"` and cover in e2e: clicking "Invalid" shows only invalid rows and the "Showing n of 8" line updates.

**Effort:** Small–medium. **Risk:** Low.

---

## 5. Richer, prod-scale agent reasons — deep dive result

**Confirmed, and here is exactly how reasoning works today:**

1. **Source rows** live in Supabase synthetic source tables (one per connector; `src/adapters/supabaseSyntheticSource.ts`). The worklist's current one-liner ("Damaged product, evidence received") is the **scenario label** carried on the source claim row — it is a data field, not agent output.
2. **Reconciliation engine** derives a *receipt* per line from claims + evidence records (`buildCurrentRuleInput` → `receipt.derivedRuleInput`, `src/agents/forensics.ts:484`). No receipt derivable → hard fail ("Reconciliation receipt required for <lineId>").
3. **Deterministic rules** — exactly 8 modules in `src/core/rules/` (`damageEvidenceValid`, `promoNotCaptured`, `shortagePodMismatch`, `otifFineValid`, `otifTimestampMismatch`, `pricingBelowContract`, `promoOverclaim`, `duplicateCredit`). Each has a **single hard-coded one-sentence `basis`**, e.g. `"POD shows full signed delivery for the claimed shortage."` That sentence is what the UI shows as the reason everywhere (worklist why-line, deterministic basis band, email draft, copilot answer basis).
4. The reference HTML's richer copy (e.g. *"Crestline claimed shortages across four lines. The signed proof of delivery shows the full ordered quantity was received, with no over-short-and-damaged exception."*) is the same fact **parameterised with case data** — customer, line count, quantities, exception status.

**Recommended prod-scale design — LLM-generated reason narrative over a deterministic fact anchor** *(revised 2026-07-04 after review discussion; supersedes the earlier template-only proposal)*:

The key insight: the platform invariant is "no invented business **values**", not "no generated **prose**". Those separate cleanly into two tiers, which lets the LLM do what it's good at without touching what auditors hash.

**Tier 0 — deterministic audit anchor (unchanged).** The rule engine still decides verdict, routing, delta amount, and cited record IDs. These, plus a **Zod-typed fact packet**, are what gets hashed into the receipt. The fact packet is the rule's real inputs made explicit, e.g. for shortage:

```ts
const ShortageFactPacket = z.object({
  customer: z.string(), lineIds: z.array(z.string()).min(1),
  claimedAmount: z.string(), orderedQty: z.number(), receivedQty: z.number(),
  podDocId: z.string(), osdExceptionPresent: z.boolean(),
  verdict: z.enum(["valid", "invalid", "partial"]), routing: z.string(),
  citedRecordIds: z.array(z.string()).min(1)
}).strict();
```

**Tier 1 — LLM reason writer, runs in the overnight investigation.** Add a "Reason Writer" step to `runForensicsInvestigation` (the same OpenAI Agents SDK path the query session already uses, with the same `runBudget.recordTokenUsage`/retry hooks). Per decided line:
- **Input:** the validated fact packet JSON — nothing else from the source system, so the model cannot see values it isn't allowed to use.
- **Output:** structured and Zod-parsed — `{ narrative: string, citedRecordIds: string[] }` via the SDK's structured-output support (Zod here plays exactly the Pydantic role).
- **Groundedness gate (the part that keeps auditors happy):** deterministic post-validation — every number, quantity, amount, date, and document ID extracted from the narrative must exist in the fact packet; `citedRecordIds ⊆ packet.citedRecordIds`; verdict wording must agree with the decided verdict. Fail → one retry with the violation named → then fall to Tier 2.
- This is generated **once per line per run** (8 lines today — negligible cost/latency), not on the read path.

**Tier 2 — deterministic fallback, fail-safe not fail-closed.** Keep a parameterised template per rule as the fallback when the LLM is unreachable, over budget, or fails the groundedness gate. The verdict pipeline must never block on narrative generation. Tag which tier produced the text.

**Persistence — this is the "supa table" change:** on the reconciliation receipt / decision record (not the raw source table — reasons are outputs, not inputs) add:
`reason_narrative text`, `reason_source ('llm' | 'deterministic_fallback')`, `reason_model text`, `reason_fact_hash text`, `reason_generated_at timestamptz`.
The audit hash continues to cover the fact packet + verdict; the narrative carries its own provenance columns alongside. Worklist why-line (truncated), case detail band, email drafts, and copilot answers all read the **same stored narrative**, so every surface tells one story.

**Why not free-form LLM at read time:** regenerating per page-load gives different words on worklist vs email vs copilot for the same case, costs tokens on every read, and leaves nothing stable to audit. Generate once in the run, validate, persist — that *is* using the LLM at full capacity, at the right point in the lifecycle (the same "agents worked last night" positioning the Overview copy already sells).

**Tests/evals:**
- Unit: fact-packet Zod schemas reject missing fields; groundedness gate catches a narrative with an uncited amount/doc-id; fallback path produces the template sentence and tags `deterministic_fallback`.
- Eval (plug into the existing `evals/` release-readiness harness): groundedness score across the seeded scenarios — zero tolerance for numbers/docs outside the packet; verdict-agreement check.
- E2E: worklist reason equals the persisted `reason_narrative` for the line; kill the LLM key and assert the run still completes with fallback reasons.

**Effort:** Medium–large (fact packets for 8 rules + agent step + gate + receipt columns + evals). **Risk:** Medium — touches decision receipts and adds an LLM dependency to the overnight run, mitigated by Tier 2. **Needs approval:** yes — backend/receipt change, new investigation-phase LLM call, and a Supabase schema migration.

---

## 6. "Only 5 line items visible" + will new Supabase rows appear?

**Visibility — not a bug, but fixable UX.** All 8 rows render (verified in DOM: `rowCount: 8`, no max-height, page `scrollHeight` 1055 vs 900 viewport). Rows 6–8 are simply below the fold and the hero + cards push the list down.

**Fix:** make the case list own its scroll: `max-height` (e.g. `calc(100vh - <hero height>)`) with `overflow-y: auto`, sticky sort header, and a visible row-count affordance ("Showing 8 — scroll for more"). Alternatively compact the hero (cards to 2 rows on short viewports). Small effort.

**New backend rows — partially yes, with a hard precondition.** Adding rows to the Supabase settlement source table alone will **not** produce a new reasoned case: the pipeline requires, per line, (a) a claim row, (b) matching evidence records (POD / invoice / TPM / contract / remittance as the rule needs), and (c) a derivable reconciliation receipt. A line without these **throws** (`Reconciliation receipt required for S9-L1`) — fail-closed by design, but today that error is not a friendly UI state.

**Fix**
1. Document + script the seeding path: `npm run materialize:real-evidence` (see `scripts/materializeRealEvidenceDataset.ts`) is the supported way to add a scenario with its full evidence set; add an "S9" example to the docs.
2. Add a graceful degraded state: catch the missing-receipt case per line and surface it as a "Needs evidence — cannot verdict" row (grey pill, excluded from the four KPI buckets, counted separately) instead of failing the whole run. This also satisfies the plan's "unknown verdicts fail closed with explicit unavailable state" rule.
3. Verification test: seed one new line with full evidence in a staging Supabase, hit `POST /forensics/refresh`, assert it appears with a rule-derived reason; seed one without evidence, assert the degraded row.

**Effort:** Small (docs) + medium (degraded state). **Risk:** Low–medium.

---

## 7. Copilot from Overview should be workspace-level — wiring verified

**Confirmed as case-bound today.** Clicking the launcher on Overview auto-picks the default worklist item, **navigates into that case**, and opens the dock pinned to its evidence packet (observed live: Overview → S3-L1 case detail, dock header "Selected evidence packet · Client-selected case context S3-L1"). Root cause: `handleLaunchRecoupAgent` (`maya-forensics-surface.tsx:572`) always resolves a line and calls `openInvestigationForItem`; the backend contract **requires** it — `forensicsQueryRequestSchema` (`src/services/cockpitApi.ts:206`) mandates `selectedLineId` and `recordIds`.

**Backend wiring status (all verified live):**
- **LLM:** connected — `runForensicsQuerySessionWithLiveAgents` runs OpenAI Agents SDK live agents (agent start/tool/handoff/end hooks observed in the live trace; Forensics Investigator → Recovery Drafter handoff).
- **Memory:** connected — `loadMayaForensicsQueryRecallContext` recalls Supabase-backed query memory per line, and answers persist scope memory back.
- **MCP gateway:** in the path — `query.answer` executes as a governed MCP tool (mcpTrace rows present); Maya's agent allow-list is `audit.read` + `query.answer`.

**Fix (two layers):**
1. **UI (no contract change):** stop navigating away. Open the dock in place on Overview; idle state offers the suggested investigations and a case picker. This is straightforward but every question still needs a case selected before "Run query" — the schema demands it.
2. **Backend (needs approval — contract change):** add a governed *workspace scope* to `POST /forensics/query`: accept `scope: "workspace"` (or `selectedLineId` optional) where the server itself expands `recordIds` to the settlement-run aggregate record set and memory recall keys off the run, not a line. Keep citations mandatory and the same auth/rate limits. This is the real "normal copilot" behaviour: "which cases should I start with?", "total invalid exposure?" answered across the run.
3. Wire `buildCopilotSuggestions(model.worklist)` into the dock's idle state — the helper exists and is unit-tested but the dock currently only renders backend `promptSuggestions` (**gap found during this review**).
4. Remove the "Client-selected case context" dev-facing caption from the dock (`query-evidence-dock.tsx`) — flagged for removal in the rework plan but still visible.

**Effort:** UI small; backend medium. **Risk:** Backend change touches a frozen contract — get explicit sign-off first.

---

## 8. Rename source tile "MCP" → "MCP Gateway"

**Confirmed.** The label originates in the backend read-model: `src/services/cockpitModel.ts` lines 2729, 2762, 2787, 2820 (`label: "MCP"`).

**Fix:** change the label at those four sites (it is display copy, not a contract shape). Update the matching assertions: `tests/unit/cockpit.test.ts` (~1348, 1354, 1386, 1565), `tests/unit/cockpit-api.test.ts` (~5455). The e2e check `text.includes("MCP")` in `cockpit-premium-e2e.ts:3927` still passes. Check governance/connectors pages render the longer label without truncation.

**Effort:** Trivial. **Risk:** Low.

---

## Additional findings from this review (not in your list)

| # | Finding | Recommendation |
|---|---|---|
| A | **"Run date unavailable" chip** in the header (`maya-run-date-contract-gap`) is dev-facing gap language on a business screen | Hide when unavailable, or reword ("Last run —") behind the freshness disclosure |
| B | **SAP OData tile is blocked** (probe failed) → pill correctly red at 6/7, but for demos you'll want 7/7 green | Fix the SAP OData probe env/credentials; keep the red-state UI test separate |
| C | `buildCopilotSuggestions` helper is **built and tested but never rendered** (dock uses backend `promptSuggestions` only) | Wire it as the idle-state fallback (see item 7.3) |
| D | Case badge shows `S1` at ≥1440px but `S1-L1` in some captures — cosmetic inconsistency | Standardise on the work-item id form used in the reference |

---

## Suggested execution order

| Order | Items | Why first |
|---|---|---|
| 1 | 1, 8, A (copy/chip cleanup) | Trivial, high visual payoff, no contract risk |
| 2 | 3, 4, 2 (cards, pills+filters, FAB) | Pure UI, transforms the "blunt dashboard" complaint |
| 3 | 6-UI (list scroll) + C (suggestions wiring) | Small UX wins |
| 4 | 7-UI (dock opens in place) | Copilot feel without contract change |
| 5 | **Approval gate** → 5 (LLM reason writer + receipt columns), 7-backend (workspace query scope), 6-backend (degraded no-receipt state) | Backend/contract changes; need explicit sign-off per the rework plan's hard constraints |

All UI items must keep: shadcn + `mayaAccent` teal tokens, no invented business values, citations/disclosures preserved, and existing `data-testid` hooks (or updated tests in the same change).
