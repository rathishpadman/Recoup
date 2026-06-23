# Maya Beat 4 Shadcn Spec: Case Overview Crestline Opens

Status: draft for user review before any Beat 4 implementation.

Success check for this spec: a future build worker can implement only the Beat 4 case-open overview state from this document without inventing backend facts, using old premium/custom UI modules, or enabling any autonomous action.

## 1. Purpose And Approval Gate

Beat 4 covers only the case overview state after Maya opens a work item from the worklist. The visual target is the opened Crestline shortage case in the storyboard, but runtime data must come only from the existing Forensics and connector read models.

This document is a spec, not implementation authorization. Beat 4 implementation waits for prior beat approval, then explicit user approval of this Beat 4 spec. The approved methodology remains:

1. Mockup.
2. Spec.
3. Build.
4. Compare.

Non-goals:

- Do not implement UI code from this document.
- Do not change backend contracts in the Beat 4 UI pass unless a later brief explicitly names those files.
- Do not edit tests, cockpit UI, `cockpit/next-env.d.ts`, or dirty Beat 2 files from this spec pass.
- Do not invent case IDs, customer contacts, dates, owners, line details, notes, timelines, evidence status, dollars, approvals, decisions, or route status in React.

## 2. Mockup Target And Visual Contract

Primary Beat 4 mockup:

- `mockups/imagegen/maya-12-beat-storyboard/04-case-overview-crestline-opens.png`

Storyboard state:

- Maya has opened a shortage work item from the worklist.
- The screen is no longer a landing dashboard; it is a case workspace with a selected case loaded.
- The worklist remains visible as a narrow middle rail, with the selected row highlighted.
- The main pane shows the selected case header, selected line summary, tabs, overview details, evidence review status, draft/approval lock state, notes, and timeline.

Layout contract:

- Left sidebar is persistent and dark, using compact navigation and a human operator footer.
- Worklist rail sits immediately to the right of the sidebar and remains dense: selected item, surrounding items, count/page controls, and no card-heavy dashboard layout.
- Main workspace is a wide case detail surface with a breadcrumb/top bar, header metadata, line summary, tab strip, and overview content.
- The header hierarchy is: case identifier/title, route/status badges, read-only amount block, then metadata rows.
- Amount is visibly read-only and locked; the UI must not imply Maya or the model can edit it.
- Selected-line block is a bordered information band with line index and compact line facts.
- Tabs are visible in this order when backend-backed or safely disabled: `Overview`, `Evidence`, `Agent Trace`, `Draft`, `Audit`.
- Overview content uses a two-column operational layout:
  - Left: deterministic basis summary.
  - Right: evidence review requirement and disabled draft/approval state.
  - Bottom: notes and timeline only if backend-backed, otherwise honest unavailable states.

Visual goals:

- Light-first, premium B2B SaaS command surface.
- Dense case-operations feel; no centered generic dashboard and no marketing hero.
- Shadcn-only composition using installed primitives in `cockpit/components/ui`.
- No old bespoke `premium-components` surface language.
- No purple/blue gradient treatment, glassmorphism, decorative hero, or card-everything layout.
- No raw backend enum names as primary business copy unless the backend already provides a human label.
- Mockup text, numbers, labels, record IDs, and dollars are visual-only. Runtime truth comes from backend/read-model fields.

## 3. Backend Data Contract Mapping

Beat 4 route target:

- `cockpit/app/forensics/shadcn/page.tsx`

Current route behavior:

- Calls `requireRouteAccess("/forensics")`.
- Fetches `fetchForensicsModel()` from `GET /forensics`.
- Fetches `fetchConnectorReadinessModel()` from `GET /connectors`.
- Renders `MayaForensicsSurface`.

Current data transport:

- `cockpit/app/cockpit-data.ts` reads `RECOUP_API_URL` or falls back to `http://127.0.0.1:4317`.
- `src/services/cockpitApi.ts` exposes `GET /forensics`, `GET /connectors`, `POST /approval`, and realtime query routes.
- `buildForensicsCockpitModel()` selects one recovery decision as `model.selected` and exposes `worklist[]`, `selected.evidencePack`, `selected.draft`, `selected.approvalActions`, `actionInbox[]`, `mayaJourney[]`, and `multimodalDock`.

| UI element | Field/source | Allowed formatting | Missing/gap |
|---|---|---|---|
| Breadcrumb/top bar | Route shell only; no current `/forensics` breadcrumb field. | Use static product navigation labels only if already approved by route copy. Do not encode mockup `Shortages > Case...` as fact. | No backend `caseTypeLabel`, `caseId`, or breadcrumb model. |
| Selected worklist row | `ForensicsCockpitModel.worklist[]`; UI state may hold the clicked row from already-fetched data. | Highlight clicked row; render `scenarioLabel`, `customerLabel`, `amount`, `queueLabel`, `lineIds`, `evidenceLabel` as backend strings. | No backend row-switch endpoint. Detail can be deep only when clicked row contains `model.selected.lineId`. |
| Case identifier/title | Prefer `selectedWorklistItem.scenarioLabel`; fallback `selected.draft.actionLabel`. | Display backend string exactly; may pair with `selected.lineId` as technical identifier. | No true case ID like `CS-2025-04128`; do not fabricate. |
| Customer summary | `selectedWorklistItem.customerLabel`; optional `customerId` if present. | Display as provided. | No customer contact, email, store/DC, owner, received date, due date, or currency fields. |
| Route/status badges | `selectedWorklistItem.routingLabel`, `verdictLabel`, `confidenceLabel`, `queueLabel`; `selected.draft.statusLabel`. | Map to `Badge` variants and human layout only; do not change meaning. | No explicit severity/priority value such as `Medium`; do not infer from confidence or routing. |
| Read-only amount block | `selectedWorklistItem.amount` or `selected.draft.amount`. | Display backend-formatted string; add read-only/lock affordance as UI copy. Never parse or recompute. | No separate editable-state field; read-only is required by Recoup invariant posture, not a backend toggle. |
| Case metadata strip | Only `customerLabel`, `customerId`, `lineIds`, `lineCount`, `scenarioType`, `routingLabel`, `queueLabel` exist. | Use compact label/value rows. | No contact, received timestamp, due date, currency, owner, AP email, or external case age fields. |
| Selected line banner | `model.selected.lineId`; `selectedWorklistItem.lineIds`; `selectedWorklistItem.lineCount`. | Show `Line n of m` only if selected line can be located inside `lineIds`; otherwise show backend mismatch/unavailable. | No product, SKU, store/DC, invoice, ship date, quantity, or unit fields in current Forensics cockpit contract. |
| Overview tab | Current opened state can show `selected.draft.basis`, `selected.evidencePack.recordIds`, `selectedWorklistItem` labels. | Render as deterministic basis summary only when the text is backend-provided. | No structured basis rows for inventory window, tolerance, rounding rule, duplicate check, or blocking conditions. |
| Evidence review required panel | `selected.evidencePack.documents[]`, `selected.evidencePack.recordIds`, `selectedWorklistItem.evidenceLabel`, `evidenceScoreLabel`. | Show evidence presence and record IDs. If docs exist, label as backend-backed evidence available; if required review is product copy, keep it advisory. | No explicit `evidenceReviewRequired`, `reviewComplete`, or evidence-gate status field. |
| Draft and approval disabled block | `selected.draft.status`, `selected.draft.statusLabel`, `selected.approvalActions[]`, `actionInbox[]`. | Buttons remain disabled until the later Beat 9/10 flow is approved. Status labels may render. | No Beat 4 permission to preview draft, route approval, or post approval. No autonomous action. |
| Evidence tab | `selected.evidencePack.documents[]`. | Enable only if the clicked row corresponds to `model.selected.lineId`; otherwise show `Empty` or `Alert` gap. | No per-row evidence fetch. |
| Agent Trace tab | `multimodalDock.subAgents[]`; later query response from realtime routes only after explicit query flow. | For Beat 4, tab may be visible but empty/disabled unless existing backend-backed trace props are present. | No Beat 4 query execution. Live stream requires human auth and belongs to later beats. |
| Draft tab | `selected.draft`; `actionInbox[]`. | Display read-only draft metadata or disabled state only. | Opening/reviewing a recovery packet belongs to Beat 9. |
| Audit tab | `mayaJourney[]`; approval response only after human approval flow. | Display read-only journey entries and record IDs if present. | No hash-chain detail in this Forensics case overview contract. |
| Case notes | None. | Show unavailable/empty state only. | No notes read/write backend. Do not implement `Add note` unless a backend route is approved. |
| Case timeline | `mayaJourney[]` can support a backend-backed timeline. | Render labels, timestamps, statuses, and record IDs exactly as backend strings. | No generic `Case created` event unless it exists in `mayaJourney[]`. |
| Source health/context | `/connectors.sourceTiles[]`, `/connectors.connectors[]`. | Optional compact source status, using backend labels and tones only. | Do not infer live health or synthetic/live status in React. |

Preferred future backend contract, if product wants exact mockup parity:

- `ForensicsCockpitModel.selected.caseId`
- `ForensicsCockpitModel.selected.caseTitle`
- `ForensicsCockpitModel.selected.customerContact`
- `ForensicsCockpitModel.selected.receivedAtLabel`
- `ForensicsCockpitModel.selected.dueDateLabel`
- `ForensicsCockpitModel.selected.currencyLabel`
- `ForensicsCockpitModel.selected.ownerLabel`
- `ForensicsCockpitModel.selected.priorityLabel`
- `ForensicsCockpitModel.selected.selectedLineSummary`
- `ForensicsCockpitModel.selected.deterministicBasisRows`
- `ForensicsCockpitModel.selected.evidenceReviewStatus`
- `ForensicsCockpitModel.selected.caseNotes`
- `ForensicsCockpitModel.selected.caseTimeline`

Until those fields exist, Beat 4 must render honest gaps rather than mockup facts.

## 4. Interaction Contract

Opening a case/work item:

- Beat 4 begins when Maya selects a fetched `worklist[]` row.
- The UI may store the clicked `MayaWorklistItem` in local component state because the row is already fetched from `/forensics`.
- If `selectedWorklistItem.lineIds.includes(model.selected.lineId)` is true, the case overview may use `model.selected` for the opened detail.
- If the clicked row does not correspond to `model.selected.lineId`, show a contract-gap `Alert` or `Empty` state for deep details. Do not borrow `model.selected` evidence for the wrong row.
- Selection must not call `POST /run`, `POST /approval`, realtime query routes, SAP reads, or any external action route.

Overview/evidence/summary sections:

- Overview may show backend-backed case labels, selected line IDs, amount, verdict, queue, evidence count, deterministic basis text, and record IDs.
- Evidence summary may show `selected.evidencePack.documents[]` only for the backend-selected line.
- Evidence documents may show `citationId`, `description`, `documentId`, `documentType`, `relevance`, `sourceLabel`, `summary`, and `verifiedLabel`.
- Draft summary may show `selected.draft` as read-only state only.
- Timeline may show `mayaJourney[]` as read-only history.
- Notes are unavailable unless a future backend route exists.

Disallowed interactions in Beat 4:

- No approval submission.
- No draft preview or route-for-approval action.
- No external correspondence, ERP write-back, Billing routing, term/limit change, hold/freeze, or recovery dispatch.
- No realtime tool/query call from the case-open state.
- No client-side scoring, routing, evidence sufficiency, priority, or dollars.

## 5. Shadcn Component Map

Use installed shadcn components from `cockpit/components/ui` only unless a later brief explicitly justifies adding another registry item.

Required Beat 4 primitives:

| Need | Shadcn component |
|---|---|
| Workspace shell/navigation | `Sidebar`, `ScrollArea`, `Separator`, `Tooltip`, `Button` |
| Worklist rail | `Table` or compact list composed with `Button`, `Badge`, `ScrollArea`, `Separator` |
| Case header | `Card`, `Badge`, `Button`, `DropdownMenu`, `Tooltip`, `Separator` |
| Read-only amount/status | `Badge`, `Tooltip`, `Button` disabled state, lucide lock/info icons |
| Selected line band | `Card`, `Badge`, `Separator`, `Button` disabled state |
| Case tabs | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` |
| Deterministic basis summary | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `Separator`, `Badge` |
| Evidence review panel | `Alert`, `Card`, `Badge`, `Tooltip` |
| Draft/approval disabled panel | `Card`, `Button`, `Badge`, `Alert`, `Separator` |
| Notes/timeline gaps | `Empty`, `Alert`, `Card`, `ScrollArea` |
| Loading/failure states | `Skeleton`, `Alert`, `Empty` |

Composition rules:

- Use full `Card` anatomy where a card is needed.
- Use `TabsTrigger` only inside `TabsList`.
- Use `Alert` for backend gaps or unsupported contract states.
- Use `Empty` for unavailable notes, missing selected-row details, or no evidence documents.
- Use `Skeleton` for loading states, not custom pulse markup.
- Use `Badge` for statuses, not custom styled spans.
- Use `Separator` instead of ad hoc border dividers.
- Use lucide icons inside buttons with `data-icon`.
- Use semantic tokens and variants; no raw ad hoc color ramps for business status.
- Keep layout classes for structure and spacing; do not override shadcn colors/typography with one-off brand color hacks.

## 6. No Fake Data And No Autonomous Action Rules

Beat 4 must preserve the Recoup invariants:

- No model-asserted or React-computed dollar amount.
- No agent or UI decision without cited record IDs and deterministic basis.
- No invalid/partial deduction or recovery route without supporting documents.
- No external action without human approval.
- No ERP write-back or write-capable ERP client.
- No synthetic source rendered as live.

Runtime rules:

- All dollars come from `selectedWorklistItem.amount` or `selected.draft.amount`.
- All case decisions/statuses come from backend labels and statuses.
- All evidence claims come from `selected.evidencePack` and `worklist[]` evidence labels.
- Mockup-specific Crestline values are not data. They are visual anatomy only.
- If backend data is missing, render `Unavailable`, `Contract gap`, `Empty`, or `Alert`.
- Disabled buttons must not hide a real action path. They remain non-dispatching until the later approved beats.

## 7. Screenshot Comparison Checklist

Target screenshot path for the future build pass:

- `output/playwright/e2e/maya-beat-04-case-overview.png`

Pass criteria: reviewer score must be `>=4/5`. Scores `1/5`, `2/5`, and `3/5` remain failed/pending.

Checklist:

- The screen opens to a case detail state, not the Beat 2 landing dashboard.
- Persistent dark sidebar remains visually integrated.
- Worklist rail is visible, dense, and shows the selected row.
- Main header has clear case/title hierarchy, status badges, and a read-only amount block.
- Mockup-only Crestline facts are replaced by backend facts or honest contract gaps.
- Selected-line band uses real `lineIds`/`lineCount`/`lineId` data only.
- Overview tab is active and presents deterministic basis text, evidence record IDs, and backend-backed facts.
- Evidence review panel does not claim completion or requirement status unless backend-backed.
- Draft/approval controls are visibly disabled and non-dispatching.
- Notes show unavailable/empty state unless a backend notes contract exists.
- Timeline uses `mayaJourney[]` only.
- No wrong-row evidence is shown when UI-selected worklist row does not match `model.selected.lineId`.
- No legacy Maya premium/custom visual language is obvious.
- No generated UI tells listed in `AGENTS.md` section 5.1 dominate the screen.

## 8. Tests And Verification For Future Build Pass

Documentation-only spec edit verification:

- `git diff -- docs/storyboards/maya-beat-04-shadcn-spec.md`
- `git diff --check -- docs/storyboards/maya-beat-04-shadcn-spec.md`
- `git status --short`

Later Beat 4 implementation verification:

- Focused component tests for opening a worklist row into the case overview state.
- Test that deep evidence/detail sections render only when selected row matches `model.selected.lineId`.
- Test that non-matching selected rows render an honest backend contract gap.
- Test that amount, verdict, routing, confidence, evidence labels, draft status, and record IDs come from props.
- Test that action buttons in Beat 4 do not call `POST /approval`, realtime query routes, or external action routes.
- Route/auth tests if `/forensics/shadcn` route access or login cutover behavior changes.
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- E2E screenshot capture for `output/playwright/e2e/maya-beat-04-case-overview.png`.
- Visual comparison against `mockups/imagegen/maya-12-beat-storyboard/04-case-overview-crestline-opens.png`.
- Full `npm run verify` before claiming the broader Maya shadcn goal is complete.
