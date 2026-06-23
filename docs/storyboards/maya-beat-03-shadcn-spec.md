# Maya Beat 3 Shadcn Spec: Worklist Recommended Action

Status: draft for user review after Beat 2 correction approval.

Success check for this spec: a build worker can implement only the Beat 3 worklist recommended-action state from this document without inventing backend facts, dispatching external actions, refreshing decisions without a backend contract, or touching the unfinished Beat 2 recovery work.

## 1. Purpose And Approval Gate

Beat 3 covers only the Maya worklist recommended-action moment: the analyst is in the worklist, a row is focused or selected, and the recommended action is visible as advisory guidance with supporting row context.

This document is a spec, not implementation approval. Beat 3 implementation waits until the user approves the Beat 2 correction/recovery state. The approved methodology remains:

1. Mockup.
2. Spec.
3. Build.
4. Compare.

Non-goals:

- Do not implement UI code from this document.
- Do not modify cockpit components, routes, tests, backend services, or read-model contracts in this spec pass.
- Do not stage or commit any existing Beat 2 partial UI files.
- Do not invent worklist totals, priority, SLA, owner, evidence state, line IDs, routing, verdict, recommended action, dollars, approval state, or backend refresh behavior in React.

## 2. Mockup Target And Visual Contract

Primary Beat 3 mockup:

- `mockups/imagegen/maya-12-beat-storyboard/03-worklist-recommended-action.png`

Supporting direction:

- `mockups/imagegen/maya-shadcn-worklist-first-2026-06-23.png`
- `docs/storyboards/maya-shadcn-ui-handoff-status.md`
- Beat 2 landing anatomy from `docs/storyboards/maya-beat-02-shadcn-spec.md`

Non-negotiable visual goals:

- Light-first, premium B2B SaaS command surface with persistent left navigation.
- Dense table-led worklist, not cards for every row.
- Clear focused/selected row treatment that reads as operational state, not decorative emphasis.
- Recommended action appears as advisory state inside the table row and in the detail pane, using a lucide icon and shadcn primitives.
- Right-side detail/workspace pane summarizes only the selected/focused fetched row unless a backend-selected case matches the row.
- Top worklist controls may show filters, columns, and saved views only as local UI affordances unless a backend contract exists.
- Mockup-only controls such as `Last updated`, row pagination, row checkboxes, and right-pane support fields must be mapped to current backend/read-model fields or rendered as `Unavailable` / `Contract gap`.
- No legacy Maya premium/custom visual language, no purple/blue gradients, no decorative hero, no fake agent badges.
- Mockup text, numbers, labels, record IDs, and amounts are visual-only. Runtime truth comes from backend/read-model fields.

## 3. Backend Data Contract Mapping

Beat 3 route target:

- Current review route: `/forensics/shadcn`
- Current data source: `fetchForensicsModel()` from `GET /forensics`

Current route/data behavior:

- `cockpit/app/cockpit-data.ts` defines `ForensicsCockpitModel.worklist[]`, `selected`, `actionInbox[]`, and `kpiStrip[]`.
- `src/services/cockpitApi.ts` exposes `GET /forensics`; there is no row-selection or row-refresh endpoint.
- `src/services/cockpitModel.ts` builds `worklist[]` from scenario rows and decisions, then chooses one fixed `selected.lineId` recovery decision for the deeper evidence/draft packet.
- Current Beat 2 component work already supports client-side selected row state over fetched `worklist[]` rows. That state must not be described as a backend decision refresh.

| UI element | Field/source | Allowed transformation | Missing/gap |
|---|---|---|---|
| Recommended action label | `worklist[].recommendedActionLabel`, currently derived from decision routing label in `buildScenarioWorklist` | Render as advisory label. Harmless wrapping/casing is allowed only if it does not change meaning. | No separate recommendation object, action eligibility, next-best-action basis, or authority field. |
| Selected/focused row | Client state keyed by `worklist[].lineId`; initial selected row may use `model.selected.lineId` only when it matches a fetched worklist row | Use `aria-selected`, keyboard focus, and row highlight. Selection may update visible row summary from already-fetched row data. | No backend row-switch endpoint and no guarantee that every selected row has a matching deep evidence packet. |
| Queue | `worklist[].queueLabel`; supporting routing from `worklist[].routingLabel` or `routing` | Display backend label. UI may map to a neutral `Badge` variant. | No queue owner, queue count, SLA queue age, or escalation status. |
| Evidence score/label | `worklist[].evidenceScoreLabel` and `worklist[].evidenceLabel` | Display as backend strings. Do not compute completeness or missing counts in React. | No structured evidence-ready boolean, missing-document list per row, or confidence threshold basis. |
| Routing/verdict | `worklist[].routingLabel`, `worklist[].routing`, `worklist[].verdictLabel`, `worklist[].verdict` | Render human label from backend. Use enum only for stable test selectors or tone mapping if already approved. | No backend severity/priority field. Do not infer priority from verdict or routing. |
| Amount | `worklist[].amount` | Display exactly as backend string with tabular alignment. Do not parse, add, round, or recompute. | No alternate currency metadata beyond backend display string. |
| Line IDs | `worklist[].lineIds`, `worklist[].lineId`, `lineCount` | Render IDs as cited operational identifiers. Use wrapping chips only for display. | No per-line row expansion endpoint in Beat 3. |
| Detail pane summary | Selected `worklist[]` row fields only. If selected row equals `model.selected.lineId`, deeper `selected.evidencePack`, `selected.draft`, and `selected.approvalActions` may be shown as backend-selected case context. | The pane may say the detail packet is available only for the backend-selected case. | No deep packet for arbitrary clicked rows. Do not reuse `model.selected` evidence/draft for a different row. |
| Worklist totals and status strip | Prefer backend `kpiStrip[]` only when labels clearly match the intended display. | Display backend strings. Otherwise show `Unavailable` or `Contract gap`. | No explicit total-items, high-priority, shortage, overage, advisory, cleared, SLA, or owner fields for Beat 3. |
| Mockup `Last updated` | None in current Forensics cockpit contract. | Omit, or render `Last updated: Unavailable` only if the visual slot is required for parity. | Do not derive from build time, browser time, current date, API response time, or `mayaJourney[]` unless a backend field is added. |
| Page controls / pagination | Current `worklist[]` is one fetched array. | If needed for visual parity, implement Button-based local page controls over already-fetched rows only, with disabled states when no local paging is active. | `Pagination` is not installed. No server pagination, total pages, cursor, count, or page size field exists. |
| Row checkboxes | Local UI selection state only, using fetched `worklist[].lineId` as the key. | Use for local multi-select affordance only if needed; checked state must not imply approval, readiness, dispatch, or backend selection. | No backend bulk-select, bulk action, row-review, or approval-selection contract. |
| Right-pane `Detected` | None in current worklist or selected case contract. | Render `Unavailable` / `Contract gap` if the field is present in the pane. | Do not infer from route load time, `mayaJourney[]`, document dates, or mockup copy. |
| Right-pane `Owner` | None in current worklist or selected case contract. | Render `Unavailable` / `Contract gap`. | Do not fabricate analyst names, queues-as-owners, or team ownership from `queueLabel`. |
| Right-pane `SLA` | None in current worklist or selected case contract. | Render `Unavailable` / `Contract gap`. | Do not compute deadlines, overdue state, age, or severity from confidence/routing. |
| Right-pane `What happened` | `selectedWorklistItem.scenarioLabel`, `customerLabel`, `routingLabel`, `verdictLabel`, `evidenceLabel`, `recommendedActionLabel`, and `selected.draft.basis` only when the selected row matches `model.selected.lineId`. | Summarize only backend-provided strings, without adding causality beyond the label text. | No structured incident narrative, causal timeline, or detection explanation for arbitrary rows. |

Explicit allowlist for Beat 3 runtime facts:

- `ForensicsCockpitModel.worklist[]` fields may drive the table, selected row summary, advisory label, evidence labels, routing/verdict labels, line IDs, and amount display.
- `ForensicsCockpitModel.selected` may drive deeper evidence/draft/support fields only when the selected row contains `model.selected.lineId`.
- `ForensicsCockpitModel.kpiStrip[]` may drive status strips only when the backend label/value already matches the displayed business claim.
- Anything not present in `worklist[]`, matching-row `selected`, or `kpiStrip[]` is banned as a factual display and must be omitted or marked `Unavailable` / `Contract gap`.

## 4. Interaction Contract

Beat 3 must preserve the difference between local row interaction and backend decision state.

Required interactions:

- Row hover: quiet table hover state only. No scale/rotate animation.
- Row focus: keyboard-visible focus ring or shadcn-compatible focus state on the row.
- Row selection: selecting a row sets local client state keyed by `worklist[].lineId`.
- Recommended action hover/focus: tooltip may expose backend `recommendedActionLabel`, `evidenceLabel`, and `confidenceLabel`.
- Recommended action click: may select/open the row or show a row-actions menu. It must not dispatch recovery, route Billing, approve, send correspondence, write ERP data, or mutate backend state.
- Right pane update: may update to the selected fetched row summary. If the selected row is not `model.selected.lineId`, show a contract note that deep evidence/draft data is not available for that row in the current read model.

Backend honesty rule:

- If there is no backend row-switch endpoint, the client selection may only use already-fetched `worklist[]` row data. It must not claim that Forensics re-ran, refreshed evidence, changed a decision, recalculated dollars, or loaded a new backend-selected case.

Accessibility requirements:

- Row selection must be reachable by keyboard with `Enter` and `Space`.
- Selected row must expose `aria-selected`.
- Icon-only recommended-action controls require an accessible label.
- Tooltip content must not be the only place where critical state is available.

## 5. Shadcn Component Map

Use installed shadcn components from `cockpit/components/ui` only unless a later implementation brief explicitly authorizes adding another registry item.

Required Beat 3 primitives:

| Need | Shadcn component |
|---|---|
| Persistent navigation/sidebar | `Sidebar` |
| Worklist table | `Table`, `ScrollArea` |
| Optional local row checkbox selection | `Checkbox` |
| Status, verdict, evidence, queue, line IDs | `Badge` |
| Recommended action explanation | `Tooltip` |
| Row action/open investigation/add note controls | `Button` |
| Local page controls if visual parity requires them | `Button` with disabled state; do not use `Pagination` unless later approved and installed |
| Filters, columns, saved views, row actions if included | `DropdownMenu` |
| Empty/no rows/unsupported contract state | `Empty` |
| Backend gap or read-model mismatch | `Alert` if a visible warning is required |
| Dividers and dense pane structure | `Separator` |
| Detail tabs if included | `Tabs` |

Icon rules:

- Use lucide icons only.
- Recommended action should use a lucide advisory/agent icon such as `BotIcon`, `UserRoundCheckIcon`, `LightbulbIcon`, or a close existing equivalent.
- Icons inside buttons follow shadcn icon conventions with `data-icon`; no custom SVG illustration for Beat 3.

Composition rules:

- Use `Table` rows and cells for the worklist, not role-based div tables.
- Use `Sidebar` for the persistent nav shell, not a custom nav surface.
- Use `Checkbox` only for local selection affordance. It must not imply backend review completion, readiness, or approval.
- Use `Button` for previous/next/page-size affordances if local paging is included. `Pagination` is not installed in this repo and must not be imported unless a later brief authorizes adding it.
- Use `Badge` for statuses, not custom styled spans.
- Use `Tooltip` for compact explanatory support, not hidden business truth.
- Use `DropdownMenuGroup` for grouped menu items.
- Use `Empty` for no rows, no matching local search rows, or unsupported contract states.
- Use semantic tokens and component variants; avoid ad hoc color ramps and generated dashboard styling.

## 6. No-Fake-Data And No-Autonomous-Action Language Rules

No fake data:

- React must not fabricate totals, high-priority counts, row priority, owner, SLA, evidence gaps, cited record counts, recommendation rationale, dollars, audit state, or approval status.
- React must not compute money, thresholds, evidence sufficiency, decision readiness, or approval eligibility.
- Display `Unavailable` or `Contract gap` when the backend/read model does not expose the mockup field.
- Do not map mockup values into fixtures or constants.

No autonomous action:

- Allowed copy: `Recommended action`, `Forensics recommendation`, `Advisory only`, `Open investigation`, `Add note`, `Review row`.
- Banned copy: `auto recover`, `auto approve`, `send`, `execute`, `write back`, `agent will`, `recovered`, `cleared by AI`, or any phrasing that implies external action without human approval.
- Any external action remains blocked behind HITL approval per I-7 and I-20.
- ERP write-back remains prohibited per I-26; the S2 billing loop remains draft-only per I-23.

## 7. Screenshot Comparison Checklist

Target screenshot path for the build pass:

- `output/playwright/e2e/maya-beat-03-recommended-action.png`

Pass criteria: reviewer score must be `>=4.5/5`. Scores `1/5`, `2/5`, and `3/5` remain failed/pending.

Current backend/read-model gaps prevent exact mockup parity where the mockup shows fields not exposed by the runtime contract. Implementations must document those deltas explicitly and render unavailable/contract-gap states instead of adding fake fields or mockup constants.

Checklist:

- First viewport matches the Beat 3 mockup anatomy: sidebar, worklist header, dense table, selected row, recommendation affordance, and right detail pane.
- Worklist is table-led and compact; no card-everything layout.
- Selected/focused row is obvious, keyboard accessible, and not visually noisy.
- Recommended action is visible as advisory state in the selected row and pane.
- Tooltip or supporting copy says advisory only and does not imply autonomous execution.
- Detail pane uses selected fetched row data and does not reuse `model.selected` deep evidence/draft for a different row.
- Amounts, verdicts, routing, queue, evidence labels, and line IDs are backend/read-model sourced.
- Backend gaps are displayed honestly as unavailable/contract-gap states rather than mockup constants.
- Visual language remains shadcn-only, light-first, premium operational B2B.
- No generated UI tells from `AGENTS.md` section 5.1 dominate the screen.

## 8. Tests And Verification For Beat 3 Build

Documentation-only spec edit verification:

- `git diff -- docs/storyboards/maya-beat-03-shadcn-spec.md`
- `git diff --check -- docs/storyboards/maya-beat-03-shadcn-spec.md`
- `git status --short`

Later Beat 3 implementation verification:

- Unit/component tests for row selection, keyboard selection, recommended-action tooltip, and read-model mismatch handling.
- Route/auth tests only if `/forensics/shadcn`, `/forensics`, login default routing, or session access changes.
- Invariant tests if any decision, provenance, HITL, approval, draft, audit, or external-action surface is touched.
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- Focused E2E screenshot capture for `output/playwright/e2e/maya-beat-03-recommended-action.png`.
- Visual comparison against `mockups/imagegen/maya-12-beat-storyboard/03-worklist-recommended-action.png` records a score `>=4.5/5` and explicit deltas for any backend/read-model gaps.
- Full `npm run verify` before claiming the broader Maya shadcn goal is complete.
