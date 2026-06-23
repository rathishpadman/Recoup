# Maya Shadcn UI Handoff Status

Status date: 2026-06-24

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

Current screenshot caveat: `output/playwright/e2e/maya-beat-01-login.png` is current Beat 1 acceptance-candidate evidence. `output/playwright/e2e/maya-beat-02-dashboard.png`, `output/playwright/e2e/maya-beat-02-dashboard-1440.png`, and `output/playwright/e2e/maya-beat-02-dashboard-1280.png` are current Beat 2 final-polish evidence for independent review. `output/playwright/e2e/maya-beat-03-recommended-action.png` is current Beat 3 implementation evidence for independent review. `output/playwright/e2e/maya-beat-04-case-overview.png` is current Beat 4 implementation evidence for independent review. `output/playwright/e2e/maya-beat-05-evidence-dossier.png` is current Beat 5 implementation evidence for independent review. `output/playwright/e2e/maya-beat-06-query-start.png` is current Beat 6 query-dock start evidence for independent review. `output/playwright/e2e/maya-beat-07-agent-trace.png` is current Beat 7 trace-in-progress evidence for independent review. `output/playwright/e2e/maya-beat-08-cited-answer.png` is current Beat 8 cited-answer evidence for independent review. Beat 9+ screenshots, if present, are legacy/rejected-state evidence until each beat is rebuilt and reviewed in sequence.

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
- Beat 5 evidence dossier is implemented for `/forensics/shadcn` only. The Evidence tab now opens inside the selected case workspace and renders a dense two-column dossier: left side `Backend evidence packet` with backend `selected.evidencePack.recordIds[]` chips and `documents[]` rows, right side deterministic-basis and source-provenance rails, and a bottom readout that says `Evidence dossier available` while keeping `Review state unavailable`.
- Beat 5 remains backend/read-model honest: no mockup-only pod names, counts, dates, reviewer, `3 of 3`, review-satisfied copy, live-source relabeling, autonomous recovery, approval dispatch, query/run call, SAP read, ERP write-back, Billing route, correspondence, or data mutation is introduced. `selected.draft.basis` and `selected.draft.statusLabel` are displayed only as draft/deterministic-basis context, not as evidence-review completion.
- Beat 5 deep detail preserves the wrong-row guard from Beat 4. If the opened worklist row does not include `model.selected.lineId`, the Evidence tab still shows the existing contract-gap card instead of borrowing the fixed backend evidence packet.
- Beat 5 verification in this pass: RED invariants first failed for missing source-tile threading and dossier state, then `npm.cmd run test -- tests/invariants/maya-shadcn-boundary.test.ts tests/invariants/cockpit-no-business-logic.test.ts` passed (2 files / 37 tests), `npm.cmd run typecheck` passed, `npm.cmd run test:e2e -- --maya-shadcn-only` passed and refreshed `output/playwright/e2e/maya-beat-01-login.png` plus `output/playwright/e2e/maya-beat-05-evidence-dossier.png` only, full `npm.cmd run verify` passed (lint, typecheck, 81 Vitest files / 594 tests, dependency-cruiser, release readiness).
- Beat 6 query-dock start state is implemented for `/forensics/shadcn` only. The Evidence tab now exposes a local `Query evidence` affordance for the backend-selected case detail packet, opens a right-edge shadcn `Sheet`, keeps the evidence dossier visible behind the dock, shows selected line and backend record IDs near the composer, renders policy/mode chips, uses `FieldGroup` + `Field` + `InputGroupTextarea`, applies the current 500-character question limit, and keeps the `Run query` button disabled until a local question is typed.
- Beat 6 stops before future states: opening and typing do not call approval, run, query, realtime, or SAP routes; the E2E pass types `Why is this deduction recoverable from the selected evidence?` but does not click `Run query`; no cited answer card, fake answer, fake trace completion, external action, approval dispatch, SAP read, ERP write-back, Billing routing, correspondence, or data mutation is introduced.
- Beat 6 scope copy is intentionally honest: the dock says selected IDs are included as client context and labels the scope `Client-selected case context`. It does not claim server-enforced scope or locked records because the current realtime client-secret route validates only the question.
- Beat 6 verification in this pass: RED invariants first failed for missing query affordance, 500-limit composer, and dock wiring, then `npm.cmd run test -- tests/invariants/maya-shadcn-boundary.test.ts tests/invariants/cockpit-no-business-logic.test.ts` passed (2 files / 38 tests), `npm.cmd run typecheck` passed, `npm.cmd run test:e2e -- --maya-shadcn-only` passed and refreshed `output/playwright/e2e/maya-beat-01-login.png` plus `output/playwright/e2e/maya-beat-06-query-start.png` only, full `npm.cmd run verify` passed (lint, typecheck, 81 Vitest files / 595 tests, dependency-cruiser, release readiness).
- Beat 6 reviewer-blocker fix: the query dock now uses an opt-in `SheetContent` overlay class for this dock only, keeping the shadcn overlay mounted while rendering it transparent and no-blur on desktop. The rail also uses an opaque token background and no content fade so the refreshed screenshot keeps the Evidence tab, selected line, record badges, and evidence dossier readable while the dock is open.
- Beat 7 trace-in-progress state is implemented for `/forensics/shadcn` only. The E2E chain opens the backend-selected case, switches to Evidence, opens the query dock, types a local query, clicks `Run query`, holds `/api/query/realtime-client-secret`, and captures a true running/connecting state before any answer can return.
- Beat 7 remains contract-honest: selected evidence record badges and document rows come from `selected.evidencePack`, submitted query text is local in-flight UI state, the running row comes from `RealtimeBrowserSessionSnapshot`, and `multimodalDock.subAgents[]` render as `Read-model evidence context` rows rather than fabricated live progress.
- Beat 7 stops before Beat 8: no `CitedAnswerCard`, cited answer, fake five-step trace, pending guard row, fake PDF/POD viewer, custody/hash/footer metadata, external action, approval dispatch, SAP read, ERP write-back, Billing route, correspondence, or data mutation is introduced.
- Beat 7 visual-gate fix: the query rail now promotes a compact `Selected evidence packet` block from the selected line and backend record IDs, the running state uses the submitted-query card instead of keeping the full composer open, and `AgentTracePanel` renders `multimodalDock.subAgents[]` as a compact shadcn table labeled as static read-model evidence context. This keeps evidence adjacency readable and moves multiple context rows into the first viewport without inventing per-step progress.
- Beat 7 verification in this pass: RED invariants first failed for the missing selected-evidence packet hook and trace-rail/table semantics. Current checks pass: `npm.cmd run test -- tests/invariants/maya-shadcn-boundary.test.ts tests/invariants/cockpit-no-business-logic.test.ts` passed (2 files / 39 tests), `npm.cmd run typecheck` passed, `npm.cmd run test:e2e -- --maya-shadcn-only` passed and refreshed `output/playwright/e2e/maya-beat-07-agent-trace.png`, full `npm.cmd run verify` passed, and `git diff --check` passed with only LF-to-CRLF warnings.
- Beat 8 cited-answer-returned state is implemented for `/forensics/shadcn` only. The focused e2e chain now continues Beat 1 -> Beat 8, opens the backend-selected case, switches to Evidence, opens the query dock, submits a local query, drives the existing `startRealtimeBrowserSession` helper through local browser WebRTC fakes, fulfills `query.answer` through `/api/query/realtime-tool`, and captures `output/playwright/e2e/maya-beat-08-cited-answer.png`.
- Beat 8 remains contract-honest: `CitedAnswerCard` renders only when `status === "answered"`, non-empty `answer`, non-empty `deterministicBasis`, and non-empty `recordIds` exist. The answer text, deterministic basis, and cited record IDs are displayed from the accepted realtime/query response. No mockup answer prose, mockup citation IDs, warning/caution block, approval, recovery, Billing route, ERP write-back, correspondence, or external action dispatch is introduced.
- Beat 8 metadata handling now passes the selected backend `evidencePack` into `QueryEvidenceDock` and `CitedAnswerCard`. Citation rows match response record IDs exactly against loaded evidence `documentId` or `citationId`; exact matches render backend document metadata, and non-matches keep `Metadata unavailable` without inventing document dates, titles, or types.
- Beat 8 answered layout fix: after an accepted answer, the dock switches from the 456px query drawer to a wider answer-review sheet, hides the composer, suppresses duplicate answered status alerts, promotes exact metadata joins before unavailable rows, removes the Beat 7 trace rail from answered mode, and disables the query button. This keeps Beat 6 start and Beat 7 running screenshots behavior intact while making Beat 8 read as a review composition.
- Beat 8 verification in this pass: RED invariants first failed on missing evidence-pack props/wide answered mode, RED e2e then failed on unavailable-row ordering and answered trace crowding, focused checks then passed with `npm.cmd run test -- tests/invariants/maya-shadcn-boundary.test.ts tests/invariants/cockpit-no-business-logic.test.ts` (2 files / 39 tests), `npm.cmd run typecheck` passed, `npm.cmd run test:e2e -- --maya-shadcn-only` passed and refreshed `output/playwright/e2e/maya-beat-01-login.png`, `output/playwright/e2e/maya-beat-06-query-start.png`, `output/playwright/e2e/maya-beat-07-agent-trace.png`, and `output/playwright/e2e/maya-beat-08-cited-answer.png`, and full `npm.cmd run verify` passed (lint, typecheck, 81 Vitest files / 596 tests, dependency-cruiser, release readiness).
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

1. Review the refreshed Beat 8 cited-answer screenshot against `mockups/imagegen/maya-12-beat-storyboard/08-cited-answer-returned.png` using the honest-current-data target from `docs/storyboards/maya-beat-08-shadcn-spec.md`.
2. Record user or independent visual approval before treating Beat 8 as accepted; this pass self-scores Beat 8 at `4.6/5` overall, above the `>=4.5/5` target where backend contract gaps do not block parity.
3. Keep Beat 8 wired to backend/read-model/query response data only; do not invent answers, dollars, thresholds, scores, claims, decisions, approvals, contacts, dates, case IDs, document metadata, evidence sufficiency, warnings, or source counts.
4. Do not proceed into Beat 9 draft-review work until Beat 8 visual review and user approval are recorded.

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

## Beat 5 Remaining Deltas

- The current backend exposes a flat `selected.evidencePack.documents[]` packet, not structured evidence pods. The UI therefore renders one expanded `Backend evidence packet` rather than the mockup's named pod stack.
- The mockup's reviewed-pod completion, `3 of 3` criteria badge, reviewer/time semantics, and bottom success banner are intentionally absent because no backend review-completion contract exists.
- The right rail uses `/connectors.sourceTiles[]` readiness labels and does not show mockup source domains or item totals because those fields are not present in the Forensics evidence packet.
- The table uses compact three-column evidence rows so every backend document field remains visible without fabricating event timestamps or requiring a clipped five-column layout.
- Source provenance still includes synthetic readiness labels from the backend connector model; exact mockup parity requires a future backend `selected.sourceProvenance[]` contract with counts, trust labels, and cited record IDs.

## Beat 5 Component-Level Visual Gate

Target mockup:

- `mockups/imagegen/maya-12-beat-storyboard/05-evidence-dossier-pod-reviewed.png`

Fresh evidence:

- `output/playwright/e2e/maya-beat-05-evidence-dossier.png`

| Component | Score | Concrete deltas |
|---|---:|---|
| Evidence tab / opened-case context | 4.6/5 | Evidence opens inside the selected case workspace with the worklist rail, case header, active Evidence tab, and wrong-row guard preserved; exact mockup breadcrumb/case metadata remains unavailable in the backend contract. |
| Backend evidence packet | 4.6/5 | One expanded backend-backed packet renders record IDs and every document field from `selected.evidencePack`; structured pod names, pod counts, and event timestamps are intentionally omitted. |
| Evidence rows / table density | 4.5/5 | Three-column rows keep citation, document ID, type, description, summary, source, verification, and relevance visible without clipping; it is less visually identical to the mockup's five-column table because event-date/source-tone fields do not exist. |
| Deterministic basis rail | 4.6/5 | Draft basis/status remain read-only backend text, and structured criteria are explicitly marked unavailable; mockup `3 of 3` and satisfied criteria are not rendered. |
| Source provenance rail | 4.5/5 | Connector source tiles render from `/connectors`, synthetic sources stay synthetic, and no source totals are invented; exact source domains/item counts need a future backend contract. |
| Dossier status readout | 4.7/5 | Bottom readout clearly states dossier availability and review-state unavailability without success/review-complete claims. |
| Overall Beat 5 composition | 4.6/5 | The page now matches the two-column evidence-dossier state while staying contract-honest; remaining deltas are backend-contract gaps rather than React polish gaps. |

Gate result: independent Beat 7 visual review cleared every component at `>=4.5/5` and overall `4.6/5`; focused invariants, chained e2e, and full `npm.cmd run verify` were green. This meets the user's autonomous pass rule for continuing to the next beat.

## Beat 6 Remaining Deltas

- Server-side strict query scope is still a backend contract gap: the UI submits selected line/record IDs as client context but does not claim server-enforced scope or locked records.
- The readiness preview uses backend `multimodalDock.subAgents[]` names as compact context only; Beat 7 now owns live in-progress trace rendering and Beat 8 owns answered/cited response state.
- The dock remains narrower and denser than a chat surface, but exact mockup table anatomy on the left is limited by the current backend evidence packet shape from Beat 5.

## Beat 6 Component-Level Visual Gate

Target mockup:

- `mockups/imagegen/maya-12-beat-storyboard/06-query-dock-start.png`

Fresh evidence:

- `output/playwright/e2e/maya-beat-06-query-start.png`

| Component | Score | Concrete deltas |
|---|---:|---|
| Evidence adjacency / opened case | 4.8/5 | The opened case workspace remains crisp with the Evidence tab, selected line, record badges, and dossier readable behind the right-edge sheet; the default shared overlay is bypassed only through the Beat 6 opt-in class. |
| Sheet anatomy / title / footer | 4.8/5 | Right-anchored `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, and bottom `SheetFooter` are present with an opaque token rail, compact primary `Run query` button, and read-only/citation help. |
| Selected context / record badges | 4.7/5 | Selected line and backend record IDs render near the composer, with honest `Client-selected case context` copy and no server-enforced or locked-record claim. |
| Composer / counter / disabled state | 4.7/5 | `FieldGroup`, `Field`, `InputGroup`, and `InputGroupTextarea` are used; the visible counter uses the actual 500-character limit, and the button is enabled only after a local question is typed in E2E. |
| Start-state answer / trace boundary | 4.8/5 | No cited answer card or full agent trace panel renders before submit; only a compact readiness preview from `multimodalDock.subAgents[]` is visible. |
| Request/action guard | 4.8/5 | Opening and typing produced no approval, run, query, realtime, or SAP requests, and the dock contains no external-action controls or fake answer state. |
| Overall Beat 6 composition | 4.7/5 | The screenshot matches the intended right-dock start state while staying contract-honest; the remaining visual deltas are backend evidence-packet limits and the current route's denser worklist anatomy. |

Gate result: self-assessed component-level minimum met (`>=4.5/5`) with focused invariants, chained e2e, and full `npm.cmd run verify` green. Independent visual review and user approval are still required before final acceptance.

## Beat 7 Remaining Deltas

- The mockup's renderable PDF/POD sheet, toolbar, custody footer, collected timestamp, file size, SHA/hash, page count, barcode/signature content, and exact `Query Evidence Sheet` copy remain absent because the current read model exposes document metadata and summaries, not a renderable evidence asset contract.
- The mockup's five ordered live trace steps remain absent because the backend does not expose `activeQuery.steps[]`, per-step statuses, per-step citations, timestamps, or pending guard state. The UI shows one session-level running state from `RealtimeBrowserSessionSnapshot` and static sub-agent context rows from `multimodalDock.subAgents[]`.
- The running row can show session/policy record IDs from the Realtime snapshot while selected evidence record badges stay visible in the dock context. A future backend contract should distinguish session policy IDs from evidence record IDs if the trace row needs only evidence IDs.
- The screenshot uses the current opened-case/worklist layout from Beats 4-6, not the mockup's dedicated Evidence route/sidebar anatomy. Exact parity requires a future route/read-model contract for evidence-focused navigation and case sidebar metadata.
- Beat 7 intentionally does not render an answer, cited basis, audit hash, action guard completion, approval control, recovery draft, Billing route, SAP read, ERP write-back, correspondence, or data mutation.

## Beat 7 Component-Level Visual Gate

Target mockup:

- `mockups/imagegen/maya-12-beat-storyboard/07-agent-trace-in-progress.png`

Fresh evidence:

- `output/playwright/e2e/maya-beat-07-agent-trace.png`

| Component | Score | Concrete deltas |
|---|---:|---|
| Evidence adjacency / opened case | 4.6/5 | Evidence tab, selected line, selected record badges, and backend document rows remain visible behind the right rail, while the rail repeats the selected packet from existing record IDs; exact mockup PDF viewer and evidence-route sidebar are backend-contract gaps. |
| Query rail / submitted query | 4.6/5 | Right-edge shadcn `Sheet` keeps policy chips, a prominent selected-evidence packet, and a `Submitted query` panel sourced from local in-flight state; the full composer is reserved for pre-submit Beat 6 so Beat 7 can show trace context without crowding. |
| Running session trace | 4.6/5 | `AgentTracePanel` owns the running state, maps only `connecting`/`connected` snapshots to skeletons, and shows no answer card; snapshot currently exposes policy record IDs, not a future evidence-step contract. |
| Static evidence context rows | 4.6/5 | `multimodalDock.subAgents[]` rows render as a compact shadcn table labeled `Read-model evidence context`, with backend labels preserved as labels rather than live statuses and multiple rows visible in the first viewport. |
| Contract-gap honesty | 4.6/5 | The panel explicitly marks `Backend trace-step contract gap` and avoids fake five-step progress, pending guard rows, mockup-only POD/custody/hash facts, and `/trace` audit reuse. |
| Request/action guard | 4.8/5 | E2E holds `/api/query/realtime-client-secret`, observes one running request, blocks OpenAI network/external action routes, and asserts no answer card or external-action copy. |
| Overall Beat 7 composition | 4.6/5 | The screen now meets the honest trace-in-progress target with current data: evidence remains adjacent and readable, selected record IDs are promoted, and static context rows read as an operational rail; exact mockup parity is limited by missing evidence asset and active trace-step contracts. |

Gate result: self-assessed component-level minimum met (`>=4.5/5`) with focused invariants, chained e2e, and full `npm.cmd run verify` green. Independent visual review and user approval are still required before final acceptance.

## Beat 8 Remaining Deltas

- The current backend/query response returns five cited record IDs, while only two loaded evidence documents have exact `documentId` or `citationId` matches. The remaining line/POD/invoice IDs correctly render `Metadata unavailable`.
- The mockup's separate `Evidence in this Case` table, business dates, warning/caution block, `Open in Evidence`, and `Review Draft` controls are intentionally absent because the current read model/query response does not expose those exact fields or because the controls would risk implying external-action state.
- The answered mode remains implemented as a shadcn `Sheet`, but it widens only after `canShowCitedAnswer` is true so Beat 6 and Beat 7 retain the established right-drawer behavior.
- The background opened-case workspace remains visible behind the answer-review sheet rather than becoming the mockup's dedicated evidence-route shell; exact route-level parity needs a future navigation/read-model contract.

## Beat 8 Component-Level Visual Gate

Target mockup:

- `mockups/imagegen/maya-12-beat-storyboard/08-cited-answer-returned.png`

Fresh evidence:

- `output/playwright/e2e/maya-beat-08-cited-answer.png`

| Component | Score | Concrete deltas |
|---|---:|---|
| Answer-review sheet width/composition | 4.7/5 | Answered mode now expands to a wide review surface while Beat 6 and Beat 7 keep the narrow query drawer; it still remains a right-side sheet over the opened case rather than a dedicated evidence route. |
| Answer summary and deterministic basis | 4.7/5 | Answer text and deterministic basis are rendered only from the accepted realtime/query response, with compact status/readout chips and no authored rationale bullets or mockup answer prose. |
| Citation metadata table | 4.6/5 | Every response record ID renders; exact backend document/citation matches show citation, document ID, type, relevance, source, verification, and summary, while unmatched IDs stay explicitly unavailable. |
| Backend evidence readout | 4.6/5 | The loaded-document count comes from `selected.evidencePack.documents.length`; no fake evidence count, dates, or case-document table rows are introduced. |
| Beat 6/7 preservation | 4.7/5 | The width switch is gated by `canShowCitedAnswer`, the composer/start state and running trace state remain e2e-covered, and the Beat 8 view no longer carries the Beat 7 trace rail. |
| Action/HITL safety | 4.8/5 | No approval, recovery, Billing route, ERP write-back, correspondence, or external-action buttons are added; the only visible button is the disabled read-only query control after answer. |
| Overall Beat 8 visual fidelity | 4.6/5 | The screen now reads as an answer-review composition rather than a narrow query drawer. Remaining deltas are backend-contract limits and the retained sheet-over-workspace route shape. |

Gate result: self-assessed component-level target met (`>=4.5/5`) with focused invariants, typecheck, chained Beat 6-8 e2e, and full `npm.cmd run verify` green. User or independent visual approval is still required before final acceptance.

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
