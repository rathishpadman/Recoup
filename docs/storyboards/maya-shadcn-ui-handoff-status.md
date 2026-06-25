# Maya Shadcn UI Handoff Status

Status date: 2026-06-25

## Current Gate Evidence - 2026-06-25

Current controller evidence is green for the shared workspace gates: `npm.cmd run verify` passed with lint, typecheck, 89 Vitest files / 737 tests, dependency-cruiser clean with 115 modules / 367 dependencies, and release readiness passed. `npm.cmd run test:e2e:maya-real` passed against `http://127.0.0.1:4318`, covered 4 Maya browser query scenarios, and recorded 32 backend trace rows.

Release readiness here means the command gate passed in the current shared workspace. Phase 0 reproducibility is not complete because the repo is still dirty/untracked with nothing staged; do not claim a commit-clean or reproducible release candidate until a clean branch/snapshot reruns these gates.

## Task 9 Real-Backend Evidence Update

Latest 2026-06-25 gate evidence supersedes the earlier blocked `recoup_src_sap` note for real-backend readiness. The Maya real-backend path is now green against the existing Express cockpit API, Supabase read-model/source rows, and the read-only SAP OData adapter. The real-backend acceptance harness also captures Beat 1 through Beat 12 screenshots without fixture API, Playwright route fulfillment, or dummy business data.

Source truth for `/forensics/shadcn`:

- Route data: the page loads `fetchForensicsModel()` and `fetchConnectorReadinessModel()` from `cockpit/app/cockpit-data.ts`, forwarding verified Maya human backend-read headers to Express API paths `/forensics` and `/connectors`.
- Supabase-backed fields: Maya KPI strip, worklist rows, selected evidence packet, recovery draft/read-only action inbox, retrieval status, and connector/source readiness values must come from governed backend/read-model data built from Supabase source readers and `recoup_src_*` evidence rows. Missing or invalid rows are unavailable, not fillable by UI copy.
- SAP-backed fields: SAP OData remains read-only; SAP-visible health/read plans are backend connector/source-health facts when configured. Current live `recoup_src_sap` contains 12 clean `sap-odata` rows for S1-S6 after removing the contradicted Harbor `90000005` cache rows. S7/S8 remain supported by Supabase-backed docs/TPM/bureau evidence and do not cite SAP evidence for the contradicted Harbor invoice.
- Agent-trace-backed fields: Query answer, citations, deterministic basis, and trace rows are backed by backend `POST /forensics/query`, deterministic hook trace events, and the live OpenAI Agents SDK Forensics Investigator -> Recovery Drafter handoff trace. Trace rows are not static UI rows, and raw model text remains suppressed from the visible business answer.
- Derived backend values: counts, tone/icon/status summaries, recommended action labels, draft/read-only approval posture, source readiness tone, and Beat 12 global Source Readiness are derived from backend/read-model fields such as `connectors.sourceTiles`, not local facet counters or static React constants.
- UI-only labels: tab labels, button labels, navigation labels, disabled/unavailable labels, and explicit backend-gap labels are presentational only. Business values, dollar amounts, record IDs, scores, decisions, approval/audit state, and source status must be backend/read-model fields or must render unavailable.

Known unavailable state:

- Live SAP read-back exposed an approved-source mismatch for Harbor invoice `90000005`: Supabase/owner mapping says `CUST-HARBOR -> USCU_S04`, while SAP header payload returned `SoldToParty=USCU_L02`. The stale Harbor SAP rows were deleted from `recoup_src_sap`, and runtime SAP source readers now reject any header row where `payload_json.d.SoldToParty` is missing or differs from any linked `USCU_*` provenance record.
- The SAP provisioner now fails before SQL output when diagnostics exist or expected SAP coverage is missing. It also validates returned `BillingDocument` and `SoldToParty` against the approved source link and directly retains `sapCustomerId` in `linked_record_ids`.
- S7/S8 have no current SAP evidence coverage by design until the owner/source mapping is reconciled or SAP supplies a matching invoice. They retain real Supabase docs/TPM/bureau source coverage.

Historical blocked controller error, now superseded by the live `recoup_src_sap` table and fail-closed Harbor cleanup:

```json
{ "error": "Supabase SAP source evidence rows are unavailable or failed validation.", "missingSource": "supabase-sap-source-evidence-rows", "sourceTableName": "recoup_src_sap", "correlationId": "0142c7c9-1c16-42f4-b64e-4d905f4e0331" }
```

Current live checks reach `POST /forensics/query`; the E2E compares backend trace rows against app response and rendered DOM rows.

Verification commands to record for the next real-backend gate:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run verify
npm.cmd run test:e2e:maya-real
```

Recent controller/subagent evidence: Task 7 added `package.json` script `test:e2e:maya-real` and `tests/e2e/maya-real-backend-e2e.ts`; the harness starts real-backend mode, records backend calls, rejects fixture API and Playwright route/fulfill fragments, checks `/forensics`, `/connectors`, `/forensics/work-items/:lineId`, and `/forensics/query`, and now captures real-backend Beat 1-through-12 screenshots under `output/playwright/e2e/real-backend/`. Fresh controller checks show `npm.cmd run test:e2e:maya-real` passed against `http://127.0.0.1:4318` and reached live-agent-backed backend query orchestration for 4 Maya browser query scenarios with 32 backend trace rows; SAP OData reported `Connected` in source readiness, while non-SAP Day-1 sources remained synthetic-labeled. Fresh focused SAP/Supabase bridge tests passed (`tests/unit/sap-supabase-evidence-provisioner.test.ts`, `tests/unit/supabase-memory.test.ts`, `tests/unit/enterprise-connectors.test.ts`). Fresh full `npm.cmd run verify` passed with lint, typecheck, 89 Vitest files / 737 tests, dependency-cruiser clean with 115 modules / 367 dependencies, and release readiness passed. Final reviewer gate reported P0/P1/P2 none for the mixed SAP-customer provenance fix; a later live-agent query boundary reviewer reported two P2s and both are closed by source-target handoff enforcement plus route-level run-control/fail-closed tests, and the subsequent protected-read reviewer findings are closed by server-rendered backend auth headers plus source-health live probe enforcement. The shared workspace still has dirty/untracked files with nothing staged, so Phase 0 reproducibility remains blocked.

## Current Acceptance Snapshot

The prior rejected-screenshot and `3/5` fidelity checkpoint is superseded. The current `/forensics/shadcn` evidence covers Beat 1 through Beat 12 in E2E, and Beat 12 return-to-worklist passed independent reviewer Maxwell with every component at `>=4.5/5` and overall `4.6/5`.

This acceptance is bounded to the implemented Maya shadcn route evidence. It does not create backend approval success, committed audit receipt state, queue mutation, case completion, or next-case assignment. Those remain explicit backend/read-model contract gaps until real backend fields and cited deterministic basis exist.

Future visual audit scores below `4.5/5` are not passable for this Maya shadcn bar. Historical `1/5`, `2/5`, `3/5`, and `4.0/5`-through-`4.4/5` notes remain useful failure history, not the current top-level status.

## Active Goal

Replace Maya's deduction-forensics cockpit with a shadcn-only, premium B2B SaaS command surface that follows the 12-beat Maya storyboard, uses backend/read-model facts only, preserves Recoup invariants, and does not compute or invent dollars, decisions, evidence, scores, thresholds, approvals, record IDs, audit state, or external-action status in React.

The active review route remains `/forensics/shadcn` until a separate cutover gate allows `/forensics` replacement.

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
- `output/playwright/e2e/real-backend/maya-real-backend-beat-01-login.png`
- `output/playwright/e2e/real-backend/maya-real-backend-beat-02-dashboard.png`
- `output/playwright/e2e/real-backend/maya-real-backend-beat-03-recommended-action.png`
- `output/playwright/e2e/real-backend/maya-real-backend-beat-04-case-overview.png`
- `output/playwright/e2e/real-backend/maya-real-backend-beat-05-evidence-dossier.png`
- `output/playwright/e2e/real-backend/maya-real-backend-beat-06-query-start.png`
- `output/playwright/e2e/real-backend/maya-real-backend-beat-07-agent-trace.png`
- `output/playwright/e2e/real-backend/maya-real-backend-beat-08-cited-answer.png`
- `output/playwright/e2e/real-backend/maya-real-backend-beat-09-draft-review.png`
- `output/playwright/e2e/real-backend/maya-real-backend-beat-10-human-approval.png`
- `output/playwright/e2e/real-backend/maya-real-backend-beat-11-audit-confirmation.png`
- `output/playwright/e2e/real-backend/maya-real-backend-beat-12-return-worklist.png`
- `output/playwright/e2e/real-backend/maya-real-backend-contact-sheet.png`

Current screenshot caveat: the `real-backend/` storyboard screenshot set is current E2E evidence for the implemented 12-beat Maya shadcn path. It is captured by `tests/e2e/maya-real-backend-e2e.ts` with real backend mode and no fixture/fulfillment path. Beat-level mockup deltas remain visual polish notes unless they contradict backend provenance fidelity.

## Beat 1 Login Pass

Status: implemented and committed at `9c26a7d` (`Rename Maya login capability label`). The old Beat 1 approval hold is superseded by the later 12-beat implementation path and chained E2E evidence.

Historical reviewer-facing assessment: final read-only review agent Averroes scored the early Beat 1 screenshot `4.1/5` with no blockers. Later E2E passes continued through Beat 12; any new Beat 1 visual polish should be handled as a follow-up, not as a blocker to proceeding through the storyboard chain.

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
- No current Beat 1-only stop condition is recorded in this handoff. The remaining deltas are visual/asset fidelity notes, not backend-truth gaps.

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

## Implemented Beat Evidence And Remaining Contract Gaps

- Beat 2 focused rebuild pass is implemented for the morning-run landing view. Maya routes to `/forensics/shadcn`; the page fetches `/forensics` and `/connectors`, renders the KPI strip and source readiness across the full workbench width, then splits into a table-led worklist plus right-side workspace starter.
- Fresh Beat 2 screenshot evidence exists at `output/playwright/e2e/maya-beat-02-dashboard.png`, plus focused 1440 and 1280 captures. The fresh independent reviewer verdict at `2a6f13c` failed at `4.3/5` overall, with remaining blockers in source readiness compression, KPI hierarchy, header metadata weight, worklist rhythm, and a user-reported sidebar rail height defect. The 2026-06-23 final-polish pass became a carried-forward acceptance candidate: the sidebar rail now fills the full captured page with the user identity/footer at the bottom of the full rail, header metadata is lighter while still exposing missing run-date/refresh contracts, the high-priority KPI gap is visually quiet, and source readiness is a much thinner one-row status rail that still shows all seven backend tiles with text+icon status semantics. Focused e2e now checks sidebar page-fill, bottom-aligned sidebar user identity, honest header metadata, source-label clipping, thin source-strip height, scan-friendly tile width, all seven backend source tiles, worklist title-backed clipping, single fetched-row footer rhythm, right-pane width, sidebar collapse/filter affordances, and 1440/1280 horizontal fit. Later progress continued through Beat 12; this older Beat 2 checkpoint is no longer a live stop condition.
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
- Beat 12 return-to-worklist is implemented for `/forensics/shadcn` only. The Audit tab now exposes an enabled `Return to worklist` control that clears only local opened-case state, keeps the returned fetched row locally focused, resets the viewport to the worklist top, and does not call refresh, approval, audit, query, SAP, ERP, Billing, correspondence, or external-action routes.
- Beat 12 remains honest to the current read model: the returned worklist renders only `worklist[]`, `kpiStrip[]`, and connector/source readiness data. It does not show mockup-only priority, age, status history, last-updated, queue totals, audit coverage, completion state, approved/audit-verified state, next-best-case ranking, backend refresh, or server pagination. The right pane labels the returned row as `Local focus` and shows `Audit status unavailable` with local-only copy.
- Beat 12 verification in this pass: RED source invariants first failed on missing local return wiring, then `npm.cmd run test -- tests/invariants/maya-shadcn-boundary.test.ts tests/invariants/cockpit-no-business-logic.test.ts` passed (2 files / 42 tests), `npm.cmd run typecheck` passed, `npm.cmd run test:e2e -- --maya-shadcn-only` passed after adding `captureMayaBeat12ReturnWorklistScreenshot`, refreshing `output/playwright/e2e/maya-beat-12-return-worklist.png`, and full `npm.cmd run verify` passed (lint, typecheck, 81 Vitest files / 599 tests, dependency-cruiser, release readiness).
- Current open items are backend/read-model gaps only: approval eligibility and reviewed-evidence state, verified human principal display, committed audit receipt fields, queue summary, next-case recommendation, row priority/age/status history/last-updated fields, and server pagination metadata.
- Unrelated dirty file remains: `cockpit/next-env.d.ts`. Leave it alone unless a future brief explicitly names it.
- Current broad full verification and real-backend Maya E2E are green; see the Task 9 Real-Backend Evidence Update and Verification Gates sections for the SAP/Supabase evidence closure details.
- Keep all displayed business truth backend/read-model sourced in future beats.
- Preserve visible cited record IDs, deterministic basis, evidence support, and HITL approval wherever decisions, answers, drafts, or audit states appear.

## Blockers

- Prior Beat 1 approval blocker is superseded by the user's 2026-06-23 approval to proceed and the completed Beat 1-through-12 E2E path.
- Historical real-backend E2E blocker: the earlier GET `/forensics` HTTP 503 with `missingSource=supabase-sap-source-evidence-rows` and `sourceTableName=recoup_src_sap` is superseded by the approved Supabase `recoup_src_sap` table and 12 clean `sap-odata` rows. Current caveat: S7/S8 SAP evidence remains fail-closed because the approved Harbor mapping conflicts with the live SAP customer; those lines retain non-SAP Supabase source evidence. Do not mutate Supabase, SAP, ERP, or any external database without explicit human approval.
- No external action, ERP write-back, approval dispatch, term/limit change, hold/freeze, Billing route, or correspondence may occur without the human approval gate.

## Next Actions

1. Beat 12 visual acceptance is recorded: independent reviewer Maxwell passed every component at `>=4.5/5` with `4.6/5` overall, while intentionally rendering local return/audit-unavailable state.
2. Keep Beat 11 fail-closed until a real backend approval response reaches the component with `status === "human_decided"` and a valid 64-hex `auditEntryHash`.
3. Do not invent previous hash, commit timestamp, approver, committed receipt record IDs, route completion, case closure, ERP update, Billing route, recovery dispatch, queue decrement, post-audit refresh, or next-case state. Those remain backend/read-model contract gaps.
4. A richer Beat 12 can only add true next-case recommendation, audit-recorded toast, completion counts, or updated row status after the backend exposes explicit fields with cited record IDs and deterministic basis.

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

Gate result: self-assessed component-level minimum met (`>=4.5/5`) with focused e2e clipping/overflow/page-fill assertions green and full `npm.cmd run verify` green. This is a historical Beat 2 checkpoint; current acceptance status is summarized at the top of this handoff.

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

Gate result: self-assessed component-level minimum met (`>=4.5/5`) with focused invariants, chained e2e, and full `npm.cmd run verify` green. This is a historical Beat 6 checkpoint; current acceptance status is summarized at the top of this handoff.

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

Gate result: self-assessed component-level minimum met (`>=4.5/5`) with focused invariants, chained e2e, and full `npm.cmd run verify` green. This is a historical Beat 7 checkpoint; current acceptance status is summarized at the top of this handoff.

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

Gate result: self-assessed component-level target met (`>=4.5/5`) with focused invariants, typecheck, chained Beat 6-8 e2e, and full `npm.cmd run verify` green. This is a historical Beat 8 checkpoint; current acceptance status is summarized at the top of this handoff.

## Beat 9 Remaining Deltas

- The current read model exposes `selected.draft.actionLabel`, `statusLabel`, `amount`, and `basis`, but it does not expose a separate packet display ID, created/updated timestamps, creator, recipient, approval owner, amount source, clamp detail, structured calculation rows, or audit-basis rows. The UI therefore omits those mockup facts or marks them as contract gaps.
- The current read model exposes selected worklist row labels and line IDs, not a dedicated case header with account mask, currency, vintage, buyer, ownership, or case name. The right rail uses only customer/scenario/line/queue/routing/verdict/evidence labels from the selected worklist row.
- Supporting evidence is a compact backend-field table over `selected.evidencePack.documents[]`; no event dates, file links, included checkmarks, owner/reviewer, or file-reference columns are rendered because those fields are not present.
- The bottom command bar maps available `selected.approvalActions[]` into local-only `Request changes`, `Reject draft`, and `Open approval` affordances. It is now anchored as a sticky first-viewport bottom surface before screenshot capture. Beat 9 does not mount the approval dialog, submit `/api/approval`, dispatch external actions, route to Billing, write ERP state, or create correspondence.
- The screenshot keeps the current opened-case/worklist route shape from Beats 4-8 rather than the mockup's dedicated breadcrumb/case route. Exact parity needs a future route/read-model contract for packet header metadata and case navigation.

## Beat 9 Component-Level Visual Gate

Target mockup:

- `mockups/imagegen/maya-12-beat-storyboard/09-draft-review-recovery-packet.png`

Fresh evidence:

- `output/playwright/e2e/maya-beat-09-draft-review.png`

| Component | Score | Concrete deltas |
|---|---:|---|
| Page title / HITL warning | 4.5/5 | `Recovery Draft Review`, `Human approval required`, and top warning are visible in the first viewport; breadcrumb and mockup case header slots remain unavailable in the current route/read model. |
| Draft packet panel | 4.6/5 | Packet status, draft label, status label, record IDs, deterministic basis, and `Draft only` state are backend-backed and dense; packet ID/timestamps/creator are intentionally absent. |
| Read-only amount | 4.7/5 | The backend draft amount is visually prominent, marked `aria-readonly`, and has no editable input or calculation UI; amount-source/clamp details remain a backend contract gap. |
| Supporting evidence table | 4.6/5 | Table rows render citation ID, document ID, type, relevance, description, summary, source, and verification from `selected.evidencePack.documents[]`; dates/files/included flags are omitted. |
| Case context rail | 4.5/5 | The rail uses selected worklist row customer, scenario, line, amount, queue, routing, verdict, evidence, draft gate/status/amount, evidence record IDs, available human decisions, and explicit backend gaps; exact mockup case/account/currency/vintage/buyer/owner slots are missing backend fields. |
| Bottom command bar | 4.6/5 | HITL posture is now visible as a sticky first-viewport bottom surface, buttons are derived from `selected.approvalActions[]`, and e2e clicks prove local-only prepared state with no forbidden requests; Beat 10 owns actual approval submission. |
| Overall Beat 9 visual fidelity | 4.6/5 | The screen now reads as a draft-review recovery packet with the reviewer visibility blocker fixed, while preserving no-fake-facts and pre-approval constraints. Remaining deltas are mostly backend/read-model contract gaps and route anatomy. |

Gate result: self-assessed component-level user threshold met (`>=4.5/5` all components) after the command-bar visibility fix. The current e2e guard asserts the command bar is inside the first viewport before screenshot capture. This is a historical Beat 9 checkpoint; current acceptance status is summarized at the top of this handoff.

Fresh command-bar visibility fix verification in this pass: `npm.cmd run typecheck` passed; `npm.cmd run test -- tests/invariants/maya-shadcn-boundary.test.ts tests/invariants/cockpit-no-business-logic.test.ts` passed (2 files / 40 tests); `npm.cmd run test:e2e -- --maya-shadcn-only` passed and refreshed `output/playwright/e2e/maya-beat-09-draft-review.png`; full `npm.cmd run verify` passed (lint, typecheck, 81 Vitest files / 597 tests, dependency-cruiser, release readiness).

## Beat 10 Remaining Deltas

- The current read model exposes `selected.approvalActions[]`, `selected.draft`, and `selected.evidencePack.recordIds/documents`, but it does not expose a stable evidence-reviewed state, reviewed count, approval eligibility, or verified human principal display contract. The dialog therefore opens as a human approval gate while all decision buttons remain disabled.
- The mockup's positive `Reviewed` row and `3 of 3` count are intentionally absent. Beat 10 renders `Approval blocked by missing eligibility` and `Evidence reviewed state and approval eligibility are unavailable in the current read model` instead.
- The approver row shows `Verified human principal unavailable` because the browser read model does not expose the backend-verified approval actor. The UI does not submit or edit an approver identity.
- The footer buttons are rendered only from backend `selected.approvalActions[]`: `approve` maps to `Approve`, `reject` maps to `Reject`, and `modify` maps to `Request changes`. The route does not add extra decisions.
- Opening the dialog, using the header close button, and using footer `Cancel` do not call `/api/approval` or any external action route. The guarded POST path remains in the component for a future enabled eligibility contract, but the current Beat 10 e2e never clicks an enabled submit button because none exists.

## Beat 10 Component-Level Visual Gate

Target mockup:

- `mockups/imagegen/maya-12-beat-storyboard/10-human-approval-dialog.png`

Fresh evidence:

- `output/playwright/e2e/maya-beat-10-human-approval.png`

| Component | Score | Concrete deltas |
|---|---:|---|
| Modal anatomy / overlay | 4.6/5 | Centered shadcn `AlertDialog` sits over a dimmed draft-review screen, with visible title, close affordance, dividers, compact rows, and no nested card. Width is slightly narrower than the mockup to preserve fit at the 1600x1024 e2e viewport. |
| HITL header and close affordance | 4.7/5 | Header states `Human approval required`, says opening does not dispatch anything, and uses `AlertDialogCancel asChild` with an icon-only `Button` for close. |
| Blocking eligibility state | 4.8/5 | The dialog honestly blocks submit because evidence-reviewed state and approval eligibility are unavailable; no `Reviewed`, reviewed count, fake approver, audit hash, or dispatch success is rendered. |
| Approver/action/status/basis/records rows | 4.6/5 | Rows use only backend draft label/status/basis and backend record IDs, with a visible approver contract gap. The action and basis text are somewhat repetitive because the current draft read model exposes only one deterministic basis string. |
| Note/reason field | 4.6/5 | `FieldGroup`, `Field`, `FieldLabel`, `Textarea`, visible `0 / 500` counter, and reason-required guidance are present. No secrets or PII are invited. |
| Decision footer | 4.7/5 | Buttons are derived from `approvalActions[]`, map to the required labels, stay disabled under the missing eligibility contract, and footer `Cancel` closes without posting. |
| Request/action guard | 4.8/5 | Focused e2e asserts open, header close, and footer cancel leave the forbidden request array empty, including no `/api/approval` call. |
| Overall Beat 10 visual fidelity | 4.6/5 | The screen matches the approval-gate moment while preserving contract honesty. The main intentional delta is the blocked reviewed-state copy instead of the mockup's successful evidence-reviewed row. |

Gate result: self-assessed component-level minimum met (`>=4.5/5`) with focused invariants, typecheck, chained shadcn-only e2e, and full `npm.cmd run verify` green.

Fresh Beat 10 verification in this pass: `npm.cmd run typecheck` passed; `npm.cmd run test -- tests/invariants/maya-shadcn-boundary.test.ts tests/invariants/cockpit-no-business-logic.test.ts` passed (2 files / 40 tests); `npm.cmd run test:e2e -- --maya-shadcn-only` passed and refreshed `output/playwright/e2e/maya-beat-10-human-approval.png`; full `npm.cmd run verify` passed (lint, typecheck, 81 Vitest files / 597 tests, dependency-cruiser, release readiness).

## Beat 11 Remaining Deltas

- Beat 11 is implemented for `/forensics/shadcn` only as an honest audit-confirmation unavailable state. This is intentional because Beat 10 currently cannot produce a real `ApprovalGateResponse`; approval submit buttons remain disabled while evidence-reviewed state and approval eligibility are absent from the read model.
- The Audit tab now renders a shadcn `Alert`, `Card`, `Table`, `Badge`, `Button`, `Separator`, and `Tooltip`-ready confirmation workspace. It does not render a successful audit receipt unless the component receives `status === "human_decided"` and an `auditEntryHash` matching `/^[a-fA-F0-9]{64}$/u`.
- The receipt/gap table includes rows for audit entry hash, previous hash, decision/action reference, decision outcome, human approver, committed timestamp, cited record IDs, and action state. Current values fail closed as `Unavailable`, `Waiting for committed backend approval response`, or `Backend contract gap`.
- Selected action label, selected draft status, deterministic basis, and selected evidence record IDs are shown only in a separate `Selected action context` section. The copy explicitly labels those IDs as selected action citations, not committed audit receipt citations.
- `View audit trail` remains disabled because no audit-route contract is exposed. `Return to worklist` is now enabled as a local-only Beat 12 navigation control; it clears the opened-case view and does not imply audit success, next-case assignment, case closure, ERP update, Billing route, recovery dispatch, or route completion state.
- A future confirmed branch is present but narrow: it displays the exact backend response action ID, decision, `human_decided` action state, and hash only after the response passes validation. Previous hash, approver, timestamp, and committed receipt record IDs remain unavailable until the backend/read model exposes them.

## Beat 11 Component-Level Visual Gate

Target mockup:

- `mockups/imagegen/maya-12-beat-storyboard/11-audit-confirmation.png`

Fresh evidence:

- `output/playwright/e2e/maya-beat-11-audit-confirmation.png`

| Component | Score | Concrete deltas |
|---|---:|---|
| Audit-state banner | 4.8/5 | Strong shadcn alert makes the blocked state explicit, names the required `status === human_decided` and valid 64-hex hash gate, and avoids mockup success copy while current backend data is unavailable. |
| Receipt/gap table | 4.7/5 | All required rows are present and table-led. Current values stay unavailable or contract-gap instead of inventing hashes, timestamps, approvers, receipt IDs, or action completion. |
| Selected action context | 4.6/5 | Backend-selected action label, draft status, basis, and record IDs are visible but separated from committed receipt rows and clearly labeled as selected action citations only. |
| Confirmed-state guard | 4.8/5 | Source invariants require the 64-hex regex, positive `human_decided` check, action ID validation, no local hash/date/random generation, and no `/api/approval` call from the audit panel. |
| Controls and action safety | 4.8/5 | Audit route remains disabled, while `Return to worklist` is an enabled local navigation control; there is no Next Case, no copy button for unavailable values, and no external action state. |
| Mockup fidelity under honest blocked state | 4.6/5 | The visual structure keeps the mockup's table-led audit workspace and sidebar/workbench continuity, but intentionally replaces success receipt styling with the current blocked contract state. |
| Overall Beat 11 visual fidelity | 4.7/5 | Passable for the current backend truth: dense, shadcn-only, read-model wired, and fail-closed. Exact mockup success parity remains blocked on a real committed approval response plus richer audit receipt fields. |

Gate result: self-assessed component-level minimum met (`>=4.5/5`) with focused invariants, typecheck, chained shadcn-only e2e, full-page screenshot evidence, and full `npm.cmd run verify` green.

Fresh Beat 11 verification in this pass: RED invariants first failed on missing audit-response handoff and missing validation/blocking source guarantees; `npm.cmd run typecheck` passed; `npm.cmd run test -- tests/invariants/maya-shadcn-boundary.test.ts tests/invariants/cockpit-no-business-logic.test.ts` passed (2 files / 40 tests); `npm.cmd run test:e2e -- --maya-shadcn-only` passed and refreshed `output/playwright/e2e/maya-beat-11-audit-confirmation.png`; full `npm.cmd run verify` passed (lint, typecheck, 81 Vitest files / 597 tests, dependency-cruiser, release readiness).

## Beat 12 Remaining Deltas

- The target mockup's successful `Audit recorded` toast, worklist total `128`, resolved recommended-next KPI, average age, audit coverage, priority values, age values, last-updated timestamps, server pagination, and row audit-state fields are intentionally absent or marked unavailable because the current read model does not expose them.
- The returned row remains the previously opened fetched row as local focus. Beat 12 does not auto-open a different row, infer a next-best case, reorder the queue, decrement fetched rows, or mark any row completed/approved/audit-verified.
- Beat 12 now returns to a dedicated full-width `Deduction Cases` worklist page rather than the morning-run dashboard/right-pane layout. It uses five metric cards, a toast-shaped `Audit status unavailable` alert, full source readiness row, tabs, dense worklist table, and a disabled fetched-only pagination footer.
- Exact mockup parity needs future backend fields such as queue summary, committed audit receipt state, nextRecommendedLineId with basis record IDs, row priority/age/status history/last-updated fields, and server pagination metadata.

## Beat 12 Component-Level Visual Gate

Target mockup:

- `mockups/imagegen/maya-12-beat-storyboard/12-return-to-worklist-next-case.png`

Fresh evidence:

- `output/playwright/e2e/maya-beat-12-return-worklist.png`

| Component | Score | Concrete deltas |
|---|---:|---|
| Return navigation / state reset | 4.8/5 | The Audit tab exposes an enabled shadcn `Return to worklist` control that clears only local opened-case state, resets the viewport to the worklist top, and triggers no backend or external-action requests. |
| First-viewport worklist composition | 4.6/5 | Sidebar, header, Worklist/return badges, five metric cards, toast-shaped unavailable audit state, full source readiness row, tabs, dense table, and footer pagination are visible in the returned viewport. |
| Worklist table / fetched rows | 4.5/5 | Rows continue to render from `worklist[]` only with backend line/customer/scenario/amount/verdict/queue/recommended-action strings; missing priority, age, last-updated, and pagination values are marked as gaps. |
| Local focus / selected row handling | 4.7/5 | The returned row keeps the previously opened fetched row as local focus and does not imply server-side selection, audit success, queue mutation, or next-case assignment. |
| KPI and source readiness honesty | 4.6/5 | Fetched row count and exposure use available read-model values; next-case, age, and audit coverage remain unavailable; source readiness remains `/connectors` data and synthetic/blocked state is not relabeled as live. |
| Request/action guard | 4.8/5 | The e2e path proves return from Beat 11 made no approval, query, realtime, SAP, ERP, Billing, portal, run, or external-action request. |
| Mockup fidelity under current truth | 4.5/5 | The screen reads as the intended return-to-worklist moment while honestly replacing mockup-only success/queue/age/audit/pagination fields with unavailable states. |
| Overall Beat 12 visual fidelity | 4.6/5 | Independent reviewer pass: shadcn-only, table-led, local navigation only, and no fake queue/audit/next-case claims. |

Gate result: independent reviewer Maxwell passed Beat 12 with every component at `>=4.5/5` and overall `4.6/5`. Prior reviewers failed earlier candidates at `4.1`, `4.2`, `4.4`, `4.35`, `4.3`, and `4.4`; those failures drove the full-width worklist redesign, full source row, first-viewport gap labeling, toast placement cleanup, denser table treatment, and fetched-only pagination footer. Fresh verification after the accepted candidate: `npm.cmd run typecheck` passed; `npm.cmd run test -- tests/invariants/maya-shadcn-boundary.test.ts tests/invariants/cockpit-no-business-logic.test.ts` passed (2 files / 42 tests); `npm.cmd run test:e2e -- --maya-shadcn-only` passed and refreshed `output/playwright/e2e/maya-beat-12-return-worklist.png`; full `npm.cmd run verify` passed (lint, typecheck, 81 Vitest files / 599 tests, dependency-cruiser, release readiness).

## Follow-Up Bands

- Documentation-only reconciliation for stale Maya shadcn completion language: complete in this pass.
- Backend/read-model enrichment for approval eligibility, committed audit receipts, queue mutation, and next-case state: future scoped implementation only after those contracts are specified.
- `/forensics` cutover from `/forensics/shadcn`: separate gated task, not implied by this documentation update.

## Verification Gates

Historical shadcn-only visual evidence:

- Beat 1-through-12 storyboard screenshots exist.
- Historical focused shadcn-only checks passed for typecheck, Maya boundary/business-logic invariants, and `npm.cmd run test:e2e -- --maya-shadcn-only`, refreshing `output/playwright/e2e/maya-beat-12-return-worklist.png`.
- `docs/storyboards/maya-12-beat-fidelity-review.md` records the Beat 12 Maxwell scorecard, screenshot paths, mockup paths, historical green shadcn-only gates, and unresolved backend-only deltas.

Current shared-workspace status:

- `npm.cmd run verify` passed on 2026-06-25 after protected-read auth, source-health, and backend trace fixes.
- The proof pack covered lint, typecheck, 89 Vitest files / 737 tests, dependency-cruiser clean with 115 modules / 367 dependencies, and release readiness.
- Current `npm.cmd run test:e2e:maya-real` passes against `http://127.0.0.1:4318` and reaches `POST /forensics/query` for 4 Maya browser query scenarios with 32 backend trace rows, including the live OpenAI Agents SDK Forensics Investigator -> Recovery Drafter handoff. The harness still rejects fixture API startup, Playwright route fulfillment, and dummy business-data acceptance.
- Phase 0 reproducibility is not complete: the repo remains dirty/untracked with nothing staged. Treat this as a blocker before any commit-clean or reproducible release-candidate claim.
- Supabase project `nmwfftudympcvcjtyjbf` now contains `public.recoup_src_sap` with 12 clean `sap-odata` rows for S1-S6. S7/S8 remain SAP-fail-closed because the approved Harbor/SAP customer mapping does not match the live SAP header; they retain docs/bureau evidence, plus TPM for S7.

Before claiming a broader cutover or backend-completion state:

- Re-run the relevant gates for that future change.
- Responsive screenshots exist for `/forensics/shadcn` or the accepted cutover route at 375, 768, 1024, and 1440 widths.
- If a full independent all-beat visual audit is required for cutover, record it explicitly; current independent acceptance evidence is Maxwell for Beat 12.
- No application code computes money, decisions, thresholds, evidence sufficiency, approval eligibility, audit state, or external-action status in the UI.
- Human approval remains required for every external action.

## Live-Data Caveat

The active implementation must handle missing live source data honestly. Current real-backend E2E is green for the implemented Maya journey, and Supabase `recoup_src_sap` provides live SAP OData evidence for S1-S6. SAP remains read-only. S7/S8 SAP evidence remains unavailable because the approved Harbor mapping conflicts with the live SAP customer, so those rows must stay fail-closed on SAP and use the available Supabase docs/bureau/TPM evidence rather than invented SAP coverage. Do not mutate Supabase, SAP, ERP, or any external database without explicit human approval.
