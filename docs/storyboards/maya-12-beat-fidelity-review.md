# Maya 12-Beat Fidelity Review

Status: E2E evidence captured; visual fidelity remains pending.

Date: 2026-06-23

## Evidence Reviewed

Runtime screenshots:

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

Reference mockups:

- `mockups/imagegen/maya-12-beat-storyboard/contact-sheet.png`
- `mockups/imagegen/maya-12-beat-storyboard/01-login-maya-enters-recoup.png`
- `mockups/imagegen/maya-12-beat-storyboard/02-workspace-morning-run-summary.png`
- `mockups/imagegen/maya-12-beat-storyboard/06-query-dock-start.png`
- `mockups/imagegen/maya-12-beat-storyboard/10-human-approval-dialog.png`
- `mockups/imagegen/maya-12-beat-storyboard/11-audit-confirmation.png`

## Verification Result

`npm run test:e2e` passed and generated the runtime screenshot set. The route now reaches `/forensics/shadcn`; old `/forensics` auth and route coverage remain in the E2E path.

The visual score is **3/5**. This is not passable for cutover under the cockpit UI anti-slop standard, but it is a valid evidence checkpoint for the Phase 7 shadcn route.

## What Matches

- The 12-beat path exists from login through worklist, selected case, evidence, query, trace, draft, approval, audit, and return.
- Business values, record IDs, evidence rows, source labels, draft action IDs, and amounts render from the backend/read model.
- The query dock is case-bound and shows citation chips before the question input.
- The approval dialog is human-gated, requires reasons for modify/reject, and does not imply external dispatch.
- The audit beat is honest: it says no approval response is recorded until the human-gated approval API returns.

## Remaining Visual Deltas

- The reference uses a persistent left sidebar and command-surface navigation; runtime still uses a top header with route chips.
- The reference puts a dense worklist and case workspace in the first viewport; runtime source-readiness cards dominate the page before the worklist.
- The query sheet renders correctly, but the page beneath it is still the source-readiness/worklist scroll position rather than an evidence-first case pane.
- Approval and audit states are functionally honest, but they do not yet match the reference composition with a compact draft review pane and committed audit confirmation.
- Beat 12 currently repeats the audit-pending view instead of showing an updated worklist, audit toast, and next-case focus.

## Next Pass

- Rework the first viewport around a persistent Maya sidebar, compact KPI/source strip, worklist table, and selected-case pane.
- Move source readiness to a compact rail or secondary section so it does not displace the worklist.
- Make the storyboard capture steps scroll to the active pane before each screenshot.
- Add a backend-backed approval/audit demo state only if the E2E can perform the human approval POST safely in the test fixture.
