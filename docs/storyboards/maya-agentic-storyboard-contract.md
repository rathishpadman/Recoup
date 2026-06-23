# Maya Agentic Storyboard Contract

Status: draft for owner review. No frontend implementation is authorized by this document.

Scope: Maya persona only, from login through one completed deduction decision and audit confirmation.

UI rule: shadcn-only composition. The next cockpit build must not reuse the current bespoke UI components in `cockpit/app/cockpit-shell.tsx`, `cockpit/app/premium-components.tsx`, or the current large custom CSS screen system as component architecture. Domain components are allowed only as thin wrappers composed from shadcn primitives.

Data rule: every business value, verdict, amount, record ID, status, deterministic basis, source state, and audit hash must come from backend/read-model data. React components may format and arrange data, but they must not compute dollars, thresholds, verdicts, routing decisions, scores, source readiness, or approval state.

## 1. Product Intent

Maya is a senior deductions analyst starting her morning work. The product must make her feel three things in the first two minutes:

1. The backlog has already been organized into a small number of evidence-backed cases.
2. The agentic system is useful because it retrieves, explains, drafts, and routes work, not because it chats.
3. Maya remains the accountable human for any external action.

The storyboard should sell governed agency: the AI system accelerates investigation and drafting, while deterministic services compute every dollar and the approval/audit layer prevents autonomous action.

## 2. Narrative Spine

The hero path is the Crestline shortage scenario because it clearly demonstrates evidence contradiction: the customer claimed shortage, but the signed POD supports full delivery. Other deduction scenarios can be browsed in the worklist, but they are not part of this first storyboard contract.

The path:

1. Maya signs in.
2. The cockpit opens to her deductions workspace.
3. She sees a compact morning run summary and a prioritized worklist.
4. She selects the Crestline shortage case.
5. She reviews the evidence dossier and deterministic basis.
6. She asks the query agent why the case is recoverable.
7. The agentic trace shows a bounded supervisor/specialist retrieval path.
8. The answer returns with cited record IDs and no model-computed dollars.
9. Maya opens the recovery draft.
10. The approval gate requires evidence review and human approval.
11. The approved decision writes an audit state and hash.
12. Maya returns to the worklist with the next best case queued.

This is one storyboard, not a multipath flowchart. Alternate states are captured as error and fallback beats, not as separate journeys.

## 3. Shadcn-Only Surface Rule

Use shadcn registry primitives as the visual system:

| UI Need | Shadcn Primitive |
|---|---|
| App shell navigation | `Sidebar`, `Separator`, `ScrollArea`, `Tooltip` |
| Login form | `Card`, `Field`, `Input`, `Button`, `Alert`, `Badge` |
| Worklist | `Table`, `Badge`, `Button`, `Tooltip`, `ScrollArea` |
| Case detail | `Tabs`, `Card`, `Separator`, `Badge`, `ScrollArea` |
| Evidence dossier | `Accordion`, `Table`, `Badge`, `Tooltip`, `Sheet` |
| Query dock | `Sheet`, `InputGroup`, `Textarea` or `Input`, `Button`, `Badge`, `Skeleton`, `Alert` |
| Agent trace | `Accordion`, `Collapsible`, `Badge`, `Separator`, `ScrollArea`, `Tooltip` |
| Draft review | `Card`, `Tabs`, `Alert`, `Badge`, `Button`, `Separator` |
| Human approval | `AlertDialog`, `Button`, `Field`, `Textarea`, `Badge` |
| Audit confirmation | `Alert`, `Badge`, `Button`, `Tooltip`, `Separator` |
| Loading and empty states | `Skeleton`, `Empty`, `Alert` |

Domain wrappers may exist only to bind read-model data and compose these primitives:

- `MayaWorkspace`
- `MayaLoginCard`
- `DeductionRunSummary`
- `MayaRunKpiStrip`
- `DeductionWorklistTable`
- `EvidenceDossier`
- `QueryEvidenceDock`
- `AgentTracePanel`
- `RecoveryDraftReview`
- `ApprovalGate`
- `AuditConfirmation`

Each wrapper must stay presentational or interaction-local. It may call approved APIs/read-model loaders, but it may not reproduce backend decision logic.

## 4. Storyboard Beats

### Beat 0 - Precondition: Auth Boundary Exists

Goal: establish that Maya is entering a governed workspace, not a public demo dashboard.

User state:
Maya is starting a morning settlement review. She expects to clear high-value cases without losing evidence context.

System state:
Demo login roles exist. Maya can access the forensics workspace and run trace route, but not David or CFO-only routes.

Primary UI:
- Centered login shell.
- `Card` for sign-in.
- `Field` and `Input` for identity/password.
- `Button` for sign-in.
- `Alert` for local auth errors.
- `Badge` for "Forensics workspace" only after persona is selected.

Explicit exclusions:
- No connector rail on login.
- No source-health proof before authentication.
- No raw SAP, Supabase, audit hash, schema, or tool labels on login.
- No marketing hero.

Acceptance:
An invalid login shows a local error and no backend secret detail. A valid Maya login routes to Maya's default forensics workspace.

### Beat 1 - Login: Maya Enters Recoup

Maya action:
She chooses or enters the Maya demo identity and signs in.

System response:
The app validates the signed demo session and routes Maya to the forensics workspace.

Agent narrative:
No agent is active. This is a product/auth state, not an AI moment.

Shadcn composition:
- `CardHeader`: Recoup, Forensics workspace.
- `CardContent`: login fields and persona shortcut.
- `CardFooter`: sign-in button and subdued policy note.
- `Alert`: invalid session or expired session.

Data obligations:
- Display name and role come from the demo session/read model.
- Allowed routes come from auth/session logic.

Failure states:
- Invalid credentials.
- Expired session.
- Attempted direct navigation to a route Maya cannot access.

### Beat 2 - Workspace Landing: Morning Run Summary

Maya action:
She lands in the deductions workspace.

System response:
The workspace opens with a dense operational layout:
- left shadcn sidebar
- top mini dashboard with pending work and risk/priority KPIs
- source readiness strip
- worklist table
- empty detail prompt until a case is selected

Agent narrative:
The overnight forensics service has already prepared the run. The UI does not imply that the model is currently inventing the ranking.

Shadcn composition:
- `Sidebar`: product navigation and Maya workspace routes.
- `Badge`: source provenance labels such as read-only, synthetic, blocked, or deferred.
- `Card`: compact mini-dashboard KPI tiles.
- `Table`: worklist.
- `Alert`: if source context is incomplete or a source is synthetic.
- `Skeleton`: loading state while read model is fetched.

Data obligations:
- Run summary and mini-dashboard KPIs come from the cockpit/read model.
- Gold-set facts remain backend-owned.
- Source readiness labels come from connector/readiness model.
- Synthetic sources must be labeled before display.
- Recommended mini-dashboard KPIs for Maya: total pending items, high-priority items, evidence-ready cases, blocked/evidence-incomplete cases, draft approvals waiting, projected recovery queue value if already computed by backend.
- KPI labels must be compact and operational. Avoid celebratory copy and avoid implying realized recovery before approval.

Primary copy direction:
"Morning deduction run" is acceptable. Avoid "AI found money" or any copy implying autonomous recovery.

Acceptance:
Maya sees a mini dashboard that gives immediate workload and priority context, but the worklist remains the primary action surface. The source strip is compact and honest, not decorative.

### Beat 3 - Worklist: Maya Scans Prioritized Cases

Maya action:
She scans the table and notices the Crestline shortage case is high priority.

System response:
The table shows each scenario as a row with:
- customer
- scenario type
- verdict/routing state
- amount display from backend
- evidence completeness state
- record ID count or key citations
- recommended action

Agent narrative:
The forensics service is the classifier/orchestrator. The UI shows the result, deterministic basis availability, and a recommended action, not a live model monologue.

Shadcn composition:
- `Table`, `TableHeader`, `TableRow`, `TableCell`.
- `Badge` for verdict and routing.
- `Button` variant `ghost` or `outline` for row actions.
- `Tooltip` for terse status explanation.
- `ScrollArea` for dense lists.
- A small lucide agent/recommendation icon may appear inside the recommended-action cell, wrapped in `Tooltip` text such as "Forensics recommendation." It must not be an avatar, emoji, or autonomous-action badge.

Interaction:
- Rows are keyboard reachable.
- Selection uses `aria-selected`.
- Selecting a row updates the detail pane without losing list context.
- A collapsed rail may appear after selection, but full worklist context must remain recoverable.

Acceptance:
Selecting at least three different worklist rows updates the detail pane with different backend-sourced evidence and basis.
Recommended actions remain advisory until Maya selects a row and reaches the relevant evidence or approval step.

### Beat 4 - Case Selection: Crestline Shortage Opens

Maya action:
She selects the Crestline shortage case.

System response:
The detail region opens with:
- scenario header
- verdict/routing explanation
- deterministic basis pane
- evidence dossier
- query dock affordance
- draft/approval section disabled until evidence-review requirement is satisfied

Agent narrative:
The system is presenting the outcome of a forensics investigation with evidence citations. The model may explain, but it does not compute the recovery amount.

Shadcn composition:
- `Tabs`: Overview, Evidence, Agent Trace, Draft.
- `Card`: selected scenario summary.
- `Badge`: invalid, recovery, evidence-ready.
- `Separator`: divide basis, evidence, and next action.
- `Button`: open evidence, ask query, review draft.

Data obligations:
- Customer, scenario, line IDs, amount, verdict, routing, rule ID, event ID, and record IDs come from backend.
- Supporting documents must be present before invalid/partial classification is shown as actionable.

Acceptance:
The selected case cannot proceed to approval until Maya opens at least one primary evidence item.

### Beat 5 - Evidence Dossier: Maya Reviews Proof

Maya action:
She opens the evidence tab and clicks the signed POD evidence.

System response:
The evidence dossier shows:
- evidence families, e.g. POD, remittance, invoice, contract, TPM when applicable
- record IDs
- retrieval/source provenance
- whether source is live/read-only/synthetic/deferred
- the specific basis for the verdict

Agent narrative:
Specialist retrieval tools have produced bounded evidence. The UI should show retrieval as a traceable support function, not a mysterious AI conclusion.

Shadcn composition:
- `Accordion`: evidence families.
- `Table`: evidence rows.
- `Badge`: source and provenance.
- `Sheet`: evidence detail drawer.
- `Tooltip`: record ID and source details.
- `Alert`: missing evidence or incomplete pack.

Data obligations:
- Evidence viewed state is tracked for the approval gate.
- Record IDs remain visible wherever evidence supports a claim.
- The UI never labels synthetic evidence as live.

Acceptance:
Opening the POD marks the evidence-review precondition as satisfied for this case and records that Maya viewed primary evidence.

### Beat 6 - Ask The Agent: Maya Starts A Query

Maya action:
She opens the query dock and asks: "Why is this shortage deduction recoverable?"

System response:
The dock accepts text first. Voice can be a later enhancement, but the storyboard must reserve space for voice/text parity because Recoup has the voice citation invariant.

Agent narrative:
The query agent receives a case-bound question and routes only to read tools and retrieval specialists. It may call:
- POD retrieval
- remittance/document retrieval
- audit read
- case context read

It must not call external action tools and must not produce an uncited answer.

Shadcn composition:
- `Sheet`: right-side query dock.
- `InputGroup` or `Textarea`: prompt field.
- `Button`: ask/send.
- `Badge`: case-bound, read-only, cited answer required.
- `Skeleton`: retrieval in progress.
- `Alert`: blocked/uncited response.

Data obligations:
- The query must be scoped to the selected case.
- The answer must include record IDs.
- If answer cannot cite evidence, it must return a blocked/no-answer state.

Acceptance:
Maya sees that the query is case-bound and read-only before she submits.

### Beat 7 - Agentic Work: Supervisor And Specialists Are Visible

Maya action:
She waits while the system retrieves evidence.

System response:
The query dock shows a compact work trace:
- Query Agent accepted the question.
- Forensics context attached the selected case.
- POD Retriever checked delivery proof.
- Document/Audit reader checked supporting record IDs.
- Guardrail checked citation completeness.

Agent narrative:
This is an orchestration trace, not a fake autonomous theater. The "supervisor" should be shown only as the owner of routing and final response quality. Specialists should be shown only when they correspond to real backend/tool boundaries.

Shadcn composition:
- `Accordion`: trace steps.
- `Collapsible`: advanced details.
- `Badge`: running, complete, blocked.
- `Separator`: query, retrieval, guardrail, answer.
- `ScrollArea`: long trace.

Data obligations:
- Trace labels must map to actual tool/service/agent boundaries or be explicitly labeled as demo/precomputed.
- Tool calls shown as live must come from real trace/read-model data.
- Guardrail failure must be visible when it blocks output.

Acceptance:
The trace explains what happened without requiring Maya to read raw logs.

### Beat 8 - Answer: Cited Explanation Returns

Maya action:
She reads the answer.

System response:
The answer explains:
- what the customer claimed
- what the primary evidence showed
- why the deterministic rule classified the deduction as recoverable
- which record IDs support the answer
- what next action is available

Agent narrative:
The model explains the deterministic basis and cited evidence. It does not create or alter dollar amounts.

Shadcn composition:
- `Card`: answer summary.
- `Badge`: cited, read-only, no external action.
- `Button`: copy citations, open evidence, review draft.
- `Alert`: if the answer is partial or blocked.

Data obligations:
- Record IDs appear in answer and citation strip.
- Amounts are read-only values from backend.
- If voice is enabled later, spoken answer and text answer must carry the same record IDs.

Acceptance:
Maya can move directly from answer to evidence or draft review without losing context.

### Beat 9 - Draft Review: Recovery Packet Opens

Maya action:
She opens the draft tab.

System response:
The system shows the recovery draft packet:
- draft summary
- supporting evidence
- recipient/action type
- computed amount display from backend
- clamp/basis if applicable
- approval requirements

Agent narrative:
Recovery Drafter prepared language and packet structure. It did not compute the amount. It cannot send the action.

Shadcn composition:
- `Tabs`: Summary, Evidence, Message, Audit Basis.
- `Card`: draft packet.
- `Badge`: draft-only, human approval required.
- `Alert`: no external action until approved.
- `Button`: approve, reject, request changes.

Data obligations:
- Draft action ID and status come from service layer.
- External action status remains draft/pending until human approval.
- No ERP write-back path is implied.

Acceptance:
The primary action is visibly gated. The user cannot confuse "draft ready" with "sent."

### Beat 10 - Human Approval Gate

Maya action:
She clicks approve or opens the approval dialog.

System response:
The approval dialog requires a deliberate human decision. It shows:
- approver identity
- action being approved
- evidence viewed state
- cited record IDs
- final warning that the system stages/drafts only according to configured action boundaries

Agent narrative:
No agent approves. Maya is the human reviewer; segregation of duties rules still apply where proposer and approver identities matter.

Shadcn composition:
- `AlertDialog`: approval confirmation.
- `Field` and `Textarea`: optional human note.
- `Button`: approve/reject.
- `Badge`: HITL required, evidence reviewed.
- `Alert`: approval blocked reason.

Data obligations:
- Human principal comes from signed session.
- Approval API enforces human identity and role.
- The UI displays blocked state if approval cannot proceed.

Acceptance:
No external action dispatches merely by opening the dialog. Approval must be an explicit POST through the governed approval route.

### Beat 11 - Audit Confirmation

Maya action:
She confirms approval.

System response:
The UI displays:
- decision/action state update
- audit entry hash
- previous hash or chain reference when available
- record IDs
- timestamp
- next best item

Agent narrative:
The audit confirmation is product/system output, not model prose.

Shadcn composition:
- `Alert`: successful audit write.
- `Badge`: verified, pending, or blocked.
- `Button`: view audit, next case.
- `Tooltip`: hash explanation.
- `Separator`: decision metadata.

Data obligations:
- Audit hash is backend-generated.
- The UI must not fabricate hashes for preview.
- If audit write fails, the decision remains visibly uncommitted.

Acceptance:
Maya can prove the decision was recorded and can navigate to the next case.

### Beat 12 - Return To Worklist

Maya action:
She returns to the worklist or clicks next case.

System response:
The selected case row updates to reflect the current draft/approval/audit state. The next recommended case is highlighted but not auto-opened.

Agent narrative:
The system recommends, Maya chooses.

Shadcn composition:
- `Table`: updated row state.
- `Badge`: approved, draft staged, audit verified.
- `Button`: next case.
- `Toast`/`sonner`: optional lightweight confirmation.

Data obligations:
- Updated statuses come from read model refresh.
- No optimistic business status may persist if backend rejects the update.

Acceptance:
Maya can continue the queue without losing traceability.

## 5. Error And Fallback Beats

| Failure | UI State | Required Behavior |
|---|---|---|
| Source missing | `Alert` in worklist/detail | Explain unavailable source without inventing substitute evidence. |
| Evidence incomplete | `Alert` in dossier and disabled approval | Block invalid/partial action if required support docs are missing. |
| Query uncited | `Alert` in query dock | Return blocked answer, not a best-effort narrative. |
| Tool failure | `Alert` plus trace row | Show compact failure event and preserve case context. |
| Approval rejected | `AlertDialog` result + row state | Keep draft unsent and show human rejection reason if supplied. |
| Audit write failure | `Alert` in confirmation area | Do not mark decision committed. |
| Session expired | Login redirect + `Alert` | Preserve no secret details. |

## 6. Data And API Contract For The Storyboard

The implementation plan should identify the exact existing endpoints/read models, but the storyboard requires these data shapes:

- `DemoSession`: display name, role, allowed routes, default route.
- `ForensicsRunSummary`: run ID, scenario counts, source status summary, mini-dashboard KPI values, last refreshed label.
- `DeductionWorkItem`: scenario ID, customer label, scenario type, amount display, verdict, routing, evidence state, record IDs, recommended action.
- `DeductionCaseDetail`: rule ID, event ID, deterministic basis, supporting docs, line IDs, draft actions.
- `EvidenceDocument`: document ID, source family, provenance, retrieved timestamp or as-of label, record IDs, summary.
- `QueryTurn`: question, status, answer, citations, trace steps, blocked reason.
- `ApprovalState`: evidence reviewed, approver identity, action ID, allowed decisions, blocked reason.
- `AuditConfirmation`: entry hash, previous hash if available, decision ID, timestamp, record IDs.

The frontend may add view state:

- selected work item
- open tab
- query dock open/closed
- evidence drawer open/closed
- approval dialog open/closed

It may not add business state:

- verdict
- recovery amount
- source readiness
- approval eligibility
- audit hash
- deterministic basis
- recommended action

## 7. Agent Narrative Contract

The storyboard uses this narrative vocabulary:

| Role | User-Facing Label | Responsibility |
|---|---|---|
| Maya | Human reviewer | Chooses case, reviews evidence, asks questions, approves or rejects. |
| Query Agent | Query Agent | Accepts case-bound questions and returns cited answers. |
| Forensics Context | Forensics context | Provides selected case, deterministic basis, and allowed retrieval scope. |
| POD Retriever | Delivery proof retriever | Retrieves delivery/POD evidence for shortage and OTIF questions. |
| Document Reader | Evidence reader | Retrieves supporting document snippets and record IDs. |
| Recovery Drafter | Recovery drafter | Drafts recovery packet language from approved deterministic facts. |
| Guardrail | Citation and action guard | Blocks uncited answers and prevents external action without HITL. |
| Audit Trail | Audit ledger | Records decisions and approval outcomes in the hash chain. |

Do not show more agents than this in Maya's first storyboard. More agents can exist in backend architecture, but the UI should stay legible.

## 8. Frame-By-Frame Storyboard Table

| Frame | Screen | Maya Action | System/Agent Response | Shadcn Composition | Evidence/HITL Rule |
|---|---|---|---|---|---|
| 1 | Login | Enters Maya session | Authenticates and routes to forensics | `Card`, `Field`, `Input`, `Button`, `Alert` | No source proof before auth |
| 2 | Workspace | Scans morning run | Shows mini dashboard, workload KPIs, and source honesty | `Sidebar`, `Card`, `Badge`, `Table` | KPI/source labels from backend |
| 3 | Worklist | Selects Crestline shortage | Opens case detail from recommended action row | `Table`, `Tabs`, `Card`, `Badge`, `Tooltip` | Amount/verdict/recommendation read-only |
| 4 | Evidence | Opens signed POD | Marks evidence reviewed | `Accordion`, `Sheet`, `Badge`, `Tooltip` | Record IDs visible |
| 5 | Query | Asks why recoverable | Starts bounded retrieval | `Sheet`, `InputGroup`, `Button`, `Skeleton` | Read-only query |
| 6 | Trace | Watches retrieval | Shows query/forensics/retrieval/guardrail steps | `Accordion`, `Collapsible`, `Badge` | Trace maps to real tool/service data |
| 7 | Answer | Reads cited answer | Explains evidence and deterministic basis | `Card`, `Badge`, `Alert`, `Button` | Cited record IDs required |
| 8 | Draft | Reviews recovery packet | Shows draft-only action packet | `Tabs`, `Card`, `Alert`, `Button` | No autonomous send |
| 9 | Approval | Confirms decision | Approval API commits human decision | `AlertDialog`, `Field`, `Textarea`, `Button` | HITL + human identity |
| 10 | Audit | Views confirmation | Shows hash and next case | `Alert`, `Badge`, `Tooltip`, `Button` | Backend hash only |

## 9. ImageGen Mockup Direction

The first visual pass produced three master direction mockups:

1. Worklist-first: table dominates, detail opens after selection.
2. Evidence-first: selected case and evidence dossier dominate, worklist becomes rail.
3. Query-dock-forward: evidence and query dock share the hero moment.

The second visual pass produced one image per storyboard beat:

- Index: `docs/storyboards/maya-12-beat-mockup-index.md`
- Folder: `mockups/imagegen/maya-12-beat-storyboard/`
- Contact sheet: `mockups/imagegen/maya-12-beat-storyboard/contact-sheet.png`

Future reruns should use this constraint block:

```text
Create a premium shadcn/Radix enterprise finance application screen for Recoup Maya forensics. Use shadcn primitives only: Sidebar, Card, Table, Badge, Tabs, Sheet, Accordion, Alert, Button, Tooltip, ScrollArea. Show login-to-worklist-to-case investigation design language, including a compact mini dashboard for pending items, high-priority items, evidence-ready cases, blocked cases, and draft approvals waiting. In the worklist, show a recommended-action column with a small lucide-style agent recommendation icon and tooltip, not an avatar. Keep it dense operational B2B SaaS, light-first, petrol teal and neutral tokens, no purple gradients, no avatar, no chatbot bubble, no fake live labels, no invented amounts, no autonomous send button. Text accuracy is secondary; component anatomy, density, evidence hierarchy, and human approval gate are primary.
```

Generated images remain visual anatomy only. Text, numbers, record IDs, statuses, and business state must come from backend/read-model data during implementation.

## 10. Verification Plan

Storyboard approval gates:

1. Owner approves narrative sequence from login through audit.
2. Owner approves shadcn-only component rule.
3. Owner approves ImageGen variant prompts.
4. Owner approves one visual direction.
5. Frontend system design maps the approved storyboard to files, routes, components, read-model data, tests, and deprecation plan for old bespoke UI.

Implementation verification later:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run verify`
- Browser journey test: login, worklist selection, evidence review, query, approval dialog, audit confirmation.
- UI assertions: no raw backend enum as primary copy, no synthetic source rendered as live, no React-computed business values, no old bespoke cockpit components imported by the new Maya route.

## 11. Open Product Decisions

These should be answered before implementation planning, but they do not block ImageGen mockup creation:

1. Should the first Maya mockup include voice controls, or reserve voice for a later state after text query is approved?
2. Should the login screen use persona shortcuts for the hackathon demo, or a plain sign-in form with Maya prefilled by demo credentials?
3. Should the first implementation replace `/forensics` directly, or introduce a temporary `/forensics/shadcn` route for review before cutover?

Recommended defaults:

1. Show voice as a disabled/secondary affordance in the storyboard mockup; build text query first.
2. Use persona shortcuts in demo mode, but keep the visual language as secure sign-in.
3. Use a temporary `/forensics/shadcn` route for review, then cut over after browser approval.
