# Internal Demo Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Recoup internally demo-ready with the updated SAP sandbox and `docs/Tools_data` Supabase data while preserving deterministic dollar computation, cited evidence, read-only SAP, and HITL-only external actions.

**Architecture:** Add demo-readiness and source-readiness surfaces around the existing deterministic spine. SAP and Supabase data stay behind adapters/services; `src/core/` receives injected config and canonical data only. The DB-backed governed config loader validates and freezes `recoup_config` rows, while config-as-code remains a degraded demo fallback if the DB is unavailable.

**Tech Stack:** Node 22, TypeScript, Zod, Decimal.js, Vitest, Supabase PostgREST, SAP OData GET-only client, Express cockpit API, Next.js cockpit.

---

## Task 1: Governed Config Loader

**Files:**
- Modify: `config/governed.ts`
- Modify: `src/memory/supabaseStore.ts`
- Modify: `config/env.ts`
- Test: `tests/invariants/governed-config.test.ts`
- Test: `tests/unit/supabase-memory.test.ts`
- Test: `tests/invariants/runtime-config.test.ts`

- [ ] Write failing tests that parse active `recoup_config` rows into a frozen runtime snapshot with `configVersion`, aggregate `configHash`, validated values, and per-key row hashes.
- [ ] Write failing Supabase repository test proving the loader reads `/rest/v1/recoup_config?active=eq.true...`, sends only service-role server headers, validates row hashes, and does not expose the service key.
- [ ] Implement row normalization for snake_case PostgREST rows and camelCase test rows.
- [ ] Implement `createSupabaseGovernedConfigRepository(...).loadActive()` and `createSupabaseGovernedConfigRepositoryFromEnv(...)`.
- [ ] Update runtime config metadata so `db-backed-governed-config-loader` is no longer listed as missing implementation; production calibration remains deferred.
- [ ] Run targeted governed config and Supabase tests.

## Task 2: SAP Tools Data Mapping

**Files:**
- Modify: `src/adapters/sapOData.ts`
- Modify: `src/adapters/connectorRegistry.ts`
- Test: `tests/unit/sap-odata.test.ts`
- Test: `tests/invariants/connector-readiness.test.ts`

- [ ] Write failing tests for Tools_data service mappings:
  - `ZUI_BILLINGDOCUMENTFS_0001 / C_BillingDocumentFs`
  - `ZUI_BILLINGDOCUMENTFS_0001 / C_BillingDocumentItemFs`
  - `ZAPI_SALES_ORDER_SRV_0001 / A_SalesOrder`
  - `ZUI_CREDITACCOUNT_DISPLAY_0001 / CreditAccountSummary`
  - `ZUI_CREDITEXPOSURE_DISPLAY_0001 / CreditExposure`
- [ ] Ensure metadata coverage validates these service/entity/key combinations and reports degraded status if a mapped service is absent.
- [ ] Preserve GET-only behavior; no CSRF, POST, PATCH, DELETE, or ERP mutation path.
- [ ] Include demo invoice and customer IDs from `docs/Tools_data/CODEX_CONFIG.md` as mapping evidence, not as core dollar-computation inputs.
- [ ] Run SAP and connector readiness tests.

## Task 3: Supabase Tool-Data Readiness

**Files:**
- Modify: `src/adapters/enterpriseReadOnly.ts`
- Modify: `src/adapters/connectorRegistry.ts`
- Modify: `src/memory/supabaseStore.ts`
- Test: `tests/unit/enterprise-connectors.test.ts`
- Test: `tests/invariants/connector-readiness.test.ts`
- Test: `tests/unit/supabase-memory.test.ts`

- [ ] Write failing tests for the Tools_data external tables: `customers`, `payments`, `pod_records`, `carrier_reports`, `damage_photos`, `promotions`, `contracts`, `bureau_alerts`, `remittance_headers`, `remittance_lines`, `deductions_backlog`, `billing_requests`, `recovery_packages`, `credit_decisions`.
- [ ] Add a read-only table readiness probe that uses Supabase PostgREST counts or limited reads without returning secret-bearing values.
- [ ] Map connector readiness reasons to the Tools_data tables while keeping legacy `recoup_src_*` status visible as the canonical source-swap foundation.
- [ ] Keep all non-SAP live source contracts deferred to VERIFY-V3; this is demo shadow/source data, not production source contracts.
- [ ] Run enterprise connector and Supabase tests.

## Task 4: Cockpit Demo Readiness Surface

**Files:**
- Modify: `src/services/cockpitModel.ts`
- Modify: `src/services/cockpitApi.ts`
- Modify: `cockpit/app/page.tsx`
- Modify: `cockpit/app/styles.css`
- Test: `tests/unit/cockpit.test.ts`
- Test: `tests/unit/cockpit-api.test.ts`
- Test: `tests/invariants/cockpit-no-business-logic.test.ts`

- [ ] Write failing tests for a secret-safe demo-readiness model that reports SAP, Supabase tool-data, governed config, Realtime, MCP, and external-write status.
- [ ] Add a GET endpoint for demo readiness or extend the existing connector-readiness model without moving business logic into the cockpit.
- [ ] Render a compact cockpit status band using existing visual patterns.
- [ ] Do not expose keys, raw tokens, or `.env.local` values.
- [ ] Run cockpit tests and visual-safe invariants.

## Task 5: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/vscode-handoff-status.md`
- Modify: `docs/architecture-review-and-recommendations.md`
- Modify: `docs/independent-audit-log.md`
- Test: `tests/invariants/readme-contract.test.ts`

- [ ] Update docs so DB-backed governed config is implemented when tests prove it; keep VERIFY-PROD calibration, embeddings model id, Codex build-model id, and production SAP/non-SAP contracts as deployment dependencies.
- [ ] Add the Tools_data SAP/Supabase mapping to the judge/demo evidence story without claiming ERP write-back or production live contracts.
- [ ] Run `git diff --check`.
- [ ] Run `npm.cmd run verify`.
- [ ] Run secret-safe live readiness smoke checks against local env, SAP metadata, and Supabase table availability.
- [ ] Complete self-verification and senior-review notes.
