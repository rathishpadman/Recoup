# Maya Beat 12 Shadcn Spec: Return To Worklist Next Case

Status: first-step spec for user review after mockup deconstruction and read-only backend contract review.

Success check for this spec: a build worker can implement only the Beat 12 return-to-worklist state from this document without inventing queue mutation, completion counts, audit status, next-case ranking, dollars, approvals, or backend refresh behavior in React.

## 1. Purpose And Approval Gate

Beat 12 covers only the moment after Maya has completed or inspected the audit confirmation beat and returns to the deduction worklist. The screen should show that she is back in queue mode, can see a lightweight audit-recorded confirmation if the backend supplies one, and can choose the next recommended case herself.

This document is a spec, not implementation approval. Beat 12 implementation waits for explicit user approval and must not edit cockpit UI, route code, backend services, tests, or existing Beat 2 files during this spec pass.

The approved methodology remains:

1. Mockup.
2. Spec.
3. Build.
4. Compare.

Non-goals:

- Do not implement UI code from this document.
- Do not modify cockpit components, routes, tests, backend services, read-model contracts, or `cockpit/next-env.d.ts` in this spec pass.
- Do not stage or commit existing dirty Beat 2 or cockpit files.
- Do not fabricate queue totals, completion counts, priority, age, owner, last-updated time, pagination totals, audit coverage, audit hashes, approved status, next-case ranking, dollars, approval status, or backend refresh behavior.
- Do not imply a case was completed, cleared, approved, dispatched, sent, written back, or externally acted on unless a backend/HITL response supplies that exact state.

## 2. Mockup Target And Visual Contract

Primary Beat 12 mockup:

- `mockups/imagegen/maya-12-beat-storyboard/12-return-to-worklist-next-case.png`

Supporting direction:

- `docs/storyboards/maya-shadcn-ui-handoff-status.md`
- Beat 2 landing anatomy from `docs/storyboards/maya-beat-02-shadcn-spec.md`
- Beat 3 worklist interaction contract from `docs/storyboards/maya-beat-03-shadcn-spec.md`
- Journey contract Beat 12 section in `docs/storyboards/maya-agentic-storyboard-contract.md`

Non-negotiable visual goals:

- Light-first, premium B2B SaaS command surface with persistent dark petrol Recoup sidebar.
- Worklist is the primary surface: compact header, dense KPI strip, compact source-readiness row, table-led queue, and footer-level pagination affordance if needed for visual parity.
- The first viewport should read as return-to-worklist, not a selected-case detail page, marketing dashboard, or audit-only confirmation screen.
- A lightweight audit confirmation may appear as a shadcn/sonner toast in the upper-right only when backed by refreshed audit or approval response state.
- The next recommended case may be highlighted or selected in the table, but must not auto-open, auto-approve, auto-dispatch, or claim decision recomputation.
- Mockup-only KPI values (`128`, `$2.74M`, `14.6 days`, `96%`), row amounts, priorities, ages, statuses, references, and timestamps are visual-only. Runtime truth comes from backend/read-model fields.
- Source readiness stays compact and honest; do not show synthetic or blocked sources as live.
- No legacy Maya custom/premium visual language, purple/blue gradients, decorative hero, nested-card surface, emoji icons, or fake agent badges.
- No generated UI tells from `AGENTS.md` section 5.1 should dominate the screen.

## 3. Backend Data Contract Mapping

Beat 12 route target:

- Current review route: `/forensics/shadcn`
- Current data source: `fetchForensicsModel()` from `GET /forensics`
- Current connector source: `fetchConnectorReadinessModel()` from `GET /connectors`

Current route/data behavior:

- `cockpit/app/forensics/shadcn/page.tsx` fetches the forensics and connector read models and renders `MayaForensicsSurface`.
- `cockpit/app/cockpit-data.ts` defines `ForensicsCockpitModel.worklist[]`, `selected`, `actionInbox[]`, `kpiStrip[]`, `mayaJourney[]`, `recoveryTracker`, and `ConnectorReadinessCockpitModel`.
- `src/services/cockpitModel.ts` builds `worklist[]` from scenario rows and decisions, then chooses one fixed `selected.lineId` recovery decision for the deeper evidence/draft packet.
- There is no row-switch endpoint, no server pagination endpoint, no queue mutation endpoint, and no explicit Beat 12 post-audit read-model refresh contract.

| UI element | Field/source | Allowed transformation | Missing/gap |
|---|---|---|---|
| Worklist rows | `ForensicsCockpitModel.worklist[]` | Render table rows from fetched row strings. Use local selection keyed by `worklist[].lineId`. | No priority, age, owner, last-updated, reference invoice, status history, or server pagination fields. |
| Recommended next case | Existing selected/focused local row from fetched `worklist[]`; `worklist[].recommendedActionLabel` may support advisory text. | Highlight a fetched row as local focus only. If future backend adds a `nextRecommendedLineId`, use that field. | No backend next-best-case ranking, next-case basis, or next-case ID exists. Do not infer from array order, amount, routing, verdict, confidence, or mockup text. |
| Audit toast | Future refreshed backend audit/approval response, if exposed; otherwise no factual toast. | Display a lightweight success toast only after a real response/read-model field says audit was recorded. | Current `ForensicsCockpitModel` has no audit hash/status field for Beat 12. Do not fabricate `Audit recorded`. |
| Updated row state | Future refreshed `worklist[]` status/audit fields, if added. | Render backend strings as `Badge` variants. | Current worklist rows do not expose approval/audit/completed/cleared status. Do not mark rows approved, verified, completed, or closed from local clicks. |
| KPI strip | `ForensicsCockpitModel.kpiStrip[]` | Display backend label/value/support strings. | No stable KPI keys for cases in worklist, exposure, average age, audit coverage, or completion counts. Do not map mockup KPI meanings onto unrelated labels. |
| Queue counts and tabs | Current `worklist[]` length may support local fetched-row count only if labelled as fetched rows. | Local tab/filter controls may filter already-fetched rows and show local result counts if clearly local. | No total queue size, recommended count, high-exposure count, in-review count, or backend tab totals. |
| Potential exposure / dollars | `worklist[].amount`, `kpiStrip[]`, `recoveryTracker` backend strings only. | Display exact strings; align tabularly. | React must not parse, add, round, or recompute money. |
| Source readiness row | `ConnectorReadinessCockpitModel.sourceTiles[]`, `connectors[]`, `lastRefreshedLabel` | Map `statusTone` only to semantic badge/tone variants. Display backend strings. | Do not infer live/synthetic status from missing credentials in React. |
| Row status badges | `worklist[].routingLabel`, `verdictLabel`, `queueLabel`, `selected.draft.statusLabel` only where the row matches `selected.lineId`. | Render as advisory/queue state, not completion state. | No row-level `approved`, `new`, `in review`, `audit verified`, or completion state in current contract. |
| Footer pagination | Current `worklist[]` fetched array only. | Use local Button/Select controls if visual parity requires paging; disable unavailable actions. | No backend total results, cursor, page size, page count, or server pagination. |
| Last updated | None in current Forensics cockpit contract. | Omit or render `Unavailable`/`Contract gap` only if a visible slot is required. | Do not use browser time, current date, build time, `lastRefreshedLabel`, or mockup timestamps as row update time. |

Explicit allowlist for Beat 12 runtime facts:

- `worklist[]` may drive table rows, local selection, row labels, line IDs, customer labels, routing/verdict labels, recommendation labels, evidence labels, queue labels, and amount display.
- `selected` may drive deeper evidence/draft/HITL context only when the selected/focused row contains `model.selected.lineId`.
- `actionInbox[]` may show pending human action context only; it must not be converted into completed counts or row completion state.
- `kpiStrip[]` may display backend strings only; do not infer stable KPI semantics by label unless a later backend contract adds keys.
- `ConnectorReadinessCockpitModel` may drive source readiness only.
- Anything outside these fields must be omitted or displayed as `Unavailable` / `Contract gap`.

## 4. Interaction Contract

Beat 12 must preserve the difference between local queue navigation and backend state mutation.

Required interactions:

- Return-to-worklist navigation: the user can navigate from audit confirmation back to the worklist without losing visible record/context continuity.
- Row hover: quiet table hover state only. No hover scale, rotate, or decorative motion.
- Row focus: keyboard-visible focus state.
- Row selection: selecting a row sets local client state keyed by `worklist[].lineId`.
- Next case button: may move local focus to a fetched row only if labelled as local navigation. It must not claim backend recommendation, completion, or decision refresh without a backend field.
- Recommended action hover/focus: tooltip may expose backend `recommendedActionLabel`, `evidenceLabel`, and `confidenceLabel`.
- Audit toast close: dismisses UI notification only; it must not alter backend state or row status.
- Filters/columns controls: may open local `DropdownMenu` controls for display affordances only. They must not imply server filters or persisted views unless implemented by backend contract.

Backend honesty rule:

- If there is no backend post-audit refresh or row mutation endpoint, Beat 12 may only render already-fetched `worklist[]` data and local UI focus. It must not claim Forensics reran, evidence refreshed, audit state changed, dollars recalculated, queue counts changed, or a case completed.

Accessibility requirements:

- Row selection must be reachable by keyboard with `Enter` and `Space`.
- Selected row must expose `aria-selected`.
- The next-case control requires an accessible label that says what it does locally.
- Icon-only controls require accessible labels and tooltips where meaning is not obvious.
- Toast content must also be represented by accessible status semantics; critical audit state cannot exist only in a transient toast.

## 5. Shadcn Component Map

Use installed shadcn components from `cockpit/components/ui` only unless a later implementation brief explicitly authorizes adding another registry item.

Required Beat 12 primitives:

| Need | Shadcn component |
|---|---|
| Persistent navigation/sidebar | `Sidebar`, `ScrollArea`, `Separator`, `Tooltip`, `Button` |
| KPI strip | `Card`, `Badge`, `Tooltip`, `Skeleton` |
| Source readiness row | `Card`, `Badge`, `Tooltip`, `Separator`, `Alert` for unavailable sources |
| Worklist table | `Table`, `ScrollArea` |
| Optional local row checkbox selection | `Checkbox` |
| Row status, routing, evidence, queue, line IDs | `Badge` |
| Recommended action explanation | `Tooltip` |
| Filters, columns, row actions | `DropdownMenu` with `DropdownMenuGroup` |
| Rows-per-page local control | `Select` if needed; no server semantics |
| Local previous/next/page buttons | `Button` with disabled state |
| Empty or unsupported contract state | `Empty` |
| Backend gap or read-model mismatch | `Alert` |
| Audit confirmation notification | `sonner` toast only after real backend/read-model support |

Icon rules:

- Use lucide icons only.
- Use icon-leading or icon-only `Button` composition with `data-icon` on icons.
- No custom SVG illustration, emoji icon, or mixed icon family for Beat 12.
- Recommended action may use a lucide advisory icon such as `BotIcon`, `LightbulbIcon`, `SparklesIcon`, or the closest existing equivalent, but the copy must remain advisory.

Composition rules:

- Use `Table` rows and cells for the worklist, not role-based div tables.
- Use `Sidebar` for the persistent navigation shell, not a bespoke nav surface.
- Use `Badge` for statuses and tones; do not build custom styled spans.
- Use `Alert` for visible contract gaps or unavailable data.
- Use `Empty` for no rows or unsupported filtered states.
- Use `Separator` for structural dividers.
- Use semantic tokens and shadcn variants; no raw ad hoc status color ramps.
- `Pagination` is not installed in this repo. Do not import it unless a later brief approves adding it.
- Full `Card` anatomy is required wherever a card is used.

## 6. Return-To-Worklist And Next-Case State Constraints

Beat 12 must not fake queue mutation or completion counts.

Allowed:

- Local focus can move from the previously selected row to another fetched `worklist[]` row.
- The UI can label a row as locally selected/focused.
- The UI can show `Recommended action` from `worklist[].recommendedActionLabel`.
- The UI can display pending human-action context from `actionInbox[]`.
- A confirmation toast can be shown only when a real approval/audit response or refreshed read model exposes that state.

Banned:

- Do not decrement queue counts after a local click.
- Do not increment completed, approved, audit coverage, or closed counts in React.
- Do not mark a row `Approved`, `Audit verified`, `Closed`, `Completed`, or `Monitor & Close` unless backend data supplies that exact state.
- Do not select the next case by sorting amount, confidence, routing, verdict, array order, customer name, or mockup values.
- Do not persist optimistic business state if backend rejects or omits the audit/update.
- Do not reuse `model.selected` evidence, draft, approval actions, or record IDs for a different clicked row.
- Do not dispatch recovery, route Billing, approve, send correspondence, write ERP data, mutate source systems, or imply any external action without HITL approval.

Preferred future backend contract for a richer Beat 12:

- `ForensicsCockpitModel.queueSummary.totalOpenCount`
- `ForensicsCockpitModel.queueSummary.localPageCount`
- `ForensicsCockpitModel.queueSummary.auditCoverageLabel`
- `ForensicsCockpitModel.queueSummary.averageAgeLabel`
- `ForensicsCockpitModel.queueSummary.completedTodayCount`
- `ForensicsCockpitModel.nextRecommendedLineId`
- `ForensicsCockpitModel.nextRecommendedBasisRecordIds`
- `worklist[].priorityLabel`
- `worklist[].ageLabel`
- `worklist[].statusLabel`
- `worklist[].auditStateLabel`
- `worklist[].lastUpdatedLabel`
- `worklist[].referenceLabel`
- `auditToast.statusLabel`
- `auditToast.entryHash`
- `auditToast.recordIds`

Until those fields exist, Beat 12 remains a local return/focus state over fetched read-model data.

## 7. No-Fake-Data And No-Autonomous-Action Language Rules

No fake data:

- React must not fabricate totals, row priority, owner, age, timestamps, references, audit coverage, recommendation ranking, status history, completion counts, dollars, audit state, approval status, or backend refresh state.
- React must not compute money, thresholds, evidence sufficiency, decision readiness, queue completion, audit coverage, or approval eligibility.
- Display `Unavailable` or `Contract gap` when the backend/read model does not expose the mockup field.
- Do not map mockup values into fixtures or constants.

No autonomous action:

- Allowed copy: `Return to worklist`, `Next case`, `Recommended action`, `Forensics recommendation`, `Advisory only`, `Open investigation`, `Review row`, `Audit status unavailable`.
- Banned copy: `auto recover`, `auto approve`, `send`, `execute`, `write back`, `agent will`, `recovered`, `cleared by AI`, `completed`, `closed`, or any phrasing that implies external action without human approval.
- Any external action remains blocked behind HITL approval per I-7 and I-20.
- ERP write-back remains prohibited per I-26; the billing loop remains draft-only per I-23.

## 8. Screenshot Comparison Checklist

Target screenshot path for the build pass:

- `output/playwright/e2e/maya-beat-12-return-worklist.png`

Pass criteria: reviewer score must be `>=4/5`. Scores `1/5`, `2/5`, and `3/5` remain failed/pending.

Checklist:

- First viewport matches the Beat 12 mockup anatomy: persistent sidebar, worklist title, KPI strip, compact source-readiness row, dense table, and local queue controls.
- Screen reads as return-to-worklist, not selected-case detail or audit-only confirmation.
- Worklist is table-led and compact; no card-everything layout.
- Any next-case focus is visibly a local/fetched-row selection unless backend fields support recommendation ranking.
- Audit toast appears only when backed by real response/read-model state; otherwise the UI shows no fake audit success.
- Queue counts, completion counts, audit coverage, age, priority, last-updated, and status fields are backend-backed or explicitly unavailable.
- Amounts and dollars are displayed exactly as backend strings; React does not parse or recompute them.
- Source readiness uses `/connectors` data and does not label synthetic or blocked sources as live.
- Recommended action remains advisory and does not imply autonomous execution.
- Keyboard focus, row selection, and icon-only controls are accessible.
- Visual language remains shadcn-only, light-first, premium operational B2B.
- No generated UI tells from `AGENTS.md` section 5.1 dominate the screen.

## 9. Future Verification

Documentation-only spec edit verification:

- `git diff -- docs/storyboards/maya-beat-12-shadcn-spec.md`
- `git diff --check -- docs/storyboards/maya-beat-12-shadcn-spec.md`
- `git status --short`

Later Beat 12 implementation verification:

- Unit/component tests for return-to-worklist navigation, local next-case focus, row keyboard selection, toast gating, and read-model mismatch handling.
- Tests proving local controls do not mutate queue counts, completion counts, audit state, approval state, dollars, or backend records.
- Invariant tests if any decision, provenance, HITL, approval, draft, audit, or external-action surface is touched.
- Route/auth tests only if `/forensics/shadcn`, `/forensics`, login default routing, or session access changes.
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- Focused E2E screenshot capture for `output/playwright/e2e/maya-beat-12-return-worklist.png`.
- Visual comparison against `mockups/imagegen/maya-12-beat-storyboard/12-return-to-worklist-next-case.png` at desktop widths including `1440px` and `1280px`.
- Full `npm run verify` before claiming the broader Maya shadcn goal is complete.
