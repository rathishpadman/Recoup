# Independent Multi-Agent Audit Log

Purpose: make Recoup's independent review trail judge-visible without relying on chat history. This log summarizes the read-only/subagent audits performed during the build, the findings they produced, the fixes implemented, and the evidence a reviewer can inspect locally.

Verification command for the current proof pack:

```powershell
npm.cmd run verify
```

This remains the proof-pack command because it includes `verify:release`, which reads owner-approved run-control and eval-label rows from Supabase `recoup_config`. Current 2026-07-02 controller evidence is green: `npm.cmd run verify` passed with lint, typecheck, 124 Vitest files / 1038 tests, dependency-cruiser clean with 141 modules / 473 dependencies, and release readiness passed; a later full verify at the final preview code point passed with 124 Vitest files / 1050 tests. Phase 0 reproducibility is not complete because the current repo remains dirty/untracked with generated screenshot artifacts and mockups outside the pushed proof branch. Current local real-evidence browser proof is green for Maya: `npm.cmd run test:e2e:maya-real` passed against `http://127.0.0.1:4318` with 20 canonical line items, 8 work items, 5 live query work items, and 50 backend trace rows while SAP source health was visibly degraded. Final protected Preview proof is also green for route/media evidence: `docs/audit/real-evidence-preview/2026-07-02-430565d/manifest.json` has 19 captures, 19 HTTP 200 statuses, 19 screenshots, zero capture errors, zero console-error routes, and HTTP-verified POD PDF proof for `EVD-POD-S3-L1` on the four Maya evidence states. Production closeout is still pending: no merge to `main`, Vercel production deploy, public alias promotion, production mode change, or provider-env change has been run for this remediation, and production movement remains blocked until the user tests and explicitly approves.

## Real Evidence Baseline Audit - 2026-07-01

Source plan: `docs/superpowers/plans/2026-07-01-real-evidence-phased-plan-with-audit.md`

Audit source: `C:\Users\rathi\.codex\attachments\38866839-1e9d-41f0-8029-3fc330978763\pasted-text.txt`

Phase 0 branch/SHA before runtime code changes: `codex/real-evidence-phased-plan-execution` / `e3e4a55d751cbcb3ea2df4e282c3d4cb6011ac02`

Scoped runtime diff before implementation: empty for `src`, `cockpit`, `config`, `scripts`, `tests`, `render.yaml`, `package.json`, and `docs/supabase-memory-schema.sql`.

Production alias proof: `https://recoup-self-eta.vercel.app` maps to Vercel deployment `dpl_GmRnve57izaS1GndBn2N1WBjTxRv`, target `production`, status `Ready`, inspected on 2026-07-01.

Baseline artifacts:

- Manifest: `docs/audit/real-evidence-baseline/2026-07-01/manifest.json`
- Screenshots: `docs/audit/real-evidence-baseline/2026-07-01/screenshots/`
- README: `docs/audit/real-evidence-baseline/2026-07-01/README.md`

Supabase DML during Phase 0: none.

Render/Vercel deploy during Phase 0: none.

Secret handling: no tokens, service-role keys, cookies, auth headers, API keys, or env values were written to docs, screenshots, or logs.

### Local Cutover Repair Planning Proof - 2026-07-01

- Read-only preflight waits for all three required source-table probes before returning and reports sanitized table/status/code/failure-kind values only when it fails.
- Latest local Supabase preflight on 2026-07-02 passes: `npm.cmd run preflight:reconciliation-cutover` returned 20 claims, 114 evidence documents, 20 receipts, 114 evidence hashes, 20 receipt hashes, no missing required `EVD-*` IDs, no missing `RECON-*` receipt IDs, and no mismatched evidence/receipt hashes. This is local target proof only, not production binding or frontend POD/media proof.
- `npm.cmd run plan:reconciliation-cutover-repair` is a no-mutation planner. Latest local run is `ready_for_refresh_approval`, with no source-read failures and no schema repair actions; remaining gates are explicit refresh approval, preview/canary/browser/POD-media proof, and re-running production preflight at promotion time.
- `npm.cmd run plan:reconciliation-cutover-sql` is also no-mutation: it does not connect to Supabase, writes no file, exits code 1, separates read-only verification commands from post-approval mutation/proof commands, and emits only a commented `reviewOnlySqlPlan` so DDL is non-executable by default.
- `npm.cmd run plan:reconciliation-cutover-approval` is a no-mutation human approval packet: it runs the read-only preflight/repair planner and now renders `ready_for_refresh_approval` locally, with no source-read failures, no blocking preflight error, no repair actions, remaining gates, approval checklist, separated read-only/post-approval commands, and the commented review-only SQL plan.
- `npm.cmd run check:reconciliation-cutover-env` is a no-mutation environment readiness report: it prints safe presence/host/status metadata only, blocks non-HTTPS Supabase URLs, blocks malformed or non-HTTP(S) preview URLs without echoing raw URL values, and separates read-only production preflight readiness from refresh, preview, and canary/provider approvals.
- Latest environment readiness is blocked only on approval/runtime proof gates: local `.env.local` now has the non-secret `RECOUP_PRODUCTION_SUPABASE_PROJECT_REF` binding, so production preflight readiness is `ready`; with `RECOUP_PREVIEW_URL` pointed at the new Vercel preview, preview URL presence is `ready`; `RECOUP_REAL_EVIDENCE_REFRESH_APPROVED` is not approved. No provider env was changed.
- Reviewers Hume and Singer re-reviewed the SQL artifact after fixes and found no remaining spec/safety or code-quality blockers.
- Reviewers Chandrasekhar and Meitner re-reviewed the approval packet after fixes and found no remaining spec/safety or code-quality blockers.
- Reviewers Russell and Pauli re-reviewed the environment readiness checker after URL-validation fixes and found no remaining spec/safety or code-quality blockers.
- Focused proof: `npm.cmd run test -- tests/unit/reconciliation-cutover-env-readiness.test.ts tests/unit/reconciliation-cutover-approval-packet.test.ts tests/unit/reconciliation-cutover-sql-artifact.test.ts tests/unit/reconciliation-cutover-repair-plan.test.ts tests/unit/reconciliation-cutover-preflight.test.ts` passed 5 files / 24 tests.
- Full proof: `npm.cmd run verify` passed lint, typecheck, 124 Vitest files / 1038 tests, dependency-cruiser with 141 modules / 473 dependencies, and release readiness.

### Frontend Evidence Baseline Verdict

The production frontend renders all 19 captured route/state screenshots with HTTP 200, including `/forensics`, `/forensics/shadcn`, `/run`, `/credit`, `/credit/command`, `/cfo`, `/governance`, `/governance/agents`, `/governance/connectors`, `/governance/evals-finops`, `/governance/memory`, and `/governance/trace`. The real-evidence gap remains open: the captured frontend state shows zero canonical `EVD-*` IDs, zero `RECON-*` reconciliation receipt IDs, and no loaded POD PDF/image/media artifact. The post-implementation proof must move those fields from absent to visible and load-verified when a document supports a decision.

Pre-existing route health notes from the baseline: `/run` logs `ERR_CONNECTION_REFUSED`; `/governance/connectors` renders a production Server Components error message; `/governance/memory` logs the same Server Components production error while still rendering memory content. These are recorded as baseline route-health issues, not caused by the real-evidence implementation.

### Data Freshness Baseline

| Hop | Phase 0 verdict | Evidence anchor |
|---|---:|---|
| SAP -> Supabase | MANUAL-STEP-REQUIRED | Live SAP read code exists, but normal retrieval and provisioning still require separate automation before the new real-evidence pipeline can be called production-grade. |
| Supabase -> Express backend | TTL-CACHED / PERSISTED-CACHED | Current `/forensics` can serve cached read models without the canonical evidence/receipt freshness gate required by the new plan. |
| Express backend -> Next API | TTL-CACHED / STALE-WHILE-REFRESH | Current Next API behavior is cache-first/background-refresh, not a receipt-hash-gated real-evidence proof. |
| Backend -> open browser tab | MANUAL-STEP-REQUIRED | No captured baseline route shows live business invalidation evidence for already-open tabs. |
| Demo/fixture escape hatches | LIVE-CONFIGURED, CACHE DEFAULT-ENABLED | Public production renders real-backend routes, but cache/provenance proof is still insufficient for canonical evidence decisions. |

### Validation Reality Baseline

| Claim / item | Phase 0 verdict | Evidence anchor |
|---|---:|---|
| Displayed verdict/confidence/routing | PARTIALLY REAL | Current production screenshots show verdict/routing/status labels, but no `RECON-*` receipt basis. |
| Multi-source evidence reconciliation | STUBBED / SHAPE-ONLY | Evidence tab shows source labels and record IDs, but no canonical `EVD-*` document IDs or loaded POD media. |
| Synthetic verdict/rule-input pipeline | STUBBED | The new plan must replace runtime trust in seeded verdict/routing/rule inputs with document comparison receipts. |
| Production `rule_input_json` path | STUBBED / EXTERNAL-PREMERGED | No Phase 0 frontend proof shows a runtime-derived reconciliation receipt. |
| Immutable audit + approval fail-closed | REAL | Existing audit/HITL behavior remains outside the canonical real-evidence gap and must be preserved. |
| Cross-line behavioral gaming detection | REAL LOGIC, PRE-LABELED INPUTS | Shared-surface regression checks are required before changing `cockpitApi.ts` or `cockpitModel.ts`. |

### Independent Audit Verdict Movement - 2026-07-01

This table is the current before/current/post audit ledger for the original pasted audit dimensions. It intentionally separates Phase 0 baseline verdicts from local implementation movement, preview proof, and production closeout. Local green tests are not a production pass.

| Audit item | Phase 0 baseline verdict | Current local implementation status | Preview proof status | Production/post verdict | Required post verdict | Evidence/blocker |
|---|---|---|---|---|---|---|
| SAP -> Supabase | MANUAL-STEP-REQUIRED | LOCAL ONLY / SAP DEGRADED. Local materializer, refresh planner, cutover preflight, and approval packet exist. SAP rows are not being faked; selected non-SAP canonical evidence can now keep Maya live query from collapsing to `blocked_live_agent_trace`. The persisted local production project-ref binding proves production Supabase already has the expected 20 claims, 114 evidence documents, and 20 receipts through the default read-only production preflight. | PREVIEW PASSED / NOT PRODUCTION. Browser proof renders canonical evidence/receipts and POD PDF proof; SAP service itself remained degraded. | PRODUCTION BLOCKED. | LIVE or SCHEDULED-AUTOMATED with approved production schema/backfill/refresh proof and browser proof. | Provider env was not changed; canary, production public-alias capture, and promotion-time proof remain pending. |
| Supabase -> Express backend | TTL-CACHED / PERSISTED-CACHED | LOCAL ONLY. Backend read-model cache is locally freshness-gated by source/evidence/receipt hashes and fails closed when source state cannot be verified. | PREVIEW PASSED / NOT PRODUCTION. Final Preview reads surfaced the canonical evidence/receipt state in the frontend. | PRODUCTION BLOCKED. | LIVE-FRESHNESS-GATED or TTL-CACHED-WITH-FRESHNESS-PROOF. | Read-only production preflight currently proves 20 claims, at least 114 evidence documents, and 20 receipts; public-alias post capture remains pending. |
| Express backend -> Next API | TTL-CACHED / STALE-WHILE-REFRESH | LOCAL ONLY. Next `/api/forensics` locally delegates to backend freshness checks instead of bypassing through direct Supabase cache reads. | PREVIEW PASSED / NOT PRODUCTION. Final Preview capture has 19/19 HTTP 200, zero capture errors, and zero console-error routes. | PRODUCTION BLOCKED. | CACHE-WITH-FRESHNESS-PROOF. | Canary proof and public-alias post capture are pending. |
| Backend -> open browser tab | MANUAL-STEP-REQUIRED | LOCAL ONLY. SSE invalidation, already-open-tab visible update proof, and visible degraded/stale UI are implemented; `test:e2e:forensics-sse-live-update` and `test:e2e:maya-stale-state` pass locally. | PREVIEW ROUTE PROOF PASSED / LIVE-INVALIDATION STILL LOCAL. Final Preview route capture is green; SSE event mutation proof remains local. | PRODUCTION BLOCKED. | LIVE-INVALIDATION or POLLED-WITH-VISIBLE-STALE-STATE. | Public-alias screenshots and proof manifests are still required before production closeout. |
| Demo/fixture escape hatches | LIVE-CONFIGURED, CACHE DEFAULT-ENABLED | LOCAL ONLY. Runtime authoritative decisions are gated behind rollout mode, receipt availability, and no-legacy decision-column invariants. | PREVIEW PASSED / NOT PRODUCTION. | PRODUCTION BLOCKED UNTIL USER TEST + APPROVAL. | NOT-RUNTIME for fixture/premerged decision inputs. | Provider env and public alias were not changed. |
| Displayed verdict/confidence/routing | PARTIALLY REAL | LOCAL ONLY. Local model can consume receipt-backed decisions instead of seeded line decision columns. | PREVIEW PASSED / NOT PRODUCTION. Final Preview evidence states show `RECON-S3-L1` and visible deterministic basis context. | PRODUCTION BLOCKED. | REAL receipt-backed verdict, confidence factors, routing basis, and visible deterministic basis. | Public alias still lacks post-merge visible `RECON-*` receipt proof. |
| Multi-source evidence reconciliation | STUBBED / SHAPE-ONLY | LOCAL ONLY. Reconciliation engine, receipts, S1-S8 matrix, mutation tests, confidence/basis assertions, and fail-closed tests are implemented. Read-only production-target Supabase proof now shows 20 reconciliation receipts, 114 evidence documents, all required evidence/receipt IDs, and no hash mismatches. | PREVIEW PASSED / NOT PRODUCTION. Final Preview shows canonical POD/remittance evidence IDs, receipt ID, hashes, provenance, and HTTP-verified POD PDF proof. | PRODUCTION BLOCKED. | REAL. | Production frontend post-capture document/media-backed evidence remains pending; Supabase source-table counts/receipts and Preview browser proof are proven, but public-alias browser proof is not. |
| Synthetic verdict/rule-input pipeline | STUBBED | LOCAL ONLY. Runtime decision paths are banned from seeded `rule_input_json`, `verdict`, `routing`, `rule_id`, and `scenario_id`, except explicitly named rollback helpers. | PREVIEW PASSED / NOT PRODUCTION. | PRODUCTION BLOCKED. | NOT-RUNTIME. | Canary/public-alias proof must show authoritative receipt-backed decisions with rollback controls. |
| Production `rule_input_json` path | STUBBED / EXTERNAL-PREMERGED | LOCAL ONLY. Runtime guards prevent promoted decision paths from reading premerged `rule_input_json`; rollback-only isolation remains explicit. | PREVIEW PASSED / NOT PRODUCTION. | PRODUCTION BLOCKED. | NOT-RUNTIME. | Public alias/canary proof is pending. |
| Runtime `scenario_id` path | PRIVATE GROUPING RISK | LOCAL ONLY. Worklist display/API now uses source-line-backed `workItemId`, `workItemLabel`, and `deductionReason`; scenario keys stay private for grouping only. | PREVIEW PASSED / NOT PRODUCTION. | PRODUCTION BLOCKED. | NOT-RUNTIME. | Public alias proof must show no scenario IDs as decision/display inputs. |
| POD/media frontend proof | ABSENT | LOCAL ONLY UPDATED. `docs/audit/real-evidence-local/2026-07-01-local-proof-5/manifest.json` captures all 19 routes with HTTP 200, zero capture errors, zero console-error routes, `proofScope: "local"`, `releaseProof: false`, and all four required Maya evidence states showing visible `EVD-POD-S3-L1`, `EVD-REMIT-S3-L1`, `RECON-S3-L1`, visible content hashes/provenance, and a visible POD document link that returns HTTP 200 `application/pdf` with positive byte length. | PREVIEW PASSED / NOT PRODUCTION. `docs/audit/real-evidence-preview/2026-07-02-430565d/manifest.json` repeats the same required Maya evidence/POD proof on the protected Preview. | PRODUCTION BLOCKED. | REAL MEDIA/DOCUMENT VISIBLE OR GENERATED SOURCE-DOCUMENT PROOF WITH LOAD VERIFICATION. | `check:real-evidence-proof` remains blocked until approved production/public-alias post screenshots and pixel-diff proof exist against the deployed public alias. |

Reviewer Volta confirmed the earlier POD path was metadata plus an HTML safe-viewer link, not original POD PDF/image bytes. Follow-up local hardening makes that distinction fail-closed: HTML safe-viewer proof is no longer counted as loaded POD media in the capture classifier. After the user clarified that prod-ready proof documents may be generated from controlled evidence rows, the route now renders deterministic generated PDF artifacts for `source_generated` POD, SAP invoice, and remittance rows from their persisted evidence payloads. The refreshed `local-proof-5` manifest proves the POD PDF path locally; those artifacts remain generated/source-controlled evidence, not live SAP/3PL/remittance originals.
| Immutable audit + approval fail-closed | REAL | LOCAL ONLY / BASELINE PRESERVED. Approval/HITL paths now carry the promoted reconciliation context in local tests. | PREVIEW PASSED / NOT PRODUCTION. Approval audit panel shows `EVD-POD-S3-L1`, `RECON-S3-L1`, visible hashes/provenance, and HTTP-verified POD PDF proof. | PRODUCTION BLOCKED. | REAL with receipt/source basis in approval/audit proof. | Public-alias approval/audit screenshots and backend proof are pending. |
| Cross-line behavioral gaming detection | REAL LOGIC, PRE-LABELED INPUTS | LOCAL ONLY. Shared-surface regression smoke passes locally for CFO, credit, trace, and evals-finops covered routes. | PREVIEW PASSED / NOT PRODUCTION. Shared-surface smoke passed against the final protected Preview. | PRODUCTION BLOCKED. | REAL LOGIC ON DERIVED INPUTS with no shared-route regression. | Public-alias shared-surface regression proof is pending. |

Fresh no-mutation proof-readiness on 2026-07-02 still exits blocked for production closeout: `npm.cmd run check:real-evidence-proof` reports 19 baseline live captures ready, preview URL presence ready, and production preflight readiness `ready`, but refresh approval is missing, no approved production/public-alias post-implementation manifest exists, and the visual-diff proof is not backed by production public-alias screenshots. The separate local-only `local-proof-5` manifest and final protected Preview manifest both prove the generated POD PDF path, but neither is treated as public-alias production release proof.

Final protected Preview proof on 2026-07-02: the tested Preview URL was `https://recoup-hetylxq9o-hackathonopenai.vercel.app`; no merge to `main`, production alias promotion, or production provider env change was run. `npm.cmd run test:e2e:shared-surfaces` passed against the final Preview. Preview capture `docs/audit/real-evidence-preview/2026-07-02-430565d/manifest.json` is preview-scoped and has 19 captures, 19 HTTP 200 statuses, 19 screenshots, zero capture errors, zero console-error routes, and the four required Maya evidence states each show `EVD-POD-S3-L1`, `EVD-REMIT-S3-L1`, `RECON-S3-L1`, visible hashes/provenance, and an HTTP-verified same-origin POD PDF link. The earlier protected-login manifest at `docs/audit/real-evidence-preview/2026-07-01-preview-2/manifest.json` is retained only as superseded historical evidence.

Final resume checkpoint on 2026-07-02: focused doc/boundary verification passed `tests/unit/real-evidence-doc-honesty.test.ts`, `tests/invariants/cockpit-no-business-logic.test.ts`, and `tests/unit/realtime-next-routes.test.ts`; reviewer Erdos then found one stale safe-viewer checklist phrase, which was removed and guarded. Fresh full `npm.cmd run verify` passed with lint, typecheck, 124 Vitest files / 1038 tests, dependency-cruiser clean with 141 modules / 473 dependencies, and release readiness; the later preview branch verify passed with 124 Vitest files / 1050 tests. `npm.cmd run check:real-evidence-proof` remains blocked for public-alias production closeout exactly as above with `noMutation: true`.

### Highest Priority Fix

Runtime Forensics must stop treating pre-merged `rule_input_json`, seeded `verdict`, seeded `routing`, seeded `rule_id`, and scenario labels as decision inputs in authoritative mode. It must derive rule input, verdict basis, routing basis, confidence factors, evidence IDs, and receipt IDs from persisted SAP, PO, contract, TPM, POD, carrier, remittance, credit memo, bureau, and payment-history evidence documents.

### Maya Live Query SAP-Degraded Proof - 2026-07-01

SAP service access was temporarily unavailable during this local verification window. The Maya live-query path was remediated so SAP degradation does not collapse selected non-SAP canonical evidence queries into `blocked_live_agent_trace`.

Implemented proof:

- `src/services/serviceLayer.ts` emits `sourceReads.selectedEvidence` from the selected reconciliation/evidence packet without faking SAP rows.
- `src/services/conductor.ts` and `src/agents/liveForensicsStream.ts` preserve selected-evidence proof record IDs from RunHooks and SDK stream-item events.
- `src/services/forensicsQuerySession.ts` accepts selected canonical evidence or SAP proof for the live MCP `query.answer` receipt and propagates top-level reconciliation into the live MCP service context.
- Reviewer Hume found one contract gap: top-level reconciliation was not merged into `mcpServiceContext` for live MCP callers. Remediation added the merge and a regression that calls the real `query.answer` service tool through `request.mcpServiceContext`.
- `tests/e2e/maya-real-backend-e2e.ts` now keeps the pre-query process-map source-proof contract explicit while allowing UI-summary nodes without backend trace source attrs.

Verification proof:

```powershell
npm.cmd run test -- tests/unit/forensics-query-session.test.ts tests/unit/live-forensics-stream.test.ts tests/unit/conductor-hooks.test.ts tests/unit/retrieval-tools.test.ts
npm.cmd run test -- tests/unit/cockpit-api.test.ts
npm.cmd run test -- tests/invariants/maya-shadcn-qa-contract.test.ts
npm.cmd run test:e2e:maya-real
npm.cmd run verify
```

Latest local results: focused live-query suite passed 4 files / 62 tests; cockpit API passed 121 tests; Maya shadcn QA invariant passed 35 tests; Maya real-backend E2E passed with 20 canonical line items, 8 work items, 5 live query work items, and 50 backend trace rows; full verify passed with 124 files / 1038 tests plus dependency-cruiser and release readiness. No production deploy, public alias promotion, production mode change, or provider-env change was performed.

### Phase 1-3 Implementation Proof

Current status on 2026-07-01: Phases 1, 2, and 3 of `docs/superpowers/plans/2026-07-01-real-evidence-phased-plan-with-audit.md` are complete on local branch `codex/real-evidence-phased-plan-execution`. No production Supabase DML, Render deploy, Vercel deploy, or production mode change was performed.

Implemented proof:

- Phase 1 added canonical Supabase DDL for `recoup_evidence_documents`, `recoup_evidence_links`, `recoup_deduction_claims`, and `recoup_reconciliation_receipts`, plus typed canonical evidence and claim schemas.
- Phase 2 added deterministic materialization of 20 claims, 114 canonical evidence documents, and 570 evidence links, including `EVD-POD-S3-L1` as a real POD evidence record with provenance and storage URI.
- Phase 2 added bounded local scripts `materialize:real-evidence` and `verify:real-evidence`; no production write path is invoked unless the script is explicitly run with configured credentials.
- Phase 3 added `src/services/reconciliationEngine.ts`, `src/services/reconciliationReceipts.ts`, and `tests/unit/reconciliation-engine.test.ts`.
- Phase 3 tests cover S1-S8 representative reconciliation paths, S3-L1 POD/remittance derivation, missing POD fail-closed behavior, source-field mutation sensitivity, runtime ban checks for `scenario_id`/`scenarioId`/`gold_scenario_id`/`goldScenarioId`, and receipt upsert shape.
- Phase 3 reviewer Aquinas initially failed the slice because S6 omitted SAP invoice evidence and S7 treated bureau/payment context as optional. Both findings were fixed before closeout: S6 now requires `sap_invoice` and includes `EVD-SAP-INVOICE-S6-L1`; S7 now requires `bureau_alert` and `payment_history` and includes `EVD-BUREAU-S7-L1` plus `EVD-PAYMENT-HISTORY-S7-L1`.

Verification proof after Phase 3 remediation:

```powershell
npm.cmd run test -- tests/unit/reconciliation-engine.test.ts
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run verify
```

Latest full gate passed after Phase 3 fixes: lint green, typecheck green, 103 Vitest files / 914 tests green, dependency-cruiser clean with 136 modules / 440 dependencies, and release readiness passed.

### Phase 4 Implementation Proof

Current status on 2026-07-01: Phase 4 of `docs/superpowers/plans/2026-07-01-real-evidence-phased-plan-with-audit.md` is complete locally after reviewer remediation. No production Supabase DML, Render deploy, Vercel deploy, or production mode change was performed.

Implemented proof:

- Promoted Supabase Forensics reads now use `recoup_deduction_claims` plus `recoup_reconciliation_receipts` through `src/adapters/supabaseSyntheticSource.ts`.
- The old `recoup_deduction_lines` decision-column reader is isolated in `src/adapters/legacySupabaseSettlementRunReader.ts` and marked `rollback only`.
- `RECOUP_RECONCILIATION_MODE` supports `legacy`, `shadow`, `canary`, and `authoritative`; the runtime default is `legacy` rollback to prevent a production outage before production evidence/receipt materialization.
- `src/agents/forensics.ts`, `src/services/cockpitApi.ts`, `src/services/cockpitModel.ts`, and `src/services/forensicsQuerySession.ts` pass reconciliation receipts into promoted Forensics decisions, query sessions, SSE/cache validation, and shared CFO/Forensics read models.
- The `/approval` path now carries the same reconciliation context through `prepareApprovalDecision`, so approved actions are looked up against the promoted receipt-backed Forensics run rather than a separately recomputed legacy context.
- `cockpitModel.ts` derives recovery/billing rollups and worklist state from `runForensicsInvestigation` decisions, not persisted line `routing` or `scenario_id`.
- `evals/releaseReadinessCli.ts` respects the active rollout mode. An intermediate full verify failed at `verify:release` with HTTP 404 for `recoup_reconciliation_receipts`, proving the deployment-sequencing risk; the final staged default keeps release readiness green until Phase 5.5 production preflight and explicit human promotion.
- `tests/invariants/no-legacy-decision-columns-runtime.test.ts` now catches `parsed.*` and `settlementLine.*` legacy decision access and allows old columns only in rollback-marked files.
- `tests/unit/cockpit-api.test.ts` includes an authoritative rollout test that refreshes Forensics, approves the selected draft, and asserts the request path does not read `recoup_deduction_lines`.

Verification proof after Phase 4 remediation:

```powershell
npm.cmd run test -- tests/unit/reconciliation-rollout.test.ts tests/invariants/no-premerged-rule-input-runtime.test.ts tests/invariants/no-legacy-decision-columns-runtime.test.ts tests/unit/forensics.test.ts tests/unit/enterprise-connectors.test.ts tests/unit/cockpit.test.ts tests/unit/cockpit-api.test.ts tests/unit/forensics-query-session.test.ts
npm.cmd run typecheck
npm.cmd run verify
```

Latest full gate passed after Phase 4 fixes: lint green, typecheck green, 106 Vitest files / 931 tests green, dependency-cruiser clean with 140 modules / 461 dependencies, and release readiness passed.

### Phase 5-5.5 Implementation Proof

Current status on 2026-07-02: Phase 5 freshness automation and Phase 5.5 cutover preflight are implemented locally for `docs/superpowers/plans/2026-07-01-real-evidence-phased-plan-with-audit.md`. The local runtime now includes the non-secret production project-ref binding, so the default read-only production preflight passes; no production Supabase DML, Render deploy, Vercel deploy, provider env change, production backfill, or rollout-mode promotion was performed.

Implemented proof:

- `src/services/evidenceFreshness.ts` defines the 14 canonical evidence-source freshness inventory and builds deterministic Forensics read-model fingerprints from source table identity, line event hashes, raw source-row freshness hashes, service evidence document hashes, and reconciliation receipt content/basis/confidence hashes.
- `src/services/cockpitApi.ts` no longer serves `/forensics` cached read models as a blind hit. It loads current governed source state with cache bypass, compares `recoup_cockpit_read_models.source_record_ids_json` with the current fingerprint, returns `hit` only on an exact match, returns `stale` and republishes on mismatch, and fails closed if current source rows cannot be verified.
- `cockpit/app/api/forensics/route.ts` delegates Forensics reads to backend `/forensics` instead of serving a direct Supabase read-model cache hit, so the browser-facing route cannot bypass backend freshness checks. `cockpit/app/api/read-model-cache.ts` accepts `stale` as a read-model cache status so the Next proxy can carry the backend stale state.
- `scripts/refreshRealEvidencePipeline.ts` adds an idempotent repository-upsert refresh path for canonical evidence documents, evidence links, deduction claims, and reconciliation receipts. The script fails closed unless `RECOUP_REAL_EVIDENCE_REFRESH_APPROVED=approve-real-evidence-refresh` is present, and the CLI report prints counts/hash counts only.
- `scripts/preflightReconciliationCutover.ts` adds a read-only cutover preflight that selects only claim IDs/line IDs, evidence IDs/content hashes/timestamps, and receipt IDs/content hashes/timestamps. It fails unless the target has 20 claims, at least 114 evidence documents, 20 receipts, all expected evidence IDs, all expected `RECON-*` receipt IDs, matching evidence/receipt `content_hash` values, and a production Supabase URL host matching `RECOUP_PRODUCTION_SUPABASE_PROJECT_REF` when `--target=production`.
- `package.json` adds `refresh:real-evidence` and `preflight:reconciliation-cutover`; `render.yaml` intentionally does not schedule the real-evidence refresh job before explicit cutover approval.

Verification proof after Phase 5/5.5:

```powershell
npm.cmd run test -- tests/unit/source-freshness.test.ts tests/unit/cockpit-api.test.ts tests/unit/real-evidence-refresh-pipeline.test.ts tests/unit/reconciliation-cutover-preflight.test.ts tests/unit/reconciliation-rollout.test.ts
npm.cmd run typecheck
```

Initial focused gate passed: 5 Vitest files / 130 tests green, and typecheck green. A reviewer then found stale Next cache bypass, unsafe scheduled refresh, missing hash comparison, raw source-row freshness gaps, and weak production target binding. Post-review focused gate passed: `npm.cmd run test -- tests/unit/realtime-next-routes.test.ts tests/unit/source-freshness.test.ts tests/unit/real-evidence-refresh-pipeline.test.ts tests/unit/reconciliation-cutover-preflight.test.ts tests/invariants/deployment-readiness.test.ts` (`5` files / `54` tests), and `npm.cmd run typecheck` passed. Full post-review `npm.cmd run verify` passed: lint green, typecheck green, 109 Vitest files / 942 tests green, dependency-cruiser clean with 141 modules / 470 dependencies, and release readiness passed.

### Phase 6-7 Local Hardening And Remaining Production Blockers

Current status on 2026-07-01: Phase 6 browser invalidation/provenance wiring, Phase 6.5 unit/e2e/visual hardening scaffolds, and Phase 7 capture scaffolding are implemented locally. No production Supabase DML, Render deploy, Vercel deploy, provider env change, production backfill, public-alias post capture, canary, or rollout-mode promotion was performed.

Implemented proof:

- `/api/forensics/events` exposes a Server-Sent Events stream for Forensics read-model invalidation, and the Next proxy publishes invalidation when forwarded backend source/receipt hashes change.
- Maya Forensics surfaces visible source/receipt hash chips and a degraded/stale banner when the SSE path is unavailable.
- Canonical evidence/provenance UI exposes `EVD-*`, `RECON-*`, source system/provenance, content hashes, storage URI/link, freshness, and deterministic basis when backend data supplies those fields.
- The cockpit worklist display/API contract no longer exposes `scenarioId` or `scenarioLabel`; it uses source-line-backed `workItemId`, human `workItemLabel`, and `deductionReason`, with S1-S8 group keys kept private for grouping only.
- Missing source evidence now has an explicit no-publish guard: the cockpit API test proves a failed `/forensics/refresh` and failed follow-up `GET /forensics` do not issue another `POST /rest/v1/recoup_cockpit_read_models?on_conflict=model_key`; the only read-model write remains the initial successful publish.
- Rollback continuity is locally tested: canary mode can use a receipt-backed line, authoritative mode fails closed when a receipt is absent, and the local rollback transitions `canary -> legacy`, `canary -> shadow`, `authoritative -> legacy`, and `authoritative -> shadow` return `legacy_rollback` without requiring receipts. This is operational-continuity proof only; production canary/authoritative proof remains pending.
- Deployment cutover manifests are locally guarded: `.env.example` documents blank reconciliation cutover controls, and `tests/invariants/deployment-readiness.test.ts` asserts Render/Vercel manifests do not commit `RECOUP_RECONCILIATION_MODE=authoritative|canary`, canary line IDs, or a production Supabase project ref. This is repository safety proof only; live provider env still requires explicit approval and production preflight.
- Read-only cutover preflight diagnostics still wait for every source-table probe and report sanitized failures together when failures occur. The latest local target now passes with 20 claims, 114 evidence documents, 20 reconciliation receipts, complete required evidence/receipt IDs, and matching evidence/receipt hashes; this is stronger local source-read proof, not a production pass.
- `scripts/planReconciliationCutoverRepair.ts` and `npm.cmd run plan:reconciliation-cutover-repair` convert preflight state into a no-mutation, approval-gated checklist. The latest dry run exits zero with `noMutation: true`, `preflightStatus: "pass"`, `status: "ready_for_refresh_approval"`, no repair actions, and remaining gates for explicit refresh approval, preview/canary/browser/POD-media proof, and re-running production preflight at promotion time.
- Phase 6.5 tests cover S1-S8 reconciliation requirements, source-field mutation sensitivity, non-placeholder confidence/deterministic basis, missing-evidence fail-closed paths, SAP OData fallback provenance, SAP fallback UI honesty, citation prefixing, and payment-history freshness naming.
- E2E/visual hardening scaffolds now exist for SSE live-update proof, degraded/stale-state proof, shared cockpit route smoke, browser-canvas screenshot pixel diffing, and responsive/cross-browser/accessibility checks.
- `scripts/captureRealEvidenceAudit.ts` plus `npm.cmd run capture:real-evidence-audit` can replay the Phase 0 route inventory against an approved preview or public alias and write a sanitized manifest with route status, sanitized console/page error snippets, sanitized origin/path URLs, visible `EVD-*`, visible `RECON-*`, visible content hashes, visible provenance terms, and POD media/link load proof. Media proof now records image `complete`, decoded image dimensions, response status, content type, positive byte length, and safe host/path; non-image/PDF/link media cannot be marked loaded without HTTP status, content-type, and positive byte-length proof.
- `scripts/captureRealEvidenceAudit.ts` now has a route-level timeout guard (`RECOUP_CAPTURE_ROUTE_TIMEOUT_MS`, default 60000ms). If a route stalls, the script closes the page, aborts any Node-side POD/media fetch, records a sanitized `captureError`, keeps proof arrays empty, and continues to the remaining routes instead of freezing without a manifest. Manifest sanitization now redacts absolute/relative query params, bearer/basic auth, authorization fields, email-shaped strings, Windows user paths, and quoted/unquoted secret assignments including lowercase and JSON-style service-role keys.
- `scripts/checkRealEvidenceProofReadiness.ts` plus `npm.cmd run check:real-evidence-proof` provide the no-mutation Phase 7 readiness gate. It consumes the baseline manifest, post manifest, pixel-diff report, and environment readiness, and blocks until every Phase 0 live route has post-capture coverage, screenshot name, existing screenshot file, healthy status, sanitized/no console errors, and passing pixel diff. It separately requires every evidence-detail route (`selected case`, `evidence provenance drawer`, `query answer panel`, `approval audit panel`) to carry its own visible `EVD-POD-S3-L1`, visible `RECON-S3-L1`, visible content hash/provenance proof, and decoded POD image or HTTP-verified non-empty POD PDF/link proof.
- `docs/audit/real-evidence-comparison/2026-07-01.md` now has one explicit pending comparison row for every Phase 0 live route. `tests/unit/real-evidence-comparison-doc.test.ts` reads the baseline manifest, parses the markdown table by route, checks the row-local baseline/post screenshot paths, and requires every row to remain `pending` until post-capture proof exists.
- `README.md` now has a `Real Evidence Cutover Status` section that separates local `npm.cmd run verify` regression proof from production-release proof and names `npm.cmd run check:real-evidence-proof`, `RECOUP_PREVIEW_URL`, visible `EVD-POD-S3-L1`, visible `RECON-S3-L1`, and decoded POD image or HTTP-verified non-empty POD PDF/link proof as current cutover blockers.
- `docs/qa/maya-journey-rag-memory-test-cases-2026-06-28.md` now has a `Historical Scope Note` plus a 2026-07-01 real-evidence proof row, so the older 2026-06-28 production smoke is not treated as today's POD/media cutover proof.
- Pending proof scaffolds exist at `docs/audit/real-evidence-post-implementation/2026-07-01/README.md`, `docs/audit/real-evidence-preview/2026-07-01/README.md`, and `docs/audit/real-evidence-comparison/2026-07-01.md`. These are explicitly pending and are not production proof.

Verification proof:

```powershell
npm.cmd run test:reconciliation:matrix
npm.cmd run test -- tests/unit/realtime-next-routes.test.ts
npm.cmd run test -- tests/unit/reconciliation-cutover-preflight.test.ts
npm.cmd run test -- tests/unit/reconciliation-cutover-repair-plan.test.ts tests/unit/reconciliation-cutover-preflight.test.ts
npm.cmd run test -- tests/unit/evidence-materializer.test.ts tests/unit/reconciliation-receipt-basis.test.ts tests/unit/reconciliation-cutover-preflight.test.ts
npm.cmd run test -- tests/unit/cockpit.test.ts tests/invariants/no-legacy-decision-columns-runtime.test.ts tests/invariants/no-premerged-rule-input-runtime.test.ts
npm.cmd run test -- tests/unit/cockpit-api.test.ts
npm.cmd run test -- tests/unit/reconciliation-rollout.test.ts
npm.cmd run test -- tests/invariants/deployment-readiness.test.ts
npm.cmd run test -- tests/unit/real-evidence-proof-readiness.test.ts tests/unit/real-evidence-capture-media-proof.test.ts tests/unit/reconciliation-cutover-approval-packet.test.ts tests/unit/reconciliation-cutover-sql-artifact.test.ts tests/unit/reconciliation-cutover-env-readiness.test.ts
npm.cmd run test -- tests/unit/evidence-materializer.test.ts tests/unit/real-evidence-proof-readiness.test.ts tests/unit/real-evidence-capture-media-proof.test.ts
npm.cmd run test -- tests/unit/real-evidence-doc-honesty.test.ts
npm.cmd run verify:real-evidence
npm.cmd run verify:real-evidence -- --target=production
npm.cmd run check:real-evidence-proof
npm.cmd run verify
```

Latest focused local gate for the scenario-display hardening passed: `npm.cmd run lint`, `npm.cmd run typecheck`, and `npm.cmd run test -- tests/unit/cockpit.test.ts tests/invariants/no-legacy-decision-columns-runtime.test.ts tests/invariants/no-premerged-rule-input-runtime.test.ts` passed 3 files / 53 tests. Latest full local gate after this focused hardening passed: lint green, typecheck green, 114 Vitest files / 969 tests green, dependency-cruiser clean with 141 modules / 473 dependencies, and release readiness passed. `npm.cmd run verify:real-evidence` returned `{"claims":20,"documents":114,"frontendMediaProof":"not_checked","missingEvidenceIds":[],"proofScope":"local_materialized_dataset","requiredEvidenceIdsPresent":true,"supabasePersistence":"not_checked"}`, which is local materializer proof only and not production Supabase/frontend media proof.
Latest focused local gate for local deterministic readiness, cutover-preflight wording, and all-table preflight failure aggregation passed: `npm.cmd run test -- tests/unit/evidence-materializer.test.ts tests/unit/reconciliation-receipt-basis.test.ts tests/unit/reconciliation-cutover-preflight.test.ts` passed 3 files / 9 tests, and `npm.cmd run verify:real-evidence` returned the local-only proof-scope JSON above.
Latest focused local gate for the no-mutation cutover repair planner passed: `npm.cmd run test -- tests/unit/reconciliation-cutover-repair-plan.test.ts tests/unit/reconciliation-cutover-preflight.test.ts` passed 2 files / 9 tests. `npm.cmd run plan:reconciliation-cutover-repair` exited nonzero as expected while blocked and emitted `noMutation: true` plus approval-required repair actions only.
Latest focused local gate for the missing-evidence no-publish guard passed: `npm.cmd run test -- tests/unit/cockpit-api.test.ts` passed 1 file / 121 tests.
Latest focused local gate for rollback continuity passed: `npm.cmd run test -- tests/unit/reconciliation-rollout.test.ts` passed 1 file / 6 tests.
Latest focused local gate for deployment cutover manifest safety passed: `npm.cmd run test -- tests/invariants/deployment-readiness.test.ts` passed 1 file / 10 tests. Latest full local gate after the no-mutation cutover repair planner passed: lint green, typecheck green, 115 Vitest files / 975 tests green, dependency-cruiser clean with 141 modules / 473 dependencies, and release readiness passed.
Latest focused local gate for Phase 7 proof-readiness hardening passed: `npm.cmd run test -- tests/unit/real-evidence-proof-readiness.test.ts tests/unit/real-evidence-capture-media-proof.test.ts tests/unit/reconciliation-cutover-approval-packet.test.ts tests/unit/reconciliation-cutover-sql-artifact.test.ts tests/unit/reconciliation-cutover-env-readiness.test.ts` passed 5 files / 23 tests. `npm.cmd run typecheck`, `npm.cmd run lint`, and full `npm.cmd run verify` passed after the earlier reviewer fixes.
Latest focused gate after reviewer Goodall's byte-length finding and follow-up doc-honesty updates passed: `npm.cmd run test -- tests/unit/real-evidence-capture-media-proof.test.ts tests/unit/real-evidence-proof-readiness.test.ts tests/unit/real-evidence-doc-honesty.test.ts tests/unit/evidence-materializer.test.ts tests/unit/real-evidence-comparison-doc.test.ts` passed 5 files / 19 tests. Reviewer Kant first tightened the decode/HTTP/content-type and screenshot-file requirements; reviewer Goodall then found a zero-byte PDF/link false-positive path. Byte-length remediation now rejects non-image POD media unless the manifest carries HTTP status, content type, and positive byte length. The gate also rejects `loaded: true` POD media unless the manifest carries decoded image proof or HTTP/content-type/byte-length proof, and it requires post-capture screenshot names plus existing screenshot files when filesystem proof is enabled. `npm.cmd run verify:real-evidence -- --target=production` now delegates to production preflight instead of emitting `local_materialized_dataset`; the default local runtime passes read-only 20/114/20 Supabase proof. Fresh full `npm.cmd run verify` passed lint, typecheck, 123 Vitest files / 1014 tests, dependency-cruiser clean with 141 modules / 473 dependencies, and release readiness.
Latest focused local gate for the comparison doc hardening passed: `npm.cmd run test -- tests/unit/real-evidence-comparison-doc.test.ts tests/unit/real-evidence-proof-readiness.test.ts tests/unit/real-evidence-capture-media-proof.test.ts` passed 3 files / 9 tests.
Latest focused local gate for release-facing documentation honesty, comparison-doc strictness, browser-target preflight, and sanitized browser diagnostics passed: `npm.cmd run test -- tests/unit/real-evidence-browser-target.test.ts tests/unit/real-evidence-doc-honesty.test.ts tests/unit/real-evidence-comparison-doc.test.ts` passed 3 files / 11 tests. Reviewer Averroes found and reviewer Beauvoir approved follow-up sanitizer hardening for whitelisted `error`/`message` diagnostics, including bearer/auth/token/password/api_key/secret/service-role/email-shaped values, quoted JSON-ish assignments, env-prefixed keys, and quoted values containing spaces or commas.

Fail-closed proof still blocking production closeout:

- Superseded local Maya E2E blocker: an earlier post-Kaspersky run failed closed at `/forensics` with HTTP 503 and `missingSource: "supabase-settlement-source-rows"`. The current local Maya real-backend gate is now green under SAP-degraded conditions: `npm.cmd run test:e2e:maya-real` passed against `http://127.0.0.1:4318` with 20 canonical line items, 8 work items, 5 live query work items, and 50 backend trace rows. Final protected Preview proof is also green. The remaining blockers in this section are production-release hardening, canary, approved public-alias post-capture, visual/POD-media proof against production, and public-alias proof.
- `npm.cmd run preflight:reconciliation-cutover` now emits structured JSON and exits zero for the local target: 20 claims, 114 evidence documents, 20 reconciliation receipts, 114 evidence hashes, 20 receipt hashes, no missing required evidence/receipt IDs, and no hash mismatches.
- `npm.cmd run preflight:reconciliation-cutover -- --target=production` emits structured JSON and exits zero by default from the local runtime: 20 claims, 114 evidence documents, 20 receipts, complete required IDs, and matching hashes.
- `npm.cmd run verify:real-evidence -- --target=production` follows the production preflight path and exits zero from the local runtime with production read-only 20/114/20 proof instead of local materializer proof.
- `npm.cmd run test:e2e:forensics-sse-live-update` now passes locally against `localhost:3000`; it proves an already-open Maya tab visibly updates after a real same-origin refresh path changes the business hash.
- `npm.cmd run test:e2e:shared-surfaces` now passes locally after the CFO evals-finops signed read-proxy and duplicate-key fixes. `npm.cmd run test:e2e:maya-stale-state` also passes locally.
- `npm.cmd run verify:real-evidence-a11y -- --browsers=chromium` passes locally across the script's Chromium mobile/tablet/desktop viewports, including evidence/POD visibility, labeled buttons, horizontal overflow, and contrast checks. Fresh post-fix reruns also passed `npm.cmd run typecheck`, the 5-file / 23-test focused real-evidence doc/proof/browser-target unit gate, `npm.cmd run test:e2e:forensics-sse-live-update`, `npm.cmd run test:e2e:maya-stale-state`, and `npm.cmd run test:e2e:shared-surfaces`. Reviewer Mendel re-reviewed the browser-hardening slice after the final visibility, diagnostics, and contrast fixes and approved with no remaining findings. The default all-browser `npm.cmd run verify:real-evidence-a11y` remains blocked, not passed: Firefox headless launch times out with a Windows graphics framebuffer error after browser binaries were installed. Per user instruction, cross-browser was skipped for this Windows-local proof, but Chromium-only is not release cross-browser proof.
- Reviewer Bacon found no critical auth/write-access issue in the CFO evals-finops signed read proxy, React key changes, or visual diff fail-closed path. The only reviewer finding was that browser-helper route/login failures could look like selector timeouts; `tests/e2e/real-evidence-browser-helpers.ts` now rejects non-2xx/3xx responses, rejects `/login` redirects, uses the current header worklist path, supports mobile worklist rows, and emits visible button diagnostics when the worklist cannot open.
- `npm.cmd run verify:real-evidence-visual` emits `docs/audit/real-evidence-comparison/2026-07-01-visual-diff.json` and exits nonzero because post-implementation screenshots are intentionally absent before approved deploy/capture; the visual-diff script now reaches this controlled missing-screenshot failure instead of crashing inside browser evaluation.
- `npm.cmd run check:real-evidence-proof` emits no-mutation JSON and exits nonzero for production closeout. Production preflight readiness is `ready` and final protected Preview proof exists, but environment readiness is still blocked by missing refresh approval; no approved production/public-alias post-implementation manifest exists; and production post proof is absent for decoded/HTTP-verified non-empty media, screenshot files, provenance/hash/evidence/receipt proof, and route-level proof. The latest visual-diff report reflects partial local screenshots only: 3 route pairs pass and 16 required route pairs still fail. Those partial screenshots and the protected Preview manifest are not Phase 7 production proof without a matching post manifest generated from the approved public alias capture.
- Local-only capture proof on 2026-07-02, superseded by `local-proof-5`: the earlier `docs/audit/real-evidence-local/2026-07-01-local-proof/manifest.json` correctly exposed missing Maya evidence-route proof, `docs/audit/real-evidence-local/2026-07-01-local-proof-3/manifest.json` closed that visibility gap while still carrying optional-route timeout/console noise, and `docs/audit/real-evidence-local/2026-07-01-local-proof-4/manifest.json` proved the old HTML safe-viewer/link path. The current local-only manifest is `docs/audit/real-evidence-local/2026-07-01-local-proof-5/manifest.json`; it has 19 captures, 19 HTTP 200 captures, zero capture errors, zero console-error routes, screenshots for all 19 routes, `proofScope: "local"`, `releaseProof: false`, and clean local captures for the previously noisy `/forensics`, `/run`, and `/governance/connectors` routes. It closes the Maya visibility and media-load gap locally: `selected case`, `evidence provenance drawer`, `query answer panel`, and `approval audit panel` each show `EVD-POD-S3-L1`, `EVD-REMIT-S3-L1`, `RECON-S3-L1`, 2-3 content hashes, `source_generated` provenance, and an HTTP-verified POD PDF link (`application/pdf`, 1322 bytes for `EVD-POD-S3-L1`). This remains explicitly not production/preview proof.

## Maya Real-Backend SAP/Supabase Closure - 2026-06-24

This entry supersedes the earlier blocked `recoup_src_sap` note for Maya real-backend readiness.

Current source/data state:

- Supabase project `nmwfftudympcvcjtyjbf` now has `public.recoup_src_sap` with 12 clean `sap-odata` read-model rows covering S1-S6 from `ZUI_BILLINGDOCUMENTFS_0001/C_BillingDocumentFs` and `ZUI_BILLINGDOCUMENTFS_0001/C_BillingDocumentItemFs`.
- The two stale Harbor SAP cache rows for invoice `90000005` were deleted because live SAP returned `SoldToParty=USCU_L02` while owner/Supabase mapping identifies Harbor as `USCU_S04`. Runtime SAP evidence readers now reject any stored SAP header row where linked `USCU_*` provenance contradicts `payload_json.d.SoldToParty`.
- S7/S8 intentionally have no SAP coverage until the owner/source mapping is reconciled or SAP supplies a matching invoice. They remain covered through real Supabase docs/TPM/bureau evidence rows and Maya E2E still passes.
- The SAP provisioner is read-only against SAP and writes no ERP data. It builds `recoup_src_sap` rows from approved source links, validates `BillingDocument` and `SoldToParty` before row creation, keeps mapping provenance in `linked_record_ids`, and fails before SQL output when diagnostics or expected line coverage gaps exist.

Files and proof:

- `src/services/sapSupabaseEvidenceProvisioner.ts`
- `scripts/provisionSupabaseSapEvidenceRows.ts`
- `src/adapters/supabaseSyntheticSource.ts`
- `tests/unit/sap-supabase-evidence-provisioner.test.ts`
- `tests/unit/enterprise-connectors.test.ts`
- `tests/unit/supabase-memory.test.ts`
- `tests/e2e/maya-real-backend-e2e.ts`

Fresh verification:

```powershell
npm.cmd run test -- tests/unit/sap-supabase-evidence-provisioner.test.ts tests/unit/supabase-memory.test.ts tests/unit/enterprise-connectors.test.ts
npm.cmd run test:e2e:maya-real
npm.cmd run verify
```

The real-backend E2E harness records backend calls to `/forensics`, `/connectors`, `/forensics/work-items/:lineId`, and `/forensics/query`, compares backend trace rows to app/DOM rows, rejects fixture API and Playwright route/fulfill fragments, and captures Beat 1-through-12 screenshots in `output/playwright/e2e/real-backend/`.

Final subagent reviewer gate for the mixed SAP-customer provenance fix reported P0/P1/P2 none. A later live-agent query boundary reviewer reported two P2s; both are closed by requiring the handoff source and target (`Forensics Investigator` -> `Recovery Drafter`) and by adding route-level run-control, retry, token-budget, no-handoff, and fail-closed tests. The protected-read reviewer findings are closed by server-rendered backend auth headers, stale source-readiness suppression, and SAP live-probe-before-connected enforcement.

## Maya Real-Backend Hardening Evidence - 2026-06-24

This historical entry records the earlier Task 9 source truth and unavailable state before the SAP/Supabase closure above. Older realtime/fixture screenshot notes in this audit log remain historical UI and security evidence; current real-backend readiness is recorded in the superseding entry above.

Source truth:

- `/forensics/shadcn` loads `fetchForensicsModel()` and `fetchConnectorReadinessModel()` from `cockpit/app/cockpit-data.ts`; the Next proxy path maps those calls to Express `/forensics` and `/connectors`, and real backend mode also uses `/forensics/work-items/:lineId` and `/forensics/query`.
- Supabase-backed: KPI/worklist/evidence/draft/retrieval/source-readiness business fields are backend/read-model data built from governed source readers and `recoup_src_*` evidence rows.
- SAP-backed: SAP OData remains read-only; configured SAP health/read-plan facts are backend connector/source-health facts, not UI-generated status.
- Agent-trace-backed: Query answers, citations, deterministic basis, and trace rows come from backend `POST /forensics/query` and deterministic/agent hook trace events.
- Derived backend values: source readiness tone/icon, counts, labels, recommendation/read-only draft posture, and Beat 12 global Source Readiness derive from backend/read-model fields such as `connectors.sourceTiles`.
- UI-only labels: tabs, buttons, navigation, and explicit backend-gap/unavailable labels are presentation only. Business values must be backend/read-model fields or unavailable.

Historical unavailable state, now superseded:

- Earlier real-backend E2E `npm.cmd run test:e2e:maya-real` failed closed at `/forensics` with HTTP `503`, `missingSource=supabase-sap-source-evidence-rows`, and `sourceTableName=recoup_src_sap`.
- Earlier read-only Supabase diagnosis on project `nmwfftudympcvcjtyjbf` found `recoup_src_sap` missing while non-SAP Recoup source tables were populated. This is superseded by the approved `recoup_src_sap` migration/backfill captured in the closure entry above.
- Earlier subagent read-only review found the `recoup_src_sap` schema in `docs/supabase-memory-schema.sql` and `src/memory/supabaseStore.ts`, but found no approved non-dummy real SAP row backfill path in package scripts or provisioning docs. This is superseded by `scripts/provisionSupabaseSapEvidenceRows.ts` and the live SAP/Supabase read-back evidence above.
- Recent controller error body:

```json
{ "error": "Supabase SAP source evidence rows are unavailable or failed validation.", "missingSource": "supabase-sap-source-evidence-rows", "sourceTableName": "recoup_src_sap", "correlationId": "0142c7c9-1c16-42f4-b64e-4d905f4e0331" }
```

This historical entry predates the SAP/Supabase and live-agent-query closure. Current `npm.cmd run test:e2e:maya-real` reaches `POST /forensics/query` and passes with 4 Maya query scenarios / 32 backend trace rows, as recorded in the closure entry above.

Verification commands for the next real-backend gate:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run verify
npm.cmd run test:e2e:maya-real
```

Recent evidence: Task 7 added `package.json` script `test:e2e:maya-real` plus `tests/e2e/maya-real-backend-e2e.ts`; final review passed for real-backend-only behavior with no fixture API, no Playwright `page.route`/fulfill, backend/proxy response-body capture, backend `/forensics/query` trace comparison against app response and DOM rows, and cockpit reuse disabled for acceptance. Historical controller checks earlier covered 86 Vitest files / 698 tests; latest 2026-06-25 controller evidence supersedes that with `npm.cmd run verify` passing lint, typecheck, 89 Vitest files / 737 tests, dependency-cruiser clean with 115 modules / 367 dependencies, and release readiness passed. Fresh `npm.cmd run test:e2e:maya-real` passes against `http://127.0.0.1:4318` and reaches live-agent-backed query orchestration with 4 Maya query scenarios / 32 backend trace rows. Task 8 removed Beat 12 local facet counts, makes global Source Readiness derive from `connectors.sourceTiles`, and added boundary invariants. Task 10 is demo-ready for the implemented real-backend Maya journey, with the documented caveat that S7/S8 SAP evidence remains fail-closed until the owner/SAP customer mapping is reconciled. Phase 0 reproducibility remains blocked by the dirty/untracked worktree with nothing staged.

## Audit Summary

| Audit Area | Reviewer Mode | Key Findings | Status | Evidence |
|---|---|---|---|---|
| Architecture and harness | Independent architecture review | Memory, skills, handoffs, permission metadata, run control, audit replay, and launch gates needed clearer implementation status. | Partially resolved | `docs/architecture-review-and-recommendations.md`, `src/memory/`, `src/agents/handoffGraph.ts`, `src/services/conductor.ts`, `tests/invariants/memory-contract.test.ts`, `tests/invariants/run-control.test.ts` |
| Supabase memory | Independent memory/Supabase audit | Supabase must be the primary shared memory path; live Postgres timestamps must round-trip into Recoup's ISO memory contract. | Resolved baseline | `src/memory/supabaseStore.ts`, `docs/supabase-memory-schema.sql`, `tests/unit/supabase-memory.test.ts`, `tests/unit/runtime-memory.test.ts` |
| SQLite memory | Independent memory audit | Runtime memory needed durable SQLite-backed records and cockpit visibility. | Resolved baseline | `src/memory/sqliteStore.ts`, `src/memory/runtime.ts`, `src/services/cockpitApi.ts`, `tests/unit/sqlite-memory.test.ts`, `tests/unit/cockpit-api.test.ts` |
| SAP OData | Independent SAP connector audit | SAP must stay read-only, protect credentials, support OAuth or Gateway Basic auth, map `docs/Tools_data` invoice IDs through `ZUI_BILLINGDOCUMENTFS_0001/C_BillingDocumentFs`, retrieve billing items only through metadata-validated GET collection filters, and expose the owner-locked R1 SAP-primary needs as metadata-validated GET request plans. Owner R2-5 locks the broader R1 SAP-primary/Supabase-fallback source set; live expansion beyond R1 remains deferred. | Resolved invoice header/item baseline; R1 source-read contract implemented | `src/adapters/sapOData.ts`, `src/services/serviceLayer.ts`, `src/services/cockpitApi.ts`, `src/tools/retrieval/sap.ts`, `skills/sap-odata-access/SKILL.md`, `tests/unit/sap-odata.test.ts`, `tests/unit/r1-source-read.test.ts`, `tests/unit/cockpit-api.test.ts`, `tests/invariants/no-erp-writeback.test.ts` |
| Cockpit auth and Realtime | Independent security audit | Cockpit approval and Realtime secret endpoints allowed forged human context. Service approval path hard-coded a human approver. Realtime credential gating was coupled to unrelated connector config. | Resolved hackathon guard; live client-secret proof captured | `src/services/cockpitApi.ts`, `src/services/realtimeSession.ts`, `src/services/serviceLayer.ts`, `cockpit/app/approval-controls.tsx`, `cockpit/app/realtime-query-controls.tsx`, `tests/unit/cockpit-api.test.ts`, `tests/unit/realtime-session.test.ts`, `tests/invariants/integration-contract.test.ts` |
| MCP and tool permissions | Independent MCP/RBAC audit | Production MCP endpoint and helper facade needed auth; MCP calls needed actor capability checks; internal approval/core tools must remain hidden. The authenticated StreamableHTTP `tools/list` path now proves the bounded advisory agent-to-agent tools are visible while `approvals.decide` stays hidden. | Resolved hackathon guard plus MCP agent-to-agent transport proof | `src/mcp/server.ts`, `src/services/permissionEngine.ts`, `tests/invariants/mcp-transport.test.ts`, `tests/invariants/mcp-visibility.test.ts`, `tests/invariants/tool-permissions.test.ts` |
| UI/UX against O2C Design System | Independent visual audit | Cockpit needed restrained operational framing, a desktop hero workflow, and mobile table ergonomics. | Resolved first-viewport QA baseline | `cockpit/app/page.tsx`, `cockpit/app/styles.css`, `tests/invariants/cockpit-no-business-logic.test.ts`, `O2C Design System v3.1.dc.html` |
| Connector readiness | Independent connector/security audit | SAP stays live read-only; SAP/docs/TPM/bureau runtime evidence now comes from Supabase source tables, while bureau, remittance/EDI, document repository, and TPM use synthetic Supabase source-table readiness for Day 1 after a schema probe verifies the `docs/Tools_data` tables and no unsafe shadow action statuses are present. Production `/run` and MCP SAP/docs/TPM/bureau retrieval now consume Supabase `recoup_src_*` rows and fail closed when required source context is unavailable. | Foundation implemented; live contracts deferred; seed SQL remains human-approval only | `src/adapters/connectorRegistry.ts`, `src/adapters/bureau.ts`, `src/adapters/remittance.ts`, `src/adapters/ediRemittance.ts`, `src/adapters/docRepo.ts`, `src/adapters/tpm.ts`, `src/services/serviceLayer.ts`, `src/mcp/server.ts`, `src/memory/supabaseStore.ts`, `docs/supabase-memory-schema.sql`, `tests/unit/retrieval-tools.test.ts`, `tests/invariants/connector-readiness.test.ts` |
| OpenAI evidence vector store | Independent vector-store/source audit | Vector-store hits must enforce citation metadata and the seed corpus must be provisioned without committing secrets. The owner-approved seed-42 lifecycle is exposed as the manual `npm run provision:openai-evidence-vector-store` command for first provisioning or deterministic seed regeneration. | Resolved seed lifecycle; broader production corpus expansion deferred | `src/adapters/openAiVectorStore.ts`, `scripts/provisionOpenAiEvidenceVectorStore.ts`, `package.json`, `tests/unit/enterprise-connectors.test.ts` |
| R1 source-read surface | Independent source/API audit | Frontend and MCP callers need bounded source retrieval without static code values or SAP mutation. `sources.r1Read` and `GET /sources/r1/:need` now accept only owner-locked R1 source needs, return SAP metadata-validated GET read plans for SAP-primary needs, and return Supabase authoritative read-plan envelopes for locked fallback needs. Reviewer findings closed an unused import, pre-validation SAP metadata fetches, and silent extra-query-key stripping. | Implemented; production expansion beyond locked R1 remains deferred | `src/services/serviceLayer.ts`, `src/services/cockpitApi.ts`, `src/adapters/sapOData.ts`, `tests/unit/r1-source-read.test.ts`, `tests/unit/cockpit-api.test.ts`, `tests/invariants/mcp-visibility.test.ts`, `tests/invariants/integration-contract.test.ts` |

## Resolved Findings

### Cockpit Approval And Realtime Auth

- `POST /approval` requires a configured human principal/token and rejects missing auth before parsing or committing an approval decision.
- `POST /query/realtime-client-secret` requires the same verified human context before any upstream Realtime request.
- Realtime safety identifier is bound server-side to the verified human principal, not a request body value.
- Realtime client-secret issuance now gates only on `OPENAI_API_KEY`; unrelated SAP/Supabase config parsing cannot block the guarded OpenAI path.
- Local live proof on June 19, 2026 returned HTTP 200, `status: issued`, model `gpt-realtime-2`, transport `webrtc`, and audit record `OPENAI-REALTIME-POLICY` without printing secret values. The normal local Node path first exposed `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, so the proof used one process-scoped TLS bypass; production must use a trusted CA chain instead.
- The internal `approvals.decide` service path now requires explicit verified service context and no longer stamps a hard-coded approver.
- Runtime env loading strips a leading UTF-8 BOM before parsing local `.env` files, preventing the first credential key from being dropped.

Evidence: `tests/unit/cockpit-api.test.ts`, `tests/unit/realtime-session.test.ts`, `tests/invariants/runtime-config.test.ts`, `tests/invariants/integration-contract.test.ts`.

### MCP StreamableHTTP And RBAC

- Production MCP uses `StreamableHTTPServerTransport` on `/mcp`.
- `/mcp` rejects unauthenticated requests when MCP auth is configured.
- The legacy helper facade routes are protected by the same auth middleware when mounted.
- Read-only MCP clients and clients with omitted capabilities are denied draft action calls before tool handler execution; `draft_action` must be explicit for MCP draft-only artifacts.
- Authenticated StreamableHTTP `tools/list` exposes the bounded read-only advisory tools `agent_tool_sentinel_position` and `agent_tool_containment_intent_position` for MCP agent-to-agent use, while `approvals.decide`, core compute tools, and decision tools remain hidden.
- Post-fix reviewer `Kierkegaard` found no Critical or Important owner-free MCP/backend code gap after the Supabase-required context repair; docs now distinguish absent source context from present-but-empty evidence rows.
- `approvals.decide`, core compute tools, and decision tools remain absent from MCP visibility.

Evidence: `tests/invariants/mcp-transport.test.ts`, `tests/invariants/mcp-visibility.test.ts`, `tests/invariants/tool-permissions.test.ts`.

### Read-Only SAP Baseline

- SAP OData adapter exposes read and request-planning methods only.
- The local SAP OData skill guides metadata-first, read-only Gateway access and blocks SAP mutation paths inside Recoup.
- OAuth client-credentials token retrieval is isolated from SAP business reads, and Gateway Basic auth is supported when `SAP_ODATA_USERID` plus the configured secret are present.
- The `docs/Tools_data` invoice header mapping uses `ZUI_BILLINGDOCUMENTFS_0001/C_BillingDocumentFs` and requires `SAP_ODATA_CLIENT` so read URLs include `sap-client`.
- Numeric `INV-*` record IDs also build a read-only `C_BillingDocumentItemFs` collection GET filtered by `BillingDocument`; this avoids inventing a `BillingDocumentItem` key when the line only cites an invoice number.
- Empty or malformed item collection payloads are suppressed and do not become cited evidence.
- Synthetic `INV-*` IDs without a numeric SAP suffix fail closed and do not become live SAP reads.
- Production service/MCP SAP evidence retrieval consumes cached Supabase `recoup_src_sap` rows and fails closed when the required source context is unavailable; prefix-derived SAP evidence remains test/setup or legacy adapter behavior only.
- POD, credit memo, and duplicate-claim proof are no longer attributed to SAP by the fallback path; they remain non-SAP evidence unless deterministic SAP keys are added.
- Credit memo/reference live lookup remains owner-bound until a real SAP credit memo key/link field or accessible OData contract is supplied.
- Secret-bearing connection details are not serialized through runtime config or adapter JSON.
- R1 SAP-primary source reads for invoice, sales order, credit account DSO, credit exposure, dispute case, and accrual cap build metadata-validated GET plans only; unsupported or missing metadata fails closed.
- The bounded `sources.r1Read` service/API surface returns Supabase authoritative read-plan envelopes for locked fallback needs instead of hard-coded business values.
- R1 route validation now runs before SAP metadata context creation; malformed SAP-primary params return 400 without a SAP `$metadata` fetch.
- R1 service schemas are strict and route queries use per-need allowlists, so unexpected/narrowing params cannot be stripped into broader read plans.
- Live Basic-auth metadata proof on June 19, 2026 returned HTTP 200 for `FCOM_COSTCENTER_SRV/$metadata` and exposed `CostCenterSet` plus `F4_CostCenterSet` without requiring scope or tenant.
- Live OData payload mapping to Recoup evidence is covered by unit tests.

Evidence: `tests/unit/sap-odata.test.ts`, `tests/invariants/no-erp-writeback.test.ts`, `tests/invariants/integration-contract.test.ts`.

### Probe-Gated Tools Data Readiness

- Supabase credentials alone no longer mark bureau, docs, remittance/EDI, or TPM as `ready_synthetic`.
- The connector readiness model requires a Supabase schema probe for the `docs/Tools_data` tables and reports `blocked_schema_required` for 404/not-exposed tables.
- The probe returns table/status classes only and does not return row IDs, amounts, or service-role secrets.
- Readiness blocks if shadow action tables contain external-action statuses: `billing_requests.status=SENT_TO_SAP`, `recovery_packages.status=SUBMITTED_TO_PORTAL`, or `immutable_audit_log.action_type=SAP_STAGE_WRITE`.
- Production `/run` and MCP SAP/docs/TPM/bureau retrieval paths preload required Supabase `recoup_src_sap`, `recoup_src_docs`, `recoup_src_tpm`, and `recoup_src_bureau` evidence rows and fail closed when that evidence context is absent.
- Generic source `correspondence` rows are not decision evidence unless linked record IDs map them to decision-safe credit-memo evidence.
- `docs/Tools_data/seed_data.sql` is not applied automatically because it runs `TRUNCATE ... CASCADE` and seeds action/decision/audit-like rows.

Evidence: `src/memory/supabaseStore.ts`, `src/adapters/connectorRegistry.ts`, `tests/unit/supabase-memory.test.ts`, `tests/invariants/connector-readiness.test.ts`.

### OpenAI Evidence Vector Store Seed Lifecycle

- `src/adapters/openAiVectorStore.ts` enforces `source_table`, `record_id`, `customer_id`, `scenario_type`, and `provenance=synthetic` metadata before a hit can become cited evidence.
- `scripts/provisionOpenAiEvidenceVectorStore.ts` creates or reuses the evidence vector store, uploads the four deterministic seed dossiers, and writes only `OPENAI_EVIDENCE_VECTOR_STORE_ID` to `.env.local`.
- `package.json` exposes the side-effecting lifecycle as `npm run provision:openai-evidence-vector-store`; it is not part of `npm run verify` and should be run only for first provisioning or deterministic seed regeneration unless cleanup-idempotency is added later.
- No OpenAI API key, vector-store ID, SAP credential, or Supabase service key is committed or printed in this audit log.

Evidence: `src/adapters/openAiVectorStore.ts`, `scripts/provisionOpenAiEvidenceVectorStore.ts`, `package.json`, `tests/unit/enterprise-connectors.test.ts`.

### Supabase Durable Memory Baseline

- Supabase/Postgres is selected ahead of SQLite when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured.
- The generated DDL and reviewable SQL artifact stay aligned, with constrained memory categories, record IDs, indexes, RLS enablement, and service-role-only grants.
- The same schema artifact now includes `recoup_src_sap` with `provenance = sap-odata` and Day-1 synthetic source tables for bureau, docs, consolidated remittance/EDI, and TPM with `provenance = synthetic`.
- Live Supabase REST table reads were verified for `recoup_memory_records`.
- Postgres `timestamptz` rows are normalized to Recoup's internal ISO datetime memory contract before Zod validation.

Evidence: `tests/unit/supabase-memory.test.ts`, `tests/unit/runtime-memory.test.ts`, `docs/supabase-memory-schema.sql`.

### Cockpit Visual QA Baseline

- `tests/invariants/cockpit-no-business-logic.test.ts` passes after removing the over-framed medium shadow and restoring the desktop workflow grid.
- Playwright with installed Chrome verified desktop `1440x900` and mobile `390x844`: page identity, nonblank render, no framework overlay, no console errors, and refresh-button interaction focus.
- Mobile navigation now wraps instead of clipping, and the worklist uses a compact mobile table so amount cells remain visible.

Evidence: `cockpit/app/styles.css`, `tests/invariants/cockpit-no-business-logic.test.ts`.

## Open Findings For Judges

These are intentionally visible because Recoup's contract says supplied owner decisions must be implemented through governed config/source boundaries, not guessed in runtime logic.

| Open Finding | Why It Is Open | Required Owner Input |
|---|---|---|
| Expert-owned constants | Arbitration weights, R-score weights, drift thresholds, gaming thresholds, partial-hold config, accuracy bars, Harbor Risk Mesh case facts, David credit display values, Harbor Sentinel source refs, run-control budgets, and seed are owner-ratified Day-1 tunables for the demo and must not be guessed beyond the governed Supabase/config seed rows; `CODEX_BUILD_ANSWERS.md` is referenced historically but is not present in this repo checkout. | Runtime governed config, Harbor `risk_mesh_cases`, Supabase Tools_data R-drift source rows, and run-control loading are wired; production VERIFY-PROD calibration remains required before final operating use. |
| Real SAP S/4HANA O2C query mapping | Read-only OAuth/Basic OData baseline, live Gateway metadata proof, demo invoice header/billing-item reads, and bounded R1 SAP-primary read plans exist. Owner R2-5 locks the R1 SAP-primary/Supabase-fallback source set; live SAP expansion beyond R1 still needs reachable endpoints and metadata-backed entity mapping. | Reachable O2C SAP services, entity sets, key fields, and sample payloads beyond the locked R1 source set. |
| Release readiness gate | `verify:release` is wired into `npm run verify`, reads owner-approved run-control, eval labels, governed values, and Harbor `risk_mesh_cases` facts/display/source-ref values from Supabase `recoup_config`, validates row hashes, compares `expectedRanking` when deterministic arbitration emits ranked options, and fails closed if the DB rows are missing or incomplete. The cockpit `/run` path also loads the same DB-backed `run_control` row, passes DB-loaded `forensics.stepBudget`/`retryCap` into the live runner, records explicit SDK usage metadata against the DB-loaded token budget, and no longer has hard-coded SDK tool/live retry defaults. | Closed for the supplied owner response and Supabase `risk_mesh_cases` migrations; future changes must be made through governed DB rows and source tables, not hardcoded runtime values. |
| SAP/bureau/remittance/EDI/docs/TPM source depth | Supabase source-table schema, readiness foundation, and read-only table-reading adapters are implemented for Day 1; `/run` and MCP use Supabase SAP/docs/TPM/bureau rows in the R1 runtime path. Live mappings remain deferred. | Later source contracts, field dictionaries, example payloads, and reconciliation keys for VERIFY-V3 live adapters. |
| Model/build/runtime verification flags | Embeddings model id, Codex build-model id, and SAP sandbox instance remain owner-verification flags; Recoup must not assert final production identity for them until confirmed. | Owner-confirmed model IDs and SAP sandbox instance before production or published benchmark claims. |
| Full cockpit depth | First-viewport desktop/mobile visual QA baseline is resolved; deeper interactive drilldowns remain planned. | Final O2C design review for expanded flows beyond the first viewport. |
| Enterprise identity | Hackathon guards use configured principal/token headers. | Production IdP/OAuth/KMS/Secure MCP Tunnel decision. |

## Judge Review Path

1. Start with `README.md` for the demo narrative and claim-to-code-to-test map.
2. Open this file for the independent audit evidence trail.
3. Open `docs/architecture-review-and-recommendations.md` for broader architecture findings and resolved/open status.
4. Run `npm.cmd run verify` to validate invariants, unit tests, dependency-cruiser boundaries, and Supabase-backed release readiness.
