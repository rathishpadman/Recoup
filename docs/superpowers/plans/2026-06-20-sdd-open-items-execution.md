# SDD Open Items Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every actionable Recoup SDD/open-audit item using the owner-ratified decisions in the local owner-supplied source copy `CODEX_BUILD_ANSWERS.md`, without ERP write-back, LLM-computed dollar amounts, or autonomous external actions.

**Architecture:** Keep Recoup on the deterministic evidence spine: core code computes money, service tools enforce guardrails, final outputs cite records and deterministic basis, and every external action remains HITL-gated. Expert constants and connector strategy are supplied by `CODEX_BUILD_ANSWERS.md`; implementation must read/validate/inject them rather than inventing or embedding business logic ad hoc.

**Tech Stack:** Node 22+, TypeScript, Vitest, Next.js App Router, Express, OpenAI Realtime WebRTC, Supabase/Postgres memory, SAP OData read-only adapter.

---

## Current Baseline

- Branch: `codex/guardrail-riskmesh-hardening`.
- Latest verified commit before this plan: `d3a9a2326b09d8979ee6b70a33179af846915b8c`.
- Full guard last run in this session: `npm.cmd run verify`.
- Fresh result before this plan: lint passed, typecheck passed, `55` test files passed, `257` tests passed, dependency-cruiser reported no violations.
- Existing untracked plan: `docs/superpowers/plans/2026-06-20-realtime-browser-session.md`.
- Owner-ratified answers were supplied to this session from a local source copy named `CODEX_BUILD_ANSWERS.md`; session provenance: `C:\Users\rathi\Downloads\CODEX_BUILD_ANSWERS.md`.

## Non-Negotiable Bounds

- Do not load the full SDD/BRD/Ledger unless a named section is explicitly required for a workflow.
- Use the Appendix G constants, arbitration P&L weights, R-score weights, drift thresholds, and gaming thresholds supplied in `CODEX_BUILD_ANSWERS.md`.
- Do not invent any value not supplied there or already locked in repo config.
- Do not add ERP write-back or any write-capable ERP client.
- Do not let an LLM compute or edit dollar amounts that reach findings or decisions.
- Do not dispatch external actions; every draft/proposal must remain HITL-gated.
- Use tests-first for code, guardrails, decision logic, Realtime tool surfaces, and invariants.
- Run a subagent review after each completed workflow and fix Critical/Important findings before moving on.

## Exhaustive Todo

### Workflow 1: Evidence And Demo Documentation Cleanup

- [x] Rename or shim invariant tests so file names match `INVARIANTS.md` exactly, per `CODEX_BUILD_ANSWERS.md`:
  - `tests/invariants/explainability-tripwire.test.ts`.
  - `tests/invariants/hash-chain-tamper.test.ts`.
  - `tests/invariants/action-hitl-all-capabilities.test.ts`.
- [x] Reconcile stale Risk Mesh text in `docs/architecture-review-and-recommendations.md` that still says `src/agents/riskMesh.ts` imports action tools directly.
- [x] Add a judge-facing two-persona demo section to `README.md`:
  - Maya Patel: Deduction Forensics analyst.
  - David Kim: Credit / Arbitration lead.
  - CFO Summary: read-only executive close, not a third operating persona.
- [x] Update README/docs to say expert constants are now owner-ratified Day-1 tunables, and non-SAP connector strategy is supplied for synthetic Supabase static tables with Day-1 readiness implemented in Workflow 2.
- [x] Run `npm.cmd run test -- tests/invariants/readme-contract.test.ts tests/invariants/named-guardrail-surfaces.test.ts tests/invariants/risk-mesh-service-boundary.test.ts`.
- [x] Run a spec review subagent for Workflow 1.
- [x] Run a code/docs quality review subagent for Workflow 1.
- [x] Fix all Critical/Important review findings through the Workflow 1 review follow-up.

### Workflow 2: Governed Config, Audit, And Source Foundation

- [x] Add governed config schema/config-as-code bootstrap for owner-ratified Day-1 tunables:
  - arbitration P&L weights: credit `0.35`, collections `0.25`, fulfilment `0.25`, billing `0.15`.
  - R-score weights: DSO/ADP `0.35`, dispute rate `0.25`, over-limit frequency `0.20`, aging concentration `0.20`.
  - R-drift trigger: DSO increase `>= +10 days`, risk-tier downgrade `>= 1`, or dispute-rate increase `>= +50%`, with one drift event per customer per `30` days.
  - Gaming candidate gate: at least `2` invalid shortage/pricing lines in `90` days, at least `1` promo correlation, invalid value floor `$10,000`.
- [x] Keep core pure by injecting config into `src/core/`; `src/core/` must not read DB/config repositories directly.
- [x] Add invariant tests:
  - `tests/invariants/core-no-config-db-read.test.ts`.
  - `tests/invariants/core-no-memory-input.test.ts`.
- [x] Add `recoup_config` and `recoup_audit_chain` SQL to `docs/supabase-memory-schema.sql`.
- [x] Ensure audit chain is insert-only in the SQL artifact.
- [x] Add synthetic Supabase static table definitions for:
  - `recoup_src_bureau`,
  - `recoup_src_docs`,
  - `recoup_src_remittance`,
  - `recoup_src_tpm`.
- [x] Add/update source-swap readiness docs/tests so SAP remains live read-only and other sources are synthetic reference tables behind canonical ports.
- [x] Run runtime-config, connector-readiness, memory, and audit tests.
- [x] Run a spec review subagent for Workflow 2.
- [x] Run a code quality review subagent for Workflow 2.
- [x] Fix all Critical/Important review findings.

### Workflow 3: Guarded Realtime Browser Session

- [x] Execute `docs/superpowers/plans/2026-06-20-realtime-browser-session.md` under TDD.
- [x] Add backend Realtime read-only tool manifest and tool-call guard:
  - Allowed tools: `audit.read`, `query.answer`.
  - Block action-producing and write-capable tools.
  - Parse client-secret response without leaking server API keys.
- [x] Add cockpit API `no-store` headers and optional read-only `/query/realtime-tool` bridge.
- [x] Add Next proxy route for read-only Realtime tool calls if needed by the browser helper.
- [x] Add `cockpit/app/realtime-browser-session.ts` for WebRTC setup, SDP exchange, data-channel events, cited-answer gating, and cleanup.
- [x] Update `cockpit/app/realtime-query-controls.tsx` to use the helper without storing or rendering secrets.
- [x] Add compact UI states in `cockpit/app/styles.css`.
- [x] Add/update tests:
  - `tests/unit/realtime-session.test.ts`.
  - `tests/unit/cockpit-api.test.ts`.
  - `tests/unit/realtime-browser-session.test.ts`.
  - `tests/invariants/integration-contract.test.ts`.
  - `tests/invariants/cockpit-no-business-logic.test.ts`.
  - `tests/unit/query.test.ts`.
- [x] Run targeted Realtime/cockpit tests.
- [x] Run a spec review subagent for Workflow 3.
- [x] Run a code quality review subagent for Workflow 3.
- [x] Fix all Critical/Important review findings.

### Workflow 4: Final-Output Guard And Dollar Static Safety

- [x] Add tests proving final agent output cannot bypass:
  - deduction evidence guard,
  - intent evidence guard,
  - no-wrongful-containment guard,
  - decision explainability guard.
- [x] Wire `src/guardrails/output/final.ts` into actual agent final-output emission or an explicit runtime/service finalization path.
- [x] Add a repo-wide static invariant for model/agent dollar assertions:
  - Permit core/test/data deterministic inputs where appropriate.
  - Block agent/model output paths from introducing free dollar literals or amount computation.
  - Keep action amounts sourced from deterministic decision provenance.
- [x] Run targeted guardrail tests.
- [x] Run a spec review subagent for Workflow 4.
- [x] Run a code quality review subagent for Workflow 4.
- [x] Fix all Critical/Important review findings.

### Workflow 5: Remaining Verification Flags Package

- [x] Track `[VERIFY-PROD]` and `[VERIFY]` flags from `CODEX_BUILD_ANSWERS.md`:
  - production calibration of arbitration weights,
  - DB-backed governed config runtime loader/injection,
  - embeddings model id,
  - Codex build-model id,
  - SAP sandbox instance.
- [x] Keep live non-SAP contracts as `[VERIFY-V3]` deferred while synthetic reference tables are implemented.
- [x] Ensure README/docs state these as verification/deployment dependencies without weakening demo claims.
- [x] Run relevant runtime-config, connector-readiness, and eval gates.
- [x] Run a documentation/spec review subagent for Workflow 5.
- [x] Fix all Critical/Important review findings.

### Final Workflow: Verification, Review, And Close

- [x] Run `git diff --check`.
- [x] Run `npm.cmd run verify`.
- [x] Review the full diff for unrelated changes.
- [x] Run final broad code-review subagent over the completed diff.
- [x] Fix all Critical/Important review findings.
- [x] Re-run `npm.cmd run verify`.
- [ ] Produce closeout with exact checks run, pass/fail status, active/configured plugin/MCP status, blocked dependencies, and unrelated-diff statement.

## Completion Definition

The goal is complete only when every actionable item above is implemented, reviewed, and verified, and remaining `[VERIFY]` / `[VERIFY-PROD]` items are explicitly documented as deployment calibration dependencies rather than hidden implementation gaps.
