# Maya Beat 2 Shadcn Spec: Morning Run Summary

Status: draft for user review before Beat 3.

Success check for this spec: a build worker can implement only the Beat 2 mini-dashboard landing state from this document without inventing backend facts, reusing old premium/custom UI modules, or drifting beyond the mockup target.

## 1. Purpose And Approval Gate

Beat 2 covers only the post-login Maya landing state: the mini-dashboard / morning run summary that appears before Maya opens a specific case.

This document is a spec, not an implementation authorization. It must be user-reviewed before Beat 3 worklist/recommended-action implementation proceeds. The approved methodology remains:

1. Mockup.
2. Spec.
3. Build.
4. Compare.

Non-goals:

- Do not implement UI code from this document.
- Do not change backend contracts in the Beat 2 UI pass unless a later brief explicitly names those files.
- Do not invent total pending counts, high-priority counts, source health, approvals, recommendations, evidence, claims, dollars, or statuses in React.

## 2. Mockup Target And Visual Goals

Primary Beat 2 mockup:

- `mockups/imagegen/maya-12-beat-storyboard/02-workspace-morning-run-summary.png`

Supporting direction:

- `mockups/imagegen/maya-shadcn-worklist-first-2026-06-23.png`

Non-negotiable visual goals:

- Light-first, premium B2B SaaS command surface.
- Persistent left navigation/sidebar, not a centered generic dashboard.
- Dense morning summary: compact KPI strip, source readiness strip, worklist-led main area, and a quiet empty/detail state.
- Shadcn-only composition using installed primitives in `cockpit/components/ui`.
- No old bespoke `premium-components` surface language, no generated dashboard tells, no purple/blue gradient treatment, no decorative hero.
- Data must read as operational evidence, not marketing copy.
- Mockup text, numbers, labels, record IDs, and dollars are visual-only. Runtime truth comes from backend/read-model fields.

## 3. Backend Data Contract Mapping

Beat 2 route target:

- `cockpit/app/forensics/shadcn/page.tsx`

Current route behavior:

- Calls `requireRouteAccess("/forensics")`.
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

## 4. Implementation Ownership

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

## 5. Shadcn Component Map

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

## 6. Interconnection And Backend Wiring Requirements

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

## 7. Recommended Action State

Beat 2 may show the recommended-action state in the worklist preview because the current read model exposes `worklist[].recommendedActionLabel`.

Rules:

- Use the backend label exactly or only apply harmless casing/line wrapping.
- Use a lucide agent/bot/lightbulb-style icon as an advisory marker.
- Tooltip may show backend `evidenceLabel` and `confidenceLabel`.
- Copy should say `Recommended action` or `Forensics recommendation`.
- Do not say `agent will send`, `auto recover`, `auto approve`, `execute`, or similar autonomous-action language.
- Do not enable external action dispatch from Beat 2.

## 8. High Priority Handling

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

## 9. Screenshot Comparison Checklist

Target screenshot path for the build pass:

- `output/playwright/e2e/maya-beat-02-dashboard.png`

Pass criteria: reviewer score must be `>=4/5`. Scores `1/5`, `2/5`, and `3/5` remain failed/pending.

Checklist:

- First viewport after Maya login or review route matches the Beat 2 morning-summary anatomy.
- Persistent sidebar is present and visually integrated.
- KPI strip is compact, real-data backed, and does not parse or invent dollars.
- Total pending/high-priority handling is honest: backend value or clear unavailable/contract-gap state.
- Source readiness uses `/connectors` data and does not label synthetic sources as live.
- Worklist preview is dense and table-led, not card-everything.
- Recommended action appears as advisory with an agent/bot/lightbulb icon and no autonomous action copy.
- Empty/detail state is quiet and operational, not a marketing hero.
- No legacy Maya custom/premium visual language is obvious.
- No generated UI tells listed in `AGENTS.md` section 5.1 dominate the screen.

## 10. Tests And Verification For Build Pass

Documentation-only spec edit:

- `git diff -- docs/storyboards/maya-beat-02-shadcn-spec.md`
- `git status --short`

Later Beat 2 implementation verification:

- Focused invariant tests if any decision/provenance/HITL surface is touched.
- Unit auth/API tests if login default routing, `/api/demo-login`, route access, or cockpit data loaders are touched.
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- E2E screenshot capture for `output/playwright/e2e/maya-beat-02-dashboard.png`.
- Visual comparison against `mockups/imagegen/maya-12-beat-storyboard/02-workspace-morning-run-summary.png` and `mockups/imagegen/maya-shadcn-worklist-first-2026-06-23.png`.
- Full `npm run verify` before claiming the broader Maya shadcn goal is complete.
