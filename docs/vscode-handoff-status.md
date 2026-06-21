# Recoup VS Code Handoff Status

Date: 2026-06-21
Workspace: `C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup`
Branch: `codex/guardrail-riskmesh-hardening`
Remote: `https://github.com/rathishpadman/Recoup.git`
Remote branch: not pushed for this local session branch
PR URL: not opened for this local session branch

## Current Git Status

- Active work is on local session branch `codex/guardrail-riskmesh-hardening`.
- The Windows EOL verification fix was preserved in commit `7fccd47 Preserve Windows verification newline fixes`.
- The current session is reconciling stale handoff docs, named guardrail surfaces, and the Risk Mesh service/tool boundary.
- Prior pushed-branch notes are historical and no longer describe the active local branch.

## Last Verification Evidence

Before pushing, the full repo gate passed:

```powershell
npm.cmd run verify
```

Result:

- ESLint passed.
- TypeScript typecheck passed.
- Vitest passed: `61` test files, `322` tests.
- Dependency Cruiser passed with no dependency violations.

Note: after the split-push rewrite, the final tree was verified to match the previously verified commit tree. No source files were intentionally changed during the split.

## High-Level Build Status

Recoup is now a deterministic, agent-ready O2C recovery cockpit for the NorthBay demo story. The implemented build keeps the repo contract intact:

- Code computes dollar amounts.
- Decisions cite record IDs and deterministic basis.
- SAP remains read-only.
- External actions remain human-approved and draft-only.
- Expert-owned constants are not invented.

## Completed Work

### Supabase And Durable Memory

- Supabase/Postgres is wired as the primary shared durable memory path when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured.
- SQLite remains the local/offline fallback when `RECOUP_MEMORY_DB_PATH` is configured.
- In-memory store remains for test/demo harness paths without durable config.
- Memory categories are typed and scoped: session, workflow, case, transaction, evidence, approval, audit, connector, artifact, compaction, and agent-handoff state.
- Supabase schema SQL is captured in `docs/supabase-memory-schema.sql`.
- Postgres `timestamptz` values are normalized to Recoup ISO memory timestamps before Zod validation.
- Tests cover schema SQL, REST upsert/list behavior, timestamp normalization, runtime backend selection, and SQLite fallback.

Key files:

- `src/memory/supabaseStore.ts`
- `src/memory/sqliteStore.ts`
- `src/memory/runtime.ts`
- `src/memory/schema.ts`
- `src/memory/session.ts`
- `tests/unit/supabase-memory.test.ts`
- `tests/unit/sqlite-memory.test.ts`
- `tests/unit/runtime-memory.test.ts`
- `tests/invariants/memory-contract.test.ts`

### SAP OData

- SAP OData adapter remains read-only.
- No ERP write-back path was added.
- OAuth and Gateway Basic auth are supported for read-only metadata/GET access.
- Scope and tenant are optional when the SAP endpoint does not require them.
- `docs/Tools_data` invoice reads are mapped to `ZUI_BILLINGDOCUMENTFS_0001/C_BillingDocumentFs`.
- `SAP_ODATA_CLIENT` is required for live SAP readiness and is sent as `sap-client` on metadata/read GETs.
- Non-numeric synthetic `INV-*` IDs fail closed instead of becoming live SAP reads.
- POD, credit memo, and duplicate-claim proof are no longer emitted as SAP fallback evidence.
- Live Basic-auth metadata proof was captured for `FCOM_COSTCENTER_SRV/$metadata`.
- The live metadata proof exposed `CostCenterSet` and `F4_CostCenterSet`.
- SAP credential details are not serialized in runtime config output.
- The SAP skill is installed under `skills/sap-odata-access/SKILL.md`.

Key files:

- `src/adapters/sapOData.ts`
- `src/tools/retrieval/sap.ts`
- `skills/sap-odata-access/SKILL.md`
- `tests/unit/sap-odata.test.ts`
- `tests/invariants/no-erp-writeback.test.ts`
- `tests/invariants/integration-contract.test.ts`

### OpenAI Realtime Query Guard

- `gpt-realtime-2` is pinned behind a server-issued client-secret route.
- `POST /query/realtime-client-secret` requires verified cockpit human auth.
- The verified human principal is used as the `OpenAI-Safety-Identifier`.
- Realtime issuance gates only on `OPENAI_API_KEY`; unrelated SAP/Supabase config parsing cannot block it.
- Local live proof returned HTTP `200`, status `issued`, transport `webrtc`, and audit record `OPENAI-REALTIME-POLICY`.
- No OpenAI key or client secret value was printed.
- Browser voice/text remains a controlled demo surface wired through the guarded Realtime browser helper; production live-query policy and identity remain approval dependencies.

Important caveat:

- The local Windows/Node HTTPS path exposed `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`.
- The live proof used one process-scoped TLS bypass only.
- Production/demo machines should fix the trusted CA chain rather than use TLS bypass.

Key files:

- `src/services/realtimeSession.ts`
- `src/services/cockpitApi.ts`
- `cockpit/app/realtime-query-controls.tsx`
- `cockpit/app/api/query/realtime-client-secret/route.ts`
- `tests/unit/realtime-session.test.ts`
- `tests/unit/cockpit-api.test.ts`

### Cockpit UI And API

- Cockpit has Forensics, Credit/Arbitration, CFO Summary, Agent Operations, memory, and trace bands.
- First viewport desktop SaaS polish was applied against the O2C design system.
- Mobile navigation wraps instead of clipping.
- Mobile worklist table is compact enough to keep amount cells visible.
- Approval controls are HITL-gated and route through the local API.
- Realtime client-secret controls are present but still a controlled demo affordance.
- Playwright/installed Chrome visual QA verified desktop `1440x900` and mobile `390x844`: nonblank render, no framework overlay, no console errors, and interaction focus.

Key files:

- `cockpit/app/page.tsx`
- `cockpit/app/styles.css`
- `cockpit/app/approval-controls.tsx`
- `cockpit/app/realtime-query-controls.tsx`
- `src/services/cockpitApi.ts`
- `src/services/cockpitModel.ts`
- `tests/unit/cockpit.test.ts`
- `tests/unit/cockpit-api.test.ts`
- `tests/invariants/cockpit-no-business-logic.test.ts`

### Agent Harness And Communication

- Offline-safe agent roster is declared for Forensics, Recovery Drafter, Risk Mesh, Sentinel, Containment, and Conversational Query.
- Forensics to Recovery handoff is represented in the implemented S4 boundary.
- Handoff graph and Zod handoff packets are implemented.
- Handoff packets carry `recordIds`.
- Query remains deterministic/offline-safe for answers and cites deterministic Harbor state.
- Risk Mesh/Sentinel/Containment remain deterministic harness modules. Owner-ratified Day-1 tunables from `CODEX_BUILD_ANSWERS.md` now have config-as-code bootstrap plus `recoup_config` v1 seed rows; the DB-backed runtime config loader/injection and VERIFY-PROD calibration remain open.

Key files:

- `src/agents/agentRuntime.ts`
- `src/agents/forensics.ts`
- `src/agents/handoffGraph.ts`
- `src/agents/messages.ts`
- `src/agents/query.ts`
- `src/agents/riskMesh.ts`
- `tests/unit/agent-runtime.test.ts`
- `tests/unit/agent-handoffs.test.ts`
- `tests/unit/query.test.ts`

### MCP, Permissions, And Service Boundary

- MCP server uses `StreamableHTTPServerTransport`.
- `/mcp` is protected when MCP auth is configured.
- Tool metadata includes risk class, side-effect class, and MCP/internal visibility.
- Read-only MCP clients are denied draft action calls before handler execution.
- Approval, core compute, and decision tools remain internal and are not MCP-visible.
- Service tools are namespaced, typed, and Zod-validated.

Key files:

- `src/mcp/server.ts`
- `src/services/serviceLayer.ts`
- `src/services/permissionEngine.ts`
- `tests/invariants/mcp-transport.test.ts`
- `tests/invariants/mcp-visibility.test.ts`
- `tests/invariants/tool-permissions.test.ts`
- `tests/invariants/tool-whitelist.test.ts`

### Audit And Judge Evidence

- README now includes the demo narrative, OpenAI capability map, memory, skills, handoffs, permissions, and claim-to-code-to-test table.
- Independent audit evidence is captured outside chat in `docs/independent-audit-log.md`.
- Broader architecture review and open recommendations are captured in `docs/architecture-review-and-recommendations.md`.
- Judge-visible evidence includes Supabase, SAP, Realtime, MCP, UI, and connector-readiness status.

Key files:

- `README.md`
- `docs/independent-audit-log.md`
- `docs/architecture-review-and-recommendations.md`

## Skills Used During The Build

### Codex/Superpowers Process Skills

- `superpowers:using-superpowers`
- `superpowers:test-driven-development`
- `superpowers:systematic-debugging`
- `superpowers:verification-before-completion`
- `superpowers:writing-plans`
- `superpowers:executing-plans`
- `superpowers:dispatching-parallel-agents`
- `superpowers:subagent-driven-development`
- `superpowers:requesting-code-review`
- `superpowers:finishing-a-development-branch`

### Domain/Implementation Skills

- `build-web-apps:supabase-postgres-best-practices`
- `build-web-apps:frontend-testing-debugging`
- `build-web-apps:frontend-app-builder`
- `build-web-apps:react-best-practices`
- `openai-docs`

### Local Recoup Skills Added

- `skills/recoup-evidence-pack/SKILL.md`
- `skills/recoup-recovery-drafting/SKILL.md`
- `skills/recoup-risk-arbitration/SKILL.md`
- `skills/recoup-query-answering/SKILL.md`
- `skills/sap-odata-access/SKILL.md`

### Subagent / Independent Review Work

- Memory/Supabase review.
- SAP connector review.
- UI/UX cockpit visual review.
- Realtime client-secret/security review.
- Architecture and harness review.

## Pending Items

### Expert-Owned Tunables

Owner-ratified Day-1 tunables are supplied for the demo in `CODEX_BUILD_ANSWERS.md`, and the repo now includes config-as-code bootstrap plus `recoup_config` v1 seed rows. The next implementation step is the DB-backed governed config loader/injection; remaining production calibration and owner `[VERIFY]` flags must not be guessed:

- Arbitration P&L weights.
- R-score weights.
- Drift thresholds.
- Gaming thresholds.
- Embeddings model id.
- Codex build-model id.
- SAP sandbox instance.

### SAP / O2C Live Depth

- SAP read-only Gateway metadata proof exists.
- Live O2C billing/outbound-delivery services still need reachable endpoints.
- Need metadata-backed entity sets, key fields, and sample payloads for actual O2C evidence mapping.
- ERP write-back remains out of scope.
- SAP must stay read-only.

### Realtime / Query

- Server-side Realtime client-secret path is live-proved.
- Browser voice/text session is wired through the guarded Realtime browser helper; production live-query policy remains an approval dependency.
- Live answers must remain constrained to deterministic query tools and cited Recoup records.
- Local Node/Windows CA trust should be fixed to avoid TLS bypass during demos.

### Supabase / Memory Scale Path

- Supabase runtime memory is wired and tested.
- SQLite fallback exists.
- Replay-grade audit/memory rehydration remains a scale-path item.
- Production RLS/auth principal model should be hardened beyond service-role-only hackathon access.

### MCP / Enterprise Deployment

- MCP StreamableHTTP auth and RBAC baseline are implemented.
- Secure MCP Tunnel/private-network hardening remains a scale-path item.
- Production IdP/OAuth/KMS decisions remain open.

### Connector Strategy

SAP remains the only live adapter. Workflow 2B implements the Day-1 synthetic Supabase static table schema and readiness foundation for the other sources behind canonical source ports:

- Bureau feed.
- Remittance.
- EDI.
- Document repository.
- TPM.

Implemented foundation:

- Added static Supabase table definitions for bureau, docs, consolidated remittance/EDI, and TPM.
- Connector readiness reports non-SAP sources as `ready_synthetic` only after a Supabase schema probe verifies the `docs/Tools_data` tables.
- Credentials without a successful probe report `blocked_schema_required`, not ready.
- Readiness blocks on missing/not-exposed `Tools_data` tables and unsafe shadow statuses such as `SENT_TO_SAP`, `SUBMITTED_TO_PORTAL`, or `SAP_STAGE_WRITE`.
- `docs/Tools_data/seed_data.sql` remains human-approval only because it truncates tables and seeds action/decision/audit-like rows.
- `recoup_src_remittance` is the shared static table for remittance and EDI-remittance via `transaction_set`.

Remaining implementation:

- Add full synthetic table-reading adapters if source retrieval expands beyond readiness.
- Keep `provenance = synthetic` and semi-trusted connector state visible in any seeded connector records.
- Preserve the source-swap boundary so live contracts can replace synthetic adapters later without changing core/services.
- Keep real non-SAP live contracts deferred to VERIFY-V3.

### Cockpit Product Depth

- First-viewport desktop/mobile QA baseline is resolved.
- Deeper drilldowns and expanded workflows remain planned.
- Final O2C design review is still needed for expanded flows beyond the first viewport.

### Git / Repo Hygiene

- Local branch `codex/guardrail-riskmesh-hardening` contains the preserved EOL verification fix and current guardrail/Risk Mesh hardening work.
- This session branch has not been pushed.
- Open a PR only after `npm.cmd run verify` is green on the final diff.

## How To Run In VS Code

Open the repo folder:

```powershell
cd "C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup"
code .
```

Install dependencies if needed:

```powershell
npm.cmd install
```

Run the full guard:

```powershell
npm.cmd run verify
```

Run the API:

```powershell
npm.cmd run dev:api
```

Run the cockpit:

```powershell
npm.cmd run dev:cockpit
```

Default API URL:

```text
http://127.0.0.1:4317
```

Open the Next.js URL printed by `dev:cockpit`.

## Demo Flow

The live story is a two-persona demo:

- Maya Patel is the Deduction Forensics analyst: she works the recovery queue, evidence pack, draft action, approval controls, run trace, and guarded Realtime query.
- David Kim is the Credit / Arbitration lead: he reviews Harbor through Sentinel, Risk Mesh arbitration, deterministic partial-hold split, draft terms, and pending human approvals.
- CFO Summary remains the read-only executive close.

1. Start on the Forensics queue and show recovery and billing-prevention drafts.
2. Open evidence pack and record IDs for a recovery line.
3. Use approval controls to show human approval and audit hash output.
4. Ask the guarded Realtime query why Harbor is blocked and show cited-or-blocked output.
5. Move to Credit/Arbitration and explain Harbor's governed partial-hold split.
6. Show Agent Operations: MCP surface, typed memory categories, handoff graph, and trace timeline.
7. Close with CFO Summary and explicitly call out open VERIFY-PROD calibration dependencies.

## Safety Reminders

- Do not print `.env.local` values.
- Do not commit `.env.local`; it is ignored.
- Use `npm.cmd`, not `npm`, in this Windows workspace.
- Node 25 is accepted for this hackathon, though the repo runtime target remains Node 22+ TypeScript.
- Do not add ERP write-back.
- Do not invent domain constants.
- For any rule, guard, score, memory, schema, or decision-producing change, use tests-first.
