<!-- Semantic Markdown edition converted from Recoup_Business_Requirements_Document_v3.3.4_Cash_Application_Agent_Workspace.docx. The DOCX remains the formatting authority. Source SHA-256: 526137ED0C29A373D459EE40179B735B76A0CB755E409696370BFF883FFCCBD9. -->

**HCLTECH  ·  AUTONOMOUS FINANCE PRACTICE**

# Business Requirements Document

Remittance Email, Cash Application & Live Agent Workspace

*End-to-end customer short-payment journey through Cash Application, Deduction Forensics and Maya*

For the Agentic Deduction & Claims Management Platform (Recoup)

Initial controlled business scenario: container / bottle deposit deduction (DEP), extended upstream to verified remittance-email intake.

| Attribute | Detail |
| --- | --- |
| Document ID | RB-O2C-CASHAPP-FOR-BRD-003 |
| Version | 3.3.4 - Final-review readiness and implementation-entry amendment |
| Status | Final design review candidate; Phase 0-only authorization requested; implementation remains NO-GO |
| Date | 22 August 2026 |
| Process area | Order-to-Cash · Accounts Receivable · Cash Application · Deduction & Dispute Management |
| Runtime boundary | Final-review validation of N4 SAP evidence, N5 worker data safety, and the synchronized BRD v3.3.4 / SDD v0.9.4 / TDD v0.9.4 implementation-entry gate |
| Revision basis | Independent Round 3 findings plus final-review clarification that document approval may authorize Phase 0 only and cannot close runtime safety evidence |

Document boundary. The business demonstration starts when a customer sends a remittance email and ends when a cited Forensics result is visible in Maya's queue with any external action pending eligible-human approval. It does not authorize ERP posting, customer correspondence or autonomous Billing/Collections execution.

Confidential - for internal and client review only.

## Document control

### Version history

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 3.2 source | 19 Aug 2026 | Reviewed | Downstream DEP forensics BRD; starts after the coded deduction reaches Maya. |
| 3.3 | 21 Aug 2026 | Draft for owner validation | Adds verified remittance email, deterministic cash application, live-case handoff, Agent Operations and governed Maya routing; corrects SDD/invariant conflicts. |
| 3.3.1 | 22 Aug 2026 | Audit-amended draft | Resolves persistence-authority conflict; makes cash run control backward-compatible; defines receipt-wait re-drive, one canonical state machine, prompt-cache governance, cache versioning, Decimal boundary conversion and release-blocking pinned-contract checks. |
| 3.3.2 | 22 Aug 2026 | Implementation-reachability amendment | Adds the production recoup_config constraint migration, seventh pinned contract, SAP-only receipt slice, CSV reason-code gate, scanner reachability, dual Maya cache versions, non-blocking agent narration, Render worker runtime and a 95% eligible-population effectiveness target. |
| 3.3.3 | 22 Aug 2026 | Runtime-safety and evidence amendment | Requires successful SAP metadata and bounded-read proof, gates worker construction and claims, separates fixture regression from live effectiveness, preserves the six connector names and fixes the final config-constraint name. |
| 3.3.4 | 22 Aug 2026 | Final-review candidate | Records the failed SAP 401 probe as open Phase 0 evidence, co-locates D-02/D-04/D-05/D-08 proof requirements, and makes N5 closure dependent on split runtime proof: no construction when disabled and no claim/mutation when enabled but unconfigured. |

### Approvals

| Role | Decision responsibility | Name / approval |
| --- | --- | --- |
| Business Owner - AR / Cash Application | Cash semantics, matching policy, exception ownership |  |
| Treasury / Cash Receipt Owner | Authoritative receipt source, settlement status and freshness |  |
| Deductions & Disputes Lead | Forensics evidence policy, Maya workflow and routing |  |
| Security / Legal Owner | Mailbox, sender policy, attachment retention and access |  |
| Billing Operations Lead | Draft Billing handoff and external execution boundary |  |
| Credit & Collections Lead | Draft recovery handoff and human approval |  |
| Solution Architect | Canonical data authority, events, controls and deployment target |  |

### Related documents and precedence

| Document | Use in this revision |
| --- | --- |
| INVARIANTS.md | Highest technical contract for deterministic money, evidence, HITL, audit, source purity, no ERP write-back and cockpit provenance. |
| RECONCILIATION_LEDGER.md | Binding draft-only Billing-loop and no autonomous ERP mutation decisions. |
| Recoup_v2_SDD.md / SDD v3.0 | Higher-level approved architecture, agent/tool boundaries, REST/SSE, read-only adapters, run controls and Maya cockpit. It prevails over this BRD when a conflict remains unresolved. |
| Recoup BRD v3.2 Cash Apps | Source BRD reviewed section by section; useful deposit rules retained and gaps corrected. |
| Remittance Email to Cash Application to Maya implementation plan | Approved narration, delivery dependencies, risks and recommended owner decisions. |
| 2026-08-21-cash-application-agent-workspace-sdd-addendum.md | Change-specific architecture derived from this BRD and subordinate to INVARIANTS.md, RECONCILIATION_LEDGER.md and the approved base SDD. Any residual conflict is a stop-and-resolve condition. |
| 2026-08-21-cash-application-agent-workspace-technical-design.md | Implementation-level design subordinate to the approved SDD addendum; maps each requirement to files, pinned contracts, tests, rollout and rollback evidence. |

Contents

- Document control
  - Version history
  - Approvals
  - Related documents and precedence
- 1. Executive assessment of BRD v3.2
  - 1.1 What is reusable
  - 1.2 Critical changes required
  - 1.3 Section-by-section source review
- 2. Purpose, objectives and scope
  - 2.1 Purpose
  - 2.2 Business objectives
  - 2.3 In scope
  - 2.4 Out of scope
  - 2.5 Success statement
- 3. Definitions and governing principles
  - 3.1 Non-negotiable principles
- 4. End-to-end business journey
  - 4.1 Responsibility split
- 5. Inbound remittance and security requirements
- 6. Deterministic cash application and live-case requirements
  - 6.1 Cash Application Agent
  - 6.2 Proposed live-case state
- 7. Forensics, recovery and Maya requirements
  - 7.1 Deposit validation retained from v3.2
- 8. Live Agent Operations workspace
  - 8.1 Workspace acceptance presentation
- 9. Data, event and audit requirements
- 10. Business rules
- 11. Exception and failure handling
- 12. Non-functional requirements
- 13. Acceptance scenarios and definition of done
  - 13.1 End-to-end acceptance scenarios
  - 13.2 Definition of done
- 14. Implementation dependency plan
- 15. Owner decisions required before implementation
- Appendix A. RACI
- Appendix B. Requirement-to-control traceability
- Appendix C. Likely implementation touch points
- Appendix D. Source notes
## 1. Executive assessment of BRD v3.2

Coverage verdict: PARTIAL - NOT IMPLEMENTATION-READY FOR THE REQUESTED SCOPE. The source BRD provides useful downstream deposit-forensics evidence and arithmetic, but explicitly excludes the upstream cash-application process and contains no verified email ingestion or live Agent Operations requirements.

The source BRD can remain a domain reference for container/bottle-deposit investigation. It cannot be passed directly to implementation for the requested demonstration because the process boundary, system responsibilities, durability controls and cockpit behavior are incomplete, and several requirements conflict with the locked Recoup runtime contract.

### 1.1 What is reusable

- The deposit evidence pillars: original charge, proof of return, outstanding returnable stock, governed rate source and prior credit.
- The deterministic formulas for valid quantity and valid/invalid allocation, provided all monetary values are produced by Decimal-safe code.
- Valid, invalid and partial outcomes with cited evidence and a human-reviewed downstream route.
- The intent to retain an audit trail and require human approval before any external action.
- Root-cause tagging and a draft prevention recommendation to Billing after a supported Forensics conclusion.
### 1.2 Critical changes required

- Move the formal start point from an already-coded dispute case to a verified remittance email.
- Introduce deterministic cash matching/allocation and short-pay deduction creation before Forensics.
- Propose read-only SAP OData as the slice-one CashReceipt authority only after a successful configured-sandbox metadata probe and bounded approved-fixture read; existing client/auth/metadata/source-health plumbing is reusable, but the cleared-item entity mapping is not yet proven.
- Validate the deduction reason deterministically before dispatching a short pay to DEP Forensics.
- Add a live-case contract that does not weaken or repurpose the locked S1-S8 gold dataset.
- Add durable workflow runs/events, atomic inbox/outbox handling, scoped handoffs and cursor-based SSE.
- Make Agent Operations event-backed and truthful for idle, queued, running, waiting, blocked, handed-off and completed states.
- Remove autonomous straight-through processing and all implied SAP/ERP mutation or case write-back.
- Replace static runtime email addresses, master data and amounts with source/config contracts or clearly labelled acceptance fixtures.
### 1.3 Section-by-section source review

| Source section | Coverage | Finding | Revision action |
| --- | --- | --- | --- |
| Front matter / control | Partial | Defines downstream DEP scope and predecessor but no unified end-to-end ownership. | Reframe as one email-to-Maya BRD; add decision owners and precedence. |
| 1. Introduction | Gap | Explicitly starts after coding and excludes upstream cash application. | Expand purpose, objectives and scope to verified email, cash matching, short-pay and Maya. |
| 2. Process & actors | Gap | No inbound provider, trusted CashReceipt source, Cash Application Agent, conductor, event store or workspace operator. | Replace process start and RACI; separate agent, code/service and human authority. |
| 3. Deduction anatomy | Retain with conditions | Useful deposit domain model, but values are presented like runtime master data. | Keep DEP as controlled initial scenario; require live/config provenance for production values. |
| 4. Evidence model | Partial | Strong SAP deposit evidence; absent email, remittance, match, hash and calculation provenance. | Add ingress, cash-match and canonical evidence chain before Forensics. |
| 5. Validation logic | Partial | Useful formulas; source wording assigns computation to the agent, assumes DEP was already coded and includes an undefined policy window. | Make code authoritative for money/reason coding; unresolved policies fail closed. |
| 6. Worked scenarios | Gap | Covers only downstream valid/invalid/partial cases; no trigger, live states, retries or failures. | Add end-to-end acceptance scenarios and label legacy values as fixtures only. |
| 7. Resolution & handoffs | Conflict | Implies routed email, ERP credit creation, write-back and case closure as platform behavior. | Limit Recoup to governed drafts/read models; external execution remains human-controlled. |
| 8. SAP reference | Partial | Strong read evidence but GUI transaction language includes create actions. | Retain read-only evidence mappings; describe external create transactions as outside Recoup. |
| 9. Functional requirements | Major gap | Missing receipt verification, reason coding, ingress, cash application, live-case, events, SSE and workspace controls; FR-10/14 conflict. | Replace with implementable requirement families and invariant mappings. |
| 10. Business rules | Partial | Good deposit rules; lacks idempotency, atomicity, source authority, no-model-money and truthful status rules. | Retain deposit rules and add the upstream/control rule set. |
| 11. Exit criteria | Gap | Starts after deduction coding and treats external routing/closure as completed. | Define email-to-Maya acceptance and pending-human outcome; no ERP mutation. |
| 12. Appendices | Conflict / partial | Static schedules/addresses appear authoritative and RACI omits Cash Application and Agent Operations. | Convert to fixtures/placeholders; add full RACI, traceability and decisions. |

## 2. Purpose, objectives and scope

### 2.1 Purpose

This BRD defines an implementable, governed customer-payment journey in which a verified remittance email initiates work, a successfully proven read-only SAP OData cleared-item source establishes received funds, deterministic code maps the versioned CSV reason code, matches and allocates the receipt, creates a canonical short-payment case, and presents the resulting Forensics work item to Maya with cited evidence and a pending human decision.

### 2.2 Business objectives

- Demonstrate visible agent collaboration from a real business trigger rather than a pre-scripted UI sequence.
- Reduce manual remittance interpretation and case setup while keeping monetary decisions deterministic and auditable.
- Give Maya a complete evidence chain from email receipt through cash allocation, short-pay creation and Forensics classification.
- Prevent remittance instructions from being mistaken for settled cash and prevent an unvalidated customer reason from selecting DEP Forensics.
- Prove that failures, duplicate messages and ambiguous matches are contained without creating duplicate or unsupported business state.
- Preserve human control over all customer, Billing, Collections and ERP outcomes.
### 2.3 In scope

- One verified inbound mailbox/provider integration and one owner-approved remittance format for the first vertical slice.
- Sanitized email metadata and permitted attachment retrieval, hashing, validation and evidence registration.
- Retrieval and validation of a canonical CashReceipt from a read-only SAP OData entity whose service, keys, required fields, settlement semantics and freshness fields have passed the Phase 0 configured-sandbox metadata and bounded-read proof; bank/lockbox are deferred from slice one.
- Deterministic invoice matching, internal allocation, balance validation and short-pay calculation using Decimal money.
- Deterministic deduction-reason validation and dispatch to DEP Forensics only when the governed mapping supports DEP.
- Creation of one live DeductionCase/work item and cited evidence set without adding the case to S1-S8.
- Cash Application Agent explanation and operator-legibility activity, non-blocking narration failure, scoped handoff to Forensics, conditional Recovery Drafter handoff and Maya assignment.
- A live Agent Operations workspace driven by durable backend events and cursor-based SSE replay.
- Initial controlled deduction category: container/bottle deposit (DEP), retaining the valid/invalid/partial evidence logic from v3.2.
- Human approval inbox, append-only audit evidence and clear draft/pending-external-execution states.
### 2.4 Out of scope

- Posting cash, clearing residuals, creating credit memos or updating dispute cases in production SAP/ERP.
- Autonomous email, Billing routing, Collections recovery, write-off, dunning or customer correspondence.
- Uncontrolled free-form document extraction or broad support for every remittance format in the first release.
- Hard-coded production customers, rates, account numbers, email addresses, thresholds, budgets or retention periods.
- Treating the remittance email as proof of payment settlement or using customer-stated deduction text as an authoritative reason code.
- Changing the S1-S8 gold dataset, its scenario enum or release-blocking parity values.
- New deduction categories beyond those explicitly approved after the DEP vertical slice.
### 2.5 Success statement

Customer-visible outcome. A real, verified email with the approved CSV v1 format, operational clean scan and authoritatively proven settled SAP CashReceipt starts the run; deterministic matching and allocation create one cited live case for a supported short pay; DEP Forensics runs once; Maya receives the work item automatically; and every external outcome remains a governed draft. For pre-production acceptance, at least 95% of the pre-declared eligible reference-fixture corpus must reach Allocated or no-deduction completion without human intervention before Maya; post-eligibility Review or Blocked counts as failure. This fixture-corpus regression gate is not evidence of effectiveness against real remittance traffic.

## 3. Definitions and governing principles

| Term | Definition for this BRD |
| --- | --- |
| Apply cash | Match and allocate the customer payment in Recoup's governed internal ledger. It does not mean SAP/ERP posting. |
| Remittance email | A provider-authenticated inbound message and permitted attachment containing payment/invoice allocation information. |
| CashReceipt | Canonical proof from a read-only SAP OData cleared-item source that has passed the Phase 0 service/entity/key/property metadata proof and one bounded approved-fixture read, including reference, amount, currency, legal entity, settlement status, source timestamp and freshness receipt. Bank/lockbox sources are deferred from slice one. |
| Short payment | The Decimal-safe difference between the amount due/selected for allocation and the received payment, after approved matching rules. |
| Claimed deduction reason | Customer-supplied code/text preserved as evidence but not authoritative for routing. |
| Validated reason code | Deterministic result of owner-approved coding rules and source evidence. DEP Forensics may start only when this value is DEP. |
| DEP | The governed reason code for the initial container/bottle-deposit scenario. |
| RTP | Returnable transport packaging evidence used by the DEP Forensics rules. |
| Cash Application Agent | A narrow agent that interprets intent, selects approved tools and explains results. It never owns money, IDs or authoritative status. |
| Live DeductionCase | A canonical operational case created from validated live inputs; separate from the S1-S8 gold/evaluation scenarios. |
| Forensics Investigator | Agent that retrieves evidence and narrates the deterministic decision basis for the new case. |
| Agent Operations | Server-backed workspace showing run-scoped specialist states and durable activity events. |
| Draft action | A proposed Billing, recovery or correspondence artifact that cannot dispatch without eligible-human approval. |
| HITL | Human-in-the-loop approval required before any external action; proposer and approver identities differ. |
| PII | Customer-sensitive information minimized and guarded before model context or broad UI display. |
| SSE | Server-Sent Events used to stream persisted workflow events with cursor replay. |
| SourcePort | Typed boundary through which adapters return canonical entities only. |
| Transactional outbox | Durable queue written with business state and consumed with leases/idempotency after commit. |
| Fail closed | Do not guess, create a decision, or advance the handoff when a required source, mapping, format or control is unavailable. |

### 3.1 Non-negotiable principles

- Code computes every dollar, allocation, delta and decision threshold; model output never becomes authoritative money.
- Every deduction decision carries cited record IDs and a deterministic basis; invalid/partial recovery requires a complete evidence pack.
- Adapters return canonical entities only; agents cannot access provider, SAP or database clients directly.
- All tools are explicitly registered, Zod-typed, whitelisted, bounded and guarded at nested handoff/tool boundaries.
- Every external action halts at HITL, and the proposing agent cannot be the approver.
- No production ERP mutation path may be introduced; Billing and recovery outputs remain draft-only.
- Synthetic and replayed data must be labelled before display; scripted front-end activity may not masquerade as live agent work.
## 4. End-to-end business journey

| Step | Business stage | Authoritative behavior | Durable proof |
| --- | --- | --- | --- |
| 1 | Observe ready state | All specialists show Idle from backend state; source health is visible. | Latest persisted run/agent state |
| 2 | Receive email | Customer sends remittance to the approved mailbox; provider event is authenticated and deduplicated. | Provider/message IDs, timestamp, hashes |
| 3 | Validate intake | Metadata and permitted attachment are sanitized, stored and validated against sender, recipient, format and policy. | Inbox record, attachment evidence, validation receipts |
| 4 | Verify cash receipt | Cash Application retrieves the matching CashReceipt only from a read-only SAP source whose metadata and bounded-read proof passed Phase 0, then verifies reference, amount, currency, entity, settlement status and freshness. Governed due-time polling handles later settlement; no SAP push is required. | CashReceipt record ID and source receipt |
| 5 | Match and allocate | Cash Application invokes approved services; Decimal code matches invoice(s), applies owner-approved allocation policy and balances totals. | Match/calculation snapshot and cited source IDs |
| 6 | Validate reason | Code preserves the customer-stated reason as evidence and derives the authoritative reason code from approved mappings. Ambiguous/unclassified cases go to review. | Claimed reason, validated reason, rule/version |
| 7 | Create short-pay case | If a supported short pay and validated DEP reason exist, code creates one live DeductionCase and canonical evidence links. | Stable case/claim/evidence IDs |
| 8 | Handoff to Forensics | A durable scoped handoff starts DEP Forensics once for the new case only. | Handoff event and conductor receipt |
| 9 | Investigate | Forensics retrieves DEP evidence; deterministic rules form valid/invalid/partial outcome and basis. | Tool receipts, evidence records, rule IDs |
| 10 | Draft eligible action | Recovery activates only for invalid/partial; valid routes to a Billing draft. Nothing is sent. | Draft action and pending-human state |
| 11 | Present to Maya | Assignment/read-model service publishes the case; Maya reviews evidence and decides eligible actions. | Queue item, read-model version and hash-chain entry; approval receipt exists only after decision |

### 4.1 Responsibility split

| Responsibility | Agent | Deterministic service/code | Human |
| --- | --- | --- | --- |
| Email intake | Recognizes remittance task and selects permitted tools. | Authenticates event, validates policy/schema, hashes and minimizes PII. | Resolves unsupported/ambiguous input and policy exceptions. |
| Cash receipt | Requests the approved receipt lookup; does not infer settlement. | Loads/verifies the canonical read-only SAP CashReceipt only after the source mapping is proven; due-time re-query is sufficient. | Owns receipt-source and settlement exceptions. |
| Cash application | Explains match and next step; does not calculate or alter amounts. | Loads invoices, applies approved allocation policy and computes the short pay using Decimal. | Approves policy and any external posting outside Recoup. |
| Reason coding | May explain customer-stated reason; cannot select authoritative code. | Preserves claimed reason and computes validated reason from approved rules. | Owns ambiguous/unclassified coding review. |
| Case creation | Requests governed creation/handoff tools. | Creates stable IDs, evidence links, run state and idempotent handoff. | Owns blocked mapping resolution. |
| Forensics | Selects retrievals and narrates guarded conclusions. | Computes expected/actual/delta, rules, routing and amount clamps. | Approves/modifies/rejects external drafts. |
| Workspace | Emits lifecycle hooks. | Persists normalized events and serves read models/SSE replay. | Supervises, intervenes and reviews blockers. |

## 5. Inbound remittance and security requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-ING-01 | The backend shall expose one provider-facing remittance endpoint and verify the provider signature and timestamp before any business processing. | Must |
| FR-ING-02 | The endpoint shall enforce the approved mailbox/recipient, sender/customer policy, rate limit, MIME/size policy and attachment allowlist. | Must |
| FR-ING-03 | The service shall deduplicate by provider event ID, message ID and approved content-hash strategy so retries/replays cannot create duplicate workflows. | Must |
| FR-ING-04 | The service shall persist sanitized metadata and content hashes; raw customer free text shall be minimized before model context or UI display. | Must |
| FR-ING-05 | Only the owner-approved first remittance format shall proceed automatically. Unsupported, encrypted, malformed or ambiguous content shall enter Cash Application Review. | Must |
| FR-ING-06 | Inbox, remittance header/lines, initial workflow run and first workflow event shall commit atomically, followed by an idempotent leased outbox. | Must |
| FR-ING-07 | A provider fetch/storage failure shall record a visible blocked/error event without creating a remittance claim or starting Forensics. | Must |
| FR-ING-08 | Retention, attachment access, redaction and deletion policy shall be configuration owned by Security/Legal and shall not be inferred by the application. | Must |
| FR-ING-09 | Attachments shall pass content sniffing, malware scanning and the approved archive/macro policy before parsing, model access or business-record creation; failures shall be quarantined. | Must |
| FR-ING-10 | Attachment staging and canonical intake commit shall have an owner-approved transaction/cleanup boundary so partial uploads and abandoned objects cannot appear as accepted evidence. | Must |
| FR-ING-11 | Timestamp-skew, nonce and replay windows shall be owner-approved security configuration; rejected replays shall create security telemetry only. | Must |

## 6. Deterministic cash application and live-case requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-CA-01 | The remittance adapter shall return canonical Remittance and line entities through the SourcePort; no agent shall call provider/database clients directly. | Must |
| FR-CA-02 | Before allocation, the service shall retrieve an authoritative CashReceipt from a read-only SAP OData source only after Phase 0 proves the service/entity, keys, required properties, settlement-status semantics and freshness fields through GET-only metadata plus one bounded approved-fixture read. Authentication failure, missing coverage or incomplete mapping blocks AC-01 and reopens the source decision. Bank/lockbox are deferred; email is instruction evidence, not settlement proof. | Must |
| FR-CA-03 | The service shall retrieve candidate open invoices and validate customer, legal entity, currency, invoice references, balances and source freshness. | Must |
| FR-CA-04 | Allocation shall use an owner-approved policy for one-to-one/one-to-many/many-to-one cardinality, ordering, discounts, credits, rounding, overpayment and foreign exchange; any missing rule shall produce Contract gap. | Must |
| FR-CA-05 | A strict decimal-string JSON schema shall validate money at API, event and persistence boundaries. One named service-to-core converter shall parse it through src/types/money.ts into Decimal; one named core-to-boundary formatter shall serialize it using owner-approved currency scale. JavaScript number, UI arithmetic and model-generated amounts are prohibited. | Must |
| FR-CA-06 | The core shall cross-check remittance totals, CashReceipt, selected invoice balances, declared deduction and computed short pay; imbalance shall block progression. | Must |
| FR-CA-07 | The authoritative short pay shall equal the code-computed allocation delta and shall cite remittance, CashReceipt and invoice record IDs plus calculation/configuration version. | Must |
| FR-CA-08 | The system shall preserve the CSV v1 machine-readable claimed reason code separately and derive validatedReason from owner-approved deterministic mappings. Free text may be retained as evidence but shall not select DEP. | Must |
| FR-CA-09 | Exactly one live DeductionCase, claim and evidence set may be created only when the short pay is non-zero and validatedReason is DEP; ambiguous or unclassified reasons shall enter review. | Must |
| FR-CA-10 | A full payment with no short pay shall complete Cash Application without creating a deduction or invoking Forensics. | Must |
| FR-CA-11 | Ambiguous customer, receipt, invoice, currency, amount or reason matching shall fail closed to Cash Application Review; no deduction or Forensics run shall be created. | Must |
| FR-CA-12 | The application shall communicate semantically that the match/allocation is internal to Recoup and that any SAP/ERP posting remains a separate human-controlled external process; exact user-facing copy is owned by the approved design system. | Must |
| FR-CA-13 | Live cases shall remain separate from S1-S8 scenario enums and gold-set storage/contracts; I-27 parity shall remain unchanged. | Must |

### 6.1 Cash Application Agent

- The agent's narrow role is intent recognition, approved-tool selection, orchestration and explanation.
- Tool outputs own all amounts, record IDs, status values and durable business state.
- The agent may not approve its proposal, bypass a blocked match, create free-form tool calls or change matching policy.
- The agent uses only pinned runtime models and owner-approved token, step, retry and concurrency limits.
### 6.2 Proposed live-case state

Owner decision required. The following state names are a proposed business contract and are not approved enums until Section 15 is ratified.

Case workflow state is distinct from specialist availability. A case can wait for a receipt or human decision while all agents are Idle; the workspace must not infer business state from animation or browser connectivity.

| State | Meaning | Allowed next state |
| --- | --- | --- |
| Received | Authenticated event and sanitized metadata are durable. | Validating / Blocked / Cancelled |
| Validating | Format, sender, scan result, CashReceipt availability and canonical mappings are checked. | AwaitingCashReceipt / Matching / Review / Blocked / Cancelled |
| AwaitingCashReceipt | No authoritative settled receipt is yet available; a durable delayed resume command is scheduled. | Validating / Review / Blocked / Cancelled |
| Matching | Deterministic receipt/invoice match and allocation are running. | Allocated / Review / Blocked / Cancelled |
| Allocated | Internal allocation is balanced and recorded. | ReasonReview / DeductionCreated / Completed / Cancelled |
| ReasonReview | Claimed reason cannot yet be deterministically validated. | DeductionCreated / Review / Blocked / Cancelled |
| DeductionCreated | One cited short-pay case exists. | ForensicsQueued / Blocked / Cancelled |
| ForensicsQueued | Durable handoff exists; Forensics has not started. | ForensicsRunning / Blocked / Cancelled |
| ForensicsRunning | Evidence retrieval and deterministic decision are in progress. | MayaReady / Blocked / Cancelled |
| MayaReady | Read model is published; human review is available. | PendingHumanDecision / Cancelled |
| PendingHumanDecision | External draft awaits eligible-human decision. | Approved / Modified / Rejected / Cancelled |
| Approved | Eligible human approved the cited draft; no ERP execution is implied. | Completed / Cancelled |
| Modified | Eligible human changed the proposal; deterministic guards must rerun. | PendingHumanDecision / Rejected / Cancelled |
| Rejected | Eligible human rejected the proposed external action. | Completed |
| Review | An ambiguity requires an authorized business decision. | Owner-authorized retry to the recorded state / Blocked / Cancelled |
| Blocked | A required control, source, policy or mapping is unavailable. | Owner-authorized retry to the recorded state / Review / Cancelled |
| Cancelled | An authorized human terminated the workflow with a cited reason. | None |
| Completed | Scoped internal work is complete; external execution is not implied. | None |

AwaitingCashReceipt re-drive mechanism. A completed read-only SAP receipt query that finds no settled receipt persists its source-query receipt and waiting event, then schedules exactly one idempotent resume_cash_application command with run ID, deterministic command ID, available-at time and attempt number. The in-process Render recoup-api worker is not constructed unless RECOUP_CASH_WORKER_ENABLED is true and validates cash_run_control before any claim RPC. A disabled flag or missing/invalid config causes zero claims, leases or attempt/dead-letter mutations. When enabled and valid, it claims only due work through a database lease and re-enters Validating. Due-time polling alone satisfies the wake path; a future source event is optional and may only converge on the same resume identity. Owner-approved backoff, maximum attempts and maximum wait control progression; exhaustion moves the command to the visible dead-letter backlog and the workflow to Review or Blocked. Browser connection or SSE activity never wakes business processing.

## 7. Forensics, recovery and Maya requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-FOR-01 | The conductor shall start Forensics once for the new live case only; it shall not rerun the full settlement/gold batch. | Must |
| FR-FOR-02 | Forensics shall retrieve the original invoice/deposit charge, proof of return, outstanding returnable stock, approved rate source and prior-credit evidence for the DEP case. | Must |
| FR-FOR-03 | Deterministic services shall compute valid quantity, valid amount, invalid amount and valid/invalid/partial outcome; the agent shall only narrate the cited result. | Must |
| FR-FOR-04 | No invalid/partial decision or recovery draft shall be emitted without supporting evidence record IDs and a deterministic rule basis. | Must |
| FR-FOR-05 | Recovery Drafter shall activate only for invalid/partial outcomes and shall clamp the draft amount to the computed invalid delta. | Must |
| FR-FOR-06 | Valid outcomes shall create a draft Billing route only; invalid outcomes shall create a draft recovery route only; partial outcomes may create both drafts. | Must |
| FR-FOR-07 | No draft shall send correspondence, create a credit memo, clear a residual, start dunning or mutate the ERP. | Must |
| FR-FOR-08 | Every evidence item shall carry its source, record ID, retrieved/effective timestamp and freshness result; stale evidence shall block the affected conclusion. | Must |
| FR-FOR-09 | A negative-evidence claim shall be valid only when the source query completed with recorded scope/freshness and a durable zero-result receipt; source failure is not negative evidence. | Must |
| FR-FOR-10 | Forensics shall assign an owner-approved root-cause tag and draft a cited prevention recommendation for Billing or the appropriate external owner; the recommendation remains draft-only under I-23. | Must |
| FR-MAYA-01 | The assignment/read-model service shall publish the completed case to Maya's bounded queue and invalidate both the affected worklist and work-item cache scopes. | Must |
| FR-MAYA-02 | Maya shall see remittance source, attachment hash/status, invoice match, internal allocation, short-pay basis, evidence, decision and approval provenance. | Must |
| FR-MAYA-03 | An eligible human shall approve, modify or reject the proposed external action; proposer and approver identities shall differ. | Must |
| FR-MAYA-04 | A modified proposal shall rerun amount, evidence, explainability and authorization guards before it can be resubmitted for human decision. | Must |
| FR-MAYA-05 | External execution-receipt integration is deferred from slice-one acceptance, which ends at Maya pending human decision. Recoup shall not claim realized/closed-loop value until a later authenticated receipt source, principal, schema and reconciliation contract are approved. | Future |
| FR-MAYA-06 | Maya queue prioritization may use owner-approved deterministic urgency/age criteria, but shall never hide lower-priority cases or invent a score. | Should |

### 7.1 Deposit validation retained from v3.2

| Gate | Pass basis | Fail-closed effect |
| --- | --- | --- |
| Deposit charged | Cited original invoice contains the approved deposit condition and rate. | No supported charge: claim cannot be valid. |
| Proof of return | Cited goods movement/pickup evidence establishes returned quantity. | No approved proof: claim cannot be routed as valid. |
| Quantity cap | Claimed quantity does not exceed both returned quantity and outstanding RTP. | Excess is invalid only when evidence supports the cap. |
| Rate | Claimed rate agrees with the governed source rate. | Unsupported/excess rate fails closed or becomes invalid per approved rule. |
| Prior credit | No cited prior credit covers the same return. | Duplicate amount is invalid to the supported extent. |
| Policy window | Owner-approved, source-backed policy is present. | Missing policy is Contract gap; do not invent a window. |

Deterministic formulas: valid quantity = min(claimed quantity, returned quantity, outstanding RTP); valid amount = valid quantity x governed source rate less supported prior credit; invalid amount = claimed deduction - valid amount. Every monetary operand is Decimal and cited. Production rates are never hard-coded from this document.

## 8. Live Agent Operations workspace

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-OPS-01 | The workspace shall load a server-backed specialist roster and current run state; when no work exists, every specialist shall display Idle. | Must |
| FR-OPS-02 | Agent availability shall be derived per run/case, with active counts for overlapping emails; one global boolean shall not represent all work. | Must |
| FR-OPS-03 | The workspace shall support Idle, Queued, Running, Waiting, Handed off, Blocked and Completed presentation after owner approval of the enum contract. | Must |
| FR-OPS-04 | A dense activity ledger shall show timestamp, specialist, phase, safe action summary, approved tool/source, cited record IDs and outcome. | Must |
| FR-OPS-05 | The handoff graph shall emphasize an edge only after the corresponding durable handoff event exists. | Must |
| FR-OPS-06 | Run detail shall show sanitized email metadata, attachment evidence, match/allocation snapshot, case/claim IDs, evidence IDs and audit receipts. | Must |
| FR-OPS-07 | Cursor-based SSE shall stream persisted events, replay missed events after reconnect and preserve ordering; read-model invalidation SSE remains separate. | Must |
| FR-OPS-08 | Replay mode may exist for rehearsal but shall be authenticated, create a new audited trigger and be visibly labelled Replayed demo input. | Should |
| FR-OPS-09 | The UI shall never expose raw model chain-of-thought, secret values or unrestricted customer free text. | Must |
| FR-OPS-10 | Every displayed business value and status shall resolve to backend/read-model provenance. Monetary display values shall arrive as backend-formatted strings; Maya components shall not import decimal.js or compute allocations. No static React-only case may drive the demonstration. | Must |

### 8.1 Workspace acceptance presentation

| Moment | Cash Application | Forensics | Recovery | Maya / operator |
| --- | --- | --- | --- | --- |
| Before email | Idle | Idle | Idle | No open run; source health visible |
| Verified email | Queued -> Running | Idle | Idle | Inbox/run event visible |
| Receipt not found | Waiting / Blocked | Idle | Idle | Awaiting authoritative CashReceipt; no allocation |
| Reason ambiguous | Waiting / Review | Idle | Idle | Claimed reason visible; validated reason unresolved |
| Allocation complete | Handed off / Completed | Queued -> Running | Idle | Receipt, match and cited short pay visible |
| Invalid/partial | Completed | Handed off / Completed | Queued -> Running | Draft pending human |
| Valid | Completed | Completed | Idle | Billing draft pending human |
| Blocked input/source | Blocked / Waiting | Idle or Blocked | Idle | Actionable reason, no fake progress |

## 9. Data, event and audit requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-DAT-01 | The canonical live-remittance authority shall use additive recoup_cash_* and recoup_workflow_* transactional structures. Existing remittance_headers/remittance_lines and recoup_src_remittance remain unchanged readiness/synthetic read sources and shall not become live write authority in this change. | Must |
| FR-DAT-02 | The system shall materialize canonical evidence documents/links and deduction claims from validated live records with provenance and content hashes. | Must |
| FR-DAT-03 | Workflow runs/events shall be append-only and carry correlationId, runId, caseId, agent, phase, safe summary, recordIds and timestamps; mutable current-state projections shall be rebuildable from the event log. | Must |
| FR-DAT-04 | Material findings, decisions, handoffs and human decisions shall enter the existing append-only hash-chained audit trail. | Must |
| FR-DAT-05 | Inbox/remittance/run creation shall be atomic; outbox consumers shall use leases and idempotent commands. A receipt miss shall persist a waiting event and schedule one delayed resume command with available-at time, attempt number and source-query receipt so crash/retry and later receipt arrival cannot strand or duplicate work. | Must |
| FR-DAT-06 | Current specialist and Maya state shall be reducible from durable events and shall not depend on a browser session or in-memory SSE connection. Maya live-origin rollout shall version the worklist key from maya:forensics:v1 to :v2 and work-item key from :v3 to :v4, invalidate both affected scopes and verify old-key retirement/rejection. | Must |
| FR-DAT-07 | Source freshness, provenance and synthetic/replay labels shall be persisted and surfaced; unavailable sources shall not silently fall back to demo data. | Must |
| FR-DAT-08 | Retention periods, attachment limits, status values, concurrency and budgets shall be owner-approved configuration. Cash budgets use separately parsed optional cash_run_control. Before insertion, the existing recoup_config.key CHECK shall be transactionally widened while preserving prior rows, grants, RLS and the strict six-phase run_control value; fresh and migrated databases shall converge on explicit constraint name recoup_config_key_check. | Must |
| FR-DAT-09 | Attachment objects shall remain staged until scan and canonical intake commit succeed; quarantine, rollback and abandoned-upload cleanup shall be durable and observable. | Must |
| FR-DAT-10 | Command/idempotency keys and event cursor sequence shall be deterministic but separate concepts; replay shall preserve event identity and order without creating duplicate business commands. | Must |
| FR-DAT-11 | Receipt-wait and processing commands shall use owner-approved backoff, maximum attempts and maximum wait. Exhaustion shall enter an operator-visible dead-letter/backlog state with cited source/error receipt, retry count and authorized resume/cancel controls; waiting cannot continue indefinitely. | Must |
| FR-DAT-12 | Verified external execution references and resolution status may be stored in the Recoup read model only after authorized execution evidence is received; this is not ERP write-back. | Should |

## 10. Business rules

| ID | Rule |
| --- | --- |
| BR-CA-01 | One authenticated provider message may create at most one inbox record, one workflow run and one canonical remittance set. |
| BR-CA-02 | Cash allocation cannot begin until an authoritative settled CashReceipt is cited; an email or attachment alone never proves receipt of funds. |
| BR-CA-03 | The model may propose no monetary operand. Boundary money is a validated decimal string converted exactly once into Decimal through the governed money helper; all arithmetic is Decimal and all outbound display values are backend-formatted strings. |
| BR-CA-04 | Cash allocation is authoritative only when the owner-approved cardinality, ordering, credit/discount, rounding, overpayment and FX policy balances the receipt and cited invoice values. |
| BR-CA-05 | The customer-stated claimedReason and deterministic validatedReason are separate; only validated DEP may enter Deposit Forensics. |
| BR-CA-06 | A short-pay case is created only when the code-computed delta is non-zero, the validated reason is DEP and required source mappings are complete. |
| BR-CA-07 | Ambiguous, malformed, unsupported, imbalanced or source-unavailable input routes to review/blocked state without a deduction decision. |
| BR-CA-08 | Cash matched inside Recoup shall never be represented as posted or cleared in SAP/ERP. |
| BR-FOR-01 | Valid quantity and amount follow the cited deterministic deposit formulas; production rates and policy windows must come from governed sources/config. |
| BR-FOR-02 | Valid amount plus invalid amount must equal the claimed deduction exactly; otherwise the case remains blocked. |
| BR-FOR-03 | Invalid/partial decisions and recovery drafts require a complete cited evidence pack. |
| BR-FOR-04 | A completed, fresh query with durable scope and zero-result receipt may support negative evidence; query failure or stale data may not. |
| BR-ACT-01 | Billing, recovery, correspondence and ERP actions remain drafts until an eligible human approves; agent identity is never the approver. |
| BR-ACT-02 | No approval in Recoup creates an ERP write client or authorizes autonomous production mutation. |
| BR-ACT-03 | A human-modified proposal is a new candidate decision and must pass the deterministic amount, evidence and authorization guards before approval. |
| BR-OPS-01 | An Agent Operations or Maya state may be displayed only when it is derivable from durable backend events/read models; monetary presentation is preformatted by the backend and cannot be recomputed in cockpit components. |
| BR-OPS-02 | Synthetic/replayed runs must be labelled; live and replay states may not be visually conflated. |
| BR-AUD-01 | Every material transition records source IDs, deterministic basis, actor identity, correlation ID and hash-chain continuity. |

## 11. Exception and failure handling

| Condition | Required behavior | Prohibited behavior |
| --- | --- | --- |
| Invalid signature / wrong recipient | Reject before persistence of business state; retain only approved security telemetry. | No remittance, run or agent activation. |
| Duplicate provider/message/content | Return idempotent acknowledgement and reference the existing run. | No duplicate allocation, case or Maya item. |
| Unsupported/encrypted attachment | Record Blocked/Review with safe reason and owner action. | No model guess or silent format fallback. |
| Malware / unsafe content | Require an operational private scanner with authenticated health/readiness, quarantine the object, record scan evidence and notify the authorized operator. | No disabled/no-op/public-upload scanner, parsing, model access or business-record creation. |
| Partial upload / abandoned object | Rollback canonical intake and remove or quarantine staged objects per retention policy. | No accepted evidence link to an incomplete object. |
| CashReceipt absent/unsettled | Persist the fresh SAP source-query receipt and AwaitingCashReceipt event; schedule one delayed resume command. The Render recoup-api worker's due-time poll is sufficient; owner-approved exhaustion reaches Review/Blocked plus visible dead letter. | No allocation, infinite waiting, browser/SSE wake-up or representation that cash was received. |
| Ambiguous invoice/customer/currency | Route to Cash Application Review. | No short-pay claim or Forensics handoff. |
| Ambiguous/unclassified reason | Preserve claimed reason and route to reason review. | No DEP tag or Forensics handoff. |
| Source unavailable/stale | Emit Source unavailable and pause/stop per owner retry policy. | No synthetic fallback shown as live. |
| Missing contract/policy mapping | Emit Contract gap and require owner input. | No invented threshold, rate or time window. |
| Worker crash after intake | Outbox lease/retry resumes idempotently from durable state. | No saved-without-started or duplicate handoff state. |
| Model/tool failure | Emit compact ErrorEvent and preserve deterministic state/receipts. | No run crash that loses audit evidence. |
| Retries exhausted | Move the command to an operator-visible dead-letter/backlog state with authorized resume/cancel controls. | No infinite retry or silent loss. |
| SSE disconnect | Reconnect with cursor and replay missing ordered events. | No resetting run state or replaying fabricated activity. |
| Unauthorized approval | Reject and audit the attempt. | No action-state advance. |

## 12. Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR-01 Security | Provider signatures, timestamps, sender/recipient policy, PII minimization, RBAC, secret isolation and bounded tools are mandatory. |
| NFR-02 Durability | Persist before stream; atomic intake, delayed receipt-wait re-drive and idempotent outbox/consumers shall tolerate retry and crash boundaries without stranded waiting runs. |
| NFR-03 Determinism | Identical canonical inputs and governed config shall produce identical allocation, short-pay, decision and stable event/command identifiers. Decimal strings convert at one named boundary; no UI or model arithmetic is permitted. |
| NFR-04 Observability | Correlation IDs span provider intake, cash services, agents, tools, handoffs, events, Maya read model and approval. |
| NFR-05 Performance | Provider acknowledgement, first visible event, end-to-end completion and SSE reconnect targets require owner ratification; tests shall assert the approved values separately from the NFR-14 effectiveness target. |
| NFR-06 Concurrency | Pre-release load verification shall exercise the configured concurrency cap plus one overload run, proving queue order, bounded backpressure and correct run-scoped active counts; a two-run smoke test alone is insufficient. |
| NFR-07 Accessibility | The revised Agent Operations and Maya changes shall preserve the cockpit's existing keyboard, semantic-table and status-text accessibility baseline. |
| NFR-08 Privacy | Raw attachment/body access and retention are role-controlled and owner-defined; rendered UI uses sanitized summaries and cited IDs. |
| NFR-09 Provenance | Every visible business value exposes source/read-model provenance and backend-formatted money; synthetic/replay provenance is explicit. Read-model shape changes require a new cache-key version or verified purge before exposure. |
| NFR-10 Quality gates | Lint, typecheck, unit/integration/E2E tests, release evals, SA-CA feature-invariant tests, the exact tool/model/handoff/connector/run-control pinned-contract tests and visual audit must pass on the tested target branch. |
| NFR-11 Freshness | CashReceipt, invoice and Forensics evidence freshness limits shall be owner-approved per source; stale/unknown freshness fails closed and is displayed. |
| NFR-12 Recovery | Recovery-point and recovery-time objectives for inbox, staged attachments, workflow events, outbox and read models require owner ratification and tested restore/rebuild procedures. |
| NFR-13 Replay | Deterministic command IDs, event IDs and cursor sequences shall support safe replay without conflating transport retries with new business work. |
| NFR-14 Automation effectiveness | For slice-one pre-production acceptance, eligible_reference_stp_rate shall be at least 95% on the versioned pre-declared eligible reference-fixture corpus. Post-eligibility Review/Blocked counts as failure; exclusions are fixed before execution. This is a regression gate, not a real-traffic effectiveness claim. eligible_live_stp_rate may be observed only after owners approve its governed-real-sender denominator, exclusions, observation window and minimum sample. |

## 13. Acceptance scenarios and definition of done

### 13.1 End-to-end acceptance scenarios

| Scenario | Acceptance outcome |
| --- | --- |
| AC-01 Happy-path short pay | Verified email, CSV v1 with recognized machine-readable reason code, healthy private clean scan and a settled read-only SAP CashReceipt from a source that passed the configured-sandbox metadata plus bounded-read proof match an owner-approved customer/invoice fixture; Decimal allocation produces a short pay; validatedReason is DEP; one case reaches Maya pending human action. |
| AC-02 Full payment | Payment balances the selected invoice(s); Cash Application completes; no deduction, Forensics run or Maya deduction item is created. |
| AC-03 Duplicate delivery | Provider retries the same event/message; response is idempotent; existing run is referenced; no duplicate state is created. |
| AC-04 Ambiguous match | Two candidate invoices/customer mappings remain unresolved; run enters Review/Blocked; no deduction or handoff occurs. |
| AC-05 Unsupported document | Attachment violates the approved format/policy; safe blocker is visible; no model-derived business record is created. |
| AC-06 No settled receipt | Email is valid but no authoritative settled SAP CashReceipt is available. The workflow persists the source-query receipt, enters AwaitingCashReceipt and schedules one delayed resume. A false/missing RECOUP_CASH_WORKER_ENABLED flag prevents worker construction. When the flag is true, the lifecycle handle may exist, but missing/invalid cash_run_control must return before any claim RPC and produce zero claims, leases or attempt/dead-letter mutations. With both gates valid, due-time polling resumes through Validating without SAP push; exhaustion reaches Review/Blocked plus visible dead letter. No allocation, deduction or Forensics run exists before settlement proof. |
| AC-07 Ambiguous reason | A short pay exists but claimed reason cannot be validated as DEP; claimed reason is preserved; reason review is visible; no Forensics handoff occurs. |
| AC-08 Source outage | Required receipt/SAP/evidence source is unavailable; the workflow emits Source unavailable and cannot form an allocation or invalid/partial decision. |
| AC-09 Invalid/partial DEP | Complete fresh evidence supports invalid/partial outcome; Recovery Drafter activates and amount is clamped; draft remains pending human. |
| AC-10 Valid DEP | Complete fresh evidence supports valid outcome; Billing draft is created; Recovery remains Idle; no ERP mutation occurs. |
| AC-11 Overlapping emails | A pre-release load test exercises the configured concurrent-run cap plus one additional verified email; runs remain distinct, active counts are accurate, database leases prevent duplicate work and the excess run is backpressured without collapsing into global state. |
| AC-12 SSE reconnect | Browser reconnects with a cursor and receives all missing events once, in order, without fabricated progress. |
| AC-13 Unsafe attachment | Malware or prohibited content is quarantined before parsing/model access; no remittance business state is accepted. |
| AC-14 Receipt/remittance mismatch | Receipt amount, currency, legal entity or reference disagrees with remittance; the run blocks with cited mismatch and no allocation. |
| AC-15 Verified negative evidence | A fresh, scoped evidence query completes with zero results and stores a receipt; only then may the absence support the decision. |
| AC-16 Unauthorized approval | An ineligible or same-as-proposer identity is rejected and audited; action state does not advance. |
| AC-17 Human modification | Maya modifies the proposal; deterministic amount/evidence/authorization guards rerun before resubmission; original and revised receipts remain auditable. |
| AC-18 Crash and dead letter | A post-intake or receipt-wait crash resumes idempotently; deterministic command identity prevents duplicate wake-ups; exhausted processing or maximum receipt wait becomes visible operator work with no duplicate command, case or handoff. |
| AC-19 Straight-through effectiveness | On the versioned owner-approved eligible reference-fixture corpus, eligible_reference_stp_rate is at least 95% for Allocated or no-deduction completion without human intervention before Maya; post-eligibility Review/Blocked lowers the rate. This result shall not be represented as real-traffic effectiveness. eligible_live_stp_rate requires a separately approved governed-real-sender measurement contract. |

### 13.2 Definition of done

1. A verified remittance email and authoritative CashReceipt produce exactly one durable workflow run and one canonical remittance evidence set.
2. Inbox, remittance and initial run/event state commit atomically; crash/retry cannot strand or duplicate a case/handoff.
3. Cash Application state changes from Idle based on live events; deterministic code matches and records the internal allocation.
4. A validated short pay with validatedReason DEP produces one cited live DeductionCase and one scoped Cash Application-to-Forensics handoff.
5. Forensics processes only that case and produces a cited deterministic outcome; Recovery activates only when required.
6. Maya receives the case without a full-page reload and displays the complete upstream provenance and approval state.
7. Failure paths are visible and fail closed without duplicate or unsupported business state.
8. No ERP write-back or autonomous external action exists; every external outcome remains a governed draft.
9. All required tests/evals and a minimum 4/5 cockpit visual audit pass on the verified target branch and deployment source.
## 14. Implementation dependency plan

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| 0. SDD addendum + decision lock | Reconcile and approve BRD v3.3.4, SDD v0.9.4 and TDD v0.9.4; capture one controlled Phase 0 evidence pack for D-02/D-04/D-05/D-08; prove the SAP CashReceipt mapping with GET-only metadata and one bounded approved-fixture read; commit all three to the named target branch; record origin/main baseline and the reviewed target SHA. | Signed owner decisions, document hashes, successful SAP metadata and bounded-read proof, private-scanner health/fixture proof, CSV/reason-map proof, clean target worktree and baseline verification report. A failed authentication probe keeps D-02 and AC-01 blocked. |
| 1. Contracts/persistence | Approve live remittance authority, CashReceipt, claimed/validated reason, DeductionCase, workflow event/projection, atomic inbox/outbox and cursor contracts. | Atomicity, idempotency, ordering, projection rebuild and S1-S8 compatibility tests. |
| 2. Inbound vertical slice | Signed webhook -> private scanner health/clean result -> versioned CSV v1 mapper with required reason code -> atomic run event. | Invalid signature, duplicate, wrong recipient and unsupported/fetch failures fail closed. |
| 3. Deterministic cash application | Tests first for read-only SAP cleared-item receipt/freshness, policy-driven matching/allocation, D-05/D-08 reason mapping, balancing, short pay, evidence and live-case persistence. | No model/number money; correct idempotent result; I-27 unchanged. |
| 4. Cash agent and handoff | Register guarded tools, non-blocking Cash Application explanation/fallback, cash_application prompt-cache namespace, specialist model settings, optional cash_run_control, explicit recoup_config CHECK migration and scoped handoff; update all seven exact-list contracts. | One verified email creates one case and starts Forensics once; existing six-phase run control and all pinned contracts remain green. |
| 5. Event stream/workspace | Implement worker safety as two logical changes. First add the lifecycle seam, construction flag, pre-claim cash_run_control return, CLAUDE.md warning and split negative tests without a claim-capable path. Prove no construction when the flag is false/missing; when the flag is true with missing/invalid config, allow the lifecycle handle but prove no claim/lease/mutation. Only after that proof may durable claims/leases, delayed SAP receipt re-drive, cursor SSE, Agent Operations and Maya worklist v2/detail v4 be added. | Phase 7A proves false/missing flag causes no factory call, claim, lease or mutation; true flag with missing/invalid config may construct the lifecycle handle but causes no claim RPC, lease, attempt or dead-letter mutation. Phase 7B then proves bounded claims, reconnect/order/concurrency/re-drive, cache shapes, cockpit no-business-logic and visual score >= 4/5. |
| 6. Controls/evals | Security, failure-path, integration, invariant, seven pinned-contract and end-to-end coverage, including release-blocking eligible_reference_stp_rate >=95% on the fixture corpus and separately governed eligible_live_stp_rate observation rules. | Full verify and relevant invariants/evals green. |
| 7. Demo release | After explicit approval, validate provider, backend, Supabase, Vercel stable alias and one live email rehearsal. | Tested commit is served; sanitized audit proof exists; zero ERP mutation. |

## 15. Owner decisions required before implementation

| Decision | Required resolution | Owner |
| --- | --- | --- |
| D-01 Cash semantics | Approve 'match and allocate in Recoup internal ledger; ERP posting pending'. | Business Owner - Cash Application |
| D-02 CashReceipt authority | Ratify read-only SAP OData only after a successful configured-sandbox GET-only probe proves service/entity/keys/properties/status/freshness semantics and one approved-fixture read succeeds. Current Phase 0 evidence is OPEN: the 22 Aug 2026 secret-safe probes returned HTTP 401, so no cleared-item mapping or bounded read is proven. Authentication failure does not prove absence. Bank/lockbox are deferred. | Treasury / Cash Receipt Owner |
| D-03 Provider/mailbox | Name Resend inbound, Microsoft 365/Graph or another provider and the approved mailbox/recipient. | Security + Architecture |
| D-04 Intake security | Provision and approve a private malware scanner adapter/endpoint/health contract plus signature, replay, MIME, archive/macro, size and quarantine controls; no disabled/no-op/public-upload scanner. | Security |
| D-05 First format | Ratify versioned UTF-8 CSV v1 and canonical fields, including a required machine-readable claimed reason code; approve jointly with D-08. | Cash Application + Security |
| D-06 Demo fixture | Approve sender/customer/receipt/open-invoice/DEP evidence fixture and source mappings. Values remain test-only unless live-sourced. | Business + QA |
| D-07 Allocation policy | Ratify the complete cardinality/order/discount/credit/rounding/tolerance/overpayment/FX/residual/ambiguity policy pack as the Phase 3 critical path. | Cash Application Lead |
| D-08 Reason coding | Ratify the CSV claimed-reason-code to validated-reason taxonomy/rules jointly with D-05; free text is evidence only. | Deduction Policy Owner |
| D-09 Ambiguity | Approve fail-closed Cash Application Review ownership and resume/cancel rules. | Cash Application Lead |
| D-10 Live write authority | Approve additive recoup_cash_* and recoup_workflow_* transactional tables as the only live write authority. Existing remittance_headers/remittance_lines and recoup_src_remittance remain unchanged readiness/synthetic read sources. | Architecture + Data |
| D-11 Atomic/storage boundary | Approve transaction/RPC/object cleanup, the Render recoup-api in-process poller construction flag, pre-claim cash_run_control validation, tick/lease/shutdown contract, due-time-only SAP resume, retry/idempotency/dead-letter behavior, explicit recoup_config_key_check convergence and updated local-runtime warning. Design approval does not close N5; implementation must prove false/missing flag causes zero construction/claims/leases/mutations, while true flag with missing/invalid config may construct the lifecycle handle but causes zero claim calls/leases and attempt/dead-letter mutations. | Architecture |
| D-12 Status and approval | Ratify the single Section 6.2 state table as canonical for BRD, SDD and TDD, including AwaitingCashReceipt re-drive, Review/Blocked retry targets, cancellation, Maya approval and modification/resubmission rules. | Product + Operations |
| D-13 Run controls | Approve a separate optional cash_run_control config contract and supply cash token/step/retry/timeout/lease/backoff/max-wait/concurrency values. The existing required six run_control phases and readiness counts remain unchanged; missing cash config blocks only the cash path. | AI Governance + Operations |
| D-14 Privacy/retention | Set retention, redaction, attachment access and approved telemetry. | Security / Legal |
| D-15 Freshness/recovery | Set source freshness, RPO/RTO, restore/rebuild and operator backlog targets. | Architecture + Operations |
| D-16 Performance targets | Ratify eligible_reference_stp_rate >=95% as a fixture-corpus regression gate; separately approve any eligible_live_stp_rate denominator, exclusions, observation window and minimum sample plus remaining latency/reconnect/availability targets. No customer-facing effectiveness claim follows from fixture results. | Product + Architecture |
| D-17 SDD authority | Approve the SDD addendum covering Cash Application, CashReceipt, live events/outbox and email-to-Maya orchestration. | Chief Architect + Product |
| D-18 Deployment source | Confirm the reviewed target SHA, commit the three governing documents, create a clean target worktree, and deploy the worker only through the existing always-on Render recoup-api runtime with feature flags off first. | Engineering Owner |
| D-19 Prompt cache and model binding | Approve the dedicated cash_application prompt-cache namespace/key version and the already-pinned model/settings binding; reuse of deduction_forensics is not implicit. | AI Governance + Architecture |

Implementation gate. GO for final design review and Phase 0 evidence closure only. Application code, schema changes, worker activation, provider enablement and deployment remain NO-GO until D-01 through D-19 are approved or explicitly deferred with fail-closed behavior; D-02/D-04/D-05/D-08 are jointly proven; D-07 is ratified; N5 runtime safety tests pass; the three governing documents are committed to the approved target branch; and all seven pinned-contract impacts are verified. The 95% reference-fixture regression target is not a live-traffic effectiveness claim.

Final review disposition requested. Approve the synchronized specification set and authorize completion of Phase 0 only. Do not interpret document approval as permission to modify production-connected code, apply a migration, construct a worker or accept a customer email.

- N4 / D-02 - OPEN. On 22 August 2026, secret-safe GET-only probes against the configured SAP sandbox service root/catalog, known metadata and candidate cleared-item/payment entities returned HTTP 401. No entity mapping, settlement/freshness semantics or bounded approved-fixture read was proven. D-02 remains unsigned and AC-01 remains blocked.
- N5 / D-11 - DESIGN CORRECTED; IMPLEMENTATION PROOF PENDING. The mandatory order is feature flag, governed cash configuration, then bounded claim. Documentation does not close N5. Closure requires code/tests proving false/missing flag causes zero construction/claims/leases/mutations; with a true flag and missing/invalid config, the lifecycle handle may exist but must produce zero claim calls/leases and attempt/dead-letter mutations. CLAUDE.md must carry the safety warning.
- Phase 0 evidence pack. Record D-02 SAP, D-04 private scanner and D-05/D-08 CSV/reason proof together against the approved target SHA. Include non-secret request path, response status, schema/artifact hash, approved fixture ID, result, reviewer and owner decision; exclude credentials, authorization headers, customer free text and attachment contents.
## Appendix A. RACI

| Activity | Responsible | Accountable | Consulted / informed |
| --- | --- | --- | --- |
| Authenticate, scan and persist email | Inbound service | Security Owner | Cash Operations; Agent Operations |
| Verify settled CashReceipt | Cash receipt adapter/service | Treasury / Cash Receipt Owner | Cash Application Lead |
| Match, allocate and compute short pay | Deterministic cash core | Cash Application Lead | Cash Application Agent; Finance Systems |
| Validate deduction reason | Deterministic reason service | Deduction Policy Owner | Cash Operations |
| Create case/evidence and handoff | Workflow/conductor service | Application Product Owner | Cash Application Agent; Forensics |
| Investigate deduction | Forensics Agent plus deterministic tools | Deduction Policy Owner | Maya; Billing |
| Draft Billing/recovery action | Recovery/route drafter plus guard services | Collections / Billing Owner | Maya |
| Approve, modify or reject draft | Eligible Maya user | Maya Queue Owner | Collections / Billing; Audit |
| Execute external action | Authorized external human/team | External Process Owner | Maya; Audit |
| Publish workspace/Maya state | Event/read-model services | Agent Operations Owner | Product; Maya |
| Operate retry/dead-letter backlog | Agent Operations | Operations Owner | Engineering; Security |

## Appendix B. Requirement-to-control traceability

| Requirement | Acceptance | Controls | Minimum verification |
| --- | --- | --- | --- |
| FR-ING-01 | AC-05, AC-13 | I-9, I-14, I-15 | Signature/recipient, PII, MIME/scan/quarantine, retention and replay-window security tests. |
| FR-ING-02 | AC-05, AC-13 | I-9, I-14, I-15 | Signature/recipient, PII, MIME/scan/quarantine, retention and replay-window security tests. |
| FR-ING-04 | AC-05, AC-13 | I-9, I-14, I-15 | Signature/recipient, PII, MIME/scan/quarantine, retention and replay-window security tests. |
| FR-ING-08 | AC-05, AC-13 | I-9, I-14, I-15 | Signature/recipient, PII, MIME/scan/quarantine, retention and replay-window security tests. |
| FR-ING-09 | AC-05, AC-13 | I-9, I-14, I-15 | Signature/recipient, PII, MIME/scan/quarantine, retention and replay-window security tests. |
| FR-ING-11 | AC-05, AC-13 | I-9, I-14, I-15 | Signature/recipient, PII, MIME/scan/quarantine, retention and replay-window security tests. |
| FR-ING-03 | AC-03 | I-4, I-9 | Provider/message/content idempotency test with stable existing-run receipt. |
| FR-ING-05 | AC-05 | I-12, I-14 | Supported-format contract test; malformed/encrypted/ambiguous input fails closed. |
| FR-ING-06 | AC-18 | I-4, I-9 | Atomic inbox/remittance/event/object commit and rollback/cleanup integration tests. |
| FR-ING-10 | AC-18 | I-4, I-9 | Atomic inbox/remittance/event/object commit and rollback/cleanup integration tests. |
| FR-ING-07 | AC-08 | I-9, I-17 | Provider fetch/storage failure creates cited blocker and no claim/Forensics run. |
| FR-CA-01 | AC-01 | I-12 | Dependency-cruiser port-purity test; agent cannot call provider/database client. |
| FR-CA-02 | AC-01, AC-06, AC-14 | I-3, I-17 | Successful configured-sandbox GET-only metadata entity/key/property proof, bounded approved-fixture settled/fresh read, fail-closed auth/mapping outcomes and due-time-only re-drive tests. |
| FR-CA-03 | AC-04, AC-14 | I-3, I-17 | Candidate-source freshness and ambiguous-match fail-closed tests. |
| FR-CA-11 | AC-04, AC-14 | I-3, I-17 | Candidate-source freshness and ambiguous-match fail-closed tests. |
| FR-CA-04 | AC-01, AC-04 | I-3, I-17 | Owner-configured cardinality/order/credit/rounding/overpay/FX policy table tests; missing rule yields Contract gap. |
| FR-CA-05 | AC-01, AC-02, AC-14 | I-1, I-3, I-17 | Decimal-string boundary validation; single money() parse point; governed serialization; no number/UI/model arithmetic tests. |
| FR-CA-06 | AC-01, AC-02, AC-14 | I-1, I-3, I-17 | No-model-dollar/no-float, Decimal balance and cited short-pay calculation tests. |
| FR-CA-07 | AC-01, AC-02, AC-14 | I-1, I-3, I-17 | No-model-dollar/no-float, Decimal balance and cited short-pay calculation tests. |
| FR-CA-08 | AC-01, AC-07 | I-17, I-18 | CSV v1 required claimed-reason-code/validated-reason separation and deterministic DEP-only case/handoff tests. |
| FR-CA-09 | AC-01, AC-07 | I-17, I-18 | Claimed/validated reason separation and DEP-only case/handoff tests. |
| FR-CA-10 | AC-02 | I-3, I-17 | Balanced receipt completes without deduction, Forensics or Maya deduction item. |
| FR-CA-12 | AC-01 | I-26 | Semantic UI/API no-ERP-posting implication test; exact copy remains design-owned; no ERP mutation client. |
| FR-CA-13 | AC-01 | I-27 | S1-S8 schema/gold parity and release-blocking eval regression. |
| FR-FOR-01 | AC-01, AC-18 | I-4, I-9 | Scoped once-only conductor/handoff idempotency test. |
| FR-FOR-02 | AC-09, AC-10 | I-1, I-2, I-17, I-18 | Evidence-pack, Decimal formula, outcome and explainability tests. |
| FR-FOR-03 | AC-09, AC-10 | I-1, I-2, I-17, I-18 | Evidence-pack, Decimal formula, outcome and explainability tests. |
| FR-FOR-04 | AC-09, AC-10 | I-1, I-2, I-17, I-18 | Evidence-pack, Decimal formula, outcome and explainability tests. |
| FR-FOR-05 | AC-09, AC-10 | I-6, I-7, I-22, I-23, I-26 | Amount-clamp, valid-case false-positive, draft-only route and no-ERP-mutation tests. |
| FR-FOR-06 | AC-09, AC-10 | I-6, I-7, I-22, I-23, I-26 | Amount-clamp, valid-case false-positive, draft-only route and no-ERP-mutation tests. |
| FR-FOR-07 | AC-09, AC-10 | I-6, I-7, I-22, I-23, I-26 | Amount-clamp, valid-case false-positive, draft-only route and no-ERP-mutation tests. |
| FR-FOR-08 | AC-08, AC-09 | I-17, I-18 | Evidence effective-date/freshness contract and stale-evidence blocker tests. |
| FR-FOR-09 | AC-15 | I-17, I-18 | Scoped fresh zero-result receipt accepted; source failure/stale result rejected as negative evidence. |
| FR-FOR-10 | AC-09, AC-10 | I-17, I-23 | Root-cause/prevention recommendation requires evidence and remains draft-only. |
| FR-MAYA-01 | AC-01, AC-12 | I-9, I-17, I-30 | Scoped worklist-v2/detail-v4 invalidation and complete upstream-provenance read-model E2E. |
| FR-MAYA-02 | AC-01, AC-12 | I-9, I-17, I-30 | Scoped queue invalidation and complete upstream-provenance read-model E2E. |
| FR-MAYA-03 | AC-16 | I-7, I-8, I-20 | Eligible-human, proposer-not-approver and unauthorized-attempt audit tests. |
| FR-MAYA-04 | AC-17 | I-6, I-17, I-20 | Modification creates revised candidate and reruns amount/evidence/auth guards. |
| FR-MAYA-05 | AC-10 | I-23, I-26 | Future-scope assertion: no realized/closed-loop claim without an approved authenticated external execution-receipt contract. |
| FR-MAYA-06 | AC-01 | I-17 | Configured queue-priority test preserves every case and cites deterministic basis. |
| FR-OPS-01 | AC-01, AC-11 | I-9, I-17, I-30 | Server-backed roster/event/read-model provenance and overlapping-run UI E2E. |
| FR-OPS-02 | AC-01, AC-11 | I-9, I-17, I-30 | Server-backed roster/event/read-model provenance and overlapping-run UI E2E. |
| FR-OPS-03 | AC-01, AC-11 | I-9, I-17, I-30 | Server-backed roster/event/read-model provenance and overlapping-run UI E2E. |
| FR-OPS-04 | AC-01, AC-11 | I-9, I-17, I-30 | Server-backed roster/event/read-model provenance and overlapping-run UI E2E. |
| FR-OPS-05 | AC-01, AC-11 | I-9, I-17, I-30 | Server-backed roster/event/read-model provenance and overlapping-run UI E2E. |
| FR-OPS-06 | AC-01, AC-11 | I-9, I-17, I-30 | Server-backed roster/event/read-model provenance and overlapping-run UI E2E. |
| FR-OPS-10 | AC-01, AC-11 | I-9, I-17, I-30 | Backend-formatted display/provenance contract and cockpit-no-business-logic.test.ts remains green. |
| FR-OPS-07 | AC-12 | I-9 | Persist-before-stream cursor ordering and reconnect replay integration/E2E. |
| FR-OPS-08 | AC-03 | I-4, I-17 | Authenticated replay creates a new audited trigger and explicit replay label. |
| FR-OPS-09 | AC-05, AC-13 | I-14 | UI/model-context tests exclude secrets, chain-of-thought and unrestricted free text. |
| FR-DAT-01 | AC-01, AC-08 | I-3, I-12, I-17 | Additive recoup_cash_*/recoup_workflow_* authority and explicit non-mutation/isolation tests for current remittance sources. |
| FR-DAT-02 | AC-01, AC-08 | I-3, I-12, I-17 | Canonical live-source/provenance tests; unavailable live source never falls back to synthetic. |
| FR-DAT-07 | AC-01, AC-08 | I-3, I-12, I-17 | Canonical live-source/provenance tests; unavailable live source never falls back to synthetic. |
| FR-DAT-03 | AC-11, AC-12 | I-9, I-30 | Append-only event log and deterministic projection rebuild/order tests. |
| FR-DAT-06 | AC-11, AC-12 | I-9, I-30 | Projection rebuild plus Maya worklist-v2/detail-v4 key, old-key rejection, scoped invalidation and retirement verification. |
| FR-DAT-04 | AC-01, AC-16, AC-17 | I-9, I-17 | Hash-chain continuity includes findings, handoffs and human decisions. |
| FR-DAT-05 | AC-03, AC-18 | I-4, I-9 | Atomic intake plus delayed receipt-wait resume, lease, deterministic identity and crash/retry tests. |
| FR-DAT-10 | AC-03, AC-18 | I-4, I-9 | Atomic outbox/lease and separate command/event/cursor identity replay tests. |
| FR-DAT-08 | AC-05, AC-11 | I-16 | Backward-compatible optional cash_run_control parse plus recoup_config CHECK transition; existing six-phase value/rows/grants/RLS unchanged. |
| FR-DAT-09 | AC-13, AC-18 | I-9, I-14 | Staged-object scan/commit/quarantine/cleanup boundary integration tests. |
| FR-DAT-11 | AC-18 | I-9, I-16 | Maximum receipt wait/attempt exhaustion and operator-visible dead-letter tests. |
| FR-DAT-12 | AC-10 | I-23, I-26 | Read-model-only execution reference test and static check for no write-capable ERP client. |
| BR-CA-01 | AC-01 to AC-08, AC-14 | I-1, I-3, I-4, I-17, I-18, I-26 | Cash core policy table, idempotency, reason validation, fail-closed and no-ERP tests. |
| BR-CA-02 | AC-01 to AC-08, AC-14 | I-1, I-3, I-4, I-17, I-18, I-26 | Cash core policy table, idempotency, reason validation, fail-closed and no-ERP tests. |
| BR-CA-03 | AC-01 to AC-08, AC-14 | I-1, I-3, I-4, I-17, I-18, I-26 | Cash core policy table, idempotency, reason validation, fail-closed and no-ERP tests. |
| BR-CA-04 | AC-01 to AC-08, AC-14 | I-1, I-3, I-4, I-17, I-18, I-26 | Cash core policy table, idempotency, reason validation, fail-closed and no-ERP tests. |
| BR-CA-05 | AC-01 to AC-08, AC-14 | I-1, I-3, I-4, I-17, I-18, I-26 | Cash core policy table, idempotency, reason validation, fail-closed and no-ERP tests. |
| BR-CA-06 | AC-01 to AC-08, AC-14 | I-1, I-3, I-4, I-17, I-18, I-26 | Cash core policy table, idempotency, reason validation, fail-closed and no-ERP tests. |
| BR-CA-07 | AC-01 to AC-08, AC-14 | I-1, I-3, I-4, I-17, I-18, I-26 | Cash core policy table, idempotency, reason validation, fail-closed and no-ERP tests. |
| BR-CA-08 | AC-01 to AC-08, AC-14 | I-1, I-3, I-4, I-17, I-18, I-26 | Cash core policy table, idempotency, reason validation, fail-closed and no-ERP tests. |
| BR-FOR-01 | AC-08 to AC-10, AC-15 | I-1, I-2, I-6, I-17, I-18, I-22 | Formula/evidence/reconciliation/negative-evidence and recovery-clamp tests. |
| BR-FOR-02 | AC-08 to AC-10, AC-15 | I-1, I-2, I-6, I-17, I-18, I-22 | Formula/evidence/reconciliation/negative-evidence and recovery-clamp tests. |
| BR-FOR-03 | AC-08 to AC-10, AC-15 | I-1, I-2, I-6, I-17, I-18, I-22 | Formula/evidence/reconciliation/negative-evidence and recovery-clamp tests. |
| BR-FOR-04 | AC-08 to AC-10, AC-15 | I-1, I-2, I-6, I-17, I-18, I-22 | Formula/evidence/reconciliation/negative-evidence and recovery-clamp tests. |
| BR-ACT-01 | AC-09, AC-10, AC-16, AC-17 | I-7, I-8, I-20, I-23, I-26 | Draft-only, approval segregation, modification revalidation and no-ERP tests. |
| BR-ACT-02 | AC-09, AC-10, AC-16, AC-17 | I-7, I-8, I-20, I-23, I-26 | Draft-only, approval segregation, modification revalidation and no-ERP tests. |
| BR-ACT-03 | AC-09, AC-10, AC-16, AC-17 | I-7, I-8, I-20, I-23, I-26 | Draft-only, approval segregation, modification revalidation and no-ERP tests. |
| BR-OPS-01 | AC-11, AC-12 | I-9, I-17, I-30 | Durable-state-only display and explicit live/replay provenance E2E. |
| BR-OPS-02 | AC-11, AC-12 | I-9, I-17, I-30 | Durable-state-only display and explicit live/replay provenance E2E. |
| BR-AUD-01 | AC-01, AC-16, AC-17 | I-9, I-17 | Audit receipt completeness and chain verification tests. |
| NFR-01 | AC-05, AC-13, AC-16 | I-7, I-14, I-15 | Security, RBAC, PII minimization, retention and secret-isolation test suite. |
| NFR-08 | AC-05, AC-13, AC-16 | I-7, I-14, I-15 | Security, RBAC, PII minimization, retention and secret-isolation test suite. |
| NFR-02 | AC-12, AC-18 | I-4, I-9 | Crash/retry, persist-before-stream, restore and projection rebuild tests against owner targets. |
| NFR-12 | AC-12, AC-18 | I-4, I-9 | Crash/retry, persist-before-stream, restore and projection rebuild tests against owner targets. |
| NFR-03 | AC-03, AC-18 | I-1, I-4, I-17 | Same-input determinism and command/event/cursor replay identity tests. |
| NFR-13 | AC-03, AC-18 | I-1, I-4, I-17 | Same-input determinism and command/event/cursor replay identity tests. |
| NFR-04 | AC-01 | I-9, I-17 | End-to-end correlation-ID propagation and audit receipt assertion. |
| NFR-05 | AC-01, AC-12 | I-16 | Approved acknowledgement/first-event/completion/reconnect performance tests; effectiveness measured separately by NFR-14. |
| NFR-06 | AC-11 | I-16 | Configured concurrency-cap-plus-one, lease/backpressure/queue-order and active-count load tests. |
| NFR-07 | AC-01, AC-12 | I-30 | Keyboard, semantic-table, focus and status-text accessibility checks. |
| NFR-09 | AC-01, AC-08 | I-17, I-30 | Every visible value resolves to provenance; worklist-v2/detail-v4 and replay-label assertions. |
| NFR-10 | All acceptance scenarios | I-5, I-22, I-27, I-28, I-30 | Full verify plus seven exact-list contracts, SA-CA tests, E2E and cockpit no-business-logic suites. |
| NFR-11 | AC-06, AC-08, AC-15 | I-3, I-17, I-18 | Per-source freshness boundaries and stale/unknown fail-closed tests. |
| NFR-14 | AC-19 | I-5, I-16, I-17 | Auditable fixture-corpus denominator and release-blocking eligible_reference_stp_rate >=95%; post-eligibility Review/Blocked counts as failure; live-effectiveness labels require separately approved eligible_live_stp_rate measurement evidence. |

## Appendix C. Likely implementation touch points

| Area | Existing touch points | Probable additions after approval |
| --- | --- | --- |
| Types/core | src/types/money.ts; src/types/entities.ts; claims/evidence types; S1-S8 locked | Strict MoneyString JSON boundary plus one service-to-core money() converter and governed backend formatter; live DeductionCase/remittance/workflow contracts; deterministic cashApplication core |
| Adapters | src/adapters/remittance.ts; src/adapters/sapOData.ts; connectorRegistry.ts; enterpriseReadOnly.ts | Provider-neutral inbound envelope plus separate provider-readiness contract, private scanner adapter, CSV v1 mapper and a new read-only SAP CashReceipt mapping only after successful metadata/bounded-read proof; preserve all six connector names and defer bank/lockbox. |
| Agents | agentRuntime.ts; handoffGraph.ts; forensics.ts; liveForensicsStream.ts; config/models.ts; config/openaiPromptCache.ts | Cash Application specialist/prompt for non-blocking explanation, deterministic fallback summary, dedicated cash_application cache namespace and scoped handoff wiring. |
| Services | serviceLayer.ts; conductor.ts; cockpitApi.ts; cockpitModel.ts; config/releaseOwnerInputs.ts; src/memory/supabaseStore.ts; CLAUDE.md | Explicit Zod cash tools, named recoup_config CHECK transition, optional cash_run_control loader, construction/pre-claim-gated worker, delayed SAP receipt re-drive, event repository, cursor SSE and production-connected local-run warning. |
| Persistence | Supabase bootstrap; synthetic recoup_src_remittance; remittance/evidence/claim/read-model tables | Additive recoup_cash_*/recoup_workflow_* authority, atomic inbox/outbox, workflow runs/events and available-at receipt-resume fields; existing remittance tables unchanged |
| Frontend | governance/agents page; cockpit data; Maya loaders/events; cockpit/app/api/read-model-cache.ts | Live roster/activity/run detail, event proxy, upstream dossier with backend-formatted money, Maya worklist cache v2 and work-item cache v4 with dual invalidation. |
| Tests | tool-whitelist; tool-permissions; agent-handoffs; pinned-models; connector-readiness; run-control; openai-prompt-cache; cockpit-no-business-logic; existing API/Forensics/SSE/E2E | Seven exact-list amendments plus SAP metadata/bounded-read readiness, worker zero-construction/zero-claim negatives, config-name convergence, scanner/CSV, dual-cache, concurrency, fixture-corpus STP and live-metric labelling tests. |

## Appendix D. Source notes

- Source BRD reviewed in full: Recoup_Business_Requirements_Document_v3.2_Cash_apps.docx, 22 rendered pages, SHA-256 b1725e6c0852f80aaa0fcdd6cf4ac129e154ba8bce04841b67f4c6913eade61c.
- Governing contracts reviewed: INVARIANTS.md; RECONCILIATION_LEDGER.md; Recoup_v2_SDD.md sections 1.4, 3, 4.1, 5.8, 6-12 and appendices G/C/D.
- Narration/design input reviewed: Remittance Email to Cash Application to Maya implementation plan dated 19 August 2026.
- Repository baseline reviewed: origin/main at 0dfcaa7edcb7c3b6f1d8952fd0f100fa5e018c97. The local authoring checkout remained main at eeca34327b562bbc3101ac5f019d1a4ecd1f2be7 with pre-existing unrelated changes; no application code or database object was changed for this document amendment.
- All example customers, rates, amounts, account numbers, emails and document IDs from the source BRD are illustrative acceptance fixtures unless a live governed source supplies them. They are not approved production constants.
- Independent implementation-safety audit reviewed: 22 August 2026 audit of the BRD, SDD addendum, Technical Design and origin/main contracts. v3.3.4 makes the final-review disposition explicit: N4 remains open after HTTP 401 evidence, and N5 is closed only by future runtime code/tests, not by document wording.
End of document - RB-O2C-CASHAPP-FOR-BRD-003 v3.3.4
