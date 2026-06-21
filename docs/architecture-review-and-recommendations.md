# Recoup Architecture Review And Recommendations

Status: draft review note for the S4-S7 branch.

## Current Build Status

- Core S1-S8 deterministic rules, graph, expected-value reconstruction, false-positive gates, and Decimal money path are in place.
- All six named agents are represented in the pinned offline-safe runtime roster; Forensics and Recovery have the implemented S4 handoff, while Risk Mesh, Sentinel, Containment, and Query remain deterministic/offline harness modules.
- The service layer now exposes bounded tools for actions, approvals, audit read, core execution, decisions, query, and retrieval.
- SAP integration is read-only and staged through `SapODataReadOnlyAdapter`; no ERP write path is constructed.
- SAP runtime config supports OAuth or Gateway Basic auth for read-only metadata/GET access; live `FCOM_COSTCENTER_SRV` metadata proof was captured without scope or tenant.
- The MCP facade exposes whitelisted service tools through authenticated `StreamableHTTPServerTransport`; approval, core, and decision tools remain internal.
- Conversational query is intentionally offline-safe for deterministic answers, cites Harbor state for the demo query, and has a guarded Realtime client-secret route for live `gpt-realtime-2` sessions when runtime credentials and human cockpit auth are configured.
- Run control now has a conductor skeleton that blocks until Appendix G budgets/retry caps are configured and emits compact `ErrorEvent` records for tool failures.
- The cockpit now includes Maya Forensics, David Credit/Arbitration, CFO Summary, Agent Operations, memory, and trace read-model bands.
- Typed memory categories, Supabase primary memory, SQLite fallback memory, compaction summaries, tool permission metadata, MCP public/internal visibility, handoff packet schemas, and local Recoup skills are staged for the hackathon harness.

## Contract-Safe Open Items

- `query.ts` remains deterministic/offline-safe; the live Realtime path now covers server-issued client secrets plus a guarded browser text/voice session wired only to deterministic query and audit tools.
- `CODEX_BUILD_ANSWERS.md` resolves the non-SAP connector strategy: bureau, remittance/EDI, docs, and TPM should be implemented as synthetic Supabase static tables behind canonical ports for Day 1, while real live contracts remain VERIFY-V3.
- `docRepo.ts` and real TPM adapter files are not implemented; current `retrieval.docs` and `retrieval.tpm` remain synthetic/local tool implementations, while Day-1 Supabase static-table readiness is implemented for source swap preparation.
- Risk Mesh arbitration P&L weights, R-score weights, drift thresholds, gaming thresholds, partial-hold config, accuracy bars, and seed are owner-ratified Day-1 tunables for the demo; config-as-code bootstrap plus `recoup_config` v1 seed rows exist, while the DB-backed runtime config loader/injection and VERIFY-PROD calibration remain pending before final operating use.
- `CODEX_BUILD_ANSWERS.md` still marks embeddings model id, Codex build-model id, and SAP sandbox instance as `[VERIFY]`; keep them as deployment dependencies until owner-confirmed.
- The MCP server uses the SDK `StreamableHTTPServerTransport` with configured auth and actor-capability checks; Secure MCP Tunnel remains the private/on-prem scale path.
- Supabase/Postgres is the primary durable memory path when shared credentials are configured; SQLite durable memory remains the local fallback when `RECOUP_MEMORY_DB_PATH` is configured. Replay-grade memory/audit rehydration remains a scale-path follow-up.

## Independent Review Checklist

- Agent boundaries: Forensics hands off to Recovery; Risk Mesh calls Sentinel and Containment harnesses. Query is disabled/offline-safe.
- Tool boundary: every exposed service tool is namespaced, Zod-validated, risk-classified, side-effect-classified, and split by MCP/internal visibility; approval decisions are not MCP-visible.
- HITL: action and approval paths retain human-only approval and proposer/approver separation.
- SAP: read-only retrieval only; no write-capable method names are exposed on the SAP adapter; Basic and OAuth auth paths attach only to GET/token requests.
- Audit: `audit.read` exposes the Harbor Risk Mesh hash-chain entries for review.
- Deterministic dollar spine: no new dollar math was added outside core.
- Memory: scoped records carry trust labels and cited record IDs; compaction preserves objective, categories, next step, and records.
- Skills: local Markdown skills, including read-only SAP OData access, are reviewed procedural assets and do not bypass service tools.

## S7 Resolved Items

- Resolved: typed memory categories, Supabase repository, SQLite fallback, and in-memory harness store under `src/memory/`.
- Resolved: compaction summary helper under `src/memory/compaction.ts`.
- Resolved: local skills for evidence packs, recovery drafting, risk arbitration, query answering, and read-only SAP OData access under `skills/`.
- Resolved: handoff graph and Zod handoff packets under `src/agents/`.
- Resolved: service-tool permission metadata and MCP visibility split, with `approvals.decide` kept internal to avoid forged external approvals.
- Resolved: offline Harbor query grounding with cited records and the `verify-runtime-config-loader-required` dependency.
- Resolved: cockpit read models and endpoints for `/trace`, `/memory`, and `/agents`.
- Resolved: README judge contract includes memory, skills, agent communication, permissions, and deferred items.

## Independent Subagent Findings

Read-only subagent reviews were run during the integration and hardening work. The findings below are recorded as architecture review output, not all resolved in this patch. Judge-visible audit evidence is summarized in `docs/independent-audit-log.md`.

### High Priority

- Resolved in this patch: partial-hold release/backorder amounts are computed by `src/core/partialHold.ts`; `src/tools/actions/proposeHold.ts` packages the core-computed split.
- Resolved in this patch: Risk Mesh hold and terms proposal packaging now crosses the service/tool guardrail boundary through `actions.proposeHold` and `actions.proposeTerms`; the action modules package deterministic proposals behind whitelisted Zod-validated service tools.
- Resolved in this patch: `src/agents/agentRuntime.ts` declares offline-safe pinned Agent descriptors for the full six-agent roster. Remaining follow-up: only the S4 Forensics to Recovery handoff is implemented as an executable handoff.
- Resolved in this patch: `src/services/conductor.ts` exists with blocked run-control status and compact `ErrorEvent` conversion. Remaining follow-up: wire configured Appendix G budgets, retry caps, and AgentHooks spans when expert constants are available.
- Resolved in this patch: `approvals.decide` now resolves a staged Forensics or Risk Mesh action and appends an audit entry before returning a human decision. Remaining follow-up: persist the action registry and approval audit beyond the in-memory demo harness.
- Resolved in this patch: David Credit/Arbitration and CFO Summary read-model bands are present. Remaining follow-up: deepen them into fully interactive SDD §11 surfaces after VERIFY-PROD calibration and live query policy are approved.

### Medium Priority

- Resolved in this patch: MCP uses the SDK `StreamableHTTPServerTransport` with configured auth and actor-capability checks. Remaining follow-up: Secure MCP Tunnel/private-network deployment hardening.
- `SapODataReadOnlyAdapter` is read-only and evidence-shaped, with OAuth and Gateway Basic auth plus live metadata proof for the Cost Center Gateway service. Remaining follow-up: wire reachable O2C billing/outbound-delivery services and sample payloads for the mapped evidence route.
- `retrieval.bureau`, remittance/EDI, `docRepo.ts`, and TPM now have an owner-approved Day-1 synthetic Supabase table strategy with static-table readiness implemented; full table-reading adapters are deferred until retrieval needs exceed readiness, and real live adapters remain deferred to VERIFY-V3 source contracts.
- Query is offline-safe for deterministic answers; the guarded Realtime browser session now uses read-only deterministic query/audit tools, with production live query policy still gated by owner approval.
- Resolved in this patch: guardrail modules for no-wrongful-containment, intent-evidence, and final-output checks now exist as named surfaces under `src/guardrails/`.
- The cockpit now has a first-viewport desktop/mobile visual QA baseline and should be deepened into fully interactive SDD §11 surfaces after VERIFY-PROD calibration and live query policy are approved.

## Hackathon Upgrade Recommendations

Recommended for approval:

1. **Voice query demo hardening**
   - Expand the guarded Realtime browser shell only after production live-query policy and identity are approved; keep answers constrained to deterministic query tools with cited records.
   - Merit: shows OpenAI Realtime capability without exposing long-lived credentials in the browser.

2. **Trace viewer panel**
   - Surface existing trace events and service-tool calls as a judge-visible timeline.
   - Merit: makes the multi-agent architecture understandable in the demo and strengthens trust.

3. **MCP/SAP integration card**
   - Add a cockpit card showing SAP read-only, docs, and TPM source status, with MCP facade status and no-write-back badge.
   - Merit: makes the enterprise integration story visible without requiring a real SAP sandbox.

4. **Architecture review appendix in README**
   - Add a short "Why this wins" section: quantified O2C leakage problem, working MVP, safety invariants, OpenAI capability map, and demo flow.
   - Merit: aligns with common judging dimensions: functional MVP, technical implementation, impact/value, UX, and presentation clarity.

5. **Multimodal evidence placeholder**
   - Add planned support note for POD/photo evidence review, but do not implement live multimodal classification unless exact source data and guardrails are approved.
   - Merit: relevant to deduction forensics, but should stay behind evidence-pack validation.

Not recommended without explicit approval:

- Bypassing the governed runtime config loader or VERIFY-PROD calibration for active risk/arbitration/gaming decisions.
- Adding autonomous ERP write-back or pre-invoice validation.
- Adding broad bureau/news/remittance signal scoring outside the approved synthetic Supabase table strategy or without governed config/source-port validation.
- Adding live voice or file-search calls directly from the browser without ephemeral credentials, server-side policy checks, and audit.

## Source Basis

- Local contract: `AGENTS.md`, `INVARIANTS.md`, `RECONCILIATION_LEDGER.md`, `Recoup_v2_SDD.md`.
- Local OpenAI stack dossier: `docs/OPENAI_STACK_DOSSIER.md`.
- External research consulted during review: official OpenAI Agents SDK, MCP/observability, and Voice Agents documentation; public hackathon judging criteria emphasizing functional MVP, technical implementation, impact, UX, and presentation.
