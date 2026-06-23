# Maya 12-Beat Fidelity Review

Status: Beat 1-through-12 E2E evidence captured; Beat 12 accepted by independent reviewer Maxwell.

Date: 2026-06-24

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

## Verification Result

The old `3/5` visual-fidelity checkpoint is superseded. Current evidence records a completed Beat 1-through-12 E2E path on `/forensics/shadcn`, with Beat 12 accepted by independent reviewer Maxwell at `4.6/5` overall and every reviewed component at `>=4.5/5`.

Fresh verification after the accepted Beat 12 candidate:

- `npm.cmd run typecheck` passed.
- `npm.cmd run test -- tests/invariants/maya-shadcn-boundary.test.ts tests/invariants/cockpit-no-business-logic.test.ts` passed (2 files / 42 tests).
- `npm.cmd run test:e2e -- --maya-shadcn-only` passed and refreshed `output/playwright/e2e/maya-beat-12-return-worklist.png`.
- Full `npm.cmd run verify` passed with lint, typecheck, 81 Vitest files / 599 tests, dependency-cruiser, and release readiness.

## Accepted Current State

- The 12-beat path exists from login through worklist, selected case, evidence, query, trace, draft review, approval gate, audit unavailable state, and return-to-worklist.
- Business values, dollars, verdicts, evidence labels, record IDs, approval actions, and audit labels remain backend/read-model or API data.
- Beat 10 remains a human approval gate with submit disabled when approval eligibility and evidence-reviewed state are unavailable.
- Beat 11 remains fail-closed unless a real backend approval response has `status === "human_decided"` and a valid 64-hex `auditEntryHash`.
- Beat 12 returns to a local worklist view without claiming audit success, queue mutation, case completion, approval, ERP write-back, Billing route, recovery dispatch, or next-case assignment.

## Maxwell Beat 12 Scorecard

| Component | Score | Current accepted basis |
|---|---:|---|
| Return navigation / state reset | 4.8/5 | `Return to worklist` clears only local opened-case state, resets the viewport to the worklist top, and triggers no backend or external-action requests. |
| First-viewport worklist composition | 4.6/5 | Sidebar, header, Worklist/return badges, five metric cards, toast-shaped unavailable audit state, full source readiness row, tabs, dense table, and footer pagination are visible. |
| Worklist table / fetched rows | 4.5/5 | Rows render from `worklist[]` only with backend line/customer/scenario/amount/verdict/queue/recommended-action strings; missing priority, age, last-updated, and pagination values stay marked as gaps. |
| Local focus / selected row handling | 4.7/5 | The returned row keeps the previously opened fetched row as local focus and does not imply server-side selection, audit success, queue mutation, or next-case assignment. |
| KPI and source readiness honesty | 4.6/5 | Fetched row count and exposure use available read-model values; next-case, age, and audit coverage remain unavailable; source readiness remains `/connectors` data and synthetic/blocked state is not relabeled as live. |
| Request/action guard | 4.8/5 | The E2E path proves return from Beat 11 made no approval, query, realtime, SAP, ERP, Billing, portal, run, or external-action request. |
| Mockup fidelity under current truth | 4.5/5 | The screen reads as the intended return-to-worklist moment while replacing mockup-only success/queue/age/audit/pagination fields with unavailable states. |
| Overall Beat 12 visual fidelity | 4.6/5 | Independent reviewer pass: shadcn-only, table-led, local navigation only, and no fake queue/audit/next-case claims. |

## Remaining Backend-Only Gaps

- No committed approval/audit receipt is exposed to Beat 11 or Beat 12 yet: previous hash, committed timestamp, verified approver, committed receipt record IDs, and audit-route link remain unavailable.
- No approval eligibility, reviewed-evidence state, reviewed count, or verified human principal display contract is exposed to the current dialog.
- No queue mutation, completed/approved/audit-verified row state, server-side next-case assignment, or nextRecommendedLineId with cited deterministic basis is exposed.
- No worklist priority, age, status history, last-updated, queue summary, audit coverage, or server pagination metadata is exposed.
- No richer draft packet fields such as display packet ID, created/updated timestamps, creator, recipient, amount source, clamp detail, structured calculation rows, or audit-basis rows are exposed.
- Supabase live source data must remain honest; do not mutate Supabase, SAP, ERP, or any external database to fill gaps without explicit human approval.

## Non-Claims

This review does not claim fake audit success, external dispatch, ERP write-back, approval completion, recovery completion, Billing routing, queue mutation, or next-case state. Those behaviors require backend/read-model support with cited record IDs, deterministic basis, and the human approval gate.
