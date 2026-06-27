# External UI/UX Look-And-Feel Audit Brief

Date: 2026-06-26

Use this brief to ask an external model, designer, or QA reviewer to audit the Recoup Deduction Forensics cockpit as a production-grade agentic B2B SaaS experience.

The audit must be based on both source review and real-browser testing. Do not accept a source-only review as complete.

## Audit Priority

Spend at least 70% of the review on visual look and feel:

- visual hierarchy
- product polish
- color, typography, spacing, density
- affordance clarity
- screenshot quality
- premium enterprise SaaS feel
- whether the screen would impress a judge in 10 seconds

Functional wiring matters, but this audit exists because a functionally correct page can still look bland, grey, confusing, or debug-like.

## Product Bar

Recoup should feel like a premium analyst cockpit for deduction forensics:

- Dense but calm.
- Business-first, not backend-first.
- Agentic, but not debug-log-heavy.
- Source-backed, but not source-noisy.
- Clear verdict, clear selected case, clear next action.
- Raw IDs and technical trace details available on demand, not primary visual content.

Any screen below `4/5` is not production-ready. A `3/5` score means visual failure even if the feature works.

Mobile QA is deferred for this pass unless explicitly reopened. Desktop browser QA is required.

## Files To Provide To The Auditor

### Product And Contract Context

```text
AGENTS.md
INVARIANTS.md
O2C_Collections_Design_System_v3.md
tokens.css
tokens.json
docs/architecture/maya-agentic-forensics-technical-design.md
docs/qa/maya-12-beat-testing-storyboard.md
docs/qa/maya-real-backend-mcp-query-results.md
docs/qa/vercel-login-prod-baseline-2026-06-26.md
```

### Core Cockpit UI

```text
cockpit/app/layout.tsx
cockpit/app/styles.css
cockpit/app/login/page.tsx
cockpit/app/login/login-form.tsx
cockpit/app/cockpit-shell.tsx
cockpit/app/logout-button.tsx
cockpit/app/forensics/shadcn/page.tsx
cockpit/app/cockpit-data.ts
```

### Maya UI Components

```text
cockpit/components/maya/maya-forensics-surface.tsx
cockpit/components/maya/maya-workspace-shell.tsx
cockpit/components/maya/maya-run-kpi-strip.tsx
cockpit/components/maya/deduction-worklist-table.tsx
cockpit/components/maya/deduction-case-workspace.tsx
cockpit/components/maya/evidence-dossier.tsx
cockpit/components/maya/query-evidence-dock.tsx
cockpit/components/maya/agent-trace-panel.tsx
cockpit/components/maya/cited-answer-card.tsx
cockpit/components/maya/recovery-draft-review.tsx
cockpit/components/maya/approval-gate-dialog.tsx
cockpit/components/maya/audit-confirmation-panel.tsx
cockpit/components/maya/source-readiness-strip.tsx
cockpit/components/maya/types.ts
```

### Data And Auth Boundary

```text
config/cockpitDemoProfiles.ts
src/services/cockpitModel.ts
cockpit/app/api/demo-login/route.ts
cockpit/app/api/demo-logout/route.ts
cockpit/app/api/forensics/query/route.ts
cockpit/app/api/forensics/work-items/[lineId]/route.ts
cockpit/app/api/connectors/route.ts
cockpit/app/api/approval/route.ts
cockpit/app/backend-read-auth.ts
cockpit/app/demo-auth.ts
```

### Automated Test Evidence

```text
tests/e2e/cockpit-premium-e2e.ts
tests/e2e/maya-real-backend-e2e.ts
tests/invariants/cockpit-no-business-logic.test.ts
tests/invariants/maya-shadcn-qa-contract.test.ts
tests/invariants/maya-real-backend-contract.test.ts
tests/invariants/cockpit-v12-premium-components.test.ts
```

### Screenshot Artifacts

```text
output/playwright/e2e/
output/playwright/e2e/real-backend/
output/playwright/prod-vercel-login-baseline/
output/playwright/prod-vercel-login-after-env/
```

If screenshots are stale or missing, the auditor must recapture them from the running app before scoring.

## Real Browser Testing Setup

### 1. Confirm Repo Health

```powershell
git status -sb
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build:cockpit
```

### 2. Confirm Production Login Timing

```powershell
curl.exe -L -s -o NUL -w "status=%{http_code} ttfb=%{time_starttransfer} total=%{time_total}`n" https://recoup-self-eta.vercel.app/login
```

Expected current behavior:

- `/login` returns `200`.
- First-byte time should not reproduce the previous 60+ second cold path.
- `/api/demo-login` should not return `503`.

### 3. Real Browser Flow

Use Playwright, Chrome DevTools, or the Codex in-app browser.

Test this flow:

```text
1. Open https://recoup-self-eta.vercel.app/login
2. Capture screenshot.
3. Login as Maya using the configured demo password from environment. Do not paste secrets into the audit report.
4. Confirm /api/demo-login returns 200.
5. Confirm browser lands on /forensics/shadcn.
6. Capture the landing page.
7. Navigate each major surface and capture screenshots.
8. Open one worklist row.
9. Test Overview, Evidence, Agent Trace, Draft, and Audit tabs.
10. Open Query dock.
11. Submit at least one query if live backend credentials are available.
12. Open Evidence source details and Agent Trace details.
13. Open Approval dialog.
14. Test Logout.
15. Record console errors, failed network calls, slow requests, and visual issues.
```

### 4. Automated Browser Checks

```powershell
npm.cmd run test:e2e -- --maya-shadcn-only
npm.cmd run test:e2e:maya-real
```

Do not treat passing tests as a visual pass. Tests prove wiring and regressions; the audit must still score visual quality from screenshots and direct browser use.

## Screens To Score

Score every item from `1` to `5`.

```text
/login
/forensics/shadcn initial landing
Overview
Worklist
Cases
Evidence
Approvals
Case detail header
Line selector
Evidence dossier
Query drawer/dock
Agent Trace
Draft review
Approval dialog
Audit panel
Sidebar expanded/collapsed
Logout/session area
Loading states
Empty states
Error states
Disabled states
```

## Visual Scoring Rubric

For each screen, score these dimensions:

| Dimension | What To Judge |
|---|---|
| Visual hierarchy | Can the user instantly identify page purpose, selected case, verdict, amount, and next action? |
| Layout composition | Density, scan path, alignment, whitespace, section grouping, no awkward empty zones. |
| Color system | Avoids grey-on-grey blandness; uses semantic contrast; does not look like default Tailwind. |
| Typography | Clear scale, readable tables, label hierarchy, line-height, no cramped or washed-out text. |
| Surface quality | Cards, borders, radius, dividers, shadows, drawers, and panels feel intentional and restrained. |
| Affordance | Static badges, selected states, clickable controls, tabs, chips, and disabled controls are visually distinct. |
| Agentic explainability | Maya's agent work feels trustworthy and business-readable, not like backend logs. |
| Interaction polish | Hover, focus, pressed, loading, selected, expanded/collapsed, and error states feel designed. |
| Brand consistency | Login, sidebar, workbench, drawers, and dialogs feel like one product. |
| Judge impact | The screen would impress a hackathon judge within 10 seconds. |

## Audit Output Format

The auditor must return this structure:

```text
# Recoup UI/UX Look-And-Feel Audit

## Executive Verdict
- Overall score:
- Production visual readiness: PASS / FAIL
- Highest-risk visual issue:
- Highest-ROI fix:

## Screen Scorecard
| Screen | Score | Pass/Fail | Top Issue | Evidence |
|---|---:|---|---|---|

## P0 Findings
Findings that block a production visual pass.

## P1 Findings
High-impact visual/interaction issues that should be fixed before judging/demo.

## P2 Findings
Polish improvements.

## Component-Level Findings
Include file references and browser reproduction steps.

## Real Browser Evidence
- URL tested:
- Browser:
- Viewport:
- Console errors:
- Network failures:
- Screenshots captured:
- Tests run:

## Recommended Fix Plan
For each fix:
- Component/file
- Visual issue
- Specific Tailwind/CSS/layout change
- Expected screenshot improvement
- Regression test or browser check
```

## External Auditor Prompt

Copy this prompt into the external model:

```text
Act as a Principal UX/UI Auditor, Visual Design Director, and Frontend QA Engineer.

Audit Recoup Deduction Forensics as a production-grade B2B SaaS agentic cockpit. Review the provided source files, screenshots, design-system tokens, and docs. Then run real-browser testing against https://recoup-self-eta.vercel.app.

Do not only audit functionality. Spend at least 70% of the review on visual look and feel.

Judge whether Recoup feels like a premium enterprise SaaS deduction-forensics cockpit, not a generic AI dashboard and not a backend debug report.

Focus on:
1. Visual hierarchy: can the user instantly identify page purpose, selected case, verdict, money, and next action?
2. Layout composition: density, alignment, whitespace, scan path, and whether there are awkward empty zones.
3. Color system: whether the UI avoids grey-on-grey blandness and uses semantic, premium contrast.
4. Typography: size scale, weight hierarchy, line-height, table readability, and label clarity.
5. Surface quality: cards, borders, shadows, dividers, radius, nested-card avoidance, drawer quality.
6. Affordance: static badges vs clickable actions vs tabs vs selected states must be visually distinct.
7. Agentic feel: Maya should look useful and trustworthy, not like debug logs or backend plumbing.
8. Production polish: hover, focus, selected, loading, empty, disabled, expanded/collapsed, and error states.
9. Brand consistency: Recoup identity, login, sidebar, workbench, drawers, and dialogs should feel like one system.
10. Judge impact: would this screen impress a hackathon judge in 10 seconds?

Also verify:
- /login loads quickly and /api/demo-login returns 200.
- The browser lands on /forensics/shadcn after login.
- No console errors.
- No failed network calls.
- No fake/static business values are introduced in the UI.
- Backend plumbing, raw IDs, SAP/internal names, and trace details are not primary visual content unless intentionally expanded.

Score every major screen from 1 to 5:
- /login
- /forensics/shadcn initial landing
- Overview
- Worklist
- Cases
- Evidence
- Approvals
- Case detail header
- Line selector
- Evidence dossier
- Query drawer/dock
- Agent Trace
- Draft review
- Approval dialog
- Audit panel
- Sidebar expanded/collapsed
- Logout/session area
- Loading, empty, error, and disabled states

Any screen below 4/5 is not production-ready. A 3/5 score is a visual failure even if functionality works.

Return:
1. Executive verdict.
2. Screen scorecard.
3. Findings ordered P0/P1/P2.
4. File/line references where possible.
5. Browser reproduction steps.
6. Screenshot evidence.
7. Specific Tailwind/CSS/component changes.
8. What to remove.
9. What to emphasize.
10. A final pass/fail recommendation for demo/judging readiness.

Do not suggest backend business-logic changes unless a UI issue proves a contract gap. Keep the audit focused on UI/UX, look and feel, interaction quality, and visual production readiness.
```

## Reviewer Notes

- Do not mark a route passed only because automated tests pass.
- Do not accept screenshots without matching browser interaction notes.
- Do not accept a review that ignores colors, typography, spacing, density, and visual hierarchy.
- Do not accept a review that only says "modernize UI" without component-level fixes.
- Do not accept invented data, fake stats, or visual changes that alter backend-owned business values.
