# Maya Beat 9 Shadcn Spec: Draft Review Recovery Packet

Status: draft for user review after prior beat approval.

Success check for this spec: a future build worker can implement only the Beat 9 draft-review recovery packet state from this document without inventing recovery action facts, case facts, evidence, dollars, approval state, audit state, dispatch state, or ERP write-back.

## 1. Purpose And Approval Gate

Beat 9 covers only the moment when Maya reviews a backend-staged recovery draft packet before opening the formal human approval dialog.

Primary mockup:

- `mockups/imagegen/maya-12-beat-storyboard/09-draft-review-recovery-packet.png`

This document is a spec, not implementation authorization. Beat 9 implementation waits for prior beat approval, then explicit user approval of this Beat 9 spec. The approved methodology remains:

1. Mockup.
2. Spec.
3. Build.
4. Compare.

Non-goals:

- Do not implement UI code from this document.
- Do not modify `cockpit/`, `src/`, `tests/`, `datagen/`, `evals/`, `audit/`, `cockpit/next-env.d.ts`, or dirty Beat 2 files in this first-step pass.
- Do not create or edit a recovery action, approval record, audit hash, source record, evidence row, case record, or amount in React.
- Do not send recovery correspondence, outreach, Billing routing, ERP writes, portal submissions, emails, or any external action from Beat 9.
- Do not open the Beat 10 approval dialog automatically. Beat 9 may show a button that opens the approval gate in the later approved Beat 10 interaction.
- Do not copy mockup case IDs, account masks, recipient names, dates, filenames, vintage, buyer, owner, currency, status, or amounts as runtime data.

## 2. Mockup Deconstruction And Visual Contract

Beat 9 should read as a premium, dense B2B operations screen for reviewing a draft packet, not as a generic approval card.

Mockup anatomy:

- Persistent left navigation remains visible and selected on `Cases`.
- Breadcrumb shows case context leading to `Recovery Draft Review`.
- Page title is `Recovery Draft Review` with a visible `Human Approval Required` gate badge.
- Header summary shows compact case metadata slots: case ID, case name, account, currency, and status.
- Horizontal case workflow tabs show `Draft Packet` active, with neighboring tabs for summary, approvals, disputes, audit trail, and notes.
- A top warning alert states that human approval is required before any external action.
- Main content has a wide draft packet panel and a narrow case-context rail.
- Draft packet panel includes packet ID, draft-only and human-approval-required badges, created/updated metadata if backend-backed, and sub-tabs for summary, evidence, message, and audit basis.
- Summary tab shows recipient/action type, read-only backend amount, draft status, supporting evidence rows, and a view-evidence affordance.
- Case-context rail shows only backend-backed case/account metadata and draft status.
- Bottom sticky command bar repeats that no external action can be dispatched until human approval and provides request-changes, reject, and open-approval controls.
- Footer/back navigation returns to the case view without changing action state.

Current-data visual target:

- The current backend/read model can support a draft packet review over `selected.draft`, `actionInbox[]`, `selected.evidencePack.recordIds[]`, and `selected.evidencePack.documents[]`.
- The current backend/read model cannot support exact mockup parity for case ID, packet created/updated timestamps, recipient, account mask, vintage, buyer, owner, recipient legal entity, file links, included checkmarks, approval team name, ERP/system write-back value, or separate approval-required-by field.
- Until those fields exist, Beat 9 must render honest unavailable/contract-gap states instead of mockup facts.

Visual requirements:

- Desktop-first operational density with calm typography, aligned metadata, compact status badges, and table-led supporting evidence.
- Use the existing Maya workspace shell and shadcn primitives only; no old bespoke premium surface language should dominate the Beat 9 content.
- Alerts are functional gate states, not decoration.
- The read-only amount area must visually communicate backend ownership and must not invite editing.
- Supporting evidence should be a real `Table`, not a decorative row card stack.
- Case context rail should be narrow and scannable; do not turn it into a nested dashboard.
- Bottom command bar should be visually distinct from the packet body and must preserve the blocked-until-human posture.
- No purple/blue gradients, hero treatment, glassmorphism, emoji icons, oversized icon tiles, all-caps tracked micro-label repetition, fake AI badges, or generated dashboard filler.
- Mockup text, numbers, labels, file names, record IDs, source names, dates, and dollars are visual-only. Runtime truth comes from backend/read-model fields.

## 3. Backend And Spec Contract Mapping

Current route and transport:

- `cockpit/app/forensics/shadcn/page.tsx` calls `requireRouteAccess("/forensics")`.
- The route fetches `fetchForensicsModel()` from `GET /forensics`.
- The route fetches `fetchConnectorReadinessModel()` from `GET /connectors`.
- `cockpit/app/cockpit-data.ts` reads `RECOUP_API_URL` or falls back to `http://127.0.0.1:4317`.
- `src/services/cockpitApi.ts` exposes `GET /forensics`, `GET /connectors`, and `POST /approval`.
- `src/services/cockpitModel.ts` builds `ForensicsCockpitModel.selected.draft`, `selected.approvalActions`, `actionInbox[]`, and `selected.evidencePack`.

Current recovery/action contract:

- `src/agents/forensics.ts` stages one action per decision. Recovery-routed decisions use `draftRecovery(decision)`.
- `src/agents/recoveryDrafter.ts` invokes the whitelisted `actions.draftRebill` service tool with `proposedBy: "agent:recovery-drafter"`.
- `src/tools/actions/draftRebill.ts` emits `actionType: "draft-rebill"`, `amountSource: "core-computed-delta"`, `requiresHumanApproval: true`, `status: "pending_human"`, and `dispatchedExternally: false`.
- `src/services/serviceLayer.ts` marks `actions.draftRebill` as `draft_only` and `approvals.decide` as an internal approval gate requiring Supabase write persistence.
- `src/services/approvals.ts` requires a human approver, blocks proposer-as-approver, and requires a reason for modify/reject.
- `cockpit/components/maya/approval-gate-dialog.tsx` posts to `/api/approval` only after the user selects an approval action and supplies a required reason when needed.

| UI element | Source field/route | Allowed formatting | Missing/gap |
|---|---|---|---|
| Page route and shell | Existing `/forensics/shadcn` route, signed demo session, existing Maya shell | Render the Beat 9 view inside the persistent workspace. | No dedicated `/forensics/:caseId/draft` route or server row-switch endpoint. |
| Active case binding | `ForensicsCockpitModel.selected.lineId`; selected worklist row only when it matches `selected.lineId` | Show draft detail only for the backend-selected line. If the UI-selected row differs, show `Alert` or `Empty`. | Current backend has a fixed selected decision; it does not fetch per-row draft packets. |
| Draft packet title | `selected.draft.actionLabel`, `selected.draft.actionId`, `selected.draft.actionType` | Display exact backend strings, optionally humanize labels in presentation while preserving IDs nearby. | No packet display ID separate from `actionId`; no mockup `DP-*` packet number. |
| Draft status | `selected.draft.status`, `selected.draft.statusLabel`; action tool contract `pending_human` | Render as `Badge` and warning `Alert`. | No richer status enum such as `draft_pending_approval` or approval team owner. |
| Read-only recovery amount | `selected.draft.amount`; action source in backend is `amountSource: "core-computed-delta"` but the current cockpit model does not expose `amountSource` | Display backend string exactly. Label as backend/read-model sourced. | Future model should expose `amountSource`, `clampBasis`, and `computedDeltaRecordIds` before showing calculation details. |
| Draft basis | `selected.draft.basis` plus `selected.evidencePack.recordIds[]` | Display text as backend basis. Show record IDs as `Badge` chips. | No structured audit-basis rows, rule ID, clamp detail, or deterministic-basis object on `selected.draft`. |
| Supporting evidence table | `selected.evidencePack.documents[]` with `citationId`, `description`, `documentId`, `documentType`, `relevance`, `sourceLabel`, `summary`, `verifiedLabel` | Use `Table`; preserve backend document IDs and labels. | No evidence `included` boolean, dates, file URLs, owner/reviewer, or source-domain labels. |
| Recipient/action type | `selected.draft.actionType`, `selected.draft.actionLabel` | Show action type as backend value with a readable label. | No recipient/customer finance contact field. Do not invent a recipient. |
| Case context rail | Matching `worklist[]` row, `selected.lineId`, `selected.draft.statusLabel`, `selected.draft.amount`, `selected.evidencePack.recordIds[]` | Use fetched customer/scenario/line labels. | No account mask, case name, case ID, vintage, buyer, ownership, or currency field beyond what backend exposes. |
| Header metadata | Matching `worklist[]` row and `selected.draft.statusLabel` | Display only backend strings; show unavailable slots for missing fields only if visual parity requires the position. | Current read model lacks case-header object and account metadata. |
| Packet timestamps | None | Omit or render `Unavailable` / `Contract gap`. | Do not use current time, build time, route load time, or mockup timestamps. |
| Approval actions | `selected.approvalActions[]` | Render available decisions only. `modify` should read as request changes if product copy allows, while still posting `decision: "modify"`. | No per-action disabled reason or evidence-reviewed precondition field. |
| Bottom command bar | `selected.approvalActions[]`, `selected.draft.statusLabel` | Buttons may open Beat 10 approval dialog or set local intent. | Beat 9 must not call `/api/approval` directly from the review screen without the approval dialog/explicit human action. |
| Approval submit | `POST /api/approval` proxy to backend `POST /approval` | Beat 10 only. Requires verified human cockpit auth and backend audit persistence. | Not a Beat 9 submit action. |
| Audit state | Approval API response returns `auditEntryHash` after human decision | Beat 9 may say audit hash is pending until human decision. | No committed hash exists before approval; do not fabricate one. |
| Source readiness | `/connectors.sourceTiles[]` and `/connectors.connectors[]` | Show synthetic/live/blocked labels exactly if included on screen. | Source readiness does not prove external dispatch readiness. |

Preferred future backend/read-model contract for exact Beat 9 parity:

```ts
interface MayaDraftReviewPacket {
  packetId: string;
  actionId: string;
  actionType: "draft-rebill" | "draft-outreach" | "route-billing";
  actionLabel: string;
  status: "pending_human";
  statusLabel: string;
  requiresHumanApproval: true;
  dispatchedExternally: false;
  amount: string;
  amountSource: "core-computed-delta";
  clampBasis: {
    label: string;
    deterministicBasis: string;
    recordIds: string[];
  };
  basis: string;
  proposedBy: string;
  recipient?: {
    label: string;
    sourceLabel: string;
  };
  caseHeader: {
    caseId?: string;
    caseName?: string;
    accountLabel?: string;
    currencyLabel?: string;
    statusLabel: string;
  };
  evidenceRows: Array<{
    citationId: string;
    documentId: string;
    documentType: string;
    description: string;
    sourceLabel: string;
    verifiedLabel: string;
    included: boolean;
    eventAtLabel?: string;
    fileReferenceLabel?: string;
    recordIds: string[];
  }>;
  auditBasisRows: Array<{
    label: string;
    value: string;
    recordIds: string[];
    deterministicBasis: string;
  }>;
}
```

Required future contract semantics:

- `amountSource` must be backend-owned before the UI renders calculation-detail affordances.
- `requiresHumanApproval` and `dispatchedExternally` must remain explicit backend fields for any external-action-adjacent UI.
- `caseHeader` fields must be backend/read-model owned. React cannot derive account masks, vintage, buyer, owner, or currency from mockup copy.
- `evidenceRows[].included` must be backend-owned before rendering included checkmarks.
- `auditBasisRows[]` must cite record IDs and deterministic basis per row.

## 4. Interaction Contract

Entry state:

- Maya has already opened a selected case and reached the draft packet stage.
- The visible packet is backend-staged and `pending_human`.
- Beat 9 shows review context and available human decisions but does not itself dispatch or approve.

Tab behavior:

- The active page-level workflow tab is `Draft Packet`.
- Inside the packet, the default sub-tab is `Summary`.
- `Evidence` may show the same backend evidence table and record IDs as the evidence dossier, without adding new evidence facts.
- `Message` may show an unavailable/contract-gap state unless a backend draft message body exists.
- `Audit Basis` may show `selected.draft.basis` and record IDs; do not fabricate structured audit rows.

Buttons and commands:

- `Request changes` maps to backend approval action `decision: "modify"` only through the approval gate flow and requires a human reason.
- `Reject draft` maps to backend approval action `decision: "reject"` only through the approval gate flow and requires a human reason.
- `Open approval` opens the Beat 10 approval dialog or navigates to the approval tab; it does not submit approval by itself.
- `View all evidence` switches to evidence sub-tab or evidence beat context using already-fetched fields only.
- `Back to case` returns to the case workspace and leaves draft state unchanged.

Disabled and blocked states:

- If `selected.approvalActions[]` is empty, show an `Alert` and disable command buttons.
- If selected row and `model.selected.lineId` do not match, do not render the deep draft packet for the wrong row.
- If `/api/approval` credentials are missing or backend approval persistence is unavailable, show the failure only in the Beat 10 approval flow, not as a fake Beat 9 completion state.
- If evidence rows are empty, show `Empty` and keep approval/external-action posture blocked or unavailable according to backend state.

Accessibility requirements:

- Packet tabs use `Tabs`, `TabsList`, `TabsTrigger`, and `TabsContent`.
- Warning states use `Alert` with `AlertTitle` and `AlertDescription`.
- Supporting evidence uses `Table` semantics.
- Icon-only buttons require accessible labels and `Tooltip`.
- Bottom command bar buttons must be keyboard reachable and must expose disabled states.
- Critical HITL/external-action language must be visible text, not tooltip-only.

## 5. Shadcn Component Map

Use installed shadcn components from `cockpit/components/ui` only unless a later implementation brief explicitly authorizes adding another registry item.

| Need | Shadcn component |
|---|---|
| Workspace shell/navigation | `Sidebar`, `ScrollArea`, `Separator`, `Tooltip`, `Button`, `DropdownMenu` |
| Breadcrumb/static route trail | `Button`, `Separator`, text only; no `Breadcrumb` import |
| Page HITL warning | `Alert`, `Badge` |
| Case workflow tabs | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` |
| Draft packet panel | `Card`, `Badge`, `Tabs`, `Separator`, `Alert` |
| Packet metadata | `Table` or compact definition-list layout with `Separator` |
| Supporting evidence | `Table`, `Badge`, `Tooltip`, `ScrollArea` |
| Case context rail | `Card`, `Badge`, `Separator`, `Alert` |
| Bottom command bar | `Alert`, `Button`, `Badge`, `Separator`, `Tooltip` |
| Approval handoff affordance | `Button` opening `ApprovalGateDialog`; no direct submit |
| Missing backend fields | `Alert`, `Empty` |
| Loading/failure states | `Skeleton`, `Alert`, `Empty` |

Composition rules:

- Use full `Card` anatomy where a card is needed.
- Do not put UI cards inside other cards. The draft packet panel and case-context rail can be sibling surfaces.
- Use `TabsTrigger` only inside `TabsList`.
- Use `Table` for supporting evidence rows and packet/evidence comparisons.
- Use `Badge` for statuses, action types, and record IDs.
- Use `Alert` for human-approval-required and contract-gap states.
- Use `Empty` when the read model returns no evidence rows or no action rows.
- Use `Separator` instead of ad hoc border dividers.
- Use lucide icons inside shadcn `Button` with `data-icon`; do not manually size icons inside buttons.
- Use semantic tokens and component variants; no raw ad hoc color ramps for business state.
- If a future implementation uses `AlertDialog` from Beat 9, it must include `AlertDialogTitle`; however, the actual approval submission belongs to the Beat 10 gate.

## 6. No Fake Recovery, Action, Or Amount Rules

Beat 9 must preserve the Recoup invariants:

- No model or UI computes, edits, clamps, summarizes, or invents a dollar amount.
- No recovery action can exceed the core-computed delta.
- No deduction verdict, route, recovery decision, or draft state appears without cited record IDs and deterministic basis.
- No invalid/partial deduction or recovery route is shown without supporting documents.
- No external action is sent autonomously.
- No proposer can approve its own action.
- No ERP write-back or write-capable ERP client exists.
- No synthetic source is rendered as live.

Runtime rules:

- Display `selected.draft.amount` exactly as backend/read-model data.
- Display `selected.draft.basis` exactly as backend/read-model data.
- Display record IDs from `selected.evidencePack.recordIds[]`, `documents[].documentId`, `documents[].citationId`, or future backend fields only.
- Display action status from `selected.draft.statusLabel` or `actionInbox[].statusLabel` only.
- Display approval actions from `selected.approvalActions[]` only.
- Do not calculate packet totals, evidence counts, source counts, status summaries, approval eligibility, audit status, or dispatch state in React.
- Do not show editable recovery amount inputs.
- Do not show `send`, `submit to portal`, `email customer`, `write to ERP`, `dispatch`, `auto approve`, `auto recover`, `recovered`, `closed`, or `cleared by AI`.
- Do not label the draft as approved, externally sent, posted, recovered, or audit-committed before the backend approval/audit response exists.
- If a field is missing, render `Unavailable`, `Contract gap`, `Empty`, or omit the slot.

Allowed copy examples:

- `Recovery Draft Review`
- `Human approval required`
- `Draft only`
- `Pending human review`
- `No external action before approval`
- `Backend amount, read-only`
- `Cited evidence`
- `Audit hash pending until human decision`

Banned copy without backend support:

- `Approved`
- `Sent`
- `Recovered`
- `Dispatched`
- `ERP written`
- `Portal submitted`
- `Source verified by API`
- `All evidence included`
- `Calculation details verified`
- `Approval team assigned`
- `No write-back required`
- `Human approved`

## 7. HITL And External-Action Constraints

Beat 9 is a pre-approval review screen. It may stage the user visually at the gate, but it must not cross the gate.

Required constraints:

- `actions.draftRebill` and related draft tools remain draft-only artifacts.
- The visible draft state must stay `pending_human` until the backend returns a human decision.
- Approval submission requires verified human cockpit auth through the `/api/approval` route and backend `/approval` handler.
- `modify` and `reject` require a human reason.
- Approval responses require an audit confirmation payload; if the payload is incomplete, the UI must show failure.
- If durable audit persistence is unavailable, the UI cannot show an approved/committed state.
- A command labelled `Open approval` is acceptable because it opens the HITL dialog; a command labelled `Approve` on the Beat 9 screen is not acceptable unless it clearly opens the dialog and does not submit.
- Customer correspondence, outreach, Billing routing, portal submission, ERP write-back, term/limit change, hold/freeze, and email dispatch remain impossible from Beat 9.

## 8. Screenshot Comparison Checklist

Target screenshot path for the future build pass:

- `output/playwright/e2e/maya-beat-09-draft-review.png`

Pass criteria: reviewer score must be `>=4/5`. Scores `1/5`, `2/5`, and `3/5` remain failed/pending.

Checklist:

- First viewport matches the Beat 9 anatomy: sidebar, case breadcrumb, title, HITL gate badge, active draft-packet tab, draft panel, case-context rail, and bottom command bar.
- Top and bottom warnings both make the human-approval-required posture visible.
- Draft packet state reads as draft-only and pending human review, not approved or sent.
- Read-only backend amount is visually prominent but cannot be edited and is not recomputed in UI.
- Supporting evidence is table-led, dense, and backend-backed.
- Case context rail shows only backend/read-model facts or honest unavailable slots.
- Approval actions are present only from `selected.approvalActions[]`.
- `Request changes` and `Reject draft` do not submit without the approval gate and required reason.
- `Open approval` opens or prepares Beat 10; it does not approve by itself.
- No mockup-only case ID, packet ID, dates, account mask, file names, recipient, buyer, owner, or amount appears unless backend-backed.
- No fake audit hash, external dispatch, ERP write-back, portal submission, email, or recovered state appears.
- Synthetic/demo source states are not rendered as live.
- No wrong-row draft is shown when UI-selected worklist row does not match `model.selected.lineId`.
- No legacy Maya premium/custom visual language dominates the screen.
- No generated UI tells listed in `AGENTS.md` section 5.1 dominate the screen.

## 9. Future Verification

Documentation-only spec edit verification:

- `git diff -- docs/storyboards/maya-beat-09-shadcn-spec.md`
- `git diff --check -- docs/storyboards/maya-beat-09-shadcn-spec.md`
- `git status --short`

Later Beat 9 implementation verification:

- Component tests that Beat 9 renders only for the backend-selected line or shows a wrong-row gap.
- Component tests that `selected.draft.actionId`, `actionLabel`, `actionType`, `statusLabel`, `amount`, and `basis` render from props.
- Component tests that evidence rows render from `selected.evidencePack.documents[]` without fabricated timestamps, file links, included flags, or recipient details.
- Tests that read-only amount has no editable input and no UI calculation path.
- Tests that command buttons are derived from `selected.approvalActions[]`.
- Tests that request-changes/reject require the approval gate reason flow and do not call `/api/approval` directly from the review panel.
- Tests that no Beat 9 interaction calls external action, ERP, portal, email, `/run`, realtime query routes, or source-read routes.
- Tests that missing approval actions, missing evidence rows, and missing case metadata render `Alert` or `Empty` states.
- Route/auth tests if `/forensics/shadcn` or demo-session requirements change.
- E2E screenshot capture for `output/playwright/e2e/maya-beat-09-draft-review.png`.
- Visual comparison against `mockups/imagegen/maya-12-beat-storyboard/09-draft-review-recovery-packet.png`.
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- Full `npm run verify` before claiming the broader Maya shadcn goal is complete.

## 10. Spec Validation Notes

Known current contract gaps to resolve before exact mockup parity:

- The mockup shows a case header with case ID, account mask, currency, case name, and status; the current read model has selected line, worklist labels, and draft status but no dedicated case-header object.
- The mockup shows a packet ID, created/updated timestamps, and system creator; the current read model exposes `selected.draft.actionId` but no packet metadata.
- The mockup shows recipient and action type; the current read model exposes action type and label but no recipient.
- The mockup shows an amount calculation-details link; the current read model exposes display amount and basis but not `amountSource`, clamp detail, or calculation rows.
- The mockup shows supporting evidence dates, file references, and included checkmarks; the current evidence documents expose document ID, citation ID, type, description, source label, summary, relevance, and verified label only.
- The mockup shows approval-required-by and ERP/system write-back fields; current backend guarantees HITL/draft-only behavior but does not expose those labels as packet fields.
- The mockup shows a case-context rail with vintage, buyer, ownership, and currency; current worklist/selected models do not expose those fields.
- The approval API can record human decisions only through verified human auth and durable audit persistence. Beat 9 must remain a pre-approval review state and leave the actual submit to the Beat 10 gate.
