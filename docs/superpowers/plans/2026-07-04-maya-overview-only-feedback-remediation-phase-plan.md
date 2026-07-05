# Maya Overview Feedback Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate the Maya Overview section feedback, preserving the prod-baseline login/sidebar treatment, keeping every visible business value read-model backed, adding the recommended backend changes as the final implementation phase before testing begins, and holding production behind explicit owner approval.

**Architecture:** UI remediation stays inside the Maya cockpit surface and supporting Maya UI helpers until the final implementation phase. Phase 6 then adds the approved backend recommendations: stable reason narratives, workspace-scope Copilot query support, degraded missing-evidence read-model state, and backend source label cleanup. Overview copy, layout, filters, source display labels, and Copilot entry behavior derive from `model.worklist`, `connectors.sourceTiles`, and backend/read-model contracts.

**Tech Stack:** Next.js App Router, React 19, TypeScript, shadcn/ui, Tailwind v4, lucide-react, Playwright E2E, Vitest invariant/unit tests.

---

## Source Feedback Reviewed

Authoritative feedback source read from the original workspace:

`C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup\docs\superpowers\plans\2026-07-04-maya-overview-feedback-remediation.md`

The file is not currently present in this active feature worktree:

`C:\Users\rathi\.config\superpowers\worktrees\Recoup\maya-reference-workspace-prod-baseline`

This plan captures the overview-only remediation path so execution can happen from the active prod-baseline worktree without depending on that external file being present.

## Overview-Only Scope

### In Scope

- Maya Overview command center header and freshness disclosure.
- Overview summary cards.
- Overview Ready sources pill and expanded source strip display.
- Overview Case Concentration Analysis list, filters, row labels, density, and scroll affordance.
- Overview Recoup Copilot launcher and idle suggestions, without changing `/api/forensics/query`.
- Tests, E2E browser proof, visual comparison against `docs/Recoup_Maya_Journey (1).html`, and reviewer gate.

### Out of Scope For This Plan

- Login page changes. The prod light login with teal branding must remain untouched.
- Left sidebar changes.
- Worklist table remediation outside what the Overview directly renders.
- Case detail remediation.
- Production deployment. Production remains blocked until the owner explicitly approves.

### Final Backend Phase Included Before Testing

- Rich LLM-generated reason narrative persisted to receipts.
- Backend `/api/forensics/query` workspace scope.
- Source/read-model contract changes for missing-receipt rows.
- Backend source label changes in `src/services/cockpitModel.ts`.
- SAP OData readiness is validated before testing; code/env remediation is done only if the configured source probe is wrong.

---

## File Responsibility Map

### Modify

- `cockpit/components/maya/maya-forensics-surface.tsx`
  - Remove visible proof hash chips from the business header.
  - Keep hashes in a non-primary disclosure location.
  - Upgrade Overview card render.
  - Add Overview verdict quick filter state and apply it to concentration rows.
  - Keep Overview rows clickable and read-model backed.
  - Adjust Overview Copilot launcher behavior without backend contract changes.

- `cockpit/components/maya/maya-workspace-derived.ts`
  - Add pure helpers for Overview verdict filter counts, short verdict labels, card visual metadata, and optional run-value share labels.
  - Keep helper outputs data-only and deterministic.

- `cockpit/components/maya/query-evidence-dock.tsx`
  - Remove developer-facing "Client-selected case context" primary copy.
  - Accept/render existing prompt suggestions plus Overview-derived fallback suggestions if supplied by parent.
  - Keep citations and selected evidence scope honest.

- `cockpit/components/maya/source-readiness-strip.tsx`
  - Render backend `MCP Gateway` labels and keep the display resilient if older backend data still emits `MCP`.
  - Preserve original source labels in `aria-label`/`title` where useful for provenance.

- `cockpit/app/styles.css`
  - Tune `.maya-recoup-agent-float` only if needed to behave as a quiet bottom-right FAB.
  - Add bottom padding for Overview content if the FAB can cover last rows.
  - Use existing `--maya-accent`, `--status-success-text`, `--status-danger-text`, and `--status-warning-text` tokens.

### Modify Tests

- `tests/unit/maya-workspace-derived.test.ts`
  - Cover verdict filter counts, short labels, run-value share labels, and amount parse fail-closed behavior.

- `tests/invariants/maya-shadcn-qa-contract.test.ts`
  - Update proof hash expectations away from primary visible header chips.
  - Enforce Overview quick-filter test IDs, card visual metadata, and absence of developer-facing copy in Overview primary text.

- `tests/invariants/maya-reference-workspace-contract.test.ts`
  - Keep Overview-only scope checks aligned with current surface sections.

- `tests/e2e/cockpit-premium-e2e.ts`
  - Add browser coverage for quick filters, visible full-row scroll affordance, launcher placement, dock idle suggestions, and no obstruction.

- `tests/e2e/maya-real-backend-e2e.ts`
  - Add or update real-backend Overview assertions only where text/labels change.

### Modify Backend In Phase 6

- `src/agents/forensics.ts`
  - Add the overnight reason-writer step after deterministic verdicts are produced.
  - Preserve deterministic verdict/routing/amount decisions and cited record IDs as the authority.

- `src/core/rules/*`
  - Expose Zod-typed fact packets per rule so the reason writer receives only deterministic facts.

- `src/services/cockpitApi.ts`
  - Add governed workspace-scope query support to `/api/forensics/query`.
  - Keep current line-scoped query behavior unchanged.

- `src/services/cockpitModel.ts`
  - Rename backend source label `MCP` to `MCP Gateway`.
  - Surface missing-receipt lines as explicit unavailable/degraded rows instead of failing the whole run.

- `src/types/entities.ts`
  - Add typed receipt/read-model fields for persisted reason narrative metadata if the current entity types do not already expose them.

- `config/` and Supabase migration path
  - Add only the schema/env keys needed for persisted reason narrative metadata.
  - Do not introduce business constants, thresholds, or arbitration weights.

### Modify Backend Tests In Phase 6

- `tests/unit/forensics*.test.ts`
- `tests/unit/cockpit*.test.ts`
- `tests/invariants/*`
- `evals/releaseReadinessCli.ts` or the existing release-readiness harness where the groundedness gate belongs.

### Do Not Modify

- `cockpit/app/login/page.tsx`
- `cockpit/app/login/login-form.tsx`
- Worklist and case detail components except where a shared component would otherwise break Overview

---

## Phase 0: Baseline And Safety Lock

**Goal:** Prove execution starts from the intended prod-baseline worktree and capture current Overview evidence before edits.

**Owner:** Main agent.

**Files:** No source changes.

- [ ] **Step 1: Confirm worktree and branch**

Run:

```powershell
git status --short --branch
git rev-parse --short HEAD
```

Expected:

- Branch is `codex/maya-reference-workspace-prod-baseline`.
- Base remains aligned to the intended prod baseline.
- Login files are not modified.

- [ ] **Step 2: Confirm manual server route**

Run or reuse the current manual server:

```powershell
npm run dev:cockpit -- --port 3000
```

Then verify:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000/login?loginId=Maya" -TimeoutSec 8
Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000/forensics/shadcn" -TimeoutSec 8
```

Expected: both return HTTP 200.

- [ ] **Step 3: Capture before screenshots**

Run the existing Maya E2E capture path:

```powershell
$env:RECOUP_E2E_COCKPIT_PORT="3000"
npm run test:e2e -- --maya-shadcn-only
```

Expected:

- Screenshots written under `output/playwright/e2e/`.
- Beat 2 Overview screenshot is the baseline for visual comparison.

---

## Phase 1: Overview Header Copy And Proof Disclosure Cleanup

**Goal:** Remove developer-facing proof chips from the visible Maya business header while preserving audit hashes in a disclosure.

**Owner:** Implementer subagent 1.

**Reviewer:** Reviewer subagent checks that hashes remain available but no longer render as business-facing chips.

**Files:**

- Modify: `cockpit/components/maya/maya-forensics-surface.tsx`
- Modify: `tests/unit/cockpit.test.ts`
- Modify: `tests/e2e/forensics-sse-live-update-e2e.ts`
- Modify: `tests/invariants/maya-shadcn-qa-contract.test.ts`

- [ ] **Step 1: Update invariant expectations first**

Replace expectations that visible primary text contains `data proof` / `decision proof`.

Expected invariant behavior:

- `forensics-business-freshness` remains present when hashes exist.
- Hashes are available through `title`, `aria-label`, or a non-primary disclosure.
- Primary visible business text does not include `data proof` or `decision proof`.

- [ ] **Step 2: Move hash display out of primary header**

Implementation target:

- In `ForensicsBusinessFreshnessBanner`, remove visible `Badge` text `data proof ${hash.slice(0, 8)}` and `decision proof ${hash.slice(0, 8)}`.
- Preserve full `sourceHash` and `receiptHash` in a title/aria disclosure attached to the freshness container.
- Do not touch governance/audit pages.

Required visible copy:

```text
Evidence provenance available
```

or no visible copy if the Overview freshness line already carries enough business context.

- [ ] **Step 3: Reword or hide run-date contract gap**

Implementation target:

- In `MayaWorkspaceShell`, remove primary visible text `Run date unavailable`.
- If the icon remains, its tooltip can say `Run date is not included in this settlement run summary.`
- Avoid "read model" in visible business copy.

- [ ] **Step 4: Run focused tests**

```powershell
npm run test -- tests/invariants/maya-shadcn-qa-contract.test.ts tests/unit/cockpit.test.ts
```

Expected: PASS.

---

## Phase 2: Summary Cards Visual Upgrade

**Goal:** Make the four Overview cards read like the reference journey without thick AI-style sidebars or invented data.

**Owner:** Implementer subagent 2.

**Reviewer:** UI reviewer checks visual hierarchy, token usage, and no "AI slop" patterns.

**Files:**

- Modify: `cockpit/components/maya/maya-forensics-surface.tsx`
- Modify: `cockpit/components/maya/maya-workspace-derived.ts`
- Modify: `tests/unit/maya-workspace-derived.test.ts`
- Modify: `tests/invariants/maya-shadcn-qa-contract.test.ts`

- [ ] **Step 1: Add pure visual metadata helpers**

Add deterministic helper types/functions in `maya-workspace-derived.ts`:

```ts
export type MayaOverviewCardVisualKey = "total" | "valid" | "invalid" | "partial";

export function overviewCardVisualKey(card: MayaOverviewSummaryCard): MayaOverviewCardVisualKey {
  if (card.verdict === "valid") {
    return "valid";
  }
  if (card.verdict === "invalid") {
    return "invalid";
  }
  if (card.verdict === "partial") {
    return "partial";
  }
  return "total";
}
```

Keep amount aggregation unchanged.

- [ ] **Step 2: Add optional share-of-run labels without inventing values**

If share labels are used, compute from parsed cents only:

```ts
export interface MayaOverviewSummaryCard {
  accent: "green" | "red" | "amber" | "neutral";
  amountLabel: string;
  count: number;
  label: string;
  lineCount?: number;
  runValueShareLabel?: string;
  supportLabel: string;
  verdict?: MayaVerdictBucket;
}
```

Rules:

- Total card has no share label.
- Bucket card share is `Math.round(bucketCents * 100 / totalCents)`.
- If any relevant amount is unavailable, omit share label.
- If total is zero, omit share label.

- [ ] **Step 3: Render card icon tiles and verdict-tinted amounts**

In `maya-forensics-surface.tsx`, use lucide icons already available in the dependency tree:

- Total: `FolderSearchIcon` or `InboxIcon`
- Valid: `CheckCircle2Icon`
- Invalid: `XCircleIcon`
- Partial: `CircleDollarSignIcon` or available split/dollar icon

Required styling:

- Icon tile: `size-9`, `rounded-md`, subtle token-backed surface.
- Label: compact, not all-caps if it feels generated; use `text-sm font-medium text-muted-foreground` unless the UI reviewer approves uppercase.
- Count: `text-3xl font-semibold tabular-nums`.
- Amount: `text-base font-semibold tabular-nums`, green/red/amber by bucket.
- No thick left border.
- No nested cards.

- [ ] **Step 4: Run tests**

```powershell
npm run test -- tests/unit/maya-workspace-derived.test.ts tests/invariants/maya-shadcn-qa-contract.test.ts
```

Expected: PASS.

---

## Phase 3: Overview Case Concentration Filters, Labels, And Density

**Goal:** Improve the Overview case list with quick verdict filters, short verdict pills, clear scroll affordance, and full use of real reasons.

**Owner:** Implementer subagent 3.

**Reviewer:** Functional reviewer checks all rows still open real cases and filters do not mutate source data.

**Files:**

- Modify: `cockpit/components/maya/maya-forensics-surface.tsx`
- Modify: `cockpit/components/maya/maya-workspace-derived.ts`
- Modify: `tests/unit/maya-workspace-derived.test.ts`
- Modify: `tests/e2e/cockpit-premium-e2e.ts`

- [ ] **Step 1: Add helper for quick filter counts**

Add to `maya-workspace-derived.ts`:

```ts
export type MayaOverviewVerdictFilter = "all" | MayaVerdictBucket;

export interface MayaOverviewVerdictFilterOption {
  count: number;
  key: MayaOverviewVerdictFilter;
  label: "All" | "Valid" | "Invalid" | "Partial";
}
```

Expected output order:

```text
All, Valid, Invalid, Partial
```

Counts derive from `normalizeMayaVerdict(item.verdict)` and `model.worklist.length`.

- [ ] **Step 2: Add quick filter state to Overview only**

In `maya-forensics-surface.tsx`:

- Add `overviewVerdictFilter` state.
- Apply it before existing text filter and sort.
- Do not change `DeductionWorklistTable`.

Required selector:

```tsx
data-testid="maya-overview-verdict-filter"
```

- [ ] **Step 3: Shorten Overview verdict pill labels**

For Overview case concentration rows only:

- `valid` -> `Valid`
- `invalid` -> `Invalid`
- `partial` -> `Partial`
- unknown -> existing `item.verdictLabel` or `Unavailable`

Keep original `item.verdictLabel` in `title`.

- [ ] **Step 4: Tighten list visibility**

Keep `ScrollArea`, but improve affordance:

- Add visible text `Showing X of Y cases`.
- If row count exceeds visible area, include `Scroll for more`.
- Keep sticky sort/filter header if feasible without layout churn.
- Ensure the FAB does not cover final rows; add bottom padding to the Overview content if needed.

- [ ] **Step 5: E2E test filter behavior**

In `tests/e2e/cockpit-premium-e2e.ts`:

- Navigate to Overview.
- Click `maya-overview-verdict-filter` option `Invalid`.
- Assert every visible row has `data-verdict` normalized to invalid or contains the short `Invalid` pill.
- Assert count line updates.
- Clear back to `All`.
- Assert row count returns to `model.worklist.length`.

Run:

```powershell
npm run test:e2e -- --maya-shadcn-only
```

Expected: PASS and screenshots updated.

---

## Phase 4: Ready Sources And Overview Source Copy

**Goal:** Keep the quiet Ready sources pill, but make expanded source labels and developer-facing source copy business-appropriate.

**Owner:** Implementer subagent 4.

**Reviewer:** UI reviewer checks expanded strip fits at desktop and mobile widths.

**Files:**

- Modify: `cockpit/components/maya/source-readiness-strip.tsx`
- Modify: `tests/invariants/maya-shadcn-qa-contract.test.ts`
- Modify: `tests/e2e/cockpit-premium-e2e.ts`

- [ ] **Step 1: Add UI-only display label mapping**

In `displaySourceLabel`:

```ts
function displaySourceLabel(label: string): string {
  if (label === "MCP") {
    return "MCP Gateway";
  }
  return label;
}
```

Preserve source identity in the tile title/aria where useful:

```tsx
aria-label={`${displayLabel}: ${source.stateLabel}; ${source.modeLabel}; ${sourceCheckedAtLabel}`}
```

- [ ] **Step 2: Keep pill status strict**

Do not change `buildSourcePillState`.

Expected:

- All `statusTone === "ready"` -> green pill.
- Any non-ready source -> red pill with `n/m connected`.

- [ ] **Step 3: Browser test source expansion**

E2E:

- Click `maya-overview-source-readiness-toggle`.
- Assert `maya-source-readiness-strip` is visible.
- Assert `MCP Gateway` is visible when source label is `MCP`.
- Assert red/green state still follows backend tile tones.

Run:

```powershell
npm run test:e2e -- --maya-shadcn-only
```

Expected: PASS.

---

## Phase 5: Overview Recoup Copilot Entry And Idle Suggestions

**Goal:** Make the Overview Copilot feel workspace-level in presentation while preserving the existing case-scoped backend query contract.

**Owner:** Implementer subagent 5.

**Reviewer:** Code reviewer checks no `/api/forensics/query` contract changes and no invented prompts.

**Files:**

- Modify: `cockpit/components/maya/maya-forensics-surface.tsx`
- Modify: `cockpit/components/maya/query-evidence-dock.tsx`
- Modify: `cockpit/app/styles.css`
- Modify: `tests/unit/maya-workspace-derived.test.ts`
- Modify: `tests/e2e/cockpit-premium-e2e.ts`

- [ ] **Step 1: Keep launcher out of the header on Overview**

Preferred approach:

- Render `RecoupAgentLauncher` once through `MayaWorkspaceShell` or immediately inside Overview shell content.
- Style `.maya-recoup-agent-float` as bottom-right fixed FAB only if current behavior is not already fixed.
- Hide the FAB while the dock sheet is open.

Required checks:

- `data-testid="recoup-agent-launcher"` remains.
- Launcher does not cover Overview rows or Ready sources control.

- [ ] **Step 2: Open dock in place from Overview**

Current issue from feedback: Overview launcher can navigate into a default case.

Required UI-only behavior:

- Clicking the Overview launcher opens the dock without moving the user into case detail.
- The dock shows suggested investigations from real `model.worklist`.
- Query execution still requires a selected line/record IDs because the backend schema requires `selectedLineId` and `recordIds`.

Do not change:

```ts
fetch("/api/forensics/query", {
  body: JSON.stringify({
    question: trimmedQuestion,
    recordIds,
    selectedLineId: selectedLine
  })
})
```

- [ ] **Step 3: Wire Overview-derived suggestions**

Use existing helper:

```ts
const overviewSuggestions = buildCopilotSuggestions(model.worklist);
```

Rules:

- Suggestions must use real worklist rows.
- Prefer top invalid exposure, then top valid, then top partial, then largest remaining exposure.
- No document IDs in prompt text unless already part of the read-model prompt.

- [ ] **Step 4: Remove primary developer-facing dock copy**

Replace visible `Client-selected case context` with business copy such as:

```text
Evidence context selected
```

Keep the selected line ID and citation provenance available.

- [ ] **Step 5: E2E test dock behavior**

E2E:

- Start on Overview.
- Click Recoup Copilot launcher.
- Assert URL/section remains Overview.
- Assert dock opens with `Recoup Copilot`.
- Assert 2 or 3 suggestion chips are visible and trace to real worklist items.
- Assert no visible `Client-selected case context`.
- Select/run a case-scoped prompt only after a real line is selected.

Run:

```powershell
npm run test:e2e -- --maya-shadcn-only
```

Expected: PASS.

---

## Phase 6: Backend Remediation Final Implementation Phase Before Testing

**Goal:** Implement the backend recommendations after Overview UI remediation and before the full testing/visual verification block starts.

**Owner:** Backend implementer subagent.

**Reviewer:** Backend reviewer plus security/governance reviewer. This phase changes contracts/schema behavior and must be reviewed before any E2E/visual sign-off is trusted.

**Files:**

- Modify: `src/agents/forensics.ts`
- Modify: `src/core/rules/*`
- Modify: `src/services/cockpitApi.ts`
- Modify: `src/services/cockpitModel.ts`
- Modify: `src/types/entities.ts`
- Modify/Create: Supabase migration or schema artifact for reason narrative metadata
- Modify: `tests/unit/forensics*.test.ts`
- Modify: `tests/unit/cockpit*.test.ts`
- Modify: `tests/invariants/*`
- Modify: `evals/releaseReadinessCli.ts` or existing release readiness checks

- [ ] **Step 1: Add deterministic fact packet schemas**

For each deduction rule, expose a strict fact packet that includes only deterministic inputs already used by the rule.

Required pattern:

```ts
const ShortageFactPacket = z.object({
  citedRecordIds: z.array(z.string()).min(1),
  customer: z.string(),
  lineIds: z.array(z.string()).min(1),
  orderedQty: z.number(),
  osdExceptionPresent: z.boolean(),
  podDocId: z.string(),
  receivedQty: z.number(),
  routing: z.string(),
  verdict: z.enum(["valid", "invalid", "partial"])
}).strict();
```

Rules:

- No dollar amount may be computed by an LLM.
- The deterministic rule result remains the source of truth.
- Every narrative input must be traceable to the existing receipt/rule input.

- [ ] **Step 2: Add reason writer with grounded structured output**

In `src/agents/forensics.ts`, add an overnight investigation step after deterministic verdicts:

- Input: validated fact packet JSON only.
- Output: Zod-parsed `{ narrative: string, citedRecordIds: string[] }`.
- Gate: every number, amount, quantity, date, and document ID in the narrative must exist in the fact packet.
- Gate: `citedRecordIds` must be a subset of packet `citedRecordIds`.
- Gate: verdict wording must agree with deterministic verdict.
- Failure path: one retry with violation text, then deterministic fallback.

Required metadata:

```ts
reason_narrative
reason_source // "llm" | "deterministic_fallback"
reason_model
reason_fact_hash
reason_generated_at
```

- [ ] **Step 3: Persist reason narrative metadata**

Add the schema/read-model persistence needed for reason narrative metadata.

Rules:

- The audit hash continues to cover deterministic facts, verdict, routing, amount, and cited records.
- The narrative stores its own provenance metadata.
- Worklist, Overview rows, case detail, email draft, and Copilot answer all read the same stored narrative once present.
- If narrative is unavailable, fall back to existing deterministic `basis`/`reason`.

- [ ] **Step 4: Add workspace-scope query support**

Extend `/api/forensics/query` while preserving current line-scoped behavior.

Required request modes:

```ts
{ scope: "line", selectedLineId: string, recordIds: string[], question: string }
{ scope: "workspace", settlementRunId: string, question: string }
```

Rules:

- Existing client calls with `selectedLineId` and `recordIds` keep working.
- Workspace scope expands record IDs server-side from the settlement run/read-model.
- Citations remain mandatory.
- Auth, rate limit, memory, and MCP governance remain in force.
- The Overview Copilot can ask run-level questions such as priority cases and invalid exposure without auto-navigating to case detail.

- [ ] **Step 5: Add missing-receipt degraded read-model state**

In `src/services/cockpitModel.ts`, catch missing receipt per line and surface a row state instead of failing the whole run.

Required visible state:

```text
Needs evidence - cannot verdict
```

Rules:

- The row is excluded from Valid / Invalid / Partial KPI buckets.
- The row is counted separately as unavailable.
- No recovery/billing action is suggested for the degraded row.
- Provenance states which source/evidence was missing.

- [ ] **Step 6: Rename backend source label**

Change backend display label from `MCP` to `MCP Gateway` at the source model construction sites.

Required test updates:

- `tests/unit/cockpit.test.ts`
- `tests/unit/cockpit-api.test.ts`
- Any source label assertions in E2E.

- [ ] **Step 7: SAP OData readiness check**

Before entering the full testing block:

```powershell
npm run refresh:source-health
```

Expected:

- If SAP is configured correctly, source readiness should become green.
- If SAP remains blocked, preserve the red UI state and document the exact source-health blocker without forcing fake readiness.

- [ ] **Step 8: Backend focused verification**

Run backend-focused tests before proceeding to visual/E2E:

```powershell
npm run test -- tests/unit/cockpit.test.ts tests/unit/cockpit-api.test.ts
npm run verify:release
```

Expected:

- Reason narrative groundedness gate rejects invented values.
- Deterministic fallback works without blocking the overnight run.
- Workspace query remains citation-bound.
- Missing receipt rows fail closed as unavailable.
- `MCP Gateway` label is produced by backend read-model.

---

## Phase 7: Visual Comparison And Anti-Slop Review

**Goal:** Prove the Overview follows the reference journey style without copying static data or introducing generic AI dashboard artifacts.

**Owner:** Main agent plus UI reviewer subagent.

**Files:** No source changes unless reviewer finds a blocker.

- [ ] **Step 1: Capture reference screenshots**

Use the static mock as visual reference only:

```powershell
# If the existing helper is available, reuse it.
# Otherwise open docs/Recoup_Maya_Journey (1).html with Playwright and capture:
# output/playwright/e2e/reference/maya-reference-after-signin-1440.png
```

Required reference areas:

- Overview hero and four cards.
- Deduction cases list.
- Investigation Copilot idle panel.

- [ ] **Step 2: Capture runtime Overview screenshots**

Run:

```powershell
$env:RECOUP_E2E_COCKPIT_PORT="3000"
npm run test:e2e -- --maya-shadcn-only
```

Required artifacts:

- `output/playwright/e2e/maya-beat-02-dashboard.png`
- Any dedicated Overview/Copilot screenshot added by the E2E test.

- [ ] **Step 3: Reviewer checklist**

Reviewer must check:

- No thick one-sided card sidebars.
- No all-caps tracked microcopy added as decoration.
- No purple/indigo/blue-purple gradients.
- No nested card stacks.
- No fake stats, fake reasons, or static scenario data.
- Cards use real `model.worklist` totals.
- Rows use real `item.reason` through `resolveMayaWorklistReason`.
- Source pill state uses real `connectors.sourceTiles.statusTone`.
- Login page remains unchanged.

- [ ] **Step 4: Record deltas**

Add a short verification note to the final implementation summary:

```text
Visual deltas intentionally retained: prod sidebar/login, real-data source states, no static reference data copied.
```

---

## Phase 8: Full Verification And Production Gate

**Goal:** Complete release-grade checks while keeping production blocked until explicit approval.

**Owner:** Main agent.

**Reviewer:** Senior reviewer subagent after all checks pass.

- [ ] **Step 1: Focused tests**

```powershell
npm run test -- tests/unit/maya-workspace-derived.test.ts tests/invariants/maya-reference-workspace-contract.test.ts tests/invariants/maya-shadcn-qa-contract.test.ts
```

Expected: PASS.

- [ ] **Step 2: Typecheck**

```powershell
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Overview browser E2E**

```powershell
npm run test:e2e -- --maya-shadcn-only
```

Expected: PASS, with updated Overview screenshots.

- [ ] **Step 4: Real backend E2E**

```powershell
npm run test:e2e:maya-real
```

Expected:

- Overview counts equal real worklist aggregates.
- Ready sources pill reflects real connected count.
- Source expansion renders without overlap.
- Copilot suggestions are grounded in real worklist items.

- [ ] **Step 5: Build**

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 6: Full verify**

```powershell
npm run verify
```

Expected: PASS.

- [ ] **Step 7: Production approval gate**

Stop after verification and ask the owner:

```text
Overview remediation is verified locally. Do you approve moving this branch toward production?
```

Do not merge, push to production, or deploy until the owner explicitly approves.

---

## Subagent And Review Protocol

Recommended execution mode: **Subagent-Driven**.

1. Main agent keeps branch/worktree ownership and test orchestration.
2. Implementer subagents handle one phase at a time.
3. After each implementer phase, run focused tests before starting the next phase.
4. UI reviewer checks Phase 2, Phase 3, Phase 4, Phase 5, and Phase 7 screenshots.
5. Code reviewer checks Phase 1 and Phase 5 for scope drift and hidden data assumptions.
6. Backend reviewer checks Phase 6 contract/schema/read-model changes before full E2E begins.
7. Senior reviewer does a final pass over the full diff before production approval is requested.

Reviewer blockers:

- Login files changed.
- Backend contract or model shape changed outside Phase 6.
- New source/dollar/verdict data invented in UI.
- Overview card values differ from `model.worklist` aggregates.
- Source pill state differs from `connectors.sourceTiles`.
- Copilot can send a line-scoped query without required record IDs/line scope, or a workspace-scoped query without server-expanded cited records.
- Visual review score below 4/5 on premium B2B cockpit fit.

---

## Self-Review Against Feedback

- Item 1, proof chips: included in Phase 1.
- Item 2, Copilot FAB: included in Phase 5, Overview-only behavior.
- Item 3, KPI cards: included in Phase 2.
- Item 4, verdict pills and filters: included for Overview rows only in Phase 3; Worklist table is deferred.
- Item 5, richer LLM reasons: included in Phase 6 as backend reason writer, groundedness gate, persistence, and fallback.
- Item 6, only five visible rows: included in Phase 3 as list density/scroll affordance. Backend new-row/missing-receipt behavior is included in Phase 6.
- Item 7, workspace-level Copilot: UI-only Overview behavior included in Phase 5; backend workspace-scope query is included in Phase 6.
- Item 8, MCP Gateway: included in Phase 4 for resilient UI display and Phase 6 for backend source label cleanup.
- Additional A, run date unavailable: included in Phase 1.
- Additional B, SAP OData blocked: included in Phase 6 as a source-readiness check/remediation gate while keeping red state honest if the source is actually blocked.
- Additional C, `buildCopilotSuggestions` not rendered: included in Phase 5.
- Additional D, case badge inconsistency: included for Overview rows only in Phase 3.

No production move is part of this plan.
