# Independent Multi-Agent Audit Log

Purpose: make Recoup's independent review trail judge-visible without relying on chat history. This log summarizes the read-only/subagent audits performed during the build, the findings they produced, the fixes implemented, and the evidence a reviewer can inspect locally.

Verification command for the current proof pack:

```powershell
npm.cmd run verify
```

## Audit Summary

| Audit Area | Reviewer Mode | Key Findings | Status | Evidence |
|---|---|---|---|---|
| Architecture and harness | Independent architecture review | Memory, skills, handoffs, permission metadata, run control, audit replay, and launch gates needed clearer implementation status. | Partially resolved | `docs/architecture-review-and-recommendations.md`, `src/memory/`, `src/agents/handoffGraph.ts`, `src/services/conductor.ts`, `tests/invariants/memory-contract.test.ts`, `tests/invariants/run-control.test.ts` |
| Supabase memory | Independent memory/Supabase audit | Supabase must be the primary shared memory path; live Postgres timestamps must round-trip into Recoup's ISO memory contract. | Resolved baseline | `src/memory/supabaseStore.ts`, `docs/supabase-memory-schema.sql`, `tests/unit/supabase-memory.test.ts`, `tests/unit/runtime-memory.test.ts` |
| SQLite memory | Independent memory audit | Runtime memory needed durable SQLite-backed records and cockpit visibility. | Resolved baseline | `src/memory/sqliteStore.ts`, `src/memory/runtime.ts`, `src/services/cockpitApi.ts`, `tests/unit/sqlite-memory.test.ts`, `tests/unit/cockpit-api.test.ts` |
| SAP OData | Independent SAP connector audit | SAP must stay read-only, protect credentials, support OAuth or Gateway Basic auth, and map live OData payloads to evidence. | Resolved baseline; O2C service availability remains open | `src/adapters/sapOData.ts`, `src/tools/retrieval/sap.ts`, `skills/sap-odata-access/SKILL.md`, `tests/unit/sap-odata.test.ts`, `tests/invariants/no-erp-writeback.test.ts` |
| Cockpit auth and Realtime | Independent security audit | Cockpit approval and Realtime secret endpoints allowed forged human context. Service approval path hard-coded a human approver. Realtime credential gating was coupled to unrelated connector config. | Resolved hackathon guard; live client-secret proof captured | `src/services/cockpitApi.ts`, `src/services/realtimeSession.ts`, `src/services/serviceLayer.ts`, `cockpit/app/approval-controls.tsx`, `cockpit/app/realtime-query-controls.tsx`, `tests/unit/cockpit-api.test.ts`, `tests/unit/realtime-session.test.ts`, `tests/invariants/integration-contract.test.ts` |
| MCP and tool permissions | Independent MCP/RBAC audit | Production MCP endpoint and helper facade needed auth; MCP calls needed actor capability checks; internal approval/core tools must remain hidden. | Resolved hackathon guard | `src/mcp/server.ts`, `src/services/permissionEngine.ts`, `tests/invariants/mcp-transport.test.ts`, `tests/invariants/mcp-visibility.test.ts`, `tests/invariants/tool-permissions.test.ts` |
| UI/UX against O2C Design System | Independent visual audit | Cockpit needed restrained operational framing, a desktop hero workflow, and mobile table ergonomics. | Resolved first-viewport QA baseline | `cockpit/app/page.tsx`, `cockpit/app/styles.css`, `tests/invariants/cockpit-no-business-logic.test.ts`, `O2C Design System v3.1.dc.html` |
| Connector readiness | Independent connector/security audit | Bureau, remittance/EDI, document repository, and TPM adapters need real schemas before production-grade mappings. | Open pending source contracts | `src/adapters/connectorRegistry.ts`, `src/adapters/bureau.ts`, `src/adapters/remittance.ts`, `src/adapters/ediRemittance.ts`, `src/adapters/docRepo.ts`, `src/adapters/tpm.ts`, `tests/invariants/connector-readiness.test.ts` |

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
- Read-only MCP clients are denied draft action calls before tool handler execution.
- `approvals.decide`, core compute tools, and decision tools remain absent from MCP visibility.

Evidence: `tests/invariants/mcp-transport.test.ts`, `tests/invariants/mcp-visibility.test.ts`, `tests/invariants/tool-permissions.test.ts`.

### Read-Only SAP Baseline

- SAP OData adapter exposes read and request-planning methods only.
- The local SAP OData skill guides metadata-first, read-only Gateway access and blocks SAP mutation paths inside Recoup.
- OAuth client-credentials token retrieval is isolated from SAP business reads, and Gateway Basic auth is supported when `SAP_ODATA_USERID` plus the configured secret are present.
- Secret-bearing connection details are not serialized through runtime config or adapter JSON.
- Live Basic-auth metadata proof on June 19, 2026 returned HTTP 200 for `FCOM_COSTCENTER_SRV/$metadata` and exposed `CostCenterSet` plus `F4_CostCenterSet` without requiring scope or tenant.
- Live OData payload mapping to Recoup evidence is covered by unit tests.

Evidence: `tests/unit/sap-odata.test.ts`, `tests/invariants/no-erp-writeback.test.ts`, `tests/invariants/integration-contract.test.ts`.

### Supabase Durable Memory Baseline

- Supabase/Postgres is selected ahead of SQLite when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured.
- The generated DDL and reviewable SQL artifact stay aligned, with constrained memory categories, record IDs, indexes, RLS enablement, and service-role-only grants.
- Live Supabase REST table reads were verified for `recoup_memory_records`.
- Postgres `timestamptz` rows are normalized to Recoup's internal ISO datetime memory contract before Zod validation.

Evidence: `tests/unit/supabase-memory.test.ts`, `tests/unit/runtime-memory.test.ts`, `docs/supabase-memory-schema.sql`.

### Cockpit Visual QA Baseline

- `tests/invariants/cockpit-no-business-logic.test.ts` passes after removing the over-framed medium shadow and restoring the desktop workflow grid.
- Playwright with installed Chrome verified desktop `1440x900` and mobile `390x844`: page identity, nonblank render, no framework overlay, no console errors, and refresh-button interaction focus.
- Mobile navigation now wraps instead of clipping, and the worklist uses a compact mobile table so amount cells remain visible.

Evidence: `cockpit/app/styles.css`, `tests/invariants/cockpit-no-business-logic.test.ts`.

## Open Findings For Judges

These are intentionally visible because Recoup's contract says not to invent missing enterprise constants or source schemas.

| Open Finding | Why It Is Open | Required Owner Input |
|---|---|---|
| Expert-owned constants | Arbitration weights, R-score weights, drift thresholds, and gaming thresholds are expert-owned and must not be guessed. | Finance/risk owner approval of provisional demo values or final Appendix G constants. |
| Real SAP S/4HANA O2C query mapping | Read-only OAuth/Basic OData baseline and live Gateway metadata proof exist, but the mapped billing/outbound-delivery services still need reachable endpoints and metadata-backed entity mapping. | Reachable O2C SAP services, entity sets, key fields, and sample payloads. |
| Bureau/remittance/EDI/docs/TPM schemas | Adapter scaffolds exist; production mappings need exact schemas and evidence rules. | Source contracts, field dictionaries, example payloads, and reconciliation keys. |
| Full cockpit depth | First-viewport desktop/mobile visual QA baseline is resolved; deeper interactive drilldowns remain planned. | Final O2C design review for expanded flows beyond the first viewport. |
| Enterprise identity | Hackathon guards use configured principal/token headers. | Production IdP/OAuth/KMS/Secure MCP Tunnel decision. |

## Judge Review Path

1. Start with `README.md` for the demo narrative and claim-to-code-to-test map.
2. Open this file for the independent audit evidence trail.
3. Open `docs/architecture-review-and-recommendations.md` for broader architecture findings and resolved/open status.
4. Run `npm.cmd run verify` to validate invariants, unit tests, eval gates, and dependency-cruiser boundaries.
