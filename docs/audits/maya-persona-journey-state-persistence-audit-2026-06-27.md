# Maya Persona Journey State Persistence Audit

Date: 2026-06-27

Scope: Maya Forensics journey from login through the eight case worklist scenarios. This audit checks whether journey states are durable production states or only demo/read-model/local UI states. It focuses on `/forensics/shadcn`, the Render API, the Vercel API proxies, and the Maya React components.

## Executive Finding

Maya is currently production credible as a governed investigation and draft-staging surface, but not yet production credible as an end-to-end persisted case-handling workflow.

The backend can compute and expose source-backed deduction facts, evidence packs, recommended actions, query answers, and draft actions. The backend also has a durable Supabase-backed approval commit path. The current working tree now joins trusted persisted `approval_records` back into Maya detail/worklist read models when those records exist, and approval eligibility is derived from backend action/evidence coverage. A local real-browser S1-L1 approve -> logout/relogin -> admin reset -> relogin proof now passes against live Supabase-backed memory. However, the Maya workspace is still not a full production case-handling workflow because several persona journey states remain local or missing: explicit evidence-review receipt, selected line continuity, query transcript, next-case assignment, and case closure.

Current behavior is mostly fail-closed and honest. That is good for safety, but it is not the same as a production-ready case lifecycle.

## Audit Method

- Code inspection of Maya frontend state, backend read models, approval API, audit/memory projection, and existing invariants.
- Reviewer pass by read-only subagents:
  - Code reviewer checked source-of-truth and persistence per journey step.
  - API reviewer checked production login/work-item detail behavior for S1-S8.
- Controller live API check:
  - Vercel `/api/demo-login`: `200`.
  - Vercel `/api/forensics`: `404` because the app does not expose a top-level client proxy for the full worklist model.
  - Render `/healthz`: `200`.
  - Render `/forensics` without human auth: `401`, as expected.
  - Render `/forensics` with configured human auth: `200`, eight worklist rows.
  - Render `/forensics/work-items/<lineId>` checked for S1-S8.
- Local real-browser approval lifecycle proof after remediation:
  - Started a local Maya-read API and a separate local admin-reset API against the same live Supabase memory backend, plus Next cockpit on `127.0.0.1:3000`.
  - Read/admin API health probes: `200` in 0.58s.
  - Pre-test admin reset for `route-billing:S1-L1`: `200` in 0.54s.
  - Login as Maya through the browser: `/forensics/shadcn` visible in 11.16s.
  - Open S1-L1 Draft: backend detail showed `Awaiting reviewer; Ready for human approval` in 2.85s.
  - Submit approval in browser: backend detail rehydrated `Human decision recorded` with a 64-hex audit hash in 12.35s.
  - Logout and relogin: S1-L1 still showed `Human decision recorded; Human decision recorded` in 4.38s, and the visible Audit tab showed `Human decision recorded`.
  - Admin reset after approval: `200` in 0.70s; backend detail returned `Awaiting reviewer; receipt cleared`.
  - Relogin after reset: S1-L1 returned to `Awaiting reviewer; Ready for human approval` in 11.39s, and the visible Audit tab returned to `Audit confirmation unavailable`.
  - Browser console errors: none.
  - Root cause remediated for this proof: live Supabase had the memory/audit tables but was missing `recoup_commit_approval_audit` and `recoup_reset_demo_approval_lifecycle`. A narrow migration added only those two existing repo-defined RPCs plus service-role-only execute grants.
- Reviewer hardening after the first remediation pass:
  - Trusted approval receipt parsing now requires `id` and `scope` to equal `approval:<actionId>`.
  - Grouped worklist rows now consider receipts for any line in the scenario, not only the first line.
  - Supabase approval-record read failures now fail closed with `503` and `missingSource: approval_records` instead of silently rendering `Awaiting reviewer`.
- Admin-only demo reset backend remediation:
  - Added `POST /admin/demo-reset` to the cockpit API.
  - Direct human auth is required, and only `RECOUP_COCKPIT_ADMIN_PRINCIPAL` or the default CFO admin principal can reset.
  - Reset deletes only `approval_records` where both `id` and `scope` match `approval:<actionId>`, and writes an `audit_refs` reset receipt.
  - Supabase reset uses the locked `recoup_reset_demo_approval_lifecycle` RPC instead of direct table `DELETE`, so delete plus receipt insert are transactional and deployable without a broad delete grant.
  - Reset does not delete SAP/source evidence/read-model rows, including non-approval rows that accidentally share the approval scope.
  - Focused tests passed for non-admin `403`, admin scoped reset, reset receipt creation, no raw table delete, and source-row preservation.

No secret values were printed or copied into this audit.

## Current S1-S8 Production Baseline

All eight work-item detail responses are still pending human review. Approval eligibility is now derived in the backend read model from the selected pending HITL action plus complete action evidence documents, and it is disabled again when a trusted `approval_records` receipt already exists. This is an interim production-hardening step, not a durable evidence-review event with reviewer/timestamp.

| Scenario | First line checked | Verdict shown | Routing shown | Draft status | Approval state | Approval eligibility | Audit state | Action ID |
|---|---|---|---|---|---|---|---|---|
| S1 | S1-L1 | Valid deduction | Route to Billing draft | `pending_human` / Awaiting reviewer | `pending_human` / Awaiting reviewer | Ready / `true` | `pending_human` / Awaiting human approval | `route-billing:S1-L1` |
| S2 | S2-L1 | Valid deduction | Route to Billing draft | `pending_human` / Awaiting reviewer | `pending_human` / Awaiting reviewer | Ready / `true` | `pending_human` / Awaiting human approval | `route-billing:S2-L1` |
| S3 | S3-L1 | Recovery | Recovery draft staged | `pending_human` / Awaiting reviewer | `pending_human` / Awaiting reviewer | Ready / `true` | `pending_human` / Awaiting human approval | `draft-rebill:S3-L1` |
| S4 | S4-L1 | Valid deduction | Route to Billing draft | `pending_human` / Awaiting reviewer | `pending_human` / Awaiting reviewer | Ready / `true` | `pending_human` / Awaiting human approval | `route-billing:S4-L1` |
| S5 | S5-L1 | Recovery | Recovery draft staged | `pending_human` / Awaiting reviewer | `pending_human` / Awaiting reviewer | Ready / `true` | `pending_human` / Awaiting human approval | `draft-rebill:S5-L1` |
| S6 | S6-L1 | Recovery | Recovery draft staged | `pending_human` / Awaiting reviewer | `pending_human` / Awaiting reviewer | Ready / `true` | `pending_human` / Awaiting human approval | `draft-rebill:S6-L1` |
| S7 | S7-L1 | Partial recovery | Recovery draft staged | `pending_human` / Awaiting reviewer | `pending_human` / Awaiting reviewer | Ready / `true` | `pending_human` / Awaiting human approval | `draft-rebill:S7-L1` |
| S8 | S8-L1 | Recovery | Recovery draft staged | `pending_human` / Awaiting reviewer | `pending_human` / Awaiting reviewer | Ready / `true` | `pending_human` / Awaiting human approval | `draft-rebill:S8-L1` |

Positive valid-deduction cases exist and are shown as positive outcomes: S1, S2, and S4. They still do not become persisted completed/approved cases in the current Maya journey.

## State Persistence Classification

| Journey state | What a production judge expects | Current source of truth | Persisted across reload/relogin? | Prod-ready? | Evidence | Risk |
|---|---|---|---|---|---|---|
| Login/session | Real session survives normal navigation and logout clears it. | Supabase demo-login RPC plus signed `recoup_demo_session` cookie. LocalStorage only remembers user ID. | Session survives while cookie exists; user ID remembrance is local only. | Partial | `cockpit/app/api/demo-login/route.ts`, `cockpit/app/demo-auth.ts`, `cockpit/app/login/login-form.tsx` | Demo auth can be mistaken for enterprise identity/session state. |
| Worklist facts | Eight cases load from backend source/read model. | Server-side page fetches Render `/forensics`; details via `/api/forensics/work-items/<lineId>`. | Yes for source/read-model facts. | Yes for facts, no for progress | `cockpit/app/forensics/shadcn/page.tsx`, `cockpit/app/cockpit-data.ts` | Worklist can be shown reliably, but not as a mutable queue. |
| Selected case | Last opened case or current queue position should survive reload/relogin if part of the journey. | React `useState` in Maya surface. | No. | No | `cockpit/components/maya/maya-forensics-surface.tsx` local selection state | Reload returns to backend default, not Maya's last working state. |
| Selected line within case | Switching line should either fetch line-specific details or clearly stay a local visual selection. | `displayLineId` local React state; backend detail remains grounded to opened line. | No. | No | `cockpit/components/maya/deduction-case-workspace.tsx` | User can click line pills, but downstream detail/query/draft can still be for the original line. |
| Evidence pack | Source-backed evidence should load and cite records. | Backend selected decision evidence pack. | Yes for evidence facts. | Yes for facts | `src/services/cockpitModel.ts` builds selected evidence pack from the decision. | Evidence is source-backed, but review state is not. |
| Evidence-reviewed state | Maya should be able to mark/derive evidence reviewed before approval, with reviewer and timestamp. | Interim backend-derived eligibility from complete action evidence documents; no durable reviewer/timestamp event yet. | Derived state survives reload; explicit reviewer event does not exist. | Partial | `src/services/cockpitModel.ts` derives `approvalEligibility` from action evidence coverage and HITL action state. | Approval can be enabled without client guessing, but the product still lacks durable proof that Maya explicitly reviewed evidence. |
| Query answer and agent trace | Query transcript and cited answer should be stored or explicitly marked session-only. | Live `/forensics/query` response held in component state; token/cost receipts may persist separately. | No for answer/trace. | Partial | `cockpit/components/maya/query-evidence-dock.tsx`, `src/services/cockpitApi.ts` | Reload loses the answer and trace, so it is not a durable case note. |
| Draft action | Draft action should be deterministic, source-backed, and staged pending human review. | Recomputed/read-model action from `runForensicsInvestigation`. | Yes as recomputed read model, no as edited packet lifecycle. | Partial | `src/services/cockpitModel.ts`, `src/tools/actions/*` | Draft is stable enough to display, but not a mutable review packet. |
| Approval decision | Approve/modify/reject should persist, dedupe, and rehydrate after reload/relogin. | Backend `/approval` commits Supabase audit chain and `approval_records` when durable audit persistence is selected. Maya detail disables duplicate approval when a trusted receipt exists. | Yes for the S1-L1 browser approval proof; after admin reset it returns to pending. | Yes for approval receipt lifecycle; no for case closure | `src/services/cockpitApi.ts`, `src/services/cockpitModel.ts`, `cockpit/components/maya/approval-gate-dialog.tsx`, `tests/e2e/maya-approval-lifecycle-e2e.ts` | Judge can ask "approve, logout, relogin, and reset"; this proves human decision persistence, not external dispatch or case closure. |
| Audit confirmation | Case Audit tab should show committed receipt from persisted backend state. | Current working tree passes persisted `approvalReceipt` from backend detail into the Audit panel, with local `approvalResponse` only as immediate optimistic current-session input. | Yes when a persisted trusted receipt exists; the S1-L1 browser proof created and rehydrated one before reset. | Partial | `cockpit/components/maya/deduction-case-workspace.tsx`, `cockpit/components/maya/audit-confirmation-panel.tsx`, `src/services/cockpitModel.ts` memory receipt projection | Audit confirmation is source-backed for approval receipts, but the product still lacks broader case lifecycle/closure receipts. |
| Return to worklist | Returning should show honest status: completed/approved only if backend says so; otherwise local focus only. | Local navigation/focus state plus backend worklist receipt status when a persisted trusted receipt exists. | Approval status: yes if receipt exists. Queue progression: no. | Partial because it is honest, no because it is not full lifecycle | `cockpit/components/maya/maya-forensics-surface.tsx`, `cockpit/components/maya/deduction-worklist-table.tsx`, Beat 12 docs | No queue decrement, next-case assignment, or completed status. |
| Case closure | Closed/handled state should persist and be visible in worklist and case detail. | No closure source found; UI intentionally avoids closure claims. | No. | No | `cockpit/components/maya/audit-confirmation-panel.tsx`, invariants banning fake closure | The product is not a closed-loop case management workflow yet. |

## Root Causes

1. The forensics model is primarily a deterministic read model generated from source data and actions. It is not yet joined with a durable case lifecycle store.
2. The current working tree derives approval eligibility from complete backend evidence-document coverage plus pending HITL action state. This removes the UI blocker without inventing a client-side evidence review flag.
3. The approval API has a durable Supabase commit path, and the local browser approval journey now proves approve -> logout/relogin -> admin reset -> relogin for S1-L1 against live Supabase-backed memory.
4. The current working tree now rehydrates persisted `approval_records` into detail and worklist state. Duplicate approval is disabled in detail after a trusted receipt, and grouped worklist rows show `Human decision recorded` only when all sibling line actions in that scenario have trusted receipts.
5. Return-to-worklist is intentionally local. It does not claim backend queue mutation, case completion, next-case assignment, ERP update, Billing dispatch, recovery dispatch, or route completion.
6. Query answers and live agent trace are session UX state, not persisted case notes.

## Scenario-Level Risk Notes

| Scenario group | Current judge-safe narration | Unsafe narration to avoid until fixed |
|---|---|---|
| S1, S2, S4 valid deductions | "Maya identifies a valid deduction and stages a Billing draft behind a human approval gate." | "Maya closed the case", "Billing was routed", "approval persisted on this case", "queue advanced". |
| S3, S5, S6, S8 recovery cases | "Maya identifies recovery posture and stages a recovery draft with cited evidence." | "Recovery was dispatched", "customer outreach was sent", "case is recovered". |
| S7 partial recovery | "Maya identifies partial recovery posture and stages a review-only recovery draft." | "Partial recovery was collected", "payment or ERP state changed". |
| Query chat for any case | "Maya can ask a grounded investigation question and get a cited answer for the current session." | "The query became a persisted case note" unless a durable query-note store is added. |
| Approval/Audit for any case | "The current product enables human approval only from backend-derived evidence/action state and rehydrates committed approval receipts when present. S1-L1 has passed a real browser approve/relogin/reset proof." | "Approval closed the case", "Billing was dispatched", or "ERP/source state changed". |

## Required Remediation Plan

### P0 - Persist And Rehydrate Case Lifecycle

Add a backend-owned case lifecycle/read model keyed by `lineId` and `actionId`. It can be implemented as a Supabase table or a normalized memory category, but the UI must consume it through `/forensics` and `/forensics/work-items/:lineId`.

Minimum fields:

- `lineId`
- `actionId`
- `lifecycleStatus`: `open`, `reviewed`, `approval_pending`, `human_decided`, `closed` or approved equivalent only if product owner approves the names
- `evidenceReviewedAt`
- `evidenceReviewedBy`
- `approvalDecision`
- `approvalAuditEntryHash`
- `approvedBy`
- `approvedAt`
- `receiptRecordIds`
- `caseClosedAt`
- `caseClosedBasis`
- `nextRecommendedLineId` only if backend supplies deterministic basis and record IDs

Do not invent a closed state or next-case recommendation without backend basis.

### P0 - Join Approval Records Back Into Maya Detail

Status in current working tree: implemented for trusted `approval_records` rehydration into work-item detail, Audit panel input, and conservative grouped worklist status. The implementation rejects malformed id/scope receipts, disables duplicate approval eligibility for a selected action after a trusted receipt, labels grouped rows as decided only when all sibling line actions have trusted receipts, and fails closed when the approval-record source cannot be read. Focused unit/API/invariant tests are green. Real browser create-and-relogin validation passes for S1-L1 in `tests/e2e/maya-approval-lifecycle-e2e.ts`.

After `/approval` commits a Supabase audit receipt, `/forensics/work-items/:lineId` must return:

- `approvalState.status = "human_decided"` for that action
- exact decision and approver
- valid 64-hex audit hash
- receipt record IDs
- audit state label from backend, not local component state
- disabled duplicate approval controls

The worklist row should show an approved/decision-recorded status only after the read model sees persisted receipts for every sibling action in that grouped scenario row.

### P0 - TDD Gates

Add RED tests before implementation:

- Unit: persisted `approval_records` are joined into `buildForensicsWorkItemDetailCockpitModel()`.
- API: `POST /approval` then `GET /forensics/work-items/:lineId` returns `human_decided`, decision, approver, audit hash, and cited record IDs.
- E2E: login as Maya, open S1, approve draft, reload, relogin, reopen S1, verify approved state and audit hash remain visible.
- Negative: if approval receipt is absent or malformed, UI stays fail-closed and does not show approved.
- Negative: if duplicate approval is attempted, API returns duplicate/blocked state and UI does not create a second optimistic success.

### P0 - Admin-Only Demo Scenario Reset

Add an admin-only reset path before using persistent approval writes in judge demos. Without reset, a successful approval test can permanently alter the seed demo state and make the next run look pre-approved.

Status in current working tree: backend implemented for `POST /admin/demo-reset`. The endpoint requires verified direct human auth plus an admin principal, removes only `approval_records` whose `id` and `scope` both equal `approval:<actionId>`, preserves source/read-model rows, and writes an `audit_refs` reset receipt. The Supabase path uses a SECURITY DEFINER RPC so delete plus receipt insert happen atomically without granting direct table delete. UI exposure is intentionally not in the Maya analyst cockpit yet; an Admin maintenance surface remains future work.

Requirements:

- Only an admin role or explicit admin token can reset scenario lifecycle state. Maya analyst rights must not reset cases.
- Reset scope must be narrow: demo lifecycle artifacts only, such as `approval_records`, future evidence-review events, future query-note records, and case-lifecycle rows for the selected scenario/action.
- Reset must not delete or mutate source facts from SAP, Supabase source tables, documents, deductions, settlement lines, invoices, PODs, contracts, or customer records.
- Reset must write its own admin audit receipt with operator, scenario/action scope, timestamp, deleted/tombstoned categories, and deterministic basis.
- UI should expose this outside the Maya analyst cockpit, for example an Admin maintenance drawer/page, not as a normal worklist action.
- Add confirmation copy that says the reset is for demo lifecycle state only and does not change ERP/source data.

Tests:

- API: non-admin Maya session gets `403` for reset.
- API: admin reset removes/tombstones only lifecycle records for the requested scenario/action.
- API: reset writes an admin audit receipt.
- API: reset is idempotent.
- Browser: after approving one scenario, logout/relogin shows `Human decision recorded`; after admin reset and relogin, the same scenario returns to `Awaiting reviewer`. Status: passed for S1-L1 in `tests/e2e/maya-approval-lifecycle-e2e.ts`.
- Negative: reset never removes source evidence/read-model rows.

### P1 - Evidence Review State

Add an explicit backend-owned evidence-review event if the product needs a reviewer/timestamp beyond the current backend-derived eligibility projection. Approval must remain disabled if required evidence coverage is missing or if a trusted human decision receipt already exists.

Tests:

- Evidence review event persists with line ID, action ID, reviewer principal, timestamp, reviewed record IDs.
- Approval eligibility becomes available only after the required reviewed evidence set is present.
- Reload/relogin preserves reviewed state.

### P1 - Query Note Persistence

Decide whether query answers are session-only or durable case notes.

If durable:

- Persist question, answer summary, citations, selected line ID, model execution mode, trace receipt IDs, token usage, and created timestamp.
- Rehydrate recent case queries in the Query drawer.
- Keep raw model text policy and cited-answer guardrails.

If session-only:

- Label it as session-only in the UI and do not imply it is part of the case audit.

### P1 - Line Selector Contract

The current line selector should either:

- fetch real detail for the clicked line and update downstream query/draft/audit context, or
- become a read-only line navigator that clearly states "detail remains anchored to opened line".

The preferred production fix is to fetch detail for the clicked line.

### P2 - Worklist Progress And Next Case

Add backend-backed worklist row lifecycle fields before showing:

- completed/approved state
- queue decrement
- next case recommendation
- priority/age/status history
- last updated

Until then, keep return-to-worklist as local navigation only.

## Final Status

| Area | Status |
|---|---|
| Source-backed deduction facts | Mostly production-backed |
| Evidence display | Production-backed for facts; missing reviewed state |
| Query agent | Live/session-backed; not durable case note |
| Draft generation | Deterministic and backend-backed; not edited packet lifecycle |
| Approval API durability | Backend capability exists when Supabase audit chain is configured; persisted receipt rehydration and admin reset are now covered by focused tests |
| Maya approval journey | Approval receipt lifecycle remediated for S1-L1: browser approve, logout/relogin UI receipt, admin reset, and relogin reset UI pass. Still not case closure. |
| Audit tab | Remediated for approval receipts: visible Audit tab renders persisted `approvalReceipt` after relogin and returns to unavailable after reset. |
| Return-to-worklist | Honest local navigation; not production case progression |
| Case closure | Not implemented |
| Logout/re-login | Real-browser local pass: logout clears session, protected route redirects to login, re-login restores Maya workspace and 8-row Worklist |

## Recommended Judge Position Until Fixed

Describe Maya as a governed deduction investigator that computes source-backed verdicts, explains evidence, and stages draft actions behind a human approval boundary.

Do not describe Maya as a production case closure system yet. The S1-L1 approval receipt lifecycle is browser-proven, but closure, queue progression, evidence-review receipts, and admin reset UI exposure remain contract gaps.
