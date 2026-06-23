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

- Beat 2 focused rebuild pass is implemented for the morning-run landing view. Maya routes to `/forensics/shadcn`; the page fetches `/forensics` and `/connectors`, renders the KPI strip and source readiness across the full workbench width, then splits into a table-led worklist plus right-side workspace starter.
- Fresh Beat 2 screenshot evidence exists at `output/playwright/e2e/maya-beat-02-dashboard.png`, plus focused 1440 and 1280 captures. The prior candidate commit `c13a148` failed independent Feynman review at `4.0/5` overall, with source readiness, KPI hierarchy, worklist readability, header metadata, and sidebar lockup below the `4.5/5` component gate. The 2026-06-23 Beat 2 reviewer-fix pass is a new acceptance candidate: focused e2e now checks honest header metadata, source-label clipping, all seven backend source tiles, worklist title-backed clipping, single fetched-row footer rhythm, right-pane width, sidebar collapse/filter affordances, and 1440/1280 horizontal fit. Focused e2e passed after the source rail was tightened, but independent visual review and user approval are still required; this is not final user acceptance.
- Beat 2 work-item pane behavior: the landing pane starts with a shadcn Empty workspace starter (`Select a deduction to open its work item`). Clicking a worklist row opens a shallow work-item summary using only that already-fetched `worklist[]` row. This is client-side UI state over real fetched records, not a backend row-switch contract.
- Backend contract caveat for Beat 2: only the fixed `model.selected` evidence packet exists. The pane shows a contract note when the clicked worklist row does not correspond to `model.selected.lineId`; no evidence tabs, approval dialog, or deep case flow were rebuilt in Beat 2.
- Beat 2 verification in this reviewer-fix pass: `npm.cmd run test -- tests/invariants/cockpit-no-business-logic.test.ts`, `npm.cmd run test -- tests/invariants/maya-shadcn-boundary.test.ts`, `npm.cmd run typecheck`, `npm.cmd run test:e2e -- --maya-shadcn-only`, `git diff --check`, and full `npm.cmd run verify` passed. Full verify covered lint, typecheck, 81 Vitest files / 592 tests, dependency-cruiser, and release readiness.
- User approval or change requests for Beat 1 login.
- Unrelated dirty file remains: `cockpit/next-env.d.ts`. Leave it alone unless a future brief explicitly names it.
- Broad full verification passed in this reviewer-fix loop.
- Keep all displayed business truth backend/read-model sourced in future beats.
- Preserve visible cited record IDs, deterministic basis, evidence support, and HITL approval wherever decisions, answers, drafts, or audit states appear.

## Blockers

- Prior Beat 1 approval blocker is superseded for this Beat 2 build pass by the user's 2026-06-23 approval to proceed.
- Supabase live-data caveat: `recoup_src_sap` has been observed as `404`. Do not mutate the external Supabase database or any external DB to fix this without explicit human approval.
- No external action, ERP write-back, approval dispatch, term/limit change, hold/freeze, Billing route, or correspondence may occur without the human approval gate.

## Next Actions

1. Review the refreshed Beat 2 screenshot and work-item pane interaction.
2. Keep Beat 2 wired to backend/read-model data only; do not invent dollars, thresholds, scores, claims, decisions, approvals, or evidence.
3. Do not proceed into Beat 3 deep case/evidence flows until that beat is explicitly approved.
4. Run a visual reviewer gate before treating Beat 2 as accepted.

## Beat 2 Remaining Deltas

- The Recoup sidebar mark is still a component-rendered approximation rather than an official brand asset or exact ImageGen lockup geometry.
- Header date uses an explicit `Run date not exposed` contract-gap affordance plus the connector refresh label (`Refreshed 08:24 AM`) because no backend date field exists for the mockup's `May 15, 2025` copy. The header refresh button is disabled and labelled `Refresh unavailable` because no backend refresh action is exposed by the read model.
- High-priority remains a visible unavailable KPI slot (`No field`, `Priority field not exposed`) because the `/forensics` read model still has no priority field.
- Worklist columns use fetched scenario/line/customer/queue fields rather than mockup-only priority, owner, age, and status fields.
- Source readiness now renders all seven backend source tiles (SAP OData, TPM, 3PL POD, Bureau, Remittance / EDI, Contract Repo, MCP). Visible state labels are shortened (`OK`, `Synth`) to prevent clipping at 1280; full backend state and mode labels remain in aria/title/tooltip text.
- Sidebar now exposes a working shadcn collapse trigger and a lower filter dropdown. The filter dropdown lists only fetched filter axes (scenario, verdict, queue) and marks priority/owner/age-style fields as backend gaps.

## Beat 2 Component-Level Visual Gate

Target mockup:

- `mockups/imagegen/maya-12-beat-storyboard/02-workspace-morning-run-summary.png`

Fresh evidence:

- `output/playwright/e2e/maya-beat-02-dashboard.png`
- `output/playwright/e2e/maya-beat-02-dashboard-1440.png`
- `output/playwright/e2e/maya-beat-02-dashboard-1280.png`

| Component | Score | Concrete deltas |
|---|---:|---|
| Sidebar / nav / footer | 4.6/5 | Dark command rail, honest backend/persona count badges, standalone Recoup loop mark, shadcn collapse trigger, lower filter dropdown, teal active nav state, and read-only footer are in place; the mark remains component-rendered rather than an official brand asset. |
| Header / date / refresh area | 4.5/5 | Header rhythm is compact, notification count is honest, run date is explicitly marked as not exposed, connector refresh metadata is shown, and the refresh control is disabled instead of pretending to call a backed refresh action. |
| KPI strip / cards | 4.5/5 | Six-card strip holds the target rhythm and uses backend KPI strings only; high priority stays `No field` / `Priority field not exposed` because the read model has no priority field. |
| Source readiness strip | 4.5/5 | Single-row source strip shows all seven backend source tiles at 1440 and 1280; ready/synthetic states are visually distinct with icons plus text. Visible state labels are compact to avoid clipping, with full backend state/mode preserved in accessible text. |
| Worklist toolbar / table / pagination | 4.5/5 | Toolbar and table-led anatomy match the target without fake priority/work-type/source/age/owner columns; a read-model gap affordance names those missing fields, evidence and routing text are readable, and only one `Fetched rows only` footer remains. |
| Right work-item pane | 4.5/5 | Empty starter pane keeps the 320px target width and quiet centered state; selected-row detail remains shallow client state over fetched rows rather than invented evidence/action authority. |
| Overall first-viewport composition | 4.5/5 | First viewport preserves sidebar, six KPIs, slim source strip, table-led work area, and right pane at 1440/1280; remaining deltas are backend-contract gaps or non-exact ImageGen lockup geometry. |

Gate result: self-assessed component-level minimum met (`>=4.5/5`) with focused e2e clipping/overflow assertions and full `npm.cmd run verify` green. Independent visual review and user approval are still required before final acceptance.

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
