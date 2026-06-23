# Maya Shadcn Component Map

Status: draft for owner review. This is the missing step 2 between the Maya storyboard and visual mockup approval.

Scope: Maya persona only. This map covers login through audit confirmation for the deduction forensics journey described in `docs/storyboards/maya-agentic-storyboard-contract.md`.

Non-goal: no frontend implementation is authorized by this document. This file names the shadcn components, thin domain wrappers, data inputs, local UI state, and banned business logic that the later frontend system design must honor.

## 1. Current Shadcn Project Context

The project is shadcn-ready and configured with:

| Field | Current Value | Build Meaning |
|---|---|---|
| Style | `radix-nova` | Use shadcn Radix components and nova styling. |
| Base | `radix` | Use Radix composition rules such as `asChild` where needed. |
| Tailwind | v4 | Theme tokens live in `cockpit/app/styles.css`. |
| UI alias | `@/components/ui` | Import shadcn primitives from this alias. |
| Components path | `cockpit/components/ui` | Registry components are added as source files here. |
| Icon library | `lucide` | Use `lucide-react`; remove Phosphor from the new Maya surface. |
| Installed UI components | `button` | All other required primitives must be added before implementation. |

Required add command before Maya implementation:

```bash
npx shadcn@latest add @shadcn/sidebar @shadcn/card @shadcn/table @shadcn/badge @shadcn/button @shadcn/tooltip @shadcn/alert @shadcn/skeleton @shadcn/tabs @shadcn/accordion @shadcn/sheet @shadcn/scroll-area @shadcn/separator @shadcn/input @shadcn/input-group @shadcn/field @shadcn/textarea @shadcn/alert-dialog @shadcn/collapsible @shadcn/sonner @shadcn/empty @shadcn/toggle-group @shadcn/dropdown-menu @shadcn/select @shadcn/checkbox
```

This command is not yet executed as part of this map.

## 2. Replacement Boundary

The new Maya implementation must not import or compose these current bespoke UI modules:

| Existing Module | Status For New Maya Surface | Reason |
|---|---|---|
| `cockpit/app/cockpit-shell.tsx` | Replace | Current shell, pills, record strips, and navigation are bespoke. |
| `cockpit/app/premium-components.tsx` | Replace | Current docks, chips, rails, traces, and visual widgets are bespoke. |
| `cockpit/app/styles.css` large route-specific class system | Do not use as component architecture | Keep global tokens, but do not recreate the current custom screen system. |
| `@phosphor-icons/react` imports | Replace | shadcn config uses lucide. |
| Hand-built table role markup | Replace | Use shadcn `Table` composition. |
| Hand-built login fields and persona buttons | Replace | Use `Field`, `Input`, `ToggleGroup`, and `Button`. |

Allowed local wrappers are thin composition wrappers only. They may bind data, own view state, and call approved route handlers, but they must not compute business outcomes.

## 3. Registry Inventory

| Component | Install State | Used In | Required Notes |
|---|---:|---|---|
| `Button` | Installed | All screens | Icons inside buttons use lucide icons with `data-icon`. No custom loading prop. |
| `Sidebar` | Needed | Workspace shell | Use for persistent route navigation and persona workspace context. |
| `Card` | Needed | Login, KPI strip, selected case, answer, draft | Use full `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` composition. |
| `Table` | Needed | Worklist, evidence rows, audit metadata | Use real table elements and captions where helpful. |
| `Badge` | Needed | Verdicts, source states, HITL, citation status | Prefer variants and semantic tokens over raw colors. |
| `Tooltip` | Needed | Agent recommendation icon, record IDs, hash explanation | Do not use visible helper prose when tooltip is enough. |
| `Alert` | Needed | Source gaps, blocked query, uncited answer, audit failure | Use for system truth and blockers, not marketing copy. |
| `Skeleton` | Needed | Run load, trace load, query retrieval | Use registry skeletons, not custom pulse blocks. |
| `Tabs` | Needed | Case detail and draft packet | `TabsTrigger` must stay inside `TabsList`. |
| `Accordion` | Needed | Evidence families and trace steps | Good for dense expandable proof. |
| `Sheet` | Needed | Query dock and evidence detail | Every sheet needs a `SheetTitle`. |
| `ScrollArea` | Needed | Sidebar, worklist, trace, query history | Use for dense panes without custom overflow wrappers. |
| `Separator` | Needed | Case metadata, trace sections, audit metadata | Use instead of hand-made border dividers. |
| `Input` | Needed | Login and filters | Use inside `Field`; do not use ad hoc label markup. |
| `InputGroup` | Needed | Query composer and search/filter bars | Use `InputGroupInput` or `InputGroupTextarea`. |
| `Field` | Needed | Login, approval note, filters | Use `FieldGroup`, `FieldLabel`, `FieldDescription` where needed. |
| `Textarea` | Needed | Approval note and long query mode | Use through `Field` or `InputGroupTextarea`. |
| `AlertDialog` | Needed | Human approval gate | Title is required; approval cannot happen from a normal button alone. |
| `Collapsible` | Needed | Advanced trace details | Keep raw tool detail secondary. |
| `sonner` | Needed | Lightweight success after backend-confirmed state refresh | No optimistic business status may persist. |
| `Empty` | Needed | Empty detail pane and no-results filters | Use instead of hand-built empty markup. |
| `ToggleGroup` | Needed | Demo persona shortcut and query mode | Option sets with 2 to 7 choices use this, not manual active buttons. |
| `DropdownMenu` | Needed | User menu, saved views, compact row actions | Items stay inside groups. |
| `Select` | Needed | Worklist filters with closed option sets | `SelectItem` must stay inside `SelectGroup`. |
| `Checkbox` | Needed | Evidence review checklist if the backend exposes explicit review steps | `FieldSet`/`FieldLegend` should group related checks. |

## 4. Thin Domain Wrappers

These wrappers are allowed because they compose shadcn primitives and bind read-model data. They must not introduce a new visual design system.

| Wrapper | Proposed File | Uses | Owns Local UI State | Must Not Own |
|---|---|---|---|---|
| `MayaLoginSurface` | `cockpit/components/maya/maya-login-surface.tsx` | `Card`, `Field`, `Input`, `ToggleGroup`, `Button`, `Alert` | Selected persona shortcut, input values, submit pending, local auth error | Role authorization, default route decision, password validation semantics |
| `MayaWorkspaceShell` | `cockpit/components/maya/maya-workspace-shell.tsx` | `Sidebar`, `ScrollArea`, `Separator`, `Tooltip`, `DropdownMenu`, `Button` | Sidebar collapse, active view affordance | Route authorization, source readiness, persona permissions |
| `MayaRunKpiStrip` | `cockpit/components/maya/maya-run-kpi-strip.tsx` | `Card`, `Badge`, `Skeleton`, `Tooltip` | None beyond presentation | KPI math, projected recovery, priority counts |
| `SourceReadinessStrip` | `cockpit/components/maya/source-readiness-strip.tsx` | `Badge`, `Tooltip`, `Alert`, `Separator` | Expanded details | Source state, synthetic/live classification |
| `DeductionWorklistTable` | `cockpit/components/maya/deduction-worklist-table.tsx` | `Table`, `Badge`, `Button`, `Tooltip`, `ScrollArea`, `DropdownMenu` | Selected row, keyboard focus, filter open state | Verdicts, amounts, evidence completeness, recommended action |
| `RecommendedActionCell` | `cockpit/components/maya/recommended-action-cell.tsx` | `Badge`, `Tooltip`, lucide icon | Tooltip open state only | Recommendation text, action eligibility |
| `DeductionCaseWorkspace` | `cockpit/components/maya/deduction-case-workspace.tsx` | `Tabs`, `Card`, `Badge`, `Separator`, `Empty`, `Skeleton` | Active tab | Case verdict, deterministic basis, action status |
| `EvidenceDossier` | `cockpit/components/maya/evidence-dossier.tsx` | `Accordion`, `Table`, `Badge`, `Sheet`, `Tooltip`, `Alert` | Open accordion item, selected evidence drawer | Evidence contents, required document rules, source provenance |
| `QueryEvidenceDock` | `cockpit/components/maya/query-evidence-dock.tsx` | `Sheet`, `InputGroup`, `Textarea`, `Button`, `Badge`, `Skeleton`, `Alert` | Dock open, draft question, selected query mode | Query scope, citations, blocked answer reason, retrieval outcome |
| `AgentTracePanel` | `cockpit/components/maya/agent-trace-panel.tsx` | `Accordion`, `Collapsible`, `Badge`, `Separator`, `ScrollArea` | Expanded trace row | Tool status truth, trace labels, guardrail pass/fail |
| `CitedAnswerCard` | `cockpit/components/maya/cited-answer-card.tsx` | `Card`, `Badge`, `Alert`, `Button`, `Tooltip` | Copy feedback after user action | Answer text, citations, amounts, deterministic basis |
| `RecoveryDraftReview` | `cockpit/components/maya/recovery-draft-review.tsx` | `Tabs`, `Card`, `Alert`, `Badge`, `Button`, `Separator` | Active draft subtab | Draft amount, action status, clamp/basis, recipient/action type |
| `ApprovalGateDialog` | `cockpit/components/maya/approval-gate-dialog.tsx` | `AlertDialog`, `Field`, `Textarea`, `Badge`, `Button`, `Alert` | Dialog open, human note text, submit pending | Approval eligibility, human identity, external dispatch state |
| `AuditConfirmationPanel` | `cockpit/components/maya/audit-confirmation-panel.tsx` | `Alert`, `Badge`, `Tooltip`, `Button`, `Separator`, `Table` | None beyond presentation | Audit hash, previous hash, timestamp, committed state |

## 5. Storyboard Frame To Component Mapping

| Frame | Storyboard Beat | Primary Wrapper | Shadcn Composition | Data Inputs | Local State | Business Logic Ban |
|---:|---|---|---|---|---|---|
| 1 | Login | `MayaLoginSurface` | `Card`, `FieldGroup`, `Field`, `Input`, `ToggleGroup`, `Button`, `Alert` | `LoginCockpitModel.personas`, `/api/demo-login` response | Persona selection, form fields, submit pending | No frontend role decision or route entitlement logic. |
| 2 | Workspace landing | `MayaWorkspaceShell`, `MayaRunKpiStrip`, `SourceReadinessStrip` | `Sidebar`, `ScrollArea`, `Separator`, `Card`, `Badge`, `Alert`, `Skeleton` | `ForensicsCockpitModel.kpiStrip`, `retrievalStatus`, signed session | Sidebar collapse | No KPI math or source state inference. |
| 3 | Worklist scan | `DeductionWorklistTable`, `RecommendedActionCell` | `Table`, `Badge`, `Button`, `Tooltip`, `ScrollArea`, `DropdownMenu`, `Select` | `worklist[]`, selected scenario ID | Selected row, filters, sort control display | No recomputing verdict, amount, priority, evidence score, or recommended action. |
| 4 | Crestline selected | `DeductionCaseWorkspace` | `Tabs`, `Card`, `Badge`, `Separator`, `Button`, `Empty` | `selected`, selected `worklist` row, `selected.draft` | Active tab | No enabling approval from local-only heuristics. |
| 5 | Evidence review | `EvidenceDossier` | `Accordion`, `Table`, `Badge`, `Sheet`, `Tooltip`, `Alert` | `selected.evidencePack.documents`, `recordIds`, evidence-view API result | Open evidence detail | No synthetic/live relabeling, no document sufficiency decision. |
| 6 | Ask query | `QueryEvidenceDock` | `Sheet`, `InputGroup`, `InputGroupTextarea`, `Button`, `Badge`, `Skeleton`, `Alert` | Selected case context, query API response | Draft question, dock open, send pending | No broad query scope, no uncited answer construction. |
| 7 | Agentic trace | `AgentTracePanel` | `Accordion`, `Collapsible`, `Badge`, `Separator`, `ScrollArea` | `QueryTurn.traceSteps` or read-model trace | Expanded trace details | No fake live trace rows. |
| 8 | Cited answer | `CitedAnswerCard` | `Card`, `Badge`, `Alert`, `Button`, `Tooltip` | `QueryTurn.answer`, citations, blocked reason | Copy confirmation only | No model-computed amount or citation synthesis. |
| 9 | Draft review | `RecoveryDraftReview` | `Tabs`, `Card`, `Alert`, `Badge`, `Button`, `Separator` | `selected.draft`, evidence pack, approval state | Active draft tab | No external send, no ERP write-back affordance. |
| 10 | Approval | `ApprovalGateDialog` | `AlertDialog`, `Field`, `Textarea`, `Badge`, `Button`, `Alert` | `ApprovalState`, session principal, approval API response | Dialog open, human note, submit pending | No approval without human POST and backend authorization. |
| 11 | Audit confirmation | `AuditConfirmationPanel` | `Alert`, `Badge`, `Tooltip`, `Button`, `Separator`, `Table` | `AuditConfirmation` from backend | None beyond presentation | No fabricated hash or committed state. |
| 12 | Return to worklist | `DeductionWorklistTable`, `AuditConfirmationPanel` | `Table`, `Badge`, `Button`, `sonner`, `Tooltip` | Refreshed `worklist[]`, action status | Toast visible | No lasting optimistic business status after backend rejection. |

## 6. Screen-Level Details

### 6.1 Login

Target route: `cockpit/app/login/page.tsx` with a new shadcn-only client form replacing `cockpit/app/login/login-form.tsx`.

| Area | Component | Exact Shadcn Anatomy | Data |
|---|---|---|---|
| Login container | `MayaLoginSurface` | `Card` with `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | Static product label plus persona model data. |
| Persona shortcut | `ToggleGroup` | `ToggleGroup`, `ToggleGroupItem` | `LoginCockpitModel.personas[].loginId`, `persona`, `workspace`. |
| Credentials | `FieldGroup` | `Field`, `FieldLabel`, `Input`, `FieldDescription` | User-entered `loginId` and `password`. |
| Error | `Alert` | `AlertTitle`, `AlertDescription` | Error from `/api/demo-login`; no backend secret detail. |
| Submit | `Button` | `Button` with lucide `ArrowRight` using `data-icon="inline-end"` | Submit state only. |

Accessibility requirements:

- Form error sets `aria-describedby` and `role="alert"`.
- Persona choice uses `ToggleGroup` selection semantics, not custom `aria-pressed` buttons.
- Submit button is disabled while the request is pending.

### 6.2 Workspace Shell And Mini Dashboard

Target route: either replace `cockpit/app/forensics/page.tsx` after approval or build a review route such as `cockpit/app/forensics/shadcn/page.tsx`.

| Area | Component | Exact Shadcn Anatomy | Data |
|---|---|---|---|
| Persistent navigation | `MayaWorkspaceShell` | `Sidebar`, `SidebarHeader`, `SidebarContent`, `SidebarGroup`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarFooter` | Signed session, allowed routes. |
| User menu | `DropdownMenu` | `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuGroup`, `DropdownMenuItem` | Signed session and logout route. |
| Mini dashboard | `MayaRunKpiStrip` | Four to six compact `Card` instances | `ForensicsCockpitModel.kpiStrip`; future read model should expose the agreed Maya KPI keys. |
| Source readiness | `SourceReadinessStrip` | `Badge`, `Tooltip`, `Alert`, `Separator` | `retrievalStatus` and connector readiness. |
| Main panes | Page layout plus `ScrollArea` | shadcn primitives inside CSS grid/flex layout | No invented business values. |

Required Maya KPIs:

| KPI | Display Rule | Data Owner |
|---|---|---|
| Total pending items | Count label only | Backend/read model. |
| High priority items | Compact count with evidence context | Backend/read model. |
| Evidence-ready cases | Count or ratio if backend provides it | Backend/read model. |
| Blocked or evidence-incomplete cases | Count and blocker label | Backend/read model. |
| Draft approvals waiting | Count and status | Backend/read model. |
| Projected recovery queue value | Display only if already backend-computed | Backend/read model. |

### 6.3 Worklist

Primary wrapper: `DeductionWorklistTable`.

| Column | Shadcn Cell Composition | Data Field | Notes |
|---|---|---|---|
| Customer and scenario | `TableCell`, text, optional `Badge` | `worklist[].customerLabel`, `scenarioId`, `scenarioType` | Keep row dense; no hero formatting. |
| Verdict or routing | `Badge` plus `Tooltip` | `worklist[].verdictLabel` or routing label | Humanize labels without changing status. |
| Amount | `TableCell` with read-only formatted string | `worklist[].amount` | Never compute or transform into a new amount. |
| Evidence | `Badge`, `Tooltip` | `worklist[].evidenceScoreLabel`, record count if exposed | Evidence completeness is backend-owned. |
| Recommended action | `RecommendedActionCell` | `worklist[].queueLabel` now; future `recommendedAction` field preferred | Include a small lucide icon such as `Sparkles` or `Bot` only as a recommendation marker. |
| Row actions | `Button`, `DropdownMenu` | allowed UI actions from read model | Avoid autonomous action labels. |

Interaction requirements:

- Table rows are keyboard reachable.
- Selected row sets `aria-selected`.
- Row selection updates `DeductionCaseWorkspace`.
- Filtering uses `Select`, `DropdownMenu`, or `InputGroup`; filtered results that return none use `Empty`.
- The recommended action icon must have a tooltip such as `Forensics recommendation`.

### 6.4 Case Detail

Primary wrapper: `DeductionCaseWorkspace`.

| Section | Shadcn Composition | Data |
|---|---|---|
| Scenario header | `Card`, `CardHeader`, `Badge`, `Separator` | Selected worklist item plus `selected.lineId`. |
| Metadata strip | `Table` or compact `CardContent` grid | Line ID, record IDs, scenario type, verdict, draft status. |
| Tabs | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Overview, Evidence, Agent Trace, Draft, Audit. |
| Disabled/blocked state | `Alert` | Approval blocked reason from backend/read model. |
| Empty detail | `Empty` | No selected case. |

The selected case must make the deterministic basis visible without turning the UI into raw logs. Where the current data model lacks fields, the frontend system design should request read-model additions rather than invent labels.

### 6.5 Evidence Dossier

Primary wrapper: `EvidenceDossier`.

| Evidence Area | Shadcn Composition | Data |
|---|---|---|
| Evidence families | `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` | Grouped by `documentType` or future evidence family field. |
| Evidence table | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` | `selected.evidencePack.documents[]`. |
| Source/provenance | `Badge`, `Tooltip` | `sourceLabel`, `verifiedLabel`, source mode if exposed. |
| Record IDs | `Badge` or compact inline list with `Tooltip` | `selected.evidencePack.recordIds`, `citationId`. |
| Detail drawer | `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription` | Evidence detail and summaries. |
| Missing support | `Alert` | Backend blocked reason. |

Evidence review gating:

- Opening primary evidence may update local view state immediately, but approval eligibility must come from the backend/read model.
- If the UI records evidence viewed, it must POST the evidence-view event through an approved route and refresh the approval state.
- Synthetic evidence must never be visually styled or labeled as live.

### 6.6 Query Dock

Primary wrapper: `QueryEvidenceDock`.

| Area | Shadcn Composition | Data |
|---|---|---|
| Dock | `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription` | Selected case context. |
| Scope badges | `Badge`, `Tooltip` | Case-bound, read-only, cited answer required. |
| Prompt | `InputGroup`, `InputGroupTextarea`, `InputGroupAddon` | Local draft question. |
| Submit | `Button` with lucide `Send` using `data-icon` | Query POST state. |
| Loading | `Skeleton` | Pending query. |
| Blocked result | `Alert` | Backend blocked reason. |
| Mode | `ToggleGroup` | Text now; voice disabled or secondary if not implemented. |

Query rules:

- The selected case ID must be attached by the route handler, not typed by Maya.
- The UI may disable submit for empty input.
- The UI may not widen retrieval scope from local state.
- Uncited answers render as blocked with `Alert`, not as a narrative answer.

### 6.7 Agent Trace

Primary wrapper: `AgentTracePanel`.

| Trace Area | Shadcn Composition | Data |
|---|---|---|
| Trace list | `Accordion` | `QueryTurn.traceSteps` or existing trace read model. |
| Advanced tool detail | `Collapsible` | Tool/service IDs, bounded detail, status. |
| Status | `Badge` | running, complete, blocked, failed. |
| Long content | `ScrollArea` | Trace rows. |
| Phase divisions | `Separator` | Query, retrieval, guardrail, answer. |

Allowed user-facing trace labels:

- Query Agent
- Forensics context
- Delivery proof retriever
- Evidence reader
- Recovery drafter
- Citation and action guard
- Audit ledger

Every displayed live trace row must map to actual tool, service, agent, or precomputed read-model data. Demo/precomputed traces must be labeled honestly.

### 6.8 Cited Answer

Primary wrapper: `CitedAnswerCard`.

| Area | Shadcn Composition | Data |
|---|---|---|
| Answer shell | `Card` | `QueryTurn.answer`. |
| Citation strip | `Badge`, `Tooltip` | Record IDs and citation IDs. |
| Status | `Badge`, `Alert` | Cited, partial, blocked. |
| Actions | `Button` | Copy citations, open evidence, review draft. |

Answer constraints:

- Amounts display only from backend fields already present in the selected case or draft.
- Citation IDs remain visible near every business claim.
- A copy action may copy existing citations but cannot create new citation text.

### 6.9 Draft Review

Primary wrapper: `RecoveryDraftReview`.

| Area | Shadcn Composition | Data |
|---|---|---|
| Draft packet | `Card` | `selected.draft`. |
| Packet tabs | `Tabs` | Summary, Evidence, Message, Audit Basis. |
| Warning | `Alert` | Human approval required, no ERP write-back. |
| Action state | `Badge` | Draft-only, pending human, blocked. |
| Approve/reject controls | `Button` opening `ApprovalGateDialog` | Backend allowed decisions. |

This screen must never imply the draft has been sent. Labels should say `draft`, `pending human`, or the exact backend-provided status.

### 6.10 Human Approval Gate

Primary wrapper: `ApprovalGateDialog`.

| Area | Shadcn Composition | Data |
|---|---|---|
| Dialog | `AlertDialog`, `AlertDialogTitle`, `AlertDialogDescription` | Approval summary. |
| Human note | `Field`, `FieldLabel`, `Textarea`, `FieldDescription` | Optional note, required when backend says so. |
| Evidence status | `Badge`, `Alert` | Evidence reviewed, blocked reason. |
| Decision buttons | `Button` | Approve, reject, request changes from `approvalActions`. |
| Pending submit | `Button` disabled with registry `Spinner` if installed later | API request state. |

Approval constraints:

- The principal comes from the signed session.
- The POST route enforces role and evidence state.
- A human note is local only until submitted.
- Dialog close without submit makes no external action.

### 6.11 Audit Confirmation And Queue Return

Primary wrappers: `AuditConfirmationPanel` and `DeductionWorklistTable`.

| Area | Shadcn Composition | Data |
|---|---|---|
| Success or failure | `Alert` | Backend audit write result. |
| Hash metadata | `Table`, `Badge`, `Tooltip`, `Separator` | Audit hash, previous hash, timestamp, decision ID. |
| Next case | `Button`, `Table` selected row state | Refreshed worklist. |
| Toast | `sonner` | Lightweight confirmation after backend state refresh only. |

If the audit write fails, the row cannot display a committed decision state. The recovery action remains visibly uncommitted.

## 7. Data Mapping

The current cockpit read model already exposes several fields that can feed the Maya shadcn surface.

| Current Field | Used By | Notes |
|---|---|---|
| `LoginCockpitModel.personas` | Login persona shortcut | Use for demo persona selection. |
| `ForensicsCockpitModel.kpiStrip` | Mini dashboard | Good first implementation source; future model should expose stable KPI keys. |
| `ForensicsCockpitModel.worklist` | Worklist table | Missing a dedicated `recommendedAction` field; current `queueLabel` can be shown only if product approves the label. |
| `worklist[].amount` | Amount cell | Display only. Do not compute. |
| `worklist[].verdictLabel` | Verdict badge | Display only. |
| `worklist[].evidenceScoreLabel` | Evidence badge | Display only. |
| `ForensicsCockpitModel.selected.lineId` | Selected case header | Display and case binding. |
| `selected.evidencePack.recordIds` | Citation strips | Display wherever evidence supports a claim. |
| `selected.evidencePack.documents` | Evidence dossier | Table and sheet details. |
| `selected.draft` | Draft review | Draft action ID, label, amount, basis, status. |
| `selected.approvalActions` | Approval dialog | Render allowed actions only. |
| `multimodalDock.subAgents` | Early trace/query source | Can seed trace view if verified as real read-model trace. |
| `mayaJourney` | Audit/journey timeline | Can display journey checkpoints. |
| `retrievalStatus` | Source readiness | Use with connector readiness model where available. |

Read-model additions recommended before implementation:

| Needed Field | Reason |
|---|---|
| Stable KPI keys | Avoid matching dashboard logic by display label. |
| `worklist[].priorityLabel` | Separate priority from recommendation. |
| `worklist[].recommendedAction` | Support the Beat 3 recommended-action cell without overloading `queueLabel`. |
| `worklist[].evidenceState` | Use explicit evidence-ready/blocked/incomplete state. |
| `selected.deterministicBasis` | Show rule, basis, and record IDs without raw logs. |
| `ApprovalState.evidenceReviewed` | Backend-owned approval precondition. |
| `ApprovalState.blockedReason` | Honest disabled states. |
| `QueryTurn` | Query status, cited answer, citations, trace steps, blocked reason. |
| `AuditConfirmation` | Entry hash, previous hash, timestamp, decision ID, record IDs. |

These are data contract requests, not UI-computed fields.

## 8. State Ownership

Allowed frontend state:

- selected work item
- active case tab
- query dock open or closed
- evidence sheet open or closed
- active evidence family
- draft query text
- approval dialog open or closed
- human approval note before submit
- filter controls and search text
- sidebar collapsed state
- short-lived toast visibility

Banned frontend state:

- amount
- verdict
- recovery eligibility
- evidence sufficiency
- source readiness
- priority score
- recommended action
- approval eligibility
- external action dispatched state
- audit hash
- deterministic basis
- record IDs
- whether synthetic evidence is live

## 9. Accessibility And Composition Rules

| Rule | Application |
|---|---|
| Overlay title required | `Sheet` and `AlertDialog` always include a title. |
| Tabs composition | `TabsTrigger` always inside `TabsList`. |
| Form layout | Use `FieldGroup` and `Field`; avoid raw label/input stacks. |
| Input groups | Use `InputGroupInput` or `InputGroupTextarea`, not raw input inside `InputGroup`. |
| Option sets | Use `ToggleGroup` for persona shortcuts and query mode. |
| Tables | Use shadcn `Table`, not role-based div tables. |
| Empty states | Use `Empty`. |
| Loading | Use `Skeleton`; add registry `Spinner` if button-level progress is required. |
| Status display | Use `Badge`, not custom styled spans. |
| Dividers | Use `Separator`, not custom border divs. |
| Icons | Use lucide icons; button icons carry `data-icon`. |
| Layout spacing | Use flex/grid gaps, not `space-x-*` or `space-y-*`. |
| Color | Use semantic tokens and variants; no raw Tailwind color ramp as business status language. |

## 10. Visual Direction From The Component Map

The ImageGen mockups should be judged against this map:

| Mockup Variant | Must Show | Must Not Show |
|---|---|---|
| Worklist-first | Sidebar, mini KPI dashboard, source strip, dense table, recommended-action column | Chatbot bubble, autonomous-send CTA, decorative hero, invented values. |
| Evidence-first | Selected case, evidence families, record IDs, provenance badges, evidence sheet pattern | Generic document cards without source identity. |
| Query-dock-forward | Case-bound query sheet, trace accordion, cited answer, human approval continuity | Unbounded assistant chat or uncited model answer. |

Generated images are visual direction only. Text, numbers, labels, record IDs, and state truth must still come from the backend/read model during implementation.

## 11. Implementation Sequence After Approval

1. Add the required shadcn components with the command in section 1.
2. Review every added file under `cockpit/components/ui` for registry composition correctness.
3. Build the Maya wrappers under `cockpit/components/maya/`.
4. Add a review route, preferably `/forensics/shadcn`, unless owner approves direct replacement.
5. Wire read-model data from existing cockpit loaders first.
6. Add read-model fields listed in section 7 before exposing any unsupported UI state.
7. Replace old Maya imports only after browser review and owner approval.
8. Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run verify`.

## 12. Acceptance Checklist

- Every Maya screen maps to named shadcn primitives.
- Every wrapper has a clear file target and state boundary.
- Current bespoke UI modules are banned from the new Maya surface.
- `button` is recognized as already installed; other required primitives are named before implementation.
- Mini dashboard includes pending items, high-priority items, evidence-ready cases, blocked or evidence-incomplete cases, draft approvals waiting, and backend-computed projected recovery only when available.
- Worklist has a `Recommended action` column with a small lucide recommendation icon and tooltip.
- Query dock is case-bound, read-only, and citation-required.
- Human approval uses `AlertDialog`.
- Audit confirmation uses backend-generated hash data only.
- No React component computes dollars, verdicts, thresholds, source readiness, approval eligibility, or audit state.
