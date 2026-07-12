# Handoff: Agent Cost Engineering (Evals + FinOps) — integration brief

Audience: a coding agent (Codex) integrating this feature branch into the main Recoup codebase.

## Where the work lives

- Worktree: `C:/Users/rathi/.config/superpowers/worktrees/Recoup/maya-david-agent-cost-engineering`
- Branch: `codex/maya-david-agent-cost-engineering` (branched from `main`; base HEAD at handoff: `e19d44d`)
- State: **all changes are uncommitted in the working tree** (26 modified files, 8 new paths, ~3,049 insertions). Nothing pushed, nothing merged.
- Full plan (original spec): `docs/superpowers/plans/2026-07-11-maya-david-agent-cost-engineering.md`

## What the feature is

One standalone route `GET /finops` — "Agent cost engineering" — serving all three demo roles from a single page with **server-derived scope** (never client-controlled):

| Login | Scope served by API |
| --- | --- |
| Maya | `maya_forensics_query` only |
| David | `credit_risk` only |
| CFO | Consolidated: both workflows |

It is intentionally **not** linked from Maya's or David's workspace navigation and **not** in any profile's `allowedRoutes` (see gotcha #1). The CFO's existing `/governance/evals-finops` surface is untouched and must stay untouched.

## New files (untracked)

- `cockpit/app/finops/page.tsx` — server component; `requireDemoSession()` (no route-allowlist check — deliberate), `requireBackendReadAuthHeaders([session.role])`, fetches the model, renders shell + surface.
- `cockpit/components/finops/finops-workspace-shell.tsx` — client component; replica of `MayaWorkspaceShell` (shadcn `SidebarProvider`/`Sidebar`, teal `mayaAccent`, single "Evals + FinOps" nav item).
- `cockpit/components/finops/persona-finops-surface.tsx` — server-rendered surface: KPI tiles, pricing band, workflow provenance disclosures, scorecard table, daily-token SVG bar chart, stacked composition bars, recommendations, usage-capture coverage table.
- `cockpit/components/finops/persona-finops-period.ts` — 7/30-day period parsing.
- `tests/unit/persona-finops-surface.test.ts`, `tests/unit/persona-finops-route-source.test.ts` — surface render + route-source invariants.

## Key modified files

- `src/services/evalsFinopsTypes.ts` — `PersonaFinopsPersona = "maya" | "david" | "cfo"`; new `PersonaFinopsCaptureCoverage`; `PersonaFinopsCockpitModel` gains `captureCoverage` (required) and optional summary fields `totalCostLabel`, `averageCostPerRunLabel`, `cacheSavingsLabel`, `costPerCitedAnswerLabel`.
- `src/services/evalsFinopsModel.ts` —
  - `personaFinopsWorkflowScopes` now includes `cfo: ["credit_risk", "maya_forensics_query"]`.
  - `openAiWorkloadCaptureCoverage`: static registry of all 10 known OpenAI workloads with `typed_receipts` / `not_captured` status (persona-filtered per requester; CFO sees all).
  - `buildPersonaCostRollup(...)`: Decimal sums for total cost / cost-per-run / cost-per-cited-answer — **emitted only when every workflow metric is priced in one currency** (fail-closed); cache savings only when computed from owner pricing.
  - Real freshness: `personaFreshnessStatus(...)`, 48h threshold (`personaFinopsFreshnessThresholdHours`); the old hardcoded `"not_configured"` status and `freshness_threshold` blocked-input are gone.
- `src/services/cockpitApi.ts` — `GET /persona-finops` now accepts role `cfo` (plus maya/david); persona = verified server role. Maya/David query paths persist typed usage receipts with `service_tier`.
- `cockpit/app/cockpit-data.ts` — mirror type updated (persona union + captureCoverage + summary fields).
- `cockpit/app/styles.css` — `persona-finops-*` blocks only (KPI auto-fit grid + `.accent` tile, `.finops-stack` segments, `.finops-trend-chart`, legend, coverage table). No `evals-finops-*` (CFO) selectors touched. Note: the design invariant test forbids side borders ≥2px anywhere in this file.
- Pricing/receipt plumbing from earlier tasks: `evalsFinopsRepository.ts` (effective-dated pricing match on model+tier+timestamp, pagination), `openAiUsageReceipt.ts`, `config/models.ts` + `config/openaiPromptCache.ts` (service-tier capture), `docs/supabase-memory-schema.sql`.

## Supabase state (already applied to the live project — do NOT reapply)

1. Pricing rows (owner-approved, effective-dated, hashed, provider-sourced): `gpt-5.4` default tier, `gpt-5.5` default tier in `recoup_model_pricing`.
2. Usage-receipt columns for service tier / telemetry status / participating agents; pricing provenance columns (provider URL, retrieval timestamp).
3. **2026-07-12 backfill:** `recoup_agent_usage_runs.service_tier = 'default'` set on 689 historical rows (91 × gpt-5.4, 598 × gpt-5.5) that predated tier capture. Owner (Rathish) approved. After backfill: 691/691 runs priced; consolidated 30-day totals at verification: USD 13.2497 total, USD 0.0192/run, cache savings USD 2.6243.

## Contracts and invariants to preserve when integrating

1. **Do not add `/finops` to `allowedRoutes`** in `config/cockpitDemoProfiles.ts` or the Supabase demo-user records. `normalizeVerifiedDemoRecord` in `cockpit/app/demo-auth.ts` requires the DB record's `allowed_routes` to exactly match the config profile — changing either side breaks logins for whichever deployment has the other version. That is why `/finops` uses `requireDemoSession()` + server-side API scoping instead.
2. **React never computes business values.** All dollars, rates, and labels come from the backend model (Decimal). The only arithmetic in the surface is SVG/flex geometry scaling. Keep it that way.
3. **Fail-closed rendering.** Missing pricing → "Pricing unavailable" (never $0). Unavailable metrics (p95 latency, cost-per-outcome, human review, unobserved reasoning) are hidden, not faked; the honest detail lives in provenance disclosures.
4. **CFO governance surface unchanged**: `cockpit/app/governance/evals-finops/*` and `evals-finops-*` CSS must not change (tests enforce).
5. Design invariant (`tests/invariants/cockpit-no-business-logic.test.ts`): no side borders ≥2px, no decimal.js imports in cockpit sources, restrained styling.
6. Persona isolation is tested at the API level: Maya responses must never contain David record IDs and vice versa; CFO gets both.

## Test status at handoff

- Full suite: `npm run test` → **1,505 passing, 0 failing** (vitest, `--pool=threads`).
- `npm run typecheck` clean. `npm run lint` / `npm run depcruise` / `npm run verify:release` not yet run in final state — run `npm run verify` before merging.
- Key suites: `persona-finops-surface`, `persona-finops-route-source`, `cockpit-role-auth`, `cockpit-demo-auth`, `cockpit-api` (persona-finops block includes CFO-allowed + unsigned-401 + period validation + cross-persona exclusion), `evals-finops-model/-repository/-rollups`, `agent-cost-calculator`.

## How to run and verify locally

```bash
npm run start:api      # Express cockpit API on :4317 (use start:api, NOT dev:api)
npm run dev:cockpit    # Next.js on :3000
```
Login at `/login` (Maya / david / CFO demo logins), then open `/finops`. Expect: teal sidebar with one "Evals + FinOps" tab; KPI row (Runs, Total cost, Cost/run, Cost/cited answer, Tokens/run, Cache-hit, Cache savings); "Fresh" chip; every scorecard row green "Calculated from effective owner pricing"; daily token bar chart; stacked composition bars; "Usage capture coverage" table listing all 10 workloads.

## Suggested integration steps

1. From the worktree, review `git diff` + untracked files; commit as logical units (backend types/model, API, UI shell+surface+styles, tests) on `codex/maya-david-agent-cost-engineering`.
2. Rebase onto latest `main`; the likeliest conflict surfaces are `src/services/cockpitApi.ts`, `cockpit/app/styles.css`, and test files.
3. Run `npm run verify` (lint + typecheck + tests + depcruise + release readiness).
4. Browser-check `/finops` for all three roles at 1440px and a narrow viewport (no page-level horizontal overflow).
5. Merge / PR per repo convention. No further DB migration is needed — Supabase changes are already live.

## Known gaps / deliberate omissions (candidate follow-ups, not blockers)

- Receipts are only persisted by the Maya copilot query and David credit query paths. Settlement agents (Forensics Investigator, Recovery Drafter, Credit Sentinel, Risk Mesh, Behavioural Containment, Action Packet Drafter), the gpt-5.4-mini negotiation counter extractor, and realtime voice sessions do **not** write typed receipts — the coverage table reports them as "Not captured". Adding capture to those paths is the top follow-up.
- `gpt-5.4-mini` has no owner-approved pricing row; add one before capturing extractor usage.

### Follow-up spec: capture realtime voice usage (owner has confirmed real usage exists)

Why it is invisible today: voice sessions use WebRTC **directly between the browser and OpenAI** (`src/services/realtimeSession.ts`, `transport: "webrtc"`). The server only mints the ephemeral client secret (`POST /query/realtime-client-secret`) and serves tool calls (`POST /query/realtime-tool`). OpenAI's token-usage events (`response.done`, with separate audio and text token counts) arrive on the browser's data channel, so the server never observes usage and nothing reaches `recoup_agent_usage_runs`. The "Not captured" row in the coverage table is the honest fail-closed state, not a bug.

Implementation (both halves recommended):

1. **Client-reported receipts.** In the browser realtime session, listen for `response.done` usage events; POST the per-session usage summary (model ID, audio-input / audio-output / text-input / text-output / cached token counts, correlation ID, session ID) to a new authenticated endpoint, e.g. `POST /query/realtime-usage`, gated by the same signed demo-proxy auth as other cockpit writes. Persist as a typed usage receipt with a distinct telemetry status such as `client_reported` — client-supplied counts must never be presented as server-observed. Zero or missing counts are stored as-is; never synthesize.
2. **Provider reconciliation (trust anchor).** Pull aggregate realtime-model usage server-side from OpenAI's Usage/Costs API (admin key) on a daily cadence and record workflow-level rows. The existing cost-status enum already anticipates this: `reconciled_from_provider_cost_api`. Attribution is coarser (daily totals), so keep both sources and let the surface show client-reported detail with provider-reconciled totals.
3. **Pricing row prerequisite.** `gpt-realtime-2` bills audio tokens on a separate price sheet (audio-in / audio-out per 1M ≠ text prices). Add an owner-approved, effective-dated pricing row (provider URL, retrieval timestamp, hash, approval identity) covering audio token types before any cost is computed — until then the pipeline must keep failing closed with "No effective pricing for model". `gpt-4o-mini-transcribe` needs its own row if transcription usage is captured separately.
4. When capture lands, flip the two realtime entries in `openAiWorkloadCaptureCoverage` (`src/services/evalsFinopsModel.ts`) from `not_captured` to `typed_receipts`, and extend the persona scopes if voice usage should attribute to Maya/David workflows.
- No per-transaction model routing exists; models are pinned per agent role in `config/models.ts`. Routing changes must stay owner-approved (read-only recommendations only).
- David business-outcome denominators (cost per completed arbitration etc.) remain "requires verified outcomes" until the owner ratifies source-backed denominators; cost-per-cited-answer is the only outcome metric currently computable.
- E2E coverage for `/finops` in `tests/e2e/cockpit-premium-e2e.ts` was not added (unit/API/invariant tests only).
