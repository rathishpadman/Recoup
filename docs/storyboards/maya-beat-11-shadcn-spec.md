# Maya Beat 11 Shadcn Spec: Audit Confirmation

Status: mandatory Beat 11 first-step contract for mockup deconstruction and backend/spec mapping only.

Success check for this spec: a later build worker can implement the audit-confirmation beat without inventing audit IDs, hashes, timestamps, approvers, routing, cited records, action finality, dollars, or external-action status in React.

## 1. Purpose And Gate

Beat 11 covers only the post-human-decision confirmation state after Beat 10 records a valid human decision through the approval service.

This beat is not another approval prompt. It is the moment Maya sees that the backend has accepted the human decision, committed the approval audit entry, and returned enough backend-owned audit evidence for the UI to render the confirmation honestly.

Gate conditions:

- The confirmation surface may appear only after `POST /api/approval` succeeds for the selected action.
- The UI must never pre-render or preview a final audit hash before the backend commits the decision.
- The UI must show a blocked/unavailable state if the approval route returns an error, omits required audit fields, returns a malformed hash, or cannot prove durable audit persistence.
- External action dispatch remains out of scope. Approval finality does not mean correspondence, ERP write-back, hold/freeze, Billing routing, or recovery execution happened.

Non-goals:

- Do not edit backend code in the Beat 11 UI build unless a later brief explicitly names those files.
- Do not add a client-side audit store, local fake audit chain, or static mockup data.
- Do not claim routing, case closure, ERP update, recovery execution, or next-case assignment unless a backend/read-model field supplies that exact state.
- Do not use the mockup's sample case ID, person, email, timestamp, audit hash, previous hash, record IDs, or decision ID as runtime data.

## 2. Mockup Target And Visual Contract

Primary Beat 11 mockup:

- `mockups/imagegen/maya-12-beat-storyboard/11-audit-confirmation.png`

Target anatomy:

- Persistent left sidebar remains visible and stable from the earlier Maya shadcn beats.
- Top breadcrumb/status row positions the user at the final decision/audit step; copy must use backend route/case labels where available.
- Main title area reads as a case review / decision confirmation workspace, not a marketing success page.
- Stepper shows the prior workflow steps as complete and the decision/audit step as current or complete, backed by journey/read-model status where available.
- A single strong success `Alert` confirms that the human decision was recorded and an audit entry was committed only when the response has `status === "human_decided"` and a valid 64-hex `auditEntryHash`.
- Supporting alert copy must state that the audit hash is backend-generated after approval and cannot be known before commit.
- The audit-evidence table is the center of the page. It should feel like an immutable receipt: label column, provenance/status chip where useful, backend-owned value column, and copy controls only for values that actually exist.
- Required rows in the target design are audit entry hash, previous hash, decision/action reference, decision outcome, human approver, committed timestamp if backend-owned, cited record IDs, and action state.
- Footer actions are quiet operational controls: view audit trail and return navigation. They must be disabled, absent, or renamed if no exact backend route/state supports them.

Visual standards:

- Light-first premium B2B command surface.
- Dense and table-led; avoid a card-everything dashboard.
- No purple/blue gradients, glass effects, oversized hero, fake celebration art, emoji, or decorative generated UI tells.
- Use tokenized shadcn components and semantic variants.
- Long hashes and record IDs must wrap or truncate professionally with tooltip/copy support and must never overflow at `1280px` or `1440px`.
- The confirmation must look final only for the audit record; external action state remains draft-only unless backend says otherwise.

## 3. Backend Data Contract Mapping

Current relevant backend/client evidence:

- `cockpit/components/maya/approval-gate-dialog.tsx` posts to `/api/approval` and currently accepts `actionId`, `decision`, optional `status`, and `auditEntryHash`.
- `cockpit/components/maya/types.ts` defines `ApprovalGateResponse` with `actionId`, `auditEntryHash`, `decision`, and optional `status`.
- `src/services/approvals.ts` enforces human-only approval, proposer-not-approver, and reason-required behavior for modify/reject decisions.
- `src/services/serviceLayer.ts` builds an `approval.decision` audit entry whose payload contains action ID, approver ID, decision, optional reason, and `human_decided` status, with record IDs equal to the action ID plus the action's cited records.
- `src/services/cockpitApi.ts` commits approval decisions only through the durable Supabase audit-chain path when configured, returns `503` when durable audit persistence is unavailable, and returns a 64-character `auditEntryHash` on success.
- `src/audit/trail.ts` defines append-only audit entries with `sequence`, `previousHash`, `entryHash`, `entryType`, payload, and cited `recordIds`.
- `src/services/cockpitModel.ts` already sanitizes persisted approval receipts for memory surfaces as `approvalAuditReceipts[]` with `actionId`, `approverId`, `auditEntryHash`, `decision`, optional safe reason, `recordIds`, and `human_decided` status.

| UI element | Current source | Allowed transformation | Gap / required future contract |
|---|---|---|---|
| Success state | Successful `POST /api/approval` response with `status === "human_decided"` and valid `auditEntryHash` | Render as confirmed only after both conditions pass. If `status` is omitted, not `human_decided`, or the hash is malformed, render `Audit confirmation unavailable` / blocked state instead of a confirmed receipt. | Beat 11 final confirmation requires exact `human_decided` state; do not downgrade to softer success copy. |
| Audit entry hash | `auditEntryHash` from approval response | Validate display shape as 64 lowercase-or-uppercase hex with `/^[a-fA-F0-9]{64}$/`; render exact backend string with copy affordance. | No preview. No shortening as the only visible value. Normalize only for validation; do not rewrite backend casing in displayed/copied text. |
| Previous hash | Backend audit entry or read-model receipt | Render exact backend string with copy affordance. | Current approval response does not expose `previousHash`; add to a future approval confirmation model or audit-read endpoint before showing this row as real. |
| Sequence | Backend audit entry | Render backend number/string only. | Current approval response does not expose `sequence`. Optional but useful for audit trail navigation. |
| Decision/action reference | `actionId` from selected action and approval response | Confirm response `actionId` matches selected action before rendering. | Do not generate a separate decision ID in React. If product wants a decision ID, backend must provide it. |
| Decision outcome | `decision` from approval response | Humanize `approve`, `modify`, `reject` for display only. | Do not turn `approve` into case closure or external dispatch. |
| Human approver | Verified human principal from approval response or persisted receipt | Display backend principal or backend display label. | Current client response includes `approverId` from API but `ApprovalGateResponse` does not keep it; expose it explicitly if the Beat 11 build needs it. Do not use mockup names/emails. |
| Timestamp | Durable audit/memory commit timestamp | Render backend-owned ISO/time label. | Current approval response does not expose timestamp. Do not use browser time as the commit time. |
| Cited record IDs | Prepared approval audit record IDs or persisted receipt `recordIds` | Render as backend strings in `Badge` chips; allow copy; preserve all IDs. | Current immediate response does not expose record IDs; selected action/evidence props may be shown as action citations, but the committed audit receipt requires backend confirmation. |
| Action state | Approval response `status` plus backend/read-model action state field if one exists | Show `human_decided` and any exact backend action-state string only. | No claim that downstream queue, ERP, Billing, recovery, dispatch, closure, or routing state changed unless a backend field says so. |
| View audit | Exact existing audit/trace route or authorized read endpoint | Enable only when the implementation names and verifies the route/endpoint already exists. | If no exact route exists, omit the control or render a disabled `Audit route unavailable` action. Do not hard-code `/audit` or fake routing. |
| Return navigation | Worklist/read-model route state | Use `Return to worklist` by default. | `Next case` is allowed only if backend supplies next-case state/ID; do not invent next-case assignment or queue order. |

Full mockup receipt row requirement:

- A complete Beat 11 receipt may render rows for `auditEntryHash`, `previousHash`, `sequence`, `committedAt`, `approverId`, committed `recordIds`, and action state only when those fields come from a backend/API/read-model contract.
- A partial receipt may render only the subset returned by the backend/read model and must label omitted fields as unavailable only if the UI design needs to preserve the row.
- Copy such as `Approved case state`, `Updated action state`, `Case closed`, `Route complete`, `Recovery sent`, or `ERP updated` is banned unless exact backend fields with those meanings exist. Approval recorded is not dispatch, closure, routing, ERP write-back, or recovery execution.

Required future Beat 11 confirmation object if the implementation wants to match the mockup fully:

```ts
interface MayaApprovalConfirmation {
  actionId: string;
  decision: "approve" | "modify" | "reject";
  status: "human_decided";
  approverId: string;
  auditEntryHash: string;
  previousHash: string;
  sequence: number;
  committedAt: string;
  recordIds: string[];
  actionState: "human_decided" | string;
}
```

This object must come from backend/API/read-model code, not component-local assembly.

## 4. Interaction Contract

Entry:

- Beat 10 approval dialog submits a selected backend-owned action ID through `/api/approval`.
- Beat 11 opens only after the response is accepted and validated.
- If the response action ID does not match the selected action, show an error and do not render confirmation.
- If the response hash is missing or malformed, show an error and do not render confirmation.

States:

- `pending`: while the approval request is in flight, use shadcn `Skeleton` or disabled controls. Do not show audit rows.
- `confirmed`: render the committed audit confirmation.
- `blocked`: render an `Alert` explaining that approval/audit confirmation is unavailable, with no fake receipt.
- `duplicate`: if backend returns `409`, state that the action was already decided and require a read-model refresh rather than locally deciding which receipt is final.
- `unavailable`: if backend returns `503`, state that durable audit persistence is required.

Controls:

- Copy buttons may copy only values already returned by the backend/read model.
- Copy buttons are icon buttons with lucide `Copy` using `data-icon`, an accessible name such as `Copy audit entry hash`, and a tooltip that names the exact value. Tooltip text must not imply that copying validates, dispatches, or completes the action.
- After copying, use a short accessible confirmation such as `Audit entry hash copied`; failures should report `Copy unavailable`. Do not change row state or audit state after a copy action.
- `View audit` should open an existing audit/trace/memory surface only if the exact route/endpoint is named and authorized in the implementation. Otherwise omit it or disable it with `Audit route unavailable`.
- `Next case` degrades to `Return to worklist` unless the backend/read model supplies next-case state/ID.
- Closing/dismissing the success alert must not delete the confirmation state or imply the audit entry can be undone.

Accessibility:

- Confirmation alert uses `Alert` with a clear title and non-duplicative description.
- Audit evidence uses a real `Table` with headers or accessible row labels.
- Hash copy controls have accessible names such as `Copy audit entry hash`.
- Tooltip content for hash/record controls must match the visible action and value class (`Copy previous hash`, `Copy committed record ID`) and must be reachable for keyboard and pointer users.
- Long hashes remain keyboard-focusable and screen-reader readable.

## 5. Shadcn Component Map

Use installed components from `cockpit/components/ui`; do not add registry items for Beat 11 unless a later brief approves it.

| Need | Shadcn component |
|---|---|
| Workspace shell/sidebar | `Sidebar`, `ScrollArea`, `Separator`, `Button`, `Tooltip` |
| Confirmation banner | `Alert`, `Badge`, lucide `CheckCircle`, `ShieldCheck`, `LockKeyhole`, `X` where applicable |
| Audit receipt panel | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `Table`, `Separator` |
| Hash/record chips | `Badge`, `Tooltip`, `Button` with lucide `Copy` icon |
| Loading state | `Skeleton` |
| Blocked/unavailable state | `Alert` |
| Empty unsupported route/state | `Empty` |
| Prior approval modal handoff | `AlertDialog`, `Field`, `Textarea`, `Button` already used by Beat 10 |
| Optional view-audit action | `Button` with lucide external-link or file-search style icon |

Composition rules:

- Use full `Card` anatomy for the receipt panel.
- Use `Table` for the audit rows, not a div table.
- Use `Badge` variants for backend status labels; no custom status spans.
- Audit chips/status chips must be shadcn `Badge` plus `Tooltip` when explanation is needed. Do not import or recreate legacy `premium-components` audit-chip styling for Beat 11.
- Use lucide icons through component conventions with `data-icon`.
- Use `gap-*`, `size-*`, semantic tokens, and `cn()` where conditional classes are needed.
- Do not use old `premium-components` audit chip copy or styling as the primary Beat 11 design; audit-chip behavior must be composed from installed shadcn primitives and backend-backed strings only.

## 6. Hash-Chain And Audit Evidence Constraints

Beat 11 is governed by Recoup invariants I-7, I-8, I-9, I-17, I-18, I-20, I-23, I-26, and I-30.

Rules:

- Audit entry hash and previous hash are backend-generated, SHA-256-shaped strings from the committed audit entry.
- The UI must not compute `entryHash`, `previousHash`, sequence, or deterministic basis.
- The UI must not synthesize an audit entry from `actionId`, selected records, local time, or browser state.
- The UI must preserve cited `recordIds` exactly as returned by the backend/read model.
- The UI must distinguish selected action/evidence citations from committed audit receipt citations if the backend exposes only one of those sets.
- `approve` means a human decision was recorded. It does not mean an external action was dispatched.
- `modify` and `reject` require a human reason; the confirmation should show the sanitized backend reason only if returned.
- Proposer and approver identities are backend-validated; the UI may display the resulting human principal but must not validate SoD by itself.
- If Supabase audit persistence is unavailable, the confirmation fails closed.
- Synthetic or deterministic-demo provenance must be labeled honestly if any supporting read model comes from demo data.

Never render:

- Mockup sample hashes.
- Mockup sample record IDs.
- Mockup sample approver names or emails.
- Browser-generated timestamps as audit commit timestamps.
- Random IDs, UUIDs, nanoids, or fake decision IDs.
- Fake audit routes, fake queue routing, or fake case state updates.

## 7. Screenshot Comparison Checklist

Target screenshot path for the future build pass:

- `output/playwright/e2e/maya-beat-11-audit-confirmation.png`

Pass criteria: reviewer score must be `>=4/5`. Scores `1/5`, `2/5`, and `3/5` remain failed/pending.

Checklist:

- The screenshot clearly shows Beat 11 as audit confirmation after Beat 10, not a fresh approval modal.
- The left sidebar, breadcrumb, stepper, and case header remain visually consistent with the accepted Maya shadcn direction.
- Confirmation banner is prominent but restrained, with backend-generated audit language.
- Audit receipt table dominates the viewport and includes only backend/read-model-backed rows.
- Audit entry hash is visible as a real 64-character backend value or the UI clearly fails closed.
- Previous hash appears only if backend/read-model data supplies it.
- Decision outcome, approver, timestamp, cited records, and action state appear only if backend/read-model data supplies them.
- No fake audit IDs, hashes, routing labels, case IDs, people, timestamps, or record IDs appear.
- Hash and record text does not overflow or overlap at `1440px`, `1280px`, and tablet widths.
- Footer controls are backed by real route/state behavior or honestly disabled/renamed.
- The screen uses shadcn primitives and avoids the generated-UI tells listed in `AGENTS.md` section 5.1.

## 8. Future Verification

Documentation-only spec edit:

- `git diff -- docs/storyboards/maya-beat-11-shadcn-spec.md`
- `git diff --check -- docs/storyboards/maya-beat-11-shadcn-spec.md`
- `git status --short`

Later Beat 11 implementation verification:

- Unit tests for approval response validation and confirmation-state rendering.
- API/read-model tests if `previousHash`, `sequence`, `committedAt`, `approverId`, or `recordIds` are added to the confirmation contract.
- Focused invariant tests for approval/HITL/audit paths if backend contracts change.
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- E2E capture for `output/playwright/e2e/maya-beat-11-audit-confirmation.png`.
- Visual comparison against `mockups/imagegen/maya-12-beat-storyboard/11-audit-confirmation.png`.
- Full `npm run verify` before claiming the broader Maya shadcn goal is complete.

Open contract note for the future build:

- The current immediate approval response is enough for a minimal confirmed hash state, but not enough for the full mockup receipt. A full Beat 11 implementation needs backend/read-model ownership for previous hash, sequence, committed timestamp, approver display/principal, and committed receipt record IDs.
