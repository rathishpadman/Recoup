# Technical Design: Remittance Email to Cash Application to Maya

**Document ID:** RECOUP-TDD-CASHAPP-001  
**Version:** 0.9.4 (final-review readiness and implementation-entry amendment)  
**Date:** 2026-08-22  
**Repository baseline reviewed:** `origin/main` at `0dfcaa7edcb7c3b6f1d8952fd0f100fa5e018c97`; local authoring checkout remained `main` at `eeca34327b562bbc3101ac5f019d1a4ecd1f2be7`  
**Governing design:** `docs/2026-08-21-cash-application-agent-workspace-sdd-addendum.md`  
**Business requirements:** `docs/Recoup_Business_Requirements_Document_v3.3.4_Cash_Application_Agent_Workspace.md`  
**Status:** Final design review candidate; Phase 0-only authorization requested; implementation remains NO-GO  
**Change type:** Additive vertical slice; no existing capability replacement

## 0. Purpose and implementation posture

This Technical Design converts the proposed architecture direction into an implementation-ready plan. It identifies the proposed TypeScript contracts, deterministic algorithms, repositories, database objects, APIs, agent/tool wiring, cockpit components, tests, rollout controls and rollback steps.

This document does not change application code or authorize production deployment. Names below are proposed implementation contracts and must be reconciled against the target branch immediately before execution.

**No ERP write-back is introduced or authorized by this Technical Design.**

### 0.1 Final-review disposition

This revision is eligible for final design review, not unconditional implementation approval. N4/D-02 remains open because the configured SAP sandbox returned HTTP 401 to the secret-safe GET-only discovery/metadata probes and therefore did not prove a cleared-item entity or bounded fixture semantics. N5/D-11 is corrected as a normative design and test sequence, but it remains a runtime release blocker until implementation proves the two cases separately: a false/missing flag cannot construct the worker or touch work, while a true flag with missing/invalid `cash_run_control` may construct the lifecycle handle but cannot call the claim RPC, lease work or mutate attempt/dead-letter state.

The final reviewer may approve this document set and authorize Phase 0 evidence closure. Code, schema, worker activation, provider enablement and deployment remain prohibited until the SDD Section 0.5 gate passes.

## 1. Success and safety criteria

The change is complete only when all of the following are proven:

1. One authenticated, owner-approved remittance email creates at most one durable workflow run.
2. No allocation occurs without an authoritative settled `CashReceipt`.
3. All monetary calculations use the existing Decimal type and exact reconciliation checks.
4. Claimed reason and validated reason remain separate; only validated `DEP` creates the initial live deduction case.
5. One live case starts Forensics once and appears in Maya with complete upstream provenance.
6. Agent Operations shows run-scoped states derived from durable events, including reconnect replay.
7. All external actions remain drafts and pass existing HITL/SoD controls.
8. Feature-off behavior preserves current Forensics, Maya, approval, audit, query, David and CFO behavior.
9. S1-S8 gold parity and all existing release-blocking invariants/evals remain green.
10. Rollback stops new processing without deleting accepted evidence or audit history.
11. `AwaitingCashReceipt` always has a durable re-drive or visible terminal/dead-letter path; no browser or in-memory timer owns progress.
12. The current strict six-phase run-control row remains parseable and existing protected routes remain available when cash configuration is absent.
13. All seven exact-list pinned contracts and the unchanged cockpit no-business-logic boundary pass with explicit evidence.
14. `eligible_reference_stp_rate` is at least 95% on the versioned pre-declared eligible reference-fixture corpus; post-eligibility `Review`/`Blocked` counts as failure. This is a pre-production regression gate, not a live-traffic effectiveness claim; `eligible_live_stp_rate` requires a separately approved governed-real-sender measurement contract.
15. Cash Application agent/model narration failure degrades explanation only and never blocks deterministic processing or handoff.
16. N5 is not considered closed by this design: the implementation must prove flag false/missing -> zero worker construction, claim calls, leases and mutations; flag true with absent/invalid `cash_run_control` -> lifecycle construction is permitted but the tick produces zero claim calls, leases and attempt/dead-letter mutations.

## 2. Current implementation inventory

| Area | Current implementation | Gap for this change |
|---|---|---|
| Remittance evidence | `src/adapters/remittance.ts` reads governed synthetic evidence through `recoup_src_remittance` | No provider-authenticated inbound command or canonical live advice write path |
| Email gateway | `src/services/emailGateway.ts` implements governed outbound email behavior | It is not an inbound signature verifier and must not be reused as one without a separate provider-neutral inbound contract |
| Readiness tables | `remittance_headers` / `remittance_lines` exist in `docs/supabase-memory-schema.sql` with service-role SELECT | Not a transactional inbox/run/outbox authority; no attachment security or receipt proof |
| Money | `src/types/money.ts` and core modules enforce Decimal boundaries | No cash-allocation core |
| Forensics | `src/agents/forensics.ts`, `src/services/reconciliationEngine.ts`, guarded action tools | Primarily settlement/gold and selected-line flows; no live-case entry contract |
| Handoffs | `src/agents/handoffGraph.ts` and conductor hook receipts | No Cash Application-to-Forensics edge/packet |
| Run controls | `config/releaseOwnerInputs.ts` has a strict six-required-phase `run_control`; existing routes fail closed when it cannot parse | Cash controls require a separate optional contract; adding required phases to the existing object is prohibited |
| SSE | Existing Forensics route emits process-local invalidations | No durable cursor, ordered event replay or run-scoped agent activity stream |
| Agent Operations | `/governance/agents` shows roster/topology from backend model | No live run/activity workspace or run-scoped specialist status |
| Maya | Existing worklist, detail, evidence, trace, draft and approval views | No upstream email/receipt/allocation dossier for live cases |
| Audit/HITL | Hash-chained audit and approval services exist | New material event categories and live-case scopes required |

## 3. Proposed repository change map

Only an approved implementation session may create or edit these files.

### 3.1 New backend files

| Proposed file | Responsibility |
|---|---|
| `src/types/cashApplication.ts` | Zod schemas/types for inbound envelope, advice, receipt, allocation, reason and live case |
| `src/types/workflow.ts` | Workflow run/event/outbox/projection/handoff contracts and enums |
| `src/core/cashApplication/match.ts` | Pure candidate matching and ambiguity result |
| `src/core/cashApplication/allocate.ts` | Pure Decimal allocation and reconciliation |
| `src/core/cashApplication/reason.ts` | Pure claimed-to-validated reason mapping using approved config |
| `src/adapters/inboundRemittance.ts` | Provider-neutral inbound port and canonical envelope |
| `src/adapters/providers/<approvedProvider>.ts` | Signature verification and provider event mapping after owner selection |
| `src/adapters/cashReceipt.ts` | Canonical `CashReceiptSource` port |
| `src/adapters/sapCashReceipt.ts` | Slice-one read-only SAP OData cleared-item adapter and canonical CashReceipt mapping; no ERP mutation |
| `src/services/attachmentSecurity.ts` | Private scanner port, content sniffing, health/readiness, scan/quarantine policy and artifact result |
| `src/services/remittanceMapper.ts` | Versioned UTF-8 CSV v1 mapper with required machine-readable claimed reason code; no general extraction |
| `src/services/remittanceIntake.ts` | Deduplication and atomic intake command orchestration |
| `src/services/cashApplication.ts` | Preconditions, source reads, deterministic core calls and case command |
| `src/services/workflowRepository.ts` | Runs, events, outbox and projections repository port |
| `src/services/supabaseWorkflowRepository.ts` | Supabase implementation of workflow/cash repositories |
| `src/services/workflowWorker.ts` | Leased outbox consumer and phase dispatcher |
| `src/services/agentOperations.ts` | Roster/run/activity/read-model composition |
| `src/agents/cashApplication.ts` | Cash Application Agent definition and bounded orchestration |
| `src/agents/prompts/cashApplication.md` | Versioned agent prompt |
| `docs/supabase-cash-application-schema.sql` | Source-controlled additive schema/RPC/grant contract |

### 3.2 Existing backend files likely to change

| File | Surgical change |
|---|---|
| `src/types/entities.ts` | Re-export or reference approved canonical types only if required; do not consolidate unrelated types |
| `src/agents/agentRuntime.ts` | Register Cash Application agent manifest and hook receipts |
| `src/agents/handoffGraph.ts` | Add Cash Application -> Forensics edge after packet tests exist |
| `src/agents/forensics.ts` | Add a scoped live-case entry adapter without changing existing S1-S8 behavior |
| `src/services/conductor.ts` | Add cash-only budget middleware and normalized workflow hook mapping without changing existing six-phase readiness counts |
| `src/services/serviceLayer.ts` | Register bounded `cash.*` and `workflow.*` tools |
| `src/services/cockpitApi.ts` | Add inbound, Agent Operations and live-case routes |
| `CLAUDE.md` | Extend the production-connected local-runtime warning: the cash worker factory must not be constructed locally unless explicitly enabled against an approved isolated target |
| `src/memory/supabaseStore.ts` | Extend optional config-key/bootstrap DDL support and emit the explicit backward-compatible `recoup_config.key` CHECK transition; do not rely on `CREATE TABLE IF NOT EXISTS` |
| `src/services/cockpitModel.ts` | Add live-origin fields and agent/run read models; preserve existing response fields |
| `src/services/approvals.ts` | Accept live-case action scope and version; preserve existing approval semantics |
| `src/audit/trail.ts` | No edit unless the implementation brief explicitly authorizes required audit categories; prefer existing generic payload contract |
| `config/models.ts` | Add Cash Application agent model mapping using an already approved pinned model |
| `config/openaiPromptCache.ts` | Add dedicated `cash_application` namespace/key version; do not silently reuse `deduction_forensics` |
| `config/releaseOwnerInputs.ts` | Add a separate optional `cash_run_control` key/schema/snapshot field; do not add required fields to existing `run_control.phases` |
| `cockpit/app/api/read-model-cache.ts` | Advance Maya worklist `maya:forensics:v1` to `:v2` and work-item `:v3` to `:v4`; new loaders reject old keys |

### 3.3 New or changed cockpit files

| Proposed file | Responsibility |
|---|---|
| `cockpit/app/api/agent-operations/roster/route.ts` | Authenticated backend proxy |
| `cockpit/app/api/agent-operations/runs/route.ts` | Run-list proxy |
| `cockpit/app/api/agent-operations/runs/[runId]/route.ts` | Run-detail proxy |
| `cockpit/app/api/agent-operations/events/route.ts` | Authenticated cursor SSE proxy |
| `cockpit/app/api/agent-operations/runs/[runId]/retry/route.ts` | Authorized retry command proxy |
| `cockpit/app/api/agent-operations/runs/[runId]/cancel/route.ts` | Authorized cancel command proxy |
| `cockpit/components/agent-operations/agent-operations-workspace.tsx` | Dense live workspace |
| `cockpit/components/agent-operations/run-table.tsx` | Run-led operational table |
| `cockpit/components/agent-operations/activity-ledger.tsx` | Durable event timeline |
| `cockpit/components/agent-operations/run-detail.tsx` | Email/receipt/allocation/case provenance |
| `cockpit/components/agent-operations/handoff-map.tsx` | Event-backed edges; no decorative activation |
| `cockpit/components/agent-operations/use-agent-events.ts` | Cursor/reconnect/visibility-safe client hook |
| `cockpit/components/maya/upstream-cash-origin.tsx` | Live email/receipt/allocation dossier |

Existing `cockpit/app/governance/agents/page.tsx`, Maya loaders, worklist/detail types and tests receive only additive wiring.

### 3.4 Pinned existing contracts touched

These are intentional contract extensions, not incidental test rewrites. Every implementation brief that reaches the affected phase must name the file, write the failing assertion first, justify the new member and prove all prior members remain unchanged.

| Pinned contract | Current assertion | Required extension and justification |
|---|---|---|
| `tests/invariants/tool-whitelist.test.ts` | Exact sorted 23-name `serviceTools` list | Add only the approved `cash.*` / `workflow.*` names implemented in Section 12.2; proves no free-form or hidden tool appeared |
| `tests/invariants/tool-permissions.test.ts` | Exact `serviceToolMetadata` key list | Add the same tool names with explicit read-only or governed state-change risk/side-effect metadata |
| `tests/unit/agent-handoffs.test.ts` | Exact five-edge `recoupHandoffGraph` | Add only Cash Application Agent -> Forensics Investigator with deterministic-service wiring |
| `tests/invariants/pinned-models.test.ts` | Exact runtime model-settings object | Add Cash Application settings bound to an already pinned model and the dedicated `cash_application` prompt-cache key |
| `tests/invariants/connector-readiness.test.ts` | Exact six-connector list and shapes | Preserve all six names. Add CashReceipt capability/readiness to the existing `sap-odata` connector only after metadata/read proof; model inbound-provider readiness under a separate typed contract rather than `EnterpriseConnectorNameSchema` or a synthetic source table |
| `tests/invariants/run-control.test.ts` | Strict six required phases, partial-phase rejection and readiness counts of six | Prove old rows still parse/count six; missing/invalid optional `cash_run_control` blocks only the cash worker/agent |
| `tests/unit/openai-prompt-cache.test.ts` | Exact four-member `openAiPromptCacheCapabilities` array and capability-key contract | Add only `cash_application`, preserve the prior four members/order contract as intentionally amended, and verify `recoup:v2:cash-application:v1` plus its prefix/model binding |

`tests/invariants/cockpit-no-business-logic.test.ts` is a protection contract, not an extension target: it must remain unchanged and green. `upstream-cash-origin.tsx` receives backend-formatted money strings and imports neither `decimal.js` nor backend/core modules.

## 4. TypeScript domain contracts

All contracts use strict Zod schemas. Money is a decimal string at I/O boundaries.

### 4.1 Shared primitives

```ts
const NonEmptyId = z.string().trim().min(1);
const IsoTimestamp = z.string().datetime({ offset: true });
const CurrencyCode = z.string().regex(/^[A-Z]{3}$/u);
const MoneyString = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u);
const ProvenanceMode = z.enum(["live", "replay", "synthetic"]);
```

`MoneyString` is a new JSON/persistence boundary contract in `src/types/cashApplication.ts`. It is intentionally distinct from the existing `src/types/money.ts` `MoneySchema`, which preprocesses a string into a Decimal instance and therefore cannot be used as a JSON field schema.

All services use exactly two named boundary functions:

```ts
function moneyStringToDecimal(value: MoneyString): Money {
  return money(value); // the existing src/types/money.ts helper
}

function decimalToMoneyString(value: Money, currencyPolicy: CurrencyScalePolicy): MoneyString {
  return formatUsingApprovedCurrencyScale(value, currencyPolicy);
}
```

Repository/API inputs validate `MoneyString`, then convert once before entering core. Core results remain Decimal until the single formatter produces persistence/API/display strings. Database-driver numeric coercion, scattered `new Decimal()` calls, JavaScript-number money and cockpit arithmetic are prohibited. Currency scale and formatting are owner-approved policy; this document does not assume two decimal places for every currency.

Field-specific Decimal refinements enforce allowed sign. Receipt, instructed, applied, deduction and unapplied amounts are non-negative; a negative value is rejected unless a future owner-approved contract defines a distinct reversal entity/state. This is validation behavior, not an authorization to infer how reversals are allocated.

### 4.2 Provider-neutral inbound envelope

```ts
const InboundRemittanceEnvelopeSchema = z.object({
  schemaVersion: z.literal("1"),
  provider: NonEmptyId,
  providerEventId: NonEmptyId,
  messageId: NonEmptyId,
  receivedAt: IsoTimestamp,
  sender: z.string().email(),
  recipient: z.string().email(),
  subjectSanitized: z.string().max(500),
  bodyContentHash: NonEmptyId,
  attachmentRefs: z.array(NonEmptyId).min(1),
  provenanceMode: ProvenanceMode
});
```

Provider signature, raw payload and secret-bearing headers do not enter this schema. Verification happens before conversion.

### 4.3 Attachment artifact

```ts
const AttachmentArtifactSchema = z.object({
  artifactId: NonEmptyId,
  objectRef: NonEmptyId,
  contentHash: NonEmptyId,
  detectedMimeType: NonEmptyId,
  sizeBytes: z.number().int().nonnegative(),
  scanStatus: z.enum(["clean", "quarantined", "blocked", "scan_unavailable"]),
  policyVersion: NonEmptyId,
  scannedAt: IsoTimestamp.optional(),
  recordIds: z.array(NonEmptyId).min(1)
});
```

`sizeBytes` is non-monetary and may use `number`.

### 4.4 Canonical remittance advice

```ts
const RemittanceAdviceLineSchema = z.object({
  lineId: NonEmptyId,
  invoiceReference: NonEmptyId,
  instructedAmount: MoneyString,
  claimedDeductionAmount: MoneyString,
  claimedReasonCode: z.string().trim().min(1).optional(),
  claimedReasonTextSanitized: z.string().max(1000).optional(),
  sourceRecordIds: z.array(NonEmptyId).min(1)
});

const RemittanceAdviceSchema = z.object({
  remittanceId: NonEmptyId,
  inboundMessageId: NonEmptyId,
  customerReference: NonEmptyId,
  legalEntityReference: NonEmptyId,
  paymentReference: NonEmptyId,
  currency: CurrencyCode,
  instructedPaymentAmount: MoneyString,
  mapperVersion: NonEmptyId,
  lines: z.array(RemittanceAdviceLineSchema).min(1),
  sourceRecordIds: z.array(NonEmptyId).min(1),
  provenanceMode: ProvenanceMode
});
```

Fields not present in the approved first format produce a mapping error. The implementation must not infer hidden defaults.

### 4.5 CashReceipt

```ts
const CashReceiptSchema = z.object({
  receiptId: NonEmptyId,
  sourceSystem: NonEmptyId,
  sourceRecordId: NonEmptyId,
  paymentReference: NonEmptyId,
  customerReference: NonEmptyId,
  legalEntityReference: NonEmptyId,
  amountReceived: MoneyString,
  currency: CurrencyCode,
  settlementStatus: z.enum(["settled", "pending", "reversed", "unknown"]),
  valueDate: z.string().date(),
  observedAt: IsoTimestamp,
  retrievedAt: IsoTimestamp,
  freshnessPolicyVersion: NonEmptyId,
  freshnessStatus: z.enum(["fresh", "stale", "unknown"]),
  recordIds: z.array(NonEmptyId).min(1)
});
```

Only `settlementStatus = settled` and `freshnessStatus = fresh` may satisfy the allocation precondition.

The current `src/adapters/sapOData.ts` does not expose a cleared-item, accounting-document or payment-advice mapping. The new adapter may reuse its read-only client, authentication, metadata parser/validator and source-health plumbing only. Before D-02 can be signed, a secret-safe GET-only probe against the configured sandbox must prove the candidate service/entity, keys and required properties; the result must then be followed by one bounded approved-fixture read proving settlement-status and freshness semantics. HTTP authentication failure, absent coverage or incomplete field semantics leaves AC-01 blocked and reopens the source decision. It is not evidence that the entity is absent, only that the proposed authority is unproven.

### 4.6 Match and allocation results

```ts
const CashMatchResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("matched"),
    receiptId: NonEmptyId,
    invoiceRecordIds: z.array(NonEmptyId).min(1),
    policyVersion: NonEmptyId,
    recordIds: z.array(NonEmptyId).min(1)
  }),
  z.object({
    status: z.enum(["review", "blocked"]),
    reason: z.enum([
      "cash_receipt_missing",
      "cash_receipt_unsettled",
      "cash_receipt_stale",
      "customer_ambiguous",
      "legal_entity_mismatch",
      "currency_mismatch",
      "invoice_ambiguous",
      "amount_mismatch",
      "policy_missing",
      "source_unavailable"
    ]),
    recordIds: z.array(NonEmptyId).min(1)
  })
]);

const CashAllocationLineSchema = z.object({
  allocationLineId: NonEmptyId,
  remittanceLineId: NonEmptyId,
  invoiceRecordId: NonEmptyId,
  invoiceBalanceBefore: MoneyString,
  appliedAmount: MoneyString,
  explicitDeductionAmount: MoneyString,
  invoiceBalanceAfterInternalAllocation: MoneyString,
  recordIds: z.array(NonEmptyId).min(1)
});

const CashAllocationReceiptSchema = z.object({
  allocationId: NonEmptyId,
  receiptId: NonEmptyId,
  remittanceId: NonEmptyId,
  currency: CurrencyCode,
  receiptAmount: MoneyString,
  totalAppliedAmount: MoneyString,
  totalDeductionAmount: MoneyString,
  totalUnappliedAmount: MoneyString,
  reconciliationStatus: z.enum(["balanced", "imbalanced"]),
  policyVersion: NonEmptyId,
  calculationVersion: NonEmptyId,
  lines: z.array(CashAllocationLineSchema).min(1),
  recordIds: z.array(NonEmptyId).min(1)
});
```

### 4.7 Reason validation

```ts
const ValidatedReasonSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("validated"),
    claimedReason: z.string().min(1),
    validatedReason: z.literal("DEP"),
    ruleId: NonEmptyId,
    policyVersion: NonEmptyId,
    recordIds: z.array(NonEmptyId).min(1)
  }),
  z.object({
    status: z.enum(["review", "blocked"]),
    claimedReason: z.string().min(1).optional(),
    reason: z.enum(["unclassified", "ambiguous", "policy_missing", "evidence_missing"]),
    recordIds: z.array(NonEmptyId).min(1)
  })
]);
```

The first release intentionally permits only validated `DEP`. Future codes require approved rules and tests.

### 4.8 Live case

```ts
const LiveDeductionCaseSchema = z.object({
  caseId: NonEmptyId,
  origin: z.literal("live_cash_application"),
  runId: NonEmptyId,
  customerId: NonEmptyId,
  legalEntityId: NonEmptyId,
  invoiceRecordIds: z.array(NonEmptyId).min(1),
  remittanceId: NonEmptyId,
  receiptId: NonEmptyId,
  allocationId: NonEmptyId,
  claimedReason: z.string().min(1),
  validatedReason: z.literal("DEP"),
  shortPaymentAmount: MoneyString,
  currency: CurrencyCode,
  status: NonEmptyId,
  policyVersions: z.record(z.string(), NonEmptyId),
  recordIds: z.array(NonEmptyId).min(1),
  provenanceMode: ProvenanceMode,
  createdAt: IsoTimestamp
});
```

No `ScenarioId` field is present.

## 5. Deterministic core design

### 5.1 `match.ts`

Inputs:

- canonical remittance advice;
- settled fresh `CashReceipt` result;
- canonical candidate invoices;
- approved allocation policy.

Algorithm:

1. Verify receipt status/freshness.
2. Match payment reference according to the approved exact/normalized rule.
3. Require unique customer and legal entity.
4. Enforce currency/FX policy.
5. Resolve invoice candidates under approved cardinality and ordering.
6. Return `matched`, `review` or `blocked` with cited records.

The core receives no provider, SAP, Supabase or agent object.

### 5.2 `allocate.ts`

Use Decimal for every monetary operand.

Conceptual reconciliation:

```text
receipt amount
  = total applied amount
  + total explicit deduction amount
  + total approved unapplied/overpayment amount
```

For each invoice:

```text
invoice balance before
  = applied amount
  + explicit deduction amount
  + invoice balance after internal allocation
```

The exact treatment of discounts, credits, tolerances, rounding, overpayment and FX comes only from approved policy. Missing policy returns `Contract gap`; it does not default to zero or a hard-coded tolerance.

The function returns an immutable allocation receipt. It does not write to SAP or represent an ERP posting.

### 5.3 `reason.ts`

The function accepts sanitized claimed reason/code, approved mapping/rule config and cited source records. It returns validated `DEP`, `review` or `blocked`. No embedding similarity or free-form model classification may become the authoritative code in the first release.

### 5.4 Stable IDs

Use separate deterministic idempotency keys:

```text
inbound command key = sha256(provider + providerEventId)
run command key     = sha256("cash-run" + acceptedInboxId)
allocation key      = sha256("allocation" + receiptId + remittanceId + policyVersion)
case command key    = sha256("live-case" + allocationId + remittanceLineId + validatedReason)
handoff key         = sha256("cash-forensics" + caseId + caseVersion)
```

If the approved provider contract permits missing IDs, the owner must approve a content-hash fallback. The implementation cannot invent it.

Workflow event IDs use their own scheme and do not replace the I-4 variance-event formula.

## 6. Workflow contracts

### 6.1 Run schema

```ts
const WorkflowRunSchema = z.object({
  runId: NonEmptyId,
  workflowName: z.literal("cash_application_to_maya"),
  workflowVersion: NonEmptyId,
  triggerType: z.enum(["live_email", "replay_email", "synthetic_email"]),
  triggerRecordId: NonEmptyId,
  correlationId: NonEmptyId,
  state: NonEmptyId,
  currentPhase: NonEmptyId,
  caseId: NonEmptyId.optional(),
  provenanceMode: ProvenanceMode,
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
  terminalAt: IsoTimestamp.optional()
});
```

### 6.2 Event envelope

```ts
const WorkflowEventSchema = z.object({
  schemaVersion: z.literal("1"),
  eventId: NonEmptyId,
  cursor: z.string().regex(/^\d+$/u),
  runSequence: z.number().int().positive(),
  runId: NonEmptyId,
  correlationId: NonEmptyId,
  caseId: NonEmptyId.optional(),
  eventType: z.enum([
    "run_received",
    "phase_started",
    "phase_waiting",
    "phase_blocked",
    "phase_completed",
    "agent_queued",
    "agent_started",
    "agent_tool_started",
    "agent_tool_completed",
    "agent_handoff",
    "agent_completed",
    "case_created",
    "maya_ready",
    "human_decision",
    "run_completed",
    "run_cancelled",
    "error"
  ]),
  phase: NonEmptyId,
  specialist: NonEmptyId.optional(),
  status: NonEmptyId,
  safeSummary: z.string().max(1000),
  recordIds: z.array(NonEmptyId).min(1),
  deterministicBasisRef: NonEmptyId.optional(),
  provenanceMode: ProvenanceMode,
  occurredAt: IsoTimestamp
});
```

No raw email body, attachment bytes, secret headers, unrestricted customer free text or chain-of-thought enters the event envelope.

### 6.3 Outbox command

```ts
const WorkflowOutboxCommandSchema = z.object({
  commandId: NonEmptyId,
  commandType: z.enum([
    "start_cash_application",
    "resume_cash_application",
    "start_forensics",
    "rebuild_projection"
  ]),
  runId: NonEmptyId,
  caseId: NonEmptyId.optional(),
  idempotencyKey: NonEmptyId,
  payloadRef: NonEmptyId,
  status: z.enum(["pending", "leased", "completed", "failed", "dead_letter"]),
  availableAt: IsoTimestamp,
  leaseOwner: NonEmptyId.optional(),
  leaseExpiresAt: IsoTimestamp.optional(),
  attemptCount: z.number().int().nonnegative(),
  wakeReason: z.enum(["initial", "due_time", "verified_receipt_signal", "operator_retry"]),
  sourceQueryReceiptId: NonEmptyId.optional(),
  retryTargetState: NonEmptyId.optional(),
  lastErrorCode: NonEmptyId.optional()
});
```

For `resume_cash_application`, the deterministic command identity is derived from workflow version, run ID and next attempt number. Due-time polling and a verified receipt-arrival signal both upsert that same identity, so they cannot create two logical wake-ups. Retry limits, lease duration, backoff, maximum receipt attempts and maximum receipt-wait age are owner configuration, not constants in this document.

### 6.4 Handoff packet

```ts
const CashToForensicsHandoffSchema = z.object({
  packetId: NonEmptyId,
  schemaVersion: z.literal("1"),
  idempotencyKey: NonEmptyId,
  runId: NonEmptyId,
  caseId: NonEmptyId,
  sourceAgent: z.literal("Cash Application Agent"),
  targetAgent: z.literal("Forensics Investigator"),
  purpose: z.literal("investigate_validated_dep_short_payment"),
  allocationReceiptId: NonEmptyId,
  reasonValidationReceiptId: NonEmptyId,
  recordIds: z.array(NonEmptyId).min(1),
  safeSummary: z.string().max(1000),
  createdAt: IsoTimestamp
});
```

Forensics rehydrates the case and evidence from repositories. The summary is explanatory only.

## 7. Database design

### 7.1 Migration strategy

Create `docs/supabase-cash-application-schema.sql` as a repeatable, additive source-controlled schema contract. Apply it through a separately approved Supabase migration. Do not append speculative tables to `docs/supabase-memory-schema.sql` until the owners decide whether that file remains the consolidated bootstrap.

The migration has one explicit backward-compatible change to an existing table: widen the `recoup_config.key` CHECK before inserting `cash_run_control`. Production already has the generated five-key constraint from `src/memory/supabaseStore.ts`; rerunning `CREATE TABLE IF NOT EXISTS` does not update it. Fresh bootstrap and migrated databases must converge on the explicit final constraint name `recoup_config_key_check`. Bootstrap DDL shall declare that name directly. The migration must preflight the current constraint definition and abort on an unknown shape, then in one transaction:

1. add `recoup_config_key_check_v2` as `CHECK (key IN (<all prior keys>, 'cash_run_control')) NOT VALID`;
2. validate the new constraint against existing rows;
3. drop only the discovered prior key CHECK;
4. rename the validated v2 constraint to `recoup_config_key_check`; and
5. insert the approved optional `cash_run_control` row only after the widened constraint is active.

Existing rows, grants, RLS policies, columns and the `run_control` payload are not rewritten. Feature rollback leaves the harmless widened constraint and unused optional row in place; removing evidence/config by down migration requires separate data-operation approval.

The migration must:

- use `CREATE TABLE IF NOT EXISTS` only where repeatability is safe;
- use explicit constraints and indexes;
- enable and force RLS;
- revoke public/anon/authenticated/service-role access before granting the minimum service-role rights;
- expose writes only through narrowly scoped RPCs where an atomic multi-table boundary is required;
- avoid destructive table/column changes other than the explicitly reviewed atomic replacement of the `recoup_config.key` CHECK described above; and
- include schema tests before application code depends on it.

### 7.2 Proposed tables

#### `recoup_cash_inbox`

| Column | Type | Notes |
|---|---|---|
| `inbox_id` | text PK | Stable internal ID |
| `provider` | text | Approved provider key |
| `provider_event_id` | text | Unique with provider |
| `message_id` | text | Indexed |
| `sender_hash` | text | Avoid broad raw sender exposure; approved display value may be separate encrypted metadata |
| `recipient` | text | Approved recipient |
| `received_at` | timestamptz | Provider/verified time |
| `subject_sanitized` | text | Bounded |
| `body_content_hash` | text | No raw body required here |
| `provenance_mode` | text | `live`, `replay`, `synthetic` |
| `status` | text | Intake status enum |
| `created_at` | timestamptz | Server time |

Constraints:

- unique `(provider, provider_event_id)`;
- approved status/provenance checks;
- no provider secret or raw signature storage.

#### `recoup_cash_attachments`

Stores private object reference, content hash, detected MIME, size, scan status, policy version, quarantine metadata and retention state. Unique `(inbox_id, content_hash, object_ref)` prevents duplicate canonical artifacts.

#### `recoup_cash_remittances` and `recoup_cash_remittance_lines`

Store the canonical mapped advice and lines. Monetary columns use `numeric`; TypeScript repositories read/write normalized decimal strings. Lines preserve claimed reason separately from validated reason, which is not populated by the mapper.

#### `recoup_cash_receipts`

Stores the canonical read-through receipt snapshot used for a run, including source record ID, settlement/freshness status, amount, currency, entity, timestamps, source payload hash and source record IDs. It is evidence, not an ERP mutation.

#### `recoup_cash_allocations` and `recoup_cash_allocation_lines`

Store immutable calculation receipts and versioned line allocations. A unique allocation idempotency key prevents duplicate calculation persistence. Any correction creates a new version linked to the prior receipt; it does not mutate the original receipt into a different result.

#### `recoup_live_deduction_cases`

Stores live case identity, run/allocation/reason links, amount/currency, current state, provenance mode and source record IDs. It has no S1-S8 scenario foreign key or enum.

#### `recoup_workflow_runs`

Stores current workflow state and phase as an operational index. This row is a projection/coordination record; event history remains append-only.

#### `recoup_workflow_events`

Append-only event table with global identity cursor, unique `(run_id, run_sequence)`, event ID, safe payload JSON, record IDs and timestamps. UPDATE/DELETE is not granted to the runtime role.

#### `recoup_workflow_outbox`

Stores commands, `available_at`, leases, attempt number, wake reason, prior source-query receipt, recorded retry target and dead-letter state. Unique idempotency key enforces one logical command. A partial index on claimable status plus `available_at` supports due work without scanning completed history.

#### `recoup_agent_run_state`

Rebuildable projection keyed by `(run_id, specialist_name)` with status, current phase, last event cursor, started/completed timestamps and blocker code. It contains no autonomous business decision.

### 7.3 Atomic RPCs

#### `recoup_accept_cash_remittance`

Atomically:

1. validates provider/message idempotency;
2. inserts accepted inbox/artifact metadata;
3. inserts canonical remittance header/lines;
4. inserts workflow run;
5. appends `run_received` event;
6. inserts `start_cash_application` outbox command; and
7. returns existing run for a duplicate key.

The attachment object must already have an approved clean scan result. The RPC does not parse or scan content.

#### `recoup_append_workflow_event`

Atomically validates the expected run sequence, inserts the event, updates run/agent projections, and returns the global cursor. Illegal state transitions fail with a conflict and no partial update.

#### `recoup_claim_workflow_commands`

Claims an owner-configured bounded batch using `FOR UPDATE SKIP LOCKED`, sets a lease and returns commands. Lease and batch values come from governed runtime config.

#### `recoup_complete_workflow_command`

Marks the command complete only after idempotent business state and required event are durable. Failure increments attempts or moves to dead-letter according to approved policy.

#### `recoup_schedule_cash_receipt_resume`

Atomically persists the completed CashReceipt source-query receipt, appends the waiting event, updates the run to `AwaitingCashReceipt`, and upserts the deterministic next `resume_cash_application` command with `available_at` and attempt number. A verified receipt-arrival signal calls the same RPC/key with `wake_reason = verified_receipt_signal`; it may make the existing next command immediately claimable but cannot create a second command. When the owner-approved maximum attempts or maximum wait is reached, the RPC records `Review` or `Blocked` plus a visible dead-letter item instead of scheduling another wake-up.

### 7.4 RLS and grants

- Runtime service role: SELECT plus approved RPC execute; direct event/inbox/outbox writes should be denied where RPCs provide the boundary.
- Cockpit browser roles: no direct table access.
- Anonymous/authenticated Supabase roles: no access.
- Support/operations access: through backend authorization and audited commands, not direct browser SQL.

## 8. Attachment-processing design

### 8.1 Lifecycle

```text
provider reference
  -> private staged object
  -> content sniff
  -> size/type/archive/macro policy
  -> malware scan
  -> clean canonical object OR quarantine
  -> atomic intake reference
  -> staged-object cleanup
```

### 8.2 Interface

```ts
interface AttachmentSecurityService {
  inspect(input: {
    provider: string;
    providerAttachmentRef: string;
    messageId: string;
  }): Promise<AttachmentInspectionResult>;
}
```

The service returns typed status and hashes. It does not return raw bytes to an agent. The chosen scanner/object provider is an owner decision and is injected behind the interface.

### 8.3 Failure behavior

- `quarantined`/`blocked`: persist only approved security telemetry; no canonical remittance.
- `scan_unavailable`: fail closed; no parser/model access.
- partial upload: remove or quarantine staged object through a durable cleanup command.
- encrypted/unsupported archive: review or block according to approved policy.

## 9. Inbound endpoint design

### 9.1 Backend route

Proposed provider-facing route:

```text
POST /api/v1/inbound/remittance-email
```

This route is hosted by the backend API, not the browser-facing Next.js application, unless the deployment owner explicitly chooses a hardened proxy.

Processing order:

1. read raw request body with a bounded maximum;
2. verify provider signature using raw bytes;
3. validate timestamp/nonce/replay window;
4. verify recipient/mailbox and provider event type;
5. map to the provider-neutral envelope;
6. deduplicate provider/message identity;
7. fetch and scan approved attachments;
8. map one approved format;
9. execute atomic acceptance RPC;
10. acknowledge only after durable acceptance or idempotent duplicate resolution.

### 9.2 Response contract

```json
{
  "status": "accepted",
  "runId": "opaque-run-id",
  "duplicate": false,
  "correlationId": "opaque-correlation-id"
}
```

Allowed statuses are `accepted`, `duplicate`, `rejected`, or `blocked`. Responses never expose scan internals, source secrets or customer-sensitive body content.

### 9.3 Error mapping

| Condition | HTTP class | Durable business state |
|---|---|---|
| Invalid signature/replay/wrong recipient | 4xx | None; security telemetry only |
| Duplicate accepted event | 2xx | Existing run returned |
| Unsupported/unsafe attachment | 4xx or provider-compatible 2xx acknowledgement per approved contract | Quarantine/block record only |
| Storage/database unavailable before commit | 5xx | No accepted business state; provider retry allowed |
| Commit succeeds but worker unavailable | 2xx | Run/outbox durable; processing delayed |

Exact provider acknowledgement behavior requires D-03/D-04.

## 10. CashReceipt adapter design

```ts
interface CashReceiptSource {
  findReceipt(input: {
    customerReference: string;
    legalEntityReference: string;
    paymentReference: string;
    instructedAmount: string;
    currency: string;
    asOf: string;
  }): Promise<CashReceiptLookupResult>;
}
```

`CashReceiptLookupResult` is a discriminated union: `settled`, `pending`, `ambiguous`, `not_found`, `stale`, `source_unavailable`, or `contract_gap`.

The adapter:

- uses read-only credentials;
- returns canonical types only;
- carries source health and freshness;
- never converts missing result into a zero-amount receipt;
- never calls an ERP write endpoint; and
- stores a cited snapshot used by the allocation.

## 11. Service orchestration

### 11.1 `remittanceIntake.ts`

Responsibilities:

- provider-neutral envelope validation;
- approved sender/customer mapping request;
- attachment security and approved-format mapper calls;
- idempotency key construction;
- atomic repository acceptance;
- safe acceptance receipt.

It does not start the agent directly. The outbox is the durable handoff.

### 11.2 `workflowWorker.ts`

Worker loop:

1. confirm `RECOUP_CASH_WORKER_ENABLED` is true;
2. load and validate the separate optional governed `cash_run_control` config;
3. claim a bounded due batch;
4. create correlation/run context;
5. dispatch by typed command and call the idempotent phase service;
6. append normalized events and complete/retry/dead-letter the command;
7. emit metrics without sensitive payloads.

The worker is an in-process background poller owned by the existing always-on Render `recoup-api` runtime and started/stopped through `startCockpitApiRuntime`. Poller construction itself is gated by `RECOUP_CASH_WORKER_ENABLED`; missing or false means the worker factory is not invoked. On each tick, missing or invalid `cash_run_control` returns before any claim RPC, producing zero claims, zero leases and zero attempt/dead-letter mutations. Only after both gates pass may the worker claim `availableAt <= now()` commands through `recoup_claim_workflow_commands`. Database leases plus `FOR UPDATE SKIP LOCKED` make multiple API replicas safe. The handle mirrors the existing injectable `sourceHealthPollerFactory` lifecycle and `.stop()` behavior. Graceful shutdown stops new claims and permits bounded in-flight completion/lease expiry. No blocking infinite poll, unbounded concurrency or in-memory-only pending work is permitted. `CLAUDE.md` must be updated before merge so local-run guidance explicitly covers the new production-connected command worker.

**N5 implementation sequence is mandatory.** The first worker logical change introduces the startup/lifecycle seam, proves that false/missing flag prevents factory construction, proves that a true flag with missing/invalid cash configuration returns before any claim, updates `CLAUDE.md`, and makes the split negative tests pass; it must not yet add a claim-capable path. Only a subsequent logical change may add the bounded claim RPC and lease processing behind both proven gates. Review of this document does not close N5.

### 11.3 `cashApplication.ts`

Phase flow:

```text
validate canonical advice
  -> retrieve authoritative CashReceipt
  -> if absent: persist query receipt + AwaitingCashReceipt event + delayed deterministic resume command
  -> on due time or verified receipt signal: resume through Validating
  -> maximum wait/attempts: Review/Blocked + visible dead letter
  -> otherwise continue
  -> retrieve candidate invoices
  -> deterministic match
  -> deterministic allocation
  -> deterministic reason validation
  -> full payment complete OR reason review OR create live case
  -> persist Cash-to-Forensics handoff
  -> enqueue start_forensics command
```

After canonical results are durable, the service attempts the Cash Application Agent for operator-legible, cited explanation and handoff narration when the agent feature is enabled. The agent has no unresolved business branch to decide. Agent/model failure emits a safe `narration_unavailable` workflow event, uses a deterministic service-generated summary and continues the valid allocation/case/handoff transition; it never blocks or rolls back deterministic work.

The service never sleeps or relies on browser/SSE activity. `resume_cash_application` re-runs the read-only SAP CashReceipt query using the persisted run scope and records a new source-query receipt. A settled fresh match advances to `Matching`; another valid miss schedules the next deterministic attempt; source failure remains distinct from a fresh zero-result receipt. Due-time polling alone satisfies AC-06; a later receipt signal is optional and converges on the same resume identity.

### 11.4 Scoped Forensics entry

Add a new function rather than modifying the existing bulk function's semantics:

```ts
runForensicsForLiveCase(input: {
  caseId: string;
  handoffPacketId: string;
  recordIds: string[];
}): Promise<LiveForensicsResult>
```

It:

- validates the handoff packet;
- loads the live case/allocation/reason records;
- materializes the canonical `DeductionLine`/claim/evidence view required by existing Forensics services;
- invokes existing deterministic reconciliation/guardrails;
- writes a live-case decision without changing S1-S8;
- creates a draft Billing or recovery output as currently governed; and
- publishes a Maya-ready read model.

An anti-corruption mapping layer prevents live persistence shapes from leaking into core Forensics logic.

## 12. Agent and tool implementation

### 12.1 Cash Application Agent definition

`src/agents/cashApplication.ts` should follow the existing runtime wrapper pattern and declare:

- name: `Cash Application Agent`;
- purpose: explain canonical cash-application results and make operator-legible approved-tool/handoff activity; not decide settlement, match, money, reason or state;
- pinned model key from `config/models.ts`;
- dedicated `cash_application` provider-data namespace from `config/openaiPromptCache.ts`;
- high-level instructions from the versioned prompt;
- only `cash.*` and allowed `workflow.*` tools;
- no general MCP/database/SAP/email tool;
- input guard: sanitized typed message/advice references;
- output guard: no amount/status/reason disagreement with tool receipts;
- handoff target: Forensics only through a durable packet;
- run-budget phase binding; and
- hook receipt registration through `agentRuntime.ts`.

The output may be absent. A service-generated safe summary remains sufficient for the durable handoff packet, so the receiving Forensics specialist never depends on model availability.

### 12.2 Tool signatures

```ts
cash.remittance.read({ runId })
cash.receipt.read({ runId, remittanceId })
cash.invoiceCandidates.read({ runId, remittanceId, receiptId })
cash.allocation.compute({ runId, remittanceId, receiptId, candidateSetId })
cash.reason.validate({ runId, allocationId, remittanceLineId })
cash.case.create({ runId, allocationId, reasonReceiptId })
workflow.handoff.create({ runId, caseId, target: "Forensics Investigator" })
```

Each tool:

- accepts Zod-validated IDs, not free-form source payloads;
- rechecks run/case scope;
- reads canonical state from repositories;
- returns cited record IDs and deterministic basis;
- enforces idempotency for state changes; and
- appends the appropriate workflow/audit receipt through services.

### 12.3 Handoff graph

Add:

```ts
{
  from: "Cash Application Agent",
  to: "Forensics Investigator",
  mode: "handoff",
  wiring: "deterministic-service"
}
```

Use `deterministic-service`, not an unguarded SDK-only handoff, because case creation and packet persistence must succeed before Forensics queues.

### 12.4 Agent output verification

Before an agent narrative reaches events/UI:

- all mentioned record IDs must be a subset of tool-returned IDs;
- any amount text must exactly equal formatted deterministic fields or be omitted;
- no unsupported reason/status appears;
- no execution claim such as “posted”, “cleared”, “sent” or “created in SAP” is allowed;
- a waiting/blocked result cannot be narrated as success; and
- provenance mode remains visible.

## 13. State transition implementation

### 13.1 Transition table

| Current | Command/event | Preconditions | Next | Side effects |
|---|---|---|---|---|
| none | accept inbound | Signature/scan/map/transaction pass | `Received` | Run/event/outbox |
| `Received` | start validation | Valid command lease | `Validating` | Agent/service state |
| `Received` | authorized cancel/block | State/policy permits | `Cancelled`/`Blocked` | Audit event |
| `Validating` | receipt pending/not found | Fresh source query receipt is durable | `AwaitingCashReceipt` | Waiting event plus delayed deterministic resume command |
| `Validating` | intake valid | Receipt and mappings available | `Matching` | Match phase event |
| `Validating` | ambiguity/block/cancel | Typed reason and authorization | `Review`/`Blocked`/`Cancelled` | No allocation |
| `AwaitingCashReceipt` | due resume or verified receipt signal | Deterministic resume command and cash run control | `Validating` | New source query receipt |
| `AwaitingCashReceipt` | maximum wait/attempts or authorized cancel | Ratified policy | `Review`/`Blocked`/`Cancelled` | Dead letter/audit event as applicable |
| `Matching` | deterministic allocation balanced | Policy/source complete | `Allocated` | Allocation receipt |
| `Matching` | ambiguity/mismatch/cancel | Typed blocker or authorization | `Review`/`Blocked`/`Cancelled` | No case |
| `Allocated` | reason ambiguous | Claimed reason preserved | `ReasonReview` | No Forensics |
| `Allocated` | full payment | No non-zero short pay | `Completed` | No case |
| `Allocated` | validated DEP short pay | Case key unique | `DeductionCreated` | Case + event |
| `Allocated` | authorized cancel | Policy allows | `Cancelled` | Audit event |
| `ReasonReview` | reason validated | Deterministic DEP receipt | `DeductionCreated` | Case + event |
| `ReasonReview` | review/block/cancel | Typed reason or authorization | `Review`/`Blocked`/`Cancelled` | No Forensics |
| `DeductionCreated` | handoff committed | Packet valid | `ForensicsQueued` | Outbox command |
| `DeductionCreated` | block/cancel before queue | Typed reason or authorization | `Blocked`/`Cancelled` | Audit event |
| `ForensicsQueued` | worker starts | Idempotent live entry | `ForensicsRunning` | Agent/event state |
| `ForensicsQueued` | block/cancel | Typed reason or authorization | `Blocked`/`Cancelled` | Audit event |
| `ForensicsRunning` | decision/read model durable | Evidence/guards pass | `MayaReady` | Maya item |
| `ForensicsRunning` | block/cancel | Typed reason or authorization | `Blocked`/`Cancelled` | Audit event |
| `MayaReady` | review opened | Eligible Maya scope | `PendingHumanDecision` | None |
| `MayaReady` | authorized cancel | Policy allows | `Cancelled` | Audit event |
| `PendingHumanDecision` | human modifies | Authorization and version pass | `Modified` | New proposal version |
| `PendingHumanDecision` | human approves/rejects | HITL/SoD pass | `Approved`/`Rejected` | Audit receipt |
| `PendingHumanDecision` | authorized cancel | Policy allows | `Cancelled` | Audit event |
| `Modified` | revalidation passes | New candidate/version current | `PendingHumanDecision` | New approval item |
| `Modified` | reject/cancel | Eligible human | `Rejected`/`Cancelled` | Audit receipt |
| `Approved` | internal workflow close or authorized cancellation | No ERP-execution claim | `Completed`/`Cancelled` | Audit event |
| `Rejected` | internal workflow close | Decision durable | `Completed` | Audit event |
| `Review` | owner-authorized retry/block/cancel | Recorded retry target and current version | recorded state/`Blocked`/`Cancelled` | New command/audit event |
| `Blocked` | owner-authorized retry/review/cancel | Blocker cleared or human route | recorded state/`Review`/`Cancelled` | New command/audit event |

Illegal transitions return conflict, persist no partial state, and generate safe audit/operations telemetry where appropriate.

This is the implementation expansion of the canonical BRD/SDD state table. No other transition table is authoritative; D-12 ratifies both the state names and the recorded retry target semantics.

### 13.2 Projection reducer

Implement a pure reducer:

```ts
reduceAgentRunState(previous, workflowEvent): AgentRunProjection
```

Projection rebuild reads ordered events and must produce the same result as incremental application. Property tests cover event sequences, duplicates and illegal ordering.

## 14. Agent Operations backend API

Suggested Express routes under the existing backend:

| Method/path | Purpose | Authorization |
|---|---|---|
| `GET /agent-operations/roster` | Specialists and bounded manifests | Governance/operations read |
| `GET /agent-operations/runs` | Cursor/page-filtered run table | Operations read |
| `GET /agent-operations/runs/:runId` | Complete safe run dossier | Run-scope read |
| `GET /agent-operations/events` | Cursor-paged persisted events | Operations read |
| `GET /agent-operations/events/stream` | Cursor SSE | Operations read |
| `POST /agent-operations/runs/:runId/retry` | Authorized retry from valid state | Operations retry |
| `POST /agent-operations/runs/:runId/cancel` | Authorized cancel with reason | Operations cancel |
| `POST /agent-operations/rehearsals` | Explicitly labelled replay trigger | Demo/operations replay |

### 14.1 Roster response

```json
{
  "generatedAt": "ISO-8601",
  "agents": [
    {
      "name": "Cash Application Agent",
      "capability": "Cash application orchestration",
      "modelExecution": "pinned",
      "availability": "idle",
      "activeRunCount": 0,
      "queuedRunCount": 0,
      "blockedRunCount": 0,
      "sourceRecordIds": ["manifest-reference"]
    }
  ]
}
```

Counts come from projections. Static manifest fields may describe bounded capability, but availability/counts cannot be hard-coded.

### 14.2 Run summary

```ts
const AgentOperationsRunSummarySchema = z.object({
  runId: NonEmptyId,
  triggerType: z.enum(["live_email", "replay_email", "synthetic_email"]),
  receivedAt: IsoTimestamp,
  customerLabel: z.string().min(1).optional(),
  state: NonEmptyId,
  currentPhase: NonEmptyId,
  currentSpecialist: NonEmptyId.optional(),
  blockerCode: NonEmptyId.optional(),
  caseId: NonEmptyId.optional(),
  provenanceMode: ProvenanceMode,
  lastEventCursor: z.string().regex(/^\d+$/u),
  sourceRecordIds: z.array(NonEmptyId).min(1)
});
```

### 14.3 Run detail

The detail response groups references rather than returning raw provider/source payloads:

- sanitized inbound metadata;
- attachment scan/provenance;
- remittance advice;
- CashReceipt status/freshness;
- invoice match;
- allocation receipt;
- claimed/validated reason;
- live case/handoff;
- Forensics result/drafts;
- human decision/audit references;
- activity events.

## 15. Durable cursor SSE

### 15.1 Protocol

Client request:

```text
GET /agent-operations/events/stream?after=<cursor>&runId=<optional>
Last-Event-ID: <cursor>
```

Server behavior:

1. authenticate before committing SSE headers;
2. validate cursor and run scope;
3. replay persisted events strictly after the cursor;
4. poll/listen for new persisted events;
5. emit heartbeat comments without business state;
6. include `id: <cursor>` and `event: workflow_event`;
7. terminate on owner-configured duration or auth loss;
8. let the client reconnect with the last processed cursor.

### 15.2 Event format

```text
id: 1842
event: workflow_event
data: {safe WorkflowEvent JSON}

```

### 15.3 Separation from current Forensics SSE

Do not replace `cockpit/app/api/forensics/events/route.ts` in the first implementation. The new stream is durable and cursor-based. The current Forensics invalidation route remains for backward compatibility until a separately approved consolidation proves equivalent behavior.

## 16. Agent Operations frontend design

### 16.1 Route strategy

Keep `/governance/agents` as the route. Preserve the current roster/boundary view as the initial safe fallback. When the live-workspace feature flag and backend capability are available, render the new workspace using server-fetched initial data plus SSE updates.

### 16.2 Layout

```text
+-------------------------------------------------------------------+
| Sidebar | Agent Operations | source health | stream status         |
+---------+------------------+---------------------------------------+
| Roster / active counts      | Run table                             |
| Cash App  idle/2 active     | received | customer | phase | state   |
| Forensics idle/1 active     | ...                                    |
| Recovery   idle             |                                        |
+-----------------------------+---------------------------------------+
| Selected run: activity ledger | Evidence / match / handoff detail   |
| timestamp, specialist, phase  | sanitized email, CashReceipt,       |
| action, tool/source, outcome  | allocation, reason, case, audit     |
+-------------------------------------------------------------------+
```

### 16.3 Rendering rules

- Desktop-first dense table layout.
- Existing design tokens and vector icon family.
- No decorative cards for every event.
- No default purple/gradient/glass treatment.
- No emoji or animated “thinking” indicators without a durable running event.
- Business labels first; raw IDs behind disclosure.
- Blocked/waiting states show actionable safe reasons.
- Stream disconnected is distinct from run failed.
- Agent idle is not presented as a problem.

### 16.4 Client state model

The client stores:

- last cursor;
- normalized run summaries keyed by run ID;
- selected run ID;
- connection state;
- optional optimistic UI only for non-business interactions such as selection.

It does not optimistically change business state for retry, cancel, allocation, handoff or approval commands. Command responses and subsequent persisted events drive those states.

## 17. Maya frontend integration

### 17.1 Backward-compatible read model

Extend the existing work-item/detail response with an optional origin union:

```ts
origin?: {
  type: "live_cash_application";
  runId: string;
  inboxId: string;
  remittanceId: string;
  cashReceiptId: string;
  allocationId: string;
  claimedReason: string;
  validatedReason: "DEP";
  provenanceMode: "live" | "replay" | "synthetic";
  sourceRecordIds: string[];
  display: {
    receiptAmount: string;
    appliedAmount: string;
    shortPaymentAmount: string;
  };
}
```

`display` strings are produced by the backend formatter after Decimal calculation and owner-approved currency-scale formatting. Existing scenario items omit `origin` and render exactly as before. `cockpit/components/maya/upstream-cash-origin.tsx` performs no parsing, rounding, subtraction or currency conversion and imports neither `decimal.js` nor backend/core modules.

### 17.2 UI placement

Add an `Upstream cash origin` section in the existing case overview/evidence dossier, not a separate disconnected page. It displays:

- received time and sanitized sender label;
- attachment scan result/hash;
- CashReceipt source, settlement and freshness;
- allocation summary and deterministic basis;
- claimed versus validated reason; and
- link to the Agent Operations run when authorized.

### 17.3 Assignment and refresh

The live case is inserted into the same bounded Maya worklist read model through the backend. Both cache contracts change in the same backend/UI release: `mayaForensicsReadModelKey` advances from `maya:forensics:v1` to `maya:forensics:v2`, and `mayaForensicsWorkItemReadModelKey()` advances from `maya:forensics:work-item:<lineId>:v3` to `:v4`. New loaders reject/ignore old-key entries and do not wait for the current 24-hour maximum age. After deployment, an explicitly approved Supabase operation may purge/retire old worklist v1 and detail v3 rows, followed by worklist and detail verification probes.

The durable `maya_ready` commit invalidates both the affected v2 worklist scope and v4 detail key before/with publication. Maya then reloads canonical worklist/detail data from the API. No full-page reload is required. `tests/invariants/cockpit-no-business-logic.test.ts` remains unchanged and green.

## 18. Approval and audit integration

### 18.1 Action scope

Live-case action IDs must include stable case/proposal version semantics without exposing a forgeable browser-only authority. The approval service validates:

- live case exists and is Maya-ready;
- draft version matches current proposal;
- proposer and approver constraints;
- approver capability/materiality policy;
- cited evidence and amount clamp receipts; and
- no prior terminal decision for the same version.

### 18.2 Modification

Modification creates a new proposal version. It reruns amount/evidence/freshness/authorization guards and produces a new approval item. Direct editing of a committed draft receipt is prohibited.

### 18.3 Audit entry categories

Reuse the generic hash-chain payload structure. Add typed application-level categories without changing the chain algorithm:

- `cash_receipt_verified`
- `cash_allocation_committed`
- `deduction_reason_validated`
- `live_case_created`
- `agent_handoff_committed`
- `forensics_decision_committed`
- `human_decision_committed`
- `external_execution_reference_recorded`

Each category includes record IDs and deterministic basis/version.

## 19. Feature flags and configuration

Suggested configuration keys are names, not approved values:

- `RECOUP_CASH_INBOUND_ENABLED`
- `RECOUP_CASH_WORKER_ENABLED`
- `RECOUP_AGENT_OPERATIONS_LIVE_ENABLED`
- `RECOUP_MAYA_LIVE_CASES_ENABLED`
- `RECOUP_CASH_REHEARSAL_ENABLED`

Missing keys evaluate to disabled. Secret/provider values remain in `.env.local`/provider configuration and are never documented with values.

Business policy is stored in a governed, versioned configuration row or approved config module:

- allocation policy;
- reason-code policy;
- source freshness policy;
- run-control budgets;
- retry/lease/backoff/concurrency policy;
- retention/security policy; and
- performance/SLO targets.

#### 19.1 Backward-compatible cash run control

Do not add cash phases to `RunControlValueJsonSchema.phases`. That schema and its six required keys remain byte/parse compatible with the active production row, and `buildRunControlStatus()` continues to report retry/step/token phase counts of six.

Add `cash_run_control` to `releaseOwnerInputOptionalConfigKeys` with its own strict value/config schema and optional `cashRunControlConfig` field on `ReleaseOwnerInputSnapshot`. The repository may return no cash row without invalidating the required release-owner inputs. `loadRequiredCashRunControl()` is used only by inbound/worker/cash-agent routes and returns a cash-scoped fail-closed result when absent or invalid. Existing Forensics, query, Recovery, Risk Mesh, Sentinel, Containment, David and CFO paths continue to parse and use only the current required `run_control` row.

Before seeding that optional row, update the generated bootstrap/migration contract in `src/memory/supabaseStore.ts` and execute the Section 7.1 constraint transition. The migration test must reproduce the current production five-key CHECK, prove the pre-migration insert fails, apply the transition, prove all old rows and the six-phase value are byte-equivalent, and then prove the optional insert succeeds.

D-13 owns the cash phase names and token/step/retry/timeout/lease/backoff/maximum-wait/concurrency values. No seed or runtime default is added before approval.

#### 19.2 Prompt-cache namespace

Add `cash_application` to `openAiPromptCacheCapabilities` and `openAiPromptCacheConfig` with the versioned key `recoup:v2:cash-application:v1`. `config/models.ts` binds the Cash Application Agent settings to this namespace and an already pinned runtime model. Reusing `deduction_forensics` requires an explicit replacement decision and evaluation evidence; it is not a fallback.

`tests/unit/openai-prompt-cache.test.ts` is a pinned exact-list contract and must be amended tests-first in the same logical change; a full-suite pass does not substitute for its explicit proof.

The code must not supply hidden production defaults.

## 20. Error taxonomy

```ts
const CashWorkflowErrorCodeSchema = z.enum([
  "invalid_signature",
  "replay_rejected",
  "recipient_not_allowed",
  "attachment_unsafe",
  "attachment_scan_unavailable",
  "format_unsupported",
  "mapping_ambiguous",
  "cash_receipt_missing",
  "cash_receipt_unsettled",
  "cash_receipt_stale",
  "cash_receipt_ambiguous",
  "invoice_ambiguous",
  "legal_entity_mismatch",
  "currency_mismatch",
  "amount_mismatch",
  "allocation_policy_missing",
  "reason_policy_missing",
  "reason_ambiguous",
  "source_unavailable",
  "state_conflict",
  "run_budget_exceeded",
  "authorization_denied",
  "narration_unavailable",
  "retry_exhausted",
  "internal_error"
]);
```

User-facing messages are safe mappings. Provider/source response bodies and exception stacks do not enter SSE/UI payloads.

## 21. Observability implementation

### 21.1 Structured log fields

- `correlationId`
- `providerEventIdHash`
- `inboxId`
- `runId`
- `caseId`
- `commandId`
- `eventId` and cursor
- `phase`
- `specialist`
- `toolName`
- `sourceSystem`
- `status`/error code
- `policyVersion`
- latency and attempt count

Do not log raw bodies, attachment text, tokens, secret headers, unrestricted sender addresses or customer-sensitive free text.

### 21.2 Trace spans

Proposed spans:

- `cash.inbound.verify`
- `cash.attachment.inspect`
- `cash.remittance.map`
- `cash.intake.commit`
- `cash.receipt.lookup`
- `cash.invoice.lookup`
- `cash.match`
- `cash.allocate`
- `cash.reason.validate`
- `cash.case.create`
- `workflow.handoff`
- `forensics.live.run`
- `workflow.projection.update`
- `workflow.sse.deliver`
- `approval.live_case.commit`

Trace payloads carry IDs and safe attributes, not source documents.

### 21.3 FinOps receipt

Agent/model usage uses the existing usage receipt and FinOps tables with `workflowName = cash_application_to_maya`, agent name, model ID, token classes, cost, record IDs and audit references. Cached-token claims require actual non-zero cached token evidence.

## 22. Test-first implementation plan

Tests are written before the behavior they govern.

### 22.1 Proposed new test files

| Test file | Coverage |
|---|---|
| `tests/unit/cash-application-types.test.ts` | Zod boundaries and invalid payloads |
| `tests/unit/cash-money-boundary.test.ts` | `MoneyString` validation, one `money()` parse point, governed formatting and no number coercion |
| `tests/unit/cash-match.test.ts` | Unique/ambiguous receipt and invoice matching |
| `tests/unit/cash-allocation.test.ts` | Decimal formulas, balance, policy matrix and immutability |
| `tests/unit/cash-reason.test.ts` | Claimed/validated separation and DEP-only rule |
| `tests/unit/remittance-intake.test.ts` | Signature-independent service behavior, mapping, dedup and fail closed |
| `tests/unit/cash-receipt-adapter.test.ts` | Canonical source outcomes and freshness |
| `tests/unit/cash-receipt-sap-adapter.test.ts` | Read-only SAP cleared-item mapping, settled-status/freshness semantics and no mutation client |
| `tests/integration/cash-receipt-sap-readiness.test.ts` | Secret-safe metadata proof contract, required entity/key/property coverage, bounded approved-fixture read and fail-closed auth/mapping outcomes |
| `tests/unit/remittance-csv-v1.test.ts` | Versioned CSV fields, required claimed reason code and deterministic D-05/D-08 mapping gate |
| `tests/unit/attachment-security-scanner.test.ts` | Private scanner health, clean/unsafe/unavailable outcomes and fail-closed intake |
| `tests/unit/workflow-events.test.ts` | Event schema, state transitions and projection reducer |
| `tests/unit/workflow-outbox.test.ts` | Lease, retry, idempotency and dead-letter semantics |
| `tests/unit/workflow-worker-startup.test.ts` | Disabled flag does not construct worker; missing/invalid config makes no claim call; valid config permits bounded claim; runtime close calls `.stop()` |
| `tests/integration/workflow-worker-disabled-no-mutation.test.ts` | Database-backed split proof: false/missing flag causes no construction; true flag plus missing/invalid config may construct the handle but causes zero claim calls/leases and leaves attempt/dead-letter state byte-equivalent |
| `tests/unit/cash-receipt-redrive.test.ts` | Delayed resume identity, due-time/receipt-signal convergence, maximum wait and no browser wake-up |
| `tests/unit/cash-application-agent.test.ts` | Tool allowlist, prompt boundaries and output equality |
| `tests/unit/cash-agent-narration-degradation.test.ts` | Model/tool narration failure emits a safe event/fallback summary and does not block canonical progress |
| `tests/unit/live-case-forensics.test.ts` | Scoped handoff and existing Forensics reuse |
| `tests/unit/agent-operations-api.test.ts` | Auth, filtering, safe read models and commands |
| `tests/unit/agent-operations-sse.test.ts` | Persist-before-stream, cursor replay, ordering and disconnect |
| `tests/invariants/cash-receipt-required.test.ts` | SA-CA-01 |
| `tests/invariants/cash-agent-no-authority.test.ts` | SA-CA-02/07 plus I-1/I-17 |
| `tests/invariants/live-case-gold-isolation.test.ts` | SA-CA-03 plus I-27 |
| `tests/invariants/cash-workflow-idempotency.test.ts` | SA-CA-04 |
| `tests/invariants/agent-state-event-derived.test.ts` | SA-CA-05 |
| `tests/invariants/cash-live-provenance.test.ts` | SA-CA-06 plus I-30 |
| `tests/invariants/cash-workflow-fail-closed.test.ts` | SA-CA-08 |
| `tests/e2e/remittance-email-to-maya-e2e.ts` | Full live/rehearsal journey |
| `tests/e2e/agent-operations-live-e2e.ts` | Idle, active, handoff, overlap, blocked and reconnect UI |
| `tests/unit/maya-live-origin-cache.test.ts` | Worklist v2/detail v4 keys, old-key rejection/retirement, scoped invalidation and backend-formatted money contract |
| `tests/integration/recoup-config-cash-key-migration.test.ts` | Current five-key CHECK rejects cash row; transactional widening preserves old rows/grants/RLS and permits optional row |
| `tests/evals/cash-straight-through-rate.test.ts` | `eligible_reference_stp_rate`: versioned reference-fixture denominator and >=95% no-human-touch regression result; post-eligibility Review/Blocked counts as failure; no live-effectiveness claim |

SA-CA-01 through SA-CA-08 are mandatory release-blocking feature invariant tests from their first implementation commit. They run under `npm run test` and therefore `npm run verify`; they may not be skipped, quarantined or downgraded. Assigning formal I-31 onward remains a separately approved `INVARIANTS.md` change.

### 22.2 Core test matrix

| Scenario | Expected result |
|---|---|
| Settled receipt, unique invoice, balanced short pay, DEP | One allocation, one case, one handoff |
| Full payment | Allocation completes; no case/Forensics |
| Email without CashReceipt | Persist query receipt and `AwaitingCashReceipt`; schedule one delayed deterministic resume; max wait/attempts -> Review/Blocked + dead letter; no allocation |
| Receipt pending/reversed/stale | Block/wait; no allocation |
| Receipt/remittance amount or currency mismatch | Review/blocked |
| Multiple receipt or invoice candidates | Review; no case |
| Missing allocation policy branch | Contract gap |
| Rounding/discount/credit/overpay/FX cases | Only approved policy outcomes; otherwise gap |
| Ambiguous/unclassified reason | ReasonReview; no Forensics |
| Duplicate provider event | Existing run returned |
| Crash after atomic intake | Outbox resumes once |
| Due-time poll races verified receipt signal | Both converge on the same next resume command; one source query/effect |
| SAP supplies no push signal | Governed due-time poll alone resumes and satisfies AC-06 |
| Crash after allocation before command completion | Idempotent resume; no duplicate allocation/case |
| Concurrent workers | One lease/effect |
| Retry exhaustion | Dead-letter visible |
| Scanner unavailable or invalid/malware attachment | Fail closed or quarantine; no accepted run |
| Source unavailable | Explicit blocker; no synthetic fallback |
| Same agent/human approval identity | Rejected/audited |
| Human modifies amount | Guards rerun; new version |
| SSE reconnect | Missing events once, ordered |
| Configured concurrency cap plus one overlapping email | Separate runs, correct active counts and bounded backpressure; not a two-run smoke test |
| Agent narration/model failure after deterministic result | Safe fallback/event; allocation, case and eligible handoff continue |
| Eligible reference-fixture corpus | `eligible_reference_stp_rate` >=95%; exclusions are pre-declared; result is labelled pre-production regression evidence |
| Governed real-sender canary | `eligible_live_stp_rate` is observed only after denominator, exclusions, window and minimum sample are approved; no external claim before that contract |
| Feature flags off | Existing route behavior unchanged |

### 22.3 Existing regression commands

After each logical change:

```powershell
npm run lint
npm run typecheck
npm run test
```

Before completion:

```powershell
npm run verify
```

If dependencies are absent, install with `npm.cmd ci` from the lockfile before interpreting failures. No hook or release gate may be skipped.

## 23. API and UI acceptance tests

### 23.1 Backend

- Provider signature verified using raw body.
- Invalid auth fails before SSE/JSON success headers or business writes.
- Duplicate returns the original run.
- Request sizes and schemas are bounded.
- Every command checks authorization and valid current state.
- Every query is case/run scoped.
- SSE authenticates before headers, replays from cursor and preserves order.
- Error payloads contain safe codes only.

### 23.2 Agent Operations

- All specialists are idle before work.
- A durable accepted event changes Cash Application to queued/running.
- Receipt wait shows waiting without starting Forensics.
- Durable handoff changes Cash Application to handed off and Forensics to queued/running.
- Recovery starts only for invalid/partial.
- Valid DEP keeps Recovery idle and creates a Billing draft.
- Disconnect shows stream status without changing run state.
- Concurrent runs show counts and distinct timelines.
- Synthetic/replay label is visible on every relevant row/detail.
- No raw enums, proof keys, chain-of-thought or unsupported dollars appear.

### 23.3 Maya

- Existing S1-S8 items render unchanged.
- Live case appears only after `maya_ready` is durable.
- Upstream origin displays cited receipt/allocation/reason evidence.
- Approval controls use existing authorization and SoD.
- Modified proposal reruns guards.
- No UI text implies ERP posting/execution.

## 24. Security verification

- Provider signature/timestamp/nonce negative tests.
- Content-type confusion and extension spoofing tests.
- Malware/quarantine contract tests using safe fixtures.
- Scanner-unavailable health test and proof that no disabled/no-op/public-upload scanner can satisfy intake readiness.
- Archive/macro/encrypted document policy tests.
- Prompt injection and PII minimization tests.
- Cross-run/cross-customer authorization tests.
- SSRF-safe attachment/provider fetch tests.
- Tool input/output scope and injection tests.
- Secret/log redaction tests.
- RLS/grant tests.
- Approval authorization and SoD negative tests.
- No write-capable ERP dependency/static test.

## 25. Migration and compatibility verification

### 25.0 Final-review and Phase 0 evidence register

The Phase 0 review pack is one controlled evidence set linked to the approved target SHA. It co-locates the four AC-01 reachability gates rather than recording SAP, scanner and CSV claims in separate narratives.

| Evidence gate | Current status | Required passing evidence |
|---|---|---|
| D-02 / SAP CashReceipt | **OPEN.** On 2026-08-22, configured-sandbox GET-only service discovery/metadata attempts returned HTTP 401. No cleared-item mapping or bounded read was proven; no absence conclusion is permitted. | Successful service/entity/key/property metadata proof plus one bounded approved-fixture read proving settled status and freshness semantics; secret-safe record signed by Treasury and Architecture. |
| D-04 / private scanner | **OPEN.** Contract is designed; provisioned health and safe fixtures are not attached to this revision. | Private health result plus approved clean and unsafe fixture outcomes, with signature/replay/MIME/archive/macro/size/quarantine controls accepted by Security. |
| D-05/D-08 / CSV and reason mapping | **OPEN.** Contract is designed; joint ratification and fixture proof are not attached to this revision. | Approved UTF-8 CSV v1 schema, required machine-readable claimed reason, clean fixture and deterministic reason-map version/hash signed by Cash Application and Deduction Policy. |
| N5 / worker safety | **DESIGN CORRECTED; RUNTIME PROOF PENDING.** No cash worker exists to validate. | Tests-first split proof: false/missing flag prevents construction; true flag with missing/invalid config permits the lifecycle handle but prevents claim RPC, leases and database mutation; `CLAUDE.md` updated before merge. |
| Baseline and documents | **PENDING FINAL REVIEW.** Local references remain `origin/main` `0dfcaa7...` and authoring checkout `eeca343...`; the working tree contains pre-existing unrelated changes. | BRD v3.3.4, SDD v0.9.4 and TDD v0.9.4 committed together in a clean approved target worktree, hashes recorded, baseline `npm run verify` and existing contract snapshots captured. |

Every record contains UTC timestamp, environment label, provider/service and non-secret request path, response status, schema/artifact hash, approved fixture ID without payload, pass/fail, reviewer, owner decision and residual blocker. Secrets, authorization headers, customer free text and attachment contents are excluded.

### 25.1 Pre-migration

- Capture schema/table/grant inventory.
- Capture baseline `npm run verify` result.
- Capture existing Maya/Forensics API contract snapshots.
- Confirm BRD v3.3.4/SDD v0.9.4/TDD v0.9.4 hashes, commit all three to the target branch, and record `origin/main` baseline `0dfcaa7edcb7c3b6f1d8952fd0f100fa5e018c97` or a newer explicitly reviewed SHA.
- Capture the exact existing `recoup_config.key` CHECK name/definition and current rows, grants and RLS state.

### 25.2 Migration tests

- Apply to an empty test database.
- Apply to a database containing the current schema.
- Reapply repeatable portions safely.
- Verify the only existing-table schema change is the approved `recoup_config.key` CHECK widening; all existing rows, grants, RLS policies, columns and the six-phase `run_control` payload remain unchanged.
- Reproduce the current CHECK rejection, validate the new constraint before dropping the old one, prove the optional row can be inserted, and prove both fresh bootstrap and migrated paths converge on explicit name `recoup_config_key_check` before proving reapplication safe.
- Verify `remittance_headers`, `remittance_lines` and `recoup_src_remittance` remain unchanged and are not live write authority.
- Verify runtime cannot UPDATE/DELETE workflow events directly.
- Verify RPC atomicity with injected failures.

### 25.3 Compatibility tests

- Existing remittance evidence adapter still reads its current source.
- Existing Forensics settlement run returns the same deterministic results.
- Existing work-item IDs and Maya routes remain valid.
- Existing approval receipts verify.
- Existing audit chain verifies from genesis/tail.
- Existing Forensics SSE remains operational.
- Existing Agent Operations topology fallback remains available.
- David/CFO/query routes are unchanged.
- Existing six-phase `run_control` row still parses; retry/step/token phase counts remain six; absent/invalid `cash_run_control` blocks only the cash path.
- Maya worklist uses `maya:forensics:v2` and detail uses `:v4`; no worklist v1 or detail v3 payload can satisfy a new loader, and `maya_ready` invalidates both affected scopes.
- `upstream-cash-origin.tsx` consumes backend-formatted strings and `tests/invariants/cockpit-no-business-logic.test.ts` remains green.

Pinned-contract proof is required, not implied by the full-suite command:

| Test | Required compatibility assertion |
|---|---|
| `tests/invariants/tool-whitelist.test.ts` | Prior 23 names preserved; only approved cash/workflow tools added |
| `tests/invariants/tool-permissions.test.ts` | Every new tool has explicit risk and side-effect metadata |
| `tests/unit/agent-handoffs.test.ts` | Prior five edges preserved; one approved Cash Application -> Forensics edge added |
| `tests/invariants/pinned-models.test.ts` | Prior settings preserved; Cash Application uses pinned model plus dedicated cache namespace |
| `tests/invariants/connector-readiness.test.ts` | Prior six connector names preserved; CashReceipt readiness extends existing `sap-odata`; inbound-provider readiness is a separate typed contract and does not acquire a synthetic source table |
| `tests/invariants/run-control.test.ts` | Existing row/counts stay six; separate optional cash config fails closed locally |
| `tests/unit/openai-prompt-cache.test.ts` | Prior four capabilities remain and only `cash_application` is added with its dedicated key/prefix/model contract |

## 26. Phased delivery plan

| Phase | Implementation unit | Exit evidence |
|---|---|---|
| 0 | Owner decisions, approved BRD v3.3.4/SDD v0.9.4/TDD v0.9.4 committed together, clean target worktree, baseline gates and the co-located D-02/D-04/D-05/D-08 reachability proof | Signed decisions, document hashes, successful SAP metadata plus bounded-read proof, scanner/CSV/reason evidence and `origin/main` baseline report |
| 1 | Types, pure core and failing tests | Type/unit tests; no persistence/agent/UI change |
| 2 | Additive schema/repositories/RPC tests plus `recoup_config` CHECK transition | Constraint preflight/validation, preserved rows/grants/RLS, atomicity, idempotency and rollback evidence |
| 3 | Inbound adapter, private scanner and CSV v1 mapper with required reason code | Auth/scan/health/map/D-05-D-08 reachability integration tests |
| 4 | Read-only SAP CashReceipt adapter and cash service | Settled-status/field/freshness, due-time-only re-drive, allocation and no-ERP-write tests |
| 5 | Cash Application Agent/tools/conductor/handoff, dedicated prompt cache and optional cash run control | Non-blocking narration plus all seven named pinned-contract tests; existing run-control count remains six |
| 6 | Live-case Forensics and Maya worklist v2/detail v4 integration with backend-formatted money | Existing/live Forensics, dual-cache-shape/invalidation and cockpit-no-business-logic regressions |
| 7A | Worker safety boundary before any claim-capable path: lifecycle seam, construction flag, pre-claim cash-config return, `CLAUDE.md` local-safety update and negative tests | False/missing flag: zero construction/claims/leases/mutations. True flag with missing/invalid config: lifecycle handle may exist, but zero claim-RPC calls/leases and byte-equivalent attempt/dead-letter state. |
| 7B | Durable events, projections, delayed receipt re-drive, bounded claim/lease processing behind the proven gates and SSE | Valid-config bounded claim plus tick/lease/shutdown/crash/retry/max-wait/rebuild/reconnect/concurrency tests |
| 8 | Agent Operations and Maya UI | Desktop E2E, accessibility and visual score >= 4/5 |
| 9 | Security/evals/full regression | `npm run verify`, release blockers and >=95% `eligible_reference_stp_rate` fixture-corpus eval green |
| 10 | Rehearsal, governed-real-sender canary and production release after explicit approval | Provider/backend/Supabase/Vercel evidence, separately governed `eligible_live_stp_rate` observation and zero ERP mutation |

Each phase is an independently reviewable logical change. One logical change per commit; no unrelated refactoring.

## 27. Deployment and rollback runbook

### 27.1 Deployment order

1. Commit the approved BRD v3.3.4, SDD v0.9.4 and TDD v0.9.4 together; record hashes and the reviewed target SHA.
2. Capture baseline `npm run verify`, existing route contract snapshots and current six-phase run-control health/counts.
3. With all feature flags off, preflight and transactionally widen the existing `recoup_config.key` CHECK, then deploy additive schema/RPC/grants; verify prior config/remittance rows, grants and RLS remain unchanged.
4. Deploy backend types/repositories/core and dedicated prompt-cache config with routes disabled.
5. Deploy separate optional `cash_run_control` parsing; prove the current six-phase production row still parses and existing protected routes remain healthy.
6. Implement and verify Phase 7A before adding any claim-capable path; then deploy the `startCockpitApiRuntime` in-process worker with the flag disabled so it remains unconstructed. Only after the split evidence passes—no construction when disabled, and no claims/leases/mutations when enabled but unconfigured—may Phase 7B add governed tick, database leases, delayed SAP receipt re-drive and dead-letter projections behind both gates.
7. Deploy cockpit fallback-compatible UI with Maya worklist key `:v2` and work-item key `:v4`; verify v1/v3 entries cannot satisfy the new loaders.
8. After explicit data-operation approval, retire/purge stale Maya worklist v1 and work-item v3 rows and verify rebuilt v2/v4 read models. New keys—not purge timing—are the correctness boundary.
9. Enable rehearsal input only and run the full synthetic/replay-labelled journey, including receipt wait/re-drive.
10. Enable shadow intake/receipt lookup without case creation.
11. Enable one approved reference-fixture canary sender/CSV/customer with healthy private scan and proven read-only SAP receipt mapping, then Agent Operations and Maya live-case visibility; record `eligible_reference_stp_rate` only.
12. Run an explicitly approved governed-real-sender canary for `eligible_live_stp_rate`; enable controlled production intake only after final approval, all seven pinned-contract/release gates and the >=95% reference-corpus eval pass. Do not publish a live-effectiveness claim until its measurement contract is satisfied.

### 27.2 Kill switches

- Disable inbound acceptance.
- Disable command claiming while preserving queued commands.
- Disable new live-case creation.
- Disable live workspace exposure while retaining topology fallback.
- Disable Maya live-case exposure while retaining existing worklist.

### 27.3 Rollback validation

- Existing Forensics/Maya remains usable.
- Accepted runs/events remain queryable.
- Outbox commands are paused, not deleted.
- No duplicate work occurs on later resume.
- Audit chain remains valid.
- No database down migration deletes evidence.

## 28. Open decisions and implementation blockers

| Blocker | Required owner input | Design consequence |
|---|---|---|
| Provider | Provider, signature algorithm/SDK, endpoint and acknowledgement contract | Cannot implement provider adapter/route |
| Cash source | Ratify read-only SAP only after the configured sandbox returns a successful GET-only service/entity/key/property metadata proof and one approved-fixture read proves settlement/freshness semantics; bank/lockbox are deferred | Cannot implement `CashReceiptSource`; AC-01 unreachable; authentication failure does not prove absence and reopens the source decision |
| Format + reason reachability | Ratify UTF-8 CSV v1 fields, required machine-readable claimed reason code and deterministic DEP map jointly under D-05/D-08 | Cannot implement mapper; all affected lines enter ReasonReview |
| Allocation critical path | Ratify cardinality, ordering, discount/credit/rounding/tolerance/overpay/FX/residual/ambiguity policy pack before Phase 3 | Core returns Contract gap; later phases do not start |
| Security reachability | Provision private scanner adapter/endpoint/credentials/health plus size/MIME/archive/macro/quarantine/retention policy | Intake disabled; AC-01 unreachable |
| Run controls | Separate optional `cash_run_control`: phase names, tokens, steps, retries, timeout, lease, backoff, maximum receipt attempts/wait and concurrency | Cash agent/worker blocked; existing routes continue on six-phase `run_control` |
| States/roles | Final enums, retry/cancel authority, Maya approvers | Commands disabled |
| Prompt cache/model | Approve dedicated `cash_application` namespace/key version and already-pinned model settings | Cash agent blocked |
| Maya cache migration | Approve worklist v2/detail v4 rollout, scoped invalidation and authorized retirement/purge of v1/v3 rows | Live-origin exposure disabled |
| Worker runtime | Approve construction flag, pre-claim config validation, in-process `recoup-api` poller lifecycle, governed tick, database lease, graceful shutdown and updated local-run warning | Worker factory not invoked; zero claim RPCs |
| NFR/SLO | Ratify >=95% `eligible_reference_stp_rate`; separately approve any live-canary denominator, exclusions, window/minimum sample and remaining freshness, latency, RPO/RTO and support targets | No production or customer-facing effectiveness claim |
| Target | Branch/SHA, deployment source, release owner and branch-visible BRD/SDD/TDD | No implementation/release |

## 29. Requirement-to-design-to-test traceability

| Requirement family | Primary design sections | Proposed verification |
|---|---|---|
| FR-ING-01..11 | 7-9, 20, 24 | Inbound, signature, attachment, atomicity and privacy tests |
| FR-CA-01..13 | 4-6, 10-12 | Type, receipt, matching, allocation, reason, case and isolation tests |
| FR-FOR-01..10 | 11-12, 18 | Scoped live Forensics, evidence, freshness, negative-evidence and draft tests |
| FR-MAYA-01..06 | 17-18 | Read-model, provenance, HITL, modification and execution-reference tests |
| FR-OPS-01..10 | 14-16 | Roster/run/activity/SSE/provenance E2E |
| FR-DAT-01..12 | 6-7, 13, 18, 25 | Schema, events, projection, audit, object and replay tests |
| BR-CA | 4-6, 10-11 | Deterministic cash policy and fail-closed matrix |
| BR-FOR | 11-12, 18 | Evidence/formula/negative evidence/route guards |
| BR-ACT | 17-18 | Draft-only, SoD and modification revalidation |
| BR-OPS/AUD | 13-16, 18, 21 | Event-derived state, provenance and audit-chain tests |
| NFR-01..14 | 19-27 | Security, durability, determinism, observability, performance, effectiveness, recovery and release gates |

The BRD contains the row-level 94-requirement traceability matrix. Implementation plans must cite the exact BRD IDs covered by each test/commit.

## 30. Senior engineering critique checklist

Before implementation approval, reviewers must answer:

- Does any path treat email/remittance as settlement proof?
- Can any model value become money, reason, status, verdict or state?
- Can a duplicate/retry create two runs, allocations, cases or handoffs?
- Can a crash leave accepted work without a recoverable command?
- Can a receipt miss remain waiting without a durable due command, maximum wait or visible terminal route?
- Can SSE/browser state diverge from durable state?
- Can live cases alter S1-S8 or existing work-item contracts?
- Can missing cash configuration make the existing six-phase run-control row or protected routes fail?
- Can a Maya worklist v1 or work-item v3 cache entry satisfy the new live-origin shape or hide a newly Maya-ready case?
- Can any cockpit component parse, round or calculate a monetary value?
- Can an agent, UI or service bypass HITL or SoD?
- Can any module construct an ERP write client?
- Are source failures and negative evidence distinguishable?
- Are all policy constants owner-approved and versioned?
- Are attachment and prompt-injection boundaries explicit?
- Can the feature be disabled and rolled back without data loss?
- Are migrations additive and grants least-privilege?
- Does the migration explicitly widen the existing `recoup_config.key` CHECK before inserting `cash_run_control`, with old rows/grants/RLS preserved?
- Do fresh and migrated databases converge on explicit constraint name `recoup_config_key_check`?
- Does a disabled flag prevent worker construction, and does missing/invalid config cause zero claim calls and zero command mutations?
- Can due-time polling progress an SAP receipt wait without any push signal?
- Can agent narration fail without blocking deterministic allocation, case creation or handoff?
- Are scanner health, CSV reason-code mapping and SAP settlement mapping all proven before AC-01?
- Does `eligible_reference_stp_rate` fail if fewer than 95% of the versioned fixture corpus progresses without human intervention, and is it prevented from being labelled live effectiveness?
- Do evals measure the capability and regressions rather than only happy paths?
- Does every visible UI value resolve to backend provenance?

Any “no”, unknown, or indirect answer blocks implementation.

## 31. Definition of Technical Design complete

This Technical Design is ready for implementation planning only when:

1. It is approved together with the SDD addendum.
2. Proposed architecture decisions and owner blockers are resolved.
3. All three governing documents are committed together and all proposed files are reconciled against the chosen target branch immediately before coding.
4. Schema, API, state and event contracts have no unresolved field or enum ambiguity.
5. Test mappings cover happy, failure, security, receipt re-drive, retry, recovery, cache migration, every pinned contract and regression path.
6. Existing-solution protection, feature flags, canary and rollback are accepted by Engineering and Operations.
7. No contradiction remains with `INVARIANTS.md`, `RECONCILIATION_LEDGER.md` or the locked S1-S8 data.
8. No code, schema or production change starts before Phase 0 evidence is captured.
9. Existing six-phase run control remains backward-compatible, SA-CA-01..08 are mandatory release gates, and Maya money remains backend-formatted.
10. The explicit-name `recoup_config` CHECK transition, seventh prompt-cache contract, dual Maya cache versions, construction/pre-claim-gated SAP due-time worker and non-blocking narration failure path have explicit tests.
11. The >=95% `eligible_reference_stp_rate` fixture-corpus gate and its pre-declared denominator are approved and release-blocking; any live-effectiveness claim uses a separately approved real-sender measurement contract.
12. The Phase 0 evidence register is complete, and N5 closure is backed by the Phase 7A code/tests and database no-mutation proof rather than documentation alone.

## Appendix A. Requirement-by-requirement implementation mapping

This appendix is the implementation index. A future implementation plan must replace proposed filenames only when the target branch proves a different existing seam, and must preserve the same requirement coverage.

### A.1 Inbound requirements

| Requirement | Primary design/file | Verification |
|---|---|---|
| FR-ING-01 | Section 9; provider adapter; `remittanceIntake.ts` | Signed endpoint/authentication integration test |
| FR-ING-02 | Sections 8-9; provider and attachment policy | Recipient/sender/size/MIME allowlist negative tests |
| FR-ING-03 | Sections 5.4, 7.2, 9; atomic intake RPC | Duplicate provider/message/content idempotency tests |
| FR-ING-04 | Sections 4.2, 8, 21; canonical envelope/log policy | PII minimization and no-raw-content tests |
| FR-ING-05 | Sections 4.4, 8-9; `remittanceMapper.ts` | Supported-format and fail-closed mapping tests |
| FR-ING-06 | Sections 7.3, 9; `recoup_accept_cash_remittance` | Injected-failure atomicity/outbox tests |
| FR-ING-07 | Sections 8.3, 9.3, 20 | Fetch/storage failure creates no accepted remittance/case |
| FR-ING-08 | Sections 8, 19, 24 | Retention/access/redaction configuration tests |
| FR-ING-09 | Sections 8, 24; `attachmentSecurity.ts` | Content sniff/malware/archive/macro quarantine tests |
| FR-ING-10 | Sections 7.2, 8; staged-object boundary | Partial-upload rollback and cleanup tests |
| FR-ING-11 | Section 9; provider adapter | Timestamp/nonce/replay-window tests |

### A.2 Cash Application requirements

| Requirement | Primary design/file | Verification |
|---|---|---|
| FR-CA-01 | Sections 4.4, 6, 11; SourcePort/adapters | Port-purity and canonical-remittance tests |
| FR-CA-02 | Sections 4.5, 10; `cashReceipt.ts` | Settled status/reference/entity/currency/freshness tests |
| FR-CA-03 | Sections 5.1, 10; invoice source adapter | Candidate/freshness/unique-match tests |
| FR-CA-04 | Sections 5.1-5.2, 19; allocation policy | Cardinality/order/discount/credit/rounding/overpay/FX table tests |
| FR-CA-05 | Sections 4.1, 5.2; boundary converter + `allocate.ts` | MoneyString validation, one `money()` parse point, governed formatting and no number/UI/model arithmetic tests |
| FR-CA-06 | Sections 4.6, 5.2 | Exact remittance/receipt/invoice reconciliation tests |
| FR-CA-07 | Sections 4.6, 5.2 | Short-pay receipt contains cited inputs and versions |
| FR-CA-08 | Sections 4.7, 5.3; `reason.ts` | Claimed/validated reason separation tests |
| FR-CA-09 | Sections 4.8, 5.4, 13 | DEP-only unique case/handoff tests |
| FR-CA-10 | Sections 5.2, 11.3 | Full payment completes without case/Forensics |
| FR-CA-11 | Sections 5, 13, 20 | Ambiguity/mismatch failure-matrix tests |
| FR-CA-12 | Sections 16-17 | UI/API wording and no-ERP-mutation tests |
| FR-CA-13 | Sections 4.8, 22.3, 25.3 | S1-S8 schema/gold parity regression |

### A.3 Forensics and Maya requirements

| Requirement | Primary design/file | Verification |
|---|---|---|
| FR-FOR-01 | Sections 6.4, 11.4, 12.3 | Scoped once-only Forensics handoff test |
| FR-FOR-02 | Section 11.4; existing source/evidence services | Live DEP evidence-pack retrieval tests |
| FR-FOR-03 | Section 11.4; existing reconciliation core | Deterministic valid/invalid/partial formula tests |
| FR-FOR-04 | Sections 12.2-12.4, 18 | Evidence/explainability decision guard tests |
| FR-FOR-05 | Sections 11.4, 18 | Recovery amount-clamp tests |
| FR-FOR-06 | Sections 11.4, 18 | Valid/invalid/partial draft-routing tests |
| FR-FOR-07 | Sections 18, 25.3 | Draft-only/no-write-capable-ERP tests |
| FR-FOR-08 | Sections 4.5, 10, 11.4 | Evidence effective-time/freshness tests |
| FR-FOR-09 | Sections 11.4, 20 | Fresh scoped zero-result receipt versus source-failure tests |
| FR-FOR-10 | Sections 11.4, 18 | Cited root-cause/prevention draft-only tests |
| FR-MAYA-01 | Sections 13, 17 | Scoped Maya-ready projection, v4 cache-key/v3-rejection and invalidation E2E |
| FR-MAYA-02 | Sections 14.3, 17.2 | Complete upstream provenance API/UI contract tests |
| FR-MAYA-03 | Section 18 | Eligible-human/SoD/terminal-version tests |
| FR-MAYA-04 | Sections 18.2, 18.3 | Modified proposal revalidation/version tests |
| FR-MAYA-05 | Sections 18.3, 25.3 | Read-model-only external reference and no-ERP tests |
| FR-MAYA-06 | Section 17.3 | Deterministic queue-priority/no-hidden-case tests after policy approval |

### A.4 Agent Operations requirements

| Requirement | Primary design/file | Verification |
|---|---|---|
| FR-OPS-01 | Sections 14.1, 16 | Server-backed roster and all-idle baseline E2E |
| FR-OPS-02 | Sections 13.2, 14.1, 16.4 | Concurrent run/active-count tests |
| FR-OPS-03 | Sections 6.2, 13, 16 | Event-derived presentation-state tests |
| FR-OPS-04 | Sections 6.2, 14.3, 16 | Activity-ledger field/provenance tests |
| FR-OPS-05 | Sections 6.4, 12.3, 16 | Handoff edge activates only after durable event |
| FR-OPS-06 | Sections 14.3, 16 | Safe run-detail dossier API/UI tests |
| FR-OPS-07 | Section 15 | Cursor ordering/reconnect/replay tests |
| FR-OPS-08 | Sections 14, 19 | Authorized rehearsal creates new labelled audited trigger |
| FR-OPS-09 | Sections 6.2, 16.3, 20-21 | No chain-of-thought/secret/free-text UI tests |
| FR-OPS-10 | Sections 14-17 | Backend-formatted money/provenance contract plus unchanged cockpit-no-business-logic test |

### A.5 Data, event and audit requirements

| Requirement | Primary design/file | Verification |
|---|---|---|
| FR-DAT-01 | Sections 7.1-7.2; additive schema | Canonical live authority and old-table isolation tests |
| FR-DAT-02 | Sections 4.8, 7.2, 11.4 | Live evidence/claim provenance materialization tests |
| FR-DAT-03 | Sections 6.2, 7.2-7.3, 13.2 | Append-only event and deterministic projection rebuild tests |
| FR-DAT-04 | Section 18.3; existing audit trail | Material event hash-chain completeness tests |
| FR-DAT-05 | Sections 6.3, 7.3, 9, 11 | Atomic intake plus delayed receipt-resume/lease/idempotency tests |
| FR-DAT-06 | Sections 13.2, 15, 17 | Browser-independent state, rebuild and Maya worklist-v2/detail-v4 tests |
| FR-DAT-07 | Sections 4.5, 10, 14-17 | Freshness/provenance/no-synthetic-fallback tests |
| FR-DAT-08 | Sections 3.4, 19, 25, 28 | Old six-phase row parses/counts six; missing optional cash config blocks cash only |
| FR-DAT-09 | Sections 7.2, 8 | Staging/commit/quarantine/cleanup tests |
| FR-DAT-10 | Sections 5.4, 6.2-6.3 | Command/event/cursor identity and replay tests |
| FR-DAT-11 | Sections 6.3, 7.3, 11.2, 14 | Receipt maximum-wait/attempt and processing retry exhaustion/dead-letter tests |
| FR-DAT-12 | Sections 17-18, 25.3 | Verified execution reference stored only in Recoup read model |

### A.6 Business rules

| Requirement | Primary design/file | Verification |
|---|---|---|
| BR-CA-01 | Sections 5.4, 7.3, 9 | One inbox/run/remittance per authenticated command |
| BR-CA-02 | Sections 4.5, 10 | Receipt-required invariant-style test |
| BR-CA-03 | Sections 4.1, 5.2, 12.4, 17 | No model/UI monetary operand; one parse/format boundary test |
| BR-CA-04 | Sections 5.1-5.2, 19 | Approved allocation-policy matrix tests |
| BR-CA-05 | Sections 4.7, 5.3 | Claimed/validated reason contract tests |
| BR-CA-06 | Sections 4.8, 5.4 | Non-zero balanced DEP-only case test |
| BR-CA-07 | Sections 13, 20 | Fail-closed input/source matrix |
| BR-CA-08 | Sections 17-18, 25.3 | Internal-allocation wording and no-ERP tests |
| BR-FOR-01 | Section 11.4; existing core | Deposit formula/config provenance tests |
| BR-FOR-02 | Section 11.4 | Valid plus invalid equals claim reconciliation test |
| BR-FOR-03 | Sections 11.4, 18 | Evidence-pack before invalid/partial/recovery test |
| BR-FOR-04 | Sections 11.4, 20 | Verified negative-evidence test |
| BR-ACT-01 | Section 18 | Draft-only and eligible-human approval tests |
| BR-ACT-02 | Sections 18, 25.3 | No ERP write client/static dependency test |
| BR-ACT-03 | Section 18.2 | Human modification creates guarded new version |
| BR-OPS-01 | Sections 13-17 | Displayed state reducible from events and backend-formatted money test |
| BR-OPS-02 | Sections 14-17, 19 | Synthetic/replay persistence/API/UI label test |
| BR-AUD-01 | Sections 18.3, 21 | Material transition receipt completeness/chain test |

### A.7 Non-functional requirements

| Requirement | Primary design/file | Verification |
|---|---|---|
| NFR-01 | Sections 8-10, 20, 24 | Security/auth/PII/RBAC/tool-boundary suite |
| NFR-02 | Sections 6-7, 11, 15 | Persist-before-stream/crash/delayed-redrive/retry tests |
| NFR-03 | Sections 4-6, 13.2 | Same-input deterministic result/ID/reducer and Decimal boundary tests |
| NFR-04 | Section 21 | Correlation/log/span propagation tests |
| NFR-05 | Sections 19, 21, 28 | Owner-target acknowledgement/latency/reconnect performance tests |
| NFR-06 | Sections 6.3, 11.2, 19 | Configured concurrency/backpressure/load tests |
| NFR-07 | Sections 16-17, 23 | Keyboard/semantic-table/focus/status accessibility tests |
| NFR-08 | Sections 8, 20-21, 24 | Raw-content access/retention/redaction tests |
| NFR-09 | Sections 14-17 | Source/read-model provenance, backend display and worklist-v2/detail-v4 UI/API tests |
| NFR-10 | Sections 3.4, 22-27 | Full verify, seven pinned-contract suites, SA-CA gates, E2E and visual audit |
| NFR-11 | Sections 4.5, 10, 19, 28 | Per-source freshness boundary tests |
| NFR-12 | Sections 6-7, 25-27 | Restore/rebuild/RPO/RTO exercise after owner targets |
| NFR-13 | Sections 5.4, 6.2-6.3, 15 | Command/event/cursor replay identity tests |
| NFR-14 | Sections 1, 17, 21-23, 26-28 | Auditable fixture-corpus denominator and release-blocking `eligible_reference_stp_rate` >=95%; live-effectiveness labels require separately governed `eligible_live_stp_rate` evidence |

---

**End of document - RECOUP-TDD-CASHAPP-001 v0.9.4**
