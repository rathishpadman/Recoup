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

- `query.ts` remains deterministic/offline-safe; the live Realtime path currently covers server-issued client secrets and still needs the browser voice/text session wired to deterministic query tools.
- `retrieval.bureau` and remittance/EDI adapters remain planned-only because the current SDD names the sources but does not provide exact runtime schemas or thresholds.
- `docRepo.ts` and real TPM adapter files are not implemented; current `retrieval.docs` and `retrieval.tpm` are synthetic/local tool implementations.
- Risk Mesh arbitration P&L weights, R-score weights, drift thresholds, and gaming thresholds remain expert-owned placeholders. They must not be inferred from industry assumptions unless a human explicitly records provisional values as approved demo defaults.
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
- Resolved: offline Harbor query grounding with cited records and the `r-score-weights-unset` dependency.
- Resolved: cockpit read models and endpoints for `/trace`, `/memory`, and `/agents`.
- Resolved: README judge contract includes memory, skills, agent communication, permissions, and deferred items.

## Independent Subagent Findings

Read-only subagent reviews were run during the integration and hardening work. The findings below are recorded as architecture review output, not all resolved in this patch. Judge-visible audit evidence is summarized in `docs/independent-audit-log.md`.

### High Priority

- Resolved in this patch: partial-hold release/backorder amounts are computed by `src/core/partialHold.ts`; `src/tools/actions/proposeHold.ts` packages the core-computed split.
- `src/agents/riskMesh.ts` imports `proposeHold` and `proposeTerms` directly instead of crossing the same service-tool boundary used by Forensics. Recommended follow-up: split pure action packaging from service-boundary invocation so Risk Mesh can retain Zod/tool guardrail coverage without recursion.
- Resolved in this patch: `src/agents/agentRuntime.ts` declares offline-safe pinned Agent descriptors for the full six-agent roster. Remaining follow-up: only the S4 Forensics to Recovery handoff is implemented as an executable handoff.
- Resolved in this patch: `src/services/conductor.ts` exists with blocked run-control status and compact `ErrorEvent` conversion. Remaining follow-up: wire configured Appendix G budgets, retry caps, and AgentHooks spans when expert constants are available.
- Resolved in this patch: `approvals.decide` now resolves a staged Forensics or Risk Mesh action and appends an audit entry before returning a human decision. Remaining follow-up: persist the action registry and approval audit beyond the in-memory demo harness.
- Resolved in this patch: David Credit/Arbitration and CFO Summary read-model bands are present. Remaining follow-up: deepen them into fully interactive SDD §11 surfaces after expert-owned constants and live query policy are approved.

### Medium Priority

- Resolved in this patch: MCP uses the SDK `StreamableHTTPServerTransport` with configured auth and actor-capability checks. Remaining follow-up: Secure MCP Tunnel/private-network deployment hardening.
- `SapODataReadOnlyAdapter` is read-only and evidence-shaped, with OAuth and Gateway Basic auth plus live metadata proof for the Cost Center Gateway service. Remaining follow-up: wire reachable O2C billing/outbound-delivery services and sample payloads for the mapped evidence route.
- `retrieval.bureau`, remittance/EDI, `docRepo.ts`, and real TPM adapter files remain planned-only because exact schemas and source contracts are not yet specified.
- Query is offline-safe for deterministic answers; the guarded Realtime client-secret path was live-proved, but the browser session does not yet perform live text/voice or file-search grounded answers.
- Guardrail modules for no-wrongful-containment and intent-evidence are not yet separate files, even though the behavior is partly covered by existing S6 tests.
- The cockpit now has a first-viewport desktop/mobile visual QA baseline and should be deepened into fully interactive SDD §11 surfaces after expert-owned constants and live query policy are approved.

## Hackathon Upgrade Recommendations

Recommended for approval:

1. **Voice query demo shell**
   - Wire the existing cockpit voice affordance to the guarded client-secret route, then keep answers constrained to deterministic query tools with cited records.
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

- Wiring assumed risk/arbitration/gaming constants into active decision logic.
- Adding autonomous ERP write-back or pre-invoice validation.
- Adding broad bureau/news/remittance signal scoring without exact schemas, thresholds, and evidence rules.
- Adding live voice or file-search calls directly from the browser without ephemeral credentials, server-side policy checks, and audit.

## Source Basis

- Local contract: `AGENTS.md`, `INVARIANTS.md`, `RECONCILIATION_LEDGER.md`, `Recoup_v2_SDD.md`.
- Local OpenAI stack dossier: `docs/OPENAI_STACK_DOSSIER.md`.
- External research consulted during review: official OpenAI Agents SDK, MCP/observability, and Voice Agents documentation; public hackathon judging criteria emphasizing functional MVP, technical implementation, impact, UX, and presentation.
