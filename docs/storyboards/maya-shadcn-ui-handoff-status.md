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

Current screenshot caveat: `output/playwright/e2e/maya-beat-01-login.png` is current Beat 1 acceptance-candidate evidence. The other beat screenshots, if present, are legacy/rejected-state evidence until each beat is rebuilt and reviewed in sequence.

## Beat 1 Login Pass

Status: implemented and committed at `9c26a7d` (`Rename Maya login capability label`). Beat 1 is awaiting user approval. Do not proceed to Beat 2 until the user approves Beat 1.

Current reviewer-facing assessment: final read-only review agent Averroes scored Beat 1 visual fidelity `4.1/5` with no blockers. Treat this as an acceptance candidate, not final user acceptance.

Screenshot path:

- `output/playwright/e2e/maya-beat-01-login.png`

Mockup reference:

- `mockups/imagegen/maya-12-beat-storyboard/01-login-maya-enters-recoup.png`

Implemented scope:

- `/login` now targets the Beat 1 mockup with a near-white full-screen scene, low-contrast technical line-art, one centered access panel, centered Recoup/Deduction Forensics lockup, and a shadcn-only form flow.
- Product naming decision for the login lockup: the poor `Maya Forensics` wording was replaced with `Deduction Forensics`; `Maya` remains persona/user context only.
- The login form preserves `input[name="loginId"]`, the password input, `/api/demo-login`, and navigation via the returned `defaultRoute`.
- The Recoup lockup now uses a code-native angular SVG mark beside `RECOUP`; no raster screenshot is used in the UI.
- The submit button visible copy is `Open Forensics Workspace`, and the focused e2e accepts the mockup copy while preserving login behavior.
- Persona choices are rendered from the backend `personas` login model, with display labels mapped for the mockup. Selecting a persona updates the actual `loginId` posted to `/api/demo-login`.
- `Remember user ID` now has local-only persistence through versioned localStorage keys for the selected `loginId`.
- `Forgot password?` is disabled with an accessible unavailable explanation because no password-recovery backend route exists in the demo login contract.
- Footer separators are centered dots, and the alert/button treatments are softer and closer to the mockup without reintroducing legacy or purple styling.
- Focused check for this naming pass refreshed `output/playwright/e2e/maya-beat-01-login.png` through `npm run test:e2e -- --maya-login-only`.

Remaining deltas:

- The Recoup mark is still an approximated component-rendered symbol rather than the exact imagegen geometry or an official asset.
- The line-art background is implemented with CSS primitives and remains an approximation of the mockup's drafted technical paths.
- The User ID field displays the selected model `loginId` (`Maya`) to satisfy the backend contract; the mockup shows an empty placeholder state.
- The type scale and logo spacing are constrained by the cockpit typography rules and are less letter-spaced than the imagegen mockup.
- Final user approval or change requests are pending; do not treat this screenshot as accepted release evidence until the user approves Beat 1.

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

## Active Subagents

None. No agent loop is currently active.

## Open Items

- User approval or change requests for Beat 1 login.
- Unrelated dirty file remains: `cockpit/next-env.d.ts`. Leave it alone unless a future brief explicitly names it.
- Broad full E2E was not rerun after the previous debug path because the current gate is Beat 1 screenshot/review.
- Keep all displayed business truth backend/read-model sourced in future beats.
- Preserve visible cited record IDs, deterministic basis, evidence support, and HITL approval wherever decisions, answers, drafts, or audit states appear.

## Blockers

- Beat 1 is not user-approved yet.
- Supabase live-data caveat: `recoup_src_sap` has been observed as `404`. Do not mutate the external Supabase database or any external DB to fix this without explicit human approval.
- No external action, ERP write-back, approval dispatch, term/limit change, hold/freeze, Billing route, or correspondence may occur without the human approval gate.

## Next Actions

1. Wait for user approval or change requests for Beat 1 login.
2. After approval only, build Beat 2 mini-dashboard as its own beat.
3. Keep Beat 2 wired to backend/read-model data only; do not invent dollars, thresholds, scores, claims, decisions, approvals, or evidence.
4. Run Beat 2 screenshot capture and a subagent review gate before moving onward.

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
