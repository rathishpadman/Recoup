# Maya Beat 5 Shadcn Spec: Evidence Dossier Pod Reviewed

Status: draft for user review before any Beat 5 implementation.

Success check for this spec: a future build worker can implement only the Beat 5 evidence-dossier reviewed-pod state from this document without inventing evidence, provenance, review completion, source counts, dollars, decisions, or autonomous action state.

## 1. Purpose And Approval Gate

Beat 5 covers only the evidence dossier moment after Maya opens the selected case and reviews an evidence pod. The target state is the Evidence tab with one dossier pod expanded, supporting evidence rows visible, deterministic basis summarized, and provenance kept explicit.

This document is a spec, not implementation authorization. Beat 5 implementation waits for prior beat approval, then explicit user approval of this Beat 5 spec. The approved methodology remains:

1. Mockup.
2. Spec.
3. Build.
4. Compare.

Non-goals:

- Do not implement UI code from this document.
- Do not change backend contracts in the Beat 5 UI pass unless a later brief explicitly names those files.
- Do not edit tests, cockpit UI, `cockpit/next-env.d.ts`, or dirty Beat 2 files from this spec pass.
- Do not invent case IDs, claim dates, source systems, pod names, evidence row timestamps, record IDs, review completion, deterministic criteria, provenance totals, dollars, approvals, decisions, or external-action state in React.

## 2. Mockup Target And Visual Contract

Primary Beat 5 mockup:

- `mockups/imagegen/maya-12-beat-storyboard/05-evidence-dossier-pod-reviewed.png`

Storyboard state:

- Maya is inside an opened shortage claim case.
- The Evidence tab is active.
- The main work area is an evidence dossier with one expanded pod and additional collapsed pods.
- A right rail summarizes deterministic basis and source provenance.
- A bottom success/readout banner indicates evidence review status only when backend-backed.

Layout contract:

- Persistent left sidebar remains, with compact navigation and selected `Cases` state.
- Top case bar remains visible with breadcrumb, search, notification/user controls, case title, status, metadata, and actions control only if backend-backed or already approved shell copy.
- Tab strip shows the case workflow with `Evidence` active.
- Main content uses a two-column evidence page:
  - Left wide pane: `Evidence Dossier` heading, filter/view controls, pod accordion, expanded pod table, collapsed pod rows.
  - Right narrow rail: deterministic basis criteria, source provenance list, and synthetic/live provenance warning.
  - Bottom page-width status banner: review state, if and only if the backend exposes it.
- Evidence pods are dense operational rows, not decorative cards. The expanded pod uses a table with columns for evidence item, event/date label if available, record ID, source, and verification.
- Collapsed pods show pod name and backend-backed count/status only. They do not imply review completion when the backend lacks review state.
- Provenance hierarchy is visually clear: record IDs and document IDs sit inside the dossier, deterministic basis sits in the right rail, source provenance is secondary and must not claim synthetic data is live.

Visual goals:

- Light-first, premium B2B SaaS command surface.
- Shadcn-only composition using installed primitives in `cockpit/components/ui`.
- Evidence-first information density: rows, badges, separators, and compact rails over card-heavy decoration.
- No old bespoke `premium-components` surface language.
- No purple/blue gradient treatment, glassmorphism, decorative hero, or fake source badges.
- No raw backend enum names as primary business copy unless the backend already provides a human label.
- Mockup text, numbers, labels, record IDs, source names, dates, and dollars are visual-only. Runtime truth comes from backend/read-model fields.

## 3. Backend Data Contract Mapping

Beat 5 route target:

- `cockpit/app/forensics/shadcn/page.tsx`

Current route behavior:

- Calls `requireRouteAccess("/forensics")`.
- Fetches `fetchForensicsModel()` from `GET /forensics`.
- Fetches `fetchConnectorReadinessModel()` from `GET /connectors`.
- Renders `MayaForensicsSurface`.

Current data transport:

- `cockpit/app/cockpit-data.ts` reads `RECOUP_API_URL` or falls back to `http://127.0.0.1:4317`.
- `src/services/cockpitApi.ts` exposes `GET /forensics`, `GET /connectors`, `POST /approval`, `POST /query/realtime-client-secret`, and `POST /query/realtime-tool`.
- `buildForensicsCockpitModel()` selects one recovery decision as `model.selected` and exposes `worklist[]`, `selected.evidencePack`, `selected.draft`, `selected.approvalActions`, `actionInbox[]`, `mayaJourney[]`, and `multimodalDock`.
- Current shadcn evidence component renders `selected.evidencePack.recordIds` and `selected.evidencePack.documents[]` in a table plus accordion. It does not have structured pods, review criteria, source provenance counts, event timestamps, or evidence-review completion state.

| UI element | Source field/route | Allowed formatting | Missing/gap |
|---|---|---|---|
| Evidence tab active state | Local case workspace/tab state in `DeductionCaseWorkspace`; deep evidence from `model.selected` only when the selected worklist row includes `model.selected.lineId` | Activate `Evidence` tab and render the backend-selected packet. If row mismatch exists, show `Empty` or `Alert`. | No backend row-switch endpoint. Do not reuse `model.selected.evidencePack` for a different clicked worklist row. |
| Case title/context | `worklist[].scenarioLabel`, `worklist[].customerLabel`, `worklist[].lineIds`, `selected.lineId`, `selected.draft.statusLabel` | Display backend strings; use status `Badge` variants only. | No true mockup case ID, claim date, carrier, claimant, or amount-claimed metadata. Do not fabricate Crestline mockup values. |
| Dossier record ID strip | `selected.evidencePack.recordIds[]` | Render as `Badge` chips or compact inline list. Preserve exact IDs. | No record family labels or evidence criterion mapping per ID. |
| Evidence documents table | `selected.evidencePack.documents[]` with `citationId`, `description`, `documentId`, `documentType`, `relevance`, `sourceLabel`, `summary`, `verifiedLabel` | Render backend strings exactly, with harmless wrapping and truncation. `documentId` or `citationId` may be the row key/display ID. | No event date/time, item display title separate from summary, API/SYS tone, document owner, or review actor field. |
| Expanded evidence pod | Current backend has flat `documents[]`; a future backend may expose `evidencePods[]` | If no pod model exists, render one honest backend-backed pod such as `Evidence documents` and do not show mockup pod counts as facts. If pod model is added, render backend pod names/counts. | No `podId`, `podLabel`, `podCount`, `podStatus`, `podReviewed`, or per-pod criteria. |
| Collapsed evidence pods | Future backend `evidencePods[]` only | Render collapsed `AccordionItem` rows only for backend-provided pods. | Current contract cannot support `Shipment Details`, `Inventory and Shortage Claim`, `Communications`, or `Adjustments and Financials` as factual pod groups. |
| Filter/view controls | Local UI affordance over already-fetched `documents[]` | Filter by backend strings already present in `documents[]`; view options can change display density only. | No saved view, server filter, review queue, or pod-filter backend route. |
| Deterministic basis criteria | No current structured field. Related evidence and basis text exist in `selected.draft.basis`, `selected.evidencePack.recordIds`, and decision-derived documents. | Display backend basis text as text only. Do not convert docs length or document types into `3 of 3` criteria. | Need future `selected.deterministicBasisCriteria[]` with label, status, support, recordIds, and deterministic basis. |
| Review satisfied banner | No current field. `selected.draft.statusLabel` is action/HITL state, not evidence-review completion. | Show `Unavailable` or omit the satisfied banner unless a backend field explicitly says review is satisfied. | Need future `selected.evidenceReviewStatus` or `selected.evidenceReviewState` with status label, basis, criteria count, and recordIds. |
| Source provenance list | `/connectors.sourceTiles[]`, `/connectors.connectors[]`, and `documents[].sourceLabel` | Show connector status/source mode from `/connectors`; show document source labels exactly. Any grouping by source must be display-only and must not imply sufficiency or live status. | No per-source evidence item totals, source domains, API/SYS tags, or source trust criteria in the Forensics evidence packet. |
| Synthetic/live warning | `/connectors.sourceTiles[].statusTone`, `connectors[].sourceMode`, `connectors[].sourceContractMode`, `connectors[].reason` | Render backend-provided synthetic/live/blocked labels honestly. | Do not infer live data from missing credentials or mockup source names. |
| Evidence empty state | `selected.evidencePack.documents.length === 0` | Use `Empty` with a read-model gap message. | Empty state cannot classify the case, approve action, or mark evidence missing unless backend says so. |
| Approval/action controls | `selected.approvalActions[]`, `selected.draft`, `actionInbox[]`, `POST /approval` only in later approved approval beat | For Beat 5, controls remain absent or disabled/read-only. | Evidence review must not dispatch approval, recovery, Billing routing, correspondence, or ERP write-back. |

Preferred future backend contract for exact mockup parity:

- `ForensicsCockpitModel.selected.caseHeader`
- `ForensicsCockpitModel.selected.evidenceReviewStatus`
- `ForensicsCockpitModel.selected.deterministicBasisCriteria[]`
- `ForensicsCockpitModel.selected.evidencePods[]`
- `ForensicsCockpitModel.selected.evidencePods[].items[]`
- `ForensicsCockpitModel.selected.evidencePods[].items[].eventAtLabel`
- `ForensicsCockpitModel.selected.evidencePods[].items[].sourceToneLabel`
- `ForensicsCockpitModel.selected.sourceProvenance[]`
- `ForensicsCockpitModel.selected.sourceProvenance[].recordIds`

Until those fields exist, Beat 5 must render honest gaps rather than mockup facts.

## 4. Interaction Contract

Evidence review state:

- Beat 5 may open the Evidence tab for the backend-selected case packet.
- If backend exposes an evidence review state, render it as read-only state with cited record IDs and deterministic basis.
- If backend does not expose review state, do not display `review satisfied`, `3 of 3`, `all criteria satisfied`, or equivalent completion copy.
- `selected.draft.statusLabel` may be shown as draft/HITL state only. It must not be relabeled as evidence review completion.

Pod selection and inspection:

- Pod expansion/collapse may be local UI state over already-fetched backend evidence.
- If current flat `documents[]` remains the only source, a future build may show one expanded `Evidence documents` pod and avoid additional collapsed pods.
- Additional pods may be selectable/inspectable only when a backend-backed `evidencePods[]` contract exists.
- Inspecting a document row may reveal `summary`, `description`, `documentType`, `sourceLabel`, `verifiedLabel`, `citationId`, and `relevance` from the current packet.
- Row inspection must not call `POST /run`, `POST /approval`, realtime query routes, SAP reads, or any external action route.

Filtering and view options:

- Local filtering may search current `documents[]` display strings only.
- View options may change density, visible columns, or grouping only over already-fetched fields.
- Filters must not recompute evidence sufficiency, priority, basis status, or provenance trust.

Accessibility requirements:

- Evidence pods use `Accordion` or `Collapsible` with keyboard-operable triggers.
- Expanded pod tables use `Table` semantics.
- Icon-only filter/view buttons need accessible labels.
- Verification/source badges cannot be the only place where critical state is communicated.
- Empty or contract-gap states must be available as visible text, not only tooltip content.

## 5. Shadcn Component Map

Use installed shadcn components from `cockpit/components/ui` only unless a later implementation brief explicitly authorizes adding another registry item.

Required Beat 5 primitives:

| Need | Shadcn component |
|---|---|
| Workspace shell/navigation | `Sidebar`, `ScrollArea`, `Separator`, `Tooltip`, `Button` |
| Case header and metadata | `Card`, `Badge`, `Button`, `DropdownMenu`, `Separator` |
| Case tabs | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` |
| Evidence pods | `Accordion` or `Collapsible`, `Badge`, `Separator` |
| Expanded evidence rows | `Table`, `ScrollArea`, `Badge`, `Tooltip` |
| Filter/view controls | `Button`, `DropdownMenu`, `InputGroup` only if search is included |
| Deterministic basis rail | `Card`, `Badge`, `Separator`, `Alert` |
| Source provenance rail | `Card`, `Badge`, `Table` or compact list with `Separator` |
| Backend gap / synthetic warning | `Alert`, `Empty` |
| Loading/failure states | `Skeleton`, `Alert`, `Empty` |

Composition rules:

- Use full `Card` anatomy where a card is needed.
- Use `AccordionItem`/`AccordionTrigger`/`AccordionContent` or `Collapsible` for pods, not custom clickable divs.
- Use `Table` for expanded pod evidence rows.
- Use `Badge` for source and verification labels, not custom styled spans.
- Use `Alert` for backend gaps, unsupported review state, or synthetic/live caveats.
- Use `Empty` for no evidence documents or wrong-row deep-detail gaps.
- Use `Separator` instead of ad hoc border dividers.
- Use lucide icons inside buttons with `data-icon`.
- Use semantic tokens and component variants; no raw ad hoc color ramps for business status.
- Keep `TabsTrigger` inside `TabsList` and grouped menu items inside `DropdownMenuGroup`.

## 6. No Fake Evidence, Provenance, Or Autonomous Action Rules

Beat 5 must preserve the Recoup invariants:

- No model-asserted or React-computed dollar amount.
- No agent or UI decision without cited record IDs and deterministic basis.
- No invalid/partial deduction or recovery route without supporting documents.
- No external action without human approval.
- No ERP write-back or write-capable ERP client.
- No synthetic source rendered as live.

Runtime rules:

- All evidence rows come from `selected.evidencePack.documents[]` or a future backend `evidencePods[]`.
- All record IDs come from backend `recordIds`, `lineIds`, document IDs, or citation IDs.
- All source provenance comes from `/connectors` or backend evidence source labels.
- All review status and deterministic criteria must be backend fields; React must not infer them from document counts or source labels.
- Mockup-specific Crestline values, pod names, timestamps, source domains, and `3 of 3` status are not data.
- If backend data is missing, render `Unavailable`, `Contract gap`, `Empty`, or `Alert`.
- Allowed copy: `Evidence dossier`, `Cited documents`, `Deterministic basis unavailable`, `Review state unavailable`, `Backend evidence packet`, `Source provenance`.
- Banned copy without backend support: `review satisfied`, `all criteria satisfied`, `3 of 3`, `source verified by API`, `auto recover`, `auto approve`, `send`, `execute`, `write back`, `agent will`, `recovered`, or `cleared by AI`.

## 7. Screenshot Comparison Checklist

Target screenshot path for the future build pass:

- `output/playwright/e2e/maya-beat-05-evidence-dossier.png`

Pass criteria: reviewer score must be `>=4/5`. Scores `1/5`, `2/5`, and `3/5` remain failed/pending.

Checklist:

- Evidence tab is active inside an opened case workspace, not the Beat 2 landing dashboard.
- Persistent sidebar and top case context remain visually integrated.
- Main evidence dossier has a clear heading, compact controls, one expanded pod, and backend-backed evidence rows.
- Collapsed pods are present only when backend-backed; otherwise the UI uses honest flat-packet or contract-gap handling.
- Evidence rows display only backend document/record fields and do not fabricate timestamps or source tags.
- Right rail separates deterministic basis from source provenance.
- Deterministic basis does not claim `3 of 3` or satisfied criteria unless backend-backed.
- Source provenance does not label synthetic/demo sources as live.
- Bottom review banner appears only when backend-backed; otherwise unavailable state is honest and understated.
- Pod expansion, row inspection, filters, and view options do not dispatch external actions or rerun decisions.
- No wrong-row evidence is shown when UI-selected worklist row does not match `model.selected.lineId`.
- No legacy Maya premium/custom visual language is obvious.
- No generated UI tells listed in `AGENTS.md` section 5.1 dominate the screen.

## 8. Tests And Verification For Future Build Pass

Documentation-only spec edit verification:

- `git diff -- docs/storyboards/maya-beat-05-shadcn-spec.md`
- `git diff --check -- docs/storyboards/maya-beat-05-shadcn-spec.md`
- `git status --short`

Later Beat 5 implementation verification:

- Component tests for Evidence tab activation, expanded/collapsed pod behavior, and keyboard operation.
- Test that deep evidence renders only when selected row matches `model.selected.lineId`.
- Test that current flat `documents[]` renders without fabricated pod names, pod counts, timestamps, or review completion.
- Test that backend-provided evidence rows render `citationId`, `documentId`, `documentType`, `description`, `summary`, `sourceLabel`, `verifiedLabel`, and `relevance` from props.
- Test that deterministic basis and review-satisfied states are absent or marked unavailable when no backend field exists.
- Test that source provenance uses `/connectors` and does not render synthetic sources as live.
- Test that filter/view/pod controls do not call `POST /approval`, `POST /run`, realtime query routes, or external action routes.
- Route/auth tests if `/forensics/shadcn` access, login cutover, or session requirements change.
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- E2E screenshot capture for `output/playwright/e2e/maya-beat-05-evidence-dossier.png`.
- Visual comparison against `mockups/imagegen/maya-12-beat-storyboard/05-evidence-dossier-pod-reviewed.png`.
- Full `npm run verify` before claiming the broader Maya shadcn goal is complete.
