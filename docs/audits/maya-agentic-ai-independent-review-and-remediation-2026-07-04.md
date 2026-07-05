# Maya Agentic AI — Independent Review and Grounded Remediation Plan

Date: 2026-07-04
Reviewer: independent pass over the actual working tree (not a re-read of the audit docs alone).
Inputs reviewed: `docs/audits/maya-agentic-ai-capability-audit-2026-07-04.md`, `docs/audits/maya-agentic-ai-remediation-2026-07-04.md`, plus direct code verification of every claim that drives a remediation item.

Grounding rule used throughout: every claim below cites a real file/line in this repo. Anything the original remediation plan proposed to *build* that already *exists* is called out so it is not rebuilt.

---

## Part 1 — Independent Review Verdict

### 1.1 Claims in the audit that are CORRECT (verified in code)

| # | Audit claim | Verified evidence |
| --- | --- | --- |
| C1 | S1–S8 hard binding | Confirmed, and it is **wider than the audit says** — 6 binding sites, not 3: `src/types/claims.ts:5` (`GoldScenarioIdSchema`), `src/types/entities.ts:15`, `src/adapters/supabaseSyntheticSource.ts:598-601` (`scenarioIdFromLineId` regex `^(S[1-8])-`), `src/adapters/legacySupabaseSettlementRunReader.ts:43`, `src/memory/supabaseStore.ts:641` (embedded DDL CHECK), `docs/supabase-memory-schema.sql:39` (DB CHECK constraint). Plus two *behavioral* bindings: `verdictForRule`/`routingForVerdict` (`supabaseSyntheticSource.ts:603-619`) and the reason-code→rule switch in `src/services/reconciliationEngine.ts:169-199` (only DAMAGE, DUPLICATE_CREDIT, OTIF, PRICING, PROMO, SHORTAGE). And `tests/e2e/maya-real-backend-e2e.ts:293-305` asserts exactly 8 groups / 20 lines. |
| C2 | No event-driven **new-case** trigger | Confirmed. The only background loop is `startSourceHealthPoller` (`src/services/sourceHealthPoller.ts:93-118`), which polls **source health + MCP readiness** and persists snapshots — it does not detect new source rows or republish the forensics read model. Classification recomputes on `GET /forensics` / `POST /forensics/refresh` (`src/services/cockpitApi.ts:437-565`). |
| C3 | No inbound/quarantine lane | Confirmed. Zero hits for `quarantine`, `recoup_inbound`, or `classifyForensicsWorkItem` anywhere in `src/`. |
| C4 | Whole-worklist fail-closed on one bad row (the audit's "likeliest missed bug") | **Confirmed and worse than "likely" — it is certain.** `src/adapters/supabaseSyntheticSource.ts:450-452` throws if any table is empty; lines 474-485 throw on the *first* claim with an unknown customer, missing receipt, or receipt/claim mismatch. One incomplete candidate row in `recoup_deduction_claims` takes down the **entire** Maya worklist (503 fail-closed). This is the single most demo-lethal defect. |
| C5 | Memory recall gated + advisory | Confirmed. `src/services/cockpitApi.ts:1930` — recall context loads only when `RECOUP_MAYA_QUERY_MEMORY_RECALL === "enabled"`; recall is prompt-context only. |
| C6 | Vector/RAG covers representative lines only | Confirmed. `scripts/provisionOpenAiEvidenceVectorStore.ts:282-303` provisions dossiers for exactly 4 lines: S1-L1, S3-L1, S6-L1, S8-L1 (of 20). |
| C7 | Full source contract required for a new Supabase case | Confirmed. `loadSupabaseSettlementSource` requires rows in `recoup_customers`, `recoup_deduction_claims`, `recoup_reconciliation_receipts`, `recoup_evidence_documents`, `recoup_evidence_links` (`supabaseSyntheticSource.ts:414-471`). |

### 1.2 Claims that are STALE or UNDER-REPORT existing capability (do NOT rebuild these)

| # | Audit/remediation statement | What actually exists |
| --- | --- | --- |
| S1 | Audit Q27: "worklist real-time update **not proven**"; remediation P0-2 proposes building UI listening | **Already built and e2e-proven.** The cockpit subscribes to `EventSource("/api/forensics/events")` and reloads on `forensics-read-model-invalidated` (`cockpit/components/maya/maya-forensics-surface-loader.tsx:80-105,384`; publisher in `cockpit/app/api/read-model-cache.ts:340`). `tests/e2e/forensics-sse-live-update-e2e.ts` proves the receipt hash changes in the UI **without manual reload**. The only missing piece is a *server-side detector of source-data change* that fires the existing invalidation — not the channel, not the UI. |
| S2 | Remediation P0-2 lists "explicit `/forensics/ingest/refresh` admin route" as an option to add | `POST /forensics/refresh` already exists, rate-limited and auth-gated, and republishes the read model with fresh source hashes (`cockpitApi.ts:528-565`). |
| S3 | Remediation P0-4 proposes "add a service such as `classifyForensicsWorkItem(...)`" | **The classification service substantially exists** — it just isn't named that. `reconcileDeductionClaim` (`src/services/reconciliationEngine.ts:65`) deterministically derives the rule input from claim + canonical evidence documents, calls `core.evaluateRule`, and emits a receipt with deterministic basis, evidence IDs, confidence factors, and content hash. It runs live inside `runForensicsInvestigation` (`src/agents/forensics.ts:525`) and offline in `scripts/refreshRealEvidencePipeline.ts:44` and `scripts/preflightReconciliationCutover.ts:438`. P0-4 is a thin naming/packaging task, not new engineering. |
| S4 | Remediation P0-1 implies SAP normalization must be designed from scratch | A governed SAP→Supabase evidence normalization path already exists: `src/services/sapSupabaseEvidenceProvisioner.ts` (typed rows, provenance `"sap-odata"`, 12 fail-closed diagnostic codes such as `missing-explicit-source-link`, `sap-read-payload-customer-mismatch`) plus `scripts/provisionSupabaseSapEvidenceRows.ts`. What's missing is only the **claim-candidate creation + quarantine** step in front of it. |
| S5 | Remediation P2-1 proposes building an MCP runtime visibility panel | Largely exists. The source-health poller already probes MCP (`probeMcpReadiness`, `src/services/mcpHealth.ts`) and folds it into source-health snapshots with proof items (`sourceHealthPoller.ts:46-77` — transport, endpoint, session mode, "auth configured", "no ERP write-back", **no secrets**), surfaced through `GET /connectors` (`cockpitApi.ts:645-681`) and the connectors read model. Gap is only "last `query.answer` read status" as a visible row. |
| S6 | Reset story treated as missing | Substantial reset machinery exists: `POST /admin/demo-reset` (admin-principal-gated approval lifecycle reset, `cockpitApi.ts:1491-1528` → `resetDemoLifecycleRecords` at `:2588`), `npm run materialize:real-evidence` / `refresh:real-evidence` (reseed + re-derive receipts; refresh gated by an explicit approval env var, `scripts/refreshRealEvidencePipeline.ts:67`), `refresh:source-health`, `provision:openai-evidence-vector-store`, and the e2e helpers already reset approvals with a CFO principal (`forensics-sse-live-update-e2e.ts`). The remediation must **compose** these into runbooks, not invent them. |
| S7 | "A new case within S1–S8 patterns is much closer than S9" (audit Q6, stated softly) | Stronger than stated: a **new line inside an existing scenario** (e.g. `S3-L5`) flows end-to-end today with zero code change, because receipts are *derived* (`reconcileDeductionClaim`) and `scenarioIdFromLineId` accepts any `S[1-8]-*` line ID. Only the e2e's exact 20-line parity assertion would flag it. This is a demo-ready capability nobody is claiming credit for. |

### 1.3 Net independent verdict

The original audit is honest and mostly accurate on gaps, but it under-credits the codebase: the SSE invalidation channel, the deterministic classifier, the SAP evidence normalizer, the MCP health surface, and most of the reset machinery already exist. The original remediation plan would cause **rework of at least 4 already-built capabilities** (S1–S5 above) if executed literally.

The true gap list, re-ranked by demo/production risk:

1. **G1 (new P0)** — one incomplete source row kills the whole worklist (C4). Neither audit doc ranks this first; it should be, because it converts "judge inserts a slightly-wrong row" into a full Maya outage.
2. **G2 (P0)** — no server-side detector that *source data changed* → fire existing SSE invalidation (C2; channel already exists per S1).
3. **G3 (P0)** — no inbound/quarantine lane for incomplete candidates (C3) — this is the constructive fix for G1.
4. **G4 (P0)** — S1–S8 hard binding across 6 declared + 2 behavioral sites (C1).
5. **G5 (P1)** — memory recall disabled in env; judge narrative undefined (C5).
6. **G6 (P1)** — vector corpus 4/20 lines (C6).
7. **G7 (P1)** — production proof stale for dirty branch (accepted as-is from audit; verified `npm` scripts exist to regenerate it).
8. **G8 (P2)** — MCP `query.answer` last-read status not judge-visible (small residue of P2-1).

---

## Part 2 — Remediation Plan (grounded, no-rework)

Execution order below is dependency-ordered: R0 → R1 → R2 → R3 are the P0 spine; R4–R7 are independent and parallelizable after R0.

### R0 — Per-line quarantine instead of whole-dataset fail-closed (fixes G1 + G3, delivers old P2-2)

**Why first:** removes the only defect that can zero out the demo, and creates the quarantine lane every later item (ingestion, S9, SAP) depends on.

**Design (minimal, prod-grade):**
- In `loadSupabaseSettlementSource` (`src/adapters/supabaseSyntheticSource.ts:473-508`), replace the per-claim `throw` with partitioning: claims that pass all joins/validation → `deductionLines` (unchanged contract); claims that fail → `quarantinedCandidates: { lineId, claimId, customerId, gaps: SourceGapCode[] }[]` with typed gap codes (`missing-customer`, `missing-receipt`, `receipt-claim-mismatch`, `missing-evidence-document`, `invalid-scenario-id`, `unknown-reason-code`).
- Keep the existing hard throw **only** when zero claims survive (true outage) and when a whole table read fails (lines 450-452) — that is a source outage, not a candidate gap.
- Thread `quarantinedCandidates` through `buildForensicsCockpitModel` (`src/services/cockpitModel.ts`) into a separate worklist section "Candidate — source gaps" with **no verdict, no routing, no approve/send affordance**. Copilot answers about a quarantined line must state the gap codes, never a verdict.
- Reuse the existing fail-closed JSON shape (`sendFailClosedJson`) for the outage case so no error contract changes.

**Explicitly NOT doing:** LLM inference of missing inputs; auto-promoting candidates; new DB tables (quarantine is computed from existing rows — no new state to reset).

**Success criteria:**
- Insert 1 claim row with no receipt → `/forensics` returns 200; 20 canonical lines intact; 1 candidate row with `missing-receipt`.
- Delete that claim → candidate disappears on refresh. Zero residue.
- `npm run verify` green; `tests/invariants/deduction-evidence-pack.test.ts`, `maya-real-backend-contract.test.ts` untouched or minimally extended.

**Test cases:**
1. Unit (`tests/unit/`): partition logic — each gap code produced by exactly its trigger condition; complete claim never quarantined; empty-tables still throws.
2. Invariant: quarantined candidate can never carry `verdict`, `routing`, or an approvable action (extend `action-hitl-all-capabilities.test.ts` pattern).
3. E2E scenario: seed canonical 20 + 1 broken candidate → worklist shows 8 work items + 1 candidate card; approve/send controls absent on candidate; Copilot query about the candidate cites gap codes.

**Reset:** `DELETE FROM recoup_deduction_claims WHERE line_id = '<candidate>'` (plus any evidence rows inserted for the test) then `POST /forensics/refresh`. No other state exists.

---

### R1 — Source-change detector wired to the EXISTING invalidation channel (fixes G2, delivers old P0-2)

**Design:** clone the proven poller pattern, don't invent an event bus.
- New `src/services/forensicsSourcePoller.ts` modeled line-for-line on `sourceHealthPoller.ts:93-118`: every `intervalMs` (owner-configurable via `recoup_config`, default 30s), load source context with `bypassCache`, compute `buildForensicsReadModelFreshnessRecordIds(...)` (already exists — used at `cockpitApi.ts:452-460`), compare with the published read model's `sourceRecordIds`.
- On mismatch: rebuild via the exact code path of `POST /forensics/refresh` (`cockpitApi.ts:544-561`) — `buildForensicsCockpitModel` → `publishReadModel` → which already fires `forensics-read-model-invalidated` to `/api/forensics/events` subscribers (`cockpit/app/api/read-model-cache.ts:340`).
- Wire into `createCockpitApiApp` next to `startSourceHealthPoller` with the same `onError` + stop-handle pattern; idempotent by construction (hash compare); crash-safe (next tick re-polls — no queue state to recover).
- Env kill-switch `RECOUP_FORENSICS_SOURCE_POLLER=disabled` for tests that need deterministic timing.

**Explicitly NOT doing:** Supabase realtime/webhooks/pg triggers (new infra + new failure modes the judges can't see; the poller gives the same observable outcome — "insert row, UI updates itself, no browser refresh" — with one file of code); LLM in the loop; auto-actions (the rebuilt model still only stages HITL-pending actions).

**Success criteria / test cases:**
1. Insert a complete new line (e.g. `S3-L5` full contract) → within 1 poll interval the worklist row appears in an already-open browser with **no user action**. (This is the judge money-shot; scriptable because S7 in Part 1 confirmed in-scenario lines need no code change.)
2. Insert an incomplete candidate → candidate card appears (R0), no verdict, UI not broken.
3. Insert the same row twice / re-poll with no change → read-model hash unchanged, no invalidation fired (assert via `x-recoup-read-model-cache: hit`).
4. Kill the poller mid-run → API still serves; next start resumes; no partial state (poller is stateless).
5. Extend `forensics-sse-live-update-e2e.ts` with a "data-driven" variant: instead of POSTing `/api/forensics/refresh`, insert a Supabase row and wait for the hash change.

**Reset:** delete the inserted rows (claims/receipts/evidence for the test line) → next poll republishes the canonical model automatically. Force with `POST /forensics/refresh` if you don't want to wait an interval.

---

### R2 — Governed scenario catalog beyond S1–S8 (fixes G4, delivers old P0-3)

**Design:**
- Add scenario catalog as **owner-approved config**, reusing the existing `recoup_config` owner-input mechanism (`loadReleaseOwnerInputs`, `cockpitApi.ts:840-860`) rather than a new table: one row `scenario_catalog` listing `{ scenarioId, allowedRuleIds, goldSet: boolean }`. S1–S8 seeded as `goldSet: true`.
- Replace the 6 declared bindings (Part 1 C1) with catalog-driven validation:
  - `scenarioIdFromLineId` → parse `^(S\d+)-` and validate membership in the catalog; unknown scenario → **quarantine with `invalid-scenario-id`** (R0 lane), never a crash.
  - `GoldScenarioIdSchema` stays for gold-set/eval code paths; runtime line schema (`types/entities.ts:15`) widens to catalog-validated string.
  - Migration SQL to drop/replace the CHECK in `recoup_deduction_lines` (`docs/supabase-memory-schema.sql:39`; generator pattern already exists in `scripts/generateReconciliationCutoverSchemaRepairSql.ts`). Same for the embedded DDL in `src/memory/supabaseStore.ts:641`.
- **Honest constraint (state it, don't hide it):** a new scenario must map to one of the 8 deterministic rules via the reason-code switch (`reconciliationEngine.ts:169-199`). An unknown reason code fails closed into quarantine (`unknown-reason-code`). A genuinely new *rule* is a code change by design — that is the deterministic-spine invariant, and the judge answer is "new scenarios of known deduction physics onboard via config; new deduction physics require a governed code release."
- E2E parity: change `maya-real-backend-e2e.ts` assertion from *exact set equality* to *gold-set superset parity* — S1–S8 / 20 lines must all be present with exact counts; additional catalog scenarios are validated by their own new test, not by mutating the gold assertion.

**Success criteria / test cases:**
1. Catalog + full source rows for `S9-L1` (reason code PROMO) → appears as a runtime work item with derived receipt, verdict, HITL action; S1–S8 gold parity test still green.
2. `S9-L1` rows present but S9 **not** in catalog → quarantined `invalid-scenario-id`.
3. Catalog entry with reason code outside the 8 rules → quarantined `unknown-reason-code`, no verdict.
4. `seed-reproducible.test.ts`, `no-premerged-rule-input-runtime.test.ts`, reconciliation matrix (`npm run test:reconciliation:matrix`) all green — proves generalization didn't weaken determinism.

**Reset (scenario-scoped):** delete S9 rows from `recoup_deduction_claims`, `recoup_reconciliation_receipts`, `recoup_evidence_documents`, `recoup_evidence_links`; remove the catalog entry (or flip it inactive); `POST /forensics/refresh`. Gold set is untouched by construction.

**Owner inputs still required (carried over, unchanged):** scenario ID format confirmation, allowed rule IDs per new scenario, whether new scenarios need gold labels before UI display.

---

### R3 — SAP-only candidate ingestion (remainder of old P0-1)

**Design (builds on R0 + R2 + existing S4 capability):**
- Extend the existing provisioning path: `sapSupabaseEvidenceProvisioner.ts` already turns SAP OData reads into typed `recoup_evidence_documents` rows with fail-closed diagnostics. Add a small `buildSapClaimCandidates` step that, for SAP rows with no matching claim, writes a **claim candidate** into `recoup_deduction_claims` with a flag/reason (or leaves it absent and reports it), so it lands in the R0 quarantine lane as `missing-receipt` until reconciliation inputs are complete.
- Promotion is automatic once the contract completes: `reconcileDeductionClaim` derives the receipt (via `refreshRealEvidencePipeline` or the R1 poller path if receipts are derived-on-read in canary/authoritative mode — `src/services/reconciliationRollout.ts:20-34` already governs receipt-vs-legacy source per line).
- No ERP write-back anywhere (invariant `no-erp-writeback.test.ts` stays authoritative).

**Success criteria / test cases:**
1. SAP sandbox row with valid source link → evidence row lands with `provenance: "sap-odata"`; candidate visible in quarantine with named gaps; **no classification emitted**.
2. Complete the contract (claim + derived receipt) → line promotes to classified work item on next poll; verdict from deterministic path only.
3. SAP row with customer mismatch → rejected with existing diagnostic `sap-read-payload-customer-mismatch`; nothing inserted.
4. Verify no external action / write-back occurred (existing invariant suite).

**Reset:** delete the SAP-provisioned evidence rows (`provenance = 'sap-odata'` AND the test record IDs) + candidate claim; `POST /forensics/refresh`. Script `provisionSupabaseSapEvidenceRows.ts` re-provisions on demand.

**Owner inputs required:** SAP sandbox field → claim field mapping; authoritative Supabase table decision; candidate-visible-before-receipt policy; approved status names (these four carry over verbatim from the original plan — they are genuinely open).

---

### R4 — Name the classifier (old P0-4; packaging only)

Export `classifyForensicsWorkItem(...)` from a new thin module (e.g. `src/services/forensicsClassifier.ts`) that composes what already exists: `reconcileDeductionClaim` → `evaluateRule` → `decisions.deductionVerdict` → routing/action derivation, returning `{ verdict, routing, recommendedAction, citations, deterministicBasis, pendingHumanAction }`. `runForensicsInvestigation` (`forensics.ts:525`) calls it instead of inlining. Zero behavior change — assert byte-identical receipts in a characterization test before/after. This gives the judge story its named box ("source change → classifier service → read model → UI") at ~1 file of cost.

**Success criteria:** characterization test proves identical output pre/post; missing evidence still blocks (existing behavior); `verify` green. **Reset:** n/a (no state).

---

### R5 — Memory semantics (old P1-1)

- Set `RECOUP_MAYA_QUERY_MEMORY_RECALL=enabled` in `.env.local`, Vercel, and Render envs (audit confirmed code path is ready at `cockpitApi.ts:1925-1954`).
- Adopt the audit's judge statement verbatim (advisory recall, source-hash verified, fail-closed) — it matches the code as-is.
- **Defer** the evidence-hash-validated memory-first cache (original "optional product upgrade") unless demo rehearsal shows latency pain; it adds a trust surface for zero judge-visible gain given recall already appears in the trace.

**Test cases (mostly existing):** `tests/unit/memory.test.ts`, `tests/invariants/memory-contract.test.ts` green; new: repeat query on same line shows recall record IDs in UI trace; forged/unsafe record ID ignored (helper `isSafeMayaQueryMemoryRecordId` already enforces); memory backend down → query still answers.
**Reset:** memory rows are scoped `case:<lineId>` — delete those rows in the Supabase memory table (`RECOUP_SUPABASE_MEMORY_TABLE`) or the SQLite file at `RECOUP_MEMORY_DB_PATH`; `POST /admin/demo-reset` for approval-state memory.

---

### R6 — Vector corpus 4 → 20 lines (old P1-3)

Extend the dossier array in `scripts/provisionOpenAiEvidenceVectorStore.ts` (currently 4 entries at lines ~282-303) to all 20 canonical lines, keeping the existing metadata contract (`source_table`, `record_id`, `customer_id`, `scenario_type`, `provenance`) that the script already enforces. Re-run `npm run provision:openai-evidence-vector-store`. If time-boxed out, the fallback is one sentence in the demo script: "vector search is representative; deterministic receipts cover 20/20" — but with the script already built, full coverage is ~1–2 hours of dossier authoring.

**Success criteria:** every S1-L1…S8-Ln has ≥1 indexed doc; malformed metadata rejected (script already fails closed); Copilot answers still cite deterministic records first (existing behavior).
**Reset:** the script is idempotent against `OPENAI_EVIDENCE_VECTOR_STORE_ID`; to fully reset, delete the vector store in OpenAI, remove the env var, re-run the script (it re-creates and rewrites `.env.local`).

---

### R7 — MCP `query.answer` visibility residue (old P2-1) + production proof (old P1-2)

- **P2-1 residue:** `/connectors` already shows MCP transport/auth/health with proof items and no secrets (verified, Part 1 S5). Add one field to the connectors read model: timestamp + status of the last successful `query.answer` selected-evidence read (recorded where the MCP proof is validated in the query path). Small, additive.
- **P1-2 verbatim from original plan (it is correct and the tooling exists):** before judging, on the release SHA run `npm.cmd run verify`, `test:e2e:maya-real`, `test:e2e:maya-approval-lifecycle`, `npm.cmd exec tsx scripts/runMayaProdQa.ts`; capture branch/SHA, Vercel deployment ID, Render status, Supabase snapshot timestamps, redacted memory + MCP proofs into `docs/audit/` / `output/playwright/`. Add `test:e2e:forensics-sse-live-update` and the new R1 data-driven variant to that list.

**Success criteria:** artifacts' SHA == deployed SHA; secret-scan of artifacts clean (existing `pii-guard` discipline).
**Reset:** artifacts are additive files; re-run to supersede.

---

## Part 3 — Consolidated test-scenario matrix

| # | Scenario | Trigger | Expected | Covered by |
| --- | --- | --- | --- | --- |
| T1 | Complete new line, existing scenario (`S3-L5`) | Insert full contract rows | Auto-appears in open UI ≤ 1 poll interval; deterministic verdict; HITL pending | R1 e2e (new) |
| T2 | Incomplete candidate (claim, no receipt) | Insert claim row only | Worklist intact; candidate card with `missing-receipt`; no verdict; no approve/send | R0 unit + e2e |
| T3 | New governed scenario (`S9-L1`, PROMO) | Catalog entry + full rows | Runtime work item; gold parity unchanged | R2 e2e (new) |
| T4 | Non-approved scenario | `S9` rows, no catalog entry | Quarantine `invalid-scenario-id` | R2 unit |
| T5 | Unknown reason code | Catalog entry, reason code ∉ 8 rules | Quarantine `unknown-reason-code`; fail-closed | R2 unit |
| T6 | SAP-only entry | SAP sandbox row, no Supabase claim | Evidence provisioned `sap-odata`; candidate w/ gaps; no classification | R3 test |
| T7 | Duplicate/no-op event | Re-insert identical row | Hash unchanged; no invalidation; cache `hit` | R1 unit |
| T8 | Poller crash | Kill poller mid-cycle | API serves; poller resumes stateless | R1 test |
| T9 | Repeat-login recall | Same case, 2nd session, recall enabled | Recall IDs in trace; tools still read; answer cites source | R5 (existing + new) |
| T10 | Stale/forged memory | Changed source hash / unsafe record ID | Recall marked stale/ignored; tools re-read | R5 (existing invariants) |
| T11 | Memory backend down | Disable Supabase memory | Query still answers; persistence skipped | existing `memory.test.ts` |
| T12 | OpenAI / MCP missing | Unset creds | Live query fails closed; no fabrication | existing (audit-verified) |
| T13 | Gold-set parity | Full canonical dataset | S1–S8, 8 work items, 20 lines, exact counts | existing `maya-real-backend-e2e.ts` (assertion relaxed to superset per R2) |
| T14 | Approval lifecycle + reset | Approve then admin reset | State persists across login; reset restores baseline | existing `maya-approval-lifecycle-e2e.ts` + `/admin/demo-reset` |
| T15 | No auto external action, no ERP write-back | Any of the above | Never | existing invariant suite (`no-erp-writeback`, `action-hitl-all-capabilities`) |

## Part 4 — Reset runbook (per-scenario and full)

All resets are idempotent and composable; run any subset.

| Level | What it resets | How |
| --- | --- | --- |
| Read model only | Stale cache/hash | `POST /forensics/refresh` (auth’d) — existing |
| Approvals/lifecycle | Approved/rejected actions, demo lifecycle | `POST /admin/demo-reset` with admin principal + `actionId` — existing (`cockpitApi.ts:1491`) |
| One test scenario (T1–T6) | Rows inserted for that scenario | `DELETE` the scenario's rows from `recoup_deduction_claims`, `recoup_reconciliation_receipts`, `recoup_evidence_documents`, `recoup_evidence_links` (+ catalog entry for T3/T4) → `POST /forensics/refresh` or wait one poll. Provide these as small SQL files under `docs/audits/reset/` per scenario. |
| Canonical dataset | Full 20-line gold data | `npm run materialize:real-evidence` then `npm run refresh:real-evidence` (approval-env-gated) — existing |
| Source health / MCP snapshots | Poller snapshots | `npm run refresh:source-health` — existing |
| Memory | Case recall + query scope records | Delete `case:<lineId>`-scoped rows in memory table / SQLite file; approval memory via demo-reset — existing stores |
| Vector store | Evidence corpus | Delete OpenAI vector store + env var, re-run `npm run provision:openai-evidence-vector-store` — existing script |
| **ALL scenarios (full demo reset)** | Everything above | Ordered: scenario SQL deletes → `materialize:real-evidence` → `refresh:real-evidence` → `/admin/demo-reset` → memory cleanup → `refresh:source-health` → `POST /forensics/refresh` → verify with `npm run test:e2e:maya-real`. Package as `scripts/resetDemoAll.ts` (thin orchestrator over existing pieces — the only *new* reset code in this plan). |

## Part 5 — Definition of Done (supersedes the original doc's DoD)

1. T1–T15 all green; T1 demonstrated in a live browser with no manual refresh.
2. One incomplete row can never 503 the worklist (R0 invariant test in CI).
3. `S9` onboarding is config + data only for known rule physics; unknown physics fail closed with a named gap.
4. `npm run verify`, `test:e2e:maya-real`, `test:e2e:maya-approval-lifecycle`, `test:e2e:forensics-sse-live-update` (+ data-driven variant) green on the release SHA.
5. Production smoke artifacts current (SHA-matched), secret-free, stored under `docs/audit/`.
6. `scripts/resetDemoAll.ts` restores the canonical baseline from any test scenario in one command, verified by running T13 immediately after.
7. No new invariant violations: HITL on all external actions, no ERP write-back, no LLM-owned dollars/verdicts, deterministic receipts remain the decision source.

## Part 6 — Effort and sequencing

| Item | Size | Depends on | Notes |
| --- | --- | --- | --- |
| R0 quarantine | M (0.5–1 day) | — | Highest risk reduction per hour |
| R1 source poller | S–M (0.5 day) | R0 | Clones existing poller; channel already built |
| R4 named classifier | S (2–3 h) | — | Parallel with R0 |
| R5 memory env + narrative | S (1–2 h) | — | Mostly config + docs |
| R6 vector 20/20 | S (1–2 h) | — | Dossier authoring |
| R2 scenario catalog | M–L (1–1.5 days) | R0 | Touches 6 sites + migration + e2e assertion change |
| R3 SAP candidates | M (1 day) | R0, R2, owner inputs | Owner inputs are the long pole |
| R7 MCP field + prod proof | S (2–3 h) + proof run | all merged | Proof run last, on release SHA |

Critical path for the judge demo: **R0 → R1** (auto-appearing new case with quarantine safety), then R2 if the "S9" question is expected, then R7 proof run. R3 only if a live SAP insert will actually be demonstrated.
