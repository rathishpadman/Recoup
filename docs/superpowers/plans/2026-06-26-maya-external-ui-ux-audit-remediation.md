# Maya External UI/UX Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address every actionable finding in `docs/qa/external-ui-ux-look-and-feel-audit-report.md` and raise Maya from a backend-debug-looking cockpit to a premium, business-readable analyst surface without changing backend-owned business content.

**Architecture:** Keep the current shadcn/Tailwind v4 component system and existing backend/read-model contracts. The remediation is a presentation, interaction, and QA pass: semantic signal layer first, raw technical details behind disclosure, dead controls removed or wired, and a reviewer-owned line-by-line audit matrix proving every audit finding was handled.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind v4, shadcn/ui, lucide-react, Vitest invariant tests, Playwright real-browser E2E, existing Recoup cockpit API/read models.

---

## 1. Scope And Non-Negotiables

### In Scope

- The full external audit report at `docs/qa/external-ui-ux-look-and-feel-audit-report.md`.
- All screen scorecard issues in report lines 59-79.
- P0 findings in report lines 117-137.
- P1 findings in report lines 141-165.
- P2 polish findings in report lines 169-174.
- Dead/inert control inventory in report lines 178-201.
- Component-level findings in report lines 203-218.
- Chat/agent flow critique C-1 through C-8 in report lines 221-248.
- Recommended design-system constraints and Fix A-H in report lines 287-415.
- "What to remove", "What to emphasize", and "Strengths worth preserving" in report lines 419-437.
- Desktop real-browser QA against local and production-compatible flows.

### Out Of Scope

- Mobile QA is deferred for this pass per owner direction.
- No new business constants, thresholds, weights, source mappings, model routing, or gold labels.
- No invented values. Missing backend data stays fail-closed, but gap copy moves out of the primary visual layer.
- No ERP write-back, autonomous dispatch, or approval bypass.
- No replacement of real backend/SAP/Supabase/MCP content with static UI fixtures.

### Product Position

I agree with the audit's core diagnosis: the current issue is not lack of data integrity; it is that governance and backend contract gaps are too visually loud. I do **not** recommend a broad dark/vibrant redesign even though the UI search tool surfaced that direction. Recoup should remain a dense, calm enterprise analyst cockpit. The realistic lift is:

- Add one semantic signal layer for verdict/status.
- Keep amounts neutral and backend-owned.
- Move raw IDs, hooks, SDK names, and gap receipts behind disclosure.
- Remove visible dead controls.
- Make the Recoup Agent feel conversational while preserving citations and trace details.

### Pass Threshold

- Minimum release bar: every screen in the audit scorecard must be reviewer-scored `>= 4.0/5`; this matches `AGENTS.md` visual gate.
- Target bar for the Maya cockpit after this pass: credible `~4.5/5` for the remediated surfaces.
- The report's aspirational `4.9/5` bar is treated as a stretch target, not the minimum gate for this remediation slice.
- Any P0 finding left open blocks release. P1 findings must be fixed or explicitly owner-deferred with evidence and reason.

---

## 2. Audit Coverage Matrix

| Audit Source | Lines | Plan Task | Required Evidence |
|---|---:|---|---|
| Executive gestalt: grey wall, too many badges, plumbing primary | 31-47 | Tasks 1, 2, 6, 7 | Badge-count invariant, screenshots before/after, reviewer visual pass |
| Screen scorecard: login through disabled states | 59-79 | Tasks 1-9 | Playwright walkthrough covering every listed screen except forced prod error |
| P0-1 backend-gap vocabulary primary | 117-125 | Task 2 | Test proves gap/plumbing strings absent from primary headers/rows and present only in disclosure/fail-closed states |
| P0-2 verdict has no semantic color | 127-132 | Task 1 | Badge variants + rendered E2E screenshot for worklist/cases/approvals/case header |
| P0-3 approval dialog inert | 134-137 | Task 4 | Eligibility contract test plus browser assertion that available actions are enabled only when backend permits |
| P1-1 Agent Trace log-like | 141-143 | Task 5 | Process nodes show business labels first; hooks/IDs/source-kind only in details |
| P1-2 raw IDs first-class | 145-147 | Task 3 | Raw IDs absent from primary UI; source/details disclosure still exposes them |
| P1-3 dead/inert controls | 149-156, 178-201 | Task 4 | Inventory test covers all 10 controls; no visible no-op buttons remain |
| P1-4 grey-on-grey palette | 158-159 | Tasks 1, 6 | Status token usage, selected state/elevation, visual diff |
| P1-6 chat not conversational | 161-162, 221-248 | Task 7 | Query E2E proves composer persists, answer in assistant bubble, trace/citations collapsed |
| P1-5 login whitespace/search-like workspace | 164-165 | Task 8 | Login screenshot at 1440 shows balanced layout and workspace context chip |
| P2 polish | 169-174 | Task 9 | Targeted component tests and screenshots |
| Component reproduction table | 203-218 | Tasks 1-9 | Reviewer verifies each component entry has a task and evidence |
| Worklist checkbox ambiguous affordance | 209 | Task 6 | Row selection and bulk/action affordances are visually distinct and tested |
| Cases/Evidence sparse empty zones | 63-64 | Task 6 | Screens use constrained/dense operational layout without fake filler |
| Real-browser evidence checklist | 252-279 | Task 10 | New local/prod-compatible Playwright run with no console/app network failures |
| Fix A-H implementation brief | 287-415 | Tasks 1-8 | Each fix has RED test, implementation, focused test, screenshot |
| Remove/emphasize/preserve | 419-437 | Tasks 1-10 | Reviewer signs coverage matrix |

---

## 3. Reviewer Gate: Mandatory Line-By-Line Coverage

Every implementation slice must finish with a reviewer pass. The reviewer must not be the implementer.

### Reviewer Responsibilities

- Maintain `docs/qa/maya-external-ui-ux-audit-coverage.md`.
- Verify every P0/P1/P2 item, every row in the dead-control inventory, every C-1 through C-8 chat finding, every Fix A-H item, and every "What to remove" item.
- For every actionable line or line range in the audit report, record one of:
  - `Addressed`
  - `Addressed by disclosure`
  - `Preserved intentionally`
  - `Deferred by owner`
  - `Backend contract gap raised`
  - `Not addressed - blocker`
- Link each row to:
  - changed file(s)
  - test(s)
  - screenshot(s) or Playwright evidence
  - reviewer note

### Coverage File Schema

Create `docs/qa/maya-external-ui-ux-audit-coverage.md` with this table:

```markdown
# Maya External UI/UX Audit Coverage

| Audit ID | Audit Lines | Finding | Disposition | Owner Task | Evidence | Reviewer |
|---|---:|---|---|---|---|---|
| P0-1 | 117-125 | Backend-gap vocabulary is primary visual content | Pending | Task 2 | Pending | Pending |
```

### Reviewer Stop Rules

- If any P0 remains `Pending`, `Not addressed`, or has no evidence, do not ship.
- If any visible business value is invented, stop and revert that slice.
- If any raw ID is removed from both primary UI and source disclosure, stop; provenance must remain available.
- If approval actions become enabled without backend/HITL eligibility proof, stop.
- If a screenshot shows new overlap, illegible text, or more grey/noise than before, stop.

### Required Reviewer Signoff Statement

The final reviewer response must include this exact evidence claim, with the coverage file attached or cited:

```text
All actionable findings in docs/qa/external-ui-ux-look-and-feel-audit-report.md lines 31-47, 59-79, 117-201, 203-248, 287-415, and 419-437 are addressed, owner-deferred, or marked not applicable with evidence in docs/qa/maya-external-ui-ux-audit-coverage.md.
```

---

## 4. File Responsibility Map

| File | Responsibility In This Plan |
|---|---|
| `cockpit/app/styles.css` | Expose status token utilities and preserve neutral enterprise shell. |
| `cockpit/components/ui/badge.tsx` | Add semantic badge variants through `cva`, not ad hoc classes. |
| `cockpit/components/maya/verdict-badge-variant.ts` | Central exhaustive verdict/status-to-variant mapping. |
| `cockpit/components/maya/deduction-worklist-table.tsx` | Worklist verdict signal, dead row-menu item removal, gap-copy demotion. |
| `cockpit/components/maya/maya-forensics-surface.tsx` | Overview/cases/returned-worklist copy density, selected row state, screen-level navigation tests. |
| `cockpit/components/maya/deduction-case-workspace.tsx` | Case header verdict, amount/read-only presentation, line selector, raw ID disclosure. |
| `cockpit/components/maya/evidence-dossier.tsx` | Hide/remove disabled Filter/View options, keep source details disclosure, business labels first. |
| `cockpit/components/maya/agent-trace-panel.tsx` | Convert log-card grid into business-readable timeline with trace details collapsed. |
| `cockpit/components/maya/query-evidence-dock.tsx` | Persistent chat composer, answer bubble, prompt chip labels, thinking state, language badge. |
| `cockpit/components/maya/cited-answer-card.tsx` | Demote citation review to footer/disclosure; raw IDs remain inside sources. |
| `cockpit/components/maya/recovery-draft-review.tsx` | Remove/wire no-op draft buttons, collapse backend gap rail, pass approval eligibility. |
| `cockpit/components/maya/approval-gate-dialog.tsx` | Enable/disable decisions based on real eligibility only; demote raw IDs/gaps. |
| `cockpit/components/maya/audit-confirmation-panel.tsx` | Hide disabled audit trail, move unavailable receipt details under disclosure. |
| `cockpit/components/maya/maya-workspace-shell.tsx` | Header tone, run context, hide disabled refresh, preserve logout/session. |
| `cockpit/components/maya/maya-run-kpi-strip.tsx` | Stable KPI typography, one deliberate accent anchor, backend-backed values only. |
| `cockpit/components/maya/maya-empty-state.tsx` | Context-specific empty-state icon support. |
| `cockpit/app/login/page.tsx` | Balanced desktop login composition. |
| `cockpit/app/login/login-form.tsx` | Workspace chip styling, remove disabled forgot-password link. |
| `tests/invariants/maya-shadcn-qa-contract.test.ts` | Static source contracts for no primary gap spam, semantic verdict variants, no visible raw IDs. |
| `tests/e2e/cockpit-premium-e2e.ts` | Browser interaction, visual, disabled-control, and chat-flow assertions. |
| `tests/e2e/maya-real-backend-e2e.ts` | Real backend query/source trace checks remain green after chat/trace changes. |

---

## 5. Implementation Tasks

### Task 0: Baseline And Audit Coverage Harness

**Files:**
- Create: `docs/qa/maya-external-ui-ux-audit-coverage.md`
- Modify: none
- Test: command-only baseline

- [ ] **Step 1: Capture current repo and runtime baseline**

Run:

```powershell
git status --short --branch
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test -- tests/invariants/maya-shadcn-qa-contract.test.ts
npm.cmd run test:e2e -- --maya-shadcn-only
```

Expected:

- If existing tests fail, capture failures in the coverage file before edits.
- If screenshots are generated, keep them under `output/playwright/`.

- [ ] **Step 2: Create audit coverage file**

Add every row from the coverage matrix in Section 2 and set all dispositions to `Pending`.

- [ ] **Step 3: Reviewer confirms coverage harness**

Reviewer checks the coverage file includes:

- P0-1, P0-2, P0-3
- P1-1, P1-2, P1-3, P1-4, P1-5, P1-6
- P2-1 through P2-6
- Dead controls 1 through 10
- Chat findings C-1 through C-8
- Screen scorecard items 1 through 21

Expected: no audit finding lacks a row.

---

### Task 1: Semantic Verdict And Status Signal Layer

**Addresses:** report lines 35-45, 62-66, 127-132, 158-159, 301-318, 320-370.

**Files:**
- Modify: `cockpit/app/styles.css`
- Modify: `cockpit/components/ui/badge.tsx`
- Create: `cockpit/components/maya/verdict-badge-variant.ts`
- Modify: `cockpit/components/maya/deduction-worklist-table.tsx`
- Modify: `cockpit/components/maya/maya-forensics-surface.tsx`
- Modify: `cockpit/components/maya/deduction-case-workspace.tsx`
- Test: `tests/invariants/maya-shadcn-qa-contract.test.ts`
- Test: `tests/e2e/cockpit-premium-e2e.ts`

- [ ] **Step 1: Write RED invariant for status token exposure**

Add an invariant that checks `styles.css` maps these utilities:

```ts
expect(styles).toContain("--color-success: var(--status-success-text);");
expect(styles).toContain("--color-success-surface: var(--status-success-bg);");
expect(styles).toContain("--color-success-border: var(--status-success-border);");
expect(styles).toContain("--color-warning: var(--status-warning-text);");
expect(styles).toContain("--color-danger: var(--status-danger-text);");
expect(styles).toContain("--color-dispute: var(--status-dispute-text);");
expect(styles).toContain("--color-info: var(--status-info-text);");
expect(styles).toContain("--color-neutral-status: var(--status-neutral-text);");
```

Run:

```powershell
npm.cmd test -- tests/invariants/maya-shadcn-qa-contract.test.ts
```

Expected: FAIL because semantic status utilities are not fully mapped.

- [ ] **Step 2: Write RED invariant for semantic badge variants**

Assert `badge.tsx` contains variants `valid`, `invalid`, `review`, `dispute`, `info`, and `neutralStatus`.

Expected: FAIL.

- [ ] **Step 3: Write RED invariant for verdict call sites**

Assert worklist, cases, positive cases, and case header import/use `verdictBadgeVariant` while preserving `data-verdict`.

Expected: FAIL.

- [ ] **Step 4: Implement token utilities and badge variants**

Use existing `tokens.css` status vars only. Do not add new hues.

Implementation rule:

- Tables should use restrained semantic signal: dot/edge plus neutral readable text where density is high.
- Dialog/header single verdicts may use soft filled badge variants.
- Amounts stay neutral and tabular.

- [ ] **Step 5: Run focused tests**

```powershell
npm.cmd test -- tests/invariants/maya-shadcn-qa-contract.test.ts
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 6: Browser screenshot**

Run Maya shadcn E2E and capture at least:

- Worklist verdicts
- Cases verdicts
- Approvals verdict/action rows
- Case detail header

Reviewer compares against audit screenshots `audit-worklist-verdicts.png`, `audit-cases.png`, and `audit-case-loaded.png`.

---

### Task 2: Demote Backend Gap And Plumbing Copy

**Addresses:** report lines 35-47, 66-73, 117-125, 203-218, 372-376, 419-425.

**Files:**
- Modify: `cockpit/components/maya/maya-forensics-surface.tsx`
- Modify: `cockpit/components/maya/deduction-worklist-table.tsx`
- Modify: `cockpit/components/maya/recovery-draft-review.tsx`
- Modify: `cockpit/components/maya/deduction-case-workspace.tsx`
- Modify: `cockpit/components/maya/audit-confirmation-panel.tsx`
- Test: `tests/invariants/maya-shadcn-qa-contract.test.ts`
- Test: `tests/e2e/cockpit-premium-e2e.ts`

- [ ] **Step 1: Write RED invariant for banned primary-layer copy**

Add a helper that scans primary visible areas and fails on:

```ts
const bannedPrimaryCopy = [
  "Priority (gap)",
  "Age (gap)",
  "Last updated (gap)",
  "Backend gaps:",
  "Read-model gaps",
  "Fetched rows only",
  "Backend formatted",
  "Backend row-switch gap"
];
```

Allowed locations:

- disclosure details
- `sr-only`
- explicit fail-closed alert when a source is unavailable
- tests/docs

Expected: FAIL on current source.

- [ ] **Step 2: Implement disclosure-first gap handling**

For each location:

- Returned worklist: rename headers to business labels or remove unsupported columns.
- Worklist header: replace "Read-model gaps" and "Fetched rows only" with one quiet provenance affordance.
- Draft rail: collapse `backendGapItems` into a disclosure titled `Source fields pending`.
- Audit panel: keep unavailable receipt fields inside `maya-audit-receipt-details`, not summary.
- Case header: replace `Backend formatted`/`Amount read-only` chrome with a compact lock/read-only icon and tooltip.

- [ ] **Step 3: Preserve governance honesty**

Do not remove fail-closed information. Move it to:

- "Source details"
- "Receipt details"
- "Why unavailable"
- tooltip/help text

- [ ] **Step 4: Focused tests**

```powershell
npm.cmd test -- tests/invariants/maya-shadcn-qa-contract.test.ts
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 5: Reviewer pass**

Reviewer checks screenshots for:

- no backend contract-gap language as headline text
- no invented values replacing missing data
- raw/fail-closed details still discoverable

---

### Task 3: Raw IDs And Line IDs Behind Disclosure

**Addresses:** report lines 67-70, 73, 145-147, 203-218, 389-391, 419-422.

**Files:**
- Modify: `cockpit/components/maya/deduction-case-workspace.tsx`
- Modify: `cockpit/components/maya/recovery-draft-review.tsx`
- Modify: `cockpit/components/maya/approval-gate-dialog.tsx`
- Modify: `cockpit/components/maya/audit-confirmation-panel.tsx`
- Modify: `cockpit/components/maya/cited-answer-card.tsx`
- Test: `tests/invariants/maya-shadcn-qa-contract.test.ts`
- Test: `tests/e2e/maya-real-backend-e2e.ts`

- [ ] **Step 1: Write RED invariant for primary raw ID leakage**

Assert no primary component renders `RecordIdStrip` outside an accordion/disclosure/details component.

Expected: FAIL.

- [ ] **Step 2: Write RED E2E for line selector**

In `tests/e2e/maya-real-backend-e2e.ts`, preserve the existing rule:

- buttons are named `Line 1`, `Line 2`, not raw `S2-L1`
- selected line metadata remains available in a details region

Expected: may already partially pass; extend it to every line selector instance.

- [ ] **Step 3: Implement disclosure-only raw IDs**

For each component:

- Case timeline: show business event title first; IDs inside details.
- Draft: show cited evidence count first; IDs inside details.
- Approval: show "Cited evidence available" first; IDs inside details.
- Audit: show receipt state first; IDs inside receipt details.
- Query answer: answer prose contains no ID list; citations remain in source details.

- [ ] **Step 4: Focused tests**

```powershell
npm.cmd test -- tests/invariants/maya-shadcn-qa-contract.test.ts tests/e2e/maya-real-backend-e2e.ts
```

Expected: PASS, including real backend citation scope checks.

---

### Task 4: Dead Control And Approval Eligibility Remediation

**Addresses:** report lines 72, 79, 134-137, 149-156, 178-201, 378-382, 423-424.

**Files:**
- Modify: `cockpit/components/maya/maya-workspace-shell.tsx`
- Modify: `cockpit/components/maya/evidence-dossier.tsx`
- Modify: `cockpit/components/maya/audit-confirmation-panel.tsx`
- Modify: `cockpit/components/maya/deduction-worklist-table.tsx`
- Modify: `cockpit/components/maya/recovery-draft-review.tsx`
- Modify: `cockpit/components/maya/approval-gate-dialog.tsx`
- Modify: `cockpit/app/login/login-form.tsx`
- Potentially modify: `src/services/cockpitModel.ts` or API model type only if eligibility is genuinely missing from the backend read model.
- Test: `tests/invariants/maya-shadcn-qa-contract.test.ts`
- Test: `tests/unit/cockpit.test.ts`
- Test: `tests/e2e/cockpit-premium-e2e.ts`

- [ ] **Step 1: Write RED invariant for inert-control inventory**

Encode the audit inventory as source assertions:

```ts
const inertControls = [
  "Forgot password?",
  "Refresh",
  "Filter",
  "View options",
  "View audit trail",
  "Deep evidence switching requires backend support"
];
```

The test should fail if these labels are visible as disabled primary controls in Maya.

- [ ] **Step 2: Remove or demote permanently disabled controls**

Apply the audit recommendation:

- Login forgot password: remove or replace with visible muted demo note.
- Header refresh: hide until real refresh exists; keep last-checked metadata.
- Evidence Filter/View options: hide until implemented.
- Audit trail button: hide until route exists; keep receipt details.
- Worklist disabled menu item: remove.
- Header bell/run-date unavailable: style as static status, not a button-like control.

- [ ] **Step 3: Write RED test for draft command bar**

Assert `Request changes` and `Reject draft` either:

- open the approval dialog preselected to the corresponding decision, or
- are not rendered as clickable buttons.

Expected: FAIL because current behavior only changes caption.

- [ ] **Step 4: Implement draft command behavior**

Preferred low-risk behavior:

- Keep `Open approval` as the only primary CTA.
- Replace `Request changes` and `Reject draft` with secondary menu items only if they open the same approval dialog with decision intent.
- If intent cannot be passed safely, remove the no-op buttons.

- [ ] **Step 5: Write RED approval eligibility contract test**

Create/extend a unit test that proves the selected work item detail can expose approval eligibility from backend/read-model data.

If the read model does not expose it, the test should fail with a clear backend contract gap, not invent eligibility in the browser.

- [ ] **Step 6: Implement eligibility threading**

Thread eligibility from backend model to:

```tsx
<ApprovalGateDialog evidenceReviewEligibilityAvailable={detail.selected.approvalEligibility.available} />
```

Use real existing model fields if present. If absent, add a typed optional model field from backend/API response and fail closed when absent.

- [ ] **Step 7: Focused tests and reviewer**

```powershell
npm.cmd test -- tests/unit/cockpit.test.ts tests/invariants/maya-shadcn-qa-contract.test.ts
npm.cmd run test:e2e -- --maya-shadcn-only
```

Expected:

- no visible no-op controls
- approval buttons enabled only when backend eligibility allows
- approval remains HITL and draft-only

---

### Task 5: Business-Readable Agent Trace

**Addresses:** report lines 70, 141-143, 203-218, 265, 384-387, 430.

**Files:**
- Modify: `cockpit/components/maya/agent-trace-panel.tsx`
- Test: `tests/invariants/maya-shadcn-qa-contract.test.ts`
- Test: `tests/e2e/maya-real-backend-e2e.ts`

- [ ] **Step 1: Write RED invariant for primary trace content**

Fail if primary process node markup renders these as visible first-layer badges:

```ts
["agent_tool_start", "agent_tool_end", "sourceKind", "retrievalSource", "recordIds", "OpenAI Agents SDK"]
```

Allowed only inside `Trace details`.

- [ ] **Step 2: Implement process timeline**

Primary node anatomy:

- icon/status
- business phase label: `Scope`, `Retrieve`, `Reason`, `Draft/Handoff`, `Cited answer`
- plain-language `message`
- one evidence count if useful
- `Trace details` accordion for hook/source/records/citations

- [ ] **Step 3: Preserve technical trace**

Do not remove:

- record IDs
- hook receipts
- source kind
- retrieval source
- model execution evidence

Move them behind disclosure.

- [ ] **Step 4: Focused tests**

```powershell
npm.cmd test -- tests/invariants/maya-shadcn-qa-contract.test.ts tests/e2e/maya-real-backend-e2e.ts
```

Expected: PASS with real backend trace rows still matching rendered trace count.

---

### Task 6: Density, Palette, Elevation, And Selected State

**Addresses:** report lines 31-47, 59-79, 158-159, 169-174, 203-210, 393-397, 427-431.

**Files:**
- Modify: `cockpit/components/maya/maya-run-kpi-strip.tsx`
- Modify: `cockpit/components/maya/deduction-worklist-table.tsx`
- Modify: `cockpit/components/maya/maya-forensics-surface.tsx`
- Modify: `cockpit/components/maya/deduction-case-workspace.tsx`
- Modify: `cockpit/components/maya/source-readiness-strip.tsx`
- Test: `tests/invariants/maya-shadcn-qa-contract.test.ts`
- Test: `tests/e2e/cockpit-premium-e2e.ts`

- [ ] **Step 1: Write RED badge-density invariant**

Assert the main worklist/case-detail viewport does not render provenance micro-badge duplication in primary rows. Static source scan should limit obvious duplicate badge labels:

```ts
expect(primarySource).not.toMatch(/Advisory only[\s\S]{0,1200}Read-model backed[\s\S]{0,1200}Backend formatted/u);
```

- [ ] **Step 2: Implement density cap**

Primary row/card should show at most:

- verdict/status
- queue/action
- evidence count only where it is the next decision signal

Move provenance notes behind tooltip/disclosure.

- [ ] **Step 3: Clarify checkbox versus row-open affordance**

The audit flags the worklist checkbox as ambiguous because it doubles as row selection. Pick one of these patterns and test it:

- If checkbox is a selection affordance, row open must be a distinct `Open investigation` action.
- If row click opens detail, checkbox must not look like an independent bulk-selection control.

Preserve keyboard access and `aria-selected` / `aria-pressed` semantics.

- [ ] **Step 4: Handle sparse Cases and Evidence root screens**

Use existing backend/read-model data only. Acceptable improvements:

- constrain table height and add selected-case side summary from already loaded model data
- add source readiness/evidence grouping from existing props
- add contextual empty-state treatment

Do not add fake charts, fake recent activity, or decorative filler.

- [ ] **Step 5: Apply selected state and elevation tokens**

Use existing token values:

- `shadow-[var(--shadow-sm)]`
- `shadow-[var(--shadow-md)]` only for dialogs/drawers if already consistent
- border/left edge for selected item

No new card nesting.

- [ ] **Step 6: Stabilize KPI typography**

Use one value size with `tabular-nums`, `truncate`, and `title` for long values instead of dynamic font size branches.

- [ ] **Step 7: Focused tests and screenshot review**

```powershell
npm.cmd test -- tests/invariants/maya-shadcn-qa-contract.test.ts
npm.cmd run test:e2e -- --maya-shadcn-only
```

Reviewer compares:

- Overview
- Worklist
- Cases
- Case detail

---

### Task 7: Conversational Recoup Agent Query Flow

**Addresses:** report lines 69, 161-162, 221-248, 403-415, 525-528.

**Files:**
- Modify: `cockpit/components/maya/query-evidence-dock.tsx`
- Modify: `cockpit/components/maya/cited-answer-card.tsx`
- Test: `tests/invariants/maya-shadcn-qa-contract.test.ts`
- Test: `tests/e2e/cockpit-premium-e2e.ts`
- Test: `tests/e2e/maya-real-backend-e2e.ts`

- [ ] **Step 1: Write RED E2E for persistent composer**

After query answer:

```ts
await expectVisibleLocator(page, '[data-testid="maya-cited-answer"]', "Maya cited answer");
await expectVisibleLocator(page, '[data-testid="maya-query-input"]', "Maya query input after answer");
```

Expected: FAIL if composer disappears.

- [ ] **Step 2: Write RED invariant for answer placement**

Assert the assistant bubble region contains the answer text hook, not only `Cited answer returned from backend evidence`.

Expected: FAIL.

- [ ] **Step 3: Implement conversation layout**

Layout:

- selected case context compact at top
- 2-4 prompt chips with question text labels
- message thread
- assistant bubble contains answer prose
- citations and deterministic basis in compact `Sources` / `Basis` disclosures
- composer remains available after answer

- [ ] **Step 4: Fix C-3 through C-8**

- Strip raw ID lists from prose; show citation chips/details below.
- Replace SDK/tool basis copy in primary layer with business basis copy if backend provides it; otherwise label as `Basis available in trace details`.
- Use actual prompt question text as chip label; de-duplicate duplicate labels.
- Remove `Spanish ready` unless a real language control exists.
- During run, show a compact `Maya is checking evidence` bubble and keep trace in disclosure.
- C-8 explicit: keep one citation-policy line only; remove repeated "Citations required", "Cited query standby", and "Accepted only after..." chrome from the primary layer.

- [ ] **Step 5: Real backend query tests**

```powershell
npm.cmd run test:e2e:maya-real
```

Expected:

- live OpenAI agent trace still present
- `query.answer` tool receipt still present
- SAP provenance still present
- composer persists after cited answer

---

### Task 8: Login Layout And Workspace Context

**Addresses:** report lines 59, 87, 164-165, 184, 399-401.

**Files:**
- Modify: `cockpit/app/login/page.tsx`
- Modify: `cockpit/app/login/login-form.tsx`
- Test: `tests/invariants/maya-shadcn-qa-contract.test.ts`
- Test: `tests/e2e/cockpit-premium-e2e.ts`

- [ ] **Step 1: Write RED test for inert forgot-password link**

Assert login form does not render a disabled link-style `Forgot password?` control.

Expected: FAIL.

- [ ] **Step 2: Write RED visual/layout invariant**

Assert login page includes:

- `data-testid="maya-login-card"`
- `data-testid="maya-login-context-panel"` or equivalent balancing panel
- workspace displayed as non-input context chip without search icon

Expected: FAIL if no balancing panel/context chip exists.

- [ ] **Step 3: Implement login composition**

Keep credentials simple:

- Brand/assurance panel on one side for desktop.
- Login form panel on the other.
- Workspace context shown as fixed chip.
- Remove disabled forgot-password link or replace with visible muted text.

- [ ] **Step 4: Browser screenshot**

Run:

```powershell
npm.cmd run test:e2e -- --maya-login-only
```

Reviewer checks `1440px` screenshot for no empty side-zone feeling and no persona-name leakage.

---

### Task 9: P2 Polish And Contextual Empty/Loading/Error States

**Addresses:** report lines 76-78, 169-174, 433-437.

**Files:**
- Modify: `cockpit/components/maya/maya-workspace-shell.tsx`
- Modify: `cockpit/components/maya/maya-empty-state.tsx`
- Modify: `cockpit/components/maya/maya-run-kpi-strip.tsx`
- Modify: loading/error state call sites in `cockpit/components/maya/maya-forensics-surface.tsx`
- Test: `tests/invariants/maya-shadcn-qa-contract.test.ts`
- Test: `tests/e2e/cockpit-premium-e2e.ts`

- [ ] **Step 1: Header tone**

Replace consumer copy with run context built from existing read-model/session data:

- avoid adding new metrics
- do not invent run date
- preserve `Run date unavailable` as quiet metadata if backend does not expose date

- [ ] **Step 2: Empty state variants**

Add a typed `kind` prop to `MayaEmptyState`:

```ts
type MayaEmptyStateKind = "worklist" | "evidence" | "timeline" | "approval" | "search" | "generic";
```

Use lucide icons per kind.

- [ ] **Step 3: Loading and error refinement**

Keep fail-closed text but make it actionable:

- "Retry"
- "Source unavailable"
- correlation details in disclosure

- [ ] **Step 4: Focused tests**

```powershell
npm.cmd test -- tests/invariants/maya-shadcn-qa-contract.test.ts
npm.cmd run test:e2e -- --maya-shadcn-only
```

Expected: PASS with no layout overlap.

---

### Task 10: Full Real-Browser QA And Reviewer Signoff

**Addresses:** report lines 83-109, 252-279, all screenshot appendix lines 475-535.

**Files:**
- Modify: `docs/qa/maya-external-ui-ux-audit-coverage.md`
- Test: `tests/e2e/cockpit-premium-e2e.ts`
- Test: `tests/e2e/maya-real-backend-e2e.ts`

- [ ] **Step 1: Run full gates**

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test -- tests/invariants/maya-shadcn-qa-contract.test.ts
npm.cmd run test:e2e -- --maya-shadcn-only
npm.cmd run test:e2e:maya-real
npm.cmd run verify
```

Expected: PASS.

- [ ] **Step 2: Browser walkthrough checklist**

Reviewer or controller must click through:

- `/login`
- login as Maya
- Overview
- Worklist
- Cases
- Evidence root section
- Approvals root section
- open case
- Overview tab
- Evidence tab
- Agent Trace tab
- Draft tab
- Approval dialog
- Audit tab
- Recoup Agent launcher
- query idle/running/answered
- Sign out

- [ ] **Step 3: Reviewer line-by-line audit**

Reviewer updates `docs/qa/maya-external-ui-ux-audit-coverage.md` so every row has:

- disposition
- changed files
- exact test/screenshot evidence
- reviewer name

Expected: zero `Pending` rows.

- [ ] **Step 4: Final visual bar**

Pass criteria:

- P0 count: 0 open
- P1 count: 0 open or explicitly owner-deferred with reason
- No visible no-op controls
- No raw IDs in primary business prose
- Verdict/status visible without making the UI noisy
- Agent query reads as a conversation
- Provenance still available behind disclosure
- No fake business data
- Full `npm.cmd run verify` green

---

## 6. Commit Strategy

Use small commits:

1. `test: add Maya external UX audit coverage harness`
2. `feat: add semantic Maya verdict styling`
3. `fix: demote Maya backend gap copy`
4. `fix: keep Maya raw evidence ids in disclosures`
5. `fix: remove inert Maya controls and wire approval eligibility`
6. `feat: simplify Maya agent trace timeline`
7. `feat: make Maya query dock conversational`
8. `fix: refine Maya login and empty states`
9. `test: add Maya external audit browser coverage`

Each commit must pass focused tests before the next slice begins.

---

## 7. Remaining Items After This Plan

These are intentionally not solved by this plan unless the owner expands scope:

- Mobile QA and mobile layout polish.
- Backend source contract change if approval eligibility is not currently available.
- Any new approval workflow beyond existing HITL/draft-only rules.
- Any broader David/CFO visual revamp.
- Any production deployment after remediation; deploy only after local and prod smoke pass.

---

## 8. Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-26-maya-external-ui-ux-audit-remediation.md`.

Recommended execution path:

1. **Subagent-Driven (recommended)** - Dispatch a fresh implementer subagent per task, then a reviewer subagent that owns `docs/qa/maya-external-ui-ux-audit-coverage.md`.
2. **Inline Execution** - Execute tasks in this session using `superpowers:executing-plans`, with reviewer checkpoints after every task.

Do not begin implementation until the owner approves this audit-specific plan.
