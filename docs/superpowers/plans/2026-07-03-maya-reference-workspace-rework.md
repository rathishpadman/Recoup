# Maya Reference Workspace Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not move to production without explicit user approval.

**Goal:** Rework the Maya Overview, Worklist, Copilot, and case-detail experience toward `docs/Recoup_Maya_Journey (1).html` while keeping every business-visible value wired to existing backend read-model data.

**Architecture:** Keep the cockpit as a Next.js App Router UI over existing read models. Add only UI-layer helpers/components plus the one allowed `cockpit/app/api/email/route.ts` surface. UI may format and aggregate existing read-model fields, but it must not invent amounts, verdicts, reasons, statuses, thresholds, evidence, or approval state.

**Tech Stack:** Node 22, TypeScript, Next.js App Router, React 19, shadcn/ui, Tailwind tokens in `cockpit/app/styles.css`, `decimal.js` for UI amount aggregation, Vitest, Playwright E2E scripts.

---

## Current Branch And Safety State

- Planning branch created: `codex/maya-reference-workspace-plan`.
- Branch base observed before planning: `8af6bcc`.
- Current worktree already had unrelated dirty audit/screenshot files before this plan. Preserve them. Implementation should either start from a clean worktree off the approved target branch or explicitly prove that the dirty files are unrelated before editing.
- Production gate: do not merge to `main`, push to production, run `vercel deploy --prod`, or change provider config until the user explicitly approves production movement after local/E2E verification.

## Reference Findings From Static HTML

Reference opened in browser from `docs/Recoup_Maya_Journey (1).html`. Use only layout, wording style, and visual treatment. Do not copy the static scenario data.

Observed target patterns:

- Overview has a time-of-day greeting, signed-in user name, settlement-run summary, exactly four compact summary cards, and a quiet source freshness line.
- The source control is a subtle pill, not a card grid.
- Deduction cases render as a dense list: verdict-toned case badge, customer/segment, work-item title, one-line agent reason, amount, line count, verdict pill, and routing line.
- Investigation Copilot has a teal icon tile, "Conductor" subtitle, status chip, idle suggestions, running checklist, and complete verdict panel.
- Case detail uses a Decision Flow stepper, agent investigation steps, evidence/fact cards, a verdict-toned Deterministic basis band, and a gated approval/action footer.

## Hard Constraints

- Do not change backend route contracts except for the new `cockpit/app/api/email/route.ts`.
- Do not change `cockpit/app/cockpit-data.ts` model shapes unless the current target branch already differs from this checkout and the user approves. If `model.worklist[].reason` is still missing from the typed model on the execution branch, stop and ask. The brief says it exists; this checkout currently does not expose it in `WorklistItem`.
- No changes to the existing approval flow semantics. Email send must be disabled until the same human-approved state that unlocks external action is present.
- Left pane: remove only "Cases" and "Evidence"; make no other left-pane changes.
- No fake, dummy, or static business values. If a value is unavailable, render an explicit fail-closed unavailable state.
- No ERP writeback. Email is external correspondence and therefore must remain human-gated.
- No new npm dependency. Use Resend via server-side `fetch`. If a sender address is required, ask for an approved sender env var before implementation; do not invent a `from` value.

## File Map

Create:

- `cockpit/components/maya/maya-workspace-derived.ts`
  - Pure UI derivation helpers for overview buckets, amount totals, source pill state, copilot suggestions, decision stepper state, and email draft text.
- `cockpit/components/maya/decision-flow-stepper.tsx`
  - Reusable case-detail stepper driven by actual case/detail/approval state.
- `cockpit/components/maya/email-draft-dialog.tsx`
  - Editable draft email dialog; send button gated by approval state.
- `cockpit/app/api/email/route.ts`
  - Server-only Resend HTTP API bridge, using `loadLocalRuntimeEnvFiles` and verified human auth.
- `tests/unit/maya-workspace-derived.test.ts`
  - Tests for verdict buckets, Decimal amount sums, source pill state, suggestions, stepper states, and email draft composition.
- `tests/unit/email-route.test.ts`
  - Tests for auth, env failures, approval-state gating, recipient routing, and Resend request shape.
- `tests/invariants/maya-reference-workspace-contract.test.ts`
  - Static contract tests for "Recoup Copilot" copy, removed nav sections, UI-only boundary, and no user-visible "Recoup Agent" in cockpit source.

Modify:

- `cockpit/components/maya/maya-forensics-surface.tsx`
  - Overview hero/cards, source pill, case concentration list, nav branch deletion, Copilot launcher rename.
- `cockpit/components/maya/maya-workspace-shell.tsx`
  - Remove "Cases" and "Evidence" nav items only.
- `cockpit/components/maya/types.ts`
  - Remove `"cases" | "evidence"` from `MayaSurfaceSection`.
- `cockpit/components/maya/deduction-worklist-table.tsx`
  - Add verdict badge plus real reason line to rail/mobile/table rows.
- `cockpit/components/maya/deduction-case-workspace.tsx`
  - Add Decision Flow stepper and Deterministic basis band.
- `cockpit/components/maya/recovery-draft-review.tsx`
  - Add email action next to approval footer and pass approved state into dialog.
- `cockpit/components/maya/query-evidence-dock.tsx`
  - Rename and restyle as Recoup Copilot / Investigation Copilot; add idle/running/complete states.
- `cockpit/components/maya/cited-answer-card.tsx`
  - Render query answer result as collapsible conductor summary, agents checklist, verdict, and citations.
- `.env.example`
  - Document non-secret env variable names for `RESEND_API_KEY`, `EMAIL_TO_BILLING`, `EMAIL_TO_RECOVERY`, and approved sender if user confirms the sender env name.
- `tests/e2e/maya-real-backend-e2e.ts`
  - Extend real-backend browser coverage.
- `tests/e2e/maya-approval-lifecycle-e2e.ts`
  - Extend approved-state persistence coverage for email gating if needed.
- `tests/e2e/cockpit-premium-e2e.ts`
  - Update user-visible "Recoup Agent" assertions to "Recoup Copilot" and add visual/interaction coverage where this suite already owns fixture-style viewport checks.
- `tests/invariants/maya-shadcn-qa-contract.test.ts`
  - Update static contract checks from Recoup Agent to Recoup Copilot and add reference-workspace hooks.
- `tests/invariants/cockpit-route-architecture.test.ts`
  - Include `cockpit/app/api/email/route.ts` in the local-env-loader route boundary check.
- `tests/invariants/cockpit-no-business-logic.test.ts`
  - Assert email route keeps secrets server-only and does not expose Resend/API keys to client code.

Do not modify:

- Existing backend API contracts under `src/services/cockpitApi.ts`.
- Existing `cockpit/app/api/*` files except tests that check the new route and the new route itself.
- `cockpit/app/cockpit-data.ts` shapes unless the execution branch already has the briefed fields or user approves a contract reconciliation.
- `datagen/`, `evals/`, gold data, `audit/trail.ts`, or approval service logic.

---

## Subagent And Reviewer Operating Model

Use one implementer subagent per phase. Do not dispatch multiple implementers against overlapping files.

For every phase:

- [ ] Controller provides the subagent the phase text, exact files, hard constraints, and test commands.
- [ ] Implementer writes failing tests first where the phase touches rules, guards, derived totals, approval state, route behavior, or E2E assertions.
- [ ] Implementer runs the targeted failing test and records the expected red result.
- [ ] Implementer makes the minimal scoped code change.
- [ ] Implementer runs targeted tests, then reports status as `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`.
- [ ] Spec reviewer subagent reviews only against this plan, the user brief, AGENTS.md, `INVARIANTS.md`, and the static reference observations.
- [ ] Code-quality reviewer subagent reviews only the phase diff for bugs, data provenance, test gaps, accessibility, and scope creep.
- [ ] Controller fixes reviewer issues before moving to the next phase.

Final reviewers:

- [ ] UI reviewer: compare runtime screenshots against the static reference for desktop and mobile.
- [ ] E2E reviewer: inspect `tests/e2e/maya-real-backend-e2e.ts` evidence and confirm no fixture route fulfillment is used for real-backend acceptance.
- [ ] Security/provenance reviewer: verify no secrets in client code, no fake business values, and no autonomous external action.
- [ ] Senior critique pass: name likely bug, inspect diff, and confirm spec inconsistencies or blockers.

---

## Phase 0 - Target Alignment And Contract Check

**Owner:** Controller

**Files read only:**

- `AGENTS.md`
- `INVARIANTS.md`
- `Recoup_v2_SDD.md` sections 8.1, 8.3, 11
- `docs/Recoup_Maya_Journey (1).html`
- `cockpit/components/maya/maya-forensics-surface.tsx`
- `cockpit/components/maya/maya-workspace-shell.tsx`
- `cockpit/components/maya/types.ts`
- `cockpit/components/maya/deduction-worklist-table.tsx`
- `cockpit/components/maya/deduction-case-workspace.tsx`
- `cockpit/components/maya/query-evidence-dock.tsx`
- `cockpit/components/maya/cited-answer-card.tsx`
- `cockpit/components/maya/recovery-draft-review.tsx`
- `cockpit/app/cockpit-data.ts`
- `config/localRuntimeEnv.ts`

Steps:

- [ ] Prove implementation target: run `git status --short --branch` and `git rev-parse HEAD`.
- [ ] If target is production/current QA branch and current branch differs, create a clean worktree from the intended target before code edits.
- [ ] Re-open the static HTML in a browser and capture reference observations for Overview, case list, Copilot idle/running/complete, case detail, and approval footer.
- [ ] Confirm `WorklistItem` has `reason`. Current checkout does not. If the execution branch still lacks it, stop and ask whether to use an already-existing equivalent field or approve a model contract update.
- [ ] Confirm Resend sender requirement. If no approved sender env exists, ask before implementing send. Do not invent sender address.
- [ ] Confirm no unrelated dirty files are touched by the phase diff.

Success check:

```powershell
git status --short --branch
rg -n "reason" cockpit/app/cockpit-data.ts src/services/cockpitModel.ts
rg -n "Recoup Agent|Recoup Copilot" cockpit/components tests/e2e tests/invariants
```

Expected:

- Target branch/worktree is explicit.
- Open `reason`/sender questions are either resolved or documented as blockers.
- No code edits yet.

---

## Phase 1 - Tests First: Contracts And E2E Assertions

**Owner:** Test implementer subagent

**Files:**

- Create: `tests/unit/maya-workspace-derived.test.ts`
- Create: `tests/unit/email-route.test.ts`
- Create: `tests/invariants/maya-reference-workspace-contract.test.ts`
- Modify: `tests/e2e/maya-real-backend-e2e.ts`
- Modify: `tests/e2e/cockpit-premium-e2e.ts`
- Modify: `tests/invariants/maya-shadcn-qa-contract.test.ts`
- Modify: `tests/invariants/cockpit-route-architecture.test.ts`
- Modify: `tests/invariants/cockpit-no-business-logic.test.ts`

Test requirements:

- [ ] Derived overview tests compute counts, line counts, and Decimal amount totals from `model.worklist`.
- [ ] Unknown verdict strings are not silently mapped to valid/invalid/partial; they fail closed or are excluded with explicit unavailable state.
- [ ] Partial bucket shows zero when no partial worklist rows exist.
- [ ] Source pill reports green only when every `sourceTiles[].statusTone === "ready"`; red otherwise with `n/m connected`.
- [ ] Copilot suggestions are built from real worklist rows, including top invalid by parsed exposure when available.
- [ ] Decision Flow states are derived from real detail/approval state.
- [ ] Email draft helper uses customer, amount, lines, verdict, reason, recommended action, and cited record IDs from the selected case.
- [ ] Email route returns clear inline-safe errors for missing env vars and does not print env values.
- [ ] Email route rejects unauthenticated requests.
- [ ] Email route rejects send when approval receipt/state is not human-approved.
- [ ] Email route chooses Billing vs Recovery recipient from approved route input and configured env names.
- [ ] Static tests assert no user-visible "Recoup Agent" in cockpit components or E2E expectations.
- [ ] Static tests assert `MayaSurfaceSection` only includes overview, worklist, approvals.
- [ ] E2E asserts overview card counts equal backend worklist aggregates.
- [ ] E2E asserts source pill expands the existing `SourceReadinessStrip`.
- [ ] E2E asserts a controlled non-ready source flips the pill red in a clearly-labeled UI-state test separate from real-backend acceptance.
- [ ] E2E asserts worklist rows include verdict and real reason text.
- [ ] E2E asserts case stepper reflects pending vs approved state before/after approval.
- [ ] E2E asserts email dialog drafts from current case facts and fails cleanly when Resend env is intentionally absent.

Run first, before implementation:

```powershell
npm.cmd run test -- tests/unit/maya-workspace-derived.test.ts tests/unit/email-route.test.ts tests/invariants/maya-reference-workspace-contract.test.ts
npm.cmd run test:e2e:maya-real
```

Expected red:

- New helper imports do not exist.
- New email route does not exist.
- Existing UI still says Recoup Agent.
- Overview and case detail do not yet satisfy the new assertions.

---

## Phase 2 - Pure UI Derived Data Helpers

**Owner:** UI data helper implementer subagent

**Files:**

- Create: `cockpit/components/maya/maya-workspace-derived.ts`
- Modify: `tests/unit/maya-workspace-derived.test.ts`

Implement these exported helpers:

```ts
export type MayaVerdictBucket = "valid" | "invalid" | "partial";

export interface MayaOverviewSummaryCard {
  accent: "green" | "red" | "amber" | "neutral";
  amountLabel: string;
  count: number;
  label: string;
  lineCount?: number;
  supportLabel: string;
  verdict?: MayaVerdictBucket;
}

export interface MayaSourcePillState {
  connectedCount: number;
  isAllReady: boolean;
  label: "Ready sources";
  statusTone: "ready" | "blocked";
  totalCount: number;
}

export interface MayaDecisionFlowStep {
  key: "scenario" | "agents" | "verdict" | "action" | "approval";
  label: string;
  state: "done" | "current" | "pending";
  supportLabel: string;
}
```

Helper behavior:

- [ ] `normalizeMayaVerdict(value)` maps only real valid/invalid/partial variants, case-insensitive.
- [ ] `parseReadModelAmount(value)` uses `Decimal`, accepts formatted read-model strings such as `$12,700` and rejects unparseable values.
- [ ] `formatDollarAmount(decimal)` formats without using JS `number` for money math.
- [ ] `buildOverviewSummaryCards(worklist)` returns exactly four cards:
  - Deduction cases
  - Valid -> Billing
  - Invalid -> Recovery
  - Partial -> Split
- [ ] `buildSourcePillState(sourceTiles)` returns red for zero tiles, blocked tiles, or synthetic/non-ready tiles.
- [ ] `buildCopilotSuggestions(worklist)` returns two or three suggestions from real worklist items and never static scenario IDs.
- [ ] `deriveDecisionFlowSteps(detail, selectedWorklistItem, approvalResponse)` uses actual draft, recommended action, approval state, and audit/receipt state.
- [ ] `buildEmailDraft(input)` composes subject/body from real case facts only.

Run:

```powershell
npm.cmd run test -- tests/unit/maya-workspace-derived.test.ts
```

Expected green before moving on.

---

## Phase 3 - Overview Hero, Summary Cards, Source Pill, Case List

**Owner:** Overview implementer subagent

**Files:**

- Modify: `cockpit/components/maya/maya-forensics-surface.tsx`
- Modify: `cockpit/components/maya/maya-workspace-derived.ts`
- Modify: `tests/unit/maya-workspace-derived.test.ts`
- Modify: `tests/e2e/maya-real-backend-e2e.ts`
- Modify: `tests/e2e/cockpit-premium-e2e.ts`

Steps:

- [ ] Replace `MayaRunKpiStrip` in the Overview header area with a greeting block:
  - salutation from local time of day
  - first name from `session.displayName`
  - summary from `model.worklist.length`
  - offline-validation wording: agents worked the settlement run and returned verdicts
- [ ] Render exactly four summary cards from `buildOverviewSummaryCards(model.worklist)`.
- [ ] Keep "From SAP settlement read-model - updated HH:MM" using existing `businessFreshness` / freshness props. If wording is later considered developer-facing, keep only the business-facing freshness line and preserve source proof in details.
- [ ] Remove the current `DetailStateFact` row and the grid-slot Ready sources button.
- [ ] Add pill-style `Ready sources` control:
  - green dot/border only when all tiles are ready
  - red dot/border otherwise
  - displays `n/m connected`
  - expands existing `SourceReadinessStrip`
- [ ] Keep existing filter/sort logic.
- [ ] Restyle Case Concentration rows as reference-style list rows, not table-first rows:
  - verdict-toned case badge
  - customer and segment/profile
  - title and real `reason`
  - amount and line count
  - verdict pill
  - routing line from `recommendedActionLabel`
  - row click opens case
- [ ] Add stable `data-testid` hooks for hero cards, source pill, and case-list rows.

Run:

```powershell
npm.cmd run test -- tests/unit/maya-workspace-derived.test.ts tests/invariants/maya-reference-workspace-contract.test.ts
npm.cmd run test:e2e:maya-real
```

Expected:

- Overview aggregates match backend worklist.
- Source pill expands strip.
- List rows open case detail.
- No static scenario data copied from HTML.

---

## Phase 4 - Left Nav Simplification And Unreachable Branch Removal

**Owner:** Navigation implementer subagent

**Files:**

- Modify: `cockpit/components/maya/maya-workspace-shell.tsx`
- Modify: `cockpit/components/maya/types.ts`
- Modify: `cockpit/components/maya/maya-forensics-surface.tsx`
- Modify: `tests/e2e/maya-real-backend-e2e.ts`
- Modify: `tests/invariants/maya-reference-workspace-contract.test.ts`
- Modify: `tests/invariants/maya-shadcn-qa-contract.test.ts`

Steps:

- [ ] Remove only the "Cases" and "Evidence" nav items from `navItems`.
- [ ] Change `MayaSurfaceSection` to `"overview" | "worklist" | "approvals"`.
- [ ] Delete now-unreachable `case "cases"` and `case "evidence"` branches in `renderMayaRootSection()`.
- [ ] Keep all evidence components still used inside `DeductionCaseWorkspace`.
- [ ] Confirm `openedCaseDetail` still routes to the case workspace after a worklist/list row click.
- [ ] Update E2E nav assertions to expect Overview, Worklist, Approvals only.

Run:

```powershell
npm.cmd run typecheck
npm.cmd run test -- tests/invariants/maya-reference-workspace-contract.test.ts tests/invariants/maya-shadcn-qa-contract.test.ts
npm.cmd run test:e2e:maya-real
```

Expected:

- No TypeScript references to removed sections.
- Case detail remains reachable from Overview and Worklist.
- Left pane has no unrelated visual/copy changes.

---

## Phase 5 - Worklist Rows And Recoup Copilot

**Owner:** Worklist/Copilot implementer subagent

**Files:**

- Modify: `cockpit/components/maya/deduction-worklist-table.tsx`
- Modify: `cockpit/components/maya/maya-forensics-surface.tsx`
- Modify: `cockpit/components/maya/query-evidence-dock.tsx`
- Modify: `cockpit/components/maya/cited-answer-card.tsx`
- Modify: `cockpit/components/maya/maya-workspace-derived.ts`
- Modify: `tests/e2e/maya-real-backend-e2e.ts`
- Modify: `tests/e2e/cockpit-premium-e2e.ts`
- Modify: `tests/invariants/maya-reference-workspace-contract.test.ts`
- Modify: `tests/invariants/maya-shadcn-qa-contract.test.ts`

Steps:

- [ ] Rename every user-visible cockpit string from "Recoup Agent" to "Recoup Copilot":
  - launcher label
  - launcher aria-label
  - dock title/header
  - tooltips
  - E2E labels
- [ ] Leave internal code identifiers alone unless the rename improves clarity without widening the diff.
- [ ] Worklist rows, mobile cards, and rail rows render:
  - verdict badge
  - short why line from real `reason`
  - routing/action line from real `recommendedActionLabel`
- [ ] Restyle `QueryEvidenceDock` as Investigation Copilot:
  - teal icon tile
  - subtitle: `Conductor - N agents ready`, where N comes from real dock/subagent or source data
  - status chip: Idle, Running, Complete
  - idle suggestions from `buildCopilotSuggestions(model.worklist)` / real prompt suggestion data
- [ ] Running state shows conductor summary and checklist from real trace/subagent rows as they exist.
- [ ] Complete state shows "Agents complete" checklist and verdict panel.
- [ ] Query answer response is inside a `Collapsible` drawer.
- [ ] Preserve citations, deterministic basis, and record ID disclosures.
- [ ] Remove user-facing developer microcopy such as "Client-selected case context" where plain business copy is enough, while keeping technical proof behind source/detail disclosures.

Run:

```powershell
npm.cmd run test -- tests/unit/maya-workspace-derived.test.ts tests/invariants/maya-reference-workspace-contract.test.ts tests/invariants/maya-shadcn-qa-contract.test.ts
npm.cmd run test:e2e:maya-real
```

Expected:

- User-visible "Recoup Agent" no longer appears in cockpit UI/tests.
- Copilot opens, asks, runs, completes, and preserves cited answer proof.
- Worklist rows include backend reason text.

---

## Phase 6 - Case Detail Decision Flow And Deterministic Basis Band

**Owner:** Case-detail implementer subagent

**Files:**

- Create: `cockpit/components/maya/decision-flow-stepper.tsx`
- Modify: `cockpit/components/maya/deduction-case-workspace.tsx`
- Modify: `cockpit/components/maya/recovery-draft-review.tsx`
- Modify: `cockpit/components/maya/maya-workspace-derived.ts`
- Modify: `tests/unit/maya-workspace-derived.test.ts`
- Modify: `tests/e2e/maya-real-backend-e2e.ts`
- Modify: `tests/e2e/maya-approval-lifecycle-e2e.ts`
- Modify: `tests/invariants/maya-reference-workspace-contract.test.ts`

Steps:

- [ ] Add `DecisionFlowStepper` above case detail content.
- [ ] Drive each step from `deriveDecisionFlowSteps(...)`:
  - Scenario
  - Agents investigate
  - Verdict
  - Action
  - Your approval
- [ ] Step states must come from actual case/detail/approval state:
  - done when detail/verdict/action/approval evidence exists
  - current when awaiting the next human or backend state
  - pending when not yet available
- [ ] Add a verdict-toned "Deterministic basis" band under evidence context:
  - real verdict
  - real reason
  - cited document IDs from `selected.evidencePack.documents` and record IDs from `selected.evidencePack.recordIds`
- [ ] Keep Evidence Dossier, Agent Trace, Draft, and Audit tabs functional.
- [ ] Replace stray developer-facing captions in Maya screens only; do not touch governance/audit pages.
- [ ] Keep technical IDs accessible in disclosure/details where QA already expects proof.

Run:

```powershell
npm.cmd run test -- tests/unit/maya-workspace-derived.test.ts tests/invariants/maya-reference-workspace-contract.test.ts
npm.cmd run test:e2e:maya-real
npm.cmd run test:e2e:maya-approval-lifecycle
```

Expected:

- Stepper state changes after approval lifecycle.
- Deterministic basis band renders actual verdict/reason/citations.
- No hardcoded progress or static scenario data.

---

## Phase 7 - Human-Gated Email Draft And Resend Route

**Owner:** Email route/dialog implementer subagent

**Files:**

- Create: `cockpit/components/maya/email-draft-dialog.tsx`
- Create: `cockpit/app/api/email/route.ts`
- Modify: `cockpit/components/maya/recovery-draft-review.tsx`
- Modify: `cockpit/components/maya/maya-workspace-derived.ts`
- Modify: `.env.example`
- Modify: `tests/unit/email-route.test.ts`
- Modify: `tests/unit/maya-workspace-derived.test.ts`
- Modify: `tests/invariants/cockpit-route-architecture.test.ts`
- Modify: `tests/invariants/cockpit-no-business-logic.test.ts`
- Modify: `tests/e2e/maya-real-backend-e2e.ts`
- Modify: `tests/e2e/maya-approval-lifecycle-e2e.ts`

Dialog behavior:

- [ ] Button appears next to approval footer:
  - `Draft email to Billing` for Billing route
  - `Draft email to Recovery` for Recovery route
  - Split/partial cases create two editable drafts, one to Billing and one to Recovery, with each send independently gated by the same committed human approval state.
- [ ] Dialog subject/body are prefilled from real facts:
  - customer
  - amount
  - line IDs/line count
  - verdict and verdict label
  - real reason
  - recommended action
  - cited document IDs/record IDs
- [ ] Subject/body are editable.
- [ ] Send is disabled until a committed human approval receipt/state exists for the same action.
- [ ] If env vars are unset, show a clear inline error and do not call Resend.

Route behavior:

- [ ] Load env through `loadLocalRuntimeEnvFiles()`.
- [ ] Read the send key from `RESEND_API_KEY`. Local verification on 2026-07-03 confirmed `RESEND_API_KEY`, `EMAIL_TO_BILLING`, and `EMAIL_TO_RECOVERY` are present by name in `.env.local`; do not print their values.
- [ ] Require verified human auth using `buildVerifiedHumanAuthHeaders`.
- [ ] Validate JSON body with a local Zod schema.
- [ ] Require `RESEND_API_KEY`, `EMAIL_TO_BILLING`, `EMAIL_TO_RECOVERY`, and `SENDER_EMAIL_ADDRESS`. Local verification on 2026-07-03 confirmed all four env keys are present by name in `.env.local`; do not print their values.
- [ ] Do not print token/env values in response, logs, docs, or tests.
- [ ] Re-fetch `RECOUP_API_URL/forensics/work-items/:lineId` with verified human headers to confirm:
  - case/action identity matches request
  - approval receipt or approval state is human-decided
  - decision is approve
- [ ] Return `409` when approval is not complete.
- [ ] Send real email through Resend using server-side `fetch` against `POST https://api.resend.com/emails`.
- [ ] Add real sent-email readback with `GET` in the same `cockpit/app/api/email/route.ts` route. It calls Resend's sent-email lookup by provider email ID and returns safe metadata only: id, message id, recipient group, subject, created timestamp, and last event. Do not expose the email API key, raw headers, or unrelated mailbox contents.
- [ ] Do not implement inbound received-email/reply body reading unless separately approved. The approved read scope for this phase is sent-email readback/status for emails Maya sent.
- [ ] Return only safe metadata: status, recipient group, lineId, actionId, provider request ID if returned.

MCP note:

- [ ] Scope amendment approved by user on 2026-07-03: Resend may be reached through the Recoup MCP gateway if the tool is Recoup-gated, not exposed as raw Resend access, and still enforces the same committed human approval state as the UI footer.
- [ ] The Recoup MCP gateway already enforces a governed tool boundary: `serviceToolMetadata` exposes read and draft-only tools, `approvals.decide` is internal, and the Maya agent allow-list currently includes only `audit.read` and `query.answer`.
- [ ] Include an explicit governed email send capability in the Recoup MCP gateway. Do not expose raw Resend send capability to the Maya agent path. Email send is external correspondence and must stay behind the same committed human approval state as the footer action.
- [ ] Keep product runtime sending in `cockpit/app/api/email/route.ts`: UI draft -> server re-fetches case/action detail -> server verifies approval receipt/state -> server calls Resend -> server returns safe metadata.
- [ ] Add only governed Recoup gateway tools:
  - `email.status` as read-only safe metadata lookup for a previously sent provider email ID.
  - `email.sendApproved` only if it re-verifies line/action identity, committed human approval, recipient group, and sender config server-side before calling Resend.
- [ ] `email.status` must call the real Resend sent-email read endpoint and return only the safe metadata subset used by the UI route.
- [ ] Extend the MCP permission layer before exposing `email.sendApproved`: add an explicit `send_email` actor capability and email-send side-effect class, deny by default, and require a verified human principal plus `RECOUP_MCP_CLIENT_CAPABILITIES` containing `send_email`. Do not rely on generic `visibility: "mcp"` alone.
- [ ] Keep `email.sendApproved` out of `mayaAgentMcpAllowedToolNames` unless the user explicitly approves an operator-only Maya agent capability. Normal Maya agents should continue to use read tools only.
- [ ] Resend has an official MCP server, but this Codex session must not assume it is active. Verify tool exposure first with `tool_search` and `C:\Users\rathi\.codex\config.toml`.
- [ ] If a Resend MCP server is configured, use it only for operator/admin verification or exploratory status checks, not as the application runtime path. The product runtime still needs the Recoup-gated route/gateway checks so Maya enforces HITL gates, source rechecks, and safe responses consistently.
- [ ] If the user wants Resend MCP installed for Codex, configure it as a separate MCP server with env-key presence only; never paste the API key into chat, docs, screenshots, logs, or command output.

Run:

```powershell
npm.cmd run test -- tests/unit/email-route.test.ts tests/unit/maya-workspace-derived.test.ts tests/invariants/cockpit-route-architecture.test.ts tests/invariants/cockpit-no-business-logic.test.ts
npm.cmd run test:e2e:maya-approval-lifecycle
npm.cmd run test:e2e:maya-real
```

Expected:

- Missing env produces inline UI error.
- Unapproved case cannot send.
- Approved case can attempt send only through the new route.
- No secrets reach client code.

---

## Phase 8 - Full Verification, Visual QA, And Reviewer Closeout

**Owner:** Controller plus QA/reviewer subagents

Commands:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run test:e2e:maya-real
npm.cmd run test:e2e:maya-approval-lifecycle
npm.cmd run test:e2e
npm.cmd run verify
```

Browser checks:

- [ ] Start local API and cockpit against demo backend.
- [ ] Login as Maya.
- [ ] Overview counts equal aggregates from the real `/api/forensics` worklist.
- [ ] Source pill is green when all `sourceTiles` are ready.
- [ ] Controlled non-ready connector check flips pill red in a separate UI-state test.
- [ ] Recoup Copilot rename is visible in launcher, dock, aria labels, and tests.
- [ ] Copilot idle suggestions are based on real worklist rows.
- [ ] Query running/complete panel preserves citations and basis.
- [ ] Worklist rows show verdict badge and real reason.
- [ ] Case detail stepper reflects real approval state.
- [ ] Deterministic basis band shows real verdict, reason, and cited docs.
- [ ] Email dialog drafts from real facts and errors cleanly without env vars.
- [ ] No user-visible dummy/filler/static business data.

Visual checks:

- [ ] Compare desktop screenshot with the static reference for density, hierarchy, and case-list/Copilot treatment.
- [ ] Compare mobile screenshot for no overlapping text/buttons.
- [ ] Confirm no purple/indigo/generated-dashboard styling drift.
- [ ] Confirm source/details disclosures remain accessible without flooding the primary business view with raw IDs.

Reviewer closeout:

- [ ] Spec reviewer signs off on all six user tasks.
- [ ] Code-quality reviewer signs off on scope, tests, route security, and no accidental backend contract changes.
- [ ] Security/provenance reviewer signs off on no secrets, no fake data, no autonomous action, no ERP writeback.
- [ ] Senior critique pass names the likeliest bug and confirms whether it was tested.

Expected:

- All listed commands pass or failures are documented with exact blocker.
- No production movement.

---

## Phase 9 - Production Approval Gate

**Owner:** Human user plus controller

Do not begin this phase until Phase 8 is green and the user explicitly approves production movement.

Pre-prod packet to present to user:

- [ ] Branch/worktree edited.
- [ ] Commit SHA.
- [ ] Files changed.
- [ ] Test command outputs and pass/fail summary.
- [ ] E2E route tested.
- [ ] Screenshot paths.
- [ ] Known risks.
- [ ] Confirmation that no existing backend API contracts changed except new email route.
- [ ] Confirmation that email send is human-gated and env-fail-closed.

Only after explicit approval:

- [ ] Confirm `main` target and deployment branch/commit.
- [ ] Merge or PR according to user direction.
- [ ] Push only after user approval.
- [ ] Deploy only after user approval.
- [ ] Smoke the public production alias for Maya Overview, Worklist, case detail, Copilot, approval gate, and email env failure/success path as appropriate.
- [ ] Report public alias, deployment ID, commit, timestamp, and smoke result without secrets.

Hard stop:

- [ ] If the user has not approved production, stop at local/branch verification and handoff.

---

## Acceptance Coverage Matrix

| Requirement | Phase |
|---|---|
| Overview greeting and real summary | Phase 3 |
| Exactly four real-data summary cards | Phase 2, Phase 3 |
| Freshness line preserved | Phase 3 |
| Ready sources pill and expandable strip | Phase 2, Phase 3 |
| Pill red/green state | Phase 2, Phase 8 |
| Case Concentration restyled list | Phase 3 |
| Recoup Agent renamed Recoup Copilot | Phase 5 |
| Copilot idle/running/complete | Phase 5 |
| Worklist verdict and reason | Phase 5 |
| Query answers collapsible with checklist/verdict/citations | Phase 5 |
| Decision Flow stepper | Phase 6 |
| Deterministic basis band | Phase 6 |
| Email dialog and new email route | Phase 7 |
| Email env fail-closed | Phase 7, Phase 8 |
| Cases/Evidence nav removed | Phase 4 |
| No API changes except email route | Phase 1, Phase 7, Phase 8 |
| No cockpit-data model shape changes | Phase 0, Phase 8 |
| E2E testing | Phase 1, Phase 8 |
| Subagent plus reviewer best practices | All phases |
| Production requires user approval | Phase 9 |

## Decisions Locked Before Execution

1. Worklist "why" line uses the existing real decision basis/finding reason source, such as `DeductionDecision.basis` from the selected backend decision, without inventing text and without changing existing API contracts or cockpit-data model shapes.
2. Partial/split email routing creates two editable drafts: Billing and Recovery.
3. Email capability includes real Resend send plus real sent-email readback/status through the UI route and governed Recoup MCP gateway tools.
4. Inbound received-email/reply body reading is not part of this phase unless separately approved.

## Final Done Criteria

- [ ] All phase-specific targeted tests pass.
- [ ] `npm.cmd run verify` passes.
- [ ] `npm.cmd run build` passes.
- [ ] `npm.cmd run test:e2e:maya-real` passes.
- [ ] `npm.cmd run test:e2e:maya-approval-lifecycle` passes.
- [ ] Screenshot comparison against the static reference is recorded.
- [ ] Spec-validation lists no unresolved inconsistencies.
- [ ] Senior critique pass completed.
- [ ] User explicitly approves before any production deployment.
