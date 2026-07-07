# Maya Selected-Case Fix and Production Movement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Maya selected-case Copilot/detail-cache blockers, verify the fix locally across all real cases, and move the release to production without disturbing the current `main` baseline or any unrelated shared surfaces.

**Architecture:** Use the clean main-aligned worktree `C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup-main-scope-fix` on branch `codex/maya-selected-case-scope-main` as the only execution source. Treat the release as a two-runtime movement: Render owns the Express `POST /forensics/query` logic in `src/services/cockpitApi.ts`, while Vercel owns the Next read-model cache and work-item detail route under `cockpit/app/api/`. Ship the scope fix and cache-version fix only after local browser proof passes, reviewer checks pass, and the human approval gate is re-opened.

**Tech Stack:** Git worktree, TypeScript, Vitest, Playwright, Next.js App Router on Vercel, Render `recoup-api`, Supabase read-model cache, Resend-backed email flow.

---

## Current Execution Status

- **Local release candidate:** verified on `2026-07-07`
- **Completed in this worktree:**
  - backend selected-case trust narrowed to rendered evidence packet
  - case-detail browser-selected query scope aligned to rendered evidence packet
  - Maya per-line detail cache key bumped to `v2`
  - focused unit suites green
  - `npm run build` green
  - `npm run verify` green
  - `npm run test:e2e:maya-real` green
  - `npm run test:e2e:maya-approval-lifecycle` green
- **Reviewer note carried into prod plan:** the `v2` cache bump intentionally cold-starts detail rows, so production movement must include a post-deploy per-line cache prewarm and smoke.
- **Production state:** blocked pending explicit user approval.

---

## Release Source Of Truth

- Verified execution worktree: `C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup-main-scope-fix`
- Verified branch: `codex/maya-selected-case-scope-main`
- Verified local `HEAD`: `7d23260`
- Verified `origin/main`: `7d23260`
- Production gate: **No merge, deploy, alias cutover, or provider mutation until the user explicitly approves the release candidate.**

## Runtime Map

- **Render deploy surface**
  - `render.yaml`
  - `src/services/cockpitApi.ts`
  - `src/services/forensicsQuerySession.ts`
  - `src/services/serviceLayer.ts`
  - `src/services/cockpitModel.ts`
  - `/healthz`
  - `https://recoup-api.onrender.com`
- **Vercel deploy surface**
  - `vercel.json`
  - `cockpit/app/api/read-model-cache.ts`
  - `cockpit/app/api/forensics/work-items/[lineId]/route.ts`
  - `cockpit/app/*`
  - `https://recoup-self-eta.vercel.app`
- **Verification-only assets**
  - `tests/unit/cockpit-api.test.ts`
  - `tests/unit/forensics-query-session.test.ts`
  - `tests/unit/maya-workspace-derived.test.ts`
  - `tests/e2e/maya-real-backend-e2e.ts`
  - `tests/e2e/maya-approval-lifecycle-e2e.ts`
  - `scripts/runMayaProdQa.ts`
  - `output/playwright/e2e/`
  - `output/playwright/prod-qa/`

---

### Task 1: Freeze The Release Baseline

**Files:**
- No source edits.

- [ ] **Step 1: Prove the worktree is still the clean source of truth**

```powershell
git -C "C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup-main-scope-fix" status --short --branch
git -C "C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup-main-scope-fix" rev-parse --short HEAD
git -C "C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup-main-scope-fix" rev-parse --short origin/main
```

Expected:

```text
## codex/maya-selected-case-scope-main...origin/main
7d23260
7d23260
```

- [ ] **Step 2: Stop if branch drift appears**

```powershell
git -C "C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup-main-scope-fix" diff --stat origin/main...HEAD
```

Expected: either no output before implementation starts, or only the intentional selected-case fix files after implementation. If unrelated files appear, stop and reconcile before continuing.

**Success criteria:** We can name one worktree, one branch, and one SHA as the release candidate source, and nothing else is treated as the execution baseline.

---

### Task 2: Fix The Two Remaining Production Blockers

**Files:**
- Modify: `src/services/cockpitApi.ts`
- Modify: `src/services/forensicsQuerySession.ts` *(only if needed to keep selected-case scope honest after the primary fix)*
- Modify: `cockpit/app/api/read-model-cache.ts`
- Modify: `tests/unit/cockpit-api.test.ts`
- Modify: `tests/unit/forensics-query-session.test.ts`
- Modify: `tests/unit/maya-workspace-derived.test.ts`

- [ ] **Step 1: Lock the selected-case scope bug with a failing backend test**

Add a test next to the selected-evidence scope coverage in `tests/unit/forensics-query-session.test.ts` or `tests/unit/cockpit-api.test.ts` that proves a selected-case query cannot surface a worklist-only `file-*` citation that is absent from `selected.evidencePack.recordIds`.

Minimum assertion shape:

```ts
expect(answer.citations.map((citation) => citation.recordId)).not.toContain("file-2jUrCkC64XYwCxcJT1YctF");
expect(selectedScope.trustedEvidencePackRecordIds).toEqual(selectedDetail.selected.evidencePack.recordIds);
```

- [ ] **Step 2: Run the focused failing tests**

```powershell
npm run test -- tests/unit/forensics-query-session.test.ts tests/unit/cockpit-api.test.ts tests/unit/maya-workspace-derived.test.ts
```

Expected: at least one selected-case scope assertion fails before the fix.

- [ ] **Step 3: Narrow selected-case trusted scope to the visible evidence packet**

Implementation target:

- In `src/services/cockpitApi.ts`, update `buildMayaSelectedQueryScope()` so the selected-case trusted scope is built from the rendered selected evidence packet, not from extra worklist provenance rows that the detail packet does not disclose.
- Keep the query fail-closed. Do **not** loosen the UI guard or silently drop legitimate citations without fixing the source of truth.
- In `src/services/forensicsQuerySession.ts`, only make a follow-on edit if the current union/synthetic-citation behavior still widens the selected-case answer after `buildMayaSelectedQueryScope()` is corrected.

- [ ] **Step 4: Lock the stale detail-cache bug with a failing cache test**

Add or extend a Next-route cache test to prove the old per-line detail cache key can survive a refresh while still serving stale packet content.

Minimum assertion shape:

```ts
expect(first.headers.get("x-recoup-read-model-cache")).toBe("miss");
expect(second.headers.get("x-recoup-read-model-cache")).toBe("hit");
expect(modelKey).toBe("maya:forensics:work-item:S1-L1:v2");
```

- [ ] **Step 5: Version the per-line detail cache key**

Implementation target:

- In `cockpit/app/api/read-model-cache.ts`, bump the work-item detail cache key from `maya:forensics:work-item:${lineId}:v1` to `:v2`.
- Do not change the top-level Maya cache key.
- Do not widen reuse logic in the same pass unless the version bump alone proves insufficient.

- [ ] **Step 6: Re-run the focused tests**

```powershell
npm run test -- tests/unit/forensics-query-session.test.ts tests/unit/cockpit-api.test.ts tests/unit/maya-workspace-derived.test.ts
```

Expected: the focused tests pass with the selected-case scope and detail-cache assertions green.

**Success criteria:** Selected-case Copilot answers no longer cite records outside the visible selected packet, and work-item detail rows repopulate behind a fresh `v2` key instead of silently reusing stale `v1` payloads.

---

### Task 3: Verify Locally Before Any Release Candidate Claim

**Files:**
- No new source edits unless verification reveals a concrete defect.

- [ ] **Step 1: Run the required code gates**

```powershell
npm run lint
npm run typecheck
npm run build
```

Expected: all three pass. `npm run build` must complete both `build:api` and `build:cockpit`.

- [ ] **Step 2: Run Maya browser E2E against the real local stack**

```powershell
npm run test:e2e:maya-real
npm run test:e2e:maya-approval-lifecycle
```

Expected: both pass without fixture API substitutions or static business data.

- [ ] **Step 3: Manually verify the selected-case Copilot against all live cases**

Local browser route:

```text
http://127.0.0.1:3002/forensics/shadcn
```

Manual coverage set:

- `S1-L1`
- `S2-L1`
- `S3-L1`
- `S4-L1`
- `S5-L1`
- `S6-L1`
- `S7-L1`
- `S8-L1`

For each case:

1. Open the case.
2. Open Recoup Copilot.
3. Ask at least one suggested prompt and one custom prompt.
4. Confirm the answer renders instead of `Forensics query cited records outside the selected evidence packet.`
5. Confirm the citations belong to the visible selected packet.
6. Confirm the evidence links in the case view resolve to the real URL already present in the dataset, not a recreated or dummy link.

- [ ] **Step 4: Confirm the decision flow and approval gating still reflect live state**

Manual checks:

- verdict state is visually distinct from `Your approval`
- approval state changes remain dynamic, not static
- email send stays blocked until committed human approval
- approved case no longer displays the stale `Awaiting reviewer` state after a real approval commit

**Success criteria:** Local browser behavior matches the intended Maya journey across all 8 cases, the evidence URLs are real-backed, and the selected-case Copilot no longer falls into the known packet-scope error.

---

### Task 4: Reviewer Gate And Release Readiness Packet

**Files:**
- Modify only if a reviewer finds a real defect.
- Update release notes or execution status doc only after verification is complete.

- [ ] **Step 1: Run reviewer pass on the exact release diff**

Reviewer checklist:

- selected-case scope fix is in the shared backend path, not only in the UI
- cache fix is limited to per-line detail rows and does not mutate top-level Maya cache behavior
- no API contract shape changed
- no `cockpit-data.ts` model shape changed
- no dummy/static evidence URLs introduced
- no approval bypass introduced for email
- no unrelated Maya visual regressions introduced

- [ ] **Step 2: Prepare the release packet**

Required evidence:

- clean `git diff --stat origin/main...HEAD`
- focused unit test proof
- `npm run build` proof
- `test:e2e:maya-real` proof
- `test:e2e:maya-approval-lifecycle` proof
- local browser screenshots or captured notes for the 8-case Copilot sweep

- [ ] **Step 3: Stop for human approval**

Mandatory stop message:

```text
Release candidate verified locally. Production movement remains blocked pending explicit user approval.
```

**Success criteria:** The release candidate is reviewable, evidence-backed, and still blocked from prod until the user explicitly says to proceed.

---

### Task 5: Production Movement Sequence After Approval

**Files:**
- No new source edits unless deployment itself reveals a defect.

- [ ] **Step 1: Merge the verified branch into `main` without extra changes**

```powershell
git -C "C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup-main-scope-fix" status --short
git -C "C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup-main-scope-fix" log --oneline --decorate -5
```

Expected: clean working tree and only the reviewed release commits in scope.

- [ ] **Step 2: Deploy Render first if `src/services/*` changed**

Reason: `POST /forensics/query` and `/query/realtime-client-secret` depend on the backend service defined by `render.yaml`.

Deployment verification:

- `recoup-api` deploy completes successfully
- `/healthz` returns OK
- Render env parity is confirmed for the local variables required by the changed path

- [ ] **Step 3: Deploy Vercel for the Next route and cache-key update**

Reason: `cockpit/app/api/read-model-cache.ts` and `cockpit/app/api/forensics/work-items/[lineId]/route.ts` live on Vercel.

Deployment verification:

- public alias still resolves to `https://recoup-self-eta.vercel.app`
- the deployment is Ready
- the intended commit is the one serving production

- [ ] **Step 4: Warm the prod caches in the safe order**

1. Trigger `/api/forensics/refresh` once to refresh the top-level Maya model.
2. Open or request the target detail rows so the new `v2` keys are seeded.
3. Confirm:

```text
first /api/forensics/work-items/S1-L1 -> x-recoup-read-model-cache: miss
second /api/forensics/work-items/S1-L1 -> x-recoup-read-model-cache: hit
```

Do not treat `/api/forensics/refresh` alone as sufficient for per-line detail rows.

**Success criteria:** The correct backend service and frontend app are both deployed, the public alias serves the intended commit, and the new detail cache rows are seeded behind `v2`.

---

### Task 6: Production QA Proof And Rollback Decision

**Files:**
- Generated evidence under `output/playwright/prod-qa/`

- [ ] **Step 1: Run the production QA script**

```powershell
$env:RECOUP_PROD_APP_URL="https://recoup-self-eta.vercel.app"
$env:RECOUP_PROD_API_URL="https://recoup-api.onrender.com"
$env:RECOUP_QA_COMMIT="<released-commit-sha>"
tsx scripts/runMayaProdQa.ts
```

Expected: the script writes a new proof bundle under `output/playwright/prod-qa/` and reports Render health, login timing, connector timing, case queries, and HITL gating.

- [ ] **Step 2: Run a human browser sweep on prod**

Minimum manual sweep:

- login route loads correctly
- Maya overview loads without a long stale-detail hang
- all 8 cases open
- selected-case Copilot answers render for suggested and custom prompts
- evidence URLs resolve to the real linked documents
- decision flow reflects real state
- approval and email gating still behave correctly

- [ ] **Step 3: Roll back immediately if any release blocker appears**

Rollback triggers:

- selected-case Copilot still shows the packet-scope error
- work-item detail remains stuck on stale `v1` semantics
- evidence URLs are broken or replaced with dummy content
- approval/email gates regress
- Vercel alias or Render health is unhealthy

Rollback action:

- revert the release commit(s)
- redeploy the reverted runtime(s)
- re-run the prod QA script until the blocker clears

**Success criteria:** Production behavior matches the locally verified release candidate, and the team has a clear rollback path if a blocker appears.

---

## No-Mistakes Guardrails

- One source of truth only: `C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup-main-scope-fix` at `7d23260` plus the reviewed release diff.
- Fix the backend scope mismatch at the source. Do not paper over it with a UI-only suppression.
- Treat per-line detail cache warm-up as a required prod step, not a nice-to-have.
- Do not ship if any case still returns the selected-packet citation error.
- Do not deploy without local browser proof across all 8 cases.
- Do not move to prod without the explicit user approval checkpoint.

## Self-Review

- Spec coverage: this plan covers the remaining selected-case Copilot scope bug, stale detail cache reuse, local all-case verification, reviewer gate, explicit approval gate, production deploy order, cache warm-up, and post-deploy QA.
- Placeholder scan: no `TBD`, `TODO`, or implied verification shortcuts remain.
- Type/runtime consistency: Render steps are scoped to `src/services/*` behavior; Vercel steps are scoped to `cockpit/app/api/*` cache behavior; the plan does not assume one runtime owns both.
- Likeliest mistake if the plan is ignored: deploying only Vercel or only Render and then misreading the result because the other runtime still serves old behavior.
