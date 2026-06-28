# Maya Journey RAG and Memory Test Cases

Date: 2026-06-28

Scope: Maya Deduction Forensics journey, governed RAG vector evidence, governed short-term query memory, query chat, approval lifecycle, audit receipt, and production smoke.

Governance rules: code computes every dollar; every decision keeps cited record IDs plus deterministic basis; every external action remains human-gated; unknown or unsafe inputs fail closed; no ERP writeback.

## Automated Local Gates

| Gate | Command | Pass criteria |
| --- | --- | --- |
| Memory unit/invariant slice | `npm.cmd run test -- tests/unit/memory.test.ts tests/unit/cockpit-api.test.ts tests/invariants/memory-contract.test.ts` | Maya query-scope memory is cited, scoped to session, free of question text/dollars/verdict/routing/approval fields, and unsafe record IDs do not persist memory. |
| UI contract slice | `npm.cmd run test -- tests/invariants/maya-shadcn-qa-contract.test.ts tests/invariants/maya-shadcn-boundary.test.ts tests/invariants/cockpit-no-business-logic.test.ts` | Recoup Agent floats bottom-left, query chat styling is present, Case Concentration Analysis title is stronger, and UI remains backend/read-model sourced. |
| Maya 12-beat browser journey | `npm.cmd run test:e2e -- --maya-shadcn-only` | Beat 1 through Beat 12 pass: login, dashboard, recommended action, case overview, evidence dossier, query start, agent trace, cited answer, draft review, human approval, audit confirmation, return worklist. |
| Real-backend Maya query | `npm.cmd run test:e2e:maya-real` | Browser reaches real backend `/forensics/query`; cited answers include record IDs, deterministic basis, and backend trace rows without Playwright response fulfillment. |
| Full repo gate | `npm.cmd run verify` | Lint, typecheck, all Vitest files, dependency-cruiser, and release readiness pass. |

## RAG Vector Evidence Cases

| Case | Setup | Steps | Expected result |
| --- | --- | --- | --- |
| Vector metadata contract | No live OpenAI call required; use unit tests. | Run `npm.cmd run test -- tests/unit/enterprise-connectors.test.ts`. | `src/adapters/openAiVectorStore.ts` accepts only bounded results with `source_table`, `record_id`, `customer_id`, `scenario_type`, and `provenance: synthetic`; unrelated customer/scenario hits are filtered; malformed/non-2xx responses fail closed. |
| Injected RAG evidence seam | No env-driven live read in default forensics path. | Run `npm.cmd run test -- tests/unit/forensics.test.ts tests/invariants/deduction-evidence-pack.test.ts`. | `runForensicsInvestigationWithEvidenceSources(...)` can attach document evidence additively while the default deterministic run still uses the normal sync retrieval path. Decisions remain deterministic and cited. |
| Runtime readiness | Configure only presence of `OPENAI_API_KEY` and `OPENAI_EVIDENCE_VECTOR_STORE_ID`; never expose values in logs. | Run `npm.cmd run test -- tests/invariants/runtime-config.test.ts`. | Readiness reports OpenAI evidence vector-store search as configured or fail-closed with missing-variable reason; no embedding model or secret value is exposed. |
| Provisioned vector store | Requires owner-approved OpenAI credentials in local env. | Run `npm.cmd run provision:openai-evidence-vector-store`. | The script creates or reuses an evidence vector store and writes only `OPENAI_EVIDENCE_VECTOR_STORE_ID` to `.env.local`; verify no secret value is printed or committed. |

## Governed Memory Cases

| Case | Steps | Expected result |
| --- | --- | --- |
| Successful query memory | POST `/forensics/query` with safe `x-recoup-session-id`, `selectedLineId`, and safe cited record IDs. | After the query response is produced, a `session_state` record with id `session:<sessionId>:maya-query-scope` is persisted when durable memory is configured. Payload contains `memoryType: maya_short_term_query_scope`, `deterministicBasis`, `status`, `selectedLineId`, and selected record IDs only. |
| Blocked query memory | Force a guarded query response with no answer but safe record IDs. | Memory status is `blocked`; no token receipt is written if the query did not return token usage; query response itself still returns fail-closed output. |
| Unsafe record IDs | Include an unsafe submitted ID such as a secret-like token. | Query still returns; memory persistence is skipped; no partial unsafe memory record is written. |
| Memory unavailable | Run without `RECOUP_MEMORY_BACKEND=supabase` and without `RECOUP_MEMORY_DB_PATH`. | Query path still works; memory write is skipped. Memory is additive and cannot block the answer path. |
| Memory does not drive decisions | Inspect `tests/invariants/core-no-memory-input.test.ts` and run `npm.cmd run verify`. | Core rules and dollar/decision computation remain independent from runtime memory stores. |

## Manual Maya Journey

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Open deployed or local cockpit login. | Maya can sign in; unauthorized `/forensics` access redirects to `/login`. |
| 2 | Navigate to Maya Deduction Forensics. | Worklist and source readiness load from backend/read models; source gaps show fail-closed state, not mock success. |
| 3 | Review Case Concentration Analysis. | Section title is darker/larger than table text; table values remain backend/read-model labels. |
| 4 | Select a case row and open overview. | Case overview shows cited record IDs, deterministic basis, and readonly amount fields sourced from backend. |
| 5 | Open the floating Recoup Agent from bottom-left. | Query drawer opens with selected evidence packet, selected line, readiness preview, and cited source details. |
| 6 | Ask a case-scoped question. | Submitted question appears only in UI conversation context; backend response includes cited record IDs and deterministic basis. |
| 7 | Confirm trace. | Agent Trace shows Forensics and Recovery handoff/status rows; detailed technical proof remains in trace/source disclosures. |
| 8 | Review cited answer. | Answer cites exact record IDs and does not invent dollar figures or unsupported verdicts. |
| 9 | Open recovery draft review. | Draft remains readonly for computed money and evidence; external action controls are human approval-gated. |
| 10 | Approve or reject through the human gate. | Approval lifecycle records verified human principal and audit/memory receipt; no ERP writeback occurs. |
| 11 | View audit confirmation. | Receipt shows action ID, approver, decision, record IDs, status, and audit hash. |
| 12 | Return to worklist. | Worklist remains sourced from backend/read model and does not show stale local-only state as truth. |

## Production Smoke

Run after commit, push, and provider deployment read-back.

| Smoke | Expected result |
| --- | --- |
| Frontend route | Deployed Maya login and `/forensics/shadcn` load. |
| Backend health | Production API health/readiness returns 2xx or explicit fail-closed source state. |
| Work item detail | `/forensics/work-items/:lineId` returns cited backend/read-model evidence. |
| Query | `/forensics/query` returns deterministic cited output or guarded fail-closed output; no uncited answer. |
| RAG readiness | Vector-store readiness reports configured/missing without exposing secrets; if live vector retrieval is exercised, only metadata-cited synthetic hits are accepted. |
| Memory visibility | Query-scope memory is present in `/memory` or Supabase memory only when durable memory is configured; payload excludes question text, PII, dollars, verdicts, routing, and approvals. |
| Approval lifecycle | Human approval route records audit receipt and memory receipt; no external action dispatch or ERP mutation occurs. |

## Evidence To Capture

- Command output for `npm.cmd run verify`.
- Command output for `npm.cmd run test:e2e -- --maya-shadcn-only`.
- Command output for `npm.cmd run test:e2e:maya-real`.
- Production URLs, deployment IDs, tracked branch, live commit SHA when exposed, and smoke results.
- A redacted memory record sample showing record IDs and deterministic basis only.
- A redacted RAG/vector readiness sample showing configured/missing state only.
