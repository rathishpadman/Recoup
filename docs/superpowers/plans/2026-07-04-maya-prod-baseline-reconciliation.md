# Maya Prod Baseline Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the Maya reference-journey branch onto the latest production baseline, preserve prod teal login/sidebar branding, remove thick one-sided card/row rails, and re-verify the runtime UI with browser evidence before any production movement.

**Architecture:** Treat `origin/main` as the cockpit source of truth because it contains the prod teal commits (`2c80d4e`, `a74466c`). Preserve the current Maya WIP with an allowlisted source patch and explicit new-file copy list, replay it inside a separate worktree created from `origin/main`, and resolve overlaps by keeping prod branding plus the Maya real-data UX changes. Add an invariant that blocks thick generated-looking rails in Maya cockpit UI.

**Tech Stack:** Git, Next.js App Router, React, TypeScript, Tailwind/shadcn, Vitest, Playwright, local Recoup API/cockpit dev servers.

---

## Source Of Truth

- Production baseline branch: `origin/main`
- Production teal commits to preserve:
  - `2c80d4e Add Maya teal accent treatment`
  - `a74466c Align Maya and login teal branding`
- Current WIP branch: `codex/maya-reference-workspace-plan`
- Current WIP base before reconciliation: `8af6bcc Rework Recoup landing page`
- Prod approval gate: production remains blocked until explicit user approval after verification.

## File Map

- Modify: `cockpit/app/styles.css`
  - Preserve prod `maya-accent-root`, login teal treatment, and Maya Copilot launcher styling.
  - Remove/reduce any wide diffuse glow that reads as generated UI polish.
- Modify: `cockpit/components/maya/maya-workspace-shell.tsx`
  - Preserve prod teal sidebar treatment.
  - Keep only the requested nav removals: no `Cases`, no `Evidence`.
- Modify: `cockpit/components/maya/types.ts`
  - Keep `MayaSurfaceSection` without `"cases"` and `"evidence"`.
- Modify: `cockpit/components/maya/maya-forensics-surface.tsx`
  - Preserve reference-journey overview/worklist/case opening behavior.
  - Remove `border-l-[3px]` card rails and selected-row rails.
  - Keep real-data aggregates, ready-source pill, Copilot rename, and no hardcoded business values.
- Modify: `cockpit/components/maya/deduction-worklist-table.tsx`
  - Preserve verdict + real reason line.
  - Replace selected row left rails with subtle ring/background state.
- Modify: `cockpit/components/maya/deduction-case-workspace.tsx`
  - Preserve decision flow, deterministic basis band, gated email draft action.
  - Ensure any one-sided border is structural only, not a thick card accent rail.
- Modify: `cockpit/components/maya/query-evidence-dock.tsx`
  - Preserve Recoup Copilot naming and idle/running/complete states.
- Modify: `tests/invariants/maya-shadcn-qa-contract.test.ts`
  - Add a guard against thick one-sided Maya UI card/row rails.
- Keep: `cockpit/app/api/email/route.ts`
  - This remains the only new API route from the Maya rollout.
- Keep: `src/services/emailGateway.ts`, `src/services/serviceLayer.ts`, `src/services/permissionEngine.ts`, `src/mcp/server.ts`
  - Preserve real email send/readback/MCP gateway capability already implemented.

---

## Task 1: Capture Current WIP Safely

**Files:**
- Create: `C:\Users\rathi\.config\superpowers\worktrees\Recoup\maya-reference-wip-snapshot\maya-reference-workspace-before-prod-baseline.patch`
- Create: `C:\Users\rathi\.config\superpowers\worktrees\Recoup\maya-reference-wip-snapshot\new-source-files.txt`
- Create: `C:\Users\rathi\.config\superpowers\worktrees\Recoup\maya-reference-wip-snapshot\maya-reference-workspace-before-prod-baseline-status.txt`
- No source edits.

- [ ] **Step 1: Refresh remote refs**

```powershell
git fetch --prune origin
```

Expected: `origin/main` resolves to `a74466c` or a newer reviewed production head.

- [ ] **Step 2: Record current branch and dirty state**

```powershell
$snapshot = "C:\Users\rathi\.config\superpowers\worktrees\Recoup\maya-reference-wip-snapshot"
New-Item -ItemType Directory -Force -Path $snapshot | Out-Null
git branch --show-current > "$snapshot\maya-reference-workspace-before-prod-baseline-status.txt"
git rev-parse --short HEAD >> "$snapshot\maya-reference-workspace-before-prod-baseline-status.txt"
git status --short >> "$snapshot\maya-reference-workspace-before-prod-baseline-status.txt"
```

Expected: status file shows current WIP branch and modified/untracked files. It must not contain secret values.

- [ ] **Step 3: Confirm external WIP snapshot directory**

```powershell
$snapshot = "C:\Users\rathi\.config\superpowers\worktrees\Recoup\maya-reference-wip-snapshot"
New-Item -ItemType Directory -Force -Path $snapshot | Out-Null
Resolve-Path $snapshot
```

Expected: the snapshot lives outside the repo checkout, so it cannot pollute Git status.

- [ ] **Step 4: Write a tracked-source WIP patch from the old base, not from `origin/main`**

```powershell
git diff --binary HEAD -- `
  .env.example `
  cockpit/app/styles.css `
  cockpit/components/maya `
  src/mcp/server.ts `
  src/services/permissionEngine.ts `
  src/services/serviceLayer.ts `
  tests/e2e `
  tests/invariants `
  > "$snapshot\maya-reference-workspace-before-prod-baseline.patch"
```

Expected: patch contains only tracked source/test changes relative to the current WIP base (`8af6bcc`). It must not be generated using `git diff origin/main`, because that would encode deletion of the prod teal commits.

- [ ] **Step 5: Record new source files explicitly**

```powershell
git ls-files --others --exclude-standard `
  cockpit/app/api/email `
  cockpit/components/maya `
  "docs/Recoup_Maya_Journey (1).html" `
  docs/superpowers/plans `
  src/services `
  tests/invariants `
  tests/unit `
  > "$snapshot\new-source-files.txt"
Get-Content "$snapshot\new-source-files.txt"
```

Expected: list includes new source/test/plan files such as `cockpit/app/api/email/route.ts`, `email-draft-dialog.tsx`, `decision-flow-stepper.tsx`, `maya-workspace-derived.ts`, `emailGateway.ts`, and Maya tests. It should not include `.env.local`, generated screenshot files, or `output/playwright` artifacts.

- [ ] **Step 6: Copy only the recorded new source files into the external snapshot**

```powershell
$snapshot = "C:\Users\rathi\.config\superpowers\worktrees\Recoup\maya-reference-wip-snapshot"
Get-Content "$snapshot\new-source-files.txt" | ForEach-Object {
  $target = Join-Path $snapshot $_
  New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
  Copy-Item -LiteralPath $_ -Destination $target -Force
}
```

Expected: new source files are copied outside the repo. Current dirty checkout remains untouched. No stash is required.

---

## Task 2: Create A Fresh Prod-Baseline Worktree

**Files:**
- No source edits.

- [ ] **Step 1: Confirm we are not already in an isolated worktree**

```powershell
$gitDir = (Resolve-Path (git rev-parse --git-dir)).Path
$gitCommon = (Resolve-Path (git rev-parse --git-common-dir)).Path
Write-Output "gitDir=$gitDir"
Write-Output "gitCommon=$gitCommon"
git rev-parse --show-superproject-working-tree
```

Expected: current checkout is the normal repo (`gitDir` equals `gitCommon`), not a linked worktree.

- [ ] **Step 2: Create the reconciliation branch from production in the existing global worktree area**

```powershell
$worktreeRoot = "C:\Users\rathi\.config\superpowers\worktrees\Recoup"
$worktreePath = Join-Path $worktreeRoot "maya-reference-workspace-prod-baseline"
if (Test-Path $worktreePath) { throw "Worktree path already exists: $worktreePath" }
if (git branch --list codex/maya-reference-workspace-prod-baseline) { throw "Branch already exists: codex/maya-reference-workspace-prod-baseline" }
git worktree add $worktreePath -b codex/maya-reference-workspace-prod-baseline origin/main
```

Expected: branch is created in a separate directory at the production baseline that includes the teal login/sidebar commits. The current dirty checkout remains unchanged. If the branch or path already exists, stop and inspect; do not delete or overwrite it.

- [ ] **Step 3: Prove branch alignment inside the worktree**

```powershell
Set-Location "C:\Users\rathi\.config\superpowers\worktrees\Recoup\maya-reference-workspace-prod-baseline"
git branch --show-current
git rev-parse --short HEAD
git log --oneline --decorate -3
git merge-base --is-ancestor origin/main HEAD
echo $LASTEXITCODE
```

Expected:

```text
codex/maya-reference-workspace-prod-baseline
a74466c
0
```

If `origin/main` has advanced, use the newer `origin/main` head as the baseline and record the new SHA in the closeout.

---

## Task 3: Replay Maya WIP Onto Prod Worktree

**Files:**
- Modify the files listed in the File Map only.

- [ ] **Step 1: Check whether the tracked patch can apply**

```powershell
$snapshot = "C:\Users\rathi\.config\superpowers\worktrees\Recoup\maya-reference-wip-snapshot"
git apply --check --whitespace=nowarn "$snapshot\maya-reference-workspace-before-prod-baseline.patch"
```

Expected: either clean check or context-mismatch notice limited to overlapping cockpit/source files. If the check fails because prod teal changed context, proceed to the next step with `--3way`; if it fails for unrelated files, stop and inspect.

- [ ] **Step 2: Apply the tracked patch**

```powershell
$snapshot = "C:\Users\rathi\.config\superpowers\worktrees\Recoup\maya-reference-wip-snapshot"
git apply --3way --whitespace=nowarn "$snapshot\maya-reference-workspace-before-prod-baseline.patch"
```

Expected: tracked WIP changes are applied on top of prod. Conflicts, if any, are resolved in the worktree only.

- [ ] **Step 3: Copy new source files into the prod worktree**

```powershell
$snapshot = "C:\Users\rathi\.config\superpowers\worktrees\Recoup\maya-reference-wip-snapshot"
Get-Content "$snapshot\new-source-files.txt" | ForEach-Object {
  $source = Join-Path $snapshot $_
  $target = Join-Path (Get-Location) $_
  New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
  Copy-Item -LiteralPath $source -Destination $target -Force
}
```

Expected: new email route, new Maya components, and tests are present in the prod worktree. Generated screenshot/output artifacts are not copied; they will be regenerated by E2E.

- [ ] **Step 4: Resolve `maya-workspace-shell.tsx` conflicts**

Resolution rule:

```tsx
const navItems = [
  { icon: LayoutDashboardIcon, label: "Overview", section: "overview" },
  { count: "worklist" as const, icon: ClipboardListIcon, label: "Worklist", section: "worklist" },
  { count: "approvals" as const, icon: InboxIcon, label: "Approvals", section: "approvals" }
] as const;
```

Keep the prod teal `mayaAccent` classes from `origin/main`, including the sidebar root, sidebar item, badge, and mobile sidebar treatment.

- [ ] **Step 5: Resolve `types.ts` conflicts**

Resolution rule:

```ts
export type MayaSurfaceSection = "overview" | "worklist" | "approvals";
```

- [ ] **Step 6: Resolve `styles.css` conflicts**

Keep the prod `@layer components { .maya-accent-root { ... } }` block from `origin/main`. Keep the latest login teal treatment. If the Recoup Copilot launcher keeps a wide glow, reduce it to a restrained operational shadow:

```css
.maya-recoup-agent-button {
  box-shadow: 0 8px 18px color-mix(in srgb, var(--status-success-text) 16%, transparent);
}

.maya-recoup-agent-button:hover:not(:disabled) {
  box-shadow: 0 10px 22px color-mix(in srgb, var(--status-success-text) 18%, transparent);
}
```

- [ ] **Step 7: Resolve `maya-forensics-surface.tsx` conflicts**

Keep the reference-journey overview/case/Copilot work, but remove thick one-sided card and row rails. Replace selected-row rail classes with ring/background state:

```ts
const mayaSelectedRowClass =
  "data-[selected=true]:bg-[color:var(--maya-accent-surface-strong)] data-[selected=true]:shadow-[var(--shadow-sm)] data-[selected=true]:ring-1 data-[selected=true]:ring-[color:var(--maya-accent-ring)]";
```

For overview cards, replace `border-l-[3px]` visual accents with a small dot or subtle ring. Do not use `border-l-4`, `border-l-[3px]`, or verdict-colored left rails on cards.

- [ ] **Step 8: Resolve `deduction-worklist-table.tsx` conflicts**

Replace selected card/table rail classes with:

```tsx
"data-[selected=true]:bg-muted/35 data-[selected=true]:shadow-[var(--shadow-sm)] data-[selected=true]:ring-1 data-[selected=true]:ring-[color:var(--maya-accent-ring)]"
```

Keep the real `reason` line and verdict badge from the Maya rollout.

- [ ] **Step 9: Confirm no conflict markers remain**

```powershell
rg -n "<<<<<<<|=======|>>>>>>>" cockpit src tests docs
```

Expected: no output.

- [ ] **Step 10: Confirm patch health in the prod worktree**

```powershell
git status --short --branch
git diff --check
```

Expected: status shows only the intended WIP files. `git diff --check` reports no whitespace/conflict-marker errors.

- [ ] **Step 11: Confirm current original checkout was not mutated**

```powershell
Set-Location "C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup"
git branch --show-current
git status --short --branch
Set-Location "C:\Users\rathi\.config\superpowers\worktrees\Recoup\maya-reference-workspace-prod-baseline"
```

Expected: original checkout remains on `codex/maya-reference-workspace-plan` with the same WIP state; all reconciliation edits live in the new prod-baseline worktree.

---

## Task 4: Add Anti-Slop Rail Invariant

**Files:**
- Modify: `tests/invariants/maya-shadcn-qa-contract.test.ts`

- [ ] **Step 1: Add the failing invariant**

Add this test block:

```ts
it("keeps Maya cards and selected rows free of thick one-sided accent rails", () => {
  const checkedFiles = [
    "cockpit/components/maya/maya-forensics-surface.tsx",
    "cockpit/components/maya/deduction-worklist-table.tsx",
    "cockpit/components/maya/deduction-case-workspace.tsx",
    "cockpit/components/maya/query-evidence-dock.tsx"
  ];
  const forbiddenPatterns = [
    /border-l-\[3px\]/,
    /border-l-4/,
    /data-\[selected=true\]:border-l/,
    /rounded-md border-l-\[[^\]]+\]/
  ];

  for (const relativePath of checkedFiles) {
    const source = readFileSync(join(repoRoot, relativePath), "utf8");
    for (const pattern of forbiddenPatterns) {
      expect(source, `${relativePath} must not contain ${pattern.toString()}`).not.toMatch(pattern);
    }
  }
});
```

- [ ] **Step 2: Run the focused invariant**

```powershell
npm run test -- tests/invariants/maya-shadcn-qa-contract.test.ts
```

Expected: fails before rail cleanup if any thick rails remain; passes after cleanup.

---

## Task 5: Visual Browser Verification

**Files:**
- Screenshots generated under: `output/playwright/e2e/`

- [ ] **Step 1: Start or verify local servers**

```powershell
npm run start:api
npx next dev cockpit --hostname 127.0.0.1 --port 3000
```

Expected:

```text
API listening on http://127.0.0.1:4317
Local: http://127.0.0.1:3000
```

If either port is already occupied by the existing verified dev server, reuse it and record the PID/URL in the closeout.

- [ ] **Step 2: Run browser E2E with screenshots**

```powershell
$env:RECOUP_E2E_API_URL="http://127.0.0.1:4327"
$env:RECOUP_E2E_COCKPIT_PORT="3020"
npm run test:e2e
```

Expected: Playwright passes and rewrites current screenshots under `output/playwright/e2e/`.

- [ ] **Step 3: Run Maya real-backend E2E**

```powershell
$env:RECOUP_E2E_API_URL="http://127.0.0.1:4327"
$env:RECOUP_E2E_COCKPIT_PORT="3021"
npm run test:e2e:maya-real
```

Expected: passes with the real worklist aggregates and grounded query evidence.

- [ ] **Step 4: Inspect visual outputs**

Review these screenshots:

```text
output/playwright/e2e/login-1440.png
output/playwright/e2e/login-375.png
output/playwright/e2e/maya-shadcn-forensics-1440.png
output/playwright/e2e/maya-shadcn-forensics-375.png
output/playwright/e2e/maya-forensics-1440.png
output/playwright/e2e/maya-forensics-375.png
```

Expected:

- Login reflects prod teal treatment.
- Maya sidebar reflects prod teal treatment.
- Overview cards do not use thick one-sided accent rails.
- Worklist/overview selected rows do not use thick left rails.
- Reference HTML influence remains in layout rhythm and business copy, without all-caps/spaced-word generated styling.

---

## Task 6: Full Verification And Reviewer Gate

**Files:**
- No new source files unless a verification artifact is intentionally updated.

- [ ] **Step 1: Run focused tests**

```powershell
npm run test -- tests/invariants/maya-reference-workspace-contract.test.ts tests/invariants/maya-shadcn-qa-contract.test.ts tests/unit/maya-workspace-derived.test.ts tests/unit/email-route.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run full verification**

```powershell
npm run verify
```

Expected: lint/typecheck/unit/invariant/eval/dependency gates pass.

- [ ] **Step 3: Run production build**

```powershell
npm run build
```

Expected: Next build passes and includes `/api/email` in the route manifest.

- [ ] **Step 4: Reviewer pass**

Reviewer checklist:

- Branch is based on `origin/main`, not stale `8af6bcc`.
- Teal login/sidebar prod commits are preserved.
- No `cockpit/app/api/` changes except `cockpit/app/api/email/route.ts`.
- `cockpit-data.ts` model shapes are untouched.
- All overview values come from `model.worklist` or connector freshness props.
- Email send/readback remains gated behind approval/review state.
- No thick one-sided card/row rails remain in Maya UI files.
- Browser screenshots prove login and Maya runtime visuals.

- [ ] **Step 5: Production approval gate**

Stop after verification and report:

```text
Production approval required before merge/deploy.
```

No merge to `main`, no Vercel production deploy, and no production email behavior change without explicit user approval.

---

## Self-Review

- Spec coverage: resolves the branch baseline mistake, preserves prod teal login/sidebar work, removes thick generated-looking rails, keeps real-data Maya rollout behavior, and keeps production gated.
- Placeholder scan: no `TBD`, `TODO`, or unspecified test steps.
- Type consistency: `MayaSurfaceSection` and `navItems` both use only `overview`, `worklist`, and `approvals`.
- Likeliest bug: `git apply --3way` may conflict in `maya-forensics-surface.tsx` because both prod teal commits and Maya rollout touched selected-row styling. The resolution rule above makes prod teal tokens authoritative while removing the rail classes.
