# Recoup UI/UX Journey Map - 2026-06-22

Status: design and verification plan only. No cockpit app-code implementation has started for this correction slice.

## Overall Status

| Area | Current Finding | Target Correction | Gate |
|---|---|---|---|
| Login | Current product entry is not premium enough; connector/source health on login is distracting. | Simple secure sign-in with persona shortcuts only; no SAP/Supabase/source-health copy before authentication. | Browser visual check plus human approval. |
| Maya | Current worklist behaves static; one selected item is shown but other work items are not a real journey. | Full worklist first, selectable rows, then collapsed worklist rail plus supporting docs and deterministic basis pane. | Mouse and keyboard selection tests across multiple work items. |
| David | Current credit pages have inert buttons and weak exception-to-evidence journey. | Selectable exception list, account evidence pane, compact analytics cards, guarded human approval footer. | Verify view/simulate controls open visible read-only detail; action packet remains HITL gated. |
| CFO | Current page reads more like static readout than proof navigation. | Executive proof board with compact analytics cards, dependency/proof rows, and separate connector detail/source-health surface. | Verify row selection opens read-only detail; no connector status mixed into business KPI cards. |
| Source Status | Current labels can imply "to be set up" or overclaim live readiness. | SAP: "SAP OData accessible" only when read-only OData credentials are configured. Non-SAP tool data: "Supabase tools data available" when schema probe/read model supports it. | Connector tests plus UI assertions that no raw "Setup"/"Needs setup" appears when accessible. |
| Visual Mockups | First ImageGen outputs were rejected due garbled text and fake-looking values. | Deterministic HTML/CSS mockups with controlled copy and exported screenshots. | Compare runtime screenshots against deterministic mockups, not against hallucinated ImageGen text. |
| Human Verification | Previously pass/fail could be agent-only. | Human verification is required before UI/UX route is marked passed. | User explicitly approves live browser journey before pass. |

## Mockup Artifacts

| Artifact | Purpose |
|---|---|
| `mockups/recoup-simple-journey-rework.html` | Deterministic screenbook for login, Maya, David, and CFO target flows. |
| `mockups/recoup-simple-journey-rework.css` | Token-based styling for the deterministic mockups. |
| `mockups/rework-screenshots/recoup-rework-login-2026-06-22.png` | Login target: clean sign-in with persona shortcuts, no connector labels. |
| `mockups/rework-screenshots/recoup-rework-maya-2026-06-22.png` | Maya target: analytics, full worklist, selected item, collapsed rail, supporting docs. |
| `mockups/rework-screenshots/recoup-rework-david-2026-06-22.png` | David target: analytics, exception list, evidence pane, guarded action footer. |
| `mockups/rework-screenshots/recoup-rework-cfo-2026-06-22.png` | CFO target: analytics, proof rows, connector detail separate from business metrics. |

## Target Journeys

### Login

1. User lands on `/login`.
2. Page shows Recoup brand, a focused sign-in form, and persona shortcuts.
3. Page does not show SAP, Supabase, connector, source-health, hash, schema, or raw tool labels.
4. User enters a valid demo identity and password.
5. Successful login routes the user to the role default route.
6. Invalid login shows a local auth error without leaking backend details.

### Maya

1. Maya signs in and sees a welcome header, compact analytics cards, and the Worklist navigation selected.
2. Clicking Worklist displays the full deduction worklist.
3. Clicking a work item selects it, preserves the list context, and updates the detail pane.
4. Once an item is selected, the worklist can collapse to a left rail while supporting docs and deterministic basis open on the right.
5. Supporting document rows open/read visible evidence state.
6. Approval actions stay disabled or visibly HITL gated until evidence is reviewed.
7. UI displays cited read-model facts only; it does not compute dollars, verdicts, or statuses in React.

### David

1. David signs in and sees compact credit analytics plus a selectable exception list.
2. Selecting an exception updates the account evidence pane.
3. `Inspect basis` opens read-only deterministic basis detail.
4. `Simulate alternatives` opens a read-only comparison/detail state and does not dispatch anything.
5. `Send action packet` remains guarded by HITL and cannot silently create an external action.
6. Source status is present in a collapsible/source-health area, not as business KPI proof.

### CFO

1. CFO signs in and sees a read-only executive proof board.
2. Top analytics cards summarize proof posture and control state without invented values.
3. Clicking dependency/proof rows updates the connector/audit detail pane.
4. Source health is a separate detail/tab/surface and is not confused with cockpit business KPIs.
5. CFO cannot approve recovery, credit, or external action packets from the read-only view.

## Button-by-Button Test Scenarios

| Scenario | Steps | Expected Result |
|---|---|---|
| Login visual | Open `/login` at `127.0.0.1:3000`. | Form is visible; no connector/source-health labels on login. |
| Login auth failure | Submit invalid credentials. | Error appears; no route transition; no secret details shown. |
| Maya default route | Login as Maya. | Route lands on Maya default; Worklist/Forensics route is active. |
| Maya worklist selection | Select at least three work items by mouse. | Selected row changes; detail/evidence pane updates; previous selection is not hardcoded. |
| Maya keyboard selection | Tab to worklist rows and activate with Enter/Space. | Focus is visible; selection updates; no layout jump. |
| Maya supporting docs | Open supporting docs for selected item. | Supporting docs render in right pane with record/evidence labels sourced from read model. |
| Maya HITL guard | Attempt approval before evidence reviewed. | Approval remains disabled or shows explicit HITL gate; no external action dispatch. |
| David default route | Login as David. | Credit exceptions route is active and command/D5 route is discoverable if retained. |
| David exception selection | Select Harbor, Crestline, and NorthBay rows. | Account evidence and action footer update for the selected item. |
| David read-only controls | Click `Inspect basis` and `Simulate alternatives`. | Detail/drawer/state opens; no external write or packet dispatch occurs. |
| David HITL guard | Click or inspect `Send action packet`. | It is guarded by approval state; no silent dispatch. |
| CFO default route | Login as CFO. | Executive proof board is active and read-only. |
| CFO proof rows | Select SAP, Supabase, Audit chain, and Open gaps rows. | Right detail pane updates with readable basis/status text. |
| Source readiness | Open authenticated source-health/governance surface. | SAP reads as OData-accessible when configured; non-SAP tool data reads as Supabase-backed when available; raw `Setup`, `ToolStatusRail`, and backend enum labels are not primary UI. |
| Route isolation | Try to visit another persona route directly. | Unauthorized route redirects or blocks according to signed demo session role. |
| Browser parity | Test via `127.0.0.1` and verify whether `localhost` still shows the hidden streaming/loading issue. | Either both render, or the localhost root cause is documented and browser tests standardize on `127.0.0.1`. |
| Human verification | User walks through login, Maya, David, CFO in the in-app browser. | UI/UX route is not marked pass until user acceptance is recorded. |

## Implementation Notes For Next Slice

- Keep login clean: no connector rail, no schema proof, no source-health copy before auth.
- Keep persona pages simple but not empty: analytics bands should use existing read-model/API values only.
- Worklist and exception rows should be real buttons/links with `aria-selected`, keyboard focus, and deterministic selection state.
- Source readiness copy should be model-owned, not component-invented. Use labels such as `SAP OData accessible`, `Supabase tools data available`, `Schema probe basis`, `Live contract deferred`, and `External actions blocked` where supported by the connector model.
- Avoid calling synthetic/demo source data fully "online" unless the backend has performed a real live probe.
- Do not click real approval/dispatch actions during browser tests without explicit user approval.
- After implementation, run focused unit/invariant tests, then browser journey tests, then ask for human verification before closing UI/UX.

## ETA And Long-Running Action Rule

| Activity | Expected Window | Long-Run Root Cause Check |
|---|---:|---|
| Deterministic mockup/doc updates | 10-20 minutes | If export hangs, check Playwright/browser process or locked output path. |
| Focused UI implementation slice | 45-90 minutes | If longer, inspect route data contracts before editing more UI. |
| Focused tests | 10-25 minutes | If longer, identify slow suite/test file before broad retries. |
| Browser journey verification | 20-40 minutes | If blocked, distinguish app server, auth/session, and Browser runtime causes. |
| Full verify | 5-15 minutes historically, can vary | If longer, capture failing phase and stop broad loops. |

Progress reporting rule: update `docs/vscode-handoff-status.md` before any status report that changes scope, evidence, or pass/fail state.
