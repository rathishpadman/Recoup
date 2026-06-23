# Maya Beat 7 Shadcn Spec: Agent Trace In Progress

Status: draft for user review after prior beat approval.

Success check for this spec: a future build worker can implement only the Beat 7 agent-trace-in-progress state from this document without inventing agent steps, backend facts, evidence, citations, decisions, dollars, audit state, or autonomous action.

## 1. Purpose And Approval Gate

Beat 7 covers only the moment after Maya has opened the evidence query flow and the trace is actively progressing.

Primary mockup:

- `mockups/imagegen/maya-12-beat-storyboard/07-agent-trace-in-progress.png`

This document is a spec, not implementation authorization. Beat 7 must wait for prior beat approval before any UI/code/test build work starts. The approved methodology remains:

1. Mockup.
2. Spec.
3. Build.
4. Compare.

Non-goals:

- Do not implement UI code from this document.
- Do not modify `cockpit/`, `src/`, `tests/`, `datagen/`, `evals/`, or `audit/` in this first-step pass.
- Do not create a chatbot transcript, assistant avatar stream, or generic AI status widget.
- Do not invent trace steps, live progress, cited record IDs, source documents, deterministic basis, approvals, actions, dollars, or audit hashes in React.

## 2. Mockup Visual Contract

Beat 7 should read as a premium evidence operations screen with an in-progress agent trace, not a chatbot.

Mockup anatomy:

- Persistent Recoup/Maya workspace shell with the case context visible: `Case: Crestline`.
- Left sidebar focused on evidence navigation, with `Evidence` selected and compact case details pinned near the bottom.
- Main work area titled `Evidence`, with search/filter controls, a selected PDF evidence artifact, and a document viewer occupying most of the screen.
- Evidence artifact header exposes document type, record ID, source, collected timestamp, file size, and action icons.
- Document viewer presents the proof-of-delivery document as the primary visual object; metadata sits below it as custody/provenance, not as a decorative card stack.
- Right rail is a `Query Evidence Sheet` surface with the user query at top and a vertical trace timeline below.
- Trace rows show clear status states: complete steps with check marks, one running step with loading skeleton/progress affordance, and one pending step with muted status.
- The running step is calm and operational. It should imply progress through evidence reading and citation guardrails, not model personality.
- The trace should avoid oversized cards, decorative gradients, purple/blue AI tropes, chat bubbles, avatar messages, or explanatory filler copy.

Visual status vocabulary:

- Complete: subdued success badge and check icon.
- Running: active status badge plus skeleton rows or progress line inside the open row.
- Pending: muted badge and dotted/outline icon.
- Blocked/unavailable: `Alert` or muted blocked state with backend reason, if the backend exposes one.

Mockup copy is visual-only. Runtime text, labels, record IDs, and evidence facts must come from backend/read-model fields.

Exact-mockup implementation gate:

- The current backend/read model does not expose enough fields to implement the mockup exactly. A build worker must not ship a pixel-exact POD viewer, five live trace rows, live per-step status timeline, custody footer, toolbar metadata, hashes, collected timestamps, or pending guard row unless the backend/read-model contract below is added first.
- Until that contract exists, the honest current-data visual target is: Maya workspace shell, selected evidence document metadata/table or summary, selected record ID badges, a right query sheet/rail with the submitted local question while the session is open, a session-level running/blocked/error state from `RealtimeBrowserSessionSnapshot`, and static `multimodalDock.subAgents[]` displayed only as evidence context rows, not live trace progress.
- Any visual comparison against `07-agent-trace-in-progress.png` must score layout/anatomy against this honest target and list backend-contract deltas explicitly. The future build cannot fill those deltas with static React text or mockup literals.

## 3. Backend Data Contract Mapping

Current route and data surfaces:

- `cockpit/app/forensics/shadcn/page.tsx` fetches `fetchForensicsModel()` from `/forensics` and `fetchConnectorReadinessModel()` from `/connectors`.
- `cockpit/app/cockpit-data.ts` defines `ForensicsCockpitModel`, `TraceCockpitModel`, and `ConnectorReadinessCockpitModel`.
- `src/services/cockpitApi.ts` exposes `GET /forensics`, `GET /trace`, `GET /run`, `POST /run`, `POST /query/realtime-client-secret`, and `POST /query/realtime-tool`.
- `cockpit/components/maya/query-evidence-dock.tsx` starts a Realtime browser session and publishes `RealtimeBrowserSessionSnapshot`.
- `cockpit/components/maya/agent-trace-panel.tsx` currently renders query response status plus `multimodalDock.subAgents`.

| UI element | Source field/route | Allowed formatting | Missing/gap |
|---|---|---|---|
| Case label in top bar/sidebar | Existing Maya shell/session route context plus `ForensicsCockpitModel.selected.lineId` and selected worklist match from `/forensics.worklist[]` | Display backend strings. If a case/customer label is absent, show an honest unavailable state. | No dedicated `caseId`, `caseLabel`, `createdAt`, or active evidence-route contract matching the mockup sidebar details. |
| Evidence page title and navigation state | Route/view state for the future Beat 7 surface; existing shell labels only | UI may label the view `Evidence` if the user-approved beat route is evidence-focused. | Current implementation is tab/workspace based, not a dedicated evidence viewer route matching the mockup. |
| Selected evidence record chips | `/forensics.selected.evidencePack.recordIds[]` | Render as `Badge`; do not alter IDs beyond wrapping/truncation for layout. | No per-record display label, custody field, or hash field in the current selected evidence pack. |
| Evidence document list/header | `/forensics.selected.evidencePack.documents[]` with `citationId`, `description`, `documentId`, `documentType`, `relevance`, `sourceLabel`, `summary`, `verifiedLabel` | Render backend strings. Map `verifiedLabel` to neutral/success badge only if the string is backend-supplied. | No `collectedAt`, `fileSize`, `pdfUrl`, page count, custodian, retention, SHA hash, source-system code, or viewer toolbar data. |
| Proof-of-delivery viewer | Current evidence pack document summary can identify document rows | Show a compact document summary/table if no real PDF/image asset route exists. | No backend route exposes a renderable PDF/image, page bitmap, PDF URL, page count, zoom, barcode, signature image, or page text layout. Future contract needed before visual PDF viewer can be real. |
| Query text | `RealtimeBrowserSessionSnapshot.message` is status, not user query; the typed question lives in local component state in `query-evidence-dock.tsx` | Future UI may display the locally submitted question as local UI state, but it must be the user's submitted text, not generated copy. | No persisted `activeQuery.question` read-model field. Closing/reopening the dock clears local state. |
| Query policy | `/forensics.multimodalDock.policyLabel`, `languageLabel`, `modeOptions[]`, `promptPlaceholder`, `transcript` | Render as helper/policy text or badges; avoid AI marketing language. | Current labels are query-dock policy, not a full trace policy contract. |
| In-progress query state | `RealtimeBrowserSessionSnapshot.status`: `connecting`, `connected`, `answered`, `blocked`, `blocked_uncited_output`, `ended`, `error` | Map `connecting`/`connected` to running, `answered` to complete, `blocked*` to blocked, `error` to error, `ended` to neutral ended. | Snapshot is session-level, not per-step. It does not expose ordered trace steps. |
| Trace step names | `/forensics.multimodalDock.subAgents[]` with `name`, `query`, `source`, `artifacts`, `keyArtifact`, `statusLabel` | Render names and backend labels exactly except harmless casing/line wrapping. | Static sub-agent rows are built from selected decision evidence. They are not a live ordered timeline and currently include only three rows, while the mockup shows five steps. |
| Complete trace rows | `subAgents[].statusLabel` and available evidence documents | Show complete only when backend label says completed/complete or when a future backend step status explicitly says complete. | No stable enum for `complete`, `running`, `pending`, `blocked`. Current `statusLabel` is a display string. |
| Running trace row | `RealtimeBrowserSessionSnapshot.status` can indicate session-level `connecting` or `connected` | Display one session-level running state tied to the active query. Use `Skeleton` for progress; do not claim a named step is running unless backend exposes it. | No current field identifies which sub-agent is running. Mockup row `Evidence reader Running` requires a future `traceSteps[].status` contract. |
| Pending guard row | No current Forensics read-model field for pending citation/action guard | Show a contract-gap or omit until backend exposes it. | Future field needed: `traceSteps[]` with `stepId`, `label`, `status`, `recordIds`, `deterministicBasis`, `detailRows`, and optional `startedAt`/`completedAt`. |
| Cited evidence basis | `RealtimeBrowserSessionSnapshot.recordIds[]`, `deterministicBasis`, and `/forensics.selected.evidencePack.recordIds[]` | Render record IDs as badges and deterministic basis as backend text only. | `deterministicBasis` exists only after some Realtime/tool snapshots; static sub-agent rows lack `recordIds` and deterministic basis per step. |
| Audit trace model | `/trace.events[]` with `label`, `status`, `recordIds`, `deterministicBasis`, `entryHash`, `previousHash`, `sequence` | Can be referenced only as audit/governance trace if the Beat 7 build is explicitly wired to `/trace`. | Current `/trace` is Risk Mesh audit oriented, not a Maya evidence-query step trace. Do not use it to fake Forensics query progress. |
| Run SSE events | `/run` or `POST /run` streams `ForensicsSseEvent` from `run.trace`, plus optional live stream events when human auth allows | Future live trace may consume SSE if approved and tested. Render only event payload fields actually exposed. | Existing Maya Beat 7 route is not wired to the run stream. SSE payload shape must be read and typed before implementation. |
| Source health/provenance | `/connectors.sourceTiles[]`, `/connectors.connectors[]` | Render only backend `stateLabel`, `modeLabel`, `proofItems`, `reason`, and allowed-operation strings. | Source health does not prove a specific document viewer asset exists. Do not label synthetic/static evidence as live. |

Preferred future backend/read-model contract for Beat 7:

```ts
interface MayaEvidenceAsset {
  assetId: string;
  documentId: string;
  renderUrl: string;
  renderType: "pdf" | "image" | "text";
  fileName?: string;
  fileSizeLabel?: string;
  pageCount?: number;
  toolbarActions: Array<"zoom-in" | "zoom-out" | "download" | "open-source">;
}

interface MayaEvidenceCustody {
  collectedAtLabel: string;
  sourceSystemLabel: string;
  custodianLabel?: string;
  retentionLabel?: string;
  sha256?: string;
  entryHash?: string;
}

interface MayaEvidenceTraceStep {
  stepId: string;
  label: string;
  status: "complete" | "running" | "pending" | "blocked" | "error";
  detailRows: Array<{ label: string; value: string }>;
  recordIds: string[];
  deterministicBasis?: string;
  sourceLabel?: string;
  citations: Array<{ recordId: string; documentId?: string; citationId?: string; deterministicBasis?: string }>;
  startedAtLabel?: string;
  completedAtLabel?: string;
  statusUpdatedAtLabel?: string;
}

interface MayaActiveEvidenceQuery {
  question: string;
  selectedLineId: string;
  status: "idle" | "running" | "answered" | "blocked" | "error";
  steps: MayaEvidenceTraceStep[];
  evidenceAsset?: MayaEvidenceAsset;
  custody?: MayaEvidenceCustody;
}
```

Until a contract like this exists, Beat 7 must use session-level running state and static sub-agent rows honestly, with visible gaps where per-step progress is unavailable.

Required future contract semantics:

- `activeQuery.steps[]` must be backend/read-model owned and ordered. React may only map the provided enum to visual variants.
- `evidenceAsset.renderUrl` and `evidenceAsset.renderType` are required before rendering a PDF/image viewer. A document summary alone is not a viewer asset.
- Custody/hash metadata must be backend/read-model fields. Do not invent collected timestamps, file sizes, custodians, source-system codes, SHA values, entry hashes, or previous hashes in UI.
- Per-agent or per-step status timestamps must come from `startedAtLabel`, `completedAtLabel`, or `statusUpdatedAtLabel`.
- Step citations must be explicit per step; do not reuse global selected record IDs as proof that each step is cited unless the backend maps them.

## 4. Interaction Contract

Entry state:

- User has already opened a selected case/evidence context in an earlier approved beat.
- User submits a scoped evidence query, such as proof-of-delivery verification for the selected case.
- The right-side sheet/rail opens and remains in the same workspace context; it does not navigate to a generic chat page.

In-progress behavior:

- On `connecting`, show the trace rail with a running top/session state and scoped record IDs.
- On `connected`, keep the running state visible and show skeleton/progress inside the active trace row or session status area.
- On `answered`, replace the running state with a cited answer state in Beat 8, not in Beat 7.
- On `blocked` or `blocked_uncited_output`, show an `Alert` with the backend message and cited policy/record IDs.
- On `error`, show a destructive `Alert` with the backend error message. Do not keep fake running skeletons after error.
- On close/cancel, stop the active Realtime/browser session and render the next open state honestly.

Trace step behavior:

- Static sub-agent rows may be rendered as evidence context rows, not live progress, unless the backend exposes step status.
- If a future `traceSteps[]` contract exists, render rows in backend order and key by `stepId`.
- Completed steps may show detail rows, cited record IDs, and deterministic basis when present.
- Running steps may show skeleton detail placeholders only for fields that are genuinely loading.
- Pending steps must not show fabricated detail rows.
- Blocked steps must show the backend block reason and record IDs if provided.
- Do not name a running step from the mockup, such as `Evidence reader`, unless the current backend step row contains that label and status.
- Do not render a pending `Citation and action guard` row unless a backend step or guard status exposes it. Citation blocking may appear as a session-level `Alert` from the realtime snapshot instead.

Cited evidence basis:

- Any decision-like answer, query result, draft, approval, or guard outcome must display cited `recordIds` and deterministic basis when available.
- If citations or deterministic basis are missing, show blocked/unavailable state rather than an answer.
- Do not compute citation sufficiency, evidence relevance, verdicts, routing, money, approval eligibility, or audit status in React.

## 5. Shadcn Component Map

Use installed shadcn components from `cockpit/components/ui` only unless a later brief explicitly approves adding another registry item.

| Need | Shadcn component |
|---|---|
| Workspace shell/sidebar | `Sidebar`, `ScrollArea`, `Separator`, `Tooltip`, `Button` |
| Evidence artifact header | `Card`, `Badge`, `Button`, `Separator`, `Tooltip` |
| Evidence document metadata | `Table`, `Badge`, `Separator`, `ScrollArea` |
| PDF/image viewer when asset exists | `ScrollArea`, `Button`, `Tooltip`, `Separator`, `Badge`; use the browser's PDF/image rendering or approved viewer component only when `evidenceAsset.renderUrl` exists |
| Viewer fallback when no asset exists | `Alert` or `Empty` plus `Table` for available document metadata and `Badge` for record IDs |
| Query evidence sheet/rail | `Sheet` or fixed rail layout, `Card`, `ScrollArea`, `Separator` |
| Trace timeline rows | `Card`, `Badge`, `Collapsible` or `Accordion`, `Separator`, `Skeleton` |
| Running progress | `Skeleton`, `Badge`, optional `Alert` for blocked/auth states |
| Source/read-model gaps | `Alert`, `Empty`, `Badge` |
| Cited record IDs | `Badge`, `Tooltip` |
| Loading/failure states | `Skeleton`, `Alert`, `Empty` |
| Trace detail rows | `Table` or compact definition-list layout inside `CardContent` |

Composition rules:

- Use full `Card` anatomy where a card is needed: `CardHeader`, `CardTitle` or `CardDescription`, `CardContent`.
- Use `Table` for document metadata and trace detail rows when the content is comparative or row-based.
- Use `ScrollArea` for the evidence list/viewer and trace rail when content exceeds viewport height.
- Use `Alert` for blocked, unavailable, or contract-gap states.
- Use `Empty` for no document asset/no trace rows states when absence is expected; use `Alert` when a backend/auth/guardrail condition blocks the view.
- Use `Skeleton` for the active running trace detail only, not decorative shimmer.
- Use `Separator` for anatomy breaks instead of hand-rolled border dividers.
- Use `Badge` for statuses and record IDs, not custom styled spans.
- Use semantic tokens and variants; no raw ad hoc status color ramps or purple/blue AI gradients.
- Use lucide icons inside shadcn `Button` or status affordances according to existing icon conventions.
- If the right rail uses `Sheet`, it must include `SheetHeader` and `SheetTitle` for accessibility. If the visual design uses a custom header, keep a visually hidden `SheetTitle`.
- Button icons must follow the project's shadcn icon rule: icon element with `data-icon`, no manual icon sizing classes, and no emoji/status glyphs in buttons.
- Viewer toolbar controls must be icon buttons with `Tooltip` labels and disabled/unavailable states derived from `evidenceAsset.toolbarActions`; do not show download/open/zoom controls when no renderable asset contract exists.

## 6. No Fake Agent Trace Or Autonomous Action Rules

Beat 7 must preserve Recoup invariants:

- No model or UI computes or asserts dollar amounts.
- No agent decision, answer, draft, guard outcome, or action state is shown without cited records and deterministic basis when required.
- No external action is dispatched from this screen.
- No ERP write-back, approval dispatch, term/limit change, hold/freeze, Billing route, or correspondence can occur from Beat 7.
- No static mockup trace rows in React. The only acceptable trace rows are backend/read-model rows or explicitly labeled contract gaps.
- No UI-generated step completion. React may map backend states to visual variants; it must not decide that a step is complete, running, or pending from labels unless the backend gives a stable enum.
- No use of `/trace` Risk Mesh audit events to imply live Maya evidence-query progress.
- No chatbot gimmicks: no assistant avatar thread, fake typing, generated persona messages, or "AI is thinking" copy.
- No fake POD content, signatures, barcode text, collected metadata, file size, custody footer, hashes, running step names, step timestamps, or pending guard rows. These must be omitted, shown as unavailable, or sourced from a future backend/read-model contract.

## 7. Screenshot Comparison Checklist

Target screenshot path for the future build pass:

- `output/playwright/e2e/maya-beat-07-agent-trace.png`

Pass criteria: reviewer score must be `>=4/5`. Scores `1/5`, `2/5`, and `3/5` remain failed/pending.

Checklist:

- First viewport matches the Beat 7 anatomy: evidence viewer left/center, query trace rail right.
- Persistent sidebar and case context remain visible and integrated.
- Trace rail reads as an operational progress timeline, not a chat transcript.
- Complete, running, and pending states are visually distinct and calm only when backend-owned per-step statuses exist. With current data, the screenshot must show session-level running state plus honest static evidence context rows or contract gaps.
- Running state uses `Skeleton` or equivalent loading affordance only where data is genuinely pending.
- Evidence/document area is the primary object; the trace does not crowd it into a generic dashboard. If no renderable asset exists, the fallback metadata/table state must be intentional and visibly honest rather than a fake PDF.
- Record IDs and deterministic basis are displayed when available and blocked/unavailable when absent.
- Backend/read-model gaps are called out honestly instead of filled with mockup text.
- Mockup-only POD content, collected timestamp, file size, custody/hash footer, five trace rows, running step names, per-step timestamps, and pending guard rows are absent unless the new backend contract provides them.
- No fake autonomous action, send, approve, recover, route, or write-back copy appears.
- No old Maya premium/custom UI language dominates the screen.
- No generated UI tells from `AGENTS.md` section 5.1 dominate: card-everything layout, purple gradients, giant hero, decorative AI badges, or raw enum copy.

## 8. Tests And Verification For Future Build

Documentation-only spec edit:

- `git diff -- docs/storyboards/maya-beat-07-shadcn-spec.md`
- `git diff --check -- docs/storyboards/maya-beat-07-shadcn-spec.md`
- `git status --short`

Later Beat 7 implementation verification:

- Focused unit/component tests for trace-state mapping: `connecting`, `connected`, `answered`, `blocked`, `blocked_uncited_output`, `error`, and empty trace rows.
- Test that no trace row renders fabricated mockup labels when backend rows are absent.
- Test that cited-answer/guard states require non-empty `recordIds` and deterministic basis before answer display.
- Test that UI does not enable external action dispatch from the trace-in-progress screen.
- Route/data-loader tests if Beat 7 wires `/forensics`, `/connectors`, `/trace`, or `/run` differently.
- E2E screenshot capture for `output/playwright/e2e/maya-beat-07-agent-trace.png`.
- Visual comparison against `mockups/imagegen/maya-12-beat-storyboard/07-agent-trace-in-progress.png`.
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- Full `npm run verify` before claiming the broader Maya shadcn goal is complete.

## 9. Spec Validation Notes

Known inconsistencies/gaps to resolve before implementation:

- The mockup shows a renderable POD PDF, but the current Forensics read model exposes document metadata and summaries, not a PDF asset or page-render contract.
- The mockup shows evidence toolbar/custody footer fields, collected metadata, file size, and hashes, but the current Forensics read model does not expose those fields.
- The mockup shows five ordered trace steps with complete/running/pending status, but the current Forensics model exposes three static `multimodalDock.subAgents[]` rows and a session-level Realtime snapshot.
- The current backend/read model does not expose `activeQuery.steps[]`, live per-step statuses, per-agent status timestamps, or step-level citations.
- The mockup shows a pending `Citation and action guard` row, but the current Maya query surface exposes citation parity/blocking through `RealtimeBrowserSessionSnapshot`, not as a named per-step guard.
- The `/trace` model is a Risk Mesh audit trace and should not be repurposed as Maya evidence-query progress without a backend contract change.
- A future build can approximate layout with current data only if it labels missing backend capabilities as gaps and does not fabricate trace progress, document content, custody metadata, or hash/audit rows.
