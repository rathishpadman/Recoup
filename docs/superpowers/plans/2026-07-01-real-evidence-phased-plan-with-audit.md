# Real Evidence Phased Plan With Audit Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current Recoup Forensics pipeline from a cached/pre-merged demo spine into a phase-gated, source-evidence-backed production pipeline with the audit baseline preserved before code implementation.

**Architecture:** Phase 0 locks the current repo and audit baseline before any runtime code changes. Phases 1-4 build canonical Supabase evidence records and deterministic reconciliation receipts so Forensics no longer trusts seeded `verdict`, `routing`, `rule_input_json`, `rule_id`, or `scenario_id` in authoritative mode. Phases 5-7 add ingestion automation, freshness invalidation, a Server-Sent Events browser update path, staged rollout controls, shared-surface regression proof, and production proof.

**Tech Stack:** Node 22, TypeScript, Express, Next.js App Router, Supabase PostgREST/RPC, SAP OData read-only adapter, Zod, Decimal money types, Vitest, Playwright, browser-canvas screenshot diffing, Render cron/jobs, Vercel production smoke, `docs/supabase-memory-schema.sql`, `src/memory/supabaseStore.ts`, `src/agents/forensics.ts`, `src/services/cockpitApi.ts`.

---

## Why This File Exists

The prior plan at `docs/superpowers/plans/2026-07-01-real-evidence-reconciliation-pipeline.md` defines the real evidence implementation mechanics. It did not preserve the attached audit findings as a formal baseline, and it did not show the audit fix list as phase gates. This file is the phase-wise execution plan that includes:

- the baseline captured before runtime code changes
- the production frontend data/media baseline captured before runtime behavior changes
- the audit verdict tables
- the prioritized audit fix list mapped to phases
- phase gates and verification commands
- the evidence documents that must be created in Supabase before Maya, David, CFO, or any other surface can display a business decision
- the release-safety gates that prevent a Forensics fix from breaking existing Forensics, CFO, credit, trace, or evals-finops behavior

## Baseline Before Runtime Code Changes

Captured on 2026-07-01 before implementation code edits.

| Baseline item | Value |
|---|---|
| Repo | `C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup` |
| Branch | `main` |
| HEAD | `e3e4a55` |
| Runtime code diff before this planning pass | none from `git diff --name-only -- .` |
| Pre-existing untracked artifacts | `docs/qa/maya-human-qa-browser-test-cases-2026-06-27.docx`, `docs/superpowers/plans/2026-07-01-real-evidence-reconciliation-pipeline.md`, `mockups/SaaS-Landing/` |
| Supabase write state | no DML performed during audit or planning |
| Secret handling | no tokens, service role keys, cookies, API keys, or env values printed |
| Audit source | `C:\Users\rathi\.codex\attachments\38866839-1e9d-41f0-8029-3fc330978763\pasted-text.txt` |

Baseline rule for execution: before Phase 1 code changes, create a fresh branch or worktree from this source-of-truth commit, then re-run the Phase 0 checks. If `HEAD` or the target branch differs, record the new baseline in `docs/independent-audit-log.md` before editing code.

## Baseline Before Product Behavior Changes

The Git/SHA baseline is not enough. A production-grade fix also needs a visible production frontend baseline showing what real data users see today before the implementation.

Capture this before Phase 1 runtime code changes and again after Phase 7 deployment:

| Baseline artifact | Required proof |
|---|---|
| Production screenshots | Full-page screenshots for every production route in the acceptance path: public landing, login/demo entry, Maya workspace, Forensics worklist, selected Forensics case, evidence/provenance drawer, query/answer panel, approval/audit panel, classic `/forensics`, `/run`, CFO, David credit, David command, governance overview, governance agents, governance connectors, governance memory, governance trace, and governance evals-finops. |
| API payload headers | Sanitized response status, route, timestamp, deployment ID when available, cache header such as `x-recoup-read-model-cache`, and freshness/source metadata. Do not store secrets, cookies, auth headers, or customer-sensitive free text. |
| Evidence-media baseline | For each evidence class that the UI claims or implies exists, record whether the frontend shows an actual media/document artifact or only a number/status. POD must be checked as PDF/image/media, not just `podSignedFullDelivery=true`. |
| Asset decode proof | For images/PDF previews, record browser decode/load state: image `complete`, `naturalWidth`, `naturalHeight`, PDF/object response status, content type, positive byte length when safe, and visible bounding box. |
| Missing-evidence proof | If production currently lacks a POD PDF/image, contract PDF, remittance PDF, carrier photo, or credit memo document, record that absence explicitly as baseline, not as a pass. |
| Post-implementation comparison | Re-capture the same routes and compare: screenshot before/after, visible evidence IDs, visible document preview/link, source-system/provenance text, content hash, freshness state, and receipt ID. |

Baseline rule for product evidence: if a business decision is explained by a document, the frontend must either show the document/media itself or a safe viewer/link to an HTTP-verified non-empty PDF/image or generated source-document artifact with provenance and load proof. Generic HTML metadata safe-viewers do not count as loaded POD media. Numeric flags and booleans alone are not acceptable production evidence.

## Current Execution Status - 2026-07-01 Local Working Tree

This section records the implementation checkpoint after the Phase 6 local wiring pass and the Phase 6.5 unit-hardening slice. It is not production closeout.

| Area | Status | Evidence / blocker |
|---|---|---|
| Production frontend baseline | CAPTURED | `docs/audit/real-evidence-baseline/2026-07-01/manifest.json` records 19 production captures from `https://recoup-self-eta.vercel.app`, zero visible canonical `EVD-*` IDs, zero visible `RECON-*` IDs, and zero loaded POD media/document artifacts. |
| Supabase DML / provider mutation | NOT RUN | No production DML, Render change, Vercel deploy, or provider config change was run during this local pass. |
| Phase 6 SSE invalidation path | LOCAL CODED | Added `/api/forensics/events`, read-model source/receipt hash headers, cache invalidation publication, Maya EventSource reload handling, visible degraded/stale banner wiring, and Next proxy hash-change publication so forwarded backend business hash changes can invalidate an already-open tab. |
| Canonical evidence/provenance UI | LOCAL CODED | Maya evidence views now expose canonical evidence IDs, receipt IDs, source system/provenance, content hashes, storage URI/link, freshness, and deterministic basis when the backend model supplies canonical evidence. |
| Real Supabase canonical evidence reader | LOCAL CODED | The Supabase settlement reader now attempts to load `recoup_deduction_claims`, `recoup_evidence_documents`, `recoup_evidence_links`, and `recoup_reconciliation_receipts` for authoritative mode. |
| Local focused unit/type gates | GREEN - FRESH RERUN | `npm.cmd run lint` passed, `npm.cmd run typecheck` passed, `npm.cmd run test -- tests/unit/realtime-next-routes.test.ts` passed 1 file / 39 tests, `npm.cmd run test:reconciliation:matrix` passed 5 files / 18 tests, `npm.cmd run test -- tests/unit/evidence-materializer.test.ts tests/unit/reconciliation-receipt-basis.test.ts tests/unit/reconciliation-cutover-preflight.test.ts` passed 3 files / 9 tests, `npm.cmd run test -- tests/unit/cockpit-api.test.ts` passed 1 file / 121 tests, `npm.cmd run test -- tests/unit/reconciliation-rollout.test.ts` passed 1 file / 6 tests, `npm.cmd run test -- tests/invariants/deployment-readiness.test.ts` passed 1 file / 10 tests, `npm.cmd run test -- tests/unit/reconciliation-cutover-env-readiness.test.ts tests/unit/reconciliation-cutover-approval-packet.test.ts tests/unit/reconciliation-cutover-sql-artifact.test.ts tests/unit/reconciliation-cutover-repair-plan.test.ts tests/unit/reconciliation-cutover-preflight.test.ts` passed 5 files / 24 tests, and prior Phase 6 focused/review-remediation gates passed. |
| Phase 6.5 unit hardening | LOCAL CODED / GREEN | Added named tests for S1-S8 reconciliation matrix coverage, source-field mutation sensitivity, source-specific receipt basis/confidence, missing-evidence fail-closed matrix, SAP OData fallback provenance, SAP fallback UI provenance honesty, SAP citation prefixing, and payment-history freshness naming. |
| Phase 6.5 e2e/visual hardening scripts | LOCAL CODED / PARTIAL LOCAL E2E GREEN | Added `tests/e2e/forensics-sse-live-update-e2e.ts`, `tests/e2e/maya-stale-state-e2e.ts`, `tests/e2e/shared-cockpit-surfaces-regression-e2e.ts`, `scripts/compareEvidenceScreenshots.ts`, `scripts/checkEvidenceUiAccessibility.ts`, and package scripts for the full hardening chain. Fresh local Windows runs against `localhost:3000` with local API `127.0.0.1:4317`: `npm.cmd run test:e2e:forensics-sse-live-update` passed, `npm.cmd run test:e2e:maya-stale-state` passed, `npm.cmd run test:e2e:shared-surfaces` passed, and `npm.cmd run verify:real-evidence-a11y -- --browsers=chromium` passed. The default all-browser `npm.cmd run verify:real-evidence-a11y` still fails closed because Firefox headless launch times out with a Windows graphics framebuffer error; by user instruction this local pass may skip cross-browser, but the release cross-browser requirement remains open. `npm.cmd run verify:real-evidence-visual` writes the controlled visual-diff report with partial local screenshot state only: 3 route pairs pass and 16 required route pairs fail; `npm.cmd run check:real-evidence-proof` remains blocked on environment readiness, preview URL, post manifest, and pixel-diff failures. These are not marked production-passed until real evidence rows, post screenshots, and a live/preview app are available. |
| Phase 7 capture/report scaffolding | LOCAL CODED / PENDING TRUTH DATA | Added `scripts/captureRealEvidenceAudit.ts`, `npm.cmd run capture:real-evidence-audit`, pending post/preview README artifacts, and `docs/audit/real-evidence-comparison/2026-07-01.md`. These are templates/scaffolds only until an approved preview/public alias is captured. |
| Scenario/gold-label runtime display ban | LOCAL CODED / GREEN | Cockpit worklist display/API fields now use `workItemId`, `workItemLabel`, and `deductionReason`; `workItemId` is the source line identity, not the private S1-S8 group key. `tests/unit/cockpit.test.ts` and `tests/invariants/no-legacy-decision-columns-runtime.test.ts` assert the worklist contract does not expose `scenarioId` or `scenarioLabel`. |
| Missing-evidence read-model no-publish gate | LOCAL CODED / GREEN | `tests/unit/cockpit-api.test.ts` now proves the missing SAP evidence path returns HTTP 503 on refresh and follow-up reads while the only `POST /rest/v1/recoup_cockpit_read_models?on_conflict=model_key` remains the initial successful publish. Focused gate passed: `npm.cmd run test -- tests/unit/cockpit-api.test.ts` with 1 file / 121 tests. |
| Rollback continuity gate | LOCAL CODED / GREEN | `tests/unit/reconciliation-rollout.test.ts` now proves canary can use receipts, authoritative fails closed when a receipt is missing, and local rollback transitions `canary -> legacy`, `canary -> shadow`, `authoritative -> legacy`, and `authoritative -> shadow` return `legacy_rollback` without requiring receipts. Focused gate passed: `npm.cmd run test -- tests/unit/reconciliation-rollout.test.ts` with 1 file / 6 tests. |
| Deployment cutover manifest guard | LOCAL CODED / GREEN | `.env.example` documents blank reconciliation cutover controls, and `tests/invariants/deployment-readiness.test.ts` asserts Render/Vercel manifests do not commit `RECOUP_RECONCILIATION_MODE=authoritative|canary`, canary line IDs, or a production Supabase project ref. This is local manifest proof only; live provider env promotion still requires explicit approval and production preflight. |
| Full regression gate | GREEN - FRESH RERUN | Fresh `npm.cmd run verify` passed lint, typecheck, 124 Vitest files / 1038 tests, dependency-cruiser with 141 modules / 473 dependencies, and release readiness. |
| Browser e2e against configured real backend | GREEN LOCAL / SAP DEGRADED | Fresh `npm.cmd run test:e2e:maya-real` passed locally against `http://127.0.0.1:4318` after the live-query trace fix. The run loaded 20 canonical line items / 8 work items and completed 5 live Maya query work items with 50 backend trace rows. SAP source health remained red because the SAP service is temporarily down, but non-SAP canonical evidence and MCP were ready and `/forensics/query` no longer returned `blocked_live_agent_trace`. |
| Local deterministic readiness / cutover guard | LOCAL GREEN | `npm.cmd run verify:real-evidence` passed with `{"claims":20,"documents":114,"frontendMediaProof":"not_checked","missingEvidenceIds":[],"proofScope":"local_materialized_dataset","requiredEvidenceIdsPresent":true,"supabasePersistence":"not_checked"}`. This is local materializer proof only; it is not proof that production Supabase contains those rows or that the production frontend loads POD media/documents. |
| Read-only cutover checks | LOCAL PASS / READ-ONLY PRODUCTION PREFLIGHT PASS | `npm.cmd run preflight:reconciliation-cutover` passes for the local target with 20 claims, 114 evidence documents, 20 receipts, 114 evidence hashes, 20 receipt hashes, complete required `EVD-*`/`RECON-*` IDs, and no hash mismatches. Local `.env.local` now includes the non-secret `RECOUP_PRODUCTION_SUPABASE_PROJECT_REF` binding, so `npm.cmd run preflight:reconciliation-cutover -- --target=production` and `npm.cmd run verify:real-evidence -- --target=production` pass by default with the same 20/114/20 proof. Provider env was not changed. |
| Cutover repair planner | LOCAL CODED / READY FOR REFRESH APPROVAL | `npm.cmd run plan:reconciliation-cutover-repair` runs no mutation, exits zero locally with `noMutation: true`, `preflightStatus: "pass"`, `status: "ready_for_refresh_approval"`, and no repair actions. Remaining gates are explicit `refresh:real-evidence` approval, preview/canary/browser/POD-media proof, and re-running production preflight at promotion time. |
| Review-only cutover SQL artifact | LOCAL CODED / DRY-RUN BLOCKED | `npm.cmd run plan:reconciliation-cutover-sql` runs no Supabase connection, writes no files, exits code 1, emits `approvalRequired: true`, `noMutation: true`, and a commented `reviewOnlySqlPlan` so DDL is non-executable by default. Read-only verification commands are separated from post-approval mutation/proof commands. `tests/unit/reconciliation-cutover-sql-artifact.test.ts` covers builder safety, no DML/destructive SQL/secret strings, and the CLI blocked exit; Hume/Singer re-reviews found no remaining blockers. |
| Human cutover approval packet | LOCAL CODED / READY FOR REFRESH APPROVAL | `npm.cmd run plan:reconciliation-cutover-approval` runs the read-only preflight/repair planner, emits a Markdown approval packet, exits zero locally with `Status: ready_for_refresh_approval`, and performs no provider mutation. Latest local packet has no source-read failures, no blocking preflight error, no repair actions, remaining gates, the approval checklist, separated read-only/post-approval commands, and the commented review-only SQL plan. |
| Cutover environment readiness | LOCAL CODED / DRY-RUN BLOCKED | `npm.cmd run check:reconciliation-cutover-env` performs no provider mutation, emits safe presence/host/status metadata only, requires `https` for Supabase, requires `http`/`https` preview URLs, and redacts raw secret/URL values. With `RECOUP_PREVIEW_URL` set to the new Vercel preview, preview URL presence is `ready`; the command still exits blocked because `RECOUP_REAL_EVIDENCE_REFRESH_APPROVED` is not approved. Production preflight readiness is `ready`. Russell/Pauli re-reviews found no remaining checker blockers. |
| Production acceptance | PENDING / VISUAL GATE FAIL-CLOSED | No approved post-implementation production capture, canary proof, public-alias smoke, or deployment promotion has been run. Partial local screenshots exist under `docs/audit/real-evidence-post-implementation/2026-07-01/screenshots/`, but no post-capture `manifest.json` exists. `npm.cmd run verify:real-evidence-visual` currently fails closed with 3 route pairs passing and 16 failing visual-diff route pairs in `docs/audit/real-evidence-comparison/2026-07-01-visual-diff.json`. |

## Attached Audit Result Summary

### Data Freshness Audit

| Hop | Audit verdict | Baseline evidence |
|---|---|---|
| SAP -> Supabase | MANUAL-STEP-REQUIRED | Live SAP read code exists at `src/adapters/sapOData.ts:389`, but the normal retrieval tool calls the non-live adapter at `src/tools/retrieval/sap.ts:6`. The provisioning script writes SQL to `output/recoup-src-sap-upsert.sql` at `scripts/provisionSupabaseSapEvidenceRows.ts:68`. `package.json:19` exposes source-health refresh, not automated SAP upsert. `render.yaml:57` runs only `refresh:source-health`. |
| Supabase -> Express backend | TTL-CACHED / PERSISTED-CACHED | Supabase source reads are one-off REST/PostgREST fetches at `src/adapters/supabaseSyntheticSource.ts:561`. `GET /forensics` returns `recoup_cockpit_read_models` when present at `src/services/cockpitApi.ts:425` and `src/services/cockpitApi.ts:430`, without source freshness comparison. Source context TTL is 30s at `src/services/cockpitApi.ts:231` and `src/services/cockpitApi.ts:903`. Force refresh bypasses cache at `src/services/cockpitApi.ts:504`. |
| Express backend -> Next.js API layer | TTL-CACHED / STALE-WHILE-REFRESH | Next `/api/forensics` reads cached Supabase read model first and triggers background refresh after response at `cockpit/app/api/forensics/route.ts:21` and `cockpit/app/api/forensics/route.ts:23`. Background refresh uses `after()` or fire-and-forget at `cockpit/app/api/read-model-cache.ts:230`. The older server-rendered page bypasses this layer via `cockpit/app/forensics/page.tsx:15` and `cockpit/app/cockpit-data.ts:770`. |
| Backend -> already-open frontend tab | MANUAL-STEP-REQUIRED | Maya loads Forensics once in `cockpit/components/maya/maya-forensics-surface-loader.tsx:36` and calls `/api/forensics` at `cockpit/components/maya/maya-forensics-surface-loader.tsx:149`. Business refresh is a button path at `cockpit/components/maya/maya-forensics-surface-loader.tsx:63` and `cockpit/components/maya/maya-workspace-shell.tsx:253`. Source readiness polling is connector-only at `cockpit/components/maya/source-readiness-strip.tsx:17` and `cockpit/components/maya/source-readiness-strip.tsx:131`. |
| Demo/fixture escape hatches | LIVE-CONFIGURED, CACHE DEFAULT-ENABLED | Render sets `RECOUP_DATA_MODE=real-backend` at `render.yaml:25`. Backend defaults to real-backend unless env is exactly `fixture` at `src/services/cockpitApi.ts:2083`. Next read-model cache is enabled unless `RECOUP_READ_MODEL_CACHE=disabled` at `cockpit/app/api/read-model-cache.ts:328`. `vercel.json:3` only defines build/output, and the attached read-only Vercel env check found no `RECOUP_DATA_MODE`, `RECOUP_READ_MODEL_CACHE`, or `RECOUP_READ_MODEL_BACKGROUND_REFRESH`. |

### Validation Reality Audit

| Claim / item | Audit verdict | Baseline evidence |
|---|---|---|
| Displayed verdict/confidence/routing | PARTIALLY REAL | Display is built from `runForensicsInvestigation` at `src/services/cockpitModel.ts:621`. Worklist verdict/routing/confidence come from `firstDecision` at `src/services/cockpitModel.ts:1563`. Decision tool computes from `ruleId` and evidence completeness at `src/services/decisionTools.ts:30` and `src/services/decisionTools.ts:65`, but `ruleId` and `rule_input_json` are upstream/pre-merged. |
| Multi-source evidence reconciliation | STUBBED / SHAPE-ONLY | Forensics retrieves SAP/docs/TPM evidence at `src/agents/forensics.ts:429`, but service code batches/maps evidence at `src/services/serviceLayer.ts:401` and `src/services/serviceLayer.ts:837`. Rules consume booleans/amounts that already exist in rule input, for example `src/core/rules/shortagePodMismatch.ts:6` and `src/core/rules/pricingBelowContract.ts:6`. |
| Synthetic verdict/rule-input pipeline | STUBBED | Scenario verdict/routing/ruleId are hardcoded at `src/adapters/syntheticData.ts:61`. Lines copy those values at `src/adapters/syntheticData.ts:189`. `buildSyntheticRuleInput` manufactures supporting facts at `src/adapters/syntheticData.ts:211`. Supabase seed SQL inserts those fields into `recoup_deduction_lines` at `src/memory/supabaseStore.ts:512` and `src/memory/supabaseStore.ts:1366`. |
| Production `rule_input_json` path | STUBBED / EXTERNAL-PREMERGED | Runtime requires `rule_input_json` and throws if missing at `src/agents/forensics.ts:467`. Supabase reader parses row fields into `DeductionLine.ruleInput` at `src/adapters/supabaseSyntheticSource.ts:220` and `src/adapters/supabaseSyntheticSource.ts:360`. The audit found no repo path that derives this JSON by comparing SAP/PO/TPM/POD/contract/remittance docs. |
| Immutable audit and approval fail-closed | REAL | Hash-chain entries are frozen and verified at `src/audit/trail.ts:30`. Supabase audit commits use RPC with expected previous hash at `src/audit/supabaseTrail.ts:58` and `src/audit/supabaseTrail.ts:156`. `/approval` requires durable Supabase audit and maps missing durable audit to HTTP 503 at `src/services/cockpitApi.ts:1328` and `src/services/cockpitApi.ts:1375`. |
| Cross-line behavioral gaming detection | REAL LOGIC, PRE-LABELED INPUTS | `evaluateGamingCandidate` filters all deduction lines by customer and applies thresholds at `src/core/risk.ts:281`. Candidate selection evaluates every customer at `src/agents/containment.ts:170`. Governed thresholds are at `config/governed.ts:470`: `invalidLineCount=2`, `invalidValueFloor=10000.00`, `promoCorrelationCount=1`, `windowDays=90`. It can run on Supabase-sourced lines, but current lines still carry pre-decided routing/rule IDs. |

## Audit Fix List Mapped To Phases

| Audit fix | Phase owner | Required outcome |
|---|---:|---|
| Replace pre-merged `rule_input_json` with real reconciliation builder | Phases 1-4 | Runtime derives `RuleInput`, verdict basis, routing basis, confidence factors, and evidence IDs from persisted source documents. |
| Block `scenario_id` from runtime decisions | Phases 1, 3, 4 | Scenario/gold labels are not persisted as production claim inputs and cannot drive rule selection, verdict, routing, confidence, or display ordering. |
| Deprecate legacy decision columns and audit other consumers | Phase 4 | `recoup_deduction_lines.verdict`, `routing`, `rule_id`, `rule_input_json`, and `scenario_id` are treated as legacy labels only; runtime readers are audited and cut over. |
| Automate SAP -> Supabase ingestion | Phase 5 | SAP evidence rows are pulled by a scheduled/read-only ingestion path, not by a human applying generated SQL. |
| Confirm freshness/intake for every non-SAP evidence type | Phase 5 | POD, contract, TPM, carrier, remittance, credit memo, bureau, and payment-history evidence get the same hash/timestamp freshness checks as SAP evidence. |
| Add freshness checks to `GET /forensics` | Phase 5 | Cached read model is served only when all source hashes/timestamps prove it is fresh enough. Stale sources return explicit refresh/stale status or refresh synchronously. |
| Push live business updates to the browser | Phase 6 | Already-open browser tabs receive Forensics/read-model invalidation through SSE without relying on a manual Refresh button. |
| Prove reconciliation by sensitivity tests | Phase 6.5 | Flipping source evidence fields changes derived rule input/verdict basis, which proves the engine is comparing documents instead of relocating hardcoded labels. |
| Make visual proof CI-enforced | Phase 6.5 | Before/after screenshots are pixel-diffed, responsive/cross-browser checked, and accessibility checked before the human comparison doc can pass. |
| Test degraded/stale UI | Phase 6.5 | SSE failure and stale read-model states have e2e coverage and visible screenshots, not just a happy-path connected state. |
| Run full regression at every phase boundary | Every phase | Each phase-specific gate is followed by `npm.cmd run verify` before the next phase starts. |
| Add staged rollout and rollback mode | Phases 4-7 | `legacy`, `shadow`, `canary`, and `authoritative` modes prevent an atomic hard cutover while preserving the final no-legacy-decision invariant. |
| Block authoritative cutover until production evidence exists | Phase 5.5 | Production `recoup_evidence_documents`, `recoup_deduction_claims`, and `recoup_reconciliation_receipts` counts and required IDs are verified before Phase 4+ authoritative behavior can serve the public alias. |
| Regression-test shared cockpit surfaces | Phases 6.5-7 | `/cfo`, `/credit`, `/governance/trace`, and `/governance/evals-finops` are smoked from the Phase 0 route inventory after shared `cockpitApi.ts` and `cockpitModel.ts` edits. |
| Smoke preview and canary before public alias | Phase 7 | Preview deployment, shared-route smoke, and canary-line proof pass before the public production alias is promoted or declared fixed. |
| Keep cache but make provenance visible | Phases 6-7 | API and UI expose cache state, source hashes/timestamps, evidence IDs, and reconciliation receipt IDs. |

---

## Release Safety Rules

These rules answer the separate question: "How do we avoid breaking the existing solution while replacing the fake decision spine?"

1. Every phase exit gate runs the phase-specific tests, `npm.cmd run typecheck` when the phase touches TypeScript, and `npm.cmd run verify`. If `npm.cmd run verify` fails, stop before the next phase and fix the regression in the phase that introduced it.
2. Phase 4+ code must support explicit rollout modes through `RECOUP_RECONCILIATION_MODE=legacy|shadow|canary|authoritative`. Runtime defaults to explicit `legacy` rollback until the production evidence preflight passes and a human promotes `shadow`, `canary`, or `authoritative`. Final acceptance requires `authoritative`.
3. Legacy decision fields may exist only in a named rollback/shadow path or explicitly named admin label view. They must not supply current verdict, routing, confidence, rule selection, worklist ordering, evidence display, or business copy when mode is `authoritative`.
4. Do not enable `authoritative` in production until Phase 5.5 verifies production counts and required IDs for 20 claims, at least 114 evidence documents, and 20 reconciliation receipts. If those records are missing, Forensics remains in `legacy` rollback or a verified non-authoritative mode rather than returning 503 for every user.
5. Any phase that changes `src/services/cockpitApi.ts` or `src/services/cockpitModel.ts` must run the shared cockpit surface regression smoke for every live route captured in Phase 0, including CFO, credit, governance trace, and governance evals-finops when live.
6. Public-alias production smoke is never the first real-traffic-shaped check. Preview deployment smoke and canary-line proof must pass before the public alias is promoted or declared fixed.
7. Supabase DML, Render changes, Vercel deploys, mode changes in production, and production backfill require explicit human approval and must be recorded without secrets.

## Phase 0: Baseline Lock And Safety Controls

**Purpose:** preserve the audit and production frontend baseline before runtime code changes.

**Files:**
- Create or modify: `docs/independent-audit-log.md`
- Create or modify: `docs/vscode-handoff-status.md`
- Create: `docs/audit/real-evidence-baseline/2026-07-01/README.md`
- Create: `docs/audit/real-evidence-baseline/2026-07-01/manifest.json`
- Create: `docs/audit/real-evidence-baseline/2026-07-01/screenshots/`
- Read only: `AGENTS.md`
- Read only: `INVARIANTS.md`
- Read only: `docs/superpowers/plans/2026-07-01-real-evidence-reconciliation-pipeline.md`

- [x] **Step 1: Confirm current branch and runtime code diff**

Run:

```powershell
git status --short --branch
git rev-parse --short HEAD
git diff --name-only -- src cockpit config scripts tests render.yaml package.json docs/supabase-memory-schema.sql
```

Expected before implementation:

```text
## main...origin/main
e3e4a55
```

Expected runtime diff output: empty.

- [x] **Step 2: Capture production frontend baseline screenshots**

Use Playwright against the public production alias. Confirm the alias and deployment mapping before capture. Save screenshots under:

```text
docs/audit/real-evidence-baseline/2026-07-01/screenshots/
```

Build the production route list from `cockpit/app/**/page.tsx` and the currently published navigation. Capture every live production page. The minimum screenshot set is:

```text
00-public-landing.png
01-login-entry.png
02-maya-workspace.png
03-forensics-worklist.png
04-forensics-selected-case.png
05-evidence-provenance-drawer.png
06-query-answer-panel.png
07-approval-audit-panel.png
08-cfo-view-if-live.png
09-david-credit-risk-if-live.png
10-trace-view-if-live.png
11-evals-finops-if-live.png
12-forensics-classic-if-live.png
13-run-workspace-if-live.png
14-david-command-if-live.png
15-governance-overview-if-live.png
16-governance-agents-if-live.png
17-governance-connectors-if-live.png
18-governance-memory-if-live.png
```

If a route is unavailable in production, capture the routed error/empty state and record it in the manifest. Do not skip it silently.

Use a script shaped like this:

```ts
import { chromium, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const outDir = "docs/audit/real-evidence-baseline/2026-07-01/screenshots";
const manifestPath = "docs/audit/real-evidence-baseline/2026-07-01/manifest.json";

interface RouteCapture {
  name: string;
  url: string;
  screenshot: string;
  status: number | null;
  cacheHeader: string | null;
  visibleEvidenceIds: string[];
  visibleReceiptIds: string[];
  mediaChecks: MediaCheck[];
}

interface MediaCheck {
  label: string;
  selector: string;
  present: boolean;
  loaded: boolean;
  contentType: string | null;
  naturalWidth: number | null;
  naturalHeight: number | null;
  note: string;
}

async function captureRoute(page: Page, route: Omit<RouteCapture, "status" | "cacheHeader" | "visibleEvidenceIds" | "visibleReceiptIds" | "mediaChecks">): Promise<RouteCapture> {
  const response = await page.goto(route.url, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${outDir}/${route.screenshot}`, fullPage: true });

  const visibleText = await page.locator("body").innerText();
  const visibleEvidenceIds = visibleText.match(/\bEVD-[A-Z0-9-]+\b/g) ?? [];
  const visibleReceiptIds = visibleText.match(/\bRECON-[A-Z0-9-]+\b/g) ?? [];
  const podMedia = await checkMedia(page, "POD document/media", "[data-testid='pod-document-preview'], img[alt*='POD'], iframe[src*='pod'], a[href*='pod']");

  return {
    ...route,
    status: response?.status() ?? null,
    cacheHeader: response?.headers()["x-recoup-read-model-cache"] ?? null,
    visibleEvidenceIds: [...new Set(visibleEvidenceIds)],
    visibleReceiptIds: [...new Set(visibleReceiptIds)],
    mediaChecks: [podMedia]
  };
}

async function checkMedia(page: Page, label: string, selector: string): Promise<MediaCheck> {
  const locator = page.locator(selector).first();
  const present = (await locator.count()) > 0;
  if (!present) {
    return { label, selector, present: false, loaded: false, contentType: null, naturalWidth: null, naturalHeight: null, note: "No visible POD PDF/image/media artifact in current production UI." };
  }

  const tagName = await locator.evaluate((node) => node.tagName.toLowerCase());
  if (tagName === "img") {
    const imageState = await locator.evaluate((node) => {
      const image = node as HTMLImageElement;
      return { complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
    });
    return {
      label,
      selector,
      present: true,
      loaded: imageState.complete && imageState.naturalWidth > 0 && imageState.naturalHeight > 0,
      contentType: "image",
      naturalWidth: imageState.naturalWidth,
      naturalHeight: imageState.naturalHeight,
      note: "Image decode state captured from production DOM."
    };
  }

  return { label, selector, present: true, loaded: true, contentType: tagName, naturalWidth: null, naturalHeight: null, note: "Non-image document/media element is visible; verify response status/content type in the network artifact." };
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const baseUrl = process.env.RECOUP_PROD_ALIAS;
  if (baseUrl === undefined) {
    throw new Error("RECOUP_PROD_ALIAS is required for production baseline capture.");
  }

  const captures = [];
  for (const route of [
    { name: "public landing", url: `${baseUrl}/`, screenshot: "00-public-landing.png" },
    { name: "login entry", url: `${baseUrl}/login?loginId=Maya`, screenshot: "01-login-entry.png" },
    { name: "maya workspace", url: `${baseUrl}/forensics/shadcn`, screenshot: "02-maya-workspace.png" },
    { name: "forensics worklist", url: `${baseUrl}/forensics/shadcn`, screenshot: "03-forensics-worklist.png" },
    { name: "selected case", url: `${baseUrl}/forensics/shadcn`, screenshot: "04-forensics-selected-case.png" },
    { name: "evidence provenance drawer", url: `${baseUrl}/forensics/shadcn`, screenshot: "05-evidence-provenance-drawer.png" },
    { name: "query answer panel", url: `${baseUrl}/forensics/shadcn`, screenshot: "06-query-answer-panel.png" },
    { name: "approval audit panel", url: `${baseUrl}/forensics/shadcn`, screenshot: "07-approval-audit-panel.png" },
    { name: "cfo view if live", url: `${baseUrl}/cfo`, screenshot: "08-cfo-view-if-live.png" },
    { name: "david credit risk if live", url: `${baseUrl}/credit`, screenshot: "09-david-credit-risk-if-live.png" },
    { name: "trace view if live", url: `${baseUrl}/governance/trace`, screenshot: "10-trace-view-if-live.png" },
    { name: "evals finops if live", url: `${baseUrl}/governance/evals-finops`, screenshot: "11-evals-finops-if-live.png" },
    { name: "forensics classic if live", url: `${baseUrl}/forensics`, screenshot: "12-forensics-classic-if-live.png" },
    { name: "run workspace if live", url: `${baseUrl}/run`, screenshot: "13-run-workspace-if-live.png" },
    { name: "david command if live", url: `${baseUrl}/credit/command`, screenshot: "14-david-command-if-live.png" },
    { name: "governance overview if live", url: `${baseUrl}/governance`, screenshot: "15-governance-overview-if-live.png" },
    { name: "governance agents if live", url: `${baseUrl}/governance/agents`, screenshot: "16-governance-agents-if-live.png" },
    { name: "governance connectors if live", url: `${baseUrl}/governance/connectors`, screenshot: "17-governance-connectors-if-live.png" },
    { name: "governance memory if live", url: `${baseUrl}/governance/memory`, screenshot: "18-governance-memory-if-live.png" }
  ]) {
    captures.push(await captureRoute(page, route));
  }

  await writeFile(manifestPath, JSON.stringify({ capturedAt: new Date().toISOString(), baseUrl, captures }, null, 2));
  await browser.close();
}

void main();
```

Expected manifest baseline for current production if POD media is absent:

```json
{
  "visibleEvidenceIds": [],
  "visibleReceiptIds": [],
  "mediaChecks": [
    {
      "label": "POD document/media",
      "present": false,
      "loaded": false,
      "note": "No visible POD PDF/image/media artifact in current production UI."
    }
  ]
}
```

- [x] **Step 3: Record audit baseline**

Append this entry to `docs/independent-audit-log.md`:

```markdown
## 2026-07-01 Real Evidence Baseline Audit

Source: `C:\Users\rathi\.codex\attachments\38866839-1e9d-41f0-8029-3fc330978763\pasted-text.txt`
Branch/SHA before runtime code changes: `main` / `e3e4a55`
Supabase DML during audit: none
Production frontend baseline: `docs/audit/real-evidence-baseline/2026-07-01/manifest.json`
Production screenshots: `docs/audit/real-evidence-baseline/2026-07-01/screenshots/`

### Baseline Verdict

The current Recoup pipeline is not fully live production-grade end to end. It is real-backend/Supabase-backed in places, and durable audit/HITL controls are real, but the Forensics hero path still depends on pre-merged `recoup_deduction_lines.rule_input_json`, seeded verdict/routing/rule metadata, and cached read models that can serve stale Forensics data until refresh completes.

### Frontend Evidence Baseline Verdict

Current production frontend evidence must be judged from screenshots and media checks, not from code assumptions. If the baseline shows only numeric/status evidence and no POD PDF/image/media preview or safe document link, that is a baseline gap. The post-implementation proof must show actual document/media artifacts or safe links to HTTP-verified non-empty PDF/image or generated source-document artifacts with provenance and load proof; generic HTML metadata safe-viewers do not count as loaded media.

### Highest Priority Gap

Runtime Forensics must stop treating `rule_input_json`, seeded `verdict`, seeded `routing`, and seeded `rule_id` as decision inputs. It must derive decision inputs from persisted SAP, PO, contract, TPM, POD, carrier, remittance, credit memo, bureau, and payment-history evidence documents.
```

- [x] **Step 4: Record implementation branch rule**

Append this entry to `docs/vscode-handoff-status.md`:

```markdown
## 2026-07-01 Real Evidence Implementation Guard

Before Phase 1 runtime code edits, create or switch to the implementation branch/worktree from the audited source-of-truth commit. Record branch, SHA, and target deployment branch. Do not apply Supabase DML, Render deploys, or Vercel deploys without explicit human approval.
```

- [x] **Step 5: Verify baseline artifacts**

Run:

```powershell
git diff --name-only -- docs/independent-audit-log.md docs/vscode-handoff-status.md docs/audit/real-evidence-baseline/2026-07-01
git diff --check -- docs/independent-audit-log.md docs/vscode-handoff-status.md docs/audit/real-evidence-baseline/2026-07-01
npm.cmd run verify
```

Expected: only audit/handoff/baseline artifacts are changed, `git diff --check` exits 0, and the full suite is green before runtime code changes start.

**Phase 0 exit gate:** baseline audit results and production frontend screenshots are durable in repo docs, runtime code remains untouched, and the reviewer can compare future diffs and screenshots against this baseline.

**Phase 0 execution result:** PASS on 2026-07-01. Captured 19 production route/state screenshots and a sanitized manifest under `docs/audit/real-evidence-baseline/2026-07-01/`; manifest records 19 captures, 19 screenshots, zero non-200 responses, zero visible canonical `EVD-*` IDs, zero visible `RECON-*` IDs, zero loaded media, zero `bodyPreview` fields, and three baseline console issues. Scoped runtime diff remained empty for `src`, `cockpit`, `config`, `scripts`, `tests`, `render.yaml`, `package.json`, and `docs/supabase-memory-schema.sql`. Fresh `npm.cmd run verify` passed lint, typecheck, 99 Vitest files / 899 tests, dependency-cruiser, and release readiness. Phase 0 verifier returned PASS with no blocking findings.

---

## Phase 1: Canonical Source Evidence Schema

**Purpose:** create first-class Supabase evidence records for every document the product narration claims exists.

**Files:**
- Modify: `docs/supabase-memory-schema.sql`
- Modify: `src/memory/supabaseStore.ts`
- Create: `src/types/evidence.ts`
- Create: `src/types/claims.ts`
- Test: `tests/unit/supabase-memory.test.ts`
- Test: `tests/unit/evidence-types.test.ts`

- [x] **Step 1: Add failing schema coverage**

Add tests that assert the SQL contains:

```ts
expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_evidence_documents");
expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_evidence_links");
expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_deduction_claims");
expect(sql).toContain("CREATE TABLE IF NOT EXISTS recoup_reconciliation_receipts");
expect(sql).not.toMatch(/\bscenario_id\s+text\s+not\s+null\b/i);
expect(sql).toContain("gold_scenario_id text");
expect(sql).toContain("'pod'");
expect(sql).toContain("'sap_invoice'");
expect(sql).toContain("'sap_credit_memo'");
expect(sql).toContain("'customer_po'");
expect(sql).toContain("'contract_pricing'");
expect(sql).toContain("'contract_sla'");
expect(sql).toContain("'tpm_promo'");
expect(sql).toContain("'tpm_accrual'");
expect(sql).toContain("'carrier_damage_report'");
expect(sql).toContain("'carrier_photo'");
expect(sql).toContain("'remittance_advice'");
expect(sql).toContain("'edi_812'");
expect(sql).toContain("'bureau_alert'");
expect(sql).toContain("'payment_history'");
expect(sql).toContain("FORCE ROW LEVEL SECURITY");
```

Run:

```powershell
npm.cmd run test -- tests/unit/supabase-memory.test.ts
```

Expected: FAIL until schema exists.

- [x] **Step 2: Add canonical evidence tables**

Add DDL for:

```sql
recoup_evidence_documents(
  evidence_id text primary key,
  document_type text not null,
  source_system text not null,
  customer_id text not null,
  source_record_id text not null,
  payload_json jsonb not null,
  raw_text text,
  content_hash text not null,
  storage_uri text,
  retrieved_at timestamptz not null,
  valid_from date,
  valid_to date,
  provenance text not null,
  created_at timestamptz not null default now()
)

recoup_evidence_links(
  evidence_id text not null,
  record_id text not null,
  record_role text not null,
  primary key(evidence_id, record_id, record_role)
)

recoup_deduction_claims(
  claim_id text primary key,
  line_id text not null,
  gold_scenario_id text,
  customer_id text not null,
  invoice_ref text not null,
  claim_amount numeric(18,2) not null,
  reason_code text not null,
  remittance_evidence_id text not null,
  record_ids jsonb not null,
  created_at timestamptz not null default now()
)

recoup_reconciliation_receipts(
  receipt_id text primary key,
  claim_id text not null,
  line_id text not null,
  rule_id text not null,
  derived_rule_input_json jsonb not null,
  evidence_ids jsonb not null,
  deterministic_basis jsonb not null,
  confidence_factors jsonb not null,
  content_hash text not null,
  created_at timestamptz not null default now()
)
```

`gold_scenario_id` is allowed only for offline S1-S8 coverage traceability. Production claim ingestion must write `NULL`, and runtime code must never branch on `gold_scenario_id` or legacy `scenario_id` to choose a rule, verdict, routing, confidence, worklist order, or evidence display.

Use service-role-only grants and forced RLS. Do not grant table access to `anon` or `authenticated`.

- [x] **Step 3: Add evidence and claim Zod types**

Create `src/types/evidence.ts` with document/source/provenance enums, linked record roles, `CanonicalEvidenceDocumentSchema`, and `evidenceContentHash`. Create `src/types/claims.ts` with `DeductionClaimSchema`.

The type test must parse `EVD-POD-S3-L1` and assert the content hash is stable.

- [x] **Step 4: Run Phase 1 checks**

Run:

```powershell
npm.cmd run test -- tests/unit/supabase-memory.test.ts tests/unit/evidence-types.test.ts
npm.cmd run typecheck
npm.cmd run verify
```

Expected: PASS.

**Phase 1 exit gate:** canonical evidence schema exists, every listed document type is represented, and service-role-only security is preserved.

**Phase 1 execution result:** PASS on 2026-07-01. RED coverage failed first for missing canonical evidence tables/types and legacy required `scenario_id`; implementation added `recoup_evidence_documents`, `recoup_evidence_links`, `recoup_deduction_claims`, and `recoup_reconciliation_receipts` to the generated Supabase schema plus `src/types/evidence.ts` and `src/types/claims.ts`. `scenario_id` on legacy `recoup_deduction_lines` is no longer `NOT NULL`; new claims use nullable `gold_scenario_id` only for offline S1-S8 traceability. Focused tests passed: `npm.cmd run test -- tests/unit/supabase-memory.test.ts tests/unit/evidence-types.test.ts` with 41 tests. `npm.cmd run typecheck` and `npm.cmd run lint` passed. Fresh full `npm.cmd run verify` passed lint, typecheck, 100 Vitest files / 904 tests, dependency-cruiser, and release readiness. Phase 1 reviewer returned PASS/Ready; reviewer warnings were closed by adding content-hash recomputation in `CanonicalEvidenceDocumentSchema` and negative tests for forged hashes, array `undefined`, and non-finite numbers.

---

## Phase 2: Real Evidence Materialization And Supabase Persistence

**Purpose:** create actual persisted source evidence rows, not booleans hidden in `rule_input_json`.

**Files:**
- Create: `src/services/evidenceMaterializer.ts`
- Create: `src/services/evidenceRepository.ts`
- Create: `scripts/materializeRealEvidenceDataset.ts`
- Create: `scripts/verifyRealEvidenceReadiness.ts`
- Modify: `package.json`
- Test: `tests/unit/evidence-materializer.test.ts`
- Test: `tests/unit/evidence-repository.test.ts`

- [x] **Step 1: Add failing materializer coverage**

Test the minimum evidence set for the 20 line items:

```ts
const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });

expect(dataset.claims).toHaveLength(20);
expect(dataset.documents).toHaveLength(114);

const crossSurface = ["bureau_alert", "payment_history"];
const expectedByLine: Array<[string, string[]]> = [
  ["S1-L1", ["sap_invoice", "remittance_advice", "carrier_damage_report", "carrier_photo", ...crossSurface]],
  ["S2-L1", ["sap_invoice", "remittance_advice", "tpm_promo", "tpm_accrual", ...crossSurface]],
  ["S3-L1", ["sap_invoice", "remittance_advice", "pod", ...crossSurface]],
  ["S4-L1", ["sap_invoice", "remittance_advice", "contract_sla", "pod", ...crossSurface]],
  ["S5-L1", ["sap_invoice", "remittance_advice", "contract_sla", "pod", ...crossSurface]],
  ["S6-L1", ["sap_invoice", "remittance_advice", "customer_po", "contract_pricing", ...crossSurface]],
  ["S7-L1", ["sap_invoice", "remittance_advice", "tpm_promo", "tpm_accrual", ...crossSurface]],
  ["S8-L1", ["sap_invoice", "sap_credit_memo", "remittance_advice", ...crossSurface]]
];

for (const [lineId, expectedTypes] of expectedByLine) {
  expect(documentTypesForLine(dataset.documents, lineId)).toEqual(new Set(expectedTypes));
}

for (const claim of dataset.claims) {
  expect([...documentTypesForLine(dataset.documents, claim.lineId)]).toEqual(expect.arrayContaining(["sap_invoice", "remittance_advice", "bureau_alert", "payment_history"]));
  expect(claim).not.toHaveProperty("scenarioId");
  expect(claim).not.toHaveProperty("scenario_id");
}

expect(dataset.documents).toEqual(expect.arrayContaining([
  expect.objectContaining({
    evidenceId: "EVD-POD-S3-L1",
    documentType: "pod",
    sourceSystem: "three_pl",
    provenance: "source_generated",
    storageUri: "supabase://recoup_evidence_documents/EVD-POD-S3-L1"
  })
]));
```

Run:

```powershell
npm.cmd run test -- tests/unit/evidence-materializer.test.ts
```

Expected: FAIL until materializer exists.

- [x] **Step 2: Implement deterministic document materializer**

Create complete source documents for:

- `sap_invoice` for every line
- `sap_credit_memo` for S8
- `remittance_advice` for every line
- `customer_po` for S6
- `contract_pricing` for S6
- `contract_sla` for S4/S5
- `tpm_promo` and `tpm_accrual` for S2/S7
- `pod` for S3/S4/S5
- `carrier_damage_report` and `carrier_photo` for S1
- `bureau_alert` and `payment_history` for every line

Generated SAP-shaped fallback rows must use `provenance: "source_generated"`. A row may use `provenance: "sap_odata"` only when it was retrieved from the configured SAP OData adapter.

The materializer may keep S1-S8 labels in test fixtures or comments, but `DeductionClaim` objects and `recoup_deduction_claims` rows must not expose `scenarioId` or `scenario_id`. Scenario labels are offline coverage labels, not runtime evidence.

- [x] **Step 3: Implement Supabase upsert repository**

`src/services/evidenceRepository.ts` must upsert:

- `recoup_evidence_documents`
- `recoup_evidence_links`
- `recoup_deduction_claims`

The unit test must assert the request body never serializes `SUPABASE_SERVICE_ROLE_KEY`.

- [x] **Step 4: Add bounded scripts**

Add scripts:

```json
{
  "materialize:real-evidence": "tsx scripts/materializeRealEvidenceDataset.ts",
  "verify:real-evidence": "tsx scripts/verifyRealEvidenceReadiness.ts"
}
```

Expected materialization output:

```json
{"claims":20,"documents":114}
```

Expected readiness output:

```json
{
  "claims": 20,
  "documents": 114,
  "requiredEvidenceIdsPresent": true,
  "missingEvidenceIds": []
}
```

- [x] **Step 5: Run Phase 2 checks**

Run:

```powershell
npm.cmd run test -- tests/unit/evidence-materializer.test.ts tests/unit/evidence-repository.test.ts
npm.cmd run typecheck
npm.cmd run verify
```

Expected: PASS.

**Phase 2 exit gate:** a real POD and every other listed document class can be created as Supabase evidence rows with hashes, links, provenance, and no leaked secrets. No production DML runs without explicit human approval.

**Phase 2 execution result:** PASS on 2026-07-01. RED tests failed first for missing materializer/repository modules; implementation added deterministic materialization for 20 claims, 114 canonical evidence documents, and 570 evidence links, with generated SAP-shaped fallback rows marked `source_generated`. Production upsert rows cover `recoup_evidence_documents`, `recoup_evidence_links`, and `recoup_deduction_claims`, never serialize service-role secrets in request bodies, and do not emit `scenarioId`, `scenario_id`, or `gold_scenario_id`. Bounded scripts were added: `materialize:real-evidence` prints `{"claims":20,"documents":114}` and `verify:real-evidence` prints readiness JSON with `missingEvidenceIds: []`, `proofScope: "local_materialized_dataset"`, `supabasePersistence: "not_checked"`, and `frontendMediaProof: "not_checked"`; readiness now fails closed if counts, required evidence IDs, or the local-only proof scope drift. Focused tests passed: `npm.cmd run test -- tests/unit/evidence-materializer.test.ts tests/unit/evidence-repository.test.ts` with 3 tests. `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run materialize:real-evidence`, and `npm.cmd run verify:real-evidence` passed. Fresh full `npm.cmd run verify` passed lint, typecheck, 102 Vitest files / 907 tests, dependency-cruiser, and release readiness. Phase 2 reviewer returned PASS/Ready; both reviewer warnings were closed before this result was recorded.

---

## Phase 3: Deterministic Reconciliation Engine

**Purpose:** compare independent evidence documents and derive rule inputs, receipt basis, and confidence factors.

**Files:**
- Create: `src/services/reconciliationEngine.ts`
- Create: `src/services/reconciliationReceipts.ts`
- Test: `tests/unit/reconciliation-engine.test.ts`

- [x] **Step 1: Add failing reconciliation tests**

Add tests:

```ts
it("derives shortage-pod-mismatch from POD and remittance documents", () => {
  const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
  const claim = claimByLine(dataset.claims, "S3-L1");
  const receipt = reconcileDeductionClaim({ claim, documents: dataset.documents });

  expect(receipt.ruleId).toBe("shortage-pod-mismatch");
  expect(receipt.derivedRuleInput).toMatchObject({
    claimedShortage: true,
    podSignedFullDelivery: true
  });
  expect(receipt.evidenceIds).toEqual(expect.arrayContaining(["EVD-POD-S3-L1", "EVD-REMIT-S3-L1"]));
});

it("fails closed when required evidence is missing", () => {
  const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
  const claim = claimByLine(dataset.claims, "S3-L1");
  const documents = dataset.documents.filter((document) => document.evidenceId !== "EVD-POD-S3-L1");

  expect(() => reconcileDeductionClaim({ claim, documents })).toThrow("Missing required pod evidence for S3-L1.");
});
```

Run:

```powershell
npm.cmd run test -- tests/unit/reconciliation-engine.test.ts
```

Expected: FAIL until engine exists.

- [x] **Step 2: Implement comparison rules**

The reconciliation engine must derive `RuleInput` from document payloads only. It must not read `recoup_deduction_lines.rule_input_json`, seeded `verdict`, seeded `routing`, seeded `rule_id`, legacy `scenario_id`, or `gold_scenario_id`.

Add an invariant inside `tests/unit/reconciliation-engine.test.ts`:

```ts
it("does not branch on scenario labels", () => {
  const source = readFileSync("src/services/reconciliationEngine.ts", "utf8");

  expect(source).not.toMatch(/\bscenario_id\b/i);
  expect(source).not.toMatch(/\bscenarioId\b/);
  expect(source).not.toMatch(/\bgoldScenarioId\b/);
  expect(source).not.toMatch(/\bgold_scenario_id\b/i);
});
```

Required comparisons use S1-S8 only as offline coverage labels. Production reconciliation must discover the rule from document comparison and must not branch on coverage labels.

| Coverage label | Required comparison |
|---|---|
| S1 damage | remittance claim amount vs carrier damage report and photo evidence |
| S2 promo | remittance claim amount vs TPM promo and accrual balance |
| S3 shortage | remittance shortage vs POD signed quantity and exception flag |
| S4/S5 OTIF | contract SLA terms vs POD timestamps and exception state |
| S6 pricing | customer PO price vs contract price vs SAP invoice price |
| S7 gaming promo | TPM eligibility/accrual vs cross-line payment/bureau risk context |
| S8 duplicate | remittance claim vs SAP credit memo already issued |

- [x] **Step 3: Persist reconciliation receipts**

`src/services/reconciliationReceipts.ts` must upsert `recoup_reconciliation_receipts` with:

- `receipt_id`
- `claim_id`
- `line_id`
- `rule_id`
- `derived_rule_input_json`
- `evidence_ids`
- `deterministic_basis`
- `confidence_factors`
- `content_hash`

- [x] **Step 4: Run Phase 3 checks**

Run:

```powershell
npm.cmd run test -- tests/unit/reconciliation-engine.test.ts
npm.cmd run typecheck
npm.cmd run verify
```

Expected: PASS.

**Phase 3 exit gate:** the engine derives rule inputs from persisted evidence documents and fails closed when any required source document is absent.

**Phase 3 execution result:** PASS on 2026-07-01 after reviewer remediation. RED test run first failed because `src/services/reconciliationEngine.ts` did not exist. Implementation added `reconcileDeductionClaim`, deterministic receipt hashing, and `src/services/reconciliationReceipts.ts` Supabase upsert mapping for `receipt_id`, `claim_id`, `line_id`, `rule_id`, `derived_rule_input_json`, `evidence_ids`, `deterministic_basis`, `confidence_factors`, and `content_hash`. Focused tests now cover S1-S8 representative reconciliation paths, S3-L1 missing POD fail-closed behavior, S3-L1 POD mutation sensitivity, runtime ban checks for `scenario_id`/`scenarioId`/`gold_scenario_id`/`goldScenarioId`, receipt upsert shape, missing S6 SAP invoice fail-closed behavior, and missing S7 bureau/payment-history fail-closed behavior. Initial Phase 3 reviewer Aquinas returned FAIL for two real gaps: S6 pricing omitted SAP invoice evidence, and S7 promo-overclaim treated bureau/payment context as optional. Both gaps were fixed before closeout: S6 now requires `sap_invoice`, includes `EVD-SAP-INVOICE-S6-L1`, and records SAP invoice comparison values; S7 now requires `bureau_alert` and `payment_history`, includes `EVD-BUREAU-S7-L1` and `EVD-PAYMENT-HISTORY-S7-L1`, and records risk-context comparison values. Re-review returned PASS with no remaining Phase 3 blockers. Focused gate passed: `npm.cmd run test -- tests/unit/reconciliation-engine.test.ts` with 7 tests. Fresh full `npm.cmd run verify` passed lint, typecheck, 103 Vitest files / 914 tests, dependency-cruiser with 136 modules / 440 dependencies, and release readiness.

---

## Phase 4: Forensics Runtime Cutover

**Purpose:** stop authoritative runtime Forensics from trusting pre-merged `rule_input_json`, while keeping a named shadow/rollback path available until production evidence and preview smoke have passed.

**Files:**
- Create: `config/reconciliationRollout.ts`
- Create: `src/services/reconciliationRollout.ts`
- Create: `src/services/legacyForensicsPath.ts`
- Create: `src/adapters/legacySupabaseSettlementRunReader.ts`
- Modify: `src/agents/forensics.ts`
- Modify: `src/services/serviceLayer.ts`
- Modify: `src/adapters/supabaseSyntheticSource.ts`
- Modify: `src/services/cockpitApi.ts`
- Modify: `src/services/cockpitModel.ts`
- Modify: `src/services/forensicsQuerySession.ts`
- Modify: `evals/releaseReadinessCli.ts`
- Test: `tests/unit/reconciliation-rollout.test.ts`
- Test: `tests/invariants/no-premerged-rule-input-runtime.test.ts`
- Test: `tests/invariants/no-legacy-decision-columns-runtime.test.ts`
- Test: `tests/unit/forensics.test.ts`
- Test: `tests/unit/cockpit-api.test.ts`

- [x] **Step 1: Add explicit rollout modes**

Create `config/reconciliationRollout.ts`:

```ts
import { z } from "zod";

export const ReconciliationModeSchema = z.enum(["legacy", "shadow", "canary", "authoritative"]);
export type ReconciliationMode = z.infer<typeof ReconciliationModeSchema>;

export function readReconciliationMode(env = process.env): ReconciliationMode {
  return ReconciliationModeSchema.parse(env.RECOUP_RECONCILIATION_MODE ?? "legacy");
}

export function readCanaryLines(env = process.env): Set<string> {
  return new Set((env.RECOUP_RECONCILIATION_CANARY_LINES ?? "").split(",").map((line) => line.trim()).filter(Boolean));
}
```

Create `tests/unit/reconciliation-rollout.test.ts` proving:

- production default is `legacy` rollback until receipts are explicitly promoted
- `authoritative` uses reconciliation receipts only
- `canary` uses receipts only for listed line IDs
- `legacy` is allowed only as an operational rollback mode
- legacy values are never merged into a current reconciliation receipt

- [x] **Step 2: Add invariant against pre-merged runtime inputs**

Create test assertions that:

```ts
expect(readFileSync("src/agents/forensics.ts", "utf8")).not.toContain("Supabase rule_input_json required");
expect(readFileSync("src/agents/forensics.ts", "utf8")).toContain("reconcileDeductionClaim");
expect(readFileSync("src/agents/forensics.ts", "utf8")).toContain("derivedRuleInput");
expect(readFileSync("src/agents/forensics.ts", "utf8")).not.toMatch(/\bscenario_id\b|\bscenarioId\b|\bgold_scenario_id\b|\bgoldScenarioId\b/);
```

Run:

```powershell
npm.cmd run test -- tests/invariants/no-premerged-rule-input-runtime.test.ts
```

Expected: FAIL until runtime is cut over.

- [x] **Step 3: Add legacy-column consumer audit**

Create `tests/invariants/no-legacy-decision-columns-runtime.test.ts`:

```ts
import { readFileSync } from "node:fs";

const runtimeFiles = [
  "src/agents/forensics.ts",
  "src/services/cockpitApi.ts",
  "src/services/cockpitModel.ts",
  "src/services/legacyForensicsPath.ts",
  "src/services/serviceLayer.ts",
  "src/adapters/legacySupabaseSettlementRunReader.ts",
  "src/adapters/supabaseSyntheticSource.ts",
  "cockpit/app/api/forensics/route.ts",
  "cockpit/app/api/read-model-cache.ts"
];

describe("legacy deduction decision columns are not runtime decision inputs", () => {
  it.each(runtimeFiles)("%s does not use seeded labels as decision sources", (file) => {
    const source = readFileSync(file, "utf8");

    if (file === "src/services/legacyForensicsPath.ts" || file === "src/adapters/legacySupabaseSettlementRunReader.ts") {
      expect(source).toContain("rollback only");
      return;
    }

    expect(source).not.toMatch(/recoup_deduction_lines\.(verdict|routing|rule_id|rule_input_json|scenario_id)/);
    expect(source).not.toMatch(/\bline\.(verdict|routing|ruleId|ruleInput|scenarioId)\b/);
    expect(source).not.toMatch(/\brow\.(verdict|routing|rule_id|rule_input_json|scenario_id)\b/);
    expect(source).not.toMatch(/\bparsed\.(verdict|routing|rule_id|rule_input_json|scenario_id)\b/);
    expect(source).not.toMatch(/\bsettlementLine\.(verdict|routing|ruleId|ruleInput|scenarioId)\b/);
  });
});
```

Run:

```powershell
npm.cmd run test -- tests/invariants/no-legacy-decision-columns-runtime.test.ts
```

Expected: FAIL until all runtime readers are audited and cut over. If a file still reads a legacy column only to display historical labels in an explicitly marked admin/audit view, move that code behind a named `legacyLabelViewModel` helper and add a test proving the value is never used for current decisions.

- [x] **Step 4: Route Forensics through reconciliation receipts**

For every Forensics work item:

1. Load `recoup_deduction_claims`.
2. Load canonical evidence documents by linked line/customer/invoice IDs.
3. Derive or load `recoup_reconciliation_receipts`.
4. Build deterministic rules from `receipt.derivedRuleInput`.
5. Cite `receipt.evidenceIds` and `receipt.deterministicBasis`.
6. Publish read model only after receipt persistence succeeds.

- [x] **Step 5: Fail closed on missing reconciliation**

If claim, evidence documents, or receipt persistence is missing, return HTTP 503 and do not publish a new read model.

- [x] **Step 6: Run Phase 4 checks**

Run:

```powershell
npm.cmd run test -- tests/unit/reconciliation-rollout.test.ts tests/invariants/no-premerged-rule-input-runtime.test.ts tests/invariants/no-legacy-decision-columns-runtime.test.ts tests/unit/forensics.test.ts tests/unit/cockpit-api.test.ts
npm.cmd run typecheck
npm.cmd run verify
```

Expected: PASS.

**Phase 4 exit gate:** `recoup_deduction_lines.rule_input_json`, seeded `verdict`, seeded `routing`, seeded `rule_id`, legacy `scenario_id`, and `gold_scenario_id` are no longer authoritative runtime decision sources. Other readers have been audited, and rollback/shadow use is isolated behind named rollout modes.

**Phase 4 execution result:** PASS on 2026-07-01 after reviewer remediation and rollout-safety hardening. Initial reviewer James returned FAIL because the normal Supabase reader still consumed old `recoup_deduction_lines` decision columns, `cockpitModel.ts` still used line-level `routing`/`scenarioId` for shared rollups/worklists, API/cockpit paths did not pass receipts into normal Forensics runs, and the invariant missed `parsed.*` plus `settlementLine.*` access patterns. Remediation cut promoted Supabase runtime reads over to `recoup_deduction_claims` plus `recoup_reconciliation_receipts`, isolated the old table reader in `src/adapters/legacySupabaseSettlementRunReader.ts` with an explicit `rollback only` marker, made `RECOUP_RECONCILIATION_MODE` default to `legacy` to avoid production outage before production backfill, and added an authoritative API test proving `/forensics/refresh` reads claims/receipts and not `recoup_deduction_lines`. James then found one remaining blocker: `/approval` recomputed pending Forensics actions without passing reconciliation receipts. That was fixed by carrying `reconciliation` on `ServiceInvocationContext`, passing it through `prepareApprovalDecision`, and extending the authoritative API test to approve the selected draft while still asserting no `recoup_deduction_lines` call occurs. `cockpitModel.ts` now derives recovery/billing rollups and worklist state from `runForensicsInvestigation` decisions and groups display cards from line IDs instead of persisted `scenario_id`. `runForensicsQuerySession`, SSE/cache validation, CFO summary, approval preparation, and `verify:release` now respect the active rollout mode. An intermediate full `npm.cmd run verify` failed at `verify:release` with HTTP 404 for `recoup_reconciliation_receipts`, proving the Phase 5.5 deployment-sequencing risk was real. After the rollback-mode selector was added, fresh full `npm.cmd run verify` passed: lint, typecheck, 106 Vitest files / 931 tests, dependency-cruiser clean with 140 modules / 461 dependencies, and release readiness passed. Focused Phase 4 gate also passed: 8 files / 235 tests.

---

## Phase 5: Ingestion Automation And Freshness Controls

**Purpose:** make data freshness explicit and remove manual SAP provisioning.

**Files:**
- Modify: `scripts/provisionSupabaseSapEvidenceRows.ts`
- Create: `scripts/refreshRealEvidencePipeline.ts`
- Create: `src/services/evidenceFreshness.ts`
- Modify: `src/services/cockpitApi.ts`
- Modify: `src/memory/supabaseStore.ts`
- Modify: `render.yaml`
- Modify: `package.json`
- Test: `tests/unit/source-freshness.test.ts`
- Test: `tests/unit/cockpit-api.test.ts`
- Test: `tests/unit/real-evidence-refresh-pipeline.test.ts`

- [x] **Step 1: Convert SAP provisioning from SQL output to repository upsert**

The SAP ingestion path must:

1. Use configured `SAP_ODATA_BASE_URL` without printing env values.
2. Pull invoice/credit evidence through the read-only SAP OData adapter.
3. Upsert canonical evidence documents through `evidenceRepository`.
4. Mark live SAP rows with `provenance: "sap_odata"`.
5. Preserve generated fallback rows as `source_generated` when live SAP is unavailable.

Implementation note: `scripts/refreshRealEvidencePipeline.ts` now performs the repository-upsert refresh path for canonical evidence documents, evidence links, deduction claims, and reconciliation receipts. It preserves generated SAP-shaped fallback evidence as `source_generated` until the live SAP OData source mapping is explicitly run against configured production sources; no production DML was executed in this phase.

- [x] **Step 2: Add freshness metadata**

Store:

- source table name
- latest source row timestamp
- source payload hash
- read model generated timestamp
- reconciliation receipt hash set
- cache status: `hit`, `miss`, `refresh`, `stale`

- [x] **Step 3: Confirm intake and freshness for every evidence source**

Create `src/services/evidenceFreshness.ts` with a source inventory that covers every canonical evidence type:

```ts
export const REQUIRED_EVIDENCE_FRESHNESS_SOURCES = [
  { documentType: "sap_invoice", sourceSystem: "sap_odata", freshnessMode: "adapter_timestamp_or_payload_hash" },
  { documentType: "sap_credit_memo", sourceSystem: "sap_odata", freshnessMode: "adapter_timestamp_or_payload_hash" },
  { documentType: "remittance_advice", sourceSystem: "remittance", freshnessMode: "source_payload_hash" },
  { documentType: "edi_812", sourceSystem: "edi", freshnessMode: "source_payload_hash" },
  { documentType: "pod", sourceSystem: "three_pl", freshnessMode: "document_hash_and_retrieved_at" },
  { documentType: "carrier_damage_report", sourceSystem: "carrier", freshnessMode: "document_hash_and_retrieved_at" },
  { documentType: "carrier_photo", sourceSystem: "carrier", freshnessMode: "document_hash_and_retrieved_at" },
  { documentType: "customer_po", sourceSystem: "customer_po", freshnessMode: "document_hash_and_valid_window" },
  { documentType: "contract_pricing", sourceSystem: "contract_repo", freshnessMode: "document_hash_and_valid_window" },
  { documentType: "contract_sla", sourceSystem: "contract_repo", freshnessMode: "document_hash_and_valid_window" },
  { documentType: "tpm_promo", sourceSystem: "tpm", freshnessMode: "document_hash_and_valid_window" },
  { documentType: "tpm_accrual", sourceSystem: "tpm", freshnessMode: "document_hash_and_retrieved_at" },
  { documentType: "bureau_alert", sourceSystem: "bureau", freshnessMode: "document_hash_and_retrieved_at" },
  { documentType: "payment_history", sourceSystem: "payment_history", freshnessMode: "document_hash_and_retrieved_at" }
] as const;
```

Add `tests/unit/source-freshness.test.ts`:

```ts
import { REQUIRED_EVIDENCE_FRESHNESS_SOURCES } from "../../src/services/evidenceFreshness.js";

it("tracks freshness for every canonical evidence type, not only SAP", () => {
  expect(REQUIRED_EVIDENCE_FRESHNESS_SOURCES.map((source) => source.documentType).sort()).toEqual([
    "bureau_alert",
    "carrier_damage_report",
    "carrier_photo",
    "contract_pricing",
    "contract_sla",
    "customer_po",
    "edi_812",
    "payment_history",
    "pod",
    "remittance_advice",
    "sap_credit_memo",
    "sap_invoice",
    "tpm_accrual",
    "tpm_promo"
  ]);
});
```

- [x] **Step 4: Enforce freshness in `GET /forensics`**

`GET /forensics` must:

1. Compare read-model source hashes/timestamps with current evidence/receipt state for every entry in `REQUIRED_EVIDENCE_FRESHNESS_SOURCES`.
2. Serve cached response only when hashes match and age is within configured TTL.
3. Return explicit stale/refresh status when source changed.
4. Never silently serve stale data as current.

- [x] **Step 5: Keep Render job manual until cutover approval**

Add a scheduled job command only after explicit cutover approval:

```yaml
startCommand: npm run refresh:real-evidence
```

Do not deploy, schedule, or create Render resources without explicit human approval. Current local implementation keeps `refresh:real-evidence` as an approval-gated package script only; it is not scheduled in `render.yaml`.

- [x] **Step 6: Run Phase 5 checks**

Run:

```powershell
npm.cmd run test -- tests/unit/source-freshness.test.ts tests/unit/cockpit-api.test.ts tests/unit/real-evidence-refresh-pipeline.test.ts
npm.cmd run typecheck
npm.cmd run verify
```

Expected: PASS.

**Phase 5 exit gate:** SAP and every non-SAP evidence source have observable freshness metadata, automated intake or explicit source-generated provenance, and fail-closed cache behavior instead of depending on a human-applied SQL file.

**Phase 5 execution result:** PASS locally on 2026-07-01 after reviewer remediation. Added `src/services/evidenceFreshness.ts` with all 14 canonical evidence-source freshness entries and deterministic Forensics read-model fingerprints that include source table identity, line event hashes, raw source-row freshness hashes, service evidence document hashes, and reconciliation receipt content/basis/confidence hashes. Express `GET /forensics` hydrates current source state with cache bypass before serving a cached read model; it returns `hit` only when `source_record_ids_json` matches the current fingerprint, returns `stale` and republishes when hashes differ, and fails closed when current source rows cannot be verified. Next `/api/forensics` now delegates to backend `/forensics` instead of serving a direct Supabase read-model hit. Added `scripts/refreshRealEvidencePipeline.ts` and `npm run refresh:real-evidence`; the script fails closed unless `RECOUP_REAL_EVIDENCE_REFRESH_APPROVED=approve-real-evidence-refresh` is present. No Render cron is scheduled for real-evidence refresh, no Render resource was created, and no provider deployment was run. Focused post-review verification passed: `npm.cmd run test -- tests/unit/realtime-next-routes.test.ts tests/unit/source-freshness.test.ts tests/unit/real-evidence-refresh-pipeline.test.ts tests/unit/reconciliation-cutover-preflight.test.ts tests/invariants/deployment-readiness.test.ts` (`5` files / `54` tests) and `npm.cmd run typecheck`. Full post-review `npm.cmd run verify` passed: lint, typecheck, 109 Vitest files / 942 tests, dependency-cruiser clean with 141 modules / 470 dependencies, and release readiness passed.

---

## Phase 5.5: Production Backfill And Cutover Preflight

**Purpose:** prevent the concrete outage mode where Phase 4+ fail-closed code reaches production before production Supabase has the required evidence and receipts.

**Files:**
- Create: `scripts/preflightReconciliationCutover.ts`
- Modify: `package.json`
- Test: `tests/unit/reconciliation-cutover-preflight.test.ts`

- [x] **Step 1: Add a production cutover preflight**

Create `scripts/preflightReconciliationCutover.ts`. It must read only sanitized counts, IDs, hashes, timestamps, and missing-record lists. It must fail unless production Supabase has:

```json
{
  "claims": 20,
  "documentsMinimum": 114,
  "receipts": 20,
  "requiredEvidenceIdsPresent": true,
  "requiredReceiptIdsPresent": true,
  "missingEvidenceIds": [],
  "missingReceiptIds": []
}
```

The script must not print row payloads, secrets, customer-sensitive free text, service-role keys, cookies, auth headers, or env values.

- [x] **Step 2: Add deployment sequencing gates**

The release order is:

1. Deploy schema and code with `RECOUP_RECONCILIATION_MODE=shadow`.
2. With explicit human approval, run production materialization/backfill.
3. Run `verify:real-evidence -- --target=production`.
4. Run `preflight:reconciliation-cutover -- --target=production`.
5. Enable `RECOUP_RECONCILIATION_MODE=canary` only for approved line IDs in `RECOUP_RECONCILIATION_CANARY_LINES`.
6. Run canary smoke and compare shadow vs receipt output for the approved lines.
7. Enable `RECOUP_RECONCILIATION_MODE=authoritative` only after preview, canary, shared-route smoke, and full verify pass.

If Step 2.3 or Step 2.4 fails, keep production in `shadow` or switch to `legacy`; do not serve fail-closed 503s as the default user experience.

- [x] **Step 3: Add rollback proof**

Document and test rollback:

```powershell
$env:RECOUP_RECONCILIATION_MODE="legacy"
npm.cmd run test -- tests/unit/reconciliation-rollout.test.ts
```

Production rollback requires explicit human approval, env change through the provider, redeploy or restart as required by the provider, and shared-route smoke after the mode change. The rollback path must be recorded as operational continuity, not final acceptance.

- [x] **Step 4: Add scripts and checks**

Add scripts:

```json
{
  "preflight:reconciliation-cutover": "tsx scripts/preflightReconciliationCutover.ts"
}
```

Run:

```powershell
npm.cmd run test -- tests/unit/reconciliation-cutover-preflight.test.ts tests/unit/reconciliation-rollout.test.ts
npm.cmd run typecheck
npm.cmd run verify
```

Expected: PASS.

**Phase 5.5 exit gate:** production cannot move to `authoritative` until evidence/claim/receipt counts and required IDs prove the data exists. If backfill is absent or incomplete, production remains `shadow` or `legacy` and the public alias is not declared fixed.

**Phase 5.5 execution result:** PASS locally on 2026-07-01 after reviewer remediation; refreshed with read-only production binding proof on 2026-07-02. Added `scripts/preflightReconciliationCutover.ts` and `npm run preflight:reconciliation-cutover`; the preflight performs read-only Supabase REST probes selecting only claim IDs/line IDs, evidence IDs/content hashes/timestamps, and receipt IDs/content hashes/timestamps. It fails unless the target has 20 claims, at least 114 evidence documents, 20 receipts, all expected evidence IDs, all expected `RECON-*` receipt IDs, and matching evidence/receipt `content_hash` values. `--target=production` also requires `RECOUP_PRODUCTION_SUPABASE_PROJECT_REF` to match the configured Supabase URL host. Unit coverage proves missing evidence/receipt IDs, mismatched hashes, and wrong production project refs fail closed while formatted output omits service-role keys, payload JSON, and derived rule-input JSON. Local `.env.local` now has the non-secret production project-ref binding, so production-target preflight passes by default with 20 claims, 114 evidence documents, and 20 receipts. No production backfill, provider env change, rollout-mode promotion, or deploy was run.

---

## Phase 6: Browser Update Path And Visible Provenance

**Purpose:** already-open cockpit tabs must know when business data changes, and users must see real evidence provenance.

**Files:**
- Modify: `cockpit/app/api/forensics/route.ts`
- Create: `cockpit/app/api/forensics/events/route.ts`
- Modify: `cockpit/app/api/read-model-cache.ts`
- Modify: `cockpit/components/maya/maya-forensics-surface-loader.tsx`
- Modify: `cockpit/components/maya/maya-forensics-surface.tsx`
- Modify: `cockpit/components/maya/query-evidence-dock.tsx`
- Modify: `src/services/cockpitModel.ts`
- Test: `tests/unit/realtime-next-routes.test.ts`
- Test: `tests/e2e/maya-real-evidence-e2e.ts`

- [x] **Step 1: Add Server-Sent Events invalidation path**

Use Server-Sent Events for Forensics business-data invalidation. Do not choose Supabase Realtime or interval polling for the primary implementation in this phase.

Create `cockpit/app/api/forensics/events/route.ts`:

```ts
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("event: connected\ndata: {\"status\":\"connected\"}\n\n"));
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
```

Wire the Maya Forensics loader to:

```ts
const events = new EventSource("/api/forensics/events");
events.addEventListener("forensics-read-model-invalidated", () => {
  void loadForensics({ forceRefresh: false, reason: "sse-invalidation" });
});
```

The SSE event must update business Forensics data, not only connector/source health. Polling is allowed only as a degraded fallback after SSE error, and the UI must show visible stale state while degraded.

- [x] **Step 2: Emit invalidation after read-model source hash changes**

When `cockpit/app/api/read-model-cache.ts` detects a new evidence hash set or reconciliation receipt hash set, publish an SSE event:

```ts
const event = {
  type: "forensics-read-model-invalidated",
  sourceHash: nextSourceHash,
  receiptHash: nextReceiptHash,
  generatedAt: new Date().toISOString()
};
```

The client handler must ignore events whose `sourceHash` and `receiptHash` match the currently displayed model and reload only when at least one hash changed.

Add `tests/unit/realtime-next-routes.test.ts` coverage:

```ts
it("exposes a Forensics SSE route for business read-model invalidation", async () => {
  const response = await GET();

  expect(response.headers.get("Content-Type")).toContain("text/event-stream");
  await expect(response.text()).resolves.toContain("connected");
});
```

- [x] **Step 3: Show evidence and receipt provenance**

Maya evidence and worklist views must expose:

- `EVD-*` evidence IDs
- `RECON-*` receipt IDs
- actual POD PDF/image/media preview or safe link
- actual contract/remittance/credit memo document preview or safe link when those documents are cited
- source system
- provenance
- content hash
- storage URI or safe document URL
- source freshness
- deterministic comparison basis

The UI must not show `rule_input_json` as business language.

- [x] **Step 4: Add browser acceptance test**

Test:

```ts
await expect(page.getByText("EVD-POD-S3-L1")).toBeVisible();
await expect(page.getByText("RECON-S3-L1")).toBeVisible();
await expect(page.getByText(/canonical evidence document comparison/i)).toBeVisible();
await expect(page.getByText(/rule_input_json/i)).toHaveCount(0);

const podPreview = page.locator("[data-testid='pod-document-preview'], img[alt*='POD'], iframe[src*='pod'], a[href*='pod']").first();
await expect(podPreview).toBeVisible();
```

Run:

```powershell
npm.cmd run test:e2e:maya-real
npm.cmd run typecheck
npm.cmd run verify
```

Expected after approved evidence/receipt readiness: PASS.

**Phase 6 exit gate:** the browser can prove that displayed decisions come from persisted source evidence and reconciliation receipts, and stale business data is visible as stale.

**Phase 6 execution result:** PARTIAL PASS / RELEASE BLOCKED on 2026-07-01. The local code path now includes business SSE invalidation, hash-header comparison, visible stale/degraded UI wiring, canonical evidence/receipt provenance display, and a Supabase authoritative reader for claims, evidence documents, evidence links, and reconciliation receipts. Fresh local regression gates passed: `npm.cmd run lint`, `npm.cmd run typecheck`, focused 3-file/199-test unit coverage, and full `npm.cmd run verify` with 109 Vitest files / 947 tests plus dependency-cruiser and release readiness. Browser e2e remains fail-closed because the configured real Supabase source rows are not yet valid for authoritative canonical evidence: `npm.cmd run test:e2e:maya-real` returned HTTP 503 from `/forensics` with `missingSource: "supabase-settlement-source-rows"` and correlation ID `46a9cadb-7246-45b1-b16a-773132af76a3`. Do not promote this phase to production until `materialize:real-evidence`, `verify:real-evidence`, and `preflight:reconciliation-cutover -- --target=production` pass against the approved production project after explicit human approval.

---

## Phase 6.5: Test Hardening And Visual Regression Gate

**Purpose:** prove the core claims with automated tests before production closeout: real reconciliation, sensitivity to source evidence changes, real SSE live updates, degraded/stale-state UI, pixel-diff visual regression, responsive/cross-browser behavior, focused accessibility checks, and shared cockpit surface regression safety.

**Files:**
- Create: `tests/unit/reconciliation-engine-matrix.test.ts`
- Create: `tests/unit/reconciliation-mutation.test.ts`
- Create: `tests/unit/reconciliation-receipt-basis.test.ts`
- Create: `tests/unit/reconciliation-fail-closed-matrix.test.ts`
- Create: `tests/unit/sap-fallback.test.ts`
- Create: `tests/e2e/forensics-sse-live-update-e2e.ts`
- Create: `tests/e2e/maya-stale-state-e2e.ts`
- Create: `tests/e2e/maya-real-evidence-visual-regression-e2e.ts`
- Create: `tests/e2e/shared-cockpit-surfaces-regression-e2e.ts`
- Create: `scripts/compareEvidenceScreenshots.ts`
- Create: `scripts/checkEvidenceUiAccessibility.ts`
- Modify: `package.json`

- [x] **Step 1: Add full reconciliation requirements-table coverage**

Create `tests/unit/reconciliation-engine-matrix.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { materializeRealEvidenceDataset } from "../../src/services/evidenceMaterializer.js";
import { reconcileDeductionClaim } from "../../src/services/reconciliationEngine.js";

const requiredCases = [
  { lineId: "S1-L1", ruleId: "damage-evidence-valid", evidenceIds: ["EVD-CARRIER-REPORT-S1-L1", "EVD-CARRIER-PHOTO-S1-L1", "EVD-REMIT-S1-L1"] },
  { lineId: "S2-L1", ruleId: "promo-not-captured", evidenceIds: ["EVD-TPM-PROMO-S2-L1", "EVD-TPM-ACCRUAL-S2-L1", "EVD-REMIT-S2-L1"] },
  { lineId: "S3-L1", ruleId: "shortage-pod-mismatch", evidenceIds: ["EVD-POD-S3-L1", "EVD-REMIT-S3-L1"] },
  { lineId: "S4-L1", ruleId: "otif-fine-valid", evidenceIds: ["EVD-CONTRACT-SLA-S4-L1", "EVD-POD-S4-L1", "EVD-REMIT-S4-L1"] },
  { lineId: "S5-L1", ruleId: "otif-timestamp-mismatch", evidenceIds: ["EVD-CONTRACT-SLA-S5-L1", "EVD-POD-S5-L1", "EVD-REMIT-S5-L1"] },
  { lineId: "S6-L1", ruleId: "pricing-below-contract", evidenceIds: ["EVD-CUSTOMER-PO-S6-L1", "EVD-CONTRACT-PRICING-S6-L1", "EVD-SAP-INVOICE-S6-L1", "EVD-REMIT-S6-L1"] },
  { lineId: "S7-L1", ruleId: "promo-overclaim", evidenceIds: ["EVD-TPM-PROMO-S7-L1", "EVD-TPM-ACCRUAL-S7-L1", "EVD-BUREAU-S7-L1", "EVD-PAYMENT-HISTORY-S7-L1", "EVD-REMIT-S7-L1"] },
  { lineId: "S8-L1", ruleId: "duplicate-credit", evidenceIds: ["EVD-SAP-CREDIT-MEMO-S8-L1", "EVD-REMIT-S8-L1"] }
] as const;

describe("reconciliation requirements matrix", () => {
  it.each(requiredCases)("derives $ruleId for $lineId from source evidence", ({ lineId, ruleId, evidenceIds }) => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
    const claim = dataset.claims.find((item) => item.lineId === lineId);
    expect(claim).toBeDefined();

    const receipt = reconcileDeductionClaim({ claim: claim!, documents: dataset.documents });

    expect(receipt.ruleId).toBe(ruleId);
    expect(receipt.evidenceIds).toEqual(expect.arrayContaining(evidenceIds));
    expect(receipt.deterministicBasis["comparedEvidenceIds"]).toEqual(expect.arrayContaining(evidenceIds));
    expect(receipt.confidenceFactors["allRequiredEvidencePresent"]).toBe(true);
  });
});
```

Run:

```powershell
npm.cmd run test -- tests/unit/reconciliation-engine-matrix.test.ts
```

Expected: PASS after Phase 6.5 unit hardening.

- [x] **Step 2: Add mutation/sensitivity tests**

Create `tests/unit/reconciliation-mutation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CanonicalEvidenceDocumentSchema, evidenceContentHash, type CanonicalEvidenceDocument } from "../../src/types/evidence.js";
import { materializeRealEvidenceDataset } from "../../src/services/evidenceMaterializer.js";
import { reconcileDeductionClaim } from "../../src/services/reconciliationEngine.js";

function mutatePayload(documents: CanonicalEvidenceDocument[], evidenceId: string, payloadPatch: Record<string, unknown>): CanonicalEvidenceDocument[] {
  return documents.map((document) =>
    document.evidenceId === evidenceId
      ? CanonicalEvidenceDocumentSchema.parse({
          ...document,
          payload: { ...document.payload, ...payloadPatch },
          contentHash: evidenceContentHash({ ...document.payload, ...payloadPatch })
        })
      : document
  );
}

describe("reconciliation sensitivity", () => {
  it("changes shortage basis when POD no longer supports full delivery", () => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
    const claim = dataset.claims.find((item) => item.lineId === "S3-L1")!;
    const baseline = reconcileDeductionClaim({ claim, documents: dataset.documents });
    const mutatedDocuments = mutatePayload(dataset.documents, "EVD-POD-S3-L1", {
      podSignedFullDelivery: false
    });

    expect(baseline.derivedRuleInput).toEqual(expect.objectContaining({ podSignedFullDelivery: true }));
    expect(() => reconcileDeductionClaim({ claim, documents: mutatedDocuments })).toThrow(
      "Unable to derive reconciliation rule for S3-L1 from evidence documents."
    );
  });

  it("changes duplicate-credit basis when SAP credit memo is removed", () => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
    const claim = dataset.claims.find((item) => item.lineId === "S8-L1")!;
    const mutatedDocuments = dataset.documents.filter((document) => document.evidenceId !== "EVD-SAP-CREDIT-MEMO-S8-L1");

    expect(() => reconcileDeductionClaim({ claim, documents: mutatedDocuments })).toThrow("Missing required sap_credit_memo evidence for S8-L1.");
  });
});
```

Run:

```powershell
npm.cmd run test -- tests/unit/reconciliation-mutation.test.ts
```

Expected: PASS after Phase 6.5 unit hardening.

- [x] **Step 3: Assert receipt basis and confidence factors**

Create `tests/unit/reconciliation-receipt-basis.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { materializeRealEvidenceDataset } from "../../src/services/evidenceMaterializer.js";
import { reconcileDeductionClaim } from "../../src/services/reconciliationEngine.js";

describe("reconciliation receipt basis", () => {
  it("stores non-placeholder deterministic basis and confidence factors", () => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
    const claim = dataset.claims.find((item) => item.lineId === "S6-L1")!;
    const receipt = reconcileDeductionClaim({ claim, documents: dataset.documents });
    const serialized = JSON.stringify(receipt);

    expect(receipt.deterministicBasis["comparedEvidenceIds"]).toEqual(expect.arrayContaining([
      "EVD-CUSTOMER-PO-S6-L1",
      "EVD-CONTRACT-PRICING-S6-L1",
      "EVD-SAP-INVOICE-S6-L1",
      "EVD-REMIT-S6-L1"
    ]));
    expect(receipt.deterministicBasis["inputFieldEvidence"]).toEqual(expect.any(Object));
    expect(receipt.confidenceFactors["allRequiredEvidencePresent"]).toBe(true);
    expect(receipt.confidenceFactors["evidenceCount"]).toBe(4);
    expect(serialized).not.toMatch(/placeholder|stub|synthetic verdict|scenario label/i);
  });
});
```

Run:

```powershell
npm.cmd run test -- tests/unit/reconciliation-receipt-basis.test.ts
```

Expected: PASS after Phase 6.5 unit hardening.

- [x] **Step 4: Add fail-closed matrix for missing evidence**

Create `tests/unit/reconciliation-fail-closed-matrix.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { materializeRealEvidenceDataset } from "../../src/services/evidenceMaterializer.js";
import { reconcileDeductionClaim } from "../../src/services/reconciliationEngine.js";

const missingEvidenceCases = [
  { lineId: "S2-L1", evidenceId: "EVD-TPM-PROMO-S2-L1", message: "Missing required tpm_promo evidence for S2-L1." },
  { lineId: "S3-L1", evidenceId: "EVD-POD-S3-L1", message: "Missing required pod evidence for S3-L1." },
  { lineId: "S4-L1", evidenceId: "EVD-CONTRACT-SLA-S4-L1", message: "Missing required contract_sla evidence for S4-L1." },
  { lineId: "S6-L1", evidenceId: "EVD-CONTRACT-PRICING-S6-L1", message: "Missing required contract_pricing evidence for S6-L1." },
  { lineId: "S8-L1", evidenceId: "EVD-REMIT-S8-L1", message: "Missing required remittance_advice evidence for S8-L1." },
  { lineId: "S8-L1", evidenceId: "EVD-SAP-CREDIT-MEMO-S8-L1", message: "Missing required sap_credit_memo evidence for S8-L1." }
] as const;

describe("reconciliation fail-closed matrix", () => {
  it.each(missingEvidenceCases)("fails closed for $evidenceId", ({ lineId, evidenceId, message }) => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
    const claim = dataset.claims.find((item) => item.lineId === lineId)!;
    const documents = dataset.documents.filter((document) => document.evidenceId !== evidenceId);

    expect(() => reconcileDeductionClaim({ claim, documents })).toThrow(message);
  });
});
```

Run:

```powershell
npm.cmd run test -- tests/unit/reconciliation-fail-closed-matrix.test.ts
```

Expected: PASS after Phase 6.5 unit hardening.

- [x] **Step 5: Add SAP fallback behavior test**

Create `tests/unit/sap-fallback.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { materializeRealEvidenceDataset } from "../../src/services/evidenceMaterializer.js";

describe("SAP OData fallback provenance", () => {
  it("keeps generated SAP-shaped rows source_generated until live SAP OData retrieval replaces them", () => {
    const dataset = materializeRealEvidenceDataset({ retrievedAt: "2026-06-18T00:00:00.000Z" });
    const sapInvoice = dataset.documents.find((document) => document.evidenceId === "EVD-SAP-INVOICE-S3-L1");

    expect(sapInvoice).toMatchObject({
      documentType: "sap_invoice",
      sourceSystem: "sap_odata",
      provenance: "source_generated"
    });
  });
});
```

Run:

```powershell
npm.cmd run test -- tests/unit/sap-fallback.test.ts
```

Expected: PASS after Phase 6.5 unit hardening.

- **Phase 6.5 Steps 1-5 execution result:** PASS on 2026-07-01 after reviewer remediation. Added `tests/unit/reconciliation-engine-matrix.test.ts`, `tests/unit/reconciliation-mutation.test.ts`, `tests/unit/reconciliation-receipt-basis.test.ts`, `tests/unit/reconciliation-fail-closed-matrix.test.ts`, and `tests/unit/sap-fallback.test.ts`; added the `npm.cmd run test:reconciliation:matrix` script; aligned generated SAP-shaped fallback evidence to `sourceSystem: "sap_odata"` with `provenance: "source_generated"`; and tightened missing-evidence errors for TPM, contract SLA, contract pricing, remittance, POD, and SAP credit memo paths. Reviewer Tesla found one Important downstream provenance risk: generated SAP-shaped fallback rows could render as live SAP retrieval because the UI source kind previously treated `sourceSystem: "sap_odata"` as live SAP. Remediation now derives canonical evidence UI `sourceKind` from `document.provenance === "sap_odata"`, keeps generated fallback as source-backed/Supabase provenance with a `source_generated fallback` source name, gives SAP-shaped docs `S#` citations, and aligns payment-history freshness source naming. Fresh gates passed: `npm.cmd run test:reconciliation:matrix` with 5 files / 18 tests, review-remediation focused tests with 4 files / 47 tests, `npm.cmd run lint`, `npm.cmd run typecheck`, and full `npm.cmd run verify` with 114 Vitest files / 966 tests, dependency-cruiser clean, and release readiness passed. Phase 6.5 Steps 6-11 remain pending.

- [x] **Step 6: Add SSE live-update integration test**

Create `tests/e2e/forensics-sse-live-update-e2e.ts`:

```ts
import { chromium } from "playwright";

async function main(): Promise<void> {
  const baseUrl = process.env.RECOUP_E2E_BASE_URL ?? "http://localhost:3000";
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  await page.goto(`${baseUrl}/forensics/shadcn`, { waitUntil: "networkidle" });
  await page.getByText("EVD-POD-S3-L1").waitFor({ state: "visible" });
  const beforeHash = await page.locator("[data-testid='forensics-source-hash']").innerText();

  await page.evaluate(() => {
    window.dispatchEvent(new MessageEvent("forensics-read-model-invalidated", {
      data: { sourceHash: "test-updated-source-hash", receiptHash: "test-updated-receipt-hash" }
    }));
  });

  await page.locator("[data-testid='forensics-source-hash']").waitFor({ state: "visible" });
  const afterHash = await page.locator("[data-testid='forensics-source-hash']").innerText();

  if (afterHash === beforeHash) {
    throw new Error("SSE invalidation did not visibly update the open Forensics tab.");
  }

  await page.screenshot({ path: "docs/audit/real-evidence-post-implementation/2026-07-01/screenshots/sse-live-update-after.png", fullPage: true });
  await browser.close();
}

void main();
```

Run:

```powershell
npm.cmd run test:e2e:forensics-sse-live-update
```

Expected: FAIL until an invalidation event changes the visible page state in an already-open tab.

- [x] **Step 7: Add degraded/stale-state visual e2e**

Create `tests/e2e/maya-stale-state-e2e.ts`:

```ts
import { chromium } from "playwright";

async function main(): Promise<void> {
  const baseUrl = process.env.RECOUP_E2E_BASE_URL ?? "http://localhost:3000";
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  await page.route("**/api/forensics/events", (route) => route.abort());
  await page.goto(`${baseUrl}/forensics/shadcn`, { waitUntil: "networkidle" });

  await page.getByTestId("forensics-stale-state").waitFor({ state: "visible" });
  await page.getByText(/live updates degraded/i).waitFor({ state: "visible" });
  await page.screenshot({ path: "docs/audit/real-evidence-post-implementation/2026-07-01/screenshots/stale-state-degraded.png", fullPage: true });

  await browser.close();
}

void main();
```

Run:

```powershell
npm.cmd run test:e2e:maya-stale-state
```

Expected: FAIL until SSE failure produces a visible degraded/stale-state UI.

- [x] **Step 8: Add automated screenshot pixel diff**

Create `scripts/compareEvidenceScreenshots.ts` using browser canvas so no new image-diff dependency is required:

```ts
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

interface DiffInput {
  route: string;
  baselinePath: string;
  postPath: string;
  maxChangedPixelRatio: number;
}

const inputs: DiffInput[] = [
  {
    route: "maya-selected-case",
    baselinePath: "docs/audit/real-evidence-baseline/2026-07-01/screenshots/04-forensics-selected-case.png",
    postPath: "docs/audit/real-evidence-post-implementation/2026-07-01/screenshots/04-forensics-selected-case.png",
    maxChangedPixelRatio: 0.35
  }
];

async function asDataUrl(path: string): Promise<string> {
  const bytes = await readFile(path);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const results = [];

  for (const input of inputs) {
    const baselineUrl = await asDataUrl(input.baselinePath);
    const postUrl = await asDataUrl(input.postPath);
    const result = await page.evaluate(
      async ({ baselineUrl, postUrl, maxChangedPixelRatio }) => {
        async function load(url: string): Promise<HTMLImageElement> {
          const image = new Image();
          image.src = url;
          await image.decode();
          return image;
        }

        const baseline = await load(baselineUrl);
        const post = await load(postUrl);
        const width = Math.min(baseline.naturalWidth, post.naturalWidth);
        const height = Math.min(baseline.naturalHeight, post.naturalHeight);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d")!;
        canvas.width = width;
        canvas.height = height;

        context.drawImage(baseline, 0, 0, width, height);
        const first = context.getImageData(0, 0, width, height).data;
        context.clearRect(0, 0, width, height);
        context.drawImage(post, 0, 0, width, height);
        const second = context.getImageData(0, 0, width, height).data;

        let changed = 0;
        for (let index = 0; index < first.length; index += 4) {
          const delta =
            Math.abs(first[index] - second[index]) +
            Math.abs(first[index + 1] - second[index + 1]) +
            Math.abs(first[index + 2] - second[index + 2]);
          if (delta > 48) changed += 1;
        }

        const changedPixelRatio = changed / (width * height);
        return { changedPixelRatio, pass: changedPixelRatio <= maxChangedPixelRatio };
      },
      { baselineUrl, postUrl, maxChangedPixelRatio: input.maxChangedPixelRatio }
    );

    results.push({ ...input, ...result });
  }

  await writeFile("docs/audit/real-evidence-comparison/2026-07-01-visual-diff.json", JSON.stringify(results, null, 2));
  await browser.close();

  const failed = results.filter((result) => !result.pass);
  if (failed.length > 0) {
    throw new Error(`Visual diff failed for ${failed.map((result) => result.route).join(", ")}`);
  }
}

void main();
```

Run:

```powershell
npm.cmd run verify:real-evidence-visual
```

Expected: FAIL until baseline and post screenshots are present and the automated diff result passes.

- [x] **Step 9: Add responsive, cross-browser, and focused accessibility checks**

Create `scripts/checkEvidenceUiAccessibility.ts`:

```ts
import { chromium, firefox, webkit, type BrowserType } from "playwright";

const viewports = [
  { width: 390, height: 844, label: "mobile" },
  { width: 768, height: 1024, label: "tablet" },
  { width: 1440, height: 1100, label: "desktop" }
];

const browsers: Array<[string, BrowserType]> = [
  ["chromium", chromium],
  ["firefox", firefox],
  ["webkit", webkit]
];

function relativeLuminance(rgb: string): number {
  const [r, g, b] = rgb.match(/\d+/g)!.slice(0, 3).map(Number).map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function main(): Promise<void> {
  const baseUrl = process.env.RECOUP_E2E_BASE_URL ?? "http://localhost:3000";

  for (const [browserName, browserType] of browsers) {
    const browser = await browserType.launch();
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      await page.goto(`${baseUrl}/forensics/shadcn`, { waitUntil: "networkidle" });

      await page.getByText("EVD-POD-S3-L1").waitFor({ state: "visible" });
      await page.getByTestId("pod-document-preview").waitFor({ state: "visible" });

      const unlabeledButtons = await page.locator("button:not([aria-label])").count();
      if (unlabeledButtons > 0) {
        throw new Error(`${browserName}/${viewport.label}: ${unlabeledButtons} buttons lack aria-label.`);
      }

      const lowContrastCount = await page.locator("[data-a11y-check='text']").evaluateAll((nodes, relativeLuminanceSource) => {
        const relativeLuminance = new Function(`return ${relativeLuminanceSource}`)() as (rgb: string) => number;
        return nodes.filter((node) => {
          const style = getComputedStyle(node);
          const fg = relativeLuminance(style.color);
          const bg = relativeLuminance(style.backgroundColor);
          const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
          return ratio < 4.5;
        }).length;
      }, relativeLuminance.toString());

      if (lowContrastCount > 0) {
        throw new Error(`${browserName}/${viewport.label}: ${lowContrastCount} checked text nodes are below 4.5 contrast.`);
      }

      await page.screenshot({
        path: `docs/audit/real-evidence-post-implementation/2026-07-01/screenshots/${browserName}-${viewport.label}-evidence-ui.png`,
        fullPage: true
      });
    }
    await browser.close();
  }
}

void main();
```

Run:

```powershell
npm.cmd run verify:real-evidence-a11y
```

Expected: FAIL until the evidence/provenance UI works on mobile, tablet, desktop, Chromium, Firefox, and WebKit, with labeled buttons and checked text contrast.

- [x] **Step 10: Add shared cockpit surface regression smoke**

Create `tests/e2e/shared-cockpit-surfaces-regression-e2e.ts`. It must read the Phase 0 route inventory and smoke every route that was live at baseline. At minimum, it covers:

```ts
const sharedRoutes = [
  { name: "cfo", path: "/cfo", requiredText: /cfo|cash|risk|working capital/i },
  { name: "credit", path: "/credit", requiredText: /credit|risk|sentinel|customer/i },
  { name: "trace", path: "/governance/trace", requiredText: /trace|audit|hash|record/i },
  { name: "evals-finops", path: "/governance/evals-finops", requiredText: /eval|finance|gate|metric/i }
] as const;
```

The test must:

1. Skip only routes recorded as not live in the Phase 0 manifest.
2. Fail on any 5xx response.
3. Fail on browser console errors.
4. Assert a route-specific heading, landmark, or stable `data-testid`.
5. Capture a screenshot for each live shared route.
6. Compare against the baseline manifest so a Forensics change cannot hide CFO, credit, trace, or evals-finops breakage.

Run:

```powershell
npm.cmd run test:e2e:shared-surfaces
```

Expected: FAIL until shared live routes render without 5xx, console errors, blank screens, or missing route anchors.

- [x] **Step 11a: Add package scripts for the full hardening gate**

Add scripts:

```json
{
  "test:reconciliation:matrix": "vitest run --pool=threads tests/unit/reconciliation-engine-matrix.test.ts tests/unit/reconciliation-mutation.test.ts tests/unit/reconciliation-receipt-basis.test.ts tests/unit/reconciliation-fail-closed-matrix.test.ts tests/unit/sap-fallback.test.ts",
  "test:e2e:forensics-sse-live-update": "tsx tests/e2e/forensics-sse-live-update-e2e.ts",
  "test:e2e:maya-stale-state": "tsx tests/e2e/maya-stale-state-e2e.ts",
  "test:e2e:shared-surfaces": "tsx tests/e2e/shared-cockpit-surfaces-regression-e2e.ts",
  "verify:real-evidence-visual": "tsx scripts/compareEvidenceScreenshots.ts",
  "verify:real-evidence-a11y": "tsx scripts/checkEvidenceUiAccessibility.ts",
  "check:real-evidence-proof": "tsx scripts/checkRealEvidenceProofReadiness.ts",
  "verify:real-evidence-hardening": "npm run test:reconciliation:matrix && npm run test:e2e:forensics-sse-live-update && npm run test:e2e:maya-stale-state && npm run test:e2e:shared-surfaces && npm run verify:real-evidence-visual && npm run verify:real-evidence-a11y && npm run check:real-evidence-proof",
  "capture:real-evidence-audit": "tsx scripts/captureRealEvidenceAudit.ts"
}
```

Script-presence verification: `package.json` contains these commands. The end-to-end hardening command itself remains a Step 11b release gate because it requires live/preview evidence rows, post screenshots, and proof-readiness inputs.

- [ ] **Step 11b: Run full hardening gate to pass**

Run:

```powershell
npm.cmd run verify:real-evidence-hardening
npm.cmd run verify
```

Expected: `npm.cmd run verify:real-evidence-hardening` passes only after the live/preview app serves materialized canonical evidence rows, post screenshots exist, and the proof-readiness gate is unblocked.

- **Phase 6.5 Steps 6-10 execution result:** LOCAL CODED on 2026-07-01. Added `tests/e2e/real-evidence-browser-helpers.ts`, `tests/e2e/forensics-sse-live-update-e2e.ts`, `tests/e2e/maya-stale-state-e2e.ts`, `tests/e2e/shared-cockpit-surfaces-regression-e2e.ts`, `scripts/compareEvidenceScreenshots.ts`, and `scripts/checkEvidenceUiAccessibility.ts`; added `test:e2e:forensics-sse-live-update`, `test:e2e:maya-stale-state`, `test:e2e:shared-surfaces`, `verify:real-evidence-visual`, `verify:real-evidence-a11y`, and `verify:real-evidence-hardening` package scripts. The SSE e2e now exercises a real same-origin refresh path and fails unless the already-open Maya tab visibly changes its business source hash; it does not use the older window-dispatch pseudocode as proof. The stale-state e2e aborts only the browser SSE route and fails unless the visible degraded/stale banner appears. The visual diff script reads the Phase 0 production manifest and fails if post-implementation screenshots are missing or exceed the configured pixel-drift threshold. The accessibility script checks evidence/POD anchors, button accessible names, horizontal overflow, and evidence/provenance contrast across mobile, tablet, desktop, Chromium, Firefox, and WebKit. The shared-surface smoke reads the Phase 0 manifest and checks CFO, Credit, Trace, and Evals + FinOps route anchors, 5xx responses, console errors, and screenshots.

- **Phase 6.5 Steps 6-10 verification result:** LOCAL PARTIAL E2E PASS / RELEASE BLOCKED on 2026-07-01, refreshed 2026-07-02. `npm.cmd run test -- tests/unit/realtime-next-routes.test.ts` passed 1 file / 39 tests, including the new proxy-forwarded business-hash invalidation guard. `npm.cmd run test:reconciliation:matrix` passed 5 files / 18 tests. `npm.cmd run test -- tests/unit/cockpit-api.test.ts` passed 1 file / 121 tests after adding the signed CFO read-proxy proof for `/evals-finops`. `npm.cmd run typecheck` passed. `npm.cmd run test:e2e:shared-surfaces` passed after the evals-finops CFO auth bridge and duplicate React key fixes. `npm.cmd run test:e2e:maya-stale-state` passed. The hardening e2e helpers now preflight the configured browser target: with no server they fail with an explicit unreachable-target error; with localhost running, `npm.cmd run verify:real-evidence-hardening` passed the 5-file / 18-test reconciliation matrix, reached `/forensics/shadcn`, then blocked because `/api/forensics` returned HTTP 502 and `[data-testid=\"maya-shadcn-workbench\"]` never became visible. `npm.cmd run verify:real-evidence-a11y` previously reached the evidence flow and failed waiting for visible `EVD-POD-S3-L1`, so it is a real-evidence data visibility blocker rather than an accessibility pass/fail. `npm.cmd run verify:real-evidence-visual` fails closed with `docs/audit/real-evidence-comparison/2026-07-01-visual-diff.json`; partial local screenshots produce 3 route pairs passing and 16 route pairs failing, and no approved post manifest exists. `npm.cmd run check:real-evidence-proof` remains blocked by missing refresh approval, missing `RECOUP_PREVIEW_URL`, missing post manifest, and failed pixel-diff/POD-media proof routes; the default local production preflight portion is ready. Fresh full `npm.cmd run verify` passed lint, typecheck, 123 Vitest files / 1014 tests, dependency-cruiser with 141 modules / 473 dependencies, and release readiness. `npm.cmd run verify:real-evidence-hardening` is intentionally still pending because it requires a running live/preview app, approved post screenshots, and frontend POD/media proof; running it before those prerequisites should fail closed, not pass.

- **Phase 6.5 browser-hardening continuation result:** LOCAL WINDOWS PARTIAL PASS / CROSS-BROWSER RELEASE BLOCKED on 2026-07-01. Local API and cockpit were started at `http://127.0.0.1:4317` and `http://localhost:3000`. `npm.cmd run test:e2e:forensics-sse-live-update` first reached the evidence dossier and failed on a strict Playwright locator because `EVD-POD-S3-L1` legitimately appears in multiple evidence/provenance nodes; the helper now waits for any visible matching evidence ID inside the dossier and the rerun passed. `npm.cmd run test:e2e:maya-stale-state` passed. `npm.cmd run test:e2e:shared-surfaces` passed. `npm.cmd run verify:real-evidence-a11y -- --browsers=chromium` passed across the script's mobile/tablet/desktop Chromium viewports after helper fixes for hidden responsive duplicate evidence IDs, zero-rect contrast nodes, sanitized browser diagnostics, button `aria-labelledby`, hidden-button filtering, and CSS color parsing. Fresh post-fix reruns passed `npm.cmd run typecheck`, `npm.cmd run test -- tests/unit/real-evidence-doc-honesty.test.ts tests/unit/real-evidence-browser-target.test.ts tests/unit/real-evidence-comparison-doc.test.ts tests/unit/real-evidence-proof-readiness.test.ts tests/unit/real-evidence-capture-media-proof.test.ts` with 5 files / 23 tests, `npm.cmd run verify:real-evidence-a11y -- --browsers=chromium`, `npm.cmd run test:e2e:forensics-sse-live-update`, `npm.cmd run test:e2e:maya-stale-state`, and `npm.cmd run test:e2e:shared-surfaces`. The default all-browser `npm.cmd run verify:real-evidence-a11y` remains blocked rather than passed: Firefox headless launches but times out with `GraphicsCriticalError: RenderCompositorSWGL failed mapping default framebuffer` in this Windows environment after browser binaries were installed; WebKit-only release proof was not substituted. Per user instruction, cross-browser can be skipped for the local Windows pass, but the release checklist still leaves Chromium/Firefox/WebKit proof unchecked. Reviewers Meitner and Mendel reviewed the browser-hardening slice; after remediation for the final diagnostics, visibility, and contrast findings, Mendel re-reviewed and approved with no remaining findings. No production deploy, provider-env change, public alias promotion, or production Supabase mutation was performed.

- **Reviewer remediation result:** Reviewer Bacon found no critical auth/write-access issue in the CFO evals-finops signed read proxy, React key changes, or visual diff fail-closed path. Bacon flagged that route/login failures in `tests/e2e/real-evidence-browser-helpers.ts` could be reported as selector timeouts. The helper now rejects non-2xx/3xx responses, rejects `/login` redirects, opens the worklist through the current header control when needed, supports the mobile worklist row path, and reports visible button names when the worklist cannot be opened. Reviewer Faraday later found local Phase 7 wording gaps; remediation added browser-target reachability preflight to the hardening e2e helpers, added preview `capture:real-evidence-audit` to Phase 7 Step 2, tightened comparison-doc console-error wording to match `check:real-evidence-proof`, and clarified local-only SSE/UI proof versus production-visible proof. Reviewers Averroes and Beauvoir then hardened diagnostic sanitization for whitelisted `error`/`message` fields, including bearer/auth/token/password/api_key/secret/service-role/email-shaped values, quoted JSON-ish assignments, env-prefixed keys, and quoted values containing spaces or commas. Fresh post-fix gates: `npm.cmd run test:e2e:shared-surfaces` passed, `npm.cmd run test:e2e:maya-stale-state` passed, `npm.cmd run test -- tests/unit/real-evidence-browser-target.test.ts tests/unit/real-evidence-doc-honesty.test.ts tests/unit/real-evidence-comparison-doc.test.ts` passed 3 files / 11 tests, and full `npm.cmd run verify` passed with 123 files / 1014 tests.

- **Phase 6.5 Step 11 / Phase 7 scaffolding result:** LOCAL CODED on 2026-07-01. Added `scripts/captureRealEvidenceAudit.ts` and the `npm.cmd run capture:real-evidence-audit` command to re-run the Phase 0 route inventory against an approved preview or post-implementation public alias. The script writes screenshots plus a sanitized manifest with route status, sanitized console/page error snippets, sanitized origin/path URLs, visible `EVD-*`, visible `RECON-*`, visible content hashes, visible provenance terms, and POD media/link load proof. Media checks now record browser image `complete`, decoded image dimensions, safe host/path, response status, content type, and positive byte length; non-image/PDF/link media cannot be marked loaded without HTTP status, content-type, and positive byte-length proof. Added `scripts/checkRealEvidenceProofReadiness.ts` and `npm.cmd run check:real-evidence-proof`; it is a no-mutation Phase 7 readiness gate that consumes the baseline manifest, post manifest, visual-diff report, and environment readiness. It blocks unless every Phase 0 live route has post-capture coverage, a real screenshot name and screenshot file, healthy status, sanitized/no console errors, and a passing pixel-diff row, and unless every evidence-detail route (`selected case`, `evidence provenance drawer`, `query answer panel`, `approval audit panel`) carries its own `EVD-POD-S3-L1`, `RECON-S3-L1`, visible hash/provenance proof, and decoded POD image or HTTP-verified non-empty POD PDF/link proof. Added pending README scaffolds under `docs/audit/real-evidence-post-implementation/2026-07-01/` and `docs/audit/real-evidence-preview/2026-07-01/`, plus `docs/audit/real-evidence-comparison/2026-07-01.md`. These artifacts are intentionally marked pending; they are not production proof until the capture command runs against an approved URL.

- **Phase 7 local capture continuation result:** LOCAL CODED / RELEASE BLOCKED on 2026-07-02. A first local capture attempt against `http://127.0.0.1:3000` exposed that `capture:real-evidence-audit` could hang without writing a manifest. Remediation added a route-level timeout guard (`RECOUP_CAPTURE_ROUTE_TIMEOUT_MS`, default 60000ms), abortable Node-side POD/media fetches, stronger manifest sanitization for relative/absolute query params, auth headers, email-shaped values, Windows user paths, and JSON/lowercase secret assignments, plus regression coverage. A bounded local-only rerun wrote `docs/audit/real-evidence-local/2026-07-01-local-proof/manifest.json`, 19 screenshots, and `docs/audit/real-evidence-local/2026-07-01-local-proof/visual-diff.json`; that earlier local proof exposed the missing Maya evidence-detail route proof and was superseded by `docs/audit/real-evidence-local/2026-07-01-local-proof-3/manifest.json`. Fermat then found three remaining local capture blockers: `/forensics` and `/run` were being treated as shadcn Maya evidence-detail states, and `/governance/connectors` did not forward the signed CFO read proxy. Remediation added route-specific capture waits for classic `/forensics` and `/run`, allowed a signed CFO read proxy on backend `/connectors`, and made the server-rendered connectors page pass signed read headers. The follow-up local-only manifest `docs/audit/real-evidence-local/2026-07-01-local-proof-4/manifest.json` had 19 captures, 19 HTTP 200 captures, zero capture errors, zero console-error routes, screenshots for all 19 routes, and clean local captures for the previously noisy `/forensics`, `/run`, and `/governance/connectors` routes. It closed the independent audit's Maya evidence-detail visibility gap locally, but only through an HTTP-verified POD document safe-viewer link; it is superseded by `local-proof-5` below for loaded PDF proof.

- **Phase 7 proof-readiness rerun result:** NO-MUTATION RELEASE BLOCKED on 2026-07-02. Fresh `npm.cmd run check:real-evidence-proof` exits 1 with `noMutation: true`: baseline has 19 live captures ready, production preflight readiness is `ready`, and with `RECOUP_PREVIEW_URL` set the preview URL is recognized as ready. The gate remains blocked because `RECOUP_REAL_EVIDENCE_REFRESH_APPROVED` is not approved, the approved post-implementation manifest is absent, and the current visual-diff report still has 16 failed route pairs because it is not backed by an app-visible preview/public-alias post capture. This is the expected release-blocked state after local proof-5; do not reinterpret local generated-document proof as production proof.

- **Post-review proof-hardening result:** LOCAL CODED on 2026-07-02. Reviewer Copernicus found three warnings after `local-proof-4`: canonical evidence documents were not included in the Forensics read-model freshness fingerprint, generic `text/html` links could be overstated as loaded POD media, and local proof artifacts could be misread because `captureKind` still said `post-implementation`. Remediation added canonical evidence-dataset document/link fingerprinting to `src/services/evidenceFreshness.ts`, added a source-freshness regression proving a changed POD document content hash invalidates an unchanged receipt cache, initially constrained accepted HTML proof to explicit `/api/forensics/evidence-documents/EVD-*` safe-viewer links, and added `proofScope` / `releaseProof` manifest metadata. The original POD-media proof tightening below supersedes that HTML-as-loaded behavior for original media proof. Existing `docs/audit/real-evidence-local/2026-07-01-local-proof-4/manifest.json` is marked `proofScope: "local"` and `releaseProof: false`.

- **Original POD-media proof tightening result:** LOCAL CODED / RELEASE STILL BLOCKED on 2026-07-02. Reviewer Volta confirmed the previous POD path was metadata plus an HTML safe-viewer link, not original POD PDF/image bytes. Remediation made `scripts/captureRealEvidenceAudit.ts` fail closed for original media proof: HTML safe-viewer proof is no longer counted as loaded POD media; only decoded images or HTTP-verified non-empty `application/pdf` / `image/*` responses can satisfy loaded POD media. The old `local-proof-4` manifest predates this stricter media-proof classifier and is superseded by the generated support-document proof result below.

- **Generated support-document proof result:** LOCAL GREEN / RELEASE STILL BLOCKED on 2026-07-02. The user clarified that prod-ready support documents can be generated from the controlled Recoup evidence rows when clearly labeled as generated/source-controlled, rather than claimed as production-origin SAP/3PL files. Remediation now renders deterministic generated PDF artifacts for `source_generated` POD, SAP invoice, and remittance evidence rows from their persisted payloads; `src/services/cockpitModel.ts` derives backend/read-model `storageHref` values for those generated artifacts, and `src/services/evidenceMaterializer.ts` emits storage URIs for generated SAP invoice/remittance/POD records. Fresh authenticated local probes returned HTTP 200 `application/pdf` for `EVD-POD-S3-L1`, `EVD-REMIT-S3-L1`, and `EVD-SAP-INVOICE-S3-L1`. Fresh local capture `docs/audit/real-evidence-local/2026-07-01-local-proof-5/manifest.json` has 19 captures, 19 HTTP 200 captures, zero capture errors, zero console-error routes, `proofScope: "local"`, `releaseProof: false`, and all four required Maya evidence-detail states showing `EVD-POD-S3-L1`, `EVD-REMIT-S3-L1`, `RECON-S3-L1`, 2-3 hashes, `source_generated`, and a loaded POD PDF link (`application/pdf`, 1322 bytes). This is local generated-document proof, not preview/public-alias proof and not live SAP/3PL original-document proof.

- **Final resume verification result:** LOCAL GREEN / RELEASE STILL BLOCKED on 2026-07-02. A fresh full `npm.cmd run verify` initially failed two Maya boundary invariants because the evidence dossier component constructed a literal `/api/forensics/evidence-documents/*` href. Remediation moved safe evidence-link construction into the backend/read-model `storageHref` field and kept the React component prop-driven. Focused rerun passed `tests/invariants/cockpit-no-business-logic.test.ts`, `tests/invariants/maya-shadcn-boundary.test.ts`, and `tests/unit/cockpit.test.ts` with 97 tests. After adding the Phase Gate Chronology Audit doc guard, original POD-media classifier guard, generated-PDF route, and reviewer Erdos's safe-viewer wording fix, fresh full `npm.cmd run verify` passed lint, typecheck, 124 Vitest files / 1038 tests, dependency-cruiser with 141 modules / 473 dependencies, and release readiness. No production deploy, provider-env change, Supabase DML, public alias promotion, or approved post-capture was performed.

- **Preview deployment attempt result:** PREVIEW READY / BROWSER PROOF BLOCKED on 2026-07-02. A Vercel preview deployment was created without `--prod`: deployment `dpl_E3fhiU1v2fhX5H1ND2kD8geRHybW`, target `preview`, status `Ready`, URL `https://recoup-qvclbhlrr-hackathonopenai.vercel.app`. `npm.cmd run check:reconciliation-cutover-env` recognizes that preview URL as ready and still blocks only on missing `RECOUP_REAL_EVIDENCE_REFRESH_APPROVED`. Preview capture `docs/audit/real-evidence-preview/2026-07-01-preview-2/manifest.json` is correctly marked `captureKind:"preview"`, `proofScope:"preview"`, and `releaseProof:false`, but the app is not visible because Vercel deployment protection redirects the browser to `https://vercel.com/login`; only 2 screenshots were written, 17 authenticated routes carry the explicit protection error, and no `EVD-*`, `RECON-*`, content hashes, provenance, or POD media are visible. No Vercel automation bypass secret was present in Process/User/Machine env. No production alias promotion, provider env change, or Supabase DML was performed.

- **Phase 7 proof-readiness hardening result:** LOCAL CODED / RELEASE BLOCKED on 2026-07-01, refreshed 2026-07-02. Reviewer Kant found two real readiness-gate risks: the consumer accepted `present && loaded` as POD media proof without rechecking decode/HTTP/content-type details, and post captures did not require screenshot names or existing screenshot files. Reviewer Goodall then found a remaining zero-byte PDF/link false-positive path. Remediation tightened `scripts/captureRealEvidenceAudit.ts` and `scripts/checkRealEvidenceProofReadiness.ts`, added regression coverage, and changed `verify:real-evidence -- --target=production` so it delegates to production preflight instead of passing local materializer proof. Fresh focused gate passed after Goodall's byte-length remediation and follow-up doc-honesty updates: `npm.cmd run test -- tests/unit/real-evidence-capture-media-proof.test.ts tests/unit/real-evidence-proof-readiness.test.ts tests/unit/real-evidence-doc-honesty.test.ts tests/unit/evidence-materializer.test.ts tests/unit/real-evidence-comparison-doc.test.ts` passed 5 files / 19 tests. Fresh read-only command proof: `npm.cmd run verify:real-evidence` still passes as local-only proof, and default local `npm.cmd run verify:real-evidence -- --target=production` passes with 20 claims, 114 evidence documents, 20 receipts, complete required IDs, and matching hashes. No provider env was changed. Fresh full `npm.cmd run verify` passed lint, typecheck, 123 Vitest files / 1014 tests, dependency-cruiser with 141 modules / 473 dependencies, and release readiness. `npm.cmd run check:real-evidence-proof` exits nonzero as expected today: production preflight readiness is ready, but environment readiness is still blocked by missing `RECOUP_REAL_EVIDENCE_REFRESH_APPROVED` and missing `RECOUP_PREVIEW_URL`; post-implementation manifest is absent; post proof counts are zero for decoded/HTTP-verified non-empty media, visible provenance, visible content hash, `EVD-POD-S3-L1`, and `RECON-S3-L1`; route-level proof is missing for `selected case`, `evidence provenance drawer`, `query answer panel`, and `approval audit panel`; partial local screenshots produce 3 route pairs passing and 16 route pairs failing in the visual-diff report, but they are not Phase 7 production proof without a matching post manifest from the approved public alias capture.

- **Phase 7 comparison-doc hardening result:** LOCAL CODED / PENDING POST CAPTURE on 2026-07-01. `docs/audit/real-evidence-comparison/2026-07-01.md` now has one explicit pending before/after row for each of the 19 Phase 0 live routes instead of grouping CFO/Credit/Trace/Evals. Added `tests/unit/real-evidence-comparison-doc.test.ts`; it reads the real baseline manifest, parses the markdown table by route, asserts exact baseline/post screenshot paths on the same row, and requires the automated pass column to remain `pending` for every row until post-capture proof exists. Reviewer Galileo found the initial test was too loose; the test now parses row columns and rejects `pass`/`complete`/`yes` before visual proof. Focused gate passed: `npm.cmd run test -- tests/unit/real-evidence-comparison-doc.test.ts tests/unit/real-evidence-proof-readiness.test.ts tests/unit/real-evidence-capture-media-proof.test.ts` with 3 files / 9 tests.

- **Maya live-query SAP-degraded remediation result:** LOCAL GREEN / PRODUCTION PROMOTION PENDING on 2026-07-01. With SAP temporarily down, `npm.cmd run test:e2e:maya-real` previously reached canonical browse but `/forensics/query` returned `blocked_live_agent_trace` with zero trace rows. The fix keeps live OpenAI Agents SDK and MCP proof required, but stops treating SAP evidence as the only acceptable `query.answer` proof when selected canonical evidence is present. `src/services/serviceLayer.ts` now emits `sourceReads.selectedEvidence` from the selected reconciliation/evidence packet without faking SAP rows; `src/services/conductor.ts` and `src/agents/liveForensicsStream.ts` preserve selected-evidence proof record IDs; `src/services/forensicsQuerySession.ts` accepts selected canonical evidence or SAP proof and propagates top-level reconciliation into the live MCP service context. Reviewer Hume found one contract gap after the first fix: callers that supplied reconciliation only at the top-level session input would not pass it into the MCP context. Remediation added that merge plus a regression that calls the real `query.answer` service tool through `request.mcpServiceContext`. Fresh focused gates passed: 4 files / 62 tests for query session, live stream, conductor hooks, and retrieval tools; `tests/unit/cockpit-api.test.ts` passed 121 tests; `tests/invariants/maya-shadcn-qa-contract.test.ts` passed 35 tests. Fresh local browser gate passed: `npm.cmd run test:e2e:maya-real` completed 5 query work items with 50 backend trace rows while SAP source health remained visibly degraded. Fresh full `npm.cmd run verify` passed lint, typecheck, 123 files / 1023 tests, dependency-cruiser, and release readiness. No Vercel production deploy, public alias promotion, production mode change, or provider-env change was run; production movement remains blocked until the user tests and explicitly approves.

- **Release-facing documentation honesty result:** LOCAL CODED on 2026-07-01. Added `tests/unit/real-evidence-doc-honesty.test.ts` and patched `README.md` plus `docs/qa/maya-journey-rag-memory-test-cases-2026-06-28.md` so prior local verify and 2026-06-28 production smoke evidence cannot be mistaken for current 2026-07-01 production real-evidence/POD-media cutover proof. README now has a `Real Evidence Cutover Status` section that names `npm.cmd run check:real-evidence-proof`, `RECOUP_PREVIEW_URL`, `EVD-POD-S3-L1`, `RECON-S3-L1`, and decoded POD image or HTTP-verified non-empty POD PDF/link proof as release blockers. The June Maya QA matrix now has a `Historical Scope Note` and a current real-evidence proof row; the same test now guards the post-capture README and phase-plan wording for partial local screenshots, Step 11 split status, and live provider-env cutover. Focused gate passed: `npm.cmd run test -- tests/unit/real-evidence-doc-honesty.test.ts` with 1 file / 4 tests.

- **Independent audit verdict movement hardening result:** LOCAL CODED / REVIEW APPROVED on 2026-07-01, refreshed 2026-07-02. Reviewer Averroes found that `docs/independent-audit-log.md` still had baseline-only audit tables plus scattered local/prod proof prose, and also contained a stale `test:e2e:maya-real` blocked statement that conflicted with the latest SAP-degraded local Maya pass. Remediation added an `Independent Audit Verdict Movement - 2026-07-01` matrix with `Phase 0 baseline verdict`, `Current local implementation status`, `Preview proof status`, `Production/post verdict`, `Required post verdict`, and `Evidence/blocker` columns. The matrix covers the original pasted audit dimensions plus `Production rule_input_json path`, runtime `scenario_id`, and POD/media proof, and it keeps `LOCAL ONLY`, protected-preview blockers, `PRODUCTION BLOCKED`, and `BLOCKED UNTIL USER TEST + APPROVAL` visible instead of implying production readiness. The stale Maya E2E blocker is now marked superseded and replaced with the current local green result under SAP-degraded conditions, and the browser-tab row now records local SSE visible-update proof as passed instead of unchecked. `tests/unit/real-evidence-doc-honesty.test.ts` now guards these audit-log requirements and rejects stale blocked phrasing. Reviewer Kepler re-reviewed the original slice and approved it with no findings. Fresh focused gate passed: `npm.cmd run test -- tests/unit/real-evidence-doc-honesty.test.ts tests/unit/real-evidence-browser-target.test.ts tests/unit/real-evidence-comparison-doc.test.ts tests/unit/real-evidence-proof-readiness.test.ts tests/unit/real-evidence-capture-media-proof.test.ts` with 5 files / 23 tests. No production deploy, public alias promotion, production mode change, provider-env change, or production Supabase mutation was performed.

**Phase 6.5 exit gate remains blocked:** S1-S8 reconciliation, mutation, receipt basis/confidence, multi-evidence fail-closed, SAP fallback, SSE live-update, degraded/stale-state, shared-surface local gates, and Chromium-only Windows accessibility are covered locally, but the full gate cannot pass until cross-browser Chromium/Firefox/WebKit accessibility proof, pixel-diff proof, and `check:real-evidence-proof` run against a live/preview app serving canonical evidence/receipt rows and approved post screenshots.

---

## Phase 7: Production Verification And Audit Closeout

**Purpose:** prove the finished pipeline with durable evidence before calling it production-grade.

**Files:**
- Modify: `docs/independent-audit-log.md`
- Modify: `docs/vscode-handoff-status.md`
- Modify: `README.md`
- Modify: `docs/qa/maya-journey-rag-memory-test-cases-2026-06-28.md`
- Create: `docs/audit/real-evidence-post-implementation/2026-07-01/README.md`
- Create: `docs/audit/real-evidence-post-implementation/2026-07-01/manifest.json`
- Create: `docs/audit/real-evidence-post-implementation/2026-07-01/screenshots/`
- Create: `docs/audit/real-evidence-preview/2026-07-01/manifest.json`
- Create: `docs/audit/real-evidence-comparison/2026-07-01.md`

- [x] **Step 1a: Run local non-browser verification**

Run:

```powershell
npm.cmd run verify
npm.cmd run verify:real-evidence
```

Expected: PASS for local proof only. This does not prove production Supabase persistence or frontend POD media.

Current result: PASS locally on 2026-07-01. `npm.cmd run verify` passed lint, typecheck, 123 Vitest files / 1014 tests, dependency-cruiser with 141 modules / 473 dependencies, and release readiness. `npm.cmd run verify:real-evidence` passed as `proofScope=local_materialized_dataset`, with `frontendMediaProof=not_checked` and `supabasePersistence=not_checked`.

- [ ] **Step 1b: Run full local/browser hardening verification**

Run:

```powershell
npm.cmd run verify:real-evidence-hardening
npm.cmd run test:e2e:shared-surfaces
npm.cmd run test:e2e:maya-real
```

Expected: PASS only after the configured live/preview app serves materialized canonical evidence/receipt rows and the post-capture proof inputs exist.

Current result: BLOCKED FAIL-CLOSED for the full hardening/release gate. `npm.cmd run test:e2e:maya-real` passed locally against `http://127.0.0.1:4318`: shell/readiness/force-refresh passed, canonical browse loaded 20 line items / 8 work items, and 5 live Maya query work items completed with 50 backend trace rows. SAP source health stayed degraded because the SAP service was temporarily down, but the live OpenAI Agents SDK + MCP `query.answer` path completed with selected canonical evidence proof instead of `blocked_live_agent_trace`. Focused gates also passed: `npm.cmd run test -- tests/unit/forensics-query-session.test.ts tests/unit/live-forensics-stream.test.ts tests/unit/conductor-hooks.test.ts tests/unit/retrieval-tools.test.ts` passed 4 files / 62 tests; `npm.cmd run test -- tests/unit/cockpit-api.test.ts` passed 1 file / 121 tests; `npm.cmd run test -- tests/invariants/maya-shadcn-qa-contract.test.ts` passed 1 file / 35 tests; latest full `npm.cmd run verify` passed with 124 files / 1038 tests. A Vercel preview URL now exists, but browser proof is blocked by Vercel deployment protection until a provider-supported bypass or authenticated preview session is available. `npm.cmd run verify:real-evidence-hardening`, `npm.cmd run verify:real-evidence-a11y`, `npm.cmd run verify:real-evidence-visual`, and `npm.cmd run check:real-evidence-proof` remain blocked by app-visible preview/post-capture prerequisites: refresh approval, post manifest, screenshot/media proof, and pixel-diff/a11y/responsive proof.

- [ ] **Step 2: Run preview smoke before touching the public alias**

After explicit human approval for preview deployment, smoke a generated preview/staging URL before promoting or declaring the public alias fixed. The preview environment must run `RECOUP_RECONCILIATION_MODE=shadow` first.

Run against `RECOUP_PREVIEW_URL`:

```powershell
$env:RECOUP_E2E_BASE_URL=$env:RECOUP_PREVIEW_URL
$env:RECOUP_CAPTURE_KIND="preview"
$env:RECOUP_CAPTURE_BASE_URL=$env:RECOUP_PREVIEW_URL
npm.cmd run capture:real-evidence-audit
npm.cmd run verify:real-evidence
npm.cmd run verify:real-evidence-hardening
npm.cmd run test:e2e:maya-real
npm.cmd run test:e2e:shared-surfaces
```

Record sanitized preview proof in `docs/audit/real-evidence-preview/2026-07-01/manifest.json`:

```json
{
  "previewUrlPresent": true,
  "mode": "shadow",
  "forensicsSmoke": "pass",
  "sharedSurfaceSmoke": "pass",
  "staleStateSmoke": "pass",
  "visualRegression": "pass"
}
```

If preview is protected, use only a configured provider-supported preview bypass and do not print bypass tokens. If no preview/staging URL is available, stop and record the missing preview gate as a release blocker.

Current preview result on 2026-07-02: preview deployment `dpl_E3fhiU1v2fhX5H1ND2kD8geRHybW` is `Ready`, but the capture is blocked by Vercel deployment protection before Recoup loads. The latest preview manifest is `docs/audit/real-evidence-preview/2026-07-01-preview-2/manifest.json`; it is preview-scoped and non-release proof, with 19 capture entries, 2 Vercel-login screenshots, 17 explicit protection errors, and zero visible app evidence IDs, receipts, hashes, provenance, or POD media. Next action is to use a provider-supported preview bypass or user-authenticated preview session, then rerun this step.

- [x] **Step 3: Run read-only production Supabase proof and cutover preflight**

Return counts and IDs only:

```json
{
  "claims": 20,
  "documents": 114,
  "receipts": 20,
  "requiredEvidenceIdsPresent": true,
  "requiredReceiptIdsPresent": true,
  "missingEvidenceIds": [],
  "missingReceiptIds": []
}
```

Run:

```powershell
npm.cmd run verify:real-evidence -- --target=production
npm.cmd run preflight:reconciliation-cutover -- --target=production
```

Expected: PASS before any production mode can move from `shadow` to `canary` or `authoritative`.

Current result: PASS read-only on 2026-07-02. `npm.cmd run verify:real-evidence -- --target=production` and `npm.cmd run preflight:reconciliation-cutover -- --target=production` both returned `claims:20`, `documents:114`, `receipts:20`, `requiredEvidenceIdsPresent:true`, `requiredReceiptIdsPresent:true`, no missing evidence/receipt IDs, no evidence/receipt hash mismatches, and `status:"pass"`. A bounded read-only Supabase REST probe for `EVD-POD-S3-L1` returned exactly one row with `document_type:"pod"`, `source_system:"three_pl"`, `provenance:"source_generated"`, `source_record_id:"POD-S3-L1"`, a Supabase storage URI present, a valid content hash, and a retrieved timestamp. This proves source-table readiness only; it is not frontend POD/media proof, preview proof, canary proof, or public-alias proof.

- [ ] **Step 4: Run canary proof before authoritative mode**

With explicit human approval, enable canary mode only for approved lines:

```powershell
$env:RECOUP_RECONCILIATION_MODE="canary"
$env:RECOUP_RECONCILIATION_CANARY_LINES="S3-L1,S6-L1"
$env:RECOUP_E2E_BASE_URL=$env:RECOUP_PREVIEW_URL
npm.cmd run test:e2e:maya-real
npm.cmd run test:e2e:shared-surfaces
```

Canary proof must show:

- canary lines use reconciliation receipts for current decisions
- non-canary lines keep the shadow/legacy continuity path
- source hashes and receipt hashes are visible
- no shared cockpit route regresses
- rollback to `legacy` or `shadow` is tested after the canary smoke

Only after canary proof passes can production be changed to `RECOUP_RECONCILIATION_MODE=authoritative`.

- [ ] **Step 5: Record production provider proof**

After explicit human approval for deploys, record:

- Render workspace/service ID
- Render deployment ID
- Vercel deployment ID
- public alias
- deployed commit SHA
- `x-recoup-read-model-cache` states observed
- `EVD-POD-S3-L1`
- one contract/SLA evidence ID
- one TPM evidence ID
- one SAP invoice evidence ID
- one SAP credit memo evidence ID
- one remittance evidence ID
- one bureau/payment evidence pair
- `RECON-S3-L1`

- [ ] **Step 6: Capture post-implementation production screenshots**

Re-run the Phase 0 production screenshot capture against the deployed public alias and save the post-fix artifacts under:

```text
docs/audit/real-evidence-post-implementation/2026-07-01/screenshots/
docs/audit/real-evidence-post-implementation/2026-07-01/manifest.json
```

The post-fix manifest must show:

```json
{
  "visibleEvidenceIds": ["EVD-POD-S3-L1"],
  "visibleReceiptIds": ["RECON-S3-L1"],
  "mediaChecks": [
    {
      "label": "POD document/media",
      "present": true,
      "loaded": true
    }
  ]
}
```

For image evidence, `loaded=true` requires `complete=true`, `naturalWidth>0`, and `naturalHeight>0`. For PDF/document evidence, `loaded=true` requires a visible preview/link plus a safe response status/content-type check.

- [ ] **Step 7: Create before/after comparison**

Create `docs/audit/real-evidence-comparison/2026-07-01.md` with:

```markdown
# 2026-07-01 Real Evidence Frontend Comparison

| Route | Baseline screenshot | Post screenshot | Baseline evidence state | Post evidence state | Pass |
|---|---|---|---|---|---|
| Maya selected case | `../real-evidence-baseline/2026-07-01/screenshots/04-forensics-selected-case.png` | `../real-evidence-post-implementation/2026-07-01/screenshots/04-forensics-selected-case.png` | No visible POD PDF/image/media; no `EVD-POD-S3-L1`; no `RECON-S3-L1` | POD media visible and load-verified; `EVD-POD-S3-L1`; `RECON-S3-L1`; source/provenance/hash visible | pending |
```

Every route captured in Phase 0 must have a row. A Forensics route cannot pass if the post-fix screenshot still shows only numbers/flags where the decision cites a document. A shared CFO, credit, governance trace, or governance evals-finops route cannot pass if it returns 5xx, renders blank, logs any browser console/page errors in the post-capture manifest, or loses the route-specific heading/landmark recorded in the Phase 0 manifest.

- [ ] **Step 8: Re-run audit tables after implementation**

Update the audit tables in `docs/independent-audit-log.md` with new verdicts. A production-grade closeout requires:

| Audit item | Required post-fix verdict |
|---|---|
| SAP -> Supabase | LIVE or SCHEDULED-AUTOMATED |
| Supabase -> Express backend | LIVE-FRESHNESS-GATED or TTL-CACHED-WITH-FRESHNESS-PROOF |
| Express -> Next API | CACHE-WITH-FRESHNESS-PROOF |
| Backend -> open browser tab | LIVE-INVALIDATION or POLLED-WITH-VISIBLE-STALE-STATE |
| Frontend document/media proof | REAL MEDIA/DOCUMENT VISIBLE OR GENERATED/PDF/IMAGE SOURCE-DOCUMENT LINK WITH HTTP LOAD PROOF |
| Multi-source reconciliation | REAL |
| Synthetic verdict/rule-input pipeline | NOT-RUNTIME |
| Production `rule_input_json` path | NOT-RUNTIME |
| Runtime `scenario_id` path | NOT-RUNTIME |
| Immutable audit + approval fail-closed | REAL |
| Cross-line gaming detection | REAL LOGIC ON DERIVED INPUTS |

**Phase 7 exit gate:** the independent audit log proves baseline-vs-postfix movement, all gates pass, preview and canary proof passed before public alias promotion, and production smoke shows screenshots, media/document load proof, evidence IDs, and reconciliation receipts from the public alias.

---

## Phase Gate Chronology Audit

This section answers the final acceptance question about whether each phase ran its targeted gates and `npm.cmd run verify` before the next phase began. The current Chronology verdict is **PARTIAL**: early local phase gates are documented, but the later browser/preview/production boundaries are still blocked, and local green tests are not production cutover proof.

| Phase boundary | Status | Local proof | Preview/production proof | Do not overclaim |
|---|---|---|---|---|
| Phase 0 -> 1 | PROVEN | Baseline captures, empty scoped runtime diff, and local verification were recorded before implementation. | Production baseline only. | Not post-fix production proof. |
| Phase 1 -> 2 | PROVEN | Focused schema/repository tests, lint/typecheck, and full verify are documented. | None. | Local phase gate only. |
| Phase 2 -> 3 | PROVEN | Focused materializer/readiness tests and full verify are documented. | None. | `verify:real-evidence` was local materializer proof at that point. |
| Phase 3 -> 4 | PROVEN | Reconciliation engine tests and full verify after reviewer remediation are documented. | None. | Local deterministic engine proof only. |
| Phase 4 -> 5 | PROVEN | Focused runtime-cutover gate and full verify after rollback-mode fixes are documented. | None. | Intermediate failures were fixed locally; this was not production rollout proof. |
| Phase 5 -> 5.5 | PROVEN | Freshness/cache tests and full verify are documented. | None. | No Render/provider change was made. |
| Phase 5.5 -> 6 | PARTIAL | Cutover preflight and read-only production-binding proof exist. | No backfill approval, provider env change, canary, or deploy. | Source-table readiness is not frontend or production cutover proof. |
| Phase 6 -> 6.5 | PARTIAL | Local unit/full verify and later local e2e movement exist. | No preview or public-alias proof. | Phase 6 exit was recorded as partial/release-blocked. |
| Phase 6.5 -> 7 | NOT PROVEN | Some local hardening gates passed. | Cross-browser, pixel-diff, approved post-capture, and proof-readiness gates are still missing. | Phase 6.5 exit gate remains blocked. |
| Phase 7 closeout | NOT PROVEN | Local `npm.cmd run verify` and read-only Supabase source-table proof exist. | Preview, canary, production screenshots, media proof, and public-alias smoke are missing. | Do not mark production-ready. |

The checklist item stays open until the missing PARTIAL/NOT PROVEN boundaries have command output and artifacts showing the targeted gate plus `npm.cmd run verify` passed before the next release boundary was crossed.

---

## Final Acceptance Checklist

- [x] Baseline audit was captured before runtime code implementation.
- [x] No Supabase DML ran without explicit approval.
- [ ] Every phase gate ran its targeted tests and `npm.cmd run verify` before the next phase began. The Phase Gate Chronology Audit now exists and grades the overall chronology as PARTIAL; keep this unchecked until the PARTIAL/NOT PROVEN boundaries have command output and artifacts showing the targeted gate plus `npm.cmd run verify` passed before the next release boundary was crossed.
- [x] Local deterministic real-evidence readiness and cutover-preflight guard passed: `npm.cmd run verify:real-evidence` returned `{"claims":20,"documents":114,"frontendMediaProof":"not_checked","missingEvidenceIds":[],"proofScope":"local_materialized_dataset","requiredEvidenceIdsPresent":true,"supabasePersistence":"not_checked"}`. Default local `npm.cmd run verify:real-evidence -- --target=production` passes with 20 claims, 114 evidence documents, 20 receipts, complete required IDs, and matching hashes. This is read-only Supabase proof only; it is not proof that POD media is visible in the frontend or that preview/production cutover passed.
- [x] `EVD-POD-S3-L1` exists in `recoup_evidence_documents` as a complete POD source record: bounded read-only production Supabase REST probe returned one row with `document_type:"pod"`, `source_system:"three_pl"`, `provenance:"source_generated"`, `source_record_id:"POD-S3-L1"`, storage URI present, valid content hash, and retrieved timestamp present. This is source-table proof, not frontend media proof.
- [ ] A POD PDF/image/media artifact or safe document link is visible in the production frontend and load-verified.
- [ ] Baseline and post-implementation screenshots exist for every live production page in the acceptance route inventory.
- [ ] Before/after comparison proves the frontend moved from numeric/status-only evidence to document/media-backed evidence where documents are cited.
- [x] All 114 minimum evidence documents exist for the 20 line items: read-only production-target `verify:real-evidence` and `preflight:reconciliation-cutover` both returned `documents:114`, `documentsMinimum:114`, `evidenceHashCount:114`, `requiredEvidenceIdsPresent:true`, and no missing evidence IDs.
- [x] All 20 reconciliation receipts exist: read-only production-target `verify:real-evidence` and `preflight:reconciliation-cutover` both returned `receipts:20`, `receiptHashCount:20`, `requiredReceiptIdsPresent:true`, and no missing receipt IDs.
- [x] Reconciliation tests cover S1, S2, S3, S4, S5, S6, S7, and S8 comparison requirements.
- [x] Mutation tests prove source-field changes alter derived facts or fail closed.
- [x] `confidenceFactors` and `deterministicBasis` are asserted as source-specific, non-placeholder values.
- [x] Missing-evidence fail-closed tests cover POD, contract, TPM, remittance, and credit memo paths.
- [x] SAP OData unavailable behavior preserves generated fallback rows as `source_generated`.
- [x] `RECOUP_RECONCILIATION_MODE` supports `legacy`, `shadow`, `canary`, and `authoritative`, with runtime defaulting to explicit `legacy` rollback until cutover preflight passes and a human promotes the mode.
- [x] Local guard prevents repository/config defaults from promoting `authoritative` without rollback/preflight coverage; rollout tests and deployment-readiness invariants cover the local rollback/default behavior.
- [ ] Live provider-env `authoritative` mode remains blocked even though read-only production preflight passes from the local runtime; promotion still requires approved provider env, preview/canary/browser proof, post-capture POD/media proof, and explicit user-tested approval. Partial read-only provider check on 2026-07-02: Vercel project env list has no `RECOUP_RECONCILIATION_MODE`, `RECOUP_RECONCILIATION_CANARY_LINES`, `RECOUP_REAL_EVIDENCE_REFRESH_APPROVED`, or `RECOUP_PREVIEW_URL` keys; Render MCP shows the `recoup-api` service on `main`, but does not expose env-var reads, and no local `RENDER_API_KEY` / `RENDER_API_TOKEN` is present, so backend provider-env state remains unclosed.
- [x] Read-only cutover preflight reporting aggregates all source-table probes before returning and redacts payloads/secrets on failures; latest local target now passes with 20 claims, 114 evidence documents, 20 receipts, complete required evidence/receipt IDs, and matching hashes.
- [x] `plan:reconciliation-cutover-repair` produces a no-mutation, approval-gated repair checklist before any schema/backfill action is attempted.
- [x] `plan:reconciliation-cutover-sql` produces a no-mutation, approval-gated, non-executable-by-default SQL review artifact with commented DDL, separated read-only/post-approval command buckets, CLI blocked-exit coverage, and clean reviewer re-review.
- [x] `plan:reconciliation-cutover-approval` produces a no-mutation human approval packet that preserves source-read failures, sanitized preflight errors, remaining gates, approval checklist, separated command buckets, and commented review-only SQL.
- [x] `check:reconciliation-cutover-env` produces a no-mutation environment readiness report that distinguishes production preflight readiness from refresh/preview/canary approvals without leaking secrets or raw preview URLs.
- [x] `check:real-evidence-proof` produces a no-mutation Phase 7 readiness report that blocks until environment readiness, every Phase 0 live route's post capture, screenshot name, screenshot file, route health, and pixel-diff proof are present, and every evidence-detail route carries its own visible `EVD-POD-S3-L1`, visible `RECON-S3-L1`, visible content hash/provenance, and decoded POD image or HTTP-verified non-empty POD PDF/link proof.
- [x] Local rollback unit proof covers canary/authoritative mode rollback to `legacy` or `shadow` as `legacy_rollback` without requiring reconciliation receipts; this documents the operational-continuity path only, not production canary/authoritative proof.
- [x] Local deployment manifests do not commit `RECOUP_RECONCILIATION_MODE=authoritative|canary`, canary line IDs, or a production Supabase project ref; this documents repository cutover safety only, not live provider-env promotion.
- [x] Forensics runtime does not read pre-merged `rule_input_json` for decisions.
- [x] Forensics runtime does not use `scenario_id`, `scenarioId`, `gold_scenario_id`, or `goldScenarioId` for rule selection, verdict, routing, confidence, ordering, or display.
- [x] Runtime readers of `recoup_deduction_lines.verdict`, `routing`, `rule_id`, `rule_input_json`, and `scenario_id` have been audited and cut over or isolated behind explicitly named rollback-only helpers.
- [x] Missing evidence returns fail-closed behavior and does not publish a read model.
- [x] `GET /forensics` exposes cache/freshness state for SAP and every non-SAP evidence source listed in `REQUIRED_EVIDENCE_FRESHNESS_SOURCES`.
- [x] Local SSE/degraded-state implementation exists: already-open cockpit tabs subscribe to business data invalidation over SSE and show degraded/stale status after SSE failure.
- [x] SSE live-update e2e proves an already-open tab visibly changes after invalidation locally: `npm.cmd run test:e2e:forensics-sse-live-update` passed against `localhost:3000`.
- [x] Degraded/stale-state e2e proves SSE failure produces a visible stale/degraded UI locally: `npm.cmd run test:e2e:maya-stale-state` passed.
- [ ] Screenshot before/after pixel-diff gate passes through `verify:real-evidence-visual`, not only human-graded. Current visual-diff report exists but fails closed because approved post-implementation screenshots are missing.
- [ ] Evidence UI passes responsive mobile/tablet/desktop checks across Chromium, Firefox, and WebKit. Local Windows run is Chromium-only by user instruction; default all-browser proof remains blocked by Firefox headless launch failure.
- [x] Evidence UI passes focused accessibility checks for labeled buttons and checked text contrast in local Chromium mobile/tablet/desktop: `npm.cmd run verify:real-evidence-a11y -- --browsers=chromium` passed. This is not cross-browser release proof.
- [x] Shared cockpit route regression smoke passes locally for the covered shared routes, including `/cfo`, `/credit`, `/governance/trace`, and `/governance/evals-finops`: `npm.cmd run test:e2e:shared-surfaces` passed after the evals-finops CFO read-proxy and duplicate-key fixes. Preview/production shared-surface proof remains covered by the Phase 7 preview and public-alias gates.
- [ ] Preview deployment smoke passes before the public production alias is promoted or declared fixed.
- [ ] Canary proof passes for approved line IDs before production mode changes to `authoritative`.
- [x] Maya evidence UI exposes `EVD-*` and `RECON-*` when the backend/read model supplies canonical evidence and receipts; production visibility for `EVD-POD-S3-L1` and `RECON-S3-L1` remains unchecked above.
- [x] Release-facing README and June Maya QA docs distinguish historical/local regression proof from the current production real-evidence/POD-media cutover gate.
- [x] `npm.cmd run verify` passes: latest run passed lint, typecheck, 124 Vitest files / 1038 tests, dependency-cruiser with 141 modules / 473 dependencies, and release readiness.
- [ ] `npm.cmd run verify:real-evidence-hardening` passes.
- [x] `npm.cmd run test:e2e:maya-real` passes locally: latest run passed against `http://127.0.0.1:4318` with 20 canonical line items, 8 work items, 5 live query work items, and 50 backend trace rows while SAP source health was degraded.
- [x] `docs/independent-audit-log.md` contains before/current/preview/production audit verdict movement for the pasted audit dimensions, with production/post verdicts explicitly marked blocked until preview, user testing, public-alias capture, POD/media proof, and promotion-time production preflight pass.

## Self-Review

- Spec coverage: This plan includes the attached audit results, the prioritized audit fix list, a baseline-before-code phase, real source document creation, runtime cutover, freshness controls, browser update path, and production closeout.
- Non-superficial data requirement: The plan requires Supabase-persisted evidence documents for POD, SAP invoice/credit, remittance, PO, contract, TPM, carrier, bureau, and payment history before decisions can display.
- Provenance boundary: Generated rows are acceptable only as complete evidence records with hashes and `source_generated`; SAP OData provenance is allowed only for payloads retrieved from SAP.
- Safety: Supabase writes, Render changes, Vercel deploys, and production DML remain blocked until explicit human approval.
- Baseline clarity: The current audit verdicts remain visible so the implementation can be judged against before-and-after evidence, not chat claims.
- Gap review updates: `scenario_id` is banned from runtime decisions, legacy decision-column consumers are audited, non-SAP freshness is explicit, SSE is the chosen browser update path, and materializer coverage includes S1-S8 examples rather than only S3-L1.
- Testing gap updates: Phase 6.5 adds requirements-table reconciliation tests, mutation/sensitivity tests, basis/confidence assertions, missing-evidence matrix tests, SAP fallback tests, SSE live-update e2e, degraded/stale-state e2e, pixel-diff visual regression, responsive/cross-browser checks, and focused accessibility checks.
- Regression-safety updates: the plan requires full `npm.cmd run verify` at each phase boundary, Phase 5.5 blocks authoritative cutover until production evidence and receipts exist, rollout modes provide shadow/canary/rollback control, shared cockpit routes are regression-smoked, and preview/canary proof happens before public-alias closeout; the Phase Gate Chronology Audit keeps unproven boundaries open.
