# Maya Agentic AI Remediation Plan

Date: 2026-07-04

Purpose: close gaps found in `docs/audits/maya-agentic-ai-capability-audit-2026-07-04.md` without weakening Recoup invariants.

No code changes were made as part of the audit. This document is a remediation plan only.

## Remediation Priorities

| Priority | Gap | Why it matters |
| --- | --- | --- |
| P0 | No event-driven new-case ingestion/classification proof | Judges will ask whether a new SAP/Supabase entry appears automatically. Current answer is not strong enough. |
| P0 | Direct SAP new-case path not wired into Maya worklist source | SAP OData exists, but Maya worklist is Supabase settlement/claim/receipt/evidence driven. |
| P0 | S1-S8 hard binding | Arbitrary new scenarios such as `S9-L1` fail validation today. |
| P1 | Memory recall disabled by default and advisory-only | This is safe, but the judge story must be precise or the feature will sound weaker than expected. |
| P1 | No current production proof for dirty branch | Existing production QA is historical and should not be reused as current evidence. |
| P1 | Vector/RAG coverage not proven for all 20 lines | Judges may expect full evidence corpus coverage, not representative fixtures. |
| P2 | Runtime/MCP health story could be clearer | Private loopback MCP is useful, but visible proof should be explicit in judge demos. |

## P0-1: Add Governed Source Delta Ingestion

Goal: prove that a new SAP or Supabase entry enters a governed ingestion lane before Maya classification.

Recommended design:

- Add a read-only source delta service that polls or receives events from approved sources.
- Normalize new candidate records into an inbound table such as `recoup_inbound_deduction_events`.
- Validate that every candidate has required customer, claim, invoice/remittance, evidence, and deterministic basis inputs.
- Promote only complete candidates into the canonical claim/receipt/evidence contract.
- Quarantine incomplete candidates with source gaps instead of blocking the whole worklist.
- Never let the LLM create missing rule inputs, evidence IDs, amounts, thresholds, or receipts.

Owner input required:

- Source mapping from SAP sandbox fields to Recoup claim fields.
- Which Supabase table is authoritative for new work items.
- Whether a "candidate case" can appear in UI before it has a reconciliation receipt.
- Human-approved status names for quarantine, ready, rejected, and promoted states.

Acceptance tests:

- Insert one complete new candidate and verify it appears in Maya worklist after ingestion.
- Insert one incomplete candidate and verify it is quarantined with source gaps.
- Insert one SAP-only candidate and verify no classification is emitted until normalized evidence and receipt are present.
- Verify no ERP write-back or external action occurs.

## P0-2: Add Event Or Worker Trigger

Goal: convert "read/refresh recomputes" into a demonstrable "new data triggers classification workflow".

Recommended design:

- Add one approved trigger path:
  - Supabase change trigger to job table, or
  - scheduled poller, or
  - explicit `/forensics/ingest/refresh` admin route, or
  - provider webhook if approved.
- Worker loads new candidate rows, validates source completeness, runs deterministic forensics, publishes read model, and records audit/memory receipts.
- UI listens to existing `/forensics/events` or polls read-model hash to update worklist.

Do not do:

- Do not use the LLM as the source-of-truth classifier.
- Do not classify incomplete records as valid/invalid.
- Do not auto-dispatch recovery, billing, email, hold, or ERP actions.

Acceptance tests:

- New complete row causes read-model hash change and new worklist row.
- New incomplete row causes no verdict and displays source-gap/quarantine.
- Duplicate event is idempotent.
- Worker crash leaves a retryable audit state.

## P0-3: Generalize Beyond S1-S8

Goal: allow future cases without hard-coded S1-S8 assumptions.

Current blocker:

- `src/adapters/supabaseSyntheticSource.ts` parses `scenarioIdFromLineId(...)` with only S1-S8.
- `docs/supabase-memory-schema.sql` has a seed-era `recoup_deduction_lines.scenario_id` check limited to S1-S8.
- `tests/e2e/maya-real-backend-e2e.ts` intentionally asserts exactly S1-S8/20 lines.

Recommended design:

- Introduce an owner-approved scenario catalog table/config.
- Keep the 8 canonical judge cases as gold-set fixtures, but separate "gold set parity" from "runtime accepts new governed cases".
- Replace hard-coded scenario parsing with validated scenario metadata from source rows.
- Add a new-case test that uses a non-gold scenario without changing S1-S8 eval parity.

Owner input required:

- Scenario ID format.
- Which rule IDs are allowed for new scenarios.
- Whether new scenarios need explicit gold labels before appearing in Maya.

Acceptance tests:

- S1-S8 still total 20 lines for gold-set parity.
- A non-gold governed scenario can appear as runtime worklist data.
- A non-approved scenario fails closed with a source-gap reason.

## P0-4: Make "New Case Classification" A Named Service

Goal: make the judge story crisp: source change -> classifier service -> read model -> UI.

Recommended design:

- Add a service such as `classifyForensicsWorkItem(...)`.
- Inputs: complete source snapshot, evidence receipt, governed config.
- Outputs: verdict, routing, recommended action, citations, deterministic basis, pending human action.
- Persist result as read-model/audit record, not as model prose.
- Agents can narrate and hand off, but the service owns classification.

Acceptance tests:

- Valid, invalid, partial cases classify deterministically from receipts.
- Missing evidence blocks decision.
- New case never bypasses `decisions.deductionVerdict` and evidence-pack guardrails.

## P1-1: Decide And Document Memory Semantics

Current safe behavior:

- Memory recall is advisory-only.
- Recall is gated by `RECOUP_MAYA_QUERY_MEMORY_RECALL=enabled`.
- Recall does not replace selected source evidence or tools.

Recommended judge-ready statement:

"On repeat login, Maya recalls the prior case context as trusted memory, but still verifies current selected source evidence before answering. If source hashes are unchanged, memory can accelerate the prompt context; if source hashes changed or are missing, Recoup re-reads tools and fails closed."

Optional product upgrade:

- Add evidence-hash validated memory cache.
- Permit a memory-first answer only when:
  - selected line ID matches,
  - source hash matches,
  - evidence record IDs match,
  - memory record is trusted,
  - no approval/action state is being inferred.
- Otherwise force tool/source re-read.

Acceptance tests:

- Same case, same source hash: recall appears in model input and UI trace.
- Same case, changed source hash: recall is marked stale and tools re-read.
- Forged recall: ignored.
- Memory unavailable: query still works without pretending recall exists.

## P1-2: Refresh Production Evidence

Goal: avoid presenting historical QA as current.

Required before judging:

```powershell
npm.cmd run verify
npm.cmd run test:e2e:maya-real
npm.cmd run test:e2e:maya-approval-lifecycle
npm.cmd exec tsx scripts/runMayaProdQa.ts
```

Also capture:

- Current branch and SHA.
- Vercel deployment ID and public alias.
- Render service/deploy status.
- Supabase read-model/source-health timestamps.
- Redacted memory proof for one repeat query.
- Redacted MCP query.answer proof.

Acceptance standard:

- Current branch/SHA equals tested branch/SHA.
- Production smoke proves the current deployment, not an older commit.
- Screenshots/API artifacts are stored under `docs/audit/` or `output/playwright/`.

## P1-3: Complete Vector/RAG Corpus Coverage

Goal: avoid the impression that "RAG is wired" means all 20 lines have vector evidence.

Recommended design:

- Provision vector-store documents for all 20 canonical lines or explicitly mark vector search as representative/demo-only.
- Enforce metadata fields: source table, record ID, customer ID, scenario type, provenance.
- Keep vector evidence additive. It must never replace deterministic evidence receipts.

Acceptance tests:

- Every S1-L1 through S8-L2 has at least one indexed evidence object or an explicit no-vector-needed reason.
- Malformed vector metadata fails closed.
- Query answers cite deterministic source records even when vector evidence is present.

## P2-1: Make MCP Runtime State Judge-Visible

Goal: show that Maya is using governed tools, not just static text.

Recommended design:

- Add or expose a sanitized runtime panel with:
  - MCP transport mode,
  - allowed tools,
  - last `query.answer` source-read status,
  - auth configured true/false,
  - no secrets.
- Include trace row for selected-evidence MCP call.

Acceptance tests:

- UI shows `query.answer` read-only selected-evidence proof after a successful query.
- UI shows blocked state when MCP is unavailable.
- No token, service-role key, API key, auth header, or secret appears in UI/log/doc artifacts.

## P2-2: Improve Quarantine UX

Goal: if new data is incomplete, Maya should not look broken.

Recommended design:

- Show "candidate case - source gaps" separately from classified work items.
- Include missing source categories and next human-safe remediation step.
- Never show a valid/invalid verdict until deterministic receipt/evidence requirements are met.

Acceptance tests:

- Missing evidence candidate appears as source-gap only.
- User cannot approve/send/recover a source-gap candidate.
- Copilot explains the source gap without inventing a verdict.

## Suggested Demo Narrative After Remediation

1. Add a new governed source event.
2. Ingestion validates or quarantines it.
3. Deterministic classifier computes verdict/routing only if evidence and receipts are complete.
4. Maya worklist updates from backend/read-model data.
5. Recoup Copilot answers with cited records using MCP `query.answer`.
6. Repeat login recalls prior case context but verifies current source hash before answering.
7. Human approval remains required for every external action.

## Definition Of Done For The Remediation

- New complete Supabase candidate appears in Maya without manual code changes.
- New SAP candidate enters source-delta ingestion or quarantine with proof.
- New non-S1-S8 runtime scenario is supported only through owner-approved metadata.
- Repeat-login memory is either explicitly advisory or evidence-hash validated.
- `npm.cmd run verify` is green.
- `npm.cmd run test:e2e:maya-real` is green.
- Production smoke is current, with deployment/commit proof.
- No secrets or customer-sensitive payloads are exposed in docs/logs/screenshots.
