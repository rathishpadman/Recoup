# Maya Shadcn Frontend System Design

Status: approved direction for implementation planning. Implementation still requires a separate code session.

Scope: Maya deduction forensics surface from login through worklist, selected case evidence, query, draft review, human approval, and audit confirmation.

Primary inputs:

- Storyboard: `docs/storyboards/maya-agentic-storyboard-contract.md`
- Component map: `docs/storyboards/maya-shadcn-component-map.md`
- Worklist mockup: `mockups/imagegen/maya-shadcn-worklist-first-2026-06-23.png`
- Evidence mockup: `mockups/imagegen/maya-shadcn-evidence-first-2026-06-23.png`
- Query mockup: `mockups/imagegen/maya-shadcn-query-dock-forward-2026-06-23.png`

## 1. Product Decision

Use a hybrid of the three mockups:

| Journey Moment | Approved Visual Source | Reason |
|---|---|---|
| Maya landing | Worklist-first mockup | Fast backlog scanning, mini dashboard, source honesty, recommended action column. |
| Selected case | Evidence-first mockup | Best Recoup trust story: deterministic basis, evidence families, provenance, gated draft. |
| Query interaction | Query-dock-forward mockup | Best pattern for case-bound questions without making the product feel chat-led. |

The resulting Maya experience should feel evidence-led, not assistant-led:

1. Maya sees her workload and priority queue.
2. Maya opens the highest priority case.
3. The product proves why the case is recoverable through deterministic basis and evidence.
4. Maya may ask a case-bound query.
5. The query answer is cited and read-only.
6. Any recovery action stays draft-only until human approval.
7. Audit confirmation is backend-generated and visible.

Generated mockup text, case IDs, amounts, record IDs, and statuses are not authoritative. They are visual anatomy only. Runtime content must come from backend/read-model data.

## 2. Non-Negotiable Rules

| Rule | Design Consequence |
|---|---|
| Shadcn only | New Maya UI composes shadcn registry primitives and thin domain wrappers. |
| No current bespoke cockpit components | New Maya route must not import `cockpit-shell.tsx`, `premium-components.tsx`, `RecordStrip`, `StatusPill`, `ToolStatusRail`, `MultimodalDock`, or `AuditVerifyChip`. |
| Backend owns business truth | React displays amounts, verdicts, recommendations, evidence state, source readiness, approval state, deterministic basis, record IDs, and audit hash from read models only. |
| HITL is visible | No external action appears sent, dispatched, or committed until the governed approval response says so. |
| Evidence first | Query is helpful, but the primary case view must foreground evidence and deterministic basis. |
| Dense B2B cockpit | Avoid marketing heroes, decorative gradients, oversized cards, nested cards, and chat-first layout. |
| Lucide icons only | Replace Phosphor icons in the new Maya surface with `lucide-react`. |
| Accessibility is part of design | Tables, forms, tabs, sheets, tooltips, and approval dialogs must use semantic shadcn composition. |

## 3. Target Routes

| Route | Phase | Purpose | Notes |
|---|---|---|---|
| `/forensics/shadcn` | Phase 1 review route | Build the new Maya experience without breaking the current `/forensics` demo. | `requireRouteAccess("/forensics")` still allows it because Maya routes include `/forensics` and subpaths. |
| `/login` | Phase 2 shared login replacement | Replace current bespoke login form with shadcn form once Maya route is accepted. | Affects all personas, so do after the Maya review route is stable. |
| `/forensics` | Phase 3 cutover | Replace current Maya page after owner/browser approval. | Remove old imports only when screenshots pass. |

Recommended route sequence:

1. Build `/forensics/shadcn`.
2. Browser review against mockups.
3. Replace `/login` with shadcn form if the shared persona login design passes.
4. Cut over `/forensics`.
5. Delete or isolate obsolete Maya-specific bespoke markup after tests confirm no other persona depends on it.

## 4. Required Shadcn Install

`Button` is already installed. Before implementing the new Maya surface, add the remaining primitives:

```bash
npx shadcn@latest add @shadcn/sidebar @shadcn/card @shadcn/table @shadcn/badge @shadcn/button @shadcn/tooltip @shadcn/alert @shadcn/skeleton @shadcn/tabs @shadcn/accordion @shadcn/sheet @shadcn/scroll-area @shadcn/separator @shadcn/input @shadcn/input-group @shadcn/field @shadcn/textarea @shadcn/alert-dialog @shadcn/collapsible @shadcn/sonner @shadcn/empty @shadcn/toggle-group @shadcn/dropdown-menu @shadcn/select @shadcn/checkbox
```

After adding, read every generated file under `cockpit/components/ui/` and fix any import or composition mismatch before building domain wrappers.

## 5. File Architecture

### 5.1 New Files

| File | Kind | Responsibility |
|---|---|---|
| `cockpit/app/forensics/shadcn/page.tsx` | Server route | Auth gate, fetch read models, render Maya shadcn client surface. |
| `cockpit/components/maya/maya-forensics-surface.tsx` | Client wrapper | Own selected row, active tab, sheet/dialog state. No business logic. |
| `cockpit/components/maya/maya-workspace-shell.tsx` | Client or server component | shadcn `Sidebar` shell and route navigation. |
| `cockpit/components/maya/maya-run-kpi-strip.tsx` | Presentational | Compact KPI cards from read model. |
| `cockpit/components/maya/source-readiness-strip.tsx` | Presentational | Connector/source honesty strip. |
| `cockpit/components/maya/deduction-worklist-table.tsx` | Client component | Worklist table, row selection, filters, recommended action cell. |
| `cockpit/components/maya/recommended-action-cell.tsx` | Presentational | Advisory action with lucide icon and tooltip. |
| `cockpit/components/maya/deduction-case-workspace.tsx` | Client component | Selected case tabs and detail region. |
| `cockpit/components/maya/evidence-dossier.tsx` | Client component | Evidence accordion, table, sheet. |
| `cockpit/components/maya/query-evidence-dock.tsx` | Client component | Case-bound query sheet and submission state. |
| `cockpit/components/maya/agent-trace-panel.tsx` | Presentational | Trace accordion/collapsible from query/read model data. |
| `cockpit/components/maya/cited-answer-card.tsx` | Presentational | Cited read-only answer and blocked states. |
| `cockpit/components/maya/recovery-draft-review.tsx` | Client component | Draft packet tabs and approval entry point. |
| `cockpit/components/maya/approval-gate-dialog.tsx` | Client component | HITL approval dialog posting to `/api/approval`. |
| `cockpit/components/maya/audit-confirmation-panel.tsx` | Presentational | Backend audit result display. |
| `cockpit/components/maya/maya-empty-state.tsx` | Presentational | shadcn `Empty` states for no selected case/no filtered rows. |

### 5.2 Files To Avoid In New Maya Route

| File | Avoidance Rule |
|---|---|
| `cockpit/app/cockpit-shell.tsx` | Do not import from `/forensics/shadcn` or any `cockpit/components/maya/*` file. |
| `cockpit/app/premium-components.tsx` | Do not import. Replace current dock/chip/rail ideas with shadcn primitives. |
| `cockpit/app/approval-controls.tsx` | Do not reuse directly because it is bespoke UI, but keep the same `/api/approval` contract. |
| `cockpit/app/realtime-query-controls.tsx` | Do not reuse directly for the shadcn route. Reuse only the API boundary pattern. |
| `@phosphor-icons/react` | Do not import in new Maya files. |

## 6. Data Contracts

### 6.1 Existing Data To Use First

| Data | Source | Target Components |
|---|---|---|
| `LoginCockpitModel.personas` | `fetchLoginModel()` | Future shadcn login. |
| `ForensicsCockpitModel.kpiStrip` | `fetchForensicsModel()` | `MayaRunKpiStrip`. |
| `ForensicsCockpitModel.worklist` | `fetchForensicsModel()` | `DeductionWorklistTable`. |
| `worklist[].amount` | Backend string | Amount cells. |
| `worklist[].verdictLabel` | Backend string | Verdict badges. |
| `worklist[].evidenceScoreLabel` | Backend string | Evidence badges. |
| `worklist[].queueLabel` | Backend string | Temporary recommended action display. |
| `selected.lineId` | Backend string | Selected case identity. |
| `selected.evidencePack.documents` | Backend rows | `EvidenceDossier`. |
| `selected.evidencePack.recordIds` | Backend record IDs | Citation strips and evidence support. |
| `selected.draft` | Backend draft | `RecoveryDraftReview`. |
| `selected.approvalActions` | Backend action list | `ApprovalGateDialog`. |
| `retrievalStatus` | Backend/source read model | `SourceReadinessStrip`. |
| `mayaJourney` | Backend read model | Audit/journey timeline. |

### 6.2 Read-Model Additions Needed For A Polished Version

These additions should be backend/read-model work, not frontend derivations.

| Field | Needed For | Why |
|---|---|---|
| `runSummary.kpis[].key` | Mini dashboard | Stable keys for pending, high priority, evidence-ready, blocked, approvals waiting, projected recovery. |
| `worklist[].priorityLabel` | Worklist | Priority should be separate from verdict and recommendation. |
| `worklist[].recommendedAction` | Worklist | Avoid overloading `queueLabel`. |
| `worklist[].evidenceState` | Worklist and approval precondition | Clear evidence-ready/blocked/incomplete state. |
| `selected.deterministicBasis` | Evidence-first case view | Show rule IDs, basis, satisfied checks, record IDs. |
| `selected.approvalState` | Draft and approval dialog | Evidence reviewed, allowed decisions, blocked reason. |
| `selected.auditConfirmation` | Audit panel | Audit hash, previous hash, decision ID, timestamp, record IDs. |
| `queryTurn` | Query dock | Status, trace steps, answer, citations, blocked reason. |

Implementation may begin with existing data, but any missing business state must show as absent or disabled, not invented.

## 7. Component Composition

### 7.1 Maya Landing

Visual source: worklist-first mockup.

Component stack:

- `MayaWorkspaceShell`
- `MayaRunKpiStrip`
- `SourceReadinessStrip`
- `DeductionWorklistTable`
- `DeductionCaseWorkspace` empty state

Required behavior:

- Show a compact top KPI strip.
- Show source honesty below KPI strip.
- Worklist remains the primary action surface.
- Detail pane starts empty until Maya selects a row.
- Recommended action appears as advisory copy with a small lucide icon and tooltip.

Must not:

- Show autonomous-send language.
- Show query/chat as the main landing object.
- Compute KPI values from `worklist.length` or labels.

### 7.2 Selected Case Evidence View

Visual source: evidence-first mockup.

Component stack:

- `DeductionCaseWorkspace`
- `EvidenceDossier`
- `RecoveryDraftReview`
- `AuditConfirmationPanel`

Required behavior:

- Case title and status sit above tabs.
- Evidence tab is the default after case selection for the hero path.
- Deterministic basis is visible in a right column or high-priority panel.
- Source provenance is visible near evidence, not hidden in a secondary trace.
- Draft and approval panel stays gated until backend says allowed.

Must not:

- Turn deterministic basis into raw logs.
- Hide record IDs behind generic proof language.
- Treat `verifiedLabel` as a universal approval signal.

### 7.3 Query Dock

Visual source: query-dock-forward mockup.

Component stack:

- `QueryEvidenceDock`
- `AgentTracePanel`
- `CitedAnswerCard`
- `RecoveryDraftReview` summary affordance

Required behavior:

- Query opens as a right-side `Sheet`.
- Sheet title states case-bound query context.
- Submit button posts to the existing governed query route.
- Trace appears as compact accordion/collapsible rows.
- Answer is read-only and cited.
- Blocked/citation guard state appears as `Alert`.

Must not:

- Present unbounded chat.
- Let Maya type case IDs or retrieval scope.
- Use query output as approval state.

## 8. Client State Model

Allowed client state:

```ts
interface MayaForensicsViewState {
  activeTab: "overview" | "evidence" | "agent-trace" | "draft" | "audit";
  approvalDialogOpen: boolean;
  evidenceSheetDocumentId?: string;
  queryDockOpen: boolean;
  queryText: string;
  selectedLineId?: string;
  sidebarCollapsed: boolean;
  worklistFilterText: string;
}
```

Banned client state:

- amount
- verdict
- priority
- recommended action
- deterministic basis
- evidence sufficiency
- source readiness
- approval eligibility
- audit hash
- external dispatch state
- synthetic/live source classification

Any banned state requires backend/read-model fields.

## 9. API Interactions

| Interaction | Frontend Call | Existing Route | Required Behavior |
|---|---|---|---|
| Load Maya model | Server route fetch | `fetchForensicsModel()` | `cache: "no-store"` via existing loader. |
| Load connector readiness | Server route fetch | `fetchConnectorReadinessModel()` | Used for source honesty only. |
| Submit query | Client POST | `/api/query/realtime-tool` | Maya-only verified human auth proxy. |
| Approve/modify/reject draft | Client POST | `/api/approval` | Verified human auth proxy; backend commits or rejects. |
| Login | Client POST | `/api/demo-login` | Existing signed session flow. |
| Logout/user menu | Link or POST | existing logout flow | Keep session handling server-owned. |

The shadcn UI can own loading and error states for these calls, but not the resulting business truth.

## 10. Testing Plan

### 10.1 Tests Before Implementation

Add failing tests before route/component implementation:

| Test | Purpose |
|---|---|
| `tests/invariants/maya-shadcn-boundary.test.ts` | New route must not import old cockpit shell, premium components, Phosphor icons, Decimal, `src/core`, or decision services. |
| `tests/unit/maya-shadcn-route.test.tsx` or closest repo pattern | Route requires Maya auth and fetches only read models. |
| `tests/unit/maya-shadcn-components.test.tsx` if test tooling supports it | Worklist renders backend labels and does not compute status/counts. |
| Update `tests/unit/realtime-next-routes.test.ts` only if query route changes | Existing auth proxy behavior should remain unchanged. |
| Update `tests/e2e/cockpit-premium-e2e.ts` | Add `/forensics/shadcn` screenshot target and core assertions. |

### 10.2 Runtime Verification

Run after implementation:

```bash
npm run lint
npm run typecheck
npm run test
npm run build:cockpit
npm run test:e2e
npm run verify
```

### 10.3 Browser Journey Assertions

The browser test should cover:

1. Maya login.
2. Navigate to `/forensics/shadcn`.
3. Mini dashboard visible.
4. Worklist visible with recommended action column.
5. Selecting a row opens evidence-first case view.
6. Evidence table shows record IDs.
7. Query dock opens as a sheet.
8. Query route blocked/loaded/error states render honestly.
9. Approval dialog opens but does not dispatch on open.
10. Audit hash displays only after backend approval response.

## 11. Visual Audit Gate

Implementation screenshots must be compared against the mockups:

| Target | Required Match | Accepted Delta |
|---|---|---|
| Worklist landing | Mini KPI strip, source strip, dense table, recommended action column | Exact text and numbers differ because backend data is authoritative. |
| Evidence case view | Evidence-first center, deterministic basis/provenance side panel, gated draft/approval | Section order may adapt for responsive behavior. |
| Query dock | Right-side sheet, case-bound badges, trace accordion, cited/blocked answer | Voice affordance may stay absent or disabled in first implementation. |

Fail conditions:

- UI reads as a generic AI dashboard.
- Query/chat dominates the landing screen.
- Cards are nested inside cards.
- Purple/blue AI gradient language appears.
- Raw backend enum names become primary user copy.
- Synthetic/demo source looks live.
- Any amount or verdict appears to be frontend-computed.
- Approval looks sent before backend confirmation.

## 12. Implementation Phases

### Phase A - Shadcn Foundation

1. Add required shadcn registry components.
2. Audit generated UI files.
3. Confirm `npm run typecheck` still passes.

Done when:

- All required primitives exist under `cockpit/components/ui`.
- No added component violates shadcn composition rules.

### Phase B - Review Route

1. Add `/forensics/shadcn/page.tsx`.
2. Add Maya wrapper components.
3. Wire existing `fetchForensicsModel()` and `fetchConnectorReadinessModel()`.
4. Render landing and selected-case states using existing fields only.

Done when:

- Maya can open `/forensics/shadcn`.
- David/CFO cannot access it.
- No old cockpit components are imported.

### Phase C - Query And Approval

1. Add `QueryEvidenceDock` using `/api/query/realtime-tool`.
2. Add `ApprovalGateDialog` using `/api/approval`.
3. Render blocked, pending, success, and failure states.

Done when:

- Query is case-bound in the UI contract.
- Approval dialog requires deliberate submit.
- Backend rejection keeps the draft uncommitted.

### Phase D - Login And Cutover

1. Replace login form with shadcn composition after review route passes.
2. Cut `/forensics` over to the shadcn Maya surface.
3. Keep old route recoverable until final approval.

Done when:

- `/login` still supports all demo personas.
- `/forensics` renders shadcn-only Maya.
- Browser screenshots pass against the selected visual direction.

## 13. Open Decisions Before Code

Recommended defaults are included so implementation is not blocked.

| Decision | Recommendation |
|---|---|
| Build route | Start with `/forensics/shadcn`, then cut over. |
| Login replacement timing | After Maya route review, because login is shared across personas. |
| Voice controls | Do not build voice in the first shadcn Maya pass. Reserve disabled/secondary affordance only if needed. |
| Query API | Use existing `/api/query/realtime-tool` first. Avoid new query endpoints unless backend needs a structured `QueryTurn`. |
| Read-model gaps | Implement existing-data version first, then add backend fields for stable KPI keys, recommended action, deterministic basis, approval state, query turn, and audit confirmation. |
| Mockup official status | Commit all three PNGs as visual references, but mark worklist/evidence/query roles clearly in docs. |

## 14. Definition Of Done For Maya Shadcn UI

- `/forensics/shadcn` or cutover `/forensics` uses shadcn primitives only.
- No imports from current bespoke Maya cockpit components.
- Worklist landing matches worklist-first information architecture.
- Selected case matches evidence-first information architecture.
- Query uses right-side sheet and cited/blocked answer states.
- Approval uses `AlertDialog` and backend `/api/approval`.
- Audit confirmation displays backend hash only.
- Mini dashboard includes the six agreed Maya KPI concepts when backend fields exist.
- Recommended action column exists with lucide icon and tooltip.
- All business values come from read models or API responses.
- `npm run verify` passes.
- Browser screenshots are captured and compared against the three mockups.
