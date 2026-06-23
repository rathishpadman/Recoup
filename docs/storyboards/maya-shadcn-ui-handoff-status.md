# Maya Shadcn UI Handoff Status

Status date: 2026-06-23

## User Acceptance Rebaseline

Current screenshots are rejected. Any legacy resemblance to the old Maya cockpit is unacceptable for the active Maya shadcn UI goal.

The latest repo fidelity checkpoint in `docs/storyboards/maya-12-beat-fidelity-review.md` recorded the current `/forensics/shadcn` evidence as `3/5`, which was already not passable. The active user rebaseline is stricter: the user currently rates the existing screenshots below `1/5`. Treat the route as visually failed until a fresh implementation pass and visual review score every required Maya beat at least `4/5`.

Visual audit scores below `4/5` are not passable. `1/5`, `2/5`, and `3/5` remain failed/pending and cannot be marked complete.

## Active Goal

Replace Maya's deduction-forensics cockpit with a shadcn-only, premium B2B SaaS command surface that follows the 12-beat Maya storyboard, uses backend/read-model facts only, preserves Recoup invariants, and does not compute or invent dollars, decisions, evidence, scores, thresholds, approvals, record IDs, audit state, or external-action status in React.

The active review route remains `/forensics/shadcn` until the user accepts the visual direction and the cutover gate allows `/forensics` replacement.

## Current Route And Screenshot Paths

Routes:

- Review route: `/forensics/shadcn`
- Legacy route still present for comparison/cutover safety: `/forensics`
- Persona entry route: `/login`

Current runtime screenshots:

- `output/playwright/e2e/maya-shadcn-forensics-375.png`
- `output/playwright/e2e/maya-shadcn-forensics-768.png`
- `output/playwright/e2e/maya-shadcn-forensics-1024.png`
- `output/playwright/e2e/maya-shadcn-forensics-1440.png`
- `output/playwright/e2e/maya-beat-01-login.png`
- `output/playwright/e2e/maya-beat-02-dashboard.png`
- `output/playwright/e2e/maya-beat-03-recommended-action.png`
- `output/playwright/e2e/maya-beat-04-case-overview.png`
- `output/playwright/e2e/maya-beat-05-evidence-dossier.png`
- `output/playwright/e2e/maya-beat-06-query-start.png`
- `output/playwright/e2e/maya-beat-07-agent-trace.png`
- `output/playwright/e2e/maya-beat-08-cited-answer.png`
- `output/playwright/e2e/maya-beat-09-draft-review.png`
- `output/playwright/e2e/maya-beat-10-human-approval.png`
- `output/playwright/e2e/maya-beat-11-audit-confirmation.png`
- `output/playwright/e2e/maya-beat-12-return-worklist.png`

Current screenshot caveat: these paths are evidence of the rejected state, not acceptance evidence.

## Beat 1 Login Pass

Status: refreshed in the login-only fixer pass on 2026-06-23. This is not user-accepted yet.

Screenshot path:

- `output/playwright/e2e/maya-beat-01-login.png`

Implemented scope:

- `/login` now targets the Beat 1 mockup with a near-white full-screen scene, low-contrast technical line-art, one centered access panel, centered Recoup/Maya lockup, and a shadcn-only form flow.
- The login form preserves `input[name="loginId"]`, the password input, `/api/demo-login`, and navigation via the returned `defaultRoute`.
- The submit button visible copy is `Open workspace` to match the focused e2e role-name check.

Remaining deltas:

- The Recoup mark is still a component-rendered lockup rather than the exact imagegen symbol geometry.
- The line-art background is implemented with CSS primitives and remains an approximation of the mockup's drafted technical paths.
- Final user acceptance and visual score are pending; do not treat this screenshot as accepted release evidence.

## Mockup Paths

Master direction:

- `mockups/imagegen/maya-shadcn-worklist-first-2026-06-23.png`
- `mockups/imagegen/maya-shadcn-evidence-first-2026-06-23.png`
- `mockups/imagegen/maya-shadcn-query-dock-forward-2026-06-23.png`
- `mockups/imagegen/maya-forensics-journey.png`

12-beat storyboard:

- `mockups/imagegen/maya-12-beat-storyboard/contact-sheet.png`
- `mockups/imagegen/maya-12-beat-storyboard/01-login-maya-enters-recoup.png`
- `mockups/imagegen/maya-12-beat-storyboard/02-workspace-morning-run-summary.png`
- `mockups/imagegen/maya-12-beat-storyboard/03-worklist-recommended-action.png`
- `mockups/imagegen/maya-12-beat-storyboard/04-case-overview-crestline-opens.png`
- `mockups/imagegen/maya-12-beat-storyboard/05-evidence-dossier-pod-reviewed.png`
- `mockups/imagegen/maya-12-beat-storyboard/06-query-dock-start.png`
- `mockups/imagegen/maya-12-beat-storyboard/07-agent-trace-in-progress.png`
- `mockups/imagegen/maya-12-beat-storyboard/08-cited-answer-returned.png`
- `mockups/imagegen/maya-12-beat-storyboard/09-draft-review-recovery-packet.png`
- `mockups/imagegen/maya-12-beat-storyboard/10-human-approval-dialog.png`
- `mockups/imagegen/maya-12-beat-storyboard/11-audit-confirmation.png`
- `mockups/imagegen/maya-12-beat-storyboard/12-return-to-worklist-next-case.png`

## Active Or Recent Subagents

No active or recent Maya shadcn UI subagent statuses were provided in this prompt.

Known related historical names from existing planning/status docs are not authoritative for this active rebaseline unless a future handoff explicitly restarts them. Do not wait indefinitely on stale or unknown subagents; replace them with a fresh implementer/reviewer loop if implementation resumes.

## Open Items

- Rebuild the first viewport so it no longer resembles the legacy cockpit.
- Use a persistent Maya command shell/sidebar, compact KPI/source readiness, dense worklist, and selected-case workspace in the first working screen.
- Make the evidence, query, draft, approval, audit, and return-to-worklist states match the 12-beat intent and hierarchy.
- Keep all displayed business truth backend/read-model sourced.
- Preserve visible cited record IDs, deterministic basis, evidence support, and HITL approval wherever decisions, answers, drafts, or audit states appear.
- Refresh responsive screenshots at 375, 768, 1024, and 1440 widths.
- Refresh all 12 beat screenshots.
- Update `docs/storyboards/maya-12-beat-fidelity-review.md` only after new screenshots exist and a fresh visual audit is performed.

## Blockers

- Current screenshots are rejected and must not be used as acceptance evidence.
- Current visual score is below the pass threshold; the active user rating is below `1/5`.
- Supabase live-data caveat: `recoup_src_sap` has been observed as `404`. Do not mutate the external Supabase database or any external DB to fix this without explicit human approval.
- No external action, ERP write-back, approval dispatch, term/limit change, hold/freeze, Billing route, or correspondence may occur without the human approval gate.

## Next Actions

1. Start a fresh Maya shadcn implementation pass scoped to UI files named by the approved brief.
2. Treat the current `/forensics/shadcn` screenshots as failed baseline evidence.
3. Rework the route toward the storyboard mockups, with special focus on first-viewport layout, sidebar shell, dense table-led worklist, selected-case evidence pane, query sheet, human approval dialog, audit confirmation, and return-to-worklist continuity.
4. Run focused invariant/type checks for Maya shadcn boundaries after code changes.
5. Run Playwright/E2E screenshot capture for responsive and 12-beat evidence.
6. Perform a fresh visual audit. Do not mark pass unless every required beat is at least `4/5`.

## ETA Bands

- Documentation-only handoff update: complete in this pass.
- First implementation pass after approval: medium, likely hours, because it must avoid legacy resemblance while preserving data ownership and invariants.
- Full acceptance pass: longer, likely requires at least one implementer pass, one visual reviewer pass, screenshot recapture, fixes, and final verification.

## Verification Gates

Before claiming the Maya shadcn UI goal is complete:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:e2e`
- `npm run verify`
- Responsive screenshots exist for `/forensics/shadcn` or the accepted cutover route at 375, 768, 1024, and 1440 widths.
- Storyboard screenshots exist for all 12 Maya beats.
- Fresh visual audit records every required beat at `4/5` or better; target average is `4.5/5` or better.
- `docs/storyboards/maya-12-beat-fidelity-review.md` is updated with screenshot paths, mockup paths, scores, and unresolved deltas.
- No application code computes money, decisions, thresholds, evidence sufficiency, approval eligibility, audit state, or external-action status in the UI.
- Human approval remains required for every external action.

## Live-Data Caveat

The active implementation must handle missing live source data honestly. Supabase `recoup_src_sap` returning `404` is a known caveat for this handoff. Do not mutate Supabase, SAP, ERP, or any external database without explicit human approval. Use existing backend/read-model fallbacks or blocked/unavailable states rather than inventing live data.
