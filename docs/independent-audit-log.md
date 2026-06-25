# Independent Multi-Agent Audit Log

Purpose: make Recoup's independent review trail judge-visible without relying on chat history. This log summarizes the read-only/subagent audits performed during the build, the findings they produced, the fixes implemented, and the evidence a reviewer can inspect locally.

Verification command for the current proof pack:

```powershell
npm.cmd run verify
```

This remains the proof-pack command because it includes `verify:release`, which reads owner-approved run-control and eval-label rows from Supabase `recoup_config`. Current 2026-06-25 controller evidence is green: `npm.cmd run verify` passed with lint, typecheck, 89 Vitest files / 737 tests, dependency-cruiser clean with 115 modules / 367 dependencies, and release readiness passed. `npm.cmd run test:e2e:maya-real` passed against `http://127.0.0.1:4318` and reached backend `/forensics/query` for 4 Maya browser query scenarios with 32 backend trace rows, including live OpenAI Agents SDK Forensics Investigator -> Recovery Drafter hook receipts while the visible answer remained deterministic and cited. Phase 0 reproducibility is not complete because the current repo remains dirty/untracked with nothing staged; do not describe the shared workspace as commit-clean or reproducible until a clean review branch/snapshot is created and the proof pack is rerun there. The server-rendered Maya pages now forward verified human backend-read headers for protected `/forensics` and `/connectors` fetches.

## Maya Real-Backend SAP/Supabase Closure - 2026-06-24

This entry supersedes the earlier blocked `recoup_src_sap` note for Maya real-backend readiness.

Current source/data state:

- Supabase project `nmwfftudympcvcjtyjbf` now has `public.recoup_src_sap` with 12 clean `sap-odata` read-model rows covering S1-S6 from `ZUI_BILLINGDOCUMENTFS_0001/C_BillingDocumentFs` and `ZUI_BILLINGDOCUMENTFS_0001/C_BillingDocumentItemFs`.
- The two stale Harbor SAP cache rows for invoice `90000005` were deleted because live SAP returned `SoldToParty=USCU_L02` while owner/Supabase mapping identifies Harbor as `USCU_S04`. Runtime SAP evidence readers now reject any stored SAP header row where linked `USCU_*` provenance contradicts `payload_json.d.SoldToParty`.
- S7/S8 intentionally have no SAP coverage until the owner/source mapping is reconciled or SAP supplies a matching invoice. They remain covered through real Supabase docs/TPM/bureau evidence rows and Maya E2E still passes.
- The SAP provisioner is read-only against SAP and writes no ERP data. It builds `recoup_src_sap` rows from approved source links, validates `BillingDocument` and `SoldToParty` before row creation, keeps mapping provenance in `linked_record_ids`, and fails before SQL output when diagnostics or expected line coverage gaps exist.

Files and proof:

- `src/services/sapSupabaseEvidenceProvisioner.ts`
- `scripts/provisionSupabaseSapEvidenceRows.ts`
- `src/adapters/supabaseSyntheticSource.ts`
- `tests/unit/sap-supabase-evidence-provisioner.test.ts`
- `tests/unit/enterprise-connectors.test.ts`
- `tests/unit/supabase-memory.test.ts`
- `tests/e2e/maya-real-backend-e2e.ts`

Fresh verification:

```powershell
npm.cmd run test -- tests/unit/sap-supabase-evidence-provisioner.test.ts tests/unit/supabase-memory.test.ts tests/unit/enterprise-connectors.test.ts
npm.cmd run test:e2e:maya-real
npm.cmd run verify
```

The real-backend E2E harness records backend calls to `/forensics`, `/connectors`, `/forensics/work-items/:lineId`, and `/forensics/query`, compares backend trace rows to app/DOM rows, rejects fixture API and Playwright route/fulfill fragments, and captures Beat 1-through-12 screenshots in `output/playwright/e2e/real-backend/`.

Final subagent reviewer gate for the mixed SAP-customer provenance fix reported P0/P1/P2 none. A later live-agent query boundary reviewer reported two P2s; both are closed by requiring the handoff source and target (`Forensics Investigator` -> `Recovery Drafter`) and by adding route-level run-control, retry, token-budget, no-handoff, and fail-closed tests. The protected-read reviewer findings are closed by server-rendered backend auth headers, stale source-readiness suppression, and SAP live-probe-before-connected enforcement.

## Maya Real-Backend Hardening Evidence - 2026-06-24

This historical entry records the earlier Task 9 source truth and unavailable state before the SAP/Supabase closure above. Older realtime/fixture screenshot notes in this audit log remain historical UI and security evidence; current real-backend readiness is recorded in the superseding entry above.

Source truth:

- `/forensics/shadcn` loads `fetchForensicsModel()` and `fetchConnectorReadinessModel()` from `cockpit/app/cockpit-data.ts`; the Next proxy path maps those calls to Express `/forensics` and `/connectors`, and real backend mode also uses `/forensics/work-items/:lineId` and `/forensics/query`.
- Supabase-backed: KPI/worklist/evidence/draft/retrieval/source-readiness business fields are backend/read-model data built from governed source readers and `recoup_src_*` evidence rows.
- SAP-backed: SAP OData remains read-only; configured SAP health/read-plan facts are backend connector/source-health facts, not UI-generated status.
- Agent-trace-backed: Query answers, citations, deterministic basis, and trace rows come from backend `POST /forensics/query` and deterministic/agent hook trace events.
- Derived backend values: source readiness tone/icon, counts, labels, recommendation/read-only draft posture, and Beat 12 global Source Readiness derive from backend/read-model fields such as `connectors.sourceTiles`.
- UI-only labels: tabs, buttons, navigation, and explicit backend-gap/unavailable labels are presentation only. Business values must be backend/read-model fields or unavailable.

Historical unavailable state, now superseded:

- Earlier real-backend E2E `npm.cmd run test:e2e:maya-real` failed closed at `/forensics` with HTTP `503`, `missingSource=supabase-sap-source-evidence-rows`, and `sourceTableName=recoup_src_sap`.
- Earlier read-only Supabase diagnosis on project `nmwfftudympcvcjtyjbf` found `recoup_src_sap` missing while non-SAP Recoup source tables were populated. This is superseded by the approved `recoup_src_sap` migration/backfill captured in the closure entry above.
- Earlier subagent read-only review found the `recoup_src_sap` schema in `docs/supabase-memory-schema.sql` and `src/memory/supabaseStore.ts`, but found no approved non-dummy real SAP row backfill path in package scripts or provisioning docs. This is superseded by `scripts/provisionSupabaseSapEvidenceRows.ts` and the live SAP/Supabase read-back evidence above.
- Recent controller error body:

```json
{ "error": "Supabase SAP source evidence rows are unavailable or failed validation.", "missingSource": "supabase-sap-source-evidence-rows", "sourceTableName": "recoup_src_sap", "correlationId": "0142c7c9-1c16-42f4-b64e-4d905f4e0331" }
```

This historical entry predates the SAP/Supabase and live-agent-query closure. Current `npm.cmd run test:e2e:maya-real` reaches `POST /forensics/query` and passes with 4 Maya query scenarios / 32 backend trace rows, as recorded in the closure entry above.

Verification commands for the next real-backend gate:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run verify
npm.cmd run test:e2e:maya-real
```

Recent evidence: Task 7 added `package.json` script `test:e2e:maya-real` plus `tests/e2e/maya-real-backend-e2e.ts`; final review passed for real-backend-only behavior with no fixture API, no Playwright `page.route`/fulfill, backend/proxy response-body capture, backend `/forensics/query` trace comparison against app response and DOM rows, and cockpit reuse disabled for acceptance. Historical controller checks earlier covered 86 Vitest files / 698 tests; latest 2026-06-25 controller evidence supersedes that with `npm.cmd run verify` passing lint, typecheck, 89 Vitest files / 737 tests, dependency-cruiser clean with 115 modules / 367 dependencies, and release readiness passed. Fresh `npm.cmd run test:e2e:maya-real` passes against `http://127.0.0.1:4318` and reaches live-agent-backed query orchestration with 4 Maya query scenarios / 32 backend trace rows. Task 8 removed Beat 12 local facet counts, makes global Source Readiness derive from `connectors.sourceTiles`, and added boundary invariants. Task 10 is demo-ready for the implemented real-backend Maya journey, with the documented caveat that S7/S8 SAP evidence remains fail-closed until the owner/SAP customer mapping is reconciled. Phase 0 reproducibility remains blocked by the dirty/untracked worktree with nothing staged.

## Audit Summary

| Audit Area | Reviewer Mode | Key Findings | Status | Evidence |
|---|---|---|---|---|
| Architecture and harness | Independent architecture review | Memory, skills, handoffs, permission metadata, run control, audit replay, and launch gates needed clearer implementation status. | Partially resolved | `docs/architecture-review-and-recommendations.md`, `src/memory/`, `src/agents/handoffGraph.ts`, `src/services/conductor.ts`, `tests/invariants/memory-contract.test.ts`, `tests/invariants/run-control.test.ts` |
| Supabase memory | Independent memory/Supabase audit | Supabase must be the primary shared memory path; live Postgres timestamps must round-trip into Recoup's ISO memory contract. | Resolved baseline | `src/memory/supabaseStore.ts`, `docs/supabase-memory-schema.sql`, `tests/unit/supabase-memory.test.ts`, `tests/unit/runtime-memory.test.ts` |
| SQLite memory | Independent memory audit | Runtime memory needed durable SQLite-backed records and cockpit visibility. | Resolved baseline | `src/memory/sqliteStore.ts`, `src/memory/runtime.ts`, `src/services/cockpitApi.ts`, `tests/unit/sqlite-memory.test.ts`, `tests/unit/cockpit-api.test.ts` |
| SAP OData | Independent SAP connector audit | SAP must stay read-only, protect credentials, support OAuth or Gateway Basic auth, map `docs/Tools_data` invoice IDs through `ZUI_BILLINGDOCUMENTFS_0001/C_BillingDocumentFs`, retrieve billing items only through metadata-validated GET collection filters, and expose the owner-locked R1 SAP-primary needs as metadata-validated GET request plans. Owner R2-5 locks the broader R1 SAP-primary/Supabase-fallback source set; live expansion beyond R1 remains deferred. | Resolved invoice header/item baseline; R1 source-read contract implemented | `src/adapters/sapOData.ts`, `src/services/serviceLayer.ts`, `src/services/cockpitApi.ts`, `src/tools/retrieval/sap.ts`, `skills/sap-odata-access/SKILL.md`, `tests/unit/sap-odata.test.ts`, `tests/unit/r1-source-read.test.ts`, `tests/unit/cockpit-api.test.ts`, `tests/invariants/no-erp-writeback.test.ts` |
| Cockpit auth and Realtime | Independent security audit | Cockpit approval and Realtime secret endpoints allowed forged human context. Service approval path hard-coded a human approver. Realtime credential gating was coupled to unrelated connector config. | Resolved hackathon guard; live client-secret proof captured | `src/services/cockpitApi.ts`, `src/services/realtimeSession.ts`, `src/services/serviceLayer.ts`, `cockpit/app/approval-controls.tsx`, `cockpit/app/realtime-query-controls.tsx`, `tests/unit/cockpit-api.test.ts`, `tests/unit/realtime-session.test.ts`, `tests/invariants/integration-contract.test.ts` |
| MCP and tool permissions | Independent MCP/RBAC audit | Production MCP endpoint and helper facade needed auth; MCP calls needed actor capability checks; internal approval/core tools must remain hidden. The authenticated StreamableHTTP `tools/list` path now proves the bounded advisory agent-to-agent tools are visible while `approvals.decide` stays hidden. | Resolved hackathon guard plus MCP agent-to-agent transport proof | `src/mcp/server.ts`, `src/services/permissionEngine.ts`, `tests/invariants/mcp-transport.test.ts`, `tests/invariants/mcp-visibility.test.ts`, `tests/invariants/tool-permissions.test.ts` |
| UI/UX against O2C Design System | Independent visual audit | Cockpit needed restrained operational framing, a desktop hero workflow, and mobile table ergonomics. | Resolved first-viewport QA baseline | `cockpit/app/page.tsx`, `cockpit/app/styles.css`, `tests/invariants/cockpit-no-business-logic.test.ts`, `O2C Design System v3.1.dc.html` |
| Connector readiness | Independent connector/security audit | SAP stays live read-only; SAP/docs/TPM/bureau runtime evidence now comes from Supabase source tables, while bureau, remittance/EDI, document repository, and TPM use synthetic Supabase source-table readiness for Day 1 after a schema probe verifies the `docs/Tools_data` tables and no unsafe shadow action statuses are present. Production `/run` and MCP SAP/docs/TPM/bureau retrieval now consume Supabase `recoup_src_*` rows and fail closed when required source context is unavailable. | Foundation implemented; live contracts deferred; seed SQL remains human-approval only | `src/adapters/connectorRegistry.ts`, `src/adapters/bureau.ts`, `src/adapters/remittance.ts`, `src/adapters/ediRemittance.ts`, `src/adapters/docRepo.ts`, `src/adapters/tpm.ts`, `src/services/serviceLayer.ts`, `src/mcp/server.ts`, `src/memory/supabaseStore.ts`, `docs/supabase-memory-schema.sql`, `tests/unit/retrieval-tools.test.ts`, `tests/invariants/connector-readiness.test.ts` |
| OpenAI evidence vector store | Independent vector-store/source audit | Vector-store hits must enforce citation metadata and the seed corpus must be provisioned without committing secrets. The owner-approved seed-42 lifecycle is exposed as the manual `npm run provision:openai-evidence-vector-store` command for first provisioning or deterministic seed regeneration. | Resolved seed lifecycle; broader production corpus expansion deferred | `src/adapters/openAiVectorStore.ts`, `scripts/provisionOpenAiEvidenceVectorStore.ts`, `package.json`, `tests/unit/enterprise-connectors.test.ts` |
| R1 source-read surface | Independent source/API audit | Frontend and MCP callers need bounded source retrieval without static code values or SAP mutation. `sources.r1Read` and `GET /sources/r1/:need` now accept only owner-locked R1 source needs, return SAP metadata-validated GET read plans for SAP-primary needs, and return Supabase authoritative read-plan envelopes for locked fallback needs. Reviewer findings closed an unused import, pre-validation SAP metadata fetches, and silent extra-query-key stripping. | Implemented; production expansion beyond locked R1 remains deferred | `src/services/serviceLayer.ts`, `src/services/cockpitApi.ts`, `src/adapters/sapOData.ts`, `tests/unit/r1-source-read.test.ts`, `tests/unit/cockpit-api.test.ts`, `tests/invariants/mcp-visibility.test.ts`, `tests/invariants/integration-contract.test.ts` |

## Resolved Findings

### Cockpit Approval And Realtime Auth

- `POST /approval` requires a configured human principal/token and rejects missing auth before parsing or committing an approval decision.
- `POST /query/realtime-client-secret` requires the same verified human context before any upstream Realtime request.
- Realtime safety identifier is bound server-side to the verified human principal, not a request body value.
- Realtime client-secret issuance now gates only on `OPENAI_API_KEY`; unrelated SAP/Supabase config parsing cannot block the guarded OpenAI path.
- Local live proof on June 19, 2026 returned HTTP 200, `status: issued`, model `gpt-realtime-2`, transport `webrtc`, and audit record `OPENAI-REALTIME-POLICY` without printing secret values. The normal local Node path first exposed `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, so the proof used one process-scoped TLS bypass; production must use a trusted CA chain instead.
- The internal `approvals.decide` service path now requires explicit verified service context and no longer stamps a hard-coded approver.
- Runtime env loading strips a leading UTF-8 BOM before parsing local `.env` files, preventing the first credential key from being dropped.

Evidence: `tests/unit/cockpit-api.test.ts`, `tests/unit/realtime-session.test.ts`, `tests/invariants/runtime-config.test.ts`, `tests/invariants/integration-contract.test.ts`.

### MCP StreamableHTTP And RBAC

- Production MCP uses `StreamableHTTPServerTransport` on `/mcp`.
- `/mcp` rejects unauthenticated requests when MCP auth is configured.
- The legacy helper facade routes are protected by the same auth middleware when mounted.
- Read-only MCP clients and clients with omitted capabilities are denied draft action calls before tool handler execution; `draft_action` must be explicit for MCP draft-only artifacts.
- Authenticated StreamableHTTP `tools/list` exposes the bounded read-only advisory tools `agent_tool_sentinel_position` and `agent_tool_containment_intent_position` for MCP agent-to-agent use, while `approvals.decide`, core compute tools, and decision tools remain hidden.
- Post-fix reviewer `Kierkegaard` found no Critical or Important owner-free MCP/backend code gap after the Supabase-required context repair; docs now distinguish absent source context from present-but-empty evidence rows.
- `approvals.decide`, core compute tools, and decision tools remain absent from MCP visibility.

Evidence: `tests/invariants/mcp-transport.test.ts`, `tests/invariants/mcp-visibility.test.ts`, `tests/invariants/tool-permissions.test.ts`.

### Read-Only SAP Baseline

- SAP OData adapter exposes read and request-planning methods only.
- The local SAP OData skill guides metadata-first, read-only Gateway access and blocks SAP mutation paths inside Recoup.
- OAuth client-credentials token retrieval is isolated from SAP business reads, and Gateway Basic auth is supported when `SAP_ODATA_USERID` plus the configured secret are present.
- The `docs/Tools_data` invoice header mapping uses `ZUI_BILLINGDOCUMENTFS_0001/C_BillingDocumentFs` and requires `SAP_ODATA_CLIENT` so read URLs include `sap-client`.
- Numeric `INV-*` record IDs also build a read-only `C_BillingDocumentItemFs` collection GET filtered by `BillingDocument`; this avoids inventing a `BillingDocumentItem` key when the line only cites an invoice number.
- Empty or malformed item collection payloads are suppressed and do not become cited evidence.
- Synthetic `INV-*` IDs without a numeric SAP suffix fail closed and do not become live SAP reads.
- Production service/MCP SAP evidence retrieval consumes cached Supabase `recoup_src_sap` rows and fails closed when the required source context is unavailable; prefix-derived SAP evidence remains test/setup or legacy adapter behavior only.
- POD, credit memo, and duplicate-claim proof are no longer attributed to SAP by the fallback path; they remain non-SAP evidence unless deterministic SAP keys are added.
- Credit memo/reference live lookup remains owner-bound until a real SAP credit memo key/link field or accessible OData contract is supplied.
- Secret-bearing connection details are not serialized through runtime config or adapter JSON.
- R1 SAP-primary source reads for invoice, sales order, credit account DSO, credit exposure, dispute case, and accrual cap build metadata-validated GET plans only; unsupported or missing metadata fails closed.
- The bounded `sources.r1Read` service/API surface returns Supabase authoritative read-plan envelopes for locked fallback needs instead of hard-coded business values.
- R1 route validation now runs before SAP metadata context creation; malformed SAP-primary params return 400 without a SAP `$metadata` fetch.
- R1 service schemas are strict and route queries use per-need allowlists, so unexpected/narrowing params cannot be stripped into broader read plans.
- Live Basic-auth metadata proof on June 19, 2026 returned HTTP 200 for `FCOM_COSTCENTER_SRV/$metadata` and exposed `CostCenterSet` plus `F4_CostCenterSet` without requiring scope or tenant.
- Live OData payload mapping to Recoup evidence is covered by unit tests.

Evidence: `tests/unit/sap-odata.test.ts`, `tests/invariants/no-erp-writeback.test.ts`, `tests/invariants/integration-contract.test.ts`.

### Probe-Gated Tools Data Readiness

- Supabase credentials alone no longer mark bureau, docs, remittance/EDI, or TPM as `ready_synthetic`.
- The connector readiness model requires a Supabase schema probe for the `docs/Tools_data` tables and reports `blocked_schema_required` for 404/not-exposed tables.
- The probe returns table/status classes only and does not return row IDs, amounts, or service-role secrets.
- Readiness blocks if shadow action tables contain external-action statuses: `billing_requests.status=SENT_TO_SAP`, `recovery_packages.status=SUBMITTED_TO_PORTAL`, or `immutable_audit_log.action_type=SAP_STAGE_WRITE`.
- Production `/run` and MCP SAP/docs/TPM/bureau retrieval paths preload required Supabase `recoup_src_sap`, `recoup_src_docs`, `recoup_src_tpm`, and `recoup_src_bureau` evidence rows and fail closed when that evidence context is absent.
- Generic source `correspondence` rows are not decision evidence unless linked record IDs map them to decision-safe credit-memo evidence.
- `docs/Tools_data/seed_data.sql` is not applied automatically because it runs `TRUNCATE ... CASCADE` and seeds action/decision/audit-like rows.

Evidence: `src/memory/supabaseStore.ts`, `src/adapters/connectorRegistry.ts`, `tests/unit/supabase-memory.test.ts`, `tests/invariants/connector-readiness.test.ts`.

### OpenAI Evidence Vector Store Seed Lifecycle

- `src/adapters/openAiVectorStore.ts` enforces `source_table`, `record_id`, `customer_id`, `scenario_type`, and `provenance=synthetic` metadata before a hit can become cited evidence.
- `scripts/provisionOpenAiEvidenceVectorStore.ts` creates or reuses the evidence vector store, uploads the four deterministic seed dossiers, and writes only `OPENAI_EVIDENCE_VECTOR_STORE_ID` to `.env.local`.
- `package.json` exposes the side-effecting lifecycle as `npm run provision:openai-evidence-vector-store`; it is not part of `npm run verify` and should be run only for first provisioning or deterministic seed regeneration unless cleanup-idempotency is added later.
- No OpenAI API key, vector-store ID, SAP credential, or Supabase service key is committed or printed in this audit log.

Evidence: `src/adapters/openAiVectorStore.ts`, `scripts/provisionOpenAiEvidenceVectorStore.ts`, `package.json`, `tests/unit/enterprise-connectors.test.ts`.

### Supabase Durable Memory Baseline

- Supabase/Postgres is selected ahead of SQLite when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured.
- The generated DDL and reviewable SQL artifact stay aligned, with constrained memory categories, record IDs, indexes, RLS enablement, and service-role-only grants.
- The same schema artifact now includes `recoup_src_sap` with `provenance = sap-odata` and Day-1 synthetic source tables for bureau, docs, consolidated remittance/EDI, and TPM with `provenance = synthetic`.
- Live Supabase REST table reads were verified for `recoup_memory_records`.
- Postgres `timestamptz` rows are normalized to Recoup's internal ISO datetime memory contract before Zod validation.

Evidence: `tests/unit/supabase-memory.test.ts`, `tests/unit/runtime-memory.test.ts`, `docs/supabase-memory-schema.sql`.

### Cockpit Visual QA Baseline

- `tests/invariants/cockpit-no-business-logic.test.ts` passes after removing the over-framed medium shadow and restoring the desktop workflow grid.
- Playwright with installed Chrome verified desktop `1440x900` and mobile `390x844`: page identity, nonblank render, no framework overlay, no console errors, and refresh-button interaction focus.
- Mobile navigation now wraps instead of clipping, and the worklist uses a compact mobile table so amount cells remain visible.

Evidence: `cockpit/app/styles.css`, `tests/invariants/cockpit-no-business-logic.test.ts`.

## Open Findings For Judges

These are intentionally visible because Recoup's contract says supplied owner decisions must be implemented through governed config/source boundaries, not guessed in runtime logic.

| Open Finding | Why It Is Open | Required Owner Input |
|---|---|---|
| Expert-owned constants | Arbitration weights, R-score weights, drift thresholds, gaming thresholds, partial-hold config, accuracy bars, Harbor Risk Mesh case facts, David credit display values, Harbor Sentinel source refs, run-control budgets, and seed are owner-ratified Day-1 tunables for the demo and must not be guessed beyond the governed Supabase/config seed rows; `CODEX_BUILD_ANSWERS.md` is referenced historically but is not present in this repo checkout. | Runtime governed config, Harbor `risk_mesh_cases`, Supabase Tools_data R-drift source rows, and run-control loading are wired; production VERIFY-PROD calibration remains required before final operating use. |
| Real SAP S/4HANA O2C query mapping | Read-only OAuth/Basic OData baseline, live Gateway metadata proof, demo invoice header/billing-item reads, and bounded R1 SAP-primary read plans exist. Owner R2-5 locks the R1 SAP-primary/Supabase-fallback source set; live SAP expansion beyond R1 still needs reachable endpoints and metadata-backed entity mapping. | Reachable O2C SAP services, entity sets, key fields, and sample payloads beyond the locked R1 source set. |
| Release readiness gate | `verify:release` is wired into `npm run verify`, reads owner-approved run-control, eval labels, governed values, and Harbor `risk_mesh_cases` facts/display/source-ref values from Supabase `recoup_config`, validates row hashes, compares `expectedRanking` when deterministic arbitration emits ranked options, and fails closed if the DB rows are missing or incomplete. The cockpit `/run` path also loads the same DB-backed `run_control` row, passes DB-loaded `forensics.stepBudget`/`retryCap` into the live runner, records explicit SDK usage metadata against the DB-loaded token budget, and no longer has hard-coded SDK tool/live retry defaults. | Closed for the supplied owner response and Supabase `risk_mesh_cases` migrations; future changes must be made through governed DB rows and source tables, not hardcoded runtime values. |
| SAP/bureau/remittance/EDI/docs/TPM source depth | Supabase source-table schema, readiness foundation, and read-only table-reading adapters are implemented for Day 1; `/run` and MCP use Supabase SAP/docs/TPM/bureau rows in the R1 runtime path. Live mappings remain deferred. | Later source contracts, field dictionaries, example payloads, and reconciliation keys for VERIFY-V3 live adapters. |
| Model/build/runtime verification flags | Embeddings model id, Codex build-model id, and SAP sandbox instance remain owner-verification flags; Recoup must not assert final production identity for them until confirmed. | Owner-confirmed model IDs and SAP sandbox instance before production or published benchmark claims. |
| Full cockpit depth | First-viewport desktop/mobile visual QA baseline is resolved; deeper interactive drilldowns remain planned. | Final O2C design review for expanded flows beyond the first viewport. |
| Enterprise identity | Hackathon guards use configured principal/token headers. | Production IdP/OAuth/KMS/Secure MCP Tunnel decision. |

## Judge Review Path

1. Start with `README.md` for the demo narrative and claim-to-code-to-test map.
2. Open this file for the independent audit evidence trail.
3. Open `docs/architecture-review-and-recommendations.md` for broader architecture findings and resolved/open status.
4. Run `npm.cmd run verify` to validate invariants, unit tests, dependency-cruiser boundaries, and Supabase-backed release readiness.
