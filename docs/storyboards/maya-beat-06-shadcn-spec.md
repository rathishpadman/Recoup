# Maya Beat 6 Shadcn Spec: Query Dock Start

Status: draft for user review before any Beat 6 implementation.

Success check for this spec: a build worker can implement only the Beat 6 query-dock start state from this document without inventing answers, citations, dollars, evidence, backend records, autonomous actions, or new backend constants.

## 1. Purpose And Approval Gate

Beat 6 covers only the moment Maya opens the case-scoped query dock from the evidence dossier and enters a question before any cited answer is returned.

This document is a first-step spec, not an implementation authorization. Beat 6 implementation must wait for prior beat approval and explicit user approval for this beat. The approved methodology remains:

1. Mockup.
2. Spec.
3. Build.
4. Compare.

Non-goals:

- Do not implement UI code from this document in this pass.
- Do not change cockpit UI, backend code, tests, or routes in this pass.
- Do not generate or display a fake answer, fake citation, fake record ID, fake evidence count, fake dollar amount, or fake action state.
- Do not add external action dispatch, ERP write-back, approval, recovery, Billing routing, term/limit, hold/freeze, or correspondence from the query dock.

## 2. Mockup Target And Visual Contract

Primary Beat 6 mockup:

- `mockups/imagegen/maya-12-beat-storyboard/06-query-dock-start.png`

Runtime screenshot target for a future build pass:

- `output/playwright/e2e/maya-beat-06-query-start.png`

Visual contract:

- The first viewport stays inside Maya's case workspace, not a standalone chat page.
- Left navigation remains persistent and visually integrated with the Maya forensics shell.
- Case header remains visible with case title, open state, and selected-case facts sourced from the read model.
- Evidence/content pane stays adjacent to the query dock. The dock is not allowed to replace the evidence context. On desktop, keep the evidence pane as the wider primary work area and place the dock on the right edge as a bounded operational sheet/rail.
- Evidence tab/dossier remains the left-side working surface with a dense table-led layout. The mockup table rows are visual direction only; runtime rows must come from backend/read-model fields. The table anatomy must keep search/filter controls above the table, column labels in a stable header, row density compact enough to show multiple cited documents, and pagination/count controls below or aligned with the table footer without crowding the query dock.
- Query dock opens as a right-side panel or sheet with a restrained white surface, clear title, close affordance, policy chips, question label, multiline input, character/help text if supported, bottom-aligned primary query button, and compact no-external-action/citation policy support. On desktop, target the mockup's narrow right panel proportion rather than a half-screen chat surface; on smaller viewports, the sheet may take most of the width but must preserve title, close control, selected scope, input, and submit footer without overlap.
- Input start state shows the user's typed question or an empty prompt state. It must not show an answer card until the realtime/query contract returns a cited answer with deterministic basis.
- Evidence/context adjacency must remain obvious: visible selected line, cited record IDs, and/or evidence pack scope must sit near the input so the user understands the query is case-bound.
- Visual tone must remain light-first, dense, premium B2B SaaS. Avoid card-everything composition, decorative gradients, purple/blue generated UI language, fake hero copy, and legacy premium-component styling.

Beat 6 placement and alignment details:

- The right sheet must be visually anchored to the viewport/workspace right edge with no floating-card treatment around it.
- `SheetContent` must reserve a persistent footer area for the submit action and help/policy text. The primary query button aligns to the footer's right edge; compact citation/read-only help text aligns left or above the footer action, matching the mockup's bottom button/help anatomy.
- The input field and counter/help line must sit directly above the footer. The help line must not drift into the evidence table area or wrap under the button on desktop.
- Evidence table controls must stay inside the evidence pane: filter/search controls in the table toolbar, pagination/count controls in the table footer, and no table controls duplicated inside the query sheet.
- The sheet must not cover the selected row, selected record badge strip, or table footer on the primary desktop review viewport used for `06-query-dock-start.png` comparison.

## 3. Backend Data Contract Mapping

Beat 6 route target:

- Current review route remains `/forensics/shadcn`.
- Query dock is currently represented by `cockpit/components/maya/query-evidence-dock.tsx`.

Current data transport:

- `cockpit/app/cockpit-data.ts` reads `RECOUP_API_URL` or falls back to `http://127.0.0.1:4317`.
- `fetchForensicsModel()` loads `GET /forensics`.
- `src/services/cockpitApi.ts` exposes `POST /query/realtime-client-secret` and `POST /query/realtime-tool`.
- Next proxy routes forward through `cockpit/app/api/query/realtime-client-secret/route.ts` and `cockpit/app/api/query/realtime-tool/route.ts` with verified human cockpit auth headers.

| UI element | Source field/route | Allowed formatting | Missing/gap |
|---|---|---|---|
| Dock open state | Local UI state in the future Beat 6 surface, currently `QueryEvidenceDock.open` and `onOpenChange` | Open from a case/evidence affordance only; close clears active realtime session state | No backend persistence for dock open/closed state. Do not imply audit event until backend records one. |
| Dock title | Static UI label may be `Evidence query` or `Query Evidence` | Humanize capitalization only | No backend title field. Keep title generic and non-decision-producing. |
| Policy label | `ForensicsCockpitModel.multimodalDock.policyLabel` | Render backend string exactly or sentence-case only if approved by visual pass | No separate chip model for `case-bound`, `read-only`, or `cited answer required`; current chips must be derived from existing policy/audit constants or shown as static product policy labels, not backend facts. |
| Query mode chips | `multimodalDock.modeOptions[]` | Render as compact `Badge`/toggle-like readonly chips | Current values are labels only, not a mode-selection backend contract. Do not make them interactive unless a future brief adds mode submission. |
| Prompt placeholder | `multimodalDock.promptPlaceholder` | Use as `InputGroupTextarea.placeholder` | None for basic prompt. Do not write placeholder as a sample answer. |
| Transcript/help copy | `multimodalDock.transcript.english` and optionally `.native` | Render as helper text or compact policy support | Current transcript copy is not a persisted transcript. Do not label it as saved audio/text history. |
| Selected case/line scope | `ForensicsCockpitModel.selected.lineId`; `QueryEvidenceDock.selectedLine` | Show as a badge/chip near the input | No multi-case query scope contract. Keep query case-bound to the selected line. |
| Scoped record IDs | `ForensicsCockpitModel.selected.evidencePack.recordIds`; `QueryEvidenceDock.recordIds`; realtime snapshots `recordIds` | Render record IDs as badges without editing, truncating meaning, or inventing extra IDs | The dock cannot query arbitrary evidence table rows until a row-selection backend contract exists. |
| Evidence adjacency | `selected.evidencePack.documents[]` and future evidence pane props | Show document metadata already in the read model; use table/dossier layout | Current Beat 6 dock component itself does not own the evidence table. Future build must preserve the surrounding evidence surface from prior beats. |
| Question value | Local controlled input state `question` | Trim only for submission; preserve visible typed text while editing | No backend draft-question persistence. Do not store raw questions outside current component unless a future contract names retention. |
| Question length | `src/services/serviceLayer.ts` and `src/services/realtimeSession.ts` currently cap `query.answer.question` at 500 characters | If a visible counter is implemented, show the actual 500-character limit or derive the value from a shared schema constant if one is added later | The mockup's 2000-style counter is not valid for runtime today. Do not render `2000` or any larger limit unless the backend/tool schema changes first. |
| Submit request | Browser helper `startRealtimeBrowserSession({ question, recordIds, selectedLineId })` | Disable when empty or already running. UI may pass local selected scope as context, but must label it as selected evidence context until the server validates it. | `POST /query/realtime-client-secret` schema currently validates only `question`; forwarded `recordIds`/`selectedLineId` are not validated server-side in `realtimeClientSecretRequestSchema`. Treat this as a contract gap for strict scope enforcement. |
| Client secret route | Next `POST /api/query/realtime-client-secret` to API `POST /query/realtime-client-secret` | Surface blocked/unavailable state through `Alert`; never show server API key | Requires verified human cockpit auth and runtime OpenAI credentials. Missing credentials must stay blocked/unavailable. |
| Tool route | Next `POST /api/query/realtime-tool` to API `POST /query/realtime-tool` | Display blocked tool state with deterministic basis when returned | Allowed Realtime tools are only `audit.read` and `query.answer`; no action tools. |
| Pending/connecting status | `RealtimeBrowserSessionSnapshot.status` values `connecting` and `connected`; `message`; `recordIds` | Use `Alert` plus `Skeleton` rows; `aria-live="polite"` | No answer yet. Do not render `CitedAnswerCard` as successful during pending states. |
| Blocked/error status | Snapshot statuses `blocked`, `blocked_uncited_output`, `error`; `message`; `recordIds` | Use `Alert`, destructive variant only for actual errors | Blocked output is a safety success, not an answer. Do not rewrite it as business advice. |
| Cited answer | Snapshot status `answered`, `answer`, `deterministicBasis`, `recordIds`; `CitedAnswerCard` | Render only after answer, deterministic basis, non-empty record IDs, and citation parity are present | Beat 6 start state must not include returned answer content; Beat 8 owns cited answer returned. |
| Agent trace preview | `multimodalDock.subAgents[]`; realtime snapshot `message` | A collapsed/secondary trace area may be visible but should not dominate Beat 6 | Beat 7 owns in-progress agent trace. Beat 6 should only show readiness or minimal trace context. |
| Human approval/external action posture | `selected.draft.status`, `actionInbox[]`, approval routes if already visible outside dock | May show read-only policy copy that external actions require HITL | Query dock itself has no approval action. Do not add approve/send/recover buttons. |

Preferred future backend gaps to close before a stricter Beat 6 implementation:

- Add server-side validation for `recordIds` and `selectedLineId` in `POST /query/realtime-client-secret`.
- Add an explicit query-scope response field that echoes allowed case/line/record IDs.
- Add a policy-chip read model if chips must be backend-owned rather than static product policy labels.
- Add evidence-row selection contract before making the dock query an arbitrary evidence table row.
- Until server-side scope validation exists, the UI must not claim strict scoped enforcement. Allowed copy should be visibly honest, such as `Selected evidence context` or `Using current case context`; disallowed copy includes `Server-enforced scope`, `Locked to these records`, or equivalent claims unless the backend echo/validation contract exists.

## 4. Interaction Contract

Start/open behavior:

- The dock opens from the case/evidence workspace after a user action.
- On open, it must show selected case/line and cited record scope before the user submits.
- On close, any active realtime browser session must be aborted/closed and local error/snapshot state cleared.

Input behavior:

- Use a controlled multiline input for the question.
- Submit is disabled when the trimmed question is empty.
- Submit is disabled while `connecting` or `connected`.
- The visible value may show the typed question from the current session only; do not persist it as audit/memory without a named backend contract.
- If a character counter is implemented, it must enforce and display the current backend/tool limit of 500 characters. Do not show the mockup's 2000-style counter unless `query.answer` and the realtime/client-secret contracts are changed first.

Submission behavior:

- Submission calls `startRealtimeBrowserSession` with trimmed question, selected line ID, and current record IDs.
- Realtime client-secret request requires verified human cockpit auth and uses the human principal as safety identifier.
- Missing credentials return a blocked state: `Realtime credentials unavailable. Offline cited answer remains active.`
- Realtime function calls must pass through the guarded local tool route.
- The only allowed Realtime tools are read-only/no-side-effect `audit.read` and `query.answer`.

Pending state:

- Show a status `Alert` with the current snapshot message and record IDs.
- Show `Skeleton` placeholders for answer-in-progress, not fake text.
- Keep evidence pane visible so Maya can continue seeing the source context.

Blocked/error state:

- `blocked_uncited_output` must be visible as a guardrail block, not hidden or converted into an answer.
- Tool blocks must show the deterministic basis when returned.
- Errors may use destructive `Alert`; missing credentials or blocked uncited output should use neutral warning/informational treatment unless product approves otherwise.

Cited answer boundary:

- Beat 6 start state stops before answer rendering.
- A future Beat 8 answer state may render `CitedAnswerCard` only when `status === "answered"`, `answer` exists, `deterministicBasis` exists, and `recordIds.length > 0`.
- Citation parity is required by invariant I-29: spoken and text answers must carry the same record IDs.

Guardrails/HITL:

- The dock is read-only query support. It must not dispatch recovery, correspondence, Billing routing, term/limit change, hold/freeze, approval, or ERP write-back.
- Any external action surfaced adjacent to the dock must remain behind the existing HITL approval gate and must be outside Beat 6 query submission.
- Query answers must cite deterministic record IDs and deterministic basis; uncited output is blocked before display.

## 5. Shadcn Component Map

Use installed shadcn components from `cockpit/components/ui` only unless a later brief explicitly approves adding another registry item.

| Need | Shadcn component |
|---|---|
| Right-side query dock | `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetFooter` |
| Query form structure | `FieldGroup`, `Field`, `FieldLabel`, `FieldDescription` |
| Multiline query composer | `InputGroup`, `InputGroupTextarea`, `InputGroupAddon`; use `Textarea` only outside `InputGroup` |
| Submit action | `Button` with project icon conventions; no `isLoading` prop |
| Query/policy chips | `Badge`, `Tooltip` if needed |
| Status and blocked/error callouts | `Alert`, `AlertTitle`, `AlertDescription` |
| Pending answer placeholder | `Skeleton` |
| Evidence/context pane around dock | `Table`, `ScrollArea`, `Separator`, `Badge`, `Button`, `DropdownMenu`, `Select` as already approved by prior beat specs |
| Empty/no-answer state | `Empty` or `Alert`, depending on whether the state is absence or policy block |
| Cited answer later state | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `Badge`, `Alert` |
| Trace later state | `Accordion`, `Card`, `Badge`, `Alert` |

Composition rules:

- Forms use `FieldGroup` and `Field`; no raw form stacks.
- Buttons inside or attached to inputs use `InputGroupAddon`.
- Use `InputGroupTextarea` inside `InputGroup`; never raw `Textarea` inside `InputGroup`.
- `SheetContent` must include `SheetHeader` and `SheetTitle` for accessibility. If the title is visually replaced by a custom header, keep `SheetTitle` present with `sr-only`; do not ship a title-less sheet.
- If `SheetDescription` is used, it must describe the selected evidence/query policy without introducing backend claims the route does not support.
- Use `Skeleton` instead of custom pulse markup.
- Use `Alert` for guardrail, blocked, unavailable, and error states.
- Use `Badge` for record IDs and policy chips.
- Use semantic tokens and shadcn variants; no raw ad hoc status colors.
- Icons in buttons must use `data-icon="inline-start"` or `data-icon="inline-end"` and the project's configured icon library conventions. Do not add explicit icon sizing classes inside shadcn `Button`; the component owns icon sizing. Do not use emoji icons.
- Button loading/running states must be composed with `disabled`, text, and an approved spinner/icon pattern; shadcn `Button` has no `isLoading` or `isPending` prop.
- Do not show raw backend enum names as primary business copy.

## 6. No Fake Answer, Citation, Or Autonomous Action Rules

Banned in Beat 6:

- Fake answer prose, fake cited answer cards, or static sample assistant output.
- Mockup record IDs copied into runtime unless they exist in the read model for the selected case.
- UI-computed or UI-edited dollars, deltas, recovery values, confidence values, evidence sufficiency, decisions, thresholds, or audit state.
- Uncited model output displayed as an answer.
- Query submission that triggers an external action.
- Any button copy implying send, recover, approve, execute, post, write back, route to Billing, change terms, release hold, or freeze.
- Persisting raw audio, uncited transcript, or uncited model output.

Required:

- Every answer that reaches the UI must include record IDs and deterministic basis.
- Voice/text answer citation parity must hold.
- Missing credentials, missing auth, blocked tools, or uncited output must fail closed and remain visible.
- Evidence and selected-case context must remain read-model sourced.

## 7. Screenshot Comparison Checklist

Pass criteria: reviewer score must be `>=4/5`. Scores `1/5`, `2/5`, and `3/5` remain failed/pending.

Checklist:

- Runtime screenshot path is `output/playwright/e2e/maya-beat-06-query-start.png`.
- View matches the Beat 6 anatomy: case/evidence workspace on the left, query dock open on the right.
- Query dock is a dense operational panel, not a chat landing page or decorative card.
- Right sheet width, edge anchoring, table toolbar/footer placement, and bottom submit/help alignment match `06-query-dock-start.png` closely enough for a `>=4/5` review.
- Title, close affordance, policy chips, question label, multiline input, submit button, and citation/no-action support are visible.
- `SheetTitle` exists for accessibility, even if visually hidden.
- Evidence/context adjacency is clear through visible selected line and cited record IDs.
- Input state is start/pending-ready only; no returned cited answer appears in Beat 6 screenshot.
- Submit state is honest: disabled for empty/running, enabled only for non-empty local question.
- Visible counter/help text uses the actual 500-character backend/tool limit or omits the numeric counter; no 2000-character counter appears.
- Scope copy is honest about current client-side selected evidence context unless server-side scope validation has been added and tested.
- Pending state uses `Skeleton`/status copy, not fake answer text.
- Guardrail copy states cited answers/read-only/no external actions without marketing filler.
- Evidence rows, case facts, record IDs, and dollars come from backend/read-model fields or are shown as unavailable/contract gaps.
- No purple/blue gradient treatment, legacy premium-component look, oversized hero cards, card-everything layout, or generated UI tells dominate the view.
- Mobile/tablet responsive checks keep the dock usable without text overlap; desktop remains the primary review target.

## 8. Tests And Verification For Future Build

Documentation-only spec edit verification:

- `git diff -- docs/storyboards/maya-beat-06-shadcn-spec.md`
- `git diff --check -- docs/storyboards/maya-beat-06-shadcn-spec.md`
- `git status --short`

Future Beat 6 implementation verification:

- Focused unit tests for query dock state if interaction behavior changes.
- `tests/unit/realtime-browser-session.test.ts` coverage remains green for blocked credentials, setup failures, uncited output blocking, cited answer acceptance, citation parity, and tool bridge behavior.
- `tests/unit/realtime-session.test.ts` coverage remains green for allowed tools, blocked tool calls, realtime session policy, and no-action audit policy.
- `tests/unit/cockpit-api.test.ts` coverage remains green for realtime route auth, no-store behavior, empty question rejection, tool allowlist, and safety identifier behavior.
- `tests/invariants/cockpit-v12-contract.test.ts` remains green for I-29 and I-30.
- E2E opens `/forensics/shadcn`, opens the query dock, verifies `[data-testid="maya-query-dock"]`, `[data-testid="maya-query-input"]`, start-state policy text, selected record badges, and captures `output/playwright/e2e/maya-beat-06-query-start.png`.
- Visual comparison against `mockups/imagegen/maya-12-beat-storyboard/06-query-dock-start.png` records a score `>=4/5` and explicit deltas.
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- Full `npm run verify` before claiming the broader Maya shadcn goal is complete.

## 9. Spec Validation Notes

- Invariants touched by future implementation: I-1, I-7, I-17, I-20, I-23, I-26, I-29, and I-30.
- Current server-side `POST /query/realtime-client-secret` accepts `question` but does not validate submitted `recordIds` or `selectedLineId`; this spec treats that as a gap rather than assuming strict backend scope enforcement.
- The mockup character counter conflicts with the current 500-character `query.answer`/realtime tool limit. Runtime must use 500 or omit the numeric counter unless the backend/tool schema changes.
- Beat 6 must stop before Beat 7 agent-trace-in-progress and Beat 8 cited-answer-returned states.
