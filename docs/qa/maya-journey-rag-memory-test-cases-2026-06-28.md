# Maya End-to-End QA Matrix - RAG, Memory, HITL, Reroute

Date: 2026-06-28

Current production commit checked during this rollout: `47708f26da43ee92633ae7eaf208900bb9ce9b47`

Scope: Maya Deduction Forensics journey across the canonical 8 business cases and 20 deduction line items, including source readiness, RAG/vector evidence readiness, query chat, short-term memory, long-term governed recall, Forensics-to-Recovery handoff, billing/recovery reroute, HITL approval gates, audit receipts, and production smoke.

Governance rules: code computes every dollar; every decision keeps cited record IDs plus deterministic basis; every external action remains human-gated; unknown or unsafe inputs fail closed; no ERP writeback.

## Historical Scope Note

This 2026-06-28 production smoke is historical. It proves the Maya query and journey state for commit `47708f26da43ee92633ae7eaf208900bb9ce9b47`, but it does not prove the 2026-07-01 real-evidence cutover. The current cutover requires `npm.cmd run check:real-evidence-proof` after approved preview/post screenshots show visible `EVD-POD-S3-L1`, visible `RECON-S3-L1`, visible content hash/provenance, and loaded POD PDF/image/media proof.

## Evidence Sources

| Evidence | File or command | What it proves |
| --- | --- | --- |
| 8 cases / 20 line items | `docs/supabase-memory-schema.sql` rows `S1-L1` through `S8-L2` | Canonical Maya dataset covers 8 scenarios and 20 source line records. |
| 20-line browser sweep | `tests/e2e/maya-real-backend-e2e.ts` | Real-backend E2E asserts S1-S8 worklist coverage and opens every canonical line detail. |
| Production 8-query journey | `scripts/runMayaProdQa.ts` | Browser login, source readiness, query dock, 8 live Maya queries, HITL gate visibility, Render health, and API route status. |
| Latest prod run artifact | `output/playwright/prod-qa/maya-prod-qa-results.json` | Commit `47708f26...`, 8/8 prod queries passed, connector status 200, Render health 200, 0 console errors. |
| 2026-07-01 real-evidence proof | `npm.cmd run check:real-evidence-proof` | Current cutover gate; blocks until preview/post route screenshots, visual diff, `EVD-POD-S3-L1`, `RECON-S3-L1`, hash/provenance, and loaded POD media are proven. |
| Memory tests | `tests/unit/memory.test.ts`, `tests/unit/cockpit-api.test.ts`, `tests/invariants/memory-contract.test.ts` | Short-term query scope and long-term governed recall are scoped, cited, safe, env-gated, and advisory-only. |
| RAG/vector tests | `tests/unit/enterprise-connectors.test.ts`, `tests/unit/forensics.test.ts`, `tests/invariants/deduction-evidence-pack.test.ts`, `tests/invariants/runtime-config.test.ts` | Vector metadata/readiness and additive evidence seams fail closed and do not replace deterministic source evidence. |

Scope note: the production browser run exercises 8 query intents against the selected production work item. The S1-S8 / 20-line breadth is covered by the local real-backend browser sweep.

## Automated Local Gates

| Gate | Command | Pass criteria |
| --- | --- | --- |
| Memory unit/invariant slice | `npm.cmd run test -- tests/unit/memory.test.ts tests/unit/cockpit-api.test.ts tests/invariants/memory-contract.test.ts tests/invariants/runtime-config.test.ts` | Short-term and long-term Maya memory are cited, scoped, safe, env-gated, no dollars/actions/approvals are stored, forged recall fails closed. |
| UI contract slice | `npm.cmd run test -- tests/invariants/maya-shadcn-qa-contract.test.ts tests/invariants/maya-shadcn-boundary.test.ts tests/invariants/cockpit-no-business-logic.test.ts` | Recoup Agent sits on the right-side rail, query chat stays modern, Case Concentration Analysis hierarchy remains distinct, and UI remains backend/read-model sourced. |
| Maya 12-beat browser journey | `npm.cmd run test:e2e -- --maya-shadcn-only` | Beat 1 through Beat 12 pass: login, dashboard, recommended action, case overview, evidence dossier, query start, agent trace, cited answer, draft review, human approval gate, audit confirmation, return worklist. |
| Real-backend 8-case / 20-line sweep | `npm.cmd run test:e2e:maya-real` | Browser reaches real backend `/forensics`, `/connectors`, `/forensics/work-items/:lineId`, and `/forensics/query`; all canonical S1-S8 and 20 line IDs are opened and checked without Playwright response fulfillment. |
| Production Maya smoke | `npm.cmd exec tsx scripts/runMayaProdQa.ts` with prod env vars | Vercel login, Render health, connector readiness, 8 live query scenarios, HITL gate visibility, and API route statuses pass. |
| Full repo gate | `npm.cmd run verify` | Lint, typecheck, all Vitest files, dependency-cruiser, and release readiness pass. |

## Canonical 8 Cases / 20 Line Items

| Case | Line items | Customer | Source scenario | Expected classification and route | Primary cited evidence pattern | QA focus |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | `S1-L1`, `S1-L2`, `S1-L3` | Greenleaf | Damaged product, evidence received | Valid deduction, route to Billing draft | Damage photo, carrier report, invoice | Billing reroute, HITL gate, evidence citation. |
| S2 | `S2-L1`, `S2-L2` | Crestline | Valid promo billed at list | Valid deduction, route to Billing draft | TPM contract, invoice | Billing reroute and promo support proof. |
| S3 | `S3-L1`, `S3-L2`, `S3-L3`, `S3-L4` | Crestline | Shortage claim with full signed POD | Invalid deduction, recovery draft | Signed POD, invoice | Recovery handoff, shortage challenge proof. |
| S4 | `S4-L1`, `S4-L2` | Valumart | OTIF compliance fine valid per contract | Valid deduction, route to Billing draft | SLA contract, invoice | Contract-backed valid deduction path. |
| S5 | `S5-L1`, `S5-L2`, `S5-L3` | Valumart | OTIF fine contradicted by 3PL POD timestamp | Invalid deduction, recovery draft | POD timestamp, invoice | Recovery reroute with logistics proof. |
| S6 | `S6-L1`, `S6-L2` | Crestline | Pricing chargeback below contracted price | Invalid deduction, recovery draft | Price clause, invoice | Price-clause evidence and governed recall tests. |
| S7 | `S7-L1`, `S7-L2` | Harbor | Promo overclaim above approved TPM accrual | Partial deduction, recovery draft | TPM accrual, invoice | Partial recovery, no model-computed dollars. |
| S8 | `S8-L1`, `S8-L2` | Harbor | Duplicate already-credited deduction | Invalid deduction, recovery draft | Credit memo, invoice | Duplicate credit proof and source-gap question. |

For every line item above, the real-backend E2E must prove:

| Assertion | Required result |
| --- | --- |
| Worklist coverage | The scenario appears exactly once, line count matches its line IDs, and no duplicate line IDs exist. |
| Detail endpoint | `/forensics/work-items/:lineId` returns the selected line, same scenario ID, and backend-owned line IDs. |
| Evidence pack | Evidence record IDs include the selected line and at least one cited document. |
| Recommended action | Action is line-scoped and remains `pending_human`. |
| Approval state | Approval and audit states remain `pending_human` until a human approval route records a receipt. |
| Provenance | Work item, evidence pack, draft, recommended action, approval state, and audit state expose provenance/record IDs. |
| Fail-closed behavior | Missing source/provenance cannot become a successful decision claim. |
| No ERP writeback | No test may assert or require ERP mutation, billing dispatch, recovery send, hold/freeze, or external action without HITL. |

## Production 8 Query Scenarios

These are the live browser query cases in `scripts/runMayaProdQa.ts`.

These are prompt-intent scenarios, not one production query per S1-S8 case. The production artifact selected `S1-L1`; the separate real-backend E2E sweep is the required 8-case / 20-line breadth test.

| Query | Scenario | Features covered | Pass criteria |
| --- | --- | --- | --- |
| `q1-shortage-challenge-proof` | Customer says the deduction is valid; ask what proof can challenge it. | Query chat, citations, RAG/source evidence, SAP/source provenance. | HTTP 200, answer present, citations present, trace rows present, SDK tool receipt present. |
| `q2-manager-approval-brief` | Ask for a manager-ready approval brief. | HITL briefing, deterministic basis, cited evidence. | Same response checks plus no unsupported approval claim. |
| `q3-billing-vs-recovery-route` | Ask whether this is billing correction or recovery pursuit. | Reroute logic, billing/recovery path, cited proof. | Route explanation stays tied to deterministic basis and citations. |
| `q4-handoff-hitl-draft-gate` | Ask Forensics to hand off to Recovery Drafter and confirm human gate. | Agent handoff, Recovery Drafter, HITL gate. | Trace includes handoff and answer confirms draft remains human-gated. |
| `q5-valid-deduction-counterfactual` | Ask what evidence would make the deduction valid. | Counterfactual reasoning, source grounding, no invented verdict. | Answer stays within selected evidence and deterministic basis. |
| `q6-sap-call-provenance` | Ask which cited records came from SAP/source system vs documents. | SAP/source provenance, MCP/source tool receipt, citations. | SAP/source evidence signal present in trace or citations. |
| `q7-risk-if-approved` | Ask business risk if current draft is approved. | HITL boundary, approval risk, no autonomous action. | Answer cites records and keeps action inside human approval boundary. |
| `q8-source-gaps-and-next-step` | Ask if sources/citations/receipts are missing or stale and next step without ERP writeback. | Fail-closed source gaps, no ERP mutation, governance. | Answer names gaps or readiness state without writeback or dispatch. |

Latest production execution evidence from this rollout:

| Field | Result |
| --- | --- |
| Commit | `47708f26da43ee92633ae7eaf208900bb9ce9b47` |
| Production app | `https://recoup-self-eta.vercel.app` |
| Production API | `https://recoup-api.onrender.com` |
| Queries | 8 passed / 0 failed / 8 total |
| Connector route | 200 |
| Render health | 200 |
| Console errors | 0 |

Latest source-readiness tile states from the same production run:

| Source | Mode | State | Tone |
| --- | --- | --- | --- |
| SAP OData | Unavailable | Probe failed | blocked |
| TPM | Proxy - Supabase | Proxy - Supabase | synthetic |
| 3PL POD | Proxy - Supabase | Proxy - Supabase | synthetic |
| Bureau | Proxy - Supabase | Proxy - Supabase | synthetic |
| Remittance / EDI | Proxy - Supabase | Proxy - Supabase | synthetic |
| Contract Repo | Proxy - Supabase | Proxy - Supabase | synthetic |
| MCP | Read-only tools | Connected | ready |

## RAG Vector Evidence Cases

| Case | Setup | Steps | Expected result |
| --- | --- | --- | --- |
| Vector metadata contract | No live OpenAI call required; use unit tests. | Run `npm.cmd run test -- tests/unit/enterprise-connectors.test.ts`. | `src/adapters/openAiVectorStore.ts` accepts only bounded results with source table, record ID, customer/scenario metadata, and provenance; malformed/non-2xx responses fail closed. |
| Injected RAG evidence seam | No env-driven live read in the default sync forensics path. | Run `npm.cmd run test -- tests/unit/forensics.test.ts tests/invariants/deduction-evidence-pack.test.ts`. | `runForensicsInvestigationWithEvidenceSources(...)` can attach document evidence additively; default deterministic run still uses normal sync retrieval path. |
| Runtime readiness | Configure only presence of `OPENAI_API_KEY` and `OPENAI_EVIDENCE_VECTOR_STORE_ID`; never expose values. | Run `npm.cmd run test -- tests/invariants/runtime-config.test.ts`. | Readiness reports vector search as configured or missing with fail-closed reason; no secret is printed. |
| Provisioned vector store | Requires owner-approved OpenAI credentials in local env. | Run `npm.cmd run provision:openai-evidence-vector-store`. | Script creates/reuses the evidence vector store and writes only `OPENAI_EVIDENCE_VECTOR_STORE_ID` to `.env.local`; no secret is committed. The seed dossiers are representative vector fixtures for `S1-L1`, `S3-L1`, `S6-L1`, and `S8-L1`, not a full 20-line vector index. |

## Memory Cases

| Case | Steps | Expected result |
| --- | --- | --- |
| Short-term successful query memory | POST `/forensics/query` with safe `x-recoup-session-id`, `selectedLineId`, and safe cited record IDs. | A `session_state` record with id `session:<sessionId>:maya-query-scope` is persisted when durable memory is configured. |
| Short-term blocked query memory | Force a guarded response with no answer but safe record IDs. | Memory status is `blocked`; no durable long-term case recall is written. |
| Unsafe record IDs | Include unsafe submitted IDs. | Query path still returns guarded output; memory persistence skips unsafe records. |
| Memory unavailable | Run without Supabase memory and without `RECOUP_MEMORY_DB_PATH`. | Query path still works; memory write/read is skipped. |
| Long-term recall write | Answered query with safe selected line, selected record IDs, and deterministic basis. | A trusted `case_state` recall record is written with key `maya-case-recall`; payload excludes question text, answer text, dollars, routing, approval, and actions. |
| Long-term forged recall | Seed mismatched case ID, scope, status, selected line, generated ID, or record IDs. | Recall is ignored and omitted from prompt context. |
| Recall env gate disabled | Leave `RECOUP_MAYA_QUERY_MEMORY_RECALL` unset or set to `disabled`. | No recall context is injected into live query input. |
| Recall env gate enabled | Set `RECOUP_MAYA_QUERY_MEMORY_RECALL=enabled` and provide trusted case recall. | Prompt gets compact advisory recall only: memory record IDs, scopes, recalled evidence IDs, and deterministic basis. |
| Core isolation | Run `npm.cmd run verify` and inspect `tests/invariants/core-no-memory-input.test.ts`. | Core rules and dollar/decision computation remain independent from memory. |

Memory and vector payload safety are local/unit/invariant evidence, not direct production-browser assertions in `scripts/runMayaProdQa.ts`. Production QA proves the live Maya journey still works after those changes; the payload contracts stay in the focused tests above.

## Manual Maya Journey

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Open deployed or local cockpit login. | Maya can sign in; unauthorized `/forensics` access redirects to `/login`. |
| 2 | Navigate to Maya Deduction Forensics. | Worklist and source readiness load from backend/read models; source gaps show fail-closed state, not mock success. |
| 3 | Review Case Concentration Analysis. | Section title is darker/larger than table content; table values remain backend/read-model labels. |
| 4 | Confirm worklist count. | Worklist exposes 8 case groups and 20 approval/HITL line items. |
| 5 | Select each S1-S8 case group. | Case detail opens from `/api/forensics/work-items/:lineId`; no fixture/route fulfillment is used. |
| 6 | Switch line tabs within multi-line cases. | Each selected line updates overview, evidence, draft, approval, and audit state from backend detail. |
| 7 | Open the floating Recoup Agent on the right-side rail. | Query drawer opens without covering business data or bottom controls. |
| 8 | Ask one of the 8 query scenarios. | Backend response includes answer, citations, deterministic basis, and agent/source trace rows. |
| 9 | Confirm trace and evidence. | Agent Trace shows Forensics and Recovery handoff/status rows; citations include exact record IDs. |
| 10 | Review RAG/source readiness. | Vector readiness is configured or explicitly fail-closed; no uncited vector hit is accepted. |
| 11 | Review memory visibility. | Short-term scope appears only when durable memory is configured; long-term recall is advisory-only and env-gated. |
| 12 | Open recovery draft review. | Draft remains readonly for computed money and evidence; external action controls are human approval-gated. |
| 13 | Open approval dialog. | Approval buttons are visible only through the human gate; no action is auto-dispatched. |
| 14 | Approve/reject in a local approval lifecycle run. | Approval receipt records human principal, cited record IDs, and audit hash; duplicate approval fails closed. |
| 15 | Return to worklist/relogin where applicable. | Persisted approval receipt rehydrates from backend memory/audit state when present; otherwise pending state remains honest. |

## Production Smoke Steps

Run after commit, push, and provider deployment read-back:

```powershell
$env:RECOUP_QA_COMMIT=(git rev-parse HEAD).Trim()
$env:RECOUP_PROD_APP_URL='https://recoup-self-eta.vercel.app'
$env:RECOUP_PROD_API_URL='https://recoup-api.onrender.com'
$env:RECOUP_PROD_QA_QUERY_TIMEOUT_MS='120000'
npm.cmd exec tsx scripts/runMayaProdQa.ts
```

Expected production result:

| Smoke | Expected result |
| --- | --- |
| Frontend route | Deployed Maya login and `/forensics/shadcn` load. |
| Backend health | Production API `/healthz` returns 2xx. |
| Source readiness | `/api/connectors` returns 200 with source tiles. |
| Work item detail | `/api/forensics/work-items/:lineId` returns cited backend/read-model evidence. |
| Query | `/api/forensics/query` returns deterministic cited output or guarded fail-closed output; no uncited answer. |
| RAG readiness | Vector-store readiness reports configured/missing without exposing secrets. |
| Memory visibility | Memory payload excludes question text, PII, dollars, verdicts, routing, and approvals. |
| Approval lifecycle | Human approval route records receipt when exercised; no external action dispatch or ERP mutation occurs. |

## Evidence To Capture

- Command output for `npm.cmd run verify`.
- Command output for `npm.cmd run test:e2e -- --maya-shadcn-only`.
- Command output for `npm.cmd run test:e2e:maya-real`.
- Command output and JSON from `npm.cmd exec tsx scripts/runMayaProdQa.ts`.
- Production URL, Vercel deployment ID, tracked branch/commit SHA, Render health result.
- Redacted memory record sample showing record IDs and deterministic basis only.
- Redacted RAG/vector readiness sample showing configured/missing state only.
