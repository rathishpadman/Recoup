# David Shadcn Execution Package

Status: execution package for owner/reviewer approval.

Scope: David credit persona only. This package covers the future shadcn review surfaces for David credit arbitration and command-center workflows. It does not authorize a cutover from the current routes.

Non-goal: no frontend implementation, screenshots, tests, or backend changes are authorized by this document. It defines the execution summary, data rules, route boundaries, methodology, and implementation/reviewer checklists for the later shadcn build.

## 1. Route And Cutover Position

David shadcn work must land behind new review routes first:

| Surface | Future Review Route | Existing Route Status | Cutover Rule |
|---|---|---|---|
| Credit arbitration workstation | `/credit/shadcn` | `/credit` remains the default David route | Do not replace `/credit` until explicit owner cutover approval. |
| David command center | `/credit/command/shadcn` if approved | `/credit/command` remains intact | Use only if the command route is in scope for the slice. |

The David default route remains `/credit` until approved cutover. The existing `/credit` and `/credit/command` pages may be used as behavioral references only; the new shadcn surfaces must not import or compose their bespoke shell, premium widgets, CSS-module command shell, or Phosphor icon stack.

## 2. Source Of Truth

The source of truth is backend/API/read-model data, especially `CreditCockpitModel` loaded through `fetchCreditModel()`.

Real-backend execution rule: David shadcn must follow the Maya hardening lesson in `docs/superpowers/plans/2026-06-24-maya-real-backend-agentic-hardening.md`. A value is acceptable only when it is one of these:

- A field already present in `CreditCockpitModel` or another approved backend/API read model.
- A backend-derived value that carries cited record IDs and deterministic basis.
- A source-health value returned by a backend connector/readiness endpoint with `checkedAt`, source mode, status, and proof.
- Local UI state with no business meaning, such as selected tab, drawer open state, or typed human note before submit.

If a value does not meet one of those conditions, David shadcn must render `Contract gap` or `Source unavailable`. It must not use fixture, mock, hardcoded, generated, placeholder, or guessed business data to make the page look complete.

Display-only read-model inputs currently include:

| Read-Model Area | Display Usage | Must Not Compute In React |
|---|---|---|
| `account` | Account identity, posture, detail rows, summary rows | Credit exposure, available credit, terms, order amount, posture. |
| `sentinel` | Alert reason, source details, signals, cited record IDs | Lien status, risk reason, source state, evidence sufficiency. |
| `arbitration` | Status, display reason, cited record IDs | Arbitration outcome, calibration block, decision readiness. |
| `partialHold` | Score readout, release readout, split rows, ledger rows, criteria | Scores, weights, weighted contribution, release ratio, dollar split. |
| `termProposal` | Draft terms packet, status label, basis, command labels | Terms, eligibility, ready state, approval status. |
| `approvalInbox` | Human decision rows and cited records | Action eligibility, external-action state, audit finality. |
| `actionQueue` | Queue rows and status labels | Priority, age, next step, status. |
| `audit` | Hash-chain labels and validity | Audit hash, audit status, entry count. |
| `negotiation` | Risk Mesh position/timeline readout | Deterministic basis, decision-like row meaning, arbitration weight policy. |
| `commandCenter` | Portfolio command readout | Portfolio metrics, source status, alert counts, audit posture. |

Allowed React local state:

- Selected row or active account pane.
- Active tab.
- Drawer, sheet, dialog, or popover open state.
- Filter/search controls and transient input.
- Sort display state when sorting only reorders already-fetched rows.
- Hover/focus state, sidebar collapse, density toggle, and short-lived presentation affordances.
- Human note text before submission.

Banned React local state:

- Dollars, thresholds, scores, weights, terms, decisions, record IDs, audit state, approval eligibility, source status, source provenance, action status, or external dispatch state.
- Any fallback fixture for Harbor, Risk Mesh, bureau, SAP, ERP, Billing, audit hashes, approval IDs, or action IDs.
- Any inferred decision-like label derived from UI text, color, icon, position, or local selection.

Banned data sources in real-backend review:

- Fixture API responses.
- Playwright `page.route` fulfillment for app API, SAP, ERP, Billing, approval, action, query, or audit endpoints.
- Static JSON embedded in React components.
- Hardcoded timestamps such as "Refreshed 08:24 AM".
- Hardcoded source counts, source status labels, source modes, or connector proof.
- Static agent/assistant trace rows that were not emitted by the backend.
- Any customer/account/action/audit identifier introduced only to satisfy layout.

## 3. No-Invention Rules

David shadcn surfaces must not invent or recompute:

- Dollars or money-derived values.
- Thresholds, weights, scores, score contributions, split ratios, or release amounts.
- Terms, term proposals, action packet readiness, or approval eligibility.
- Risk Mesh decisions, arbitration outcomes, action states, or audit status.
- Source status, connector readiness, SAP/ERP/Billing status, source provenance, or live/synthetic classification.
- Record IDs, action IDs, approval IDs, audit hashes, customer IDs, order IDs, filing IDs, or case IDs.

If the read model does not expose a value, render a compact `Contract gap` state or extend the read model in a separate approved backend/API slice. Do not patch the gap with frontend constants.

Every business-facing field must be reviewable back to its source. The reviewer must be able to answer: which backend field produced it, which source records support it, what deterministic basis explains it, and whether it came from Supabase/read model, SAP/ERP/Billing/source health, Risk Mesh/arbitration, approval/audit response, or live agent trace.

## 3.1 Real Backend Wiring Gate

This package does not allow a static David shadcn build. Before any visual approval, create or update a David data-provenance matrix with one row per visible business field.

Required matrix columns:

| Column | Meaning |
|---|---|
| Beat | David beat number. |
| Component | Route/component rendering the field. |
| Visible field | Exact UI value or label class. |
| Backend source | `CreditCockpitModel` path or approved endpoint response path. |
| System of record | Supabase/read model, SAP, ERP, Billing, bureau, Risk Mesh, approval, audit, or agent trace. |
| Record IDs | IDs cited by the backend. |
| Deterministic basis | Backend basis string or explicit `Contract gap`. |
| Fallback behavior | Must be `fail closed`, `Contract gap`, or `Source unavailable`; never fake data. |

Minimum route/API requirements:

- `/credit/shadcn` must load through `fetchCreditModel()` and must not contain component-local business fixtures.
- `/credit/command/shadcn`, if built, must load through `fetchCreditModel()` or an approved backend command read model.
- Source/SAP/ERP/Billing status must come from backend connector/readiness/source-health fields with checked time and proof. The UI must not convert absence of errors into "Connected".
- Approval and audit state after a human decision must come from the backend response or refreshed backend model, not optimistic React state.
- Any agentic/query/assistant panel for David must render backend-emitted trace or response rows only. Static "agent" rows are not permitted.

## 4. Risk Mesh Deterministic-Basis Rule

Risk Mesh rows are decision-like UI only when each row has cited record IDs and deterministic basis. Current `model.negotiation.nodes` expose function name, display name, position, weight, confidence band, and record IDs, but not a dedicated deterministic-basis field.

Execution rule:

1. If a David shadcn row presents a Risk Mesh position as a decision, rationale, recommendation, or resolved function position, it must render deterministic basis from the read model.
2. If `model.negotiation.nodes` do not expose deterministic basis, the implementer must either extend `CreditCockpitModel` and the API/read model in an approved slice or render a visible `Contract gap` state for that basis.
3. Until that basis exists, nodes may be shown as read-model positions with cited records only, not as final decisions or approval-ready reasoning.
4. Arbitration P&L weights remain expert-owned. The UI can display read-model weights but must not create, normalize, tune, or infer them.

## 5. Shadcn Boundary

The David shadcn surface must be shadcn-only at the UI composition layer.

Required:

- Use shadcn wrappers from `cockpit/components/ui`.
- Use `lucide-react` icons only.
- Keep icons decorative with `aria-hidden` or name controls with accessible labels/tooltips.
- Use dense operational layouts: sidebar, source/status rail, table-led panes, evidence/provenance panes, compact command controls.
- Use semantic tokens and existing global theme tokens. Avoid route-local business-color inventions.
- Prefer `Table`, `Tabs`, `Sheet`, `AlertDialog`, `Badge`, `Tooltip`, `ScrollArea`, `Separator`, `Button`, `Card`, `Alert`, `Skeleton`, `InputGroup`, `Select`, `DropdownMenu`, and `Checkbox` as appropriate.

Forbidden imports into the David shadcn route or its components:

- `cockpit-shell`
- `premium-components`
- `@phosphor-icons`
- `phosphor-react`
- `decimal.js`
- `src/core`
- `src/services`

Forbidden UI behavior:

- New dependencies without approval.
- Custom business math helpers in React.
- Hand-built table role markup when shadcn `Table` can be used.
- Approval controls that imply an action was sent before backend confirmation.
- Raw backend enum names as primary business copy unless the read model already humanized them.
- Static persona UI that is not wired to `fetchCreditModel()` or the route/API read model.

## 6. Route, Auth, And Forbidden Requests Checklist

Every future David shadcn route must pass this checklist:

- `requireRouteAccess("/credit/shadcn")` gates `/credit/shadcn`.
- `requireRouteAccess("/credit/command/shadcn")` gates `/credit/command/shadcn` if that route exists.
- `fetchCreditModel()` loads the canonical David read model.
- Opening any panel, drawer, sheet, popover, tab, or dialog sends no request.
- Opening approval UI sends no approval request.
- Opening query UI sends no query or Realtime request.
- Opening source, bureau, SAP, ERP, Billing, audit, terms, or action packet UI sends no external request.
- No SAP, ERP, Billing, approval, action, query, Realtime, or external dispatch endpoint is called on render or open.
- Only an explicit governed human decision may call approval/action endpoints.
- Human-decision submit must use backend-provided `actionId`, backend-provided allowed decision, verified session principal, and any required human note.
- Dialog close, sheet close, tab switch, selection change, filter change, and hover/focus must remain local UI state only.
- Failed approval or audit response must render as blocked/uncommitted after refresh; no optimistic business state may persist.

## 7. Component Map

Proposed thin wrappers for a future implementation:

| Wrapper | Proposed File | Primary Inputs | Local State | Must Not Own |
|---|---|---|---|---|
| `DavidCreditShadcnPage` | `cockpit/app/credit/shadcn/page.tsx` | `CreditCockpitModel`, session | None | Auth, data fetching beyond route loader. |
| `DavidCreditSurface` | `cockpit/components/david/david-credit-surface.tsx` | Full model, session | Selected pane, active tab | Scores, terms, actions, approval eligibility. |
| `DavidWorkspaceShell` | `cockpit/components/david/david-workspace-shell.tsx` | Session, allowed route labels | Sidebar collapse | Route authorization. |
| `DavidAccountHeader` | `cockpit/components/david/david-account-header.tsx` | `model.account`, `readoutStatusLabels` | None | Account values or summary math. |
| `SentinelAlertBand` | `cockpit/components/david/sentinel-alert-band.tsx` | `model.sentinel` | Detail sheet open | Lien state, source status, reason. |
| `PartialHoldWorkbench` | `cockpit/components/david/partial-hold-workbench.tsx` | `model.partialHold` | Active criteria tab | Score, weights, split, release ratio. |
| `TermsActionPacket` | `cockpit/components/david/terms-action-packet.tsx` | `model.termProposal`, `model.approvalInbox` | Active packet tab, dialog open | Terms, ready state, approval actions. |
| `RiskMeshPositionTable` | `cockpit/components/david/risk-mesh-position-table.tsx` | `model.negotiation` | Selected node | Decision basis or arbitration outcome. |
| `DavidActionQueueTable` | `cockpit/components/david/david-action-queue-table.tsx` | `model.actionQueue` | Filter/search/sort display | Priority, age, next step, status. |
| `DavidAuditPanel` | `cockpit/components/david/david-audit-panel.tsx` | `model.audit`, `model.arbitration.recordIds` | Hash detail drawer | Hash validity, record IDs. |
| `HumanDecisionDialog` | `cockpit/components/david/human-decision-dialog.tsx` | One approval row, session | Dialog open, note text, submit pending | Approval eligibility or external dispatch state. |
| `DavidCommandShadcnPage` | `cockpit/app/credit/command/shadcn/page.tsx` | `model.commandCenter`, model, session | None | Portfolio metrics or source status. |
| `DavidCommandSurface` | `cockpit/components/david/david-command-surface.tsx` | `model.commandCenter`, supporting model slices | Pane selection | Feed rows, signal rows, audit rows, metrics. |

Wrappers may format labels, group rows, and choose responsive layout. They may not create business values.

## 8. Beat Storyline

The shadcn build should be implemented and reviewed beat by beat. Each completed Beat N must run the full storyline from Beat 1 through Beat N, not only the newest beat.

| Beat | User Story | Required Data | Browser Check |
|---:|---|---|---|
| 1 | David reaches `/credit/shadcn` through route-auth and sees the account command shell. | Session, `readoutStatusLabels`, `account`. | 1440 and 1280 desktop screenshots show route, account, and no auth leak. |
| 2 | David reads Sentinel alert context and cited records. | `sentinel`, `sentinel.recordIds`. | Drawer/sheet open makes no network dispatch and shows source truth only. |
| 3 | David inspects partial-hold score, release path, and split. | `partialHold`. | Score/split values match read model strings and no React math is present. |
| 4 | David reviews Risk Mesh positions. | `negotiation.nodes`, `negotiation.timeline`. | Rows with no deterministic basis render `Contract gap` or non-decision readout. |
| 5 | David reviews the terms action packet. | `termProposal`, `approvalInbox`. | Packet remains draft-only and pending human. |
| 6 | David opens human decision dialog. | Selected `approvalInbox` row and session. | Opening dialog makes no request; note is transient. |
| 7 | David submits a governed human decision if the backend allows it. | Backend approval response. | Only explicit submit calls approval/action endpoint; failed response remains uncommitted. |
| 8 | David verifies audit/provenance. | `audit`, `arbitration.recordIds`, approval response if present. | Audit is backend-provided only; no fabricated hash or status. |
| 9 | David opens command review route if in scope. | `commandCenter`. | `/credit/command/shadcn` is review-only and does not affect `/credit/command`. |

Progressive test rule: after Beat 4 is implemented, run Beat 1 -> 4 in the browser. After Beat 7 is implemented, run Beat 1 -> 7. This prevents later panels from breaking earlier route/auth/data boundaries.

Real-backend test rule: the progressive browser run must have two labels:

- `fixture-ui`: allowed only for isolated visual checks, never for demo readiness.
- `real-backend`: required for approval. It must run with the real API/read model, no Playwright API fulfillment, no fixture server, and no static business payloads.

## 9. Methodology

Use this order:

1. Mockup: compare against the David ImageGen direction or create the missing mockup outside this doc-only slice.
2. Storyboard/spec: write or update per-beat specs before implementation.
3. Component map: finalize wrappers, props, local state, banned imports, and data gaps.
4. Data-provenance matrix: list every visible business field and its backend source before coding.
5. RED boundary tests: add route/auth/import/no-business-logic/no-static-data tests before implementation.
6. Backend/API/read-model wiring: wire exclusively through `fetchCreditModel()` and approved API/read-model fields; extend backend contracts before filling UI gaps.
7. Shadcn-only build: build wrappers and routes using `cockpit/components/ui` and lucide.
8. Beat 1..N browser storyline: run the accumulated browser path after each beat, with 1440 and 1280 screenshots.
9. Real-backend browser storyline: run the same path without fixture API or Playwright API fulfillment.
10. Component-level reviewer audit: review each component for shadcn composition, data truth, accessibility, and no forbidden requests.

## 10. Visual And UX Bar

Repo-wide cockpit visual scores below `4/5` are failed. David shadcn sets a stricter acceptance target:

- Component score: `>=4.5/5`.
- Overall David shadcn surface score: `>=4.5/5`.
- Any route/auth, data-truth, forbidden-request, or no-invention failure blocks acceptance even if the visual score passes.

Visual direction:

- Premium B2B SaaS command surface.
- Desktop-first, dense, scan-friendly, table-led.
- Persistent navigation, compact status/source rails, evidence/provenance panes.
- No decorative hero, gradient theatre, all-caps label soup, card-everything layout, nested cards, or invented fake metrics.
- Use 1440 and 1280 screenshot checks before reviewer sign-off.

## 11. Boundary Tests To Add Later

The later implementation slice should add RED tests before code. Suggested tests:

- `/credit/shadcn` requires `requireRouteAccess("/credit/shadcn")`, calls `fetchCreditModel()`, and renders the David shadcn surface.
- `/credit/command/shadcn` requires `requireRouteAccess("/credit/command/shadcn")`, calls `fetchCreditModel()`, and renders the command shadcn surface if included.
- David shadcn route/components do not contain forbidden imports: `cockpit-shell`, `premium-components`, `@phosphor-icons`, `phosphor-react`, `decimal.js`, `src/core`, or `src/services`.
- David shadcn components import shadcn primitives from `@/components/ui/*`.
- David shadcn icons come from `lucide-react`.
- Components do not contain dollar-like literals, fixture customer names, fixture record IDs, fixture action IDs, fixture audit IDs, or scenario IDs.
- Components do not contain static business refresh labels, static source status, static source counts, static connector proof, or static agent trace rows.
- Components do not call approval/action/query/Realtime/SAP/ERP/Billing endpoints on render or open.
- Approval/action endpoint calls exist only inside explicit human submit handlers.
- Risk Mesh position rows either display backend deterministic basis or render a `Contract gap`.
- Every business-facing field has a backend source path, cited record IDs where required, deterministic basis where decision-like, and fail-closed fallback behavior.
- Real-backend E2E fails if a fixture API is started or if Playwright fulfills app API responses.
- Browser storyline checks 1440 and 1280 screenshots for every completed Beat 1..N.

## 12. Implementer Checklist

- Confirm the slice owns only David shadcn review routes and components.
- Keep `/credit` as the default David route.
- Keep `/credit` and `/credit/command` intact until owner cutover approval.
- Add or update the storyboard/spec and component map before code.
- Add RED boundary tests before implementation.
- Use only shadcn wrappers from `cockpit/components/ui`.
- Use only lucide icons.
- Wire the page through `fetchCreditModel()`.
- Pass `CreditCockpitModel` data as props; do not import `src/services` or `src/core` into UI.
- Build the data-provenance matrix before implementing each beat.
- Store only selection/tabs/drawers/dialogs/filters/transient input in React state.
- Render contract gaps for missing read-model fields.
- Render `Source unavailable` for missing connector/SAP/ERP/Billing source-health fields; do not display `Connected` without backend proof.
- Treat missing Risk Mesh deterministic basis as a contract gap.
- Make all decision/action copy draft-only and human-governed.
- Ensure opening panels/dialogs sends no forbidden request.
- Ensure explicit human submit is the only approval/action call path.
- Keep fixture UI checks separate from real-backend checks.
- Run progressive Beat 1..N browser checks after each beat.
- Run the real-backend browser check before any approval claim.
- Capture 1440 and 1280 screenshots for reviewer comparison.
- Run the AGENTS-required gates before claiming the slice is done: focused David checks during the slice, then `npm run lint && npm run typecheck && npm run test`, and `npm run verify` for final done evidence.

## 13. Reviewer Checklist

- Verify route cutover discipline: `/credit` remains default and unchanged.
- Verify shadcn route auth uses the exact review route path.
- Verify all business values come from `CreditCockpitModel` or approved API/read-model fields.
- Verify the data-provenance matrix covers every visible David business field.
- Verify no invented dollars, thresholds, scores, terms, decisions, audit states, source states, record IDs, or action states.
- Verify no static refresh time, source count, connector proof, agent trace, customer/account fixture, or source status is embedded in React.
- Verify Risk Mesh rows with no deterministic basis are not treated as decision-like UI.
- Verify forbidden imports are absent.
- Verify shadcn wrappers and lucide icons are used consistently.
- Verify React state is limited to local UI state.
- Verify opening sheets, drawers, tabs, popovers, dialogs, and panels sends no approval/query/Realtime/SAP/ERP/Billing/external request.
- Verify only governed human submit can call approval/action endpoints.
- Verify visual quality is `>=4.5/5` at component and overall surface levels.
- Verify 1440 and 1280 screenshots are nonblank, dense, readable, and free of overlapping text.
- Verify Beat 1..N storyline was rerun, not only the newest beat.
- Verify real-backend storyline ran without fixture API or Playwright API fulfillment.
- Verify unresolved contract gaps are explicit and not hidden behind placeholder UI.

## 14. Open Contract Gaps

These are not implementation blockers for a review-route shell, but they must be surfaced before decision-like UI:

- `model.negotiation.nodes` need deterministic basis if rendered as decision-like Risk Mesh rows.
- Approval eligibility and evidence-reviewed state must be backend-owned before any UI can claim an action is ready.
- Source readiness for David must come from connector/read-model fields, not route-local labels.
- SAP/ERP/Billing/source status needs backend checkedAt/proof semantics before David can claim a source is connected or current.
- Any David query/assistant/agent trace panel needs backend-emitted trace events before it can be called agentic.
- Any command-center portfolio breadth beyond the current deterministic read-model scope must be labeled as scoped or added to the read model.
- Audit confirmation after a human decision must come from backend approval/audit response, not `model.audit` alone if the user just submitted a decision.
