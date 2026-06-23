# Maya Beat 10 Shadcn Spec - Human Approval Dialog

Status: first-step spec only. No cockpit UI, route, API, test, or fixture changes are authorized by this document.

Reference mockup: `mockups/imagegen/maya-12-beat-storyboard/10-human-approval-dialog.png`

Current implementation reference, read-only for this pass:

- `cockpit/components/maya/approval-gate-dialog.tsx`
- `cockpit/app/api/approval/route.ts`
- `src/services/approvals.ts`
- `src/services/serviceLayer.ts`
- `src/services/cockpitApi.ts`
- `cockpit/components/maya/types.ts`
- `cockpit/components/maya/recovery-draft-review.tsx`

Beat 09 note: `docs/storyboards/maya-beat-09-shadcn-spec.md` was not present during this spec pass, so this file treats Beat 10 as the approval overlay over the existing draft-review/read-model contract rather than inheriting a Beat 09 file.

## 1. Purpose And Gate

Beat 10 proves the Recoup HITL boundary at the moment Maya chooses whether a recovery draft may advance. The user sees a deliberate approval dialog over the draft-review screen. Opening the dialog does not dispatch, post, route, send, write, approve, reject, or modify anything.

Success check for a future implementation pass:

- The dialog can open from the draft-review state without calling `POST /api/approval`.
- Only an explicit human decision button can call `POST /api/approval`.
- `approve`, `modify`, and `reject` are the only visible decision outcomes, sourced from backend `selected.approvalActions[]`.
- `modify` and `reject` remain disabled or blocked until a human reason is present.
- The API response is treated as an audit confirmation only after the governed approval route returns an `auditEntryHash`.
- The screenshot for `output/playwright/e2e/maya-beat-10-human-approval.png` scores at least `4/5` against the mockup and cockpit anti-slop standard.

## 2. Visual Contract

The mockup anatomy:

- Draft-review screen remains visible but dimmed behind the modal.
- Top-level modal title reads as a hard gate: human approval is required.
- Close affordance is visible in the modal header; closing does not post anything.
- Header copy explicitly says opening the dialog does not dispatch anything.
- The body is compact and ledger-like, with horizontal separators between decision facts.
- Approver row shows Maya as the designated human approver with a small avatar/initial.
- Action row names the draft action being approved and gives a one-line draft basis.
- Evidence reviewed row shows a positive reviewed state only when the implementation has a real reviewed-state source.
- Cited records appear as visible record IDs, not hidden in a tooltip.
- Optional note field has a character-count affordance and must not invite secrets or PII.
- Footer shows deliberate actions: approve, reject, request changes, and cancel.
- Bottom assurance copy says the decision, note, and timestamp will be recorded with the draft.

Visual implementation requirements:

- The overlay should be an `AlertDialog`-style modal, centered, with a width close to the mockup and no nested card inside the dialog.
- Use the existing premium operational cockpit language: restrained surfaces, dense rows, semantic tokens, clear dividers, and vector icons.
- Avoid generated-UI tells from `AGENTS.md`: no purple/blue gradients, no oversized icon tiles, no card-everything redesign, no raw enum copy as business language, no fake stats, and no autonomous-action copy.
- Keep button labels short and action-specific: `Approve`, `Reject`, `Request changes`, `Cancel`.
- Use icon buttons/icons only as support: check for approve, x for reject, pencil or rotate arrow for request changes, close for dismiss.

## 3. Backend Mapping

Current data transport:

- The cockpit review route obtains `ForensicsCockpitModel` through the existing `/forensics` read model.
- The dialog proxy route is `cockpit/app/api/approval/route.ts`, which accepts `POST /api/approval` from the browser and forwards to backend `POST /approval` with verified human cockpit auth.
- Backend `POST /approval` is implemented in `src/services/cockpitApi.ts`.
- Approval decision preparation is implemented in `src/services/serviceLayer.ts` by `prepareApprovalDecision()`.
- Human approval rules are implemented in `src/services/approvals.ts` by `decideApproval()`.

| UI element | Field/source | Allowed transformation | Missing/gap |
|---|---|---|---|
| Dialog open state | Client interaction state only | Open/close modal. Do not post on open or close. | None. |
| Approver identity | `DemoSession` and verified cockpit auth principal; backend reads `verifiedHumanPrincipal` | Display Maya as the logged-in human. Do not let the UI edit or submit approver identity. | If the displayed session principal and verified backend principal diverge, backend wins and UI must show an auth error. |
| Action ID | `model.selected.draft.actionId` | Display as technical provenance. POST exactly this action ID. | Do not synthesize action IDs from labels. |
| Action label | `model.selected.draft.actionLabel` | Display as the draft action name. | Do not rewrite into a stronger dispatch verb. |
| Draft basis | `model.selected.draft.basis` | Display as deterministic basis text. | UI must not create a new basis. |
| Draft status | `model.selected.draft.status` and `statusLabel` | Render as HITL/draft status. | Do not convert `pending_human` into sent, approved, or recovered state. |
| Amount | `model.selected.draft.amount` only if shown | Display the backend-formatted string only. | UI must not parse, total, clamp, or recompute money. |
| Approval choices | `model.selected.approvalActions[]` with `decision`, `label`, and `requiresReason` | Render only the returned choices; map to button variants/icons. | Do not add extra decisions. |
| Cited records | `model.selected.evidencePack.recordIds` | Display record IDs as chips/links if matching evidence routes exist. | Do not invent record IDs from filenames. |
| Evidence reviewed state | Existing evidence-review interaction state from prior beats, or a future backend field | Show `Reviewed` only when every required evidence item has a real reviewed-state source. | Current read model exposes documents and record IDs, but no stable `reviewedCount` or approval eligibility field. Use blocked/unavailable copy until implemented. |
| Human note/reason | Local textarea state, sent as `reason` only when non-empty or required | Trim before POST. Show required-state validation for modify/reject. | Must not include direct PII, secrets, tokens, passwords, or API keys. Backend `assertApprovalReasonSafe()` protects this path. |
| Submit response | `ApprovalGateResponse` from backend: `actionId`, `decision`, `status`, `auditEntryHash`, optional `reason` | Treat as Beat 11 handoff data and pass to audit confirmation state. | No audit success display before route returns. |

## 4. Interaction Contract

Initial state:

- Beat 10 starts from draft review, after Maya has reviewed evidence and opened the human approval gate.
- If evidence-reviewed state is unavailable, show a blocked `Alert` and disable all submit buttons. The dialog may still explain why approval cannot proceed.

Open and cancel:

- Opening the dialog must only set local open state.
- `Cancel`, close icon, escape, or overlay dismissal must close the dialog without calling `/api/approval`.
- The user must be able to return to the draft-review screen unchanged.

Approve:

- `Approve` can be enabled only when the selected backend action includes an `approve` decision.
- `Approve` may submit without a reason unless the returned action marks `requiresReason`.
- POST body should contain `actionId`, `decision`, and optional trimmed `reason`; it should not contain an editable approver ID.

Reject and request changes:

- `Reject` and `Request changes` map to backend decisions returned in `approvalActions[]`, expected as `reject` and `modify`.
- Both require a human reason. The future UI should disable the button while the reason is blank and also show an inline field error if attempted.
- Button copy can say `Request changes`; backend decision remains `modify`.

Submitting:

- While submitting, all decision buttons and cancel controls should be disabled or clearly non-repeatable.
- Use a spinner inside the active button if the implementation already has the shadcn `Spinner`; otherwise preserve a disabled state without adding a dependency.
- On non-2xx responses, show the backend error in an `Alert` without implying any state changed.
- On success, keep the action result in local state and hand it to Beat 11 audit confirmation. Do not show external dispatch success.

## 5. Shadcn Dialog And AlertDialog Component Map

Use existing installed shadcn components first. Current `cockpit/components/ui` includes `alert-dialog`, `alert`, `badge`, `button`, `field`, `textarea`, `separator`, and `tooltip`; it does not currently include a `dialog.tsx` component.

| Need | Shadcn component | Notes |
|---|---|---|
| Human decision modal | `AlertDialog` | Preferred for Beat 10 because this is a deliberate confirmation gate. Must include `AlertDialogTitle` and `AlertDialogDescription`. |
| Passive/non-decision modal alternative | `Dialog` | Do not add unless a future brief explicitly approves adding the component. If used later, it is only for passive review, not the final approval decision. |
| Header warning | `Alert` | Use semantic warning/blocking copy. Do not create custom callout markup. |
| Approver/action/evidence rows | `Separator`, structured flex/grid rows | Use separators for row boundaries, not nested cards. |
| Cited records and status | `Badge` | Record IDs remain visible and readable. Avoid raw enum labels as primary copy. |
| Note/reason input | `FieldGroup`, `Field`, `FieldLabel`, `FieldDescription`, `Textarea` | Use `data-invalid` on `Field` and `aria-invalid` on `Textarea` when reason validation fails. |
| Decision buttons | `Button` | Use existing variants. Icons use `data-icon="inline-start"`; no manual icon sizing classes. |
| Close/cancel | `AlertDialogCancel` and close affordance if supported | Must not submit. |
| Optional explanations | `Tooltip` | Only for compact icon affordances; do not hide required evidence/record IDs in tooltips. |

## 6. HITL Approval Constraints

This beat touches Recoup invariants I-7, I-8, I-17, I-18, I-20, I-23, and I-26.

Hard constraints:

- No external action without human approval.
- No agent identity can approve. The backend requires a `human:` approver and blocks proposer-equals-approver.
- No recovery, outreach, term/limit change, hold/freeze, Billing route, correspondence, or ERP write-back can dispatch from this dialog.
- Approval only records a human decision against an already proposed draft action.
- The draft remains draft-only unless and until a backend-approved downstream workflow explicitly exists. Beat 10 must not invent that workflow.
- Cited record IDs and deterministic basis must remain visible before approval.
- Invalid/partial deduction approval must not proceed unless supporting documents are attached by the backend evidence pack.
- Amounts are display-only backend strings. React must never compute or alter them.
- The human note/reason is governance evidence, not model instruction text. Do not interpolate it into tool instructions.
- If the backend returns `401`, `400`, `404`, `409`, or `503`, the UI shows the blocked state and does not create a local success state.

Copy constraints:

- Allowed: `Opening this dialog does not dispatch anything. No action will be taken until you choose an option.`
- Allowed: `Your decision, note, and timestamp will be recorded with the draft.`
- Avoid: `sent`, `submitted to customer`, `posted to ERP`, `auto-approved`, `recovered`, `executed`, or `completed` unless the backend response explicitly supports that exact state in a future approved contract.

## 7. Screenshot >=4/5 Checklist

A future Beat 10 screenshot is passable only if all are true:

- The modal anatomy clearly matches the reference: centered approval gate, dimmed draft review behind it, compact rows, cited records, note area, and four footer actions.
- The visible header makes HITL unmistakable.
- The draft-review background remains recognizable but subordinate.
- Maya is visibly the human approver, not an agent.
- Action, draft basis, status, amount if present, and record IDs come from backend/read-model fields.
- Evidence reviewed state is honest. If no real reviewed-state source exists, the screenshot shows a blocked/unavailable state instead of fake `3 of 3 reviewed`.
- Approve/reject/request changes controls are visually distinct and deliberate.
- Reason validation for modify/reject is visible in the interaction path.
- No business value, amount, threshold, approval state, audit hash, or dispatch status is invented in React.
- Visual audit score is at least `4/5`; `1/5`, `2/5`, and `3/5` remain failed/pending.

## 8. Future Verification

Future implementation pass should add or run focused checks only after code is authorized:

- Unit/component test that opening and closing the dialog does not call `fetch`.
- Unit/component test that approve posts only `{ actionId, decision, reason? }` to `/api/approval`.
- Unit/component test that modify/reject require a reason.
- Unit/component test that backend errors render blocked state and do not call the Beat 11 audit success handler.
- Invariant/API tests covering existing approval constraints remain green: `tests/invariants/action-hitl-all-capabilities.test.ts`, `tests/invariants/sod.test.ts`, and approval-related `tests/unit/cockpit-api.test.ts`.
- Focused e2e recaptures `output/playwright/e2e/maya-beat-10-human-approval.png` from `/forensics/shadcn`.
- Standard gates after implementation: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run test`, then `npm.cmd run verify` when the beat is ready for full proof.
