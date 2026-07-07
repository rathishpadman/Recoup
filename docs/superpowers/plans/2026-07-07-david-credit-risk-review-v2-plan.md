# David Credit Risk Review v2 — Implementation Plan (Maya cold-start fix first, then David)

> **For agentic workers / Codex:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **Every task is implemented by an implementer subagent and then checked by a reviewer subagent before commit — see "Codex Execution Protocol" below. Do not skip the reviewer stage.**

**Goal:** (1) First remediate the Maya `/forensics/shadcn` ~1-minute cold-start on prod and verify it, then (2) build David's 4-account weekly credit risk review journey (per `Recoup_David_Journey.html` + `Recoup_Credit_Risk_Dataset.xlsx`) on new Supabase tables with a fully deterministic, rule-driven read model, reusing Maya's shadcn UI, and cut it over to retire the old `/credit`.

**Architecture:** New Supabase `credit_*` tables hold raw workbook rows (accounts, AR open items, monthly sales, payment history, contract/TPM, deductions, deduction lines, mesh interpretations, and a small governed `credit_policy` table). A pure builder `src/services/creditRiskModel.ts` derives **every** metric, verdict, signal, and action-packet amount from those rows + governed policy params (no LLM math, no static business values, fail-closed on any missing source or seed/compute mismatch). Express route `GET /credit/v2` serves it; Next route `cockpit/app/credit/v2/page.tsx` renders through new `cockpit/components/david/*` components copied from Maya's shadcn patterns. Approvals reuse the governed `/api/approval` path (david role already allowed). Final cutover replaces `/credit` with the new surface and retires the old arbitration workstation.

**Tech Stack:** Next.js App Router (cockpit), Express API (`src/services/cockpitApi.ts`, :4317), Supabase (service role), shadcn `cockpit/components/ui`, lucide-react, Vitest, tsx e2e harness. Prod = Vercel (from `main`) + Render backend for the Express API.

---

## Decisions locked with owner (2026-07-07)

1. **Sequencing:** Maya cold-start fix ships to **prod first** and is verified, **before** any David work begins. David branches off the updated main.
2. **Spec source:** mockup + dataset supersede v1.2 D1–D5 (no partial-hold visualizer, no negotiation-graph rework, no $640K order beat).
3. **Route + retire:** build/validate at `/credit/v2`; final cutover **retires `/credit`** by replacing it with the new surface (David's `defaultRoute` stays `/credit`, so no profile edit and the landing CTA lands on the new surface automatically). **`/credit/command` (D5 dark command centre) is retired in a follow-up step (Task 1-5.4) after the David v2 cutover reaches prod.**
4. **Agent depth:** deterministic pipeline emitting **real per-step trace rows**; copilot dock is scripted in v1 (free-text Q&A is stretch Task 1-4.3).
5. **Provenance:** UI keeps SAP naming with an explicit **synthetic badge** ("SAP OData (synthetic)") while data physically lives in Supabase (invariant I-30 honesty).
6. **No static business data:** all dollars/limits/counts/verdicts/ranks are derived from Supabase rows or from governed, expert-owned policy params in `credit_policy` (buffer factor, rounding step, thresholds). Only UI copy templates and icons are hard-coded.
7. **Landing:** on completion, the "David demo" CTA must resolve to the new surface.

---

## Blocking decisions (confirm before Milestone 1 execution)

Both items are now **RESOLVED (owner, 2026-07-07)**:

- **B-1 · Base = current `origin/main` at branch time (RESOLVED).** Both folders are working copies of the same repo (`rathishpadman/Recoup.git`); the local `codex/*` branches are WIP. Prod deploys from `main`, so the base is **whatever `origin/main` is when each branch is cut — always `git fetch origin` first; do NOT pin a SHA** (main moves; it was `2f87c6e` at first review, `d9db326` now, with no plan-critical file changed). Sequencing: **Milestone 0** branches off current `origin/main`; **Milestone 1 (David)** branches off `origin/main` **after the Milestone-0 fix has merged**, so it includes the Maya cold-start fix. Plan assumptions were re-verified on `origin/main`: `476bb7c` (the M0 cache disconnect) present, `forensics/route.ts` is the bare proxy, `money.ts` / execution package / root `vercel.json` / `read-model-cache.ts` / `/healthz` all present, `/credit/v2` absent (clean start).
- **B-2 · Thresholds = demo-calibrated, governing (RESOLVED).** `credit_policy` thresholds reproduce the workbook's 16 seeded Risk-Mesh ranks exactly; builder fails closed against them. Documented as governing **for this demo only**, editable in `credit_policy` without code. The plan does **not** assert them as validated production credit policy.

## Codex Execution Protocol (best-practice, mandatory per task)

Follow this loop for **every** task below. It encodes TDD + proposer≠reviewer, matching the repo's HITL discipline.

- **Source-of-truth preflight (before any edits):** record the active worktree path, branch, and SHA; confirm the intended target branch/commit (`main` for prod-bound work, feature branch for preview work); and, for any prod regression or prod-bound fix, prove what commit is currently live on the public alias. If local worktree, `main`, and prod do not line up, switch to the correct clean worktree before editing or testing.

1. **Plan-read (reviewer subagent):** dispatch a `code-reviewer` (or `architect` for schema/model tasks) subagent to read the task's files + test scenarios and confirm the approach, boundaries, and that the RED test actually pins the behavior. Fix scenario gaps before coding.
2. **RED (implementer subagent, via `tdd-guide`):** write the failing test(s) exactly as specified. Run; confirm the expected failure message. Never write implementation first.
3. **GREEN (implementer):** minimal implementation to pass. Run the task's test command; confirm PASS. Run `npm run typecheck` for any `.ts`/`.tsx` change.
4. **Review (reviewer subagents, in parallel):** dispatch `code-reviewer` **and** `security-reviewer` on the diff. Address every CRITICAL/HIGH; fix MEDIUM where cheap. Security focus: no secrets in code, no fixture/mock business data, no request-on-open, fail-closed on missing source.
5. **Boundary gate:** for any `cockpit/components/david/*` or Maya change, run the relevant invariant test (`david-credit-v2-route.test.ts`, `maya-shadcn-boundary.test.ts`) — must stay green.
6. **Commit:** one logical change, conventional-commit message (`feat:`/`fix:`/`test:`/`chore:`), no `--no-verify`.
7. **Parallelize** independent tasks (e.g., 2.3/2.4/2.6 UI components) across implementer subagents; keep dependent tasks (0.3 → 1.1 → 1.3) sequential.

Test-scenario minimums per task are written inline. Use `build-error-resolver` if `typecheck`/`build` fails. Do not advance a task with a red gate.

Before treating a local cold-start, E2E, or route failure as an app bug, check the local runtime path too: verify which process owns ports `3000` / `4317`, confirm the worktree is using the real `.env.local` rather than `.env.example`, and clear stale listeners before rerunning.

---

## Dataset coverage (you do NOT need to re-share the file)

The full workbook was extracted; **all 13 sheets are captured** and land in `docs/Tools_data/credit_risk_dataset.json` (Task 1-0.2) → Supabase (Task 1-0.3):

| Workbook sheet | Destination table | Used for |
|---|---|---|
| Accounts | `credit_accounts` | limit, terms, segment, gaming flag, owner |
| AR_Open_Items (22) | `credit_ar_open_items` | exposure, aging |
| Sales_Monthly (48) | `credit_sales_monthly` | DSO (TTM sales basis) |
| Payment_History (24) | `credit_payment_history` | payment trend (recent vs prior) |
| Deductions (S1–S8) | `credit_deductions` | signals, dispute counts/amounts, unsupported $ |
| Deduction_Lines (20) | `credit_deduction_lines` | line-level backup / evidence refs |
| Contract_TPM (8) | `credit_contract_tpm` | basis refs for signals |
| Risk_Mesh_Positions (16) | `credit_risk_mesh_positions` | mesh tiles + fail-closed cross-check |
| Derived_Metrics | (not seeded) | golden expected values for unit tests |
| Risk_Scoring_Reference | `credit_policy` (thresholds) | scoring thresholds as governed params |
| Source_System_Map / Data_Dictionary / README | (reference only) | provenance labels, doc |

Nothing else is needed from you to build; open confirmations are listed at the end.

## Resolved data gaps (confirm at review; none block build)

- **Scoring thresholds:** the workbook's printed reference text doesn't reproduce its own ranks (it would make Harbor Credit ELEVATED and ValuMart Collections ELEVATED, contradicting the sheet). We seed thresholds into `credit_policy` that reproduce **all 16 seeded positions exactly**, and the builder **fails closed** if a computed rank ≠ the seeded `credit_risk_mesh_positions.status_rank` (mirrors the workbook `Match? = OK` column). Fitted values: Credit HIGH util≥0.95 · ELEVATED util≥0.85 · WATCH daysBeyondTerms≥20; Collections HIGH unsupported≥25000 or gamingFlag · ELEVATED ≥15000 · WATCH >0.
- **Action-packet amounts are now rule-derived, not static** (owner request). `credit_policy` holds `reduce_limit_buffer` (1.2) and `reduce_limit_rounding` (100000); reduced limit = `round(exposure × buffer, rounding)`. Verified: Harbor 1.24M×1.2=1.488M → $1.5M (matches mockup). Hold amount = derived `unsupportedAmount`; freeze amount = current `creditLimit`; monitor amount = invalid-OTIF recover sum. Only the packet's **copy templates** (title/detail strings, keyed by verdict) are code constants.
- **Dispute counts/amounts/unsupported are derived** from `credit_deductions` per account (count of scenarios, sum of claim, sum of recover) — verified against mockup facts (Crestline 3/$54,300/$39,700; Harbor 2/$27,400/$17,000; ValuMart 2/$22,500/$12,700; Greenleaf 1/$8,200/$0). Not seeded on the account.
- **"4 of 18 accounts"** — "18" has no source; render "4 accounts in review".
- **As-of date** `2026-01-26` seeded in `credit_snapshot`; day-precision uses the workbook's own `days_past_due`/`days_to_pay` so metrics match `Derived_Metrics`.

**Out of scope:** `/credit/command` changes, D2 sensitivity readout, interactive negotiation graph, David Spanish voice, CFO changes, production ERP write-back (I-26 stands).

---

# MILESTONE 0 — Maya forensics cold-start fix → prod → verify (do this FIRST)

**Why first:** `/forensics/shadcn` stalls ~60s after login. Root cause (confirmed at `cockpit/app/api/forensics/route.ts`): the route is a bare proxy — it calls `proxyJsonResponse(upstream, await upstream.text(), "miss")` with **no cache read and no background refresh**. The Supabase read-model cache (`cockpit/app/api/read-model-cache.ts`, `readCachedReadModelPayload` still exported) was wired in commit `8fe66a7` and disconnected in `476bb7c` ("Implement real evidence reconciliation pipeline"). When the Render backend is cold, every load blocks on its 30–60s spin-up.

**Branch/PR discipline:** this ships to prod independently of David. Work on `fix/maya-forensics-cache-coldstart`, PR to `main`, deploy preview, verify, merge, verify prod. **David does not start until this is merged and prod-verified.**

### Task 0-M.1: Confirm intent of the `476bb7c` removal (no code yet)

**Files:** none (investigation)

- [ ] **Step 1:** `git show 476bb7c -- cockpit/app/api/forensics/route.ts` and read the commit body. Determine whether the cache read was removed **intentionally** (e.g., a stale-data or hash-mismatch bug in the reconciliation pipeline) or incidentally.
- [ ] **Step 2:** `git show 8fe66a7 -- cockpit/app/api/forensics/route.ts` to capture the exact wiring to restore (cache read → hit returns immediately → background refresh).
- [ ] **Step 3:** Record findings in the PR description. **If the removal was intentional**, restore the cache but add the guard that motivated the removal (do not blind-revert). If incidental, proceed to restore.

### Task 0-M.2: Restore cache read + background refresh (TDD)

**Files:**
- Modify: `cockpit/app/api/forensics/route.ts`
- Test: `tests/unit/forensics-route-cache.test.ts`

- [ ] **Step 1 (reviewer):** review scenarios: (a) cache **hit** → responds without awaiting the Render fetch, sets cache header `hit`; (b) cache **miss** → proxies upstream, triggers background refresh; (c) upstream cold/error on miss → still returns the documented 502; (d) hit path never returns stale data past the cache's own freshness contract (respect `readModelCacheHeader` semantics already in `read-model-cache.ts`).
- [ ] **Step 2 (RED):** write `forensics-route-cache.test.ts` asserting the four scenarios using an injected fetcher/cache stub (match the stubbing style in existing `tests/unit/*route*` tests — grep `read-model-cache` and `readCachedReadModelPayload` usages for the seam). Run → FAIL.
- [ ] **Step 3 (GREEN):** re-wire the route: call `readCachedReadModelPayload(...)` first; on hit, return the cached payload immediately and schedule `refreshReadModelAfterResponse(...)` (or the exact writer helper named in `read-model-cache.ts` — confirm the symbol) via `after()`; on miss, keep the current proxy + kick a background refresh. Use `git show 8fe66a7` as the reference diff, adapting to the current `proxyJsonResponse` signature.
- [ ] **Step 4:** Run test → PASS. `npm run typecheck`.
- [ ] **Step 5 (review):** `code-reviewer` + `security-reviewer` on the diff (focus: no auth bypass — the `allowDemoSessionRoles: ["maya"]` gate must remain; cache key must be per the existing `mayaForensicsReadModelKey`).
- [ ] **Step 6:** Commit `fix: restore forensics read-model cache read and background refresh`.

### Task 0-M.3: Render keep-alive so the backend stops sleeping

**Files:**
- Create: `cockpit/app/api/cron/warm-backend/route.ts`
- Modify: **root `vercel.json`** (repo root — confirmed present; NOT `cockpit/vercel.json`) — add a cron; or document an external uptime pinger if crons aren't available on the plan.

- [ ] **Step 1 (reviewer):** confirm whether Vercel Cron is available on this project's plan (`list_projects`/project settings). If not, the fallback is an external uptime monitor hitting the health path every 5–10 min — document in the PR.
- [ ] **Step 2:** Implement a minimal GET that fetches **`${RECOUP_API_URL}/healthz`** (confirmed at `cockpitApi.ts:449`, registered in the manifest at `:277`) and returns 200/504. No auth secrets in the handler beyond what env provides.
- [ ] **Step 3:** Add cron schedule `*/10 * * * *` in `vercel.json`. Keep the ping cheap and idempotent.
- [ ] **Step 4:** Commit `chore: warm render backend on a schedule to avoid cold starts`.

### Task 0-M.4: Env-var sanity + PR to prod

- [ ] **Step 1:** Verify in Vercel **production** env that `RECOUP_READ_MODEL_CACHE` / `RECOUP_READ_MODEL_BACKGROUND_REFRESH` (or the exact flags read by `read-model-cache.ts` — grep it) are **not** `disabled`, and that the frontend still points at the intended Render backend (`RECOUP_API_URL` / any required `NEXT_PUBLIC_*` runtime URL still match the live service). If they were flipped during debugging, that alone regressed it.
- [ ] **Step 2:** `npm run lint && npm run typecheck && npm run test` green. Run the existing Maya e2e that touches forensics (`npm run test:e2e:shared-surfaces`) → green (regression guard: Maya journey unchanged).
- [ ] **Step 3:** Open PR `fix/maya-forensics-cache-coldstart` → `main`. On the **preview deployment**, log in as Maya, hit `/forensics/shadcn`: first load after cold may still be slow/stale-flagged, **second load is instant** via Supabase cache.
- [ ] **Step 4:** Merge to `main`. On **prod**, repeat the two-load check and confirm sub-second warm loads. Capture before/after timings in the PR.

**Milestone 0 exit criteria:** prod `/forensics/shadcn` warm load < ~2s; Maya e2e + shared-surfaces green; keep-alive live; PR merged to main. **Only then start Milestone 1.**

---

# MILESTONE 1 — David credit risk review v2

## Phase 1-0 — Branch, dataset, schema/seed

### Task 1-0.0: Establish the authoritative clean worktree (do FIRST — both checkouts are dirty)

> **State at planning:** `Recoup-main-landing-prod` = branch `codex/maya-case-detail-copilot-remediation` @ `1e47729` (9 dirty files); `Recoup` = branch `codex/maya-reference-prod-release` @ `610f03e` (35 dirty files). Neither is on `main`, both dirty. **Do not `git checkout main` in place.**

- [ ] **Step 1 (RESOLVED — B-1):** base = **current `origin/main`** (prod deploy source; same repo for both local folders — no repo choice). **Precondition: the Milestone-0 fix must already be merged to main** so David includes the Maya cold-start fix.
- [ ] **Step 2:** `git fetch origin` to get the **then-current** `origin/main` (do not use any SHA pinned in this doc). Do **not** stash/mutate the dirty codex working trees; branch off the fresh remote ref.
- [ ] **Step 3:** create an isolated worktree off the fetched main: `git worktree add ../recoup-david-v2 origin/main` (keeps the messy source checkouts untouched; matches superpowers using-git-worktrees). All Milestone-1 work happens there. Re-confirm the plan's key paths exist on this base before coding.
- [ ] **Step 4:** confirm Vercel prod deploy source (branch that triggers prod) so the later PR targets it. Commit this plan into the authoritative checkout if not already there.

### Task 1-0.1: Feature branch

- [ ] In the clean worktree, `git checkout -b feature/david-credit-v2` off the confirmed base (which, after Milestone 0 merges, includes the Maya cold-start fix). This branch = preview deploys only.

### Task 1-0.2: Dataset → JSON (all sheets)

**Source artifacts (owner-provided inputs, NOT in the repo):** `C:\Users\rathi\Downloads\Recoup_David_Journey.html` (mockup) and `C:\Users\rathi\Downloads\Recoup_Credit_Risk_Dataset.xlsx` (13-sheet workbook). These live outside both checkouts — the workbook was already extracted this session (scratchpad `xlsx/dump.js`). **This task commits the extracted JSON into the repo so that everything downstream (1-0.3 seed, 1-1.x model/tests) is fully self-contained and no longer depends on the Downloads files.** If the extraction is unavailable at execution time, re-extract from the xlsx at that path first.

**Files:** Create `docs/Tools_data/credit_risk_dataset.json`

- [ ] **Step 1:** One JSON file with keys `snapshot, accounts, arOpenItems, salesMonthly, paymentHistory, deductions, deductionLines, contractTpm, riskMeshPositions, policy`. Values verbatim from the workbook (dates as Excel serials; seed converts). `deductions` = the 8 S-rows (scenarioId, accountId, customer, type, lines, claimAmount, verdict, validAmount, recoverAmount, routing, gamingFlag, feedsMesh, evidenceRefs). `deductionLines` = 20 rows. `policy` = fitted thresholds + `reduceLimitBuffer:1.2, reduceLimitRounding:100000`. Example rows:

```json
{
  "snapshot": { "asOfDate": "2026-01-26" },
  "deductions": [
    { "scenarioId": "S3", "accountId": "ACC-CRE", "type": "Shortage claim (POD full)", "lines": 4, "claimAmount": 21300, "verdict": "INVALID", "validAmount": 0, "recoverAmount": 21300, "routing": "Recovery + gaming flag [D]", "gamingFlag": true, "feedsMesh": "Collections", "evidenceRefs": "POD DLV8023410-413" }
  ],
  "policy": {
    "creditHighUtil": 0.95, "creditElevatedUtil": 0.85, "creditWatchDaysBeyondTerms": 20,
    "collectionsHighUnsupported": 25000, "collectionsElevatedUnsupported": 15000,
    "reduceLimitBuffer": 1.2, "reduceLimitRounding": 100000
  }
}
```

(Include every row of every listed sheet — the earlier extraction has them all.)

- [ ] **Step 2:** Commit `data: credit risk dataset (all workbook sheets) as json`.

### Task 1-0.3: Supabase schema + seed

**Files:** Create `docs/supabase-credit-risk-schema.sql`, `scripts/seedCreditRiskDataset.ts`; modify `package.json` (`"seed:credit-risk": "tsx scripts/seedCreditRiskDataset.ts"`).

- [ ] **Step 1:** Schema — **10 tables total**: `credit_snapshot` + the 9 workbook-destination tables from the coverage table (`credit_accounts`, `credit_ar_open_items`, `credit_sales_monthly`, `credit_payment_history`, `credit_deductions`, `credit_deduction_lines`, `credit_contract_tpm`, `credit_risk_mesh_positions`, and the governed `credit_policy` key/value table):

```sql
create table if not exists credit_snapshot (id text primary key default 'current', as_of_date date not null);
create table if not exists credit_accounts (account_id text primary key, customer text not null, channel text not null, segment text not null, credit_limit numeric not null, terms_days integer not null, gaming_flag boolean not null default false, owner text not null);
create table if not exists credit_ar_open_items (invoice_no text primary key, account_id text not null references credit_accounts(account_id), invoice_date date not null, due_date date not null, terms_days integer not null, amount_open numeric not null, days_past_due integer not null, aging_bucket text not null, disputed boolean not null default false, note text);
create table if not exists credit_sales_monthly (account_id text not null references credit_accounts(account_id), period text not null, credit_sales numeric not null, primary key (account_id, period));
create table if not exists credit_payment_history (payment_id text primary key, account_id text not null references credit_accounts(account_id), invoice_no text not null, days_to_pay integer not null, amount_paid numeric not null, on_time boolean not null, pay_window text not null check (pay_window in ('Prior','Recent')));
create table if not exists credit_deductions (scenario_id text primary key, account_id text not null references credit_accounts(account_id), deduction_type text not null, lines integer not null, claim_amount numeric not null, verdict text not null check (verdict in ('VALID','INVALID','PARTIAL')), valid_amount numeric not null, recover_amount numeric not null, routing text not null, gaming_flag boolean not null default false, feeds_mesh text not null, evidence_refs text);
create table if not exists credit_deduction_lines (line_id text primary key, scenario_id text not null references credit_deductions(scenario_id), account_id text not null references credit_accounts(account_id), invoice_no text not null, deduction_type text not null, line_amount numeric not null, verdict text not null);
create table if not exists credit_contract_tpm (reference_id text primary key, account_id text not null references credit_accounts(account_id), type text not null, detail text not null, value numeric, used_in_scenario text);
create table if not exists credit_risk_mesh_positions (account_id text not null references credit_accounts(account_id), position text not null check (position in ('Credit','Fulfilment','Billing','Collections')), status text not null, status_rank integer not null, key_metric text not null, driver_signals text, interpretation text not null, primary key (account_id, position));
create table if not exists credit_policy (key text primary key, value numeric not null);
```

- [ ] **Step 2:** Seed script (pattern-match `scripts/materializeRealEvidenceDataset.ts` for the Supabase REST upsert style). Excel-serial→ISO via epoch `Date.UTC(1899,11,30)`. One `upsert(table, rows)` per table with `Prefer: resolution=merge-duplicates`; map `policy` object to `[{key,value}]` rows. Fail loudly on non-2xx.
- [ ] **Step 3:** Apply schema (SQL editor / `apply_migration`), `npm run seed:credit-risk`.
- [ ] **Step 4:** Verify counts: accounts 4 · ar_open_items 22 · sales_monthly 48 · payment_history 24 · deductions 8 · deduction_lines 20 · contract_tpm 8 · risk_mesh_positions 16 · policy 7.
- [ ] **Step 5 (review + commit):** reviewer subagent checks the schema/seed; commit `feat: credit risk schema, policy, and seed script`.

## Phase 1-1 — Deterministic read model + API

### Task 1-1.1: Scoring + packet engine (pure, TDD golden)

**Files:** Create `src/services/creditRiskModel.ts`; Test `tests/unit/credit-risk-model.test.ts`; fixture `tests/unit/fixtures/creditRiskFixture.ts` (imports the checked-in dataset JSON — no inline business data).

- [ ] **Step 1 (RED):** golden tests from `Derived_Metrics` + mockup — pin all 4 verdicts, all 16 mesh ranks, derived dispute count/amount/unsupported, payment trend, **and** rule-derived packet amounts:

```ts
it("derives Harbor ELEVATED with a rule-based reduced limit", () => {
  const a = byId["ACC-HAR"];
  expect(a.openDisputeCount).toBe(2);
  expect(a.openDisputeAmount).toBe(27_400);
  expect(a.unsupportedAmount).toBe(17_000);       // sum recoverAmount S7+S8
  expect(a.verdict).toBe("ELEVATED");
  const reduce = a.actionPacket.find(p => p.kind === "reduce")!;
  expect(reduce.amountLabel).toBe("$1.5M");        // round(1.24M*1.2, 100k)
});
it("Crestline hold amount equals derived unsupported, freeze equals current limit", () => {
  const a = byId["ACC-CRE"];
  expect(a.actionPacket.find(p => p.kind === "hold")!.amountLabel).toBe("$39,700");
  expect(a.actionPacket.find(p => p.kind === "limit")!.amountLabel).toBe("$4.5M");
});
it("fails closed when computed rank mismatches seeded mesh position", () => {
  const broken = structuredClone(fixtureRows);
  broken.riskMeshPositions.find(p => p.accountId==="ACC-GRE" && p.position==="Credit")!.statusRank = 3;
  expect(() => buildCreditRiskReviewModel(broken)).toThrow(/mesh position mismatch/i);
});
```

(Plus the Crestline/ValuMart/Greenleaf verdict+rank assertions from the golden `Derived_Metrics` values.)

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3 (GREEN):** implement pure builder — **no cockpit/ imports, no fetch**; **all money math uses `src/types/money.ts` (`Decimal`), never JS floats** (repo invariant — `tests/invariants/no-float-money.test.ts` + AGENTS.md; `src/types/money.ts` + `decimal.js` are the allowed deps here, same as other `src/services`). The builder returns pre-formatted `*Label` strings so **no money/`Decimal` ever crosses into cockpit/UI code** (React stays math-free). Exports `buildCreditRiskReviewModel(rows)`, types `CreditVerdict`, `MeshPosition`, `CreditRiskAccountModel`, `CreditAssessmentStep`, `CreditRiskReviewModel`. Metrics (all via `money()`): `exposure=Σ amountOpen`; `ttmSales=Σ salesMonthly`; `dso=exposure/(ttmSales/365)`; `dbt=max(dso-terms,0)`; `util=exposure/limit`; disputes/unsupported from `credit_deductions`; trend rule from payment windows. Rounding for the reduced-limit rule uses `Decimal` rounding to the `reduce_limit_rounding` step. Ranks via policy thresholds (Fulfilment=2 if any VALID OTIF/SLA deduction else 0; Billing=1 if any promo/pricing scenario with validAmount>0 else 0); `verdict=["CLEAR","WATCH","ELEVATED","HIGH"][max(credit,collections)]`. **Cross-check each rank vs seeded `status_rank`; throw on mismatch.** `assessmentSteps` templated from computed values; containment step only when `gamingFlag`. `actionPacket` built from verdict-keyed copy templates with amounts interpolated from computed values + `credit_policy` (buffer/rounding). All `*Label` strings pre-formatted (`$3.92M`, `68d`, `$39,700 unsupported`).
- [ ] **Step 4:** Run → PASS. `npm run typecheck`.
- [ ] **Step 5 (review + commit):** `code-reviewer` + `security-reviewer` (no static business values, fail-closed present). Commit `feat: deterministic rule-driven credit risk read model`.

### Task 1-1.2: Supabase loader (fail-closed)

**Files:** Modify `src/adapters/supabaseSyntheticSource.ts` (append `loadCreditRiskRows`, reuse the `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` fetch style at `supabaseSyntheticSource.ts:345`); Test `tests/unit/credit-risk-source.test.ts`.

- [ ] **Step 1 (RED):** empty required table → throws `missingSource: "supabase-credit-risk-<table>"` (grep `missingSource` at `cockpitApi.ts:1210` for the contract). Happy path returns typed rows incl. `deductions`, `policy`.
- [ ] **Step 2 (GREEN):** parallel `GET /rest/v1/<table>?select=*` for all 10 tables; parse `credit_policy` rows into a keyed object; empty required table → fail-closed throw.
- [ ] **Step 3 (review + commit):** Commit `feat: supabase loader for credit risk tables`.

### Task 1-1.3: `GET /credit/v2`

**Files:** Modify `src/services/cockpitApi.ts` (register `"GET /credit/v2"` at the manifest `cockpitApi.ts:281`; handler beside `/credit` at `:594`); Test `tests/unit/credit-v2-api.test.ts` (match `tests/unit/cockpit-api.test.ts`).

- [ ] **Step 1 (RED):** 200 with `surface:"credit-risk-review"` + 4 accounts on seeded data; fail-closed 503 when `credit_accounts` empty.
- [ ] **Step 2 (GREEN):** handler loads governed config, calls `loadRequiredCreditRiskRows` (fail-closed responder wrapping Task 1-1.2), returns `buildCreditRiskReviewModel(rows)`.
- [ ] **Step 3 (review + commit):** `npm run typecheck`. Commit `feat: credit v2 api route`.

### Task 1-1.4: Governed approval — **backend action resolver** + staging + read-back (closes Codex High #3 and the resolver gap)

**Two backend gaps, both required before David can approve anything:**
1. **Proposer/resolver (new — Codex High):** the approval flow resolves an `actionId` via `prepareApprovalDecision()` → **`findPendingAction()` (`serviceLayer.ts:567`)**, which today searches **only** `forensicsRun.actions`, `forensicsRun.containmentActions`, and Risk-Mesh `holdAction`/`termsAction`, then throws `Action not found`. A `credit-v2:*` id has **no resolver**, so approval fails. The backend must be taught to resolve `credit-v2:<accountId>` into a real, replayable `ProposedExternalAction` with recordIds + deterministic basis.
2. **Read-back (execution-package contract):** approval/audit state must come from the **backend response or refreshed model**, never client-local text. `/credit/v2` must load `approval_records` and reflect committed receipts.

**Files:** `src/services/creditRiskModel.ts` (emit approvable actions), `src/services/serviceLayer.ts` (`findPendingAction` at `:567`, `prepareApprovalDecision` at `:429`), `src/services/cockpitApi.ts` (`/credit/v2` handler), `cockpit/app/api/approval/route.ts` (david allowed at `:8`); reuse forensics read-back `loadApprovalRecordsOrFailClosed` (`cockpitApi.ts:471/516/562`); Read `src/services/approvals.ts`. Test `tests/unit/credit-v2-approval.test.ts` + extend `credit-v2-api.test.ts`.

- [ ] **Step 1 (trace):** read `/credit` → `/api/approval` → `prepareApprovalDecision` → `findPendingAction`, and the forensics read-back, end-to-end before coding. Confirm the `ProposedExternalAction` shape (actionId, recordIds, basis, `requiresHumanApproval`, `dispatchedExternally`).
- [ ] **Step 2 (RED — resolver):** `prepareApprovalDecision({actionId:"credit-v2:ACC-CRE", decision:"approve"}, context)` currently throws `Action not found`; write the failing test asserting it resolves to a credit-v2 action with the account's recordIds + deterministic basis, `requiresHumanApproval:true`, `dispatchedExternally:false` (draft-only).
- [ ] **Step 3 (GREEN — proposer + resolver):** (a) `creditRiskModel` emits one deterministic `ProposedExternalAction` per account (`actionId:"credit-v2:<accountId>"`, recordIds = the account's cited records, basis = verdict deterministic basis, draft-only) as part of / alongside the read model. (b) Extend `findPendingAction` with a `credit-v2:` branch that **rebuilds the credit risk review model** from governed config + credit-risk source (same fail-closed loader as Task 1-1.2, mirroring how it rebuilds `forensicsRun`/`riskRun`) and returns the matching action; unknown id still throws `Action not found`. Replayability holds because the builder is pure over Supabase rows (**I-24**). Proposer ≠ approver preserved (**I-8**).
- [ ] **Step 4 (RED→GREEN — staging + read-back):** (a) `POST /api/approval {actionId:"credit-v2:ACC-CRE", decision:"approve"}` → `{auditEntryHash, decision}` + audit write through the **same** governed path; unknown id → 4xx. (b) a fresh `GET /credit/v2` returns that account's packet as `approvalStatus:"committed"` with the `auditEntryHash` sourced from `approval_records` (not synthesized); no-receipt accounts → `"awaiting"`. Wire `loadApprovalRecordsOrFailClosed` into the handler (reuse, don't duplicate); extend the builder to accept `approvalReceipts` and stamp packets (fail-closed on a receipt for an unknown account).
- [ ] **Step 5 (review + commit):** `security-reviewer` confirms no client-fabricated approval state and that the resolver can't approve a non-draft/dispatched action. Commit `feat: credit v2 approvable action resolver + governed staging + receipt read-back`.

### Task 1-1.5: Cockpit fetcher

**Files:** Modify `cockpit/app/cockpit-data.ts` (append beside `fetchCreditModel` at `:830`).

- [ ] Add the UI-facing model type (duplicate of the builder's output type — do not import `src/` into cockpit, matching how `CreditCockpitModel` is duplicated) + `fetchCreditRiskReviewModel()` calling `fetchJson("/credit/v2")`. `npm run typecheck`. Commit `feat: cockpit fetcher for credit v2`.

## Phase 1-2 — David UI at `/credit/v2` (reuse Maya)

**Reuse map:** `ui/*` imported directly; copy `maya-workspace-shell` → `david-workspace-shell`; import `maya-accent`; structural references from `agent-investigation-timeline`, `approval-gate-dialog`, `audit-confirmation-panel`, `query-evidence-dock`, `deduction-case-workspace` rail, `maya-shadcn-loading-shell`.
**Boundary rules (identical to Maya):** `cockpit/components/david/*` import only `@/components/ui/*`, `lucide-react`, sibling `david/*`, `maya-accent`, and types from `cockpit-data.ts`. Forbidden: `cockpit-shell`, `premium-components`, `@phosphor-icons`, `decimal.js`, `src/core`, `src/services`. No business math in React.

### Mockup UI fidelity map (every affordance in `Recoup_David_Journey.html` → task/decision)

Each row is either **covered** by a task, **derived** (value must come off the model), or a **decision** flagged for the owner. Nothing from the mockup is silently dropped.

| Mockup element (JS/DOM) | Plan coverage |
|---|---|
| Top walkthrough strip `#strip` (4 steps: Sign in / Risk review / Risk Mesh assesses / Verdict & action packet) | **D-UI-1 = KEEP (owner).** Build a persistent demo strip component (Task 1-2.2 Step 2b): brand "Recoup · Prototype", 4 step chips with on/done states driven by the surface's flow state (queue → dossier open → verdict revealed → approval), caption "David K. — Director, Credit & Collections". Presentation-only; steps reflect real flow state, not fake progress. |
| Sidebar workspace nav: **Risk review [4]**, Action packets [2], Behavioural watchlist [1] | **D-UI-2 = build real sections (owner default).** Task 1-2.8: Action packets = read-only outbox of approved packets (from audit/approval state); Behavioural watchlist = accounts with `gamingFlag` (Crestline). Counts from model. |
| Sidebar personas nav (Maya / David / CFO switch) | **D-UI-3 = DROP (owner).** No persona switcher; route-auth gates access. Current persona shown in the footer chip only. |
| Topbar: persona chip · run pill "Weekly credit risk review · 4 accounts flagged · **$7.45M** exposure" · **search** · env chip "SAP OData connected" | Task 1-2.2 (added below): run pill total exposure is **derived** (`model.portfolio.totalExposureLabel` = Σ of the 4 = $7.45M); search = local filter over fetched rows; env chip → provenance label from Task 1-2.7 ("SAP OData (synthetic)"). |
| Queue welcome "Good morning, David." + intro paragraph | Task 1-2.2 (copy from model or static greeting; David's name from session). |
| Queue source line "Exposure from SAP AR read-model · updated **08:20**" | Task 1-2.7 — "08:20" is fake; render `as-of {asOfDate} (synthetic)` instead. |
| 4 stat cards: "Accounts in review **4 of 18**" / High→Contain / Elevated→Reduce / Watch·Clear (exposure sums) | Task 1-2.2 via `model.queueStats`; "18" dropped → "4 accounts in review"; sums **derived**. |
| Filter chips All/High/Elevated/Watch/Clear + gauges + verdict pills + Flag [D] | Task 1-2.2. |
| Verdict color tokens: HIGH=red/`destructive`, ELEVATED=amber, WATCH=teal, CLEAR=green (chip, pill, gauge, tile accent, verdict banner, pipeline node) | **Add:** read model emits `verdictTone: "high"|"elevated"|"watch"|"clear"` per account and per mesh tile; a single `david-verdict-tokens.ts` maps tone→token classes (define the four token pairs once, reuse everywhere). Prevents ad-hoc colors and keeps I-30 "colour + icon + text". |
| Dossier: rail (accounts·4, "All accounts" back) | Task 1-2.3. |
| Decision-flow pipeline (5 nodes Account→Risk Mesh→Verdict→Packet→Approval, animated done/run/pending + connector fills) | Task 1-2.3 stepper — states driven by reveal progress + approval state (not time). |
| Account header (id chip, channel, flag[D], customer, exposure SAP AR, exposure-vs-limit gauge, facts grid DSO/Beyond terms/Open disputes/Payment trend with warn/bad/good tints) | Task 1-2.3 — tints from model-provided tone fields, thresholds not recomputed in React. |
| "Signals in — from deduction forensics" (sig-intro closed-loop + [D] handoff line; sig rows S-id/verdict/note/mesh) | Task 1-2.3 from `model.signals`. |
| "Agent assessment" 8-step timeline + live "assessing" chip, streamed | Task 1-2.4 (agents: SAP OData Retriever, Supabase Tools Retriever, Bureau/Payment-History, Credit Sentinel, Risk Mesh Agents, Behavioural Containment, Credit Decisioning, Action Packet Drafter). |
| "Closed-Loop Risk Mesh — four positions" 2×2 tiles (Credit/Fulfilment/Billing/Collections: accent, icon, OK/WATCH/ELEVATED/HIGH badge, interpretation, key metric) | Task 1-2.3 `david-mesh-tiles.tsx`. |
| Verdict block (badge + lead + "Deterministic basis" + cited chips) | Task 1-2.3 `david-verdict-banner.tsx`. |
| Outcome/action packet (banner verdict→route, packet rows, gate: Mark basis reviewed / Inspect basis / Simulate alternatives / Send action packet + lock line) | Task 1-2.5 — amounts rule-derived; Simulate alternatives disabled-with-tooltip. |
| Copilot rail: header "Investigation Copilot · Conductor · Risk Mesh ready", input, note "Copilot assesses & recommends. Approvals stay with you." | Task 1-2.6 — note line kept verbatim; input disabled in v1. |
| Copilot idle 3 suggestions + streaming agent checklist + verdict chip | Task 1-2.6. |
| Sources drawer (SAP OData / Supabase tools / Bureau / Contract&TPM with statuses; External actions blocked; Audit trail on) | Task 1-2.7 — statuses from model provenance, synthetic badges. |
| Toast affordance (`#toast`) | Reuse shadcn `sonner` (already in `ui/`) for the read-only toasts (Inspect basis / Simulate alternatives). |

**Verdict → color/route derivation lives in the model, not React** (extends Task 1-1.1 output): each account carries `verdict`, `routeLabel` (Contain/Reduce/Monitor/Release), `routeLine`, and `verdictTone`; each mesh tile carries `statusTone`.

### Task 1-2.0: David data-provenance matrix (REQUIRED before any UI visual approval — Codex High #2)

**Contract:** `david-shadcn-execution-package.md` forbids a static build and requires a **data-provenance matrix with one row per visible business field** before visual approval; every field must trace to a backend source path, cited record IDs (where required), deterministic basis (where decision-like), and a fail-closed/`Contract gap` fallback.

**Files:** Create `docs/storyboards/david-v2-provenance-matrix.md`.

- [ ] After the read model exists (Phase 1-1) and before Task 1-2.3 UI is approved, enumerate **every visible business field** on queue + dossier + packet + copilot + sections (exposure, DSO, util, disputes, unsupported, each verdict, each mesh position, each signal, each packet amount, audit hash, provenance labels). One row each: `field | UI location | backend source (table/read-model field) | cited recordIds | deterministicBasis (or "n/a — not decision-like") | fallback (fail-closed / Contract gap / Source unavailable)`.
- [ ] **Gate:** any decision-like field lacking deterministic basis is a **Contract gap** — either extend the read model in an approved slice (Task 1-1.x) or render the gap; never fill with a frontend constant. Reviewer subagent signs off the matrix before UI components are accepted.
- [ ] Commit `docs: david v2 data-provenance matrix`.

### Task 1-2.1: Route scaffold + RED boundary tests
**Files:** Create `tests/invariants/david-credit-v2-route.test.ts`, `cockpit/app/credit/v2/page.tsx`, `cockpit/app/credit/v2/loading.tsx`.
- [ ] **Step 1 (RED):** invariant test (mirror `david-command-route.test.ts` + `maya-shadcn-boundary.test.ts`): page asserts `requireRouteAccess("/credit/v2")` + `fetchCreditRiskReviewModel` + no banned imports; a file-walk over `cockpit/components/david/**` asserts no banned imports and lucide-only icons.
- [ ] **Step 2:** FAIL → scaffold `page.tsx` (server component: `requireRouteAccess("/credit/v2")` → `fetchCreditRiskReviewModel()` → `<DavidRiskReviewSurface>`). David's `allowedRoutes:["/credit"]` already covers `/credit/v2` via the prefix rule — **no profile change**. `loading.tsx` copies Maya's loading shell.
- [ ] **Step 3 (review + commit):** invariant test green. Commit `feat: david credit v2 route scaffold + boundary tests`.

### Task 1-2.2: Shell + topbar + queue
**Files:** Create `david-workspace-shell.tsx`, `david-risk-review-surface.tsx` (client; owns `activeSection`, `selectedAccountId`, `filter`, `search`), `david-account-queue.tsx`, `david-verdict-tokens.ts`.
- [ ] **Step 1:** `david-verdict-tokens.ts` — the single source of verdict/status → token-class mapping (`high`/`elevated`/`watch`/`clear` → chip, pill, gauge-fill, tile-accent, banner classes). Every other David component imports from here (no ad-hoc colors).
- [ ] **Step 2 (shell):** copy `maya-workspace-shell` → nav "Risk review / Action packets / Behavioural watchlist" (counts from model), footer "Director, Credit & Collections" (current-persona chip only), Sources button. Personas switcher dropped (D-UI-3).
- [ ] **Step 2b (walkthrough strip — D-UI-1 KEEP):** create `david-walkthrough-strip.tsx` — persistent top strip: "Recoup · Prototype" + 4 step chips (Sign in / Risk review / Risk Mesh assesses / Verdict & action packet) with on/done states bound to the surface flow state (queue open → dossier open → verdict revealed → approved), caption "David K. — Director, Credit & Collections". Presentation-only; no fake progress. Mount above the topbar in `david-risk-review-surface`.
- [ ] **Step 3 (topbar):** persona chip + **run pill** "Weekly credit risk review · 4 accounts flagged · `{model.portfolio.totalExposureLabel}`" (derived Σ = $7.45M) + account **search** input (local filter over fetched rows) + env chip rendered by Task 1-2.7 provenance label.
- [ ] **Step 4 (queue):** welcome header, 4 stat cards from `model.queueStats` (sums derived; "4 accounts in review", no "of 18"), source line "as-of {asOfDate} (synthetic)", filter chips (All/High/Elevated/Watch/Clear), account rows (verdict chip, name+channel, Flag [D], exposure/limit + utilisation bar from `utilisationPercent`, DSO/disputes/unsupported labels, verdict pill + routeLine). Browser-verify 4 rows + search + filter.
- [ ] **Step 5 (review + commit):** Commit `feat: david v2 shell, topbar, and risk review queue`.

### Task 1-2.3: Dossier (rail, header, signals, mesh tiles, verdict)
**Files:** Create `david-account-dossier.tsx`, `david-mesh-tiles.tsx`, `david-verdict-banner.tsx`, `david-signals-in.tsx`.
- [ ] Rail (4 accounts, copy `deduction-case-workspace` rail), stepper (Account→Risk Mesh→Verdict→Packet→Approval), header card (exposure gauge + facts grid with model-provided tone tints), "Signals in — from deduction forensics" (S-rows from `model.signals`; gaming row destructive border; closed-loop + [D] handoff copy when `gamingFlag`), 2×2 mesh tiles, verdict banner (badge + lead + deterministic basis + cited refs).
- [ ] **Deterministic-basis contract (execution package §"Risk Mesh"):** each mesh tile is decision-like, so it MUST render a backend `deterministicBasis` + cited record IDs, **or** an explicit `Contract gap` state — never a bare status. The read model (extend Task 1-1.1) emits `deterministicBasis` per mesh position (from `credit_risk_mesh_positions.interpretation` + `driver_signals` + `credit_contract_tpm` refs) and per verdict; if a basis field is absent, the model returns a `contractGap:true` marker and the tile renders `Contract gap` (no frontend constant fills it). Same rule for any decision-like verdict/signal field.
- [ ] Browser-verify Crestline (basis + cited refs present; no `Contract gap` on seeded data). Commit `feat: david v2 dossier, mesh tiles, verdict with deterministic basis + contract-gap fallback`.

### Task 1-2.4: Assessment timeline (streamed real trace rows)
**Files:** Create `david-assessment-timeline.tsx`.
- [ ] Render `model.accounts[i].assessmentSteps` (istep structure from `agent-investigation-timeline`); streamed reveal (~500ms) when opened from queue, instant on rail re-open; containment step only for Crestline. Reveal is presentation-only local state. Browser-verify. Commit `feat: david v2 agent assessment timeline`.

### Task 1-2.5: Action packet + HITL gate + audit receipt
**Files:** Create `david-action-packet.tsx` (reuse `approval-gate-dialog`/`audit-confirmation-panel`/`approval-controls` contract at `approval-controls.tsx:41`).
- [ ] Outcome banner + packet rows from `model.actionPacket`; "Mark basis reviewed" arms "Send action packet"; "Inspect basis" opens read-only `Sheet`; "Simulate alternatives" disabled with tooltip "Read-only in this build". Approve → `POST /api/approval {actionId:"credit-v2:<id>",...}`; on 200, **re-fetch `/credit/v2` (or router refresh) so the committed status + audit hash render from the backend read-back (Task 1-1.4), not from local state**; show "external send remains gated"; failure → blocked, no optimistic success. Browser-verify approve on Greenleaf **and** that the committed hash survives a reload (proves backend-sourced). Commit `feat: david v2 gated action packet with governed approval`.

### Task 1-2.6: Copilot dock (scripted)
**Files:** Create `david-copilot-dock.tsx`.
- [ ] Right rail; idle = 3 suggestions ("Why is Crestline high risk?", "Which accounts need action this week?", "Show the gaming-flag account [D]"); active = question + conductor line + per-step agent checklist synced to timeline + verdict chip; free-text input **disabled** ("coming with the query agent"). All from model. Browser-verify. Commit `feat: david v2 investigation copilot dock (scripted)`.

### Task 1-2.7: Sources drawer + provenance
**Files:** Create `david-sources-drawer.tsx`; modify `david-workspace-shell.tsx`.
- [ ] `Sheet`: Connectors "SAP OData **(synthetic)**", "Supabase tools data", "Bureau/payment-history **(synthetic)**", "Contract & TPM repo" (statuses from model provenance, never hardcoded "Connected"); "External actions blocked"; "Audit trail on". Topbar chip "SAP AR read-model (synthetic) · as of {asOfDate}". Every synthetic source carries the badge (I-30). Commit `feat: david v2 sources drawer with honest provenance`.

### Task 1-2.8: Action packets + Behavioural watchlist sections (D-UI-2)
**Files:** Create `cockpit/components/david/david-action-packets-outbox.tsx`, `cockpit/components/david/david-behavioural-watchlist.tsx`; wire into `david-risk-review-surface.tsx` section switch (`activeSection === "action-packets" | "watchlist"`).
- [ ] **Action packets (read-only outbox):** table of approved packets — account, verdict/route, packet summary, committed approval audit hash, "external send remains gated" posture. **Source = `model.accounts[].packet.approvalStatus === "committed"` from the backend read-back wired in Task 1-1.4** (`approval_records`), not client-local status. Empty state when no committed receipts. (This is why 1-1.4 must land first — without the read-back this section would show nothing real.)
- [ ] **Behavioural watchlist:** table of accounts with `model.accounts[i].gamingFlag === true` (Crestline) — customer, flag [D] badge, cited signal scenarios (S3/S6), handoff note "→ Risk Mesh / Containment". Data 1:1 from model; no dispatch controls.
- [ ] **Nav counts:** shell badges use `model.navCounts` (risk review = account count, action packets = approved count, watchlist = gaming-flag count). Browser-verify both sections + counts.
- [ ] **Step (review + commit):** Commit `feat: david v2 action packets outbox and behavioural watchlist sections`.

## Phase 1-3 — Maya containment inclusion (non-invasive) + regression guard

### Task 1-3.1: Containment brief card on Maya Overview
**Files:** Create `cockpit/components/maya/containment-brief-card.tsx`; Test `tests/unit/containment-brief-card.test.tsx`.
- [ ] **Step 1 (RED):** render test from a `containmentPanel` fixture (shape at `cockpitModel.ts:219-236`): shows statusLabel, customerLabel, intentLabel, all basisRows, handoff target "Risk Mesh"; **no button/link implying dispatch**.
- [ ] **Step 2 (GREEN):** shadcn-only card (Card/Badge/Separator/lucide), data 1:1 from `panel`, defensive: **renders `null` if `panel` is undefined**.
- [ ] **Step 3 (mount — the ONLY Maya file changed):** one import + one JSX insertion in the `activeSection === "overview"` branch of `maya-forensics-surface.tsx` (near `:694`), after existing overview content. `containmentPanel` is already on the fetched model — **zero data-layer changes**.
- [ ] **Step 4 (regression precautions):** run `npm run test` (all Maya invariants incl. `maya-shadcn-boundary` green); run `npm run test:e2e:shared-surfaces` (Maya journey unchanged); confirm the Overview's existing testids/layout are untouched (card is appended, not inserted mid-layout). Browser-verify `/forensics/shadcn` Overview shows the Crestline gaming-gate card.
- [ ] **Step 5 (review + commit):** Commit `feat: surface M6 containment brief on maya overview (additive)`.

## Phase 1-4 — Verify + e2e

### Task 1-4.1: Gates
- [ ] `npm run lint && npm run typecheck && npm run test` green; `npm run verify` (adds depcruise + release readiness) green (keep `creditRiskModel.ts` dependency-pure). Fix via `build-error-resolver`; individual `fix:` commits.

### Task 1-4.2: Real-backend e2e + screenshots
**Files:** Create `tests/e2e/david-credit-v2-e2e.ts` (match `shared-cockpit-surfaces-regression-e2e.ts` bootstrap); modify `package.json` (`test:e2e:david-v2`).
- [ ] Beats (1440 + 1280 screenshots → `output/playwright/david-v2/`): login david → `/credit` still default; `/credit/v2` queue 4 rows (Crestline `HIGH`+`Flag [D]`); open Crestline → 8-step stream, `HIGH RISK` banner, Collections tile `HIGH`; **assert no approval/query network calls on open**; reviewed→approve → audit hash + `POST /api/approval` 200 **+ committed hash persists on reload**; Maya `/forensics/shadcn` Overview shows `maya-containment-brief`. Run against **real API + Supabase, no fixtures/route-fulfillment**. Commit `test: david v2 real-backend e2e storyline`.

### Task 1-4.3: David visual-review gate (≥4.5/5 — REQUIRED before cutover — Codex Medium #6)
**Contract:** `david-shadcn-execution-package.md` requires **component score ≥4.5/5 and overall David surface ≥4.5/5**, plus a signed provenance matrix, before visual approval.
- [ ] Desktop visual review (1440 + 1280) of queue, dossier, packet, sections against `Recoup_David_Journey.html` and Maya's design system (spacing, tokens, Plex Mono numerals, verdict tones, no AI-slop). Use the design `design-critique` skill or a reviewer subagent; score per component + overall.
- [ ] **Gate:** any component < 4.5/5 → fix and re-review before Phase 1-5. Confirm Task 1-2.0 provenance matrix is signed off. Record scores in the PR.

## Phase 1-5 — Cutover: retire `/credit` + repoint landing

### Task 1-5.1: Retire the old `/credit` onto the new surface
**Files:** Modify `cockpit/app/credit/page.tsx`; delete/redirect `cockpit/app/credit/v2/*`; update `tests/invariants/david-credit-v2-route.test.ts` to assert the final route; remove now-orphaned imports only if they become unused **by this change** (do not touch `/credit/command`).
- [ ] **Step 1 (reviewer/architect):** confirm cutover approach: make `/credit/page.tsx` render `DavidRiskReviewSurface` (auth `requireRouteAccess("/credit")`, `fetchCreditRiskReviewModel()`), and replace `/credit/v2` with a permanent redirect to `/credit` (keeps any bookmarked link working) or delete it. Keep `/credit/command` untouched.
- [ ] **Step 2 (RED):** update the invariant test so `cockpit/app/credit/page.tsx` asserts `requireRouteAccess("/credit")` + `fetchCreditRiskReviewModel` + no banned imports, and the old arbitration markers (`premium-components`, `NegotiationGraph`) are gone.
- [ ] **Step 3 (GREEN):** move the surface onto `/credit`; retire old arbitration page body. Old premium components (`premium-components.tsx`, `approval-controls` legacy usage on this page) are left in the repo if still used by `/credit/command`; only remove imports orphaned by this file's change.
- [ ] **Step 4:** `npm run verify` + e2e (update the storyline: David now lands on the new surface at `/credit`). Browser-verify David login → new surface at `/credit`.
- [ ] **Step 5 (review + commit):** Commit `feat: retire legacy /credit arbitration workstation; david lands on risk review v2`.

### Task 1-5.2: Repoint landing "David demo"
**Files:** Modify `cockpit/components/landing/landing-content.ts` (David card at `:255`/`:275`, `davidLoginHref` at `:105`).
- [ ] The CTA `davidLoginHref="/login?loginId=david"` already resolves to David's `defaultRoute` (`/credit` = new surface after 1-5.1) — **verify** it lands on the risk-review surface, and update the David card copy (`title`, `ctaLabel`, description at `:389`) to describe the 4-account weekly risk review (not "Arbitration Cockpit"). Keep `testId="recoup-landing-david-cta"`.
- [ ] Browser-verify: landing → "Enter as David" → new surface. Commit `feat: point landing David demo at the risk review journey`.

### Task 1-5.3: PR + prod
- [ ] Open PR `feature/david-credit-v2` → `main`. Full `npm run verify` + `test:e2e:david-v2` green on preview. Verify on preview deploy: David journey end-to-end + Maya undisturbed. Merge; verify prod.
- [ ] After prod deploy, do one live backend-vs-Supabase proof before calling the release complete: for at least one `HIGH` account and one non-`HIGH` account, compare the rendered exposure, dispute count/amount, unsupported amount, verdict, and packet amount against the live `credit_*` tables and capture the prod URL, commit, and deployment IDs in the PR or handoff note.

### Task 1-5.4: Retire `/credit/command` (after prod — owner decision)
**Files:** Delete `cockpit/app/credit/command/page.tsx` + `command.module.css`; remove the invariant test `tests/invariants/david-command-route.test.ts`; remove the "Open arbitration workstation" / command links (footer link in the old page is already gone with 1-5.1); prune any imports orphaned **only** by this deletion.
- [ ] **Precondition:** David v2 is merged and prod-verified (Task 1-5.3 done). Do this as a **separate small PR** `chore/retire-credit-command` so the David launch isn't blocked by it.
- [ ] **Step 1 (reviewer):** grep for inbound references to `/credit/command` (nav, landing, tests, docs). Confirm nothing outside these files points to it. Note: `buildCreditCommandCenter`/`commandCenter` model code stays unless nothing else uses it — remove only if fully orphaned (verify with a repo-wide grep + `npm run verify`).
- [ ] **Step 2:** Delete the route + its test; remove dead links.
- [ ] **Step 3:** `npm run verify` green (depcruise will flag any now-orphaned model code — remove or leave per its output). Commit `chore: retire /credit/command D5 command centre`.
- [ ] **Step 4:** PR → main → prod-verify the route now 404s / redirects and David + Maya are unaffected.

---

## Success criteria (demo acceptance)

1. **Milestone 0 shipped first:** prod `/forensics/shadcn` warm load < ~2s; Maya e2e/shared-surfaces green; merged to main before David started.
2. **Prod safety:** each milestone on its own branch → PR → main; no direct main edits; existing surfaces behave identically until intended cutover.
3. **Deterministic, non-static truth:** every visible number derives from Supabase rows or governed `credit_policy` params; unit tests pin 4 verdicts + 16 ranks + rule-derived packet amounts to the workbook; builder fails closed on mismatch/missing table; **no fixture/static business value renders**.
4. **Mockup parity:** login → queue → dossier (stepper, facts, S1–S8 signals, 2×2 mesh, verdict+basis+refs) → streamed 8-step timeline → rule-derived action packet → reviewed-gate → governed approval with real audit hash → gated posture.
5. **Closed loop both ways:** Maya Overview shows containment (M6) → Risk Mesh; David Crestline shows [D] from forensics S3.
6. **Provenance honesty (I-30):** SAP-named sources always carry the synthetic badge; as-of shown; no "Connected" without a loaded source.
7. **HITL discipline (I-7/I-20/I-8):** opening anything sends no approval/query request (e2e-asserted); only explicit approve posts; failure blocks, never optimistic.
8. **Maya undisturbed:** exactly one Maya file changed (single additive mount, defensive null-render); Maya invariants + e2e green before and after.
9. **Retire + landing:** `/credit` serves the new surface; old arbitration workstation retired; landing "David demo" lands on it.
10. **Reuse:** no new deps; David UI entirely `cockpit/components/ui` + lucide + Maya-lifted patterns.

## Master checklist

- [ ] **M0.1** intent of `476bb7c` confirmed
- [ ] **M0.2** forensics cache read + background refresh restored (TDD)
- [ ] **M0.3** render keep-alive cron/pinger
- [ ] **M0.4** env vars sane · PR → main · prod warm-load verified
- [x] **B-1/B-2 RESOLVED** — base = current `origin/main` (fetch at branch time, post-M0 for David); thresholds demo-calibrated & governing
- [ ] **1-0.0** clean worktree from freshly-fetched `origin/main` (no SHA pin, no in-place `checkout main`)
- [ ] **1-0.1** feature branch
- [ ] **1-0.2** dataset JSON (all sheets)
- [ ] **1-0.3** schema (10 tables incl. deductions/lines/policy) + seed (counts verified)
- [ ] **1-1.1** rule-driven read model golden-tested (verdicts, ranks, derived disputes/unsupported, packet amounts, fail-closed)
- [ ] **1-1.2** supabase loader fail-closed
- [ ] **1-1.3** `GET /credit/v2`
- [ ] **1-1.4** credit-v2 action resolver (`findPendingAction`) + governed approvals + receipt read-back
- [ ] **1-1.5** cockpit fetcher
- [ ] **1-2.0** data-provenance matrix (before UI approval)
- [ ] **1-2.1** route scaffold + RED boundary tests
- [ ] **1-2.2** shell + walkthrough strip (D-UI-1) + topbar + queue
- [ ] **1-2.3** dossier + mesh + verdict
- [ ] **1-2.4** streamed timeline
- [ ] **1-2.5** action packet + HITL + audit
- [ ] **1-2.6** copilot dock (scripted)
- [ ] **1-2.7** sources drawer + provenance
- [ ] **1-2.8** action-packets outbox + behavioural watchlist sections (D-UI-2)
- [ ] **1-3.1** Maya containment card (additive) + regression green
- [ ] **1-4.1** `npm run verify` green
- [ ] **1-4.2** real-backend e2e + 1440/1280 screenshots
- [ ] **1-4.3** David visual-review gate ≥4.5/5 + provenance matrix signed (before cutover)
- [ ] **1-5.1** retire `/credit` onto new surface
- [ ] **1-5.2** repoint landing David demo
- [ ] **1-5.3** PR → main → prod verified
- [ ] **1-5.4** retire `/credit/command` (separate PR, after prod)

## Owner decisions (resolved 2026-07-07)

1. **Reduced-limit rule:** keep `round(exposure × 1.2, $100k)` → Harbor $1.5M. `reduce_limit_buffer=1.2`, `reduce_limit_rounding=100000` in `credit_policy`.
2. **`/credit/command`:** retire it **after** David v2 reaches prod → **Task 1-5.4** (separate follow-up PR).
3. **Workbook reference text:** no update required; the fitted thresholds in `credit_policy` govern and are the source of truth (builder fails closed against seeded ranks).
4. **D-UI-1:** **keep** the top 4-step walkthrough strip → `david-walkthrough-strip.tsx` (Task 1-2.2 Step 2b), bound to real flow state.
5. **D-UI-2:** **build** Action packets (approved-packet outbox) + Behavioural watchlist (gaming-flag accounts) as real read-only sections → **Task 1-2.8**.
6. **D-UI-3:** **drop** the sidebar persona switcher; current-persona chip only.
