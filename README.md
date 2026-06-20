# Recoup

Recoup is a deterministic, agent-ready O2C recovery cockpit for the NorthBay demo story. It investigates deductions, stages recovery and billing-prevention drafts, and shows how credit-risk containment can stay governed instead of autonomous.

The build keeps the repo contract intact: code computes every dollar, decisions cite record IDs and deterministic basis, SAP is read-only, and every external action stops at human approval.

## How It Works

1. Synthetic NorthBay data is generated from seed 42 and locked to the S1-S8 gold set.
2. Core rules reconstruct expected values, compute deltas with `decimal.js`, and suppress false positives.
3. Forensics builds evidence-backed deduction decisions and hands recovery work to the Recovery Drafter.
4. Risk Mesh, Sentinel, and Containment run in the offline deterministic harness for the Harbor partial-hold scenario.
5. The cockpit exposes Maya Forensics, David Credit/Arbitration, and CFO readout surfaces through REST and SSE.
6. Audit, approval, query, and MCP-facing tools are whitelisted and Zod-validated at the service boundary.

## How OpenAI Is Used

- Agents SDK: pinned offline-safe agent roster for Forensics, Recovery Drafter, Risk Mesh, Sentinel, Containment, and Conversational Query.
- Handoffs: Forensics to Recovery Drafter is represented in the implemented S4 boundary.
- Tools: service tools are namespaced, typed, and bounded; no free-form tool execution path exists.
- MCP: whitelisted Recoup tools are registered on the MCP SDK server and served through `StreamableHTTPServerTransport`; Secure MCP Tunnel remains the private-network scale path.
- Realtime: `gpt-realtime-2` is pinned behind a server-issued client-secret route with human cockpit auth, `OpenAI-Safety-Identifier` binding, and audit-only retention policy; browser voice UX remains a controlled demo surface.
- Tracing: Forensics emits SSE-visible trace events for service tools, findings, verdicts, and handoff status.
- HITL: approval tools and cockpit approval endpoint require human approvers and preserve segregation of duties.

## Memory And Compaction

Recoup now has typed, scoped memory records for session, workflow, case, transaction, evidence, approval, audit, connector, artifact, compaction, and agent-handoff state. Supabase/Postgres is the primary shared memory target when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured; SQLite through the built-in `node:sqlite` path remains the local/offline fallback when `RECOUP_MEMORY_DB_PATH` is configured. Compaction summaries preserve objective, category, next step, and cited record IDs; memory is mutable current state, while audit evidence remains the separate hash-chained trail.

## Agent Skills

Reviewed local Markdown skills live under `skills/` for evidence packs, recovery drafting, risk arbitration, query answering, and read-only SAP OData access. They are procedural assets only: they require cited records and deterministic basis, and they do not calculate amounts, mutate SAP, or bypass service tools.

## Agent-To-Agent Communication

The runtime declares the SDD handoff graph: Forensics hands invalid/partial work to Recovery Drafter and behavioral candidates to Containment, Risk Mesh gathers Sentinel and Containment positions as agents-as-tools, and Query uses audit read as a tool. Handoff packets are Zod-typed and must carry `recordIds`.

## Tool Permissions

Every service tool is classified by risk class, side-effect class, and MCP visibility. Read-only and permitted draft-only proposal tools can be exposed through the authenticated MCP surface; approval decisions, core compute, and decision tools stay internal. Cockpit approvals remain HITL-gated through the local REST boundary, and read-only MCP clients are denied draft action calls before handler execution.

## Independent Multi-Agent Audit Evidence

Recoup's audit trail is judge-visible in `docs/independent-audit-log.md` and the broader architecture review is maintained in `docs/architecture-review-and-recommendations.md`. The proof pack records the independent review areas, findings, fixes, open risks, and the exact code/test evidence for each item.

| Audit Area | Current Status | Evidence |
|---|---|---|
| Architecture and harness review | Partially resolved; open items tracked | `docs/architecture-review-and-recommendations.md` |
| Supabase durable memory | Resolved runtime path; target REST read verified | `src/memory/supabaseStore.ts`, `docs/supabase-memory-schema.sql`, `tests/unit/supabase-memory.test.ts` |
| SQLite durable memory | Resolved fallback baseline | `src/memory/sqliteStore.ts`, `tests/unit/sqlite-memory.test.ts` |
| SAP OData read-only connector | Resolved read-only Basic/OAuth baseline; live Gateway metadata proof captured | `src/adapters/sapOData.ts`, `skills/sap-odata-access/SKILL.md`, `tests/unit/sap-odata.test.ts` |
| Enterprise connector schemas | Resolved contract baseline | `src/adapters/enterpriseReadOnly.ts`, `tests/unit/enterprise-connectors.test.ts`, `tests/invariants/connector-readiness.test.ts` |
| Cockpit approval and Realtime auth | Resolved hackathon guard; live client-secret proof captured | `src/services/cockpitApi.ts`, `src/services/realtimeSession.ts`, `tests/unit/cockpit-api.test.ts`, `tests/unit/realtime-session.test.ts` |
| MCP StreamableHTTP auth, health, and RBAC | Resolved hackathon guard | `src/mcp/server.ts`, `tests/invariants/mcp-transport.test.ts` |
| UI/UX premium SaaS audit | Resolved first-viewport desktop/mobile QA baseline | `cockpit/app/styles.css`, `tests/invariants/cockpit-no-business-logic.test.ts` |

## Claim To Code To Test

| Claim | Code | Test |
|---|---|---|
| No ERP write-back | `src/adapters/sapOData.ts`, `src/tools/retrieval/sap.ts` | `tests/invariants/no-erp-writeback.test.ts`, `tests/invariants/integration-contract.test.ts` |
| Whitelisted tools only | `src/services/serviceLayer.ts` | `tests/invariants/tool-whitelist.test.ts` |
| Core-owned dollar math | `src/core/partialHold.ts`, `src/core/rules/` | `tests/invariants/no-float-money.test.ts`, `tests/invariants/partial-hold-determinism.test.ts` |
| Evidence-backed decisions | `src/agents/forensics.ts`, `src/services/decisionTools.ts` | `tests/invariants/deduction-evidence-pack.test.ts` |
| HITL approval | `src/services/approvals.ts`, `src/services/cockpitApi.ts` | `tests/invariants/hitl-gate.test.ts`, `tests/invariants/sod.test.ts` |
| Cockpit surfaces | `src/services/cockpitModel.ts`, `cockpit/app/page.tsx` | `tests/unit/cockpit.test.ts`, `tests/unit/cockpit-api.test.ts` |
| Memory, skills, handoffs, permissions | `src/memory/`, `skills/`, `src/agents/handoffGraph.ts`, `src/services/permissionEngine.ts` | `tests/invariants/memory-contract.test.ts`, `tests/invariants/skills-contract.test.ts`, `tests/unit/agent-handoffs.test.ts`, `tests/invariants/tool-permissions.test.ts` |

## Run Locally

```powershell
npm.cmd install
npm.cmd run verify
```

For the cockpit:

```powershell
npm.cmd run dev:api
npm.cmd run dev:cockpit
```

Open the Next.js URL printed by `dev:cockpit`. The API defaults to `http://127.0.0.1:4317`.

## Demo Flow

1. Start on the Forensics queue and show 13 projected recovery drafts plus 7 billing-prevention drafts.
2. Open the evidence pack and record IDs for a recovery line.
3. Use the approval controls to show human approval and audit hash output.
4. Move to the Credit Arbitration band and explain Harbor's governed partial-hold split.
5. Show the Agent Operations band: public MCP surface, typed memory categories, handoff graph, and cited trace timeline.
6. Close with the CFO Summary: gross exposure, projected recovery, billing prevention, supervised autonomy, and open expert-owned dependencies.

## What Is Still Deferred

- Supabase durable memory is the primary runtime path when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured; SQLite is available through the built-in `node:sqlite` runtime path as an offline fallback when only `RECOUP_MEMORY_DB_PATH` is configured.
- Production MCP `StreamableHTTPServerTransport` is wired on `/mcp` with configured auth, actor-capability checks, and a secret-free `/healthz` readiness signal; Secure MCP Tunnel remains the private/on-prem SAP scale path.
- Live Realtime text/voice query has a credential-gated client-secret path with server-side human auth, OpenAI-Safety-Identifier binding, read-only query scope, and audit-only retention policy. A local guarded route proof on June 19, 2026 issued a `gpt-realtime-2` client secret without printing secret values; browser voice UX remains a controlled demo surface.
- SAP sandbox auth/query mapping has a read-only metadata coverage proof for the mapped billing and outbound-delivery services, plus a live Basic-auth Gateway metadata proof for `FCOM_COSTCENTER_SRV` showing `CostCenterSet` and `F4_CostCenterSet`. Scope and tenant may remain blank when the SAP endpoint does not require them; live O2C business mapping still depends on reachable billing/outbound-delivery services and their entity keys. Bureau, remittance, EDI, document repository, and TPM adapters now require exact read-only source contracts with canonical evidence field mappings before they can be marked ready.
- Expert-owned constants remain unset and must not be inferred.

## Open Items

- Expert-owned constants remain unset: arbitration P&L weights, R-score weights, R-drift threshold, and gaming thresholds.
- Supabase runtime memory is wired and target table reads have been verified; SQLite runtime memory exists as local fallback; replay-grade audit/memory rehydration remains a scale-path item.
- MCP production transport is wired through authenticated `StreamableHTTPServerTransport`; Secure MCP Tunnel hardening remains a scale-path item.
- SAP remains read-only: live Gateway metadata proof exists, while O2C billing/outbound-delivery query execution is still gated by available SAP services and metadata-backed entity mappings.
- Bureau, remittance/EDI, real doc-repo, and real TPM adapters require exact schemas before implementation.
- Live text/voice query requires `OPENAI_API_KEY` for real sessions; the local guard rejects empty questions, decouples Realtime credential checks from unrelated connector config, and exposes the audit policy without persisting raw audio or uncited transcripts.
