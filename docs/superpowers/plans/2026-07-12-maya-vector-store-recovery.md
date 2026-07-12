# Maya Vector Store Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inaccessible Maya evidence vector store, expose it as the eighth truthful Source Readiness tile, and prove scoped retrieval in production without changing deterministic decisions.

**Architecture:** OpenAI Vector Stores remains an optional semantic retrieval index. Supabase remains the durable source and read-model store; deterministic services continue to compute all amounts, verdicts, routing, and external-action proposals. Runtime readiness is probed and persisted through the existing source-health model, while selected-case evidence counts include the vector store only when a matching document was actually retrieved.

**Tech Stack:** Node 22, TypeScript, OpenAI Vector Stores REST API, Express, Next.js, Supabase source-health snapshots, Vitest, Playwright.

---

### Task 1: Preserve the approved plan and clean baseline

**Files:**
- Create: `docs/superpowers/plans/2026-07-12-maya-vector-store-recovery.md`

- [x] Create `codex/maya-vector-store-recovery` from current `origin/main`.
- [x] Run `npm ci`.
- [x] Run `npm run test`; expected baseline: 169 files and 1,538 tests pass.

### Task 2: Harden stale-store recovery with TDD

**Files:**
- Modify: `scripts/provisionOpenAiEvidenceVectorStore.ts`
- Create: `tests/unit/openai-evidence-vector-store-provisioner.test.ts`

- [x] Add a failing test proving an accessible configured store is reused.
- [x] Add a failing test proving HTTP 404 creates a replacement store.
- [x] Add failing tests proving 401/403 and transient failures stop without changing configuration.
- [x] Add dependency injection for bounded OpenAI fetch and env-file writes.
- [x] Implement the minimal store validation/replacement behavior.
- [x] Run the focused provisioner suite green.

### Task 3: Add the eighth Source Readiness tile with TDD

**Files:**
- Create: `src/services/openAiEvidenceVectorReadiness.ts`
- Modify: `src/services/sourceHealth.ts`
- Modify: `src/services/sourceHealthPoller.ts`
- Modify: `src/services/cockpitModel.ts`
- Modify: `tests/unit/cockpit.test.ts`
- Create: `tests/unit/openai-evidence-vector-readiness.test.ts`

- [x] Add red tests for connected, indexing/degraded, missing configuration, 404, and authentication failure.
- [x] Add a red model test expecting eight ordered source tiles with `OpenAI Vector Store` after `Contract Repo`.
- [x] Implement a read-only readiness probe that exposes no key, vector-store ID, or provider file ID.
- [x] Persist readiness through the existing source-health snapshot path.
- [x] Keep the selected-case Evidence Sources KPI derived from actual evidence documents.
- [x] Run focused readiness, cockpit-model, and source-health tests green.

### Task 4: Provision and validate the replacement store locally

**Files:**
- Modify locally only: `.env.local` (never commit)

- [x] Run the provisioner in an isolated operational checkout with the valid `OPENAI_API_KEY` and without the stale vector ID.
- [x] Upload governed dossiers for `S1-L1`, `S3-L1`, `S6-L1`, and `S8-L1`.
- [x] Wait for the OpenAI file batch to report `completed`.
- [x] Directly search all four expected cases and prove customer/scenario/record-ID matching.
- [x] Prove all other Maya lines, including `S2-L1`, `S4-L1`, `S5-L1`, and `S7-L1`, do not receive mismatched vector evidence.
- [x] Update the primary local `.env.local` only after all direct searches pass.

### Task 4A: Close independent-review findings before release

**Files:** provider adapter/types, provisioner/readiness services, API/view models, and their focused tests.

- [x] Remove raw OpenAI file IDs and vector-store IDs from service, API, provenance, and UI payloads.
- [x] Make provisioning idempotent for an already-complete governed manifest and fail closed for ambiguous nonempty stores.
- [x] Add bounded timeouts to readiness and provisioning provider calls, including response-body parsing.
- [x] Require the exact governed manifest, exact four-file completion, and exact per-file metadata before readiness can report `Connected`.
- [x] Reject wrong document types, incomplete/mixed/foreign record-ID metadata, and validate exact expected record scope.
- [x] Correct vector source-health provenance language and close the first two independent-review finding sets.

### Task 5: Verify locally and prepare release evidence

**Files:**
- Modify: `docs/independent-audit-log.md`

- [x] Run `npm run lint`, `npm run typecheck`, focused tests, and environment-complete `npm run verify` after remediation.
- [x] Run local premium browser E2E for all eight Maya cases, voice citation parity, David, CFO, and `/finops`.
- [x] Run live real-backend Maya E2E across eight work items / twenty lines and five live agent queries.
- [x] Verify expected vector cards show `OpenAI vector store` and semantic scores.
- [x] Verify no raw `file-*` / vector-store IDs or cross-case citations are exposed.
- [x] Run repeated senior diff critiques, remediate all code findings, and reconcile this plan with actual evidence.
- [ ] Commit and push the reviewed branch; prepare a PR without merging.

### Task 6: Production approval gate

- [ ] Stop and request explicit owner approval before changing Render, merging to `main`, or deploying Vercel.
- [ ] After approval only: update Render `OPENAI_EVIDENCE_VECTOR_STORE_ID`, merge the reviewed PR, confirm Render/Vercel deployment IDs, force `/forensics/refresh`, and run production E2E.
- [ ] Roll back by unsetting the new vector-store ID and redeploying if readiness, citation scope, or regression checks fail.

## Success Criteria

- Source Readiness shows eight truthful tiles; `OpenAI Vector Store` reflects real provider health.
- `S1-L1`, `S3-L1`, `S6-L1`, and `S8-L1` show scoped semantic evidence.
- Nonmatching cases do not receive vector evidence.
- All eight Maya live queries, voice parity, David, CFO, and FinOps regressions pass.
- No model computes business values; no external action bypasses HITL; no secret or provider file ID is exposed.
- No production change occurs without the separate owner approval required by Task 6.
