# Landing Tabs And Maya/David Production Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the current David/Maya fixes to production only after landing-page tab behavior, Maya live copilot, David live copilot, approvals, and cache behavior are browser-proven with no regression to existing functionality.

**Architecture:** Keep the landing-page fix isolated to the landing tab state/control surface if a bug is found. Keep Maya/David backend fixes scoped to the already changed query-scope API path. Production movement is gated by local browser proof, automated tests, branch/SHA proof, Vercel deployment proof, and public-alias smoke.

**Tech Stack:** Next.js App Router cockpit, React/shadcn Tabs, Express cockpit API, Playwright browser automation, Vitest, TypeScript, Vercel CLI, OpenAI live Agents SDK through existing backend routes.

---

### Task 1: Freeze Release Candidate And Audit Diff

**Files:**
- Inspect: `src/services/cockpitApi.ts`
- Inspect: `tests/unit/cockpit-api.test.ts`
- Inspect: `cockpit/components/landing/landing-shell.tsx`
- Inspect: `cockpit/components/landing/landing-header.tsx`
- Inspect: `cockpit/components/landing/landing-content.ts`
- Inspect: `.github/workflows/warm-recoup-backend.yml`

- [ ] **Step 1: Confirm working tree and branch**

Run:
```powershell
git status --short
git branch --show-current
git rev-parse HEAD
```
Expected: only intentional Maya query-scope regression fix files are modified, and branch is `feature/david-credit-v2`.
The release plan document itself may also be untracked or modified until Task 6 commits it as release evidence.

- [ ] **Step 2: Audit current diff for blast radius**

Run:
```powershell
git diff -- src/services/cockpitApi.ts tests/unit/cockpit-api.test.ts cockpit/components/landing
```
Expected: no landing code changes unless a landing tab fix is required; Maya change only narrows selected query scope to visible submitted packet IDs.

- [ ] **Step 3: Stop if unrelated changes appear**

If any unrelated file is dirty, do not deploy. Identify it and either exclude it from the release or ask owner approval.

---

### Task 2: Landing Page Tab Regression Gate

**Files:**
- Modify if needed: `cockpit/components/landing/landing-shell.tsx`
- Modify if needed: `cockpit/components/landing/landing-header.tsx`
- Test: `tests/e2e/cockpit-premium-e2e.ts` or a new focused landing e2e test if existing file is too broad

- [ ] **Step 1: Add or confirm browser test for all landing tabs**

Test must click both tab surfaces:
```ts
const tabs = ["Problem", "Solution", "Demo", "Tech", "How We Built It", "About"];
for (const label of tabs) {
  await page.getByRole("tab", { name: label }).click();
  await expect(page.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "true");
}
for (const label of tabs) {
  await page.locator('[data-testid="recoup-landing-header"] nav button', { hasText: label }).click();
  await expect(page.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "true");
}
```

- [ ] **Step 2: Run desktop and mobile landing browser checks**

Run:
```powershell
npm run test:e2e
```
If the full harness is too broad for a quick local landing-only rerun, run the focused Playwright/tsx landing probe used during release verification and save screenshots under `output/playwright/`.

Expected:
- All six landing tabs switch.
- Header nav switches the same active tab.
- Maya CTA opens `/login?loginId=Maya`.
- David CTA opens `/login?loginId=david`.
- No console/page errors.

- [ ] **Step 3: If local passes but prod is broken, classify as deployment drift**

Compare local SHA and prod SHA before changing code. Do not patch blindly if prod is simply stale.

---

### Task 3: Maya Browser E2E With Live Query

**Files:**
- Verify: `src/services/cockpitApi.ts`
- Verify: `tests/unit/cockpit-api.test.ts`
- Verify: `tests/e2e/maya-real-backend-e2e.ts`

- [ ] **Step 1: Run automated Maya backend/browser checks**

Run:
```powershell
npm run test:e2e:maya-real
```
Expected: Maya login, worklist, selected case, evidence, query, and approval gate pass.

- [ ] **Step 2: Run browser-authenticated S1 valid-case copilot query**

Use the local UI:
1. Open `http://localhost:3000/login?loginId=Maya`.
2. Login as Maya.
3. Open S1 Greenleaf case.
4. Open Recoup Copilot.
5. Ask: `What evidence supports this selected case verdict and route?`

Expected:
- `/api/forensics/query` returns HTTP 200.
- `modelExecution.mode` is `live_openai_agents`.
- Hidden vector provider file IDs such as `file-2jUrCkC64XYwCxcJT1YctF` are not cited.
- UI does not show `Forensics query cited records outside the selected evidence packet.`

- [ ] **Step 3: Run Maya 8-case smoke with live query**

For `S1-L1` through `S8-L1`, run one query per case from authenticated browser context.
Expected: each response has `live_openai_agents`, citations, token usage, and no raw model output.

---

### Task 4: David Browser E2E With Live Query

**Files:**
- Verify: `tests/e2e/david-credit-v2-e2e.ts`
- Verify: `src/services/creditRiskQuerySession.ts`
- Verify: `cockpit/components/david/**`

- [ ] **Step 1: Run automated David v2 E2E**

Run:
```powershell
npm run test:e2e:david-v2
```
Expected: four accounts render, David live copilot query passes for all four accounts, approval packet flow works, and `live_openai_agents` is proven.

- [ ] **Step 2: Manual browser smoke**

Open `http://localhost:3000/login?loginId=david`, then verify:
- Worklist rows match the David HTML/screenshot layout.
- Drawers are collapsed by default.
- Copilot query returns live mode, agents, handoff count, citations, and token usage.
- Approval packet still requires human approval.

---

### Task 5: Automated Release Gates

**Files:** repo-wide

- [ ] **Step 1: Run core quality gates**

Run:
```powershell
npm run lint
npm run typecheck
npm run test
npm run verify
```
Expected: all pass. If LLM/browser failures occur, stop and ask owner before proceeding.

- [ ] **Step 2: Confirm local servers still serve patched code**

Run:
```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4317/healthz
Invoke-WebRequest -UseBasicParsing http://localhost:3000/login?loginId=Maya
Invoke-WebRequest -UseBasicParsing http://localhost:3000/login?loginId=david
```
Expected: API health OK, both login pages HTTP 200.

---

### Task 6: Production Movement Plan

**Files:**
- Release branch: `feature/david-credit-v2`
- Target branch/worktree: verified clean `main`

- [ ] **Step 1: Commit release-candidate changes**

Run:
```powershell
git add src/services/cockpitApi.ts tests/unit/cockpit-api.test.ts
git add docs/superpowers/plans/2026-07-09-landing-tabs-maya-david-prod-release-plan.md
git commit -m "fix: keep maya selected query citations scoped"
```

- [ ] **Step 2: Push feature branch and confirm PR state**

Run:
```powershell
git push origin feature/david-credit-v2
gh pr status
```
Expected: PR branch has the latest commit and no failing checks.

- [ ] **Step 3: Merge only after owner approval**

No prod-impacting merge without explicit owner approval in chat.

- [ ] **Step 4: Deploy from verified main worktree**

After merge:
```powershell
git switch main
git pull --ff-only origin main
git status --short
git rev-parse HEAD
git rev-parse origin/main
Write-Output "Process VERCEL_TOKEN present: $([bool]$env:VERCEL_TOKEN)"
Write-Output "User VERCEL_TOKEN present: $([bool][Environment]::GetEnvironmentVariable('VERCEL_TOKEN', 'User'))"
Write-Output "Machine VERCEL_TOKEN present: $([bool][Environment]::GetEnvironmentVariable('VERCEL_TOKEN', 'Machine'))"
vercel deploy --prod -y --token $env:VERCEL_TOKEN
```
Expected: `git status --short` is empty, `HEAD` equals `origin/main`, at least one Vercel token scope is present without printing the token, deployment succeeds, and the deployment ID plus production URL are recorded.

---

### Task 7: Public Production Smoke And Rollback Gate

**Files:** none unless smoke fails

This task is mandatory after production movement and before the release can be called complete. Run it against the stable public alias, not localhost, and capture the deployment ID/URL beside the smoke evidence.

**Owner reminder added 2026-07-09:** deploy success is not release success. After prod movement, verify the landing page with every tab and every visible button, then verify the Maya and David journeys with live agent calls before declaring completion.

- [ ] **Step 1: Smoke stable public alias landing page tabs**

Open the stable production alias, then click every landing tab from the main tab row and from the header navigation:
```ts
const landingTabs = ["Problem", "Solution", "Demo", "Tech", "How We Built It", "About"];
for (const label of landingTabs) {
  await page.getByRole("tab", { name: label }).click();
  await expect(page.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "true");
}
for (const label of landingTabs) {
  await page.locator('[data-testid="recoup-landing-header"] nav button', { hasText: label }).click();
  await expect(page.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "true");
}
```
Expected: all six tabs switch, the visible panel matches the selected tab, no console errors fire, and desktop/mobile layouts remain usable.

- [ ] **Step 2: Smoke stable public alias landing buttons**

Click every business-visible button/CTA on the public alias:
- Header `Enter as Maya` routes to `/login?loginId=Maya`.
- Header `Enter as David` routes to `/login?loginId=david`.
- Hero Maya CTA routes to Maya login.
- Hero David CTA routes to David login.
- Demo Maya persona card or CTA routes to Maya login.
- Demo David persona card or CTA routes to David login.
- Bottom CTA routes to its intended demo/login destination.
- Any secondary visible CTA or button on the landing page either navigates to its documented target or is intentionally inert with owner-approved evidence.

Expected: every button navigates to the intended route, no disabled/dead buttons appear in the landing page, and no landing-page behavior regresses from the release diff because this release is not intended to change landing functionality.

- [ ] **Step 3: Smoke Maya production browser journey across all 8 scenarios**

Open the stable production alias and run the Maya journey from login through each scenario `S1-L1` through `S8-L1`:
- Login through `/login?loginId=Maya`.
- Select each Maya worklist scenario.
- Confirm selected evidence packet renders for the selected case.
- Run one live text copilot query per scenario: `What evidence supports this selected case verdict and route?`
- Confirm each query response has HTTP 200, `modelExecution.mode = "live_openai_agents"`, citations tied only to selected evidence records, token usage or provider usage metadata, and no raw model output.
- Confirm `S1-L1` does not cite hidden provider IDs such as `file-2jUrCkC64XYwCxcJT1YctF` and does not show `Forensics query cited records outside the selected evidence packet.`
- Confirm approval remains human-only and no ERP writeback is attempted.
- Confirm Maya cache behavior: first load and reload do not regress into the previous >1 minute blank/hydration delay.

Expected: all 8 Maya scenarios pass with live agent-backed answers, scoped citations, cache behavior intact, and approval gate intact.

- [ ] **Step 4: Smoke Maya production voice query**

From the Maya copilot on the public alias, run one voice query against a selected case using the existing voice/realtime path.

Expected:
- Voice session starts successfully.
- Transcribed or submitted query reaches the same selected-case query backend.
- Response uses live agent mode or the configured realtime live provider path.
- Citations stay inside the selected evidence packet.
- Token/provider usage is captured where the backend exposes it.
- No raw model output or out-of-scope citation error is visible.

- [ ] **Step 5: Smoke David production browser journey across all 4 accounts**

Open the stable production alias and run the David journey from login through all four accounts:
- Login through `/login?loginId=david`.
- Verify worklist rows for `Crestline Grocery`, `Harbor Foods`, `ValuMart Club`, and `Greenleaf Naturals`.
- Open each account detail.
- Confirm `Agent assessment`, `Signals in`, `Outcome`, and `Action` drawers are collapsed by default.
- Run one live David copilot query per account.
- Confirm each response has HTTP 200, `modelExecution.mode = "live_openai_agents"`, agent names, `handoffCount > 0`, token usage or provider usage metadata, citations tied to credit/source/evidence records, and raw output suppressed.
- Confirm the action packet and approval gate remain draft-only and human-approved.
- Confirm the duplicate `Good morning, David` section does not appear under account detail.

Expected: all 4 David account scenarios pass with live agent-backed answers, deterministic backend dollars/verdicts/actions, scoped citations, and no duplicate detail content.

- [ ] **Step 6: Stop and rollback if any production smoke fails**

If any public-alias landing tab, landing button, Maya 8-scenario text query, Maya voice query, David 4-account query, cache, citation-scope, or approval-gate check fails, do not call the release complete. Identify the deployment ID and failing route, then either restore the previous Vercel deployment or revert the merge commit. Re-run this complete public production smoke matrix after rollback or fix.

---

## Self-Review

- Spec coverage: landing tabs, landing buttons, Maya 8-scenario live text query, Maya voice query, David 4-account live query, cache behavior, approval gates, automated tests, prod deployment, public alias smoke, and rollback gate are covered.
- Placeholder scan: no TBD/TODO steps.
- Production safety: deployment is explicitly blocked until local tests pass and owner approves merge/prod movement.
