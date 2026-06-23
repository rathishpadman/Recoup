# Maya Beat 8 Shadcn Spec: Cited Answer Returned

Status: first-step draft for user review before any Beat 8 implementation.

Success check for this spec: a future build worker can implement only the Beat 8 cited-answer-returned state from this document without inventing answer text, citations, record IDs, evidence rows, deterministic basis, dollars, decisions, external actions, or backend constants.

## 1. Purpose And Approval Gate

Beat 8 covers only the moment after Maya's evidence query returns a cited answer for the selected case context.

Primary mockup:

- `mockups/imagegen/maya-12-beat-storyboard/08-cited-answer-returned.png`

Target screenshot path for a future build pass:

- `output/playwright/e2e/maya-beat-08-cited-answer.png`

This document is a spec, not implementation authorization. Beat 8 build work must wait for prior beat approval and explicit user approval for this beat. The approved methodology remains:

1. Mockup.
2. Spec.
3. Build.
4. Compare.

Non-goals:

- Do not implement UI code from this document in this pass.
- Do not modify `cockpit/`, `src/`, `tests/`, `datagen/`, `evals/`, `audit/`, or any Beat 2 files in this pass.
- Do not generate a static sample answer, static citation set, mockup evidence IDs, fake document rows, fake caution block, fake status, or fake action state.
- Do not add or trigger approval, recovery, Billing routing, term/limit, hold/freeze, correspondence, ERP write-back, or any other external action from the answer state.

## 2. Mockup Deconstruction And Visual Contract

Beat 8 should read as a premium evidence operations answer page, not a generic chat response.

Mockup anatomy:

- Persistent Maya workspace shell with left navigation, case selector, top breadcrumb, review status, and user menu.
- Top breadcrumb path: cases, selected case, query evidence sheet, and `Beat 8 of 12` storyboard progress.
- Page-level back affordance to return to prior queries.
- Main heading for the selected query result.
- Compact case/query metadata row with type, issue area, rule basis, and answered status.
- Left answer pane with a cited answer summary, rationale bullets, citation list, copy-citations action, caution/partial block, and footer actions.
- Right evidence pane with search, filter, compact table rows, document type badges, dates, and a view-all-evidence action.
- Light-first, dense, work-focused SaaS surface. The answer card is allowed because it frames a single returned answer, but avoid a page made of nested decorative cards.

Visual contract:

- The first viewport remains inside Maya's case workspace. Do not navigate to a standalone chat page.
- The answered state must preserve adjacency between the answer and the evidence table. On desktop, the answer pane should occupy the left/primary area and evidence should sit to the right, matching the mockup's two-column answer-plus-evidence anatomy.
- The answer pane should have a restrained success treatment only if the backend response is truly `answered`. Use a narrow semantic success accent or status affordance, not a thick colored border, gradient, hero card, or decorative badge stack.
- Answer title, rationale, citations, and deterministic basis must be readable without scrolling in the primary desktop viewport when practical. If content overflows, use `ScrollArea` inside the pane instead of growing the page into a loose dashboard.
- Citation rows should be compact and row-based: record ID, backend document title/description when available, and backend document type/source label when available. If document metadata is absent, show only the record ID and an honest unavailable/gap state.
- The caution/partial block in the mockup is visual direction only. Runtime may render it only from a backend blocked/partial/unavailable status or a backend-provided warning. Otherwise omit it.
- Footer buttons must not imply autonomous action. `Open in Evidence` may navigate or focus the evidence pane. `Review Draft` may appear only if an existing backend/read-model draft exists and the action remains review-only behind HITL.
- No UI text may claim recoverability, rule satisfaction, inventory records missing, answer status, document count, or citation count unless those fields are backend/read-model sourced.
- Avoid old Maya premium/custom UI language, purple/blue generated UI tropes, oversized hero copy, decorative gradients, card-everything layout, raw backend enum copy as business language, and fake evidence counts.

## 3. Backend Data Contract Mapping

Current route and data surfaces:

- Current review route remains `/forensics/shadcn`.
- `cockpit/app/forensics/shadcn/page.tsx` fetches `fetchForensicsModel()` from `GET /forensics` and connector readiness from `GET /connectors`.
- `cockpit/app/cockpit-data.ts` defines `ForensicsCockpitModel` and selected evidence/draft/read-model fields.
- `cockpit/components/maya/query-evidence-dock.tsx` starts the Realtime browser session and publishes `RealtimeBrowserSessionSnapshot`.
- `cockpit/components/maya/cited-answer-card.tsx` currently renders `CitedAnswerCard` from `QueryEvidenceResponse`, which is `RealtimeBrowserSessionSnapshot`.
- `src/services/cockpitApi.ts` exposes `POST /query/realtime-client-secret` and `POST /query/realtime-tool`; the Next proxy routes forward through `cockpit/app/api/query/realtime-client-secret/route.ts` and `cockpit/app/api/query/realtime-tool/route.ts` with verified human cockpit auth headers.
- `src/services/realtimeSession.ts` allows only read-only/no-side-effect `audit.read` and `query.answer` realtime tools.
- `src/agents/query.ts` currently returns offline-safe query answers with `answer`, `recordIds`, `deterministicBasis`, `citationParity`, `modelExecution`, and `plannedModels`.

Current cited-answer acceptance boundary:

- `CitedAnswerCard` treats a response as answered only when `response.status === "answered"`, `response.answer` exists, `response.deterministicBasis` exists, and `response.recordIds.length > 0`.
- The browser realtime bridge additionally requires `citationParity.parity === "same_record_ids"` and exact equality between `recordIds`, `citationParity.textRecordIds`, and `citationParity.voiceRecordIds`.
- `response.done` without a valid cited answer becomes `blocked_uncited_output`, not an answer.
- Missing realtime credentials return blocked/unavailable status and must remain visible.

| UI element | Source field/route | Allowed formatting | Missing/gap |
|---|---|---|---|
| Workspace shell, case context | Existing Maya shadcn shell plus `/forensics.selected.lineId` and `/forensics.worklist[]` | Display backend strings; humanize labels only where existing specs allow | No dedicated Beat 8 route state or persisted query-result page contract yet. |
| Breadcrumb and `Beat 8 of 12` | Local storyboard/navigation state for future build | May be static storyboard navigation only if clearly part of accepted Maya beat shell | Not a backend fact. Do not show as audit or case status. |
| Query title | Future active query/read-model field, or local submitted question while session remains open | Use the user's submitted question or backend query title; wrap/truncate safely | Current `RealtimeBrowserSessionSnapshot` does not persist question/title after close. Do not invent `Shortage Deduction Recoverability`. |
| Metadata row: type, issue area, rule basis | `/forensics.selected` and `/forensics.worklist[]` where fields exist, plus backend decision/deterministic basis text | Render existing backend labels only | Current read model does not expose a structured `issueArea` or `ruleBasis` row matching the mockup. |
| Answer status | `RealtimeBrowserSessionSnapshot.status` | Map `answered` to answered; map `blocked`, `blocked_uncited_output`, `error`, `ended` honestly | Do not convert blocked or error states into `Answered`. |
| Answer text | `RealtimeBrowserSessionSnapshot.answer`, or offline `answerOfflineQuery().answer` through `query.answer` result | Render exactly as backend answer prose; no UI rewriting that changes meaning or dollar amounts | The mockup answer sentence is visual-only. Runtime cannot hardcode it. |
| Deterministic basis | `RealtimeBrowserSessionSnapshot.deterministicBasis`, query tool result `deterministicBasis`, or `/forensics.selected.deterministicBasisRows` where relevant | Show as a compact basis paragraph or row list; preserve backend wording if decision-like | No UI-computed rule satisfaction, recoverability, or evidence sufficiency. |
| Rationale bullets | Future backend `rationale[]`/basis rows, or parsed display rows only if the backend already exposes structured rows | React may format provided rows into bullets; it must not author new rationale | Current snapshot has a single `deterministicBasis` string, not rationale bullets. |
| Citations list | `RealtimeBrowserSessionSnapshot.recordIds`; `query.answer` output `recordIds`; selected evidence pack `documents[]` for optional metadata lookup by `documentId`, `citationId`, or record ID when an exact match exists | Render record IDs as `Badge`/row links; show document metadata only when exact backend match exists | No current structured `citations[]` array with title/type/date per answer. |
| Voice/text citation parity | `citationParity` enforced by `src/services/realtimeSession.ts` and `cockpit/app/realtime-browser-session.ts` | The UI may show a parity policy note only when useful | Snapshot does not expose `citationParity`; it exposes only already-accepted answer state. |
| Evidence table | `/forensics.selected.evidencePack.documents[]`; `/forensics.selected.evidencePack.recordIds[]` | Use compact `Table`; document type/source labels from backend only | Mockup IDs, titles, dates, and counts are not runtime facts unless matched in read model. |
| Evidence search/filter | Local UI over already-loaded document rows | Search/filter affects local display only; no backend claim | No separate evidence-query endpoint for arbitrary evidence table search in current Beat 8 contract. |
| View all evidence count | `selected.evidencePack.documents.length` or backend count field if one exists | Show actual loaded count or omit numeric count | Do not copy mockup `128` unless backend provides it. |
| Copy citations | Client clipboard action from displayed backend record IDs | Copy only exact displayed record IDs and optional backend citation metadata | Must not create or persist audit/memory output unless future backend contract names it. |
| Open in evidence | Local navigation/focus to the evidence pane or prior evidence beat state | Read-only navigation only | Do not imply document asset exists if only metadata exists. |
| Review draft | Existing `/forensics.selected.draft` and approval/read-model fields | Show only if draft exists; route to a draft review surface without dispatching | Beat 9 owns draft review. Do not create a draft from the answer state. |
| Caution/partial block | Backend blocked/error/warning state, evidence gap, or future answer warning field | Render with `Alert`; preserve backend reason | Current answered snapshot has no warning field. Do not hardcode `Partial / Blocked`. |
| External action posture | Existing approval/HITL state outside Beat 8 query | Read-only labels only | No approval, recovery, send, route, post, hold, freeze, or ERP write-back from Beat 8. |

Preferred future backend/read-model contract for exact Beat 8:

```ts
interface MayaCitedQueryAnswer {
  queryId: string;
  question: string;
  selectedLineId: string;
  status: "answered" | "blocked" | "blocked_uncited_output" | "error";
  answer: string;
  deterministicBasis: string;
  recordIds: string[];
  citationParity: {
    parity: "same_record_ids";
    textRecordIds: string[];
    voiceRecordIds: string[];
  };
  rationale: Array<{
    id: string;
    text: string;
    recordIds: string[];
    deterministicBasis?: string;
  }>;
  citations: Array<{
    recordId: string;
    documentId?: string;
    citationId?: string;
    title?: string;
    typeLabel?: string;
    sourceLabel?: string;
    dateLabel?: string;
    deterministicBasis?: string;
  }>;
  warnings: Array<{
    id: string;
    severity: "info" | "warning" | "blocked";
    title: string;
    detail: string;
    recordIds: string[];
    deterministicBasis?: string;
  }>;
}
```

Until a contract like this exists, the build must render the current snapshot/read-model honestly and list visual deltas instead of filling the mockup with static literals.

## 4. Interaction Contract

Entry behavior:

- Beat 8 begins only after the query flow from prior beats returns an accepted cited answer.
- Accepted answer means `status === "answered"`, non-empty `answer`, non-empty `deterministicBasis`, non-empty `recordIds`, and voice/text citation parity already enforced by the realtime/tool bridge.
- If the latest query state is `connecting` or `connected`, stay in Beat 7 progress behavior.
- If the latest query state is `blocked`, `blocked_uncited_output`, `error`, or `ended`, show the corresponding blocked/error/ended state instead of the answered mockup.

Answer display behavior:

- Display answer text exactly from the backend response. Do not rewrite it into a stronger claim.
- Display deterministic basis near the answer, either as a compact `CardDescription`, basis row, or dedicated evidence/basis section.
- Display every returned record ID. Do not hide citations to make the card cleaner.
- If document metadata can be joined exactly from the selected evidence pack, enrich citation rows with backend document title, type, source, or date. If no exact match exists, show the record ID only.
- Rationale bullets require backend-provided rationale rows or structured deterministic basis rows. If only a basis string exists, show it as a basis string rather than inventing bullets.
- Do not display dollars, recovery amounts, thresholds, scores, or rule results unless they are already backend/read-model fields approved for this surface.

Copy/open behavior:

- `Copy citations` copies the exact displayed citation record IDs and optional displayed backend citation metadata. It is a local clipboard action only.
- After copy, use `sonner` or an accessible live status if already approved for the surface; do not persist the copied text or write an audit record unless a future backend contract exists.
- `Open in Evidence` navigates/focuses the existing evidence pane or selected document metadata. It must not open a fake PDF, fake image, or unavailable source asset.
- `Review Draft` remains disabled/hidden unless an existing backend/read-model draft is present. If shown, it navigates to Beat 9/draft review without dispatching anything.

Blocked and unavailable behavior:

- `blocked_uncited_output` must render as a guardrail block with backend message and record IDs, not as an answer.
- Missing credentials must render blocked/unavailable state: `Realtime credentials unavailable. Offline cited answer remains active.` or the backend-provided message.
- Tool blocks must show backend deterministic basis when returned.
- Errors may use destructive `Alert`. Guardrail blocks should read as policy safety, not product failure.

HITL and no-action behavior:

- Beat 8 is read-only answer review.
- No button in Beat 8 may send correspondence, approve, recover, route to Billing, post to ERP, change terms, release hold, freeze, or dispatch an external action.
- Adjacent action affordances must remain behind existing HITL flows and belong to later beats.

## 5. Shadcn Component Map

Use installed shadcn components from `cockpit/components/ui` only unless a later brief explicitly approves adding another registry item.

| Need | Shadcn component |
|---|---|
| Workspace shell/sidebar | `Sidebar`, `ScrollArea`, `Separator`, `Tooltip`, `Button` |
| Breadcrumb/top controls | `Button`, `Badge`, `Separator`, `DropdownMenu`, `Tooltip` |
| Answer pane | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` |
| Answer status | `Badge`, `Alert` for blocked/unavailable states |
| Rationale/basis rows | `Table` for structured rows or `Separator` plus text rows for compact basis |
| Citation list | `Table` or compact row list, `Badge`, `Button`, `Tooltip` |
| Copy citations | `Button` plus `sonner` toast or accessible status; icon uses project icon convention |
| Caution/partial block | `Alert`, `AlertTitle`, `AlertDescription` |
| Evidence pane | `Card` only if framing a single evidence module; otherwise unframed section with `Table`, `ScrollArea`, `Badge`, `Button`, `InputGroup`, `Select`, `DropdownMenu` |
| Evidence search/filter | `InputGroup`, `InputGroupInput` or installed `Input`, `Button`, `DropdownMenu`, `Select` |
| Loading or missing answer | `Skeleton`, `Alert`, `Empty` |
| Footer navigation actions | `Button`, `Tooltip`, `Separator` |

Composition rules:

- Use full `Card` anatomy for the answer pane if a card is used.
- Do not put cards inside cards. The answer pane and evidence pane can be sibling modules, not nested decorative surfaces.
- Use `Table` for evidence rows and citation rows when metadata is row-based.
- Use `Alert` for blocked, uncited, unavailable, caution, or warning states.
- Use `Empty` only for absence states, such as no evidence rows available.
- Use `Skeleton` only for genuinely pending data. Beat 8 accepted-answer state should not show running skeletons.
- Use `Badge` for statuses and record IDs, not custom styled spans.
- Use semantic tokens and shadcn variants; no raw ad hoc status colors or purple/blue gradients.
- Icons inside `Button` use `data-icon`; do not add manual icon sizing classes. Do not use emoji icons.
- Button loading states must use `disabled`, text, and approved spinner/icon composition; shadcn `Button` has no `isLoading` or `isPending` prop.
- Do not show raw backend enum names as primary business copy.
- Do not use `space-x-*` or `space-y-*`; use flex/grid with `gap-*`.
- Use `Separator` instead of hand-rolled border dividers where possible.

## 6. No Fake Answer, Citation, Or Autonomous Action Rules

Banned in Beat 8:

- Static answer prose copied from the mockup.
- Static citation IDs, titles, document types, dates, evidence counts, rationale bullets, or warning text copied from the mockup.
- UI-computed or UI-edited dollars, deltas, recovery values, thresholds, confidence values, evidence sufficiency, recoverability, verdicts, routing, approval state, or audit state.
- Displaying uncited model output as an answer.
- Inventing citation metadata for record IDs that do not exactly match backend document/evidence fields.
- Generating a caution/partial block when no backend warning/block/evidence gap exists.
- Dispatching or implying any external action from the answer surface.
- Persisting raw audio, uncited transcript, uncited model output, copied citations, or clipboard content.

Required:

- Every displayed answer must include non-empty record IDs and deterministic basis.
- Voice/text answer citation parity must hold before an answer can be accepted.
- Missing credentials, missing auth, blocked tools, and uncited output must fail closed and remain visible.
- Evidence rows, case facts, document metadata, record IDs, answer text, and deterministic basis must come from backend/read-model fields.
- The UI may format and arrange backend facts, but it may not author business conclusions.

## 7. Screenshot >=4/5 Checklist

Pass criteria: reviewer score must be `>=4/5`. Scores `1/5`, `2/5`, and `3/5` remain failed/pending.

Checklist:

- Runtime screenshot path is `output/playwright/e2e/maya-beat-08-cited-answer.png`.
- First viewport matches Beat 8 anatomy: persistent Maya shell, answered query page, answer pane left, evidence pane right.
- Answer state renders only from an accepted cited answer, not from static mockup content.
- Answer text, deterministic basis, and every returned record ID are visible.
- Citation rows are compact and readable; document metadata appears only when backend/read-model join is exact.
- Evidence table uses backend/read-model documents and counts only; no mockup-only `128` count or sample document IDs appear unless backend provides them.
- Blocked, unavailable, or uncited states show `Alert` and do not masquerade as answered.
- Caution/partial block appears only if backend warning/block data exists; otherwise it is omitted or shown as a documented contract gap.
- `Copy citations` is a local clipboard action only and cannot write audit/memory or dispatch anything.
- `Open in Evidence` is read-only navigation/focus; no fake asset opens.
- `Review Draft` is hidden/disabled unless an existing backend draft exists and remains HITL-gated.
- No button copy implies send, recover, approve, execute, post, write back, route to Billing, change terms, release hold, or freeze.
- No React code computes money, thresholds, decisions, evidence sufficiency, citation sufficiency, approval eligibility, or audit state.
- Visual tone is light-first, dense, premium B2B SaaS with restrained semantic status treatment.
- No generated UI tells dominate: purple/blue gradients, card-everything layout, giant hero, decorative AI badges, raw enum copy, over-rounded panels, or fake stats.
- Desktop screenshot earns `>=4/5` against `mockups/imagegen/maya-12-beat-storyboard/08-cited-answer-returned.png`; mobile/tablet checks show no overlap or clipped action text.

## 8. Future Verification

Documentation-only spec edit verification for this pass:

- `git diff -- docs/storyboards/maya-beat-08-shadcn-spec.md`
- `git diff --check -- docs/storyboards/maya-beat-08-shadcn-spec.md`
- `git status --short`

Future Beat 8 implementation verification:

- Focused unit/component tests for `CitedAnswerCard` or the future Beat 8 answer surface:
  - answered state requires `status === "answered"`, `answer`, `deterministicBasis`, and non-empty `recordIds`;
  - `blocked`, `blocked_uncited_output`, `error`, `ended`, and incomplete answered payloads render blocked/unavailable states;
  - citation metadata is joined only from exact backend/read-model evidence matches;
  - no action dispatch is available from answer review.
- `tests/unit/realtime-browser-session.test.ts` remains green for cited answer acceptance, citation parity, uncited output blocking, tool bridge behavior, and blocked setup paths.
- `tests/unit/realtime-session.test.ts` remains green for allowed tools, blocked tools, query.answer citation parity, and no-action realtime policy.
- `tests/unit/query.test.ts` remains green for offline-safe answers, record IDs, deterministic basis, and citation parity.
- `tests/unit/cockpit-api.test.ts` remains green for realtime route auth, no-store behavior, empty question rejection, tool allowlist, and safety identifier behavior.
- `tests/invariants/cockpit-v12-contract.test.ts` remains green for I-29 and I-30.
- E2E opens `/forensics/shadcn`, reaches the accepted answer state from backend/test-controlled data, verifies `[data-testid="maya-cited-answer"]`, answer text, deterministic basis, citation badges, blocked-state fallbacks, no external action buttons, and captures `output/playwright/e2e/maya-beat-08-cited-answer.png`.
- Visual comparison against `mockups/imagegen/maya-12-beat-storyboard/08-cited-answer-returned.png` records score `>=4/5` and explicit deltas.
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- Full `npm run verify` before claiming the broader Maya shadcn goal is complete.

## 9. Spec Validation Notes

Known inconsistencies/gaps to resolve before implementation:

- The mockup shows exact answer prose and rationale bullets, but the current accepted snapshot exposes a single `answer` string and `deterministicBasis`; no structured rationale array exists.
- The mockup shows three citation rows with titles, type badges, and dates, but the current answer snapshot exposes `recordIds` only. Document metadata can be shown only through exact selected evidence pack matches.
- The mockup shows evidence count `128`, but current runtime must use loaded backend/read-model counts only.
- The mockup shows a caution block labeled `Partial / Blocked`, but the current answered snapshot has no warning array. Blocked and uncited states exist as statuses, not as an answered-state warning.
- The mockup's `Review Draft` button belongs to a later draft review flow. Beat 8 can show it only when an existing backend draft exists and remains HITL-gated.
- Current server-side `POST /query/realtime-client-secret` validates only `question`; submitted `recordIds` and `selectedLineId` are forwarded by the browser helper but not validated by `realtimeClientSecretRequestSchema`.
- Invariants touched by future implementation: I-1, I-7, I-17, I-20, I-23, I-26, I-29, and I-30.
