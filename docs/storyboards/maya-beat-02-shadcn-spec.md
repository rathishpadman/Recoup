# Maya Beat 2 Shadcn Spec: Morning Run Summary

Status: mandatory Beat 2 implementation contract after read-only review failure.

Success check for this spec: a build worker can implement only the Beat 2 mini-dashboard landing state from this document without inventing backend facts, reusing old premium/custom UI modules, or drifting beyond the mockup target.

## 1. Purpose And Approval Gate

Beat 2 covers only the post-login Maya landing state: the mini-dashboard / morning run summary that appears before Maya opens a specific case.

The earlier Beat 2 spec was read-only reviewed as failed (`3/5`), and the runtime screenshot was user-rated `2/5`. This document is now the stricter implementation contract for rebuilding Beat 2 to the accepted mockup anatomy before any Beat 3 work begins.

The approved methodology remains:

1. Mockup.
2. Spec.
3. Build.
4. Compare.

Non-goals:

- Do not change backend contracts in the Beat 2 UI pass unless a later brief explicitly names those files.
- Do not invent total pending counts, high-priority counts, source health, approvals, recommendations, evidence, claims, dollars, or statuses in React.
- Do not treat vague/weak earlier spec language as permission to keep the failed runtime anatomy.

## 2. Mockup Target And Visual Goals

Primary Beat 2 mockup:

- `mockups/imagegen/maya-12-beat-storyboard/02-workspace-morning-run-summary.png`

Supporting direction:

- `mockups/imagegen/maya-shadcn-worklist-first-2026-06-23.png`

Non-negotiable visual goals:

- Light-first, premium B2B SaaS command surface.
- Persistent left navigation/sidebar, not a centered generic dashboard. Target width is roughly `240px`, with a dark petrol Recoup command sidebar.
- Dense morning summary: a six-card KPI strip, compact source readiness strip, table-led main area, and a quiet right workspace pane.
- High-priority unavailable state must live inside the KPI slot, never as a separate alert/banner.
- Source readiness must be a single compact row with no cramped source cards, badge collisions, or label clipping.
- Worklist must be table-led with no desktop horizontal scrolling, clipped action chips, or incoherent text overlap at `1440px` or `1280px`.
- Right pane target width is `320px` to `360px`. It starts as an Empty workspace starter and shows only fetched-row client-selection summary after row click.
- Shadcn-only composition using installed primitives in `cockpit/components/ui`.
- No old bespoke `premium-components` surface language, no generated dashboard tells, no purple/blue gradient treatment, no decorative hero.
- Data must read as operational evidence, not marketing copy.
- Mockup text, numbers, labels, record IDs, and dollars are visual-only. Runtime truth comes from backend/read-model fields.

## 3. Backend Data Contract Mapping

Beat 2 route target:

- `cockpit/app/forensics/shadcn/page.tsx`

Current route behavior:

- Calls `requireRouteAccess("/forensics/shadcn")`.
- Fetches `fetchForensicsModel()` from `GET /forensics`.
- Fetches `fetchConnectorReadinessModel()` from `GET /connectors`.
- Renders `MayaForensicsSurface`.

Current data transport:

- `cockpit/app/cockpit-data.ts` reads `RECOUP_API_URL` or falls back to `http://127.0.0.1:4317`.
- `src/services/cockpitApi.ts` exposes `GET /forensics`, `GET /login`, `GET /connectors`, `GET /run`, `POST /approval`, and realtime query routes.

| UI element | Field/source | Allowed transformation | Missing/gap |
|---|---|---|---|
| Morning KPI strip | `ForensicsCockpitModel.kpiStrip[]` with `label`, `value`, `support` | Render labels and values exactly as backend strings. Reorder only if a stable future key exists. | No stable KPI keys. Do not key product meaning by labels except as a temporary display fallback called out in code review. |
| Total pending items | Prefer a backend KPI only if `/forensics.kpiStrip[]` already includes a matching backend-provided pending/open count. `actionInbox[]` and `selected.draft.status === "pending_human"` can support human-action context, not a full queue total unless product approves that meaning. | Display backend-provided string. If unavailable, show `Unavailable` or a contract-gap alert. | No explicit `pendingItemCount` or workspace summary endpoint. |
| High priority items | None in current Forensics worklist contract. | Do not compute, rank, sort, or infer priority. | No priority/severity/SLA/age/owner field per queue item. Required future backend field: `worklist[].priorityLabel` or stable summary KPI. |
| Relevant KPIs | `kpiStrip[]`; `recoveryTracker` can display only backend-computed strings if already used in the approved layout. | Display only. No math, no rollups in UI. | No stable keys for evidence-ready, blocked, approval, projected-recovery slots. |
| Source readiness strip | `ConnectorReadinessCockpitModel.sourceTiles[]`, `connectors[]`, `lastRefreshedLabel` from `/connectors`. | Map backend `statusTone` to shadcn `Badge` variants only. Show `stateLabel`, `modeLabel`, `proofItems`, and `reason` as backend strings. | Do not infer live/synthetic health from missing credentials in React. |
| Worklist preview | `worklist[]` with `scenarioLabel`, `customerLabel`, `amount`, `verdictLabel`, `routingLabel`, `confidenceLabel`, `evidenceScoreLabel`, `evidenceLabel`, `queueLabel`, `recommendedActionLabel`. | Render strings. Format layout only. `amount` is display-only and must not be parsed or recomputed. | No row switching backend contract beyond fixed `model.selected.lineId`. Beat 2 may show the table but should not promise row-driven detail refresh. |
| Recommended action state | `worklist[].recommendedActionLabel`; supporting tooltip can use `evidenceLabel` and `confidenceLabel`. | Render as advisory label with lucide agent/bot/lightbulb-style icon. Copy must avoid autonomous action language. | No separate recommendation object, eligibility, or action authority field. |
| Pending human action | `actionInbox[]`; `selected.draft.status` and `statusLabel` when `pending_human`. | Display as HITL context only. | No consolidated approvals summary endpoint. |
| Empty/detail state | `model.selected.lineId` and selected worklist match inside `MayaForensicsSurface`. | If selected line is absent, render an honest read-model mismatch/empty state. | No backend row selection endpoint for Beat 2. |

Backend gaps that must remain honest:

- No `workspaceSummary` exists.
- No per-row priority, age, SLA, owner, source, or work-type fields exist that match the mockup.
- No backend row-switch endpoint exists; Beat 2 may use client selection over fetched `worklist[]` only.
- No consolidated approvals summary exists.
- KPI labels have no stable keys; do not infer business meaning beyond display and explicit contract-gap handling.

## 4. Component-Level Spec Audit Matrix Before Implementation

Beat 2 cannot move from spec to build until each component below has an implementation note that maps mockup intent to allowed backend fields and shadcn primitives. The minimum pass score for every component is `4.5/5`; `4/5` is still pending. The overall first viewport cannot pass unless every component score is `>=4.5/5`.

| Component | Mockup visual contract | Backend/read-model fields allowed | Missing backend fields / honest fallback | Shadcn component map | Pass/fail checks |
|---|---|---|---|---|---|
| Sidebar/nav/footer | Dark petrol Recoup command rail around `240px`, strong Recoup lockup, workspace selector, dense persona navigation, compact count badges, and a footer/status area that makes the shell feel finished. | Route/persona access from existing cockpit auth context; nav labels from approved static route map; count badges only from backend-provided strings already present in the read model. | If no backend count exists, omit the badge or show an explicit unavailable state; do not invent queue counts, approvals, source counts, or alert totals. | `Sidebar`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `DropdownMenu` or `Select` for workspace selector, `Badge`, `Separator`, `Tooltip`, `Button`. | Fails if the sidebar feels half-built: weak/tiny lockup, no workspace selector, sparse nav, no footer/status, fake badges, clipped labels, awkward wrapping, or hidden text at `1440px` or `1280px`. Pass requires all visible counts to be honest backend/read-model values. |
| Header/date/refresh | Compact morning-run header aligned with the table-led workspace, with date/last-refresh metadata and refresh affordance that feels operational, not heroic. | `/connectors.lastRefreshedLabel`; any existing backend-provided run/date label from the fetched models; route/user label only from authorized cockpit context. | If no run date or refresh time exists, show `Last refreshed unavailable` or omit the field; refresh action is disabled/omitted unless backed by a route or explicit review-only reload behavior. | `Button`, `Tooltip`, `Badge`, `Separator`, optional `Breadcrumb` or `SidebarTrigger`; lucide refresh/calendar icons. | Fails if date/refresh copy is fabricated, if refresh implies backend action without a contract, if header text clips/overlaps at `1440px` or `1280px`, or if header height crowds the KPI strip. |
| KPI strip/cards | Six-card morning KPI strip with tight hierarchy, honest unavailable states in-slot, and no separate high-priority alert/banner. Cards should read as executive-ready operational facts, not marketing metrics. | `ForensicsCockpitModel.kpiStrip[]` with `label`, `value`, `support`; backend-provided high-priority/open count only if present in `kpiStrip[]` or a future stable summary field. | No stable KPI keys or explicit workspace summary exist. Missing total/high-priority/evidence-ready/blocked/approval metrics must render `Unavailable` or `Contract gap` inside the intended card slot. | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `Badge`, `Tooltip`, `Skeleton`, `Alert` only for explicit contract-gap states. | Fails if any dollar/count is parsed or recomputed in React, if high priority is inferred, if cards wrap into an awkward rhythm at `1440px`/`1280px`, if values clip, or if the strip is fewer/more than the approved six slots without product approval. |
| Source readiness/status strip | Single compact readiness row under the KPI strip with clearly distinct active, inactive, degraded, unavailable, and contract-gap states. Visual state must be legible without relying only on color. | `ConnectorReadinessCockpitModel.sourceTiles[]`, `connectors[]`, `lastRefreshedLabel`, `statusTone`, `stateLabel`, `modeLabel`, `proofItems`, `reason`. | If a connector state is absent, show backend gap/unavailable language; do not fake red/green health, live/synthetic status, or credential-derived readiness in React. | `Card` or `Table` row inside a compact band, `Badge`, `Tooltip`, `Alert`, `Separator`, `ScrollArea` only if needed for overflow containment. | Fails if active/inactive/degraded states are visually ambiguous, if red/green is invented from missing state, if badge collisions occur, if source labels/proof text clip or hide at `1440px`/`1280px`, or if source readiness becomes a cramped card grid. |
| Worklist toolbar/table/pagination | Dense table-led worklist with a compact toolbar, human-readable chips, stable columns, visible table footer/pagination rhythm, and no desktop horizontal scroll. | `worklist[]` fields: `scenarioLabel`, `customerLabel`, `amount`, `verdictLabel`, `routingLabel`, `confidenceLabel`, `evidenceScoreLabel`, `evidenceLabel`, `queueLabel`, `recommendedActionLabel`; `actionInbox[]` only for HITL context. | No priority, age, SLA, owner, source, work type, pagination, or row-refresh endpoint exists. Show unavailable/contract-gap where design requires those fields; local page controls must be presentation-only over fetched rows and must not imply server pagination. | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`, `TableFooter`, `Badge`, `Tooltip`, `Button`, `InputGroup`/`Input` if search is included, `Select` or `DropdownMenu` for filters, `Pagination`, `Empty`, `ScrollArea`. | Fails if header/chips wrap awkwardly, action chips clip, table footer/pagination rhythm is missing, raw backend enum/proof keys appear as primary business copy, row text overlaps, or horizontal scrolling is required at `1440px` or `1280px`. |
| Right work-item pane | Quiet `320px` to `360px` right pane. Initial state is a centered Empty workspace starter; selected state only summarizes a fetched worklist row and clearly stays advisory/HITL-safe. | Client-selected row from fetched `worklist[]`; `model.selected.lineId`; selected row labels; `selected.draft.status` and `statusLabel` only for pending-human context. | No backend row-selection/detail endpoint exists. If selected row is missing or detail fields are unavailable, show read-model mismatch or `Select a work item` Empty state. | `Card` or unframed side pane with `Empty`, `Badge`, `Tooltip`, `Separator`, `Button` only for backed review navigation, optional `ScrollArea`. | Fails if the pane invents evidence, claims, dollars, approvals, customer history, or autonomous actions; if disabled fake buttons dominate; if width falls outside target; or if content clips/overlaps at `1440px`/`1280px`. |
| Overall first viewport composition | First viewport after Maya login/review route must match the approved morning-summary anatomy: persistent sidebar, compact header, six KPI cards, readiness row, table-led work area, and right pane with a hint of density below the fold. | Combination of `/forensics`, `/connectors`, route access, and authorized persona context only. | Any missing backend support must be visible as a contract gap in the affected component, not hidden by mock data or decorative filler. | Page composition using shadcn primitives listed above; no `CockpitShell`, `premium-components`, old `/forensics` modules, Phosphor icon mix, custom div tables, or registry additions without approval. | Fails unless every component score is `>=4.5/5`; also fails for generated UI tells, card-everything composition, purple/blue gradient treatment, no 1440/1280 viewport proof, clipping/overlap/hidden text, or any invented operational fact. |

Pre-build audit loop:

1. Score each component against the matrix before touching implementation code.
2. For any component below `4.5/5`, update the spec notes or backend-gap handling before building.
3. Re-check `1440px` and `1280px` layout risks specifically for clipping, overlap, hidden text, chip wrapping, source-state ambiguity, table footer rhythm, and right-pane width.
4. Only proceed to implementation when all seven component rows have an explicit pass path at `>=4.5/5`.

## 5. Implementation Ownership

Likely files for a later Beat 2 build pass:

| Area | File |
|---|---|
| Route | `cockpit/app/forensics/shadcn/page.tsx` |
| Composition root | `cockpit/components/maya/maya-forensics-surface.tsx` |
| Workspace shell | `cockpit/components/maya/maya-workspace-shell.tsx` |
| KPI strip | `cockpit/components/maya/maya-run-kpi-strip.tsx` |
| Source readiness | `cockpit/components/maya/source-readiness-strip.tsx` |
| Worklist preview | `cockpit/components/maya/deduction-worklist-table.tsx` |
| Recommendation cell | `cockpit/components/maya/recommended-action-cell.tsx` |
| Read-model types | `cockpit/app/cockpit-data.ts`, `cockpit/components/maya/types.ts` |
| Login default route, only if approved for Beat 2 cutover | `config/cockpitDemoProfiles.ts` |

Route/default requirement:

- Current Maya post-login default is `/forensics` in `config/cockpitDemoProfiles.ts`.
- Beat 2 should make Maya land on the shadcn surface rather than the old UI if the approved build scope includes post-login cutover.
- If cutover is not approved, keep `/forensics/shadcn` as the review route and document that `/login` still lands on legacy `/forensics`.

## 6. Shadcn Component Map

Use installed shadcn components from `cockpit/components/ui` only unless a later brief explicitly justifies adding another registry item.

Required Beat 2 primitives:

| Need | Shadcn component |
|---|---|
| Persistent navigation and persona workspace shell | `Sidebar`, `ScrollArea`, `Separator`, `Tooltip`, `Button` |
| Morning KPI cards | `Card`, `Badge`, `Tooltip`, `Skeleton` |
| Source readiness | `Card`, `Badge`, `Tooltip`, `Alert`, `Separator`, `ScrollArea`, `Table` |
| Worklist preview | `Table`, `Badge`, `Tooltip`, `Button`, `Empty`, `ScrollArea` |
| Filters/search if included | `InputGroup`, `Input`, `Select`, `DropdownMenu` |
| Loading/failure states | `Skeleton`, `Alert`, `Empty` |
| Recommended action | `Badge`, `Tooltip`, lucide `BotIcon` or equivalent agent/advisory icon |

Composition rules:

- Use full `Card` anatomy where a card is needed: `CardHeader`, `CardTitle` or `CardDescription`, `CardContent`.
- Use `Table` for tabular worklist/source rows, not role-based div tables.
- Use `Empty` for no rows or unsupported contract states.
- Use `Alert` for backend gaps, blocked data, or read-model mismatch.
- Use `Skeleton` for loading states, not custom pulse markup.
- Use `Badge` for statuses, not custom spans.
- Use semantic tokens and variants; no raw ad hoc color ramps for business status.
- Icon-only or icon-leading buttons must use lucide and shadcn icon conventions.
- Do not use `CockpitShell`, `premium-components`, old `/forensics` components, Phosphor icons, or custom div tables.
- Do not show disabled action buttons unless the control is backed by a fetched row/action contract. The empty right pane should be an Empty state only.

## 7. Interconnection And Backend Wiring Requirements

Beat 2 must not become a static React-only dashboard.

Required wiring:

- `/forensics/shadcn` fetches `fetchForensicsModel()` and `fetchConnectorReadinessModel()` at the route boundary.
- `MayaForensicsSurface` receives read-model props and passes them down to shadcn wrappers.
- KPI, readiness, worklist, recommendation, and HITL state all render from props.
- Any login default change must route Maya to the shadcn surface and preserve authorization through `requireRouteAccess`.
- If `/forensics` remains the authorized route and `/forensics/shadcn` remains a review route, the spec/build handoff must state the mismatch plainly.

Banned:

- Hard-coded dashboard totals.
- Client-side derivation of dollars, priority, evidence readiness, approval eligibility, source readiness, verdict, routing, or audit state.
- Static mockup data in React.
- Copy that says or implies autonomous recovery/send/ERP write-back.
- Route access checks that guard the review route as `/forensics` instead of `/forensics/shadcn`.

## 8. Recommended Action State

Beat 2 may show the recommended-action state in the worklist preview because the current read model exposes `worklist[].recommendedActionLabel`.

Rules:

- Use the backend label exactly or only apply harmless casing/line wrapping.
- Use a lucide agent/bot/lightbulb-style icon as an advisory marker.
- Tooltip may show backend `evidenceLabel` and `confidenceLabel`.
- Copy should say `Recommended action` or `Forensics recommendation`.
- Do not say `agent will send`, `auto recover`, `auto approve`, `execute`, or similar autonomous-action language.
- Do not enable external action dispatch from Beat 2.

## 9. High Priority Handling

The user explicitly requested high priority items in Beat 2. The current backend contract does not expose high priority, severity, age, SLA, owner, or last-updated fields for Forensics queue items.

Allowed options:

1. If `/forensics.kpiStrip[]` already includes a backend-provided KPI whose label clearly represents high priority, display that backend string unchanged.
2. If no such backend field is present, show a compact `Unavailable` or `Contract gap` state in the high-priority slot.
3. Add a visible or tooltip-level note: `Priority requires backend field support.`

Preferred future backend contract:

- `ForensicsCockpitModel.workspaceSummary.totalPendingCount`
- `ForensicsCockpitModel.workspaceSummary.highPriorityCount`
- `ForensicsCockpitModel.workspaceSummary.evidenceReadyCount`
- `ForensicsCockpitModel.workspaceSummary.blockedCount`
- `ForensicsCockpitModel.workspaceSummary.pendingHumanActionCount`
- `worklist[].priorityLabel`
- `worklist[].priorityBasisRecordIds`
- `worklist[].ageLabel` or `lastUpdatedLabel`

Until those fields exist, Beat 2 must not fabricate high priority.

## 10. Screenshot Comparison Checklist

Target screenshot path for the build pass:

- `output/playwright/e2e/maya-beat-02-dashboard.png`

Pass criteria: reviewer score must be `>=4.5/5` overall and every component-level audit score must be `>=4.5/5`. Scores `1/5`, `2/5`, `3/5`, and `4/5` remain failed/pending.

Checklist:

- First viewport after Maya login or review route matches the Beat 2 morning-summary anatomy.
- Persistent sidebar is present and visually integrated.
- Sidebar cannot pass unless it has a strong Recoup lockup, workspace selector, dense nav, footer/status area, and honest count badges only.
- KPI strip is six large cards, real-data backed, and does not parse or invent dollars.
- Total pending/high-priority handling is honest: backend value or clear unavailable/contract-gap state.
- Source readiness uses `/connectors` data, stays a compact single row, and does not label synthetic sources as live.
- Source readiness cannot pass if active/inactive/degraded states are visually ambiguous or if red/green readiness is faked when backend state is absent.
- Worklist preview is dense and table-led, not card-everything, with no desktop horizontal scrolling at `1440px` or `1280px`.
- Worklist cannot pass if headers/chips wrap awkwardly or if table footer/pagination rhythm is missing.
- Right workspace pane is `320px` to `360px`, begins as a centered Empty state, and only shows fetched-row client selection on click.
- Recommended action appears as advisory with an agent/bot/lightbulb icon and no autonomous action copy.
- Empty/detail state is quiet and operational, not a marketing hero.
- No legacy Maya custom/premium visual language is obvious.
- No generated UI tells listed in `AGENTS.md` section 5.1 dominate the screen.
- No component has clipping, overlap, or hidden text at `1440px` or `1280px` where that component is visible.
- Overall first viewport cannot pass unless all seven component scores in Section 4 are `>=4.5/5`.

## 11. Tests And Verification For Build Pass

Documentation-only spec edit:

- `git diff -- docs/storyboards/maya-beat-02-shadcn-spec.md`
- `git diff --check -- docs/storyboards/maya-beat-02-shadcn-spec.md`
- `git status --short`

Later Beat 2 implementation verification:

- Focused invariant tests if any decision/provenance/HITL surface is touched.
- Unit auth/API tests if login default routing, `/api/demo-login`, route access, or cockpit data loaders are touched.
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- E2E screenshot capture for `output/playwright/e2e/maya-beat-02-dashboard.png`.
- Explicit visual check at `1440px` and `1280px` desktop widths for table fit, source label fit, and right-pane proportions.
- Visual comparison against `mockups/imagegen/maya-12-beat-storyboard/02-workspace-morning-run-summary.png` and `mockups/imagegen/maya-shadcn-worklist-first-2026-06-23.png`.
- Full `npm run verify` before claiming the broader Maya shadcn goal is complete.
