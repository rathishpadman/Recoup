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
- `output/playwright/e2e/maya-beat-02-dashboard-1440.png`
- `output/playwright/e2e/maya-beat-02-dashboard-1280.png`
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

Current screenshot caveat: `output/playwright/e2e/maya-beat-01-login.png` is current Beat 1 acceptance-candidate evidence. `output/playwright/e2e/maya-beat-02-dashboard.png`, `output/playwright/e2e/maya-beat-02-dashboard-1440.png`, and `output/playwright/e2e/maya-beat-02-dashboard-1280.png` are current Beat 2 final-polish evidence for independent review. `output/playwright/e2e/maya-beat-03-recommended-action.png` is current Beat 3 implementation evidence for independent review. `output/playwright/e2e/maya-beat-04-case-overview.png` is current Beat 4 implementation evidence for independent review. Beat 5+ screenshots, if present, are legacy/rejected-state evidence until each beat is rebuilt and reviewed in sequence.

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
- Fresh Beat 2 screenshot evidence exists at `output/playwright/e2e/maya-beat-02-dashboard.png`, plus focused 1440 and 1280 captures. The fresh independent reviewer verdict at `2a6f13c` failed at `4.3/5` overall, with remaining blockers in source readiness compression, KPI hierarchy, header metadata weight, worklist rhythm, and a user-reported sidebar rail height defect. The 2026-06-23 final-polish pass is a new acceptance candidate: the sidebar rail now fills the full captured page with the user identity/footer at the bottom of the full rail, header metadata is lighter while still exposing missing run-date/refresh contracts, the high-priority KPI gap is visually quiet, and source readiness is a much thinner one-row status rail that still shows all seven backend tiles with text+icon status semantics. Focused e2e now checks sidebar page-fill, bottom-aligned sidebar user identity, honest header metadata, source-label clipping, thin source-strip height, scan-friendly tile width, all seven backend source tiles, worklist title-backed clipping, single fetched-row footer rhythm, right-pane width, sidebar collapse/filter affordances, and 1440/1280 horizontal fit. Independent visual review and user approval are still required; this is not final user acceptance.
- Beat 2 work-item pane behavior after the Beat 3 implementation: the current `/forensics/shadcn` route initializes a local selected worklist row from `worklist[]` so Beat 3 can show the recommended-action moment by default. The Beat 2 screenshot still verifies the accepted sidebar/KPI/source/worklist foundation, but the right pane now shows the selected fetched-row summary rather than the prior Empty starter.
- Backend contract caveat for Beat 2: only the fixed `model.selected` evidence packet exists. The pane shows a contract note when the clicked worklist row does not correspond to `model.selected.lineId`; no evidence tabs, approval dialog, or deep case flow were rebuilt in Beat 2.
- Beat 2 verification in this final-polish pass: `npm.cmd run test -- tests/invariants/maya-shadcn-boundary.test.ts tests/invariants/cockpit-no-business-logic.test.ts` passed (2 files / 35 tests), `npm.cmd run typecheck` passed, `npm.cmd run test:e2e -- --maya-shadcn-only` passed and refreshed `output/playwright/e2e/maya-beat-02-dashboard.png`, `output/playwright/e2e/maya-beat-02-dashboard-1440.png`, and `output/playwright/e2e/maya-beat-02-dashboard-1280.png`, full `npm.cmd run verify` passed (lint, typecheck, 81 Vitest files / 592 tests, dependency-cruiser, release readiness), and `git diff --check` passed with only LF-to-CRLF working-copy warnings.
- Beat 3 recommended-action state is implemented for `/forensics/shadcn` only. The table defaults to the backend-selected `worklist[]` row when it maps to `model.selected.lineId`, otherwise the first fetched row. Row selection remains local UI state keyed by `worklist[].lineId`, `aria-selected`, checkbox, click, Enter, and Space; it does not claim a backend row refresh.
- Beat 3 right pane summarizes only the selected fetched row: customer, scenario, line IDs, amount, verdict, queue, routing, evidence, confidence, and `recommendedActionLabel`. The advisory callout explicitly says `Advisory only`, local buttons do not dispatch external actions, and the detail-packet note states when deep evidence is unavailable until backend row switching exists.
- Beat 3 verification in this pass: the focused Beat 3 boundary test first failed for the missing selected/advisory state, then `npm.cmd run test -- tests/invariants/maya-shadcn-boundary.test.ts tests/invariants/cockpit-no-business-logic.test.ts` passed (2 files / 35 tests), `npm.cmd run typecheck` passed, `npm.cmd run test:e2e -- --maya-login-only` passed, `npm.cmd run test:e2e -- --maya-shadcn-only` passed and refreshed Beat 1, Beat 2, and Beat 3 screenshots, full `npm.cmd run verify` passed (lint, typecheck, 81 Vitest files / 592 tests, dependency-cruiser, release readiness), and `git diff --check` passed with only LF-to-CRLF working-copy warnings.
- Beat 4 case overview is implemented for `/forensics/shadcn` only. The local `Open investigation` control opens the selected fetched row into a case workspace with a narrow worklist rail, backend scenario/customer/line labels, backend read-only amount, backend verdict/routing/queue/confidence badges, selected-line summary, Overview/Evidence/Agent Trace/Draft/Audit tabs, deterministic basis, record IDs, evidence document count, read-only draft/approval status, notes unavailable state, and `mayaJourney[]` timeline rows. The Draft tab keeps model-owned draft label/status/amount/basis/record IDs and uses neutral `Draft label` inbox copy instead of raw action metadata.
- Beat 4 deep detail is guarded: `model.selected` evidence, draft, trace, and audit detail render only when the opened worklist row contains `model.selected.lineId`; other row selections show a contract-gap state instead of borrowing the fixed evidence packet. Beat 4 does not call approval, realtime query, SAP, ERP write-back, correspondence, Billing routing, or any external action route.
- Beat 4 reviewer-fix verification in this pass: the focused boundary tests first failed on the raw action-ID/action-type and disabled command-copy guard, then `npm.cmd run test -- tests/invariants/maya-shadcn-boundary.test.ts tests/invariants/cockpit-no-business-logic.test.ts` passed (2 files / 36 tests), `npm.cmd run typecheck` passed, `npm.cmd run test:e2e -- --maya-shadcn-only` passed after clicking the Draft tab and checking no `Action ID`, no `Action type`, no `draft-rebill`, and no disabled draft command controls, refreshed Beat 1, Beat 2, Beat 3, and Beat 4 screenshots, full `npm.cmd run verify` passed (lint, typecheck, 81 Vitest files / 593 tests, dependency-cruiser, release readiness), and `git diff --check` passed with only LF-to-CRLF working-copy warnings.
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

1. Review the refreshed Beat 4 case-overview screenshot against `mockups/imagegen/maya-12-beat-storyboard/04-case-overview-crestline-opens.png`.
2. Run or record an independent visual reviewer gate before treating Beat 4 as accepted; every Beat 4 component and overall score must be `>=4.5/5`.
3. Keep Beat 4 wired to backend/read-model data only; do not invent dollars, thresholds, scores, claims, decisions, approvals, contacts, dates, case IDs, or evidence.
4. Do not proceed into Beat 5 evidence-dossier work until the Beat 4 build, chained browser/storyline test, and independent reviewer gate pass.

## Beat 2 Remaining Deltas

- The Recoup sidebar mark is still a component-rendered approximation rather than an official brand asset or exact ImageGen lockup geometry.
- Header date uses an explicit accessible `Run date not exposed` contract-gap affordance because no backend date field exists for the mockup's `May 15, 2025` copy. The connector refresh label (`Refreshed 08:24 AM`) remains visible as metadata, and the disabled refresh button now reads `Refresh` visually while its accessible label/tooltip states that refresh is unavailable because no backend refresh action is exposed by the read model.
- High-priority remains an unavailable KPI slot (`Not exposed`, `Priority unavailable`; tooltip basis `Priority field not exposed`) because the `/forensics` read model still has no priority field.
- Worklist columns use fetched scenario/line/customer/queue fields rather than mockup-only priority, owner, age, and status fields.
- Source readiness now renders all seven backend source tiles (SAP OData, TPM, 3PL POD, Bureau, Remittance / EDI, Contract Repo, MCP) as a thin one-row rail. Visible state labels are shortened (`OK`, `Synth`) to prevent clipping at 1280; full backend state and mode labels remain in aria/title/tooltip text.
- Sidebar now exposes a working shadcn collapse trigger and a lower filter dropdown, its visual rail fills the full captured page instead of ending at the first viewport, and the user identity/footer sits at the bottom of the full rail. The filter dropdown lists only fetched filter axes (scenario, verdict, queue) and marks priority/owner/age-style fields as backend gaps.

## Beat 2 Component-Level Visual Gate

Target mockup:

- `mockups/imagegen/maya-12-beat-storyboard/02-workspace-morning-run-summary.png`

Fresh evidence:

- `output/playwright/e2e/maya-beat-02-dashboard.png`
- `output/playwright/e2e/maya-beat-02-dashboard-1440.png`
- `output/playwright/e2e/maya-beat-02-dashboard-1280.png`

| Component | Score | Concrete deltas |
|---|---:|---|
| Sidebar / nav / footer | 4.7/5 | Dark command rail, honest backend/persona count badges, standalone Recoup loop mark, shadcn collapse trigger, lower filter dropdown, teal active nav state, bottom-aligned read-only footer, and full-page rail fill are in place; the mark remains component-rendered rather than an official brand asset. |
| Header / date / refresh area | 4.6/5 | Header rhythm is lighter, notification count is honest, run date is accessible as a missing read-model field, connector refresh metadata is shown, and the refresh control is disabled with an unavailable label instead of pretending to call a backed refresh action. |
| KPI strip / cards | 4.6/5 | Six-card strip gives real backend values stronger executive weight; high priority stays a quiet `Not exposed` / `Priority unavailable` contract gap because the read model has no priority field. |
| Source readiness strip | 4.6/5 | Thin source strip shows all seven backend source tiles at 1440 and 1280, ready/synthetic states are visually distinct with icons plus text, and full backend state/mode remains preserved in accessible text. |
| Worklist toolbar / table / pagination | 4.5/5 | Toolbar and table-led anatomy match the target without fake priority/work-type/source/age/owner columns; a read-model gap affordance names those missing fields, evidence and routing text are readable, and only one `Fetched rows only` footer remains. |
| Right work-item pane | 4.6/5 | Empty starter pane keeps the target width and quiet centered state; selected-row detail remains shallow client state over fetched rows rather than invented evidence/action authority. |
| Overall first-viewport composition | 4.6/5 | First viewport preserves full-page sidebar with bottom user identity, six KPIs, a thin source rail, table-led work area, and right pane at 1440/1280; remaining deltas are backend-contract gaps or non-exact ImageGen lockup geometry. |

Gate result: self-assessed component-level minimum met (`>=4.5/5`) with focused e2e clipping/overflow/page-fill assertions green and full `npm.cmd run verify` green. Independent visual review and user approval are still required before final acceptance.

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
