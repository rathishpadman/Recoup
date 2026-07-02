# Recoup

Recoup is a deterministic, agent-ready O2C recovery cockpit for the NorthBay demo story. It investigates deductions, stages recovery and billing-prevention drafts, and shows how credit-risk containment can stay governed instead of autonomous.

The build keeps the repo contract intact: code computes every dollar, decisions cite record IDs and deterministic basis, SAP is read-only, and every external action stops at human approval.

## How It Works

1. Synthetic NorthBay data is generated from seed 42 and locked to the S1-S8 gold set.
2. Core rules reconstruct expected values, compute deltas with `decimal.js`, and suppress false positives.
3. Forensics builds evidence-backed deduction decisions and hands recovery work to the Recovery Drafter.
4. Risk Mesh, Sentinel, and Containment run in the offline deterministic harness for the Harbor partial-hold scenario.
5. The cockpit exposes Maya Patel for Forensics, David Kim for Credit/Arbitration, and CFO readout surfaces through REST and SSE.
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
| SAP OData read-only connector | Resolved read-only Basic/OAuth baseline; `Tools_data` invoice mapping targets `ZUI_BILLINGDOCUMENTFS_0001/C_BillingDocumentFs` plus `C_BillingDocumentItemFs` billing-item collection reads with `sap-client` routing; locked R1 SAP-primary needs have metadata-validated GET request plans | `src/adapters/sapOData.ts`, `skills/sap-odata-access/SKILL.md`, `tests/unit/sap-odata.test.ts` |
| Enterprise connector strategy | Foundation implemented from owner-ratified Day-1 tunables and source strategy: SAP remains live read-only; synthetic Supabase source tables become `ready_synthetic` only after a schema probe verifies `Tools_data` tables, production `/run` and MCP SAP/docs/TPM/bureau retrieval consume Supabase `recoup_src_*` rows, and frontend/MCP-callable R1 source reads are exposed through `sources.r1Read` plus `GET /sources/r1/:need`; live contracts remain deferred to VERIFY-V3 | `src/adapters/enterpriseReadOnly.ts`, `src/adapters/connectorRegistry.ts`, `src/memory/supabaseStore.ts`, `src/services/serviceLayer.ts`, `src/mcp/server.ts`, `docs/supabase-memory-schema.sql`, `tests/unit/enterprise-connectors.test.ts`, `tests/unit/retrieval-tools.test.ts`, `tests/unit/r1-source-read.test.ts`, `tests/invariants/connector-readiness.test.ts` |
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
| Frontend-callable R1 source reads | `src/services/serviceLayer.ts`, `src/services/cockpitApi.ts`, `src/adapters/sapOData.ts` | `tests/unit/r1-source-read.test.ts`, `tests/unit/cockpit-api.test.ts`, `tests/invariants/mcp-visibility.test.ts`, `tests/invariants/integration-contract.test.ts` |
| HITL approval | `src/services/approvals.ts`, `src/services/cockpitApi.ts` | `tests/invariants/action-hitl-all-capabilities.test.ts`, `tests/invariants/sod.test.ts` |
| Cockpit surfaces | `src/services/cockpitModel.ts`, `cockpit/app/page.tsx` | `tests/unit/cockpit.test.ts`, `tests/unit/cockpit-api.test.ts` |
| Memory, skills, handoffs, permissions | `src/memory/`, `skills/`, `src/agents/handoffGraph.ts`, `src/services/permissionEngine.ts` | `tests/invariants/memory-contract.test.ts`, `tests/invariants/skills-contract.test.ts`, `tests/unit/agent-handoffs.test.ts`, `tests/invariants/tool-permissions.test.ts` |

## Run Locally

```powershell
npm.cmd install
npm.cmd run verify
```

`npm.cmd run verify` includes `verify:release`, which reads owner-approved release inputs from Supabase `recoup_config`. A green local verify run proves the repo regression gate for the configured environment; production evidence cutover proof is tracked separately below.

The backend SDD compliance snapshot is tracked in `docs/backend-sdd-compliance-audit.md`; non-secret owner input status and remaining owner-bound items are tracked in `docs/sdd-owner-inputs-needed.md`.

## Real Evidence Cutover Status

`npm.cmd run verify` is the local regression and invariant gate. It is not production-release proof for the 2026-07-01 real-evidence cutover. That cutover remains blocked until `npm.cmd run check:real-evidence-proof` passes against approved preview/post-implementation evidence.

The real-evidence proof gate requires environment readiness, including `RECOUP_PREVIEW_URL`; post-implementation screenshots for every Phase 0 live production route; pixel-diff proof; visible `EVD-POD-S3-L1` and `RECON-S3-L1`; visible content hash and provenance; and a decoded POD image or HTTP-verified non-empty POD PDF/link artifact in each evidence-detail route. Until that gate passes, previous production smoke and local verify runs are regression evidence only, not production-release proof.

For the cockpit:

```powershell
npm.cmd run dev:api
npm.cmd run dev:cockpit
```

Open the Next.js URL printed by `dev:cockpit`. The API defaults to `http://127.0.0.1:4317`.

## Demo Personas

The live story is a two-persona demo:

- Maya Patel is the Deduction Forensics analyst: she opens evidence packs, verifies cited records, stages recovery or billing-prevention drafts for approval, and uses the guarded Realtime query.
- David Kim is the Credit / Arbitration lead: he reviews the governed Harbor partial-hold proposal, terms action, and Risk Mesh audit trail before any external action.
- CFO Summary is the read-only executive close, not a third operating persona; it summarizes exposure, projected recovery, billing prevention, supervised autonomy, and open VERIFY-PROD calibration dependencies.

## Demo Flow

1. Start on the Forensics queue and show 13 projected recovery drafts plus 7 billing-prevention drafts.
2. Open the evidence pack and record IDs for a recovery line.
3. Use the approval controls to show human approval and audit hash output.
4. Ask the guarded Realtime query why Harbor is blocked and show cited-or-blocked output.
5. Move to the Credit Arbitration band and explain Harbor's governed partial-hold split.
6. Show the Agent Operations band: public MCP surface, typed memory categories, handoff graph, and cited trace timeline.
7. Close with the CFO Summary: gross exposure, projected recovery, billing prevention, supervised autonomy, and open VERIFY-PROD calibration dependencies.

## What Is Still Deferred

- Supabase durable memory is the primary runtime path when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured; SQLite is available through the built-in `node:sqlite` runtime path as an offline fallback when only `RECOUP_MEMORY_DB_PATH` is configured.
- Production MCP `StreamableHTTPServerTransport` is wired on `/mcp` with configured auth, actor-capability checks, and a secret-free `/healthz` readiness signal; Secure MCP Tunnel remains the private/on-prem SAP scale path.
- Live Realtime text/voice query has a credential-gated client-secret path with server-side human auth, OpenAI-Safety-Identifier binding, read-only query scope, and audit-only retention policy. A local guarded route proof on June 19, 2026 issued a `gpt-realtime-2` client secret without printing secret values; browser voice UX remains a controlled demo surface.
- SAP sandbox auth/query mapping now uses the `docs/Tools_data` read-only invoice service `ZUI_BILLINGDOCUMENTFS_0001/C_BillingDocumentFs` with `SAP_ODATA_CLIENT` / `sap-client`; synthetic invoice IDs without a numeric SAP suffix fail closed instead of becoming live reads. Scope and tenant may remain blank when the SAP endpoint does not require OAuth. The locked R1 SAP-primary needs now expose metadata-validated GET read plans for invoice, sales order, credit account DSO, credit exposure, dispute case, and accrual cap.
- SAP, bureau, remittance/EDI, document repository, and TPM source depth is no longer blocked on static runtime evidence for the R1 source-table path: SAP stays read-only, and the implemented Day-1 strategy uses synthetic Supabase source tables behind canonical source ports. The readiness model requires a Supabase schema probe for the `docs/Tools_data` tables before reporting synthetic sources as `ready_synthetic`; read-only synthetic table readers now exist for bureau, docs, remittance/EDI, and TPM. Production `/run` and MCP SAP/docs/TPM/bureau retrieval load Supabase `recoup_src_sap`, `recoup_src_docs`, `recoup_src_tpm`, and `recoup_src_bureau` evidence rows and fail closed if required source context is absent. The frontend/API source path exposes bounded `GET /sources/r1/:need` calls backed by `sources.r1Read`, with SAP-primary read plans or Supabase authoritative fallback read plans only for the owner-locked R1 needs; broader live source contracts remain deferred to VERIFY-V3.
- Expert-owned Day-1 constants are captured in `config/governed.ts` and emitted as `recoup_config` seed rows in `docs/supabase-memory-schema.sql`; `CODEX_BUILD_ANSWERS.md` is not present in this repo checkout. The governed config loader must remain the runtime boundary for production use, and VERIFY-PROD calibration remains required before final operating policy.
- Remaining owner verification flags are tracked as deployment dependencies, not hidden implementation claims: embeddings model id, Codex build-model id, and SAP sandbox instance.

## Open Items

- Keep governed runtime values and run-control budgets DB-backed through Supabase `recoup_config`: release readiness, cockpit read models, Realtime/MCP service calls, `/healthz`, `/run`, and Harbor Risk Mesh case facts (`risk_mesh_cases`) now load validated rows instead of using static runtime constants. Active governed rows are structurally validated and DB-authoritative; checked-in Day-1 values are setup/test seed fixtures. The Harbor row also owns David credit account readout, Sentinel display, action queue business values, source-owned Risk Mesh `optionValue`s, and the Supabase Tools_data refs used to load Harbor R-drift evidence from `customers`, `payments`, `bureau_alerts`, and invalid/partial `deductions_backlog` rows; `/credit`, `/cfo`, and `/trace` return 503 rather than falling back to synthetic Sentinel values if those rows are missing or invalid. Production `/run` and MCP SAP/docs/TPM/bureau retrieval also load Supabase `recoup_src_*` evidence rows instead of prefix-derived static evidence. Approval decisions commit only through the Supabase audit chain, and live Agents SDK run-control requires DB-loaded `maxTurns`/`retryCap` values instead of hard-coded defaults. Round 2 R-score component rows are supplied and live-read-back for the seed customers, and vector-store hits enforce the owner citation metadata contract (`source_table`, `record_id`, `customer_id`, `scenario_type`, `provenance=synthetic`). The owner-approved seed-42 vector-store lifecycle is provisioned and exposed through `npm run provision:openai-evidence-vector-store`. Remaining production work is VERIFY-PROD calibration, field-level decision-confidence source contracts, production evidence-corpus expansion beyond seed-42, and broader source expansion beyond the locked R1 SAP-primary/Supabase-fallback set.
- Resolve the remaining owner verification flags that were historically attributed to `CODEX_BUILD_ANSWERS.md`: embeddings model id, Codex build-model id, and SAP sandbox instance.
- Supabase runtime memory is wired and target table reads have been verified; SQLite runtime memory exists as local fallback; `docs/Tools_data/seed_data.sql` is not applied automatically because it truncates tables and contains shadow action rows; replay-grade audit/memory rehydration remains a scale-path item.
- MCP production transport is wired through authenticated `StreamableHTTPServerTransport`; Secure MCP Tunnel hardening remains a scale-path item.
- SAP remains read-only: the demo invoice header and billing-item collection reads target `ZUI_BILLINGDOCUMENTFS_0001/C_BillingDocumentFs` and `C_BillingDocumentItemFs` through metadata-validated GETs. Owner R2-5 locks the R1 SAP-primary/Supabase-fallback source set, and that bounded set is callable through `sources.r1Read` plus `GET /sources/r1/:need`; live source expansion beyond that R1 set remains deferred.
- Keep the implemented table-reading adapters for SAP, bureau, docs, remittance/EDI, and TPM behind read-only service boundaries; keep `/run`/MCP SAP/docs/TPM/bureau retrieval Supabase-required and fail-closed; keep readiness blocked when the Supabase probe returns 404/not-exposed or finds unsafe shadow statuses such as `SENT_TO_SAP`, `SUBMITTED_TO_PORTAL`, or `SAP_STAGE_WRITE`; broader VERIFY-V3 live non-SAP contracts remain deferred.
- Live text/voice query requires `OPENAI_API_KEY` for real sessions; the local guard rejects empty questions, decouples Realtime credential checks from unrelated connector config, and exposes the audit policy without persisting raw audio or uncited transcripts.
