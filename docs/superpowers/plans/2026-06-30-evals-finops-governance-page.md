# Evals + FinOps Governance Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-backed `/governance/evals-finops` cockpit page that shows release eval health, agent-wise usage, cost efficiency, unit economics, and deterministic recommended actions without fabricating labels, pricing, costs, or business outcomes.

**Architecture:** Add a typed Supabase-backed observability slice beside the existing Governance pages. The backend builds one `EvalFinopsCockpitModel` from release-readiness evals, governed run-control config, agent usage receipts, audit/approval records, and optional owner-approved pricing or trusted OpenAI cost imports. The UI is read-only and fail-closed: if labels, pricing, usage, or sources are missing, it shows blocked inputs rather than zeroes or fabricated metrics.

**Tech Stack:** Node 22, TypeScript, Express cockpit API, Next.js App Router cockpit, Supabase/Postgres, Vitest, Playwright, Decimal money handling.

---

## External Research Basis

| Source | Planning impact |
| --- | --- |
| OpenAI agent eval guidance | Use traces for workflow debugging and eval runs/datasets for repeatable quality gates. Keep Recoup's existing code-based release eval harness as the source of truth. |
| OpenAI Agents SDK tracing | Model runs should be attributable by workflow, agent, handoff, tool call, guardrail, model, and token usage. |
| OpenAI usage/cost APIs | Provider cost can be imported as trusted aggregate read-back when credentials exist; otherwise Recoup computes only tokens and blocks dollar cost. |
| OpenAI prompt caching | Cached tokens are reported under input-token details. Prompt-cache value should be shown as cached input tokens, cache-hit rate, and avoided full-price input cost when owner-approved pricing exists. |
| OpenTelemetry GenAI semantic conventions | Normalize metrics around agent name, model, operation, request/response token counts, cache-read tokens, tool calls, and error state. |
| FinOps unit economics / FOCUS | Cost is useful only when tied to business units such as cases processed, cited answers, approved drafts, and recovery candidates. |

## Non-Negotiable Recoup Constraints

| Constraint | Implementation rule |
| --- | --- |
| No fake or dummy data | Every value on the page must come from Supabase, release-readiness code, agent traces, audit records, or explicitly blocked state. |
| No model-computed dollars | Dollar cost and unit economics use Decimal/numeric values from trusted pricing/cost records only. |
| Prompt-cache savings are computed, not assumed | Cache savings use observed cached input tokens plus owner-approved full-input and cached-input prices. Without pricing, show cached tokens and cache-hit rate only. |
| No invented owner constants | Pricing, budgets, eval labels, and thresholds are owner-approved config or blocked. |
| Human approval for external action | Recommendations are read-only advisory rows; they do not dispatch actions. |
| Provenance honesty | Every metric row carries source table, record IDs, deterministic basis, and source freshness. |
| Clean separation | Evals/FinOps is a Governance surface, not a Maya/David/CFO workflow mutation path. |

## Existing Tables To Reuse

| Existing table | Use in page | Notes |
| --- | --- | --- |
| `recoup_config` | Release owner inputs, run-control budgets, eval thresholds, label manifest | Current `key` check does not allow pricing keys. Use a new pricing table instead of overloading this table unless owner approves a config-key migration. |
| `recoup_memory_records` | Current Maya query token usage receipts and scoped query memory | Keep existing receipts as compatibility input, but do not force trend dashboards to query only untyped JSON. |
| `recoup_audit_chain` | Hash-chained approval/action evidence | Use for proof links and audit receipt counts. |
| `immutable_audit_log` | Business action audit rows from the Tools_data-style schema | Use for unit outcomes when available. |
| `recoup_app_principals` | Owner approval identity for pricing/config rows | New pricing rows must reference this table. |
| `recoup_deduction_lines` | Case and disputed-dollar denominator | Use `amount` as Decimal/numeric input only; never model-generated. |
| `billing_requests`, `recovery_packages`, `credit_decisions` | Unit outcome denominators | Count approved/draft outcomes; do not imply realized recovery unless status confirms it. |

## New Supabase Tables

| New table | Grain | Purpose | Required for V1 |
| --- | --- | --- | --- |
| `recoup_agent_usage_runs` | One row per workflow-agent execution receipt | Agent-wise tokens, status, handoffs, tools, guardrails, latency, provenance | Yes |
| `recoup_eval_gate_runs` | One row per release/eval snapshot | Header for eval run status, source mode, commit, and report hash | Yes |
| `recoup_eval_gate_results` | One row per gate in an eval run | Normalized gate result: pass/fail/blocked, score, threshold, blocker | Yes |
| `recoup_model_pricing` | One row per owner-approved model/service-tier price version | Enables deterministic dollar cost computation | Yes, but page must work with blocked cost if empty |
| `recoup_openai_cost_buckets` | One imported provider cost bucket | Optional reconciliation with OpenAI organization cost API aggregates | No |
| `recoup_finops_daily_rollups` | One row per date/workflow/agent/model | Fast dashboard trends and unit economics | Yes |
| `recoup_finops_recommendations` | One deterministic recommendation row | Cost/quality/action recommendations with evidence and lifecycle | Yes |

## Supabase Table Definitions

### `recoup_agent_usage_runs`

| Column | Type | Constraint / meaning |
| --- | --- | --- |
| `usage_run_id` | `text` | Primary key, deterministic hash or UUID string |
| `correlation_id` | `text` | Request/run correlation ID |
| `workflow_name` | `text` | Example: `maya_forensics_query`, `release_readiness`, `risk_mesh_arbitration` |
| `agent_name` | `text` | Agent from `recoupAgentRoster` or `system` for non-agent eval runs |
| `model_id` | `text` | Pinned model identifier used by runtime |
| `model_execution_mode` | `text` | Example: `live_openai_agents`, `blocked_missing_credentials`, `code_eval_harness` |
| `cache_capability` | `text` | Nullable; check in `('deduction_forensics','credit_risk','risk_mesh','containment')` when present |
| `prompt_cache_key` | `text` | Nullable; static source-controlled cache key, never customer-specific |
| `prompt_prefix_version` | `text` | Nullable; static prompt-prefix version |
| `status` | `text` | Check in `('succeeded','blocked','failed')` |
| `input_tokens` | `int` | `>= 0` |
| `output_tokens` | `int` | `>= 0` |
| `cached_input_tokens` | `int` | `>= 0` |
| `uncached_input_tokens` | `int` | `>= 0`, normally `input_tokens - cached_input_tokens` |
| `reasoning_tokens` | `int` | `>= 0` |
| `total_tokens` | `int` | `>= 0`, stored or validated as token sum |
| `latency_ms` | `int` | Nullable, `>= 0` |
| `handoff_count` | `int` | `>= 0` |
| `tool_call_count` | `int` | `>= 0` |
| `guardrail_trip_count` | `int` | `>= 0` |
| `record_ids_json` | `jsonb` | Non-empty array of source record IDs |
| `cited_record_ids_json` | `jsonb` | Array, may be empty for blocked runs |
| `deterministic_basis` | `text` | Exact basis for the receipt |
| `source_receipt_id` | `text` | Optional link to `recoup_memory_records.id` |
| `created_at` | `timestamptz` | Run receipt timestamp |

### `recoup_eval_gate_runs`

| Column | Type | Constraint / meaning |
| --- | --- | --- |
| `eval_run_id` | `text` | Primary key |
| `release_status` | `text` | Check in `('pass','fail','blocked')` |
| `source_mode` | `text` | Check in `('live_supabase','local_fixture','blocked')`; production page should prefer `live_supabase` |
| `branch_name` | `text` | Nullable local branch/CI branch |
| `commit_sha` | `text` | Nullable 40-char SHA when available |
| `started_at` | `timestamptz` | Eval start |
| `completed_at` | `timestamptz` | Eval completion |
| `report_hash` | `text` | SHA-256 canonical report hash |
| `report_json` | `jsonb` | Full release-readiness report |
| `record_ids_json` | `jsonb` | Non-empty array; include config hashes or source record IDs |
| `deterministic_basis` | `text` | Release-readiness function and config/source basis |

### `recoup_eval_gate_results`

| Column | Type | Constraint / meaning |
| --- | --- | --- |
| `eval_gate_result_id` | `text` | Primary key |
| `eval_run_id` | `text` | References `recoup_eval_gate_runs(eval_run_id)` |
| `gate` | `text` | Check in `('run-control','deduction-validity','intent-precision','arbitration-agreement','detection-fp','decision-fp','gold-set-parity')` |
| `status` | `text` | Check in `('pass','fail','blocked')` |
| `score` | `numeric` | Nullable; must be between `0` and `1` when present |
| `threshold` | `numeric` | Nullable; must be between `0` and `1` when present |
| `blocker_reason` | `text` | Required when status is `blocked` |
| `open_dependencies_json` | `jsonb` | Array of missing owner/source inputs |
| `record_ids_json` | `jsonb` | Non-empty proof IDs/config hashes |
| `deterministic_basis` | `text` | Exact metric function/test basis |

### `recoup_model_pricing`

| Column | Type | Constraint / meaning |
| --- | --- | --- |
| `pricing_id` | `text` | Primary key |
| `model_id` | `text` | Pinned model ID or provider model ID |
| `service_tier` | `text` | Example: `default`, `batch`, `flex`; no secret values |
| `input_per_1m_tokens` | `numeric` | `>= 0` |
| `output_per_1m_tokens` | `numeric` | `>= 0` |
| `cached_input_per_1m_tokens` | `numeric` | `>= 0` |
| `reasoning_per_1m_tokens` | `numeric` | `>= 0`, can be `0` if not separately priced |
| `currency` | `text` | ISO currency, expected `USD` for OpenAI pricing |
| `effective_from` | `timestamptz` | Version start |
| `effective_to` | `timestamptz` | Nullable version end |
| `approved_by` | `text` | References `recoup_app_principals(principal)` |
| `pricing_hash` | `text` | SHA-256 canonical row hash |
| `active` | `boolean` | Only one active row per model/service tier should be used |

### `recoup_openai_cost_buckets`

| Column | Type | Constraint / meaning |
| --- | --- | --- |
| `cost_bucket_id` | `text` | Primary key |
| `bucket_start` | `timestamptz` | Provider bucket start |
| `bucket_end` | `timestamptz` | Provider bucket end |
| `project_id` | `text` | Nullable provider project ID |
| `model_id` | `text` | Nullable if provider bucket is not model-level |
| `line_item` | `text` | Provider cost category |
| `amount` | `numeric` | `>= 0` |
| `currency` | `text` | Provider currency |
| `source_response_hash` | `text` | SHA-256 hash of sanitized provider response |
| `imported_at` | `timestamptz` | Import timestamp |
| `provenance` | `text` | Check equals `openai_org_cost_api` |

### `recoup_finops_daily_rollups`

| Column | Type | Constraint / meaning |
| --- | --- | --- |
| `rollup_id` | `text` | Primary key, deterministic date/workflow/agent/model hash |
| `rollup_date` | `date` | Rollup date |
| `workflow_name` | `text` | Workflow grain |
| `agent_name` | `text` | Agent grain |
| `model_id` | `text` | Model grain |
| `run_count` | `int` | `>= 0` |
| `succeeded_count` | `int` | `>= 0` |
| `blocked_count` | `int` | `>= 0` |
| `failed_count` | `int` | `>= 0` |
| `total_tokens` | `int` | `>= 0` |
| `input_tokens` | `int` | `>= 0` |
| `output_tokens` | `int` | `>= 0` |
| `cached_input_tokens` | `int` | `>= 0` |
| `uncached_input_tokens` | `int` | `>= 0` |
| `computed_cost_amount` | `numeric` | Nullable; only populated from owner-approved pricing or trusted cost import |
| `computed_cost_currency` | `text` | Nullable |
| `cost_status` | `text` | Check in `('computed_from_owner_pricing','reconciled_from_provider_cost_api','pricing_not_configured_not_computed')` |
| `prompt_cache_hit_rate` | `numeric` | Nullable; `cached_input_tokens / input_tokens` when input tokens are present |
| `prompt_cache_savings_amount` | `numeric` | Nullable; avoided full-price input cost from cached tokens |
| `prompt_cache_savings_currency` | `text` | Nullable |
| `prompt_cache_savings_status` | `text` | Check in `('computed_from_owner_pricing','pricing_not_configured_not_computed','no_cached_tokens_observed')` |
| `cases_processed_count` | `int` | `>= 0` |
| `cited_answer_count` | `int` | `>= 0` |
| `approved_draft_count` | `int` | `>= 0` |
| `disputed_amount` | `numeric` | `>= 0`, Decimal source only |
| `unit_economics_json` | `jsonb` | Object with deterministic per-unit metrics |
| `source_record_ids_json` | `jsonb` | Non-empty proof IDs |
| `deterministic_basis` | `text` | Rollup formula/source basis |
| `created_at` | `timestamptz` | Creation timestamp |

### `recoup_finops_recommendations`

| Column | Type | Constraint / meaning |
| --- | --- | --- |
| `recommendation_id` | `text` | Primary key |
| `recommendation_type` | `text` | Check in `('quality_gate','pricing_config','token_budget','prompt_cache','batch_eval','guardrail_regression','model_routing','source_gap')` |
| `severity` | `text` | Check in `('critical','important','advisory')` |
| `status` | `text` | Check in `('open','accepted','dismissed','superseded')` |
| `title` | `text` | Human-readable title |
| `recommended_action` | `text` | Deterministic action text |
| `affected_agent_name` | `text` | Nullable |
| `affected_workflow_name` | `text` | Nullable |
| `expected_impact_json` | `jsonb` | Object with non-dollar or computed-dollar impact |
| `evidence_record_ids_json` | `jsonb` | Non-empty proof IDs |
| `deterministic_basis` | `text` | Rule ID and exact basis |
| `requires_human_approval` | `boolean` | True for config/pricing/model-routing changes |
| `created_at` | `timestamptz` | Creation timestamp |
| `resolved_at` | `timestamptz` | Nullable |
| `resolved_by` | `text` | Nullable app principal |

## Backend Model Contract

Create `EvalFinopsCockpitModel` with this shape:

```ts
export interface EvalFinopsCockpitModel {
  surface: "evals-finops";
  generatedAtIso: string;
  provenance: {
    sourceKind: "supabase" | "derived_backend";
    sourceName: string;
    deterministicBasis: string;
    recordIds: string[];
  };
  releaseReadiness: {
    status: "pass" | "fail" | "blocked";
    latestEvalRunId?: string;
    blockers: Array<{
      gate: string;
      reason: string;
      score?: string;
      threshold?: string;
      openDependencies: string[];
    }>;
  };
  evalGates: Array<{
    gate: string;
    status: "pass" | "fail" | "blocked";
    scoreLabel: string;
    thresholdLabel: string;
    deterministicBasis: string;
    recordIds: string[];
  }>;
  agentMetrics: Array<{
    agentName: string;
    workflowName: string;
    modelId: string;
    statusLabel: string;
    runCount: number;
    blockedCount: number;
    failedCount: number;
    totalTokens: number;
    averageTokensPerRun: string;
    handoffCount: number;
    toolCallCount: number;
    guardrailTripCount: number;
    citedAnswerRateLabel: string;
    deterministicBasis: string;
    recordIds: string[];
  }>;
  unitEconomics: Array<{
    metric: string;
    valueLabel: string;
    costStatus: "computed_from_owner_pricing" | "reconciled_from_provider_cost_api" | "pricing_not_configured_not_computed";
    deterministicBasis: string;
    recordIds: string[];
  }>;
  promptCache: {
    status: "active" | "no_cached_tokens_observed" | "pricing_not_configured_not_computed" | "usage_unavailable";
    cachedInputTokens: number;
    uncachedInputTokens: number;
    cacheHitRateLabel: string;
    savingsLabel: string;
    savingsStatus: "computed_from_owner_pricing" | "pricing_not_configured_not_computed" | "no_cached_tokens_observed";
    deterministicBasis: string;
    recordIds: string[];
  };
  recommendations: Array<{
    recommendationId: string;
    severity: "critical" | "important" | "advisory";
    title: string;
    recommendedAction: string;
    requiresHumanApproval: boolean;
    deterministicBasis: string;
    recordIds: string[];
  }>;
  blockedInputs: Array<{
    inputId: string;
    reason: string;
    requiredFor: string[];
  }>;
}
```

## Route And UI Plan

### Integration / Stitching Decision

This feature is stitched into the existing solution through the authenticated cockpit Governance shell, not through the public/marketing landing page.

| Surface | Role in integration | Required behavior |
| --- | --- | --- |
| `cockpit/app/page.tsx` | Session router | Keep redirecting authenticated users to `session.defaultRoute`; do not make Evals + FinOps the app home route. |
| `cockpit/app/governance/evals-finops/page.tsx` | Primary product route | New authenticated Governance page that calls `requireRouteAccess("/governance/evals-finops")`. |
| `cockpit/app/governance/governance-nav.tsx` | In-page Governance tab strip | Add an `Evals + FinOps` tab beside Agents, Connectors, Memory, and Trace. |
| `cockpit/app/cockpit-shell.tsx` | Persona sidebar | Add the route to the CFO/governance sidebar map and extend `ActiveRoute` / `routeForHref()` so active state works. |
| `config/cockpitDemoProfiles.ts` | Persona access control | Add `/governance/evals-finops` to allowed routes only for the owner-approved governance persona(s), initially CFO/governance. |
| Landing page / README | Optional discovery only | May link to the Governance capability for judges/reviewers, but must not be the primary runtime stitching path and must not duplicate live metrics. |

Do not build this as a landing-page section or public unauthenticated dashboard. The page contains operational eval, cost, token, and recommendation evidence and must remain behind the same cockpit demo-session route-access model as the other Governance pages.

| Layer | File | Responsibility |
| --- | --- | --- |
| Backend model types | `src/services/evalsFinopsModel.ts` | Build `EvalFinopsCockpitModel` from repositories, eval harness, and deterministic recommendation rules |
| Supabase repository | `src/services/evalsFinopsRepository.ts` | Read/write usage runs, eval runs, rollups, pricing rows, recommendations |
| API route | `src/services/cockpitApi.ts` | Add `GET /evals-finops` and optional explicit record/rollup endpoints |
| Cockpit fetch type | `cockpit/app/cockpit-data.ts` | Add model interface and `fetchEvalFinopsModel()` |
| Route page | `cockpit/app/governance/evals-finops/page.tsx` | Server component with access control and model fetch |
| UI component | `cockpit/app/governance/evals-finops/evals-finops-surface.tsx` | Dense operational surface: quality gates, agent metrics, unit economics, recommendations |
| Nav | `cockpit/app/governance/governance-nav.tsx`, `cockpit/app/cockpit-shell.tsx`, demo auth tests | Add route to CFO/governance only unless owner expands persona access |
| Schema | `docs/supabase-memory-schema.sql` | Add tables, indexes, grants, RLS, and no-delete posture |
| Tests | `tests/unit/evals-finops-model.test.ts`, `tests/unit/cockpit-api.test.ts`, `tests/unit/supabase-memory.test.ts`, `tests/e2e/cockpit-premium-e2e.ts` | Prove fail-closed behavior, route rendering, and no fake data |

## Mockup Screen Contract

The implementation must create visual mockups before coding the production UI. These mockups are design contracts, not data sources. The final React page must use backend/read-model data only and must render blocked states when the backend contract cannot supply a metric.

| Mockup screen | File target | Purpose | Required content |
| --- | --- | --- | --- |
| Governance overview | `mockups/imagegen/evals-finops-governance/01-overview-desktop.png` | First viewport for `/governance/evals-finops` | Release status strip, total token volume, cost status, blocked input count, compact tab control |
| Quality gates | `mockups/imagegen/evals-finops-governance/02-quality-gates-desktop.png` | Eval health detail view | Gate matrix, pass/fail/blocked chips, score vs threshold, blocker reasons, record ID proof strip |
| Agent economics | `mockups/imagegen/evals-finops-governance/03-agent-economics-desktop.png` | Agent-wise operational metrics | Agent/workflow/model table, runs, blocked rate, tokens/run, handoffs, tool calls, guardrail trips |
| Unit economics | `mockups/imagegen/evals-finops-governance/04-unit-economics-desktop.png` | Cost efficiency and business-denominator view | Cost per case, tokens per case, cost per cited answer, cost per approved draft, prompt-cache savings, disputed-dollar denominator, cost blocked state when pricing is missing |
| Recommendations | `mockups/imagegen/evals-finops-governance/05-recommendations-desktop.png` | Deterministic action queue | Recommendation severity, deterministic basis, evidence IDs, human-approval flag, affected agent/workflow |
| Fail-closed state | `mockups/imagegen/evals-finops-governance/06-blocked-state-desktop.png` | Honest unavailable-source view | Missing pricing, missing eval labels, missing usage rows, unavailable provider cost import, cached-token savings blocked by missing pricing, no fabricated zero-cost metrics |
| Responsive state | `mockups/imagegen/evals-finops-governance/07-responsive-mobile.png` | Small viewport contract | Stacked health strip, horizontally scrollable metric tables, visible blocked-state messaging, no overlapping text |

### Mockup Rules

- Mockups must use realistic labels and structure, but no mockup value may become production data.
- The production UI may use a mockup value only as a layout cue; every rendered metric must come from `EvalFinopsCockpitModel`.
- Mockups must avoid generic dashboard tropes: no giant hero, no gradient-orb background, no card-everything layout, no raw backend enum labels as business copy.
- Each mockup must include a visible provenance/evidence treatment for the main metrics.
- The final Playwright screenshot should be compared against the matching mockup and any visual deltas should be listed in closeout.

## Token Optimization Methodologies To Track

Prompt caching is one FinOps lever, not the only one. The page should classify savings and recommendations by method so reviewers can see whether optimization came from fewer calls, fewer tokens, cheaper tokens, or safer routing.

| Methodology | What it optimizes | Recoup metric | Safe implementation rule |
| --- | --- | --- | --- |
| Prompt caching | Repeated static input prefixes | Cached input tokens, cache-hit rate, prompt-cache savings amount | Compute savings only from observed cached tokens and owner-approved cached-input pricing. |
| Request reduction | Number of model calls | Runs avoided, model calls per case, tool calls per answer | Prefer deterministic services/read models before model calls; do not skip required evidence/guardrail calls. |
| Output budgeting | Completion/reasoning token volume | Output tokens per run, reasoning tokens per run, blocked-over-budget count | Use max-output/reasoning budgets by workflow; never truncate required citations or deterministic basis. |
| Context pruning | Input token volume | Input tokens per case, evidence tokens per cited answer | Include only relevant source excerpts/record IDs; keep source provenance and fail closed if context is insufficient. |
| Model tier routing | Cost per token and latency | Cost per successful run by model, quality score by model | Route simpler advisory/classification work to lower-cost pinned models only when eval gates stay green. |
| Batch/asynchronous processing | Unit cost for non-interactive work | Batch-eligible run count, eval/backfill cost delta | Use only for evals, backfills, data enrichment, and other workflows that do not need immediate user response. |
| Flex/lower-priority processing | Cost for tolerant workloads | Flex-eligible run count, delayed-work savings | Use only for low-priority or non-production paths; keep Maya live query UX on synchronous paths unless owner approves. |
| Tool/schema minimization | Tool-definition and schema tokens | Tool schema tokens per run, tool-call success rate | Keep Zod schemas strict but narrow; do not remove required guardrail/tool fields. |
| Tool search/deferred tools | Upfront tool context size | Tools loaded per run, deferred-tool hit rate | Defer rarely used tools only when the model/API path supports it and evals prove no decision-quality regression. |
| Semantic/result reuse | Repeated equivalent queries | Reused answer count, avoided calls, citation parity | Reuse only backend/source-backed answers with matching record IDs, freshness, and provenance; never reuse stale business values. |
| Early deterministic exit | Avoided model calls for blocked/invalid states | Fail-closed exits, calls avoided by source checks | If required source/owner input is missing, block before model invocation. |

## Deterministic Recommendation Rules

| Rule ID | Condition | Recommendation | Approval |
| --- | --- | --- | --- |
| `quality-gate-failed` | Any eval gate status is `fail` | Block release and inspect failing case IDs/gate output | No external action, but release owner review required |
| `eval-labels-missing` | Label manifest or required labels are blocked | Request owner labels; do not synthesize labels | Owner input required |
| `pricing-missing` | No active `recoup_model_pricing` and no trusted provider cost bucket | Show token metrics only and request pricing approval | Owner pricing approval required |
| `budget-near-limit` | Agent/workflow token use exceeds 80 percent of approved run-control budget | Inspect context packing and repeated prompt prefixes | Human approval before runtime config change |
| `cache-opportunity` | Cached input token ratio is low while stable prompt sections exist | Evaluate prompt-prefix stabilization, cache-key versioning, and prompt order | Human approval before prompt/model config change |
| `cache-savings-visible` | Cached tokens are present and owner-approved cached-input pricing exists | Surface avoided full-price input cost and cache-hit rate in AI Economics | Read-only display |
| `request-reduction-opportunity` | Repeated model calls produce identical deterministic basis and record IDs | Move repeated answer/source preparation into deterministic read-model reuse | Human approval before workflow change |
| `output-budget-opportunity` | Output/reasoning tokens exceed workflow budget while eval gates pass | Tune output/reasoning caps for that agent/workflow | Human approval before runtime config change |
| `context-pruning-opportunity` | Input tokens per cited answer rise without more cited records | Narrow evidence excerpts and source payload sent to the model | Human approval before prompt/source contract change |
| `model-routing-opportunity` | Lower-cost pinned model passes the same eval gate for a workflow | Propose model-tier route change with before/after eval proof | Human approval required |
| `batch-eval-candidate` | Workload is release/eval/backfill and not user-interactive | Candidate for Batch/Flex-style async processing | Human approval before runtime route change |
| `tool-schema-opportunity` | Tool schema tokens are high and unused fields are never selected | Reduce tool schema surface while preserving Zod guardrails | Human approval before tool contract change |
| `guardrail-regression` | Guardrail trips or uncited blocks increase | Investigate safety/source regression before optimizing cost | Required |
| `unit-economics-regression` | Cost per approved draft rises while approval/cited-answer rate falls | Review agent/tool path before downgrading model | Required |

## Implementation Tasks

### Task 1: Supabase Schema And Contract Tests

**Files:**
- Modify: `docs/supabase-memory-schema.sql`
- Modify: `tests/unit/supabase-memory.test.ts`

- [ ] **Step 1: Write failing schema assertions**

Add assertions that the SQL contains all seven new tables, indexes for date/agent/model lookup, RLS enablement, service-role grants, and no delete grants.

Run: `npm.cmd run test -- tests\unit\supabase-memory.test.ts`

Expected before implementation: FAIL because the new table names are absent.

- [ ] **Step 2: Add schema DDL**

Add the tables defined in "Supabase Table Definitions" above. Keep `REVOKE ALL` from `anon` and `authenticated`; grant only `SELECT, INSERT, UPDATE` to `service_role`; do not grant `DELETE`.

- [ ] **Step 3: Run schema tests**

Run: `npm.cmd run test -- tests\unit\supabase-memory.test.ts`

Expected: PASS.

### Task 2: Repository And Type Layer

**Files:**
- Create: `src/services/evalsFinopsRepository.ts`
- Create: `src/services/evalsFinopsTypes.ts`
- Create: `tests/unit/evals-finops-repository.test.ts`

- [ ] **Step 1: Write repository tests**

Test read paths for usage runs, latest eval run, eval gate results, active pricing, rollups, and recommendations. Test write paths serialize JSON fields and never include secrets.

Run: `npm.cmd run test -- tests\unit\evals-finops-repository.test.ts`

Expected before implementation: FAIL because repository module is missing.

- [ ] **Step 2: Implement repository**

Use existing Supabase REST patterns from `src/memory/supabaseStore.ts` and `src/services/cockpitApi.ts`. Keep fetchers injectable for tests.

- [ ] **Step 3: Run repository tests**

Run: `npm.cmd run test -- tests\unit\evals-finops-repository.test.ts`

Expected: PASS.

### Task 3: Evals + FinOps Model Builder

**Files:**
- Create: `src/services/evalsFinopsModel.ts`
- Create: `tests/unit/evals-finops-model.test.ts`

- [ ] **Step 1: Write fail-closed model tests**

Cover these exact cases:
- Missing pricing returns `pricing_not_configured_not_computed`.
- Missing eval labels appears under `blockedInputs`.
- Missing usage rows returns an empty metric table with a source-unavailable message, not zero-cost claims.
- Existing token rows compute token totals and averages.
- Existing active pricing computes cost with Decimal/numeric math.
- Existing cached input tokens plus active pricing compute prompt-cache savings as `cached_input_tokens * (input_per_1m_tokens - cached_input_per_1m_tokens) / 1_000_000`.
- Existing cached input tokens without active pricing show cache-hit rate and cached token count, but block dollar savings.

Run: `npm.cmd run test -- tests\unit\evals-finops-model.test.ts`

Expected before implementation: FAIL because model builder is missing.

- [ ] **Step 2: Implement model builder**

Compose:
- `buildCurrentReleaseReadinessReport()` from `evals/releaseReadiness.ts`
- latest stored eval rows from `recoup_eval_gate_runs` and `recoup_eval_gate_results`
- usage rows from `recoup_agent_usage_runs`
- pricing rows from `recoup_model_pricing`
- outcome denominators from approved audit/business tables
- prompt-cache fields from `cached_input_tokens`, `uncached_input_tokens`, `prompt_cache_key`, `prompt_prefix_version`, and `recoup_model_pricing.cached_input_per_1m_tokens`
- deterministic recommendation rules from this plan

- [ ] **Step 3: Run model tests**

Run: `npm.cmd run test -- tests\unit\evals-finops-model.test.ts`

Expected: PASS.

### Task 4: Usage Capture

**Files:**
- Modify: `src/services/cockpitApi.ts`
- Modify: `src/services/forensicsQuerySession.ts`
- Modify: `tests/unit/cockpit-api.test.ts`
- Modify: `tests/unit/forensics-query-session.test.ts`

- [ ] **Step 1: Write tests for typed usage writes**

Extend the current Maya token-usage receipt tests so a successful live query writes both the existing `recoup_memory_records` receipt and a typed `recoup_agent_usage_runs` row.

Run: `npm.cmd run test -- tests\unit\cockpit-api.test.ts tests\unit\forensics-query-session.test.ts`

Expected before implementation: FAIL because no typed usage row is written.

- [ ] **Step 2: Implement usage write**

Map `modelExecution.agentNames`, `handoffCount`, `tokenUsage`, trace tool events, trace guardrail events, selected line ID, submitted record IDs, cited record IDs, prompt-cache capability, prompt-cache key, prompt-prefix version, and cached-token usage into `recoup_agent_usage_runs`. If SDK usage does not expose input/output split, populate `total_tokens` and leave split fields at `0` with deterministic basis explaining the aggregate-only source. If SDK usage exposes `input_tokens_details.cached_tokens`, store that value as `cached_input_tokens` and derive `uncached_input_tokens` from observed input tokens.

- [ ] **Step 3: Run focused tests**

Run: `npm.cmd run test -- tests\unit\cockpit-api.test.ts tests\unit\forensics-query-session.test.ts`

Expected: PASS.

### Task 5: Eval Run Snapshot Recording

**Files:**
- Modify: `evals/releaseReadinessCli.ts`
- Create: `src/services/evalRunRecorder.ts`
- Create: `tests/evals/eval-run-recorder.test.ts`

- [ ] **Step 1: Write recorder tests**

Test that recording persists one `recoup_eval_gate_runs` row and one `recoup_eval_gate_results` row per gate. Test that no owner labels or thresholds are invented when release readiness is blocked.

Run: `npm.cmd run test -- tests\evals\eval-run-recorder.test.ts`

Expected before implementation: FAIL because recorder is missing.

- [ ] **Step 2: Implement explicit recording mode**

Add an explicit CLI flag or env-gated command path, such as `RECOUP_RECORD_EVAL_RUN=true npm.cmd run verify:release`, so ordinary local reads do not unexpectedly mutate Supabase.

- [ ] **Step 3: Run eval recorder tests**

Run: `npm.cmd run test -- tests\evals\eval-run-recorder.test.ts`

Expected: PASS.

### Task 6: API Route

**Files:**
- Modify: `src/services/cockpitApi.ts`
- Modify: `tests/unit/cockpit-api.test.ts`

- [ ] **Step 1: Write API tests**

Test `GET /evals-finops` returns:
- `surface: "evals-finops"`
- release readiness
- eval gate rows
- agent metrics
- unit economics
- prompt-cache hit rate and savings status
- recommendations
- blocked inputs

Also test missing Supabase usage/pricing does not produce HTTP 500 and does not fabricate zero-cost values.

Run: `npm.cmd run test -- tests\unit\cockpit-api.test.ts`

Expected before implementation: FAIL because route is missing.

- [ ] **Step 2: Implement route**

Register `GET /evals-finops` beside existing governance routes. Use the same correlation ID and fail-closed response style as `/connectors`, `/trace`, and `/memory`.

- [ ] **Step 3: Run API tests**

Run: `npm.cmd run test -- tests\unit\cockpit-api.test.ts`

Expected: PASS.

### Task 7: Mockup Screens And Visual Contract

**Files:**
- Create: `docs/storyboards/evals-finops-governance-screen-spec.md`
- Create: `mockups/imagegen/evals-finops-governance/01-overview-desktop.png`
- Create: `mockups/imagegen/evals-finops-governance/02-quality-gates-desktop.png`
- Create: `mockups/imagegen/evals-finops-governance/03-agent-economics-desktop.png`
- Create: `mockups/imagegen/evals-finops-governance/04-unit-economics-desktop.png`
- Create: `mockups/imagegen/evals-finops-governance/05-recommendations-desktop.png`
- Create: `mockups/imagegen/evals-finops-governance/06-blocked-state-desktop.png`
- Create: `mockups/imagegen/evals-finops-governance/07-responsive-mobile.png`

- [ ] **Step 1: Write the screen spec**

Create `docs/storyboards/evals-finops-governance-screen-spec.md` with:
- exact route: `/governance/evals-finops`
- screen list from "Mockup Screen Contract"
- data-source matrix mapping every visible field to `EvalFinopsCockpitModel`
- blocked-state copy for missing pricing, missing labels, missing usage rows, and unavailable provider cost import
- explicit ban on using mockup literals as production values

- [ ] **Step 2: Generate or design the mockups**

Create the seven mockup PNGs listed in this task. Use the Recoup cockpit look and governance information architecture: dense, operational, table-led, provenance-forward, and visually consistent with existing Governance pages.

- [ ] **Step 3: Review mockups against constraints**

Check:
- no fake business metric is presented as real
- no UI text overlaps at desktop or mobile dimensions
- cost-missing state does not render `$0`
- recommendation cards include evidence and deterministic basis
- visual style avoids generic AI-dashboard slop

- [ ] **Step 4: Record mockup acceptance notes**

Append a short "Accepted visual direction" section to `docs/storyboards/evals-finops-governance-screen-spec.md` listing the seven mockups and any known deltas the production UI may need to resolve.

### Task 8: Cockpit Route And UI

**Files:**
- Modify: `cockpit/app/cockpit-data.ts`
- Create: `cockpit/app/governance/evals-finops/page.tsx`
- Create: `cockpit/app/governance/evals-finops/evals-finops-surface.tsx`
- Modify: `cockpit/app/governance/governance-nav.tsx`
- Modify: `cockpit/app/cockpit-shell.tsx`
- Modify: `config/cockpitDemoProfiles.ts`
- Modify: `tests/unit/cockpit-demo-auth.test.ts`

- [ ] **Step 1: Write route/access tests**

Confirm authorized governance users can access `/governance/evals-finops`, unauthorized personas are redirected or denied according to the existing route-access model, and `cockpit/app/page.tsx` still redirects users to their existing default route instead of the Evals + FinOps page.

Run: `npm.cmd run test -- tests\unit\cockpit-demo-auth.test.ts`

Expected before implementation: FAIL because the route is unknown.

- [ ] **Step 2: Implement fetch type and route**

Add `fetchEvalFinopsModel()` in `cockpit-data.ts`. Add the server route page that calls `requireRouteAccess("/governance/evals-finops")`.

- [ ] **Step 3: Implement UI component**

Render:
- Header strip: release status, cost status, total tokens, blocked input count.
- Quality Gates tab: eval gate table and blockers.
- AI Economics tab: agent metrics, unit economics, usage composition, prompt-cache savings, cache-hit rate, and cached-token proof.
- Recommendations rail: deterministic action cards with proof IDs.

Keep text compact and operational. Do not show raw enum names as primary business copy.

- [ ] **Step 4: Run route/access tests**

Run: `npm.cmd run test -- tests\unit\cockpit-demo-auth.test.ts`

Expected: PASS.

### Task 9: Rollups And Recommendations

**Files:**
- Create: `src/services/evalsFinopsRollups.ts`
- Create: `src/services/evalsFinopsRecommendations.ts`
- Create: `tests/unit/evals-finops-rollups.test.ts`
- Create: `tests/unit/evals-finops-recommendations.test.ts`

- [ ] **Step 1: Write deterministic rollup tests**

Test daily aggregation by date/workflow/agent/model. Test Decimal cost calculation only when active pricing exists. Test prompt-cache savings calculation using active `input_per_1m_tokens` and `cached_input_per_1m_tokens` rows, and test savings blocked when pricing is missing.

Run: `npm.cmd run test -- tests\unit\evals-finops-rollups.test.ts`

Expected before implementation: FAIL because rollup module is missing.

- [ ] **Step 2: Write recommendation tests**

Test every rule in "Deterministic Recommendation Rules". Test each recommendation includes evidence IDs and deterministic basis.

Run: `npm.cmd run test -- tests\unit\evals-finops-recommendations.test.ts`

Expected before implementation: FAIL because recommendation module is missing.

- [ ] **Step 3: Implement rollups and rules**

Rollups read from `recoup_agent_usage_runs`, `recoup_deduction_lines`, approval/audit tables, and pricing rows. Recommendations are generated from eval status, usage thresholds, pricing availability, guardrail counts, and unit economics trends.

- [ ] **Step 4: Run rollup/recommendation tests**

Run: `npm.cmd run test -- tests\unit\evals-finops-rollups.test.ts tests\unit\evals-finops-recommendations.test.ts`

Expected: PASS.

### Task 10: Browser Verification And Full Gate

**Files:**
- Modify: `tests/e2e/cockpit-premium-e2e.ts`
- Generated screenshots under `output/playwright/e2e/` only if the existing suite intentionally updates them.

- [ ] **Step 1: Add browser test**

Add coverage for `/governance/evals-finops` that proves:
- Page loads for authorized governance persona.
- Quality Gates table renders from backend model.
- AI Economics tab shows token metrics.
- AI Economics tab shows prompt-cache hit rate and, when pricing is present, prompt-cache savings.
- Missing pricing displays blocked cost, not `$0`.
- Missing pricing blocks dollar prompt-cache savings while still showing cached token counts.
- Recommendations show deterministic basis and record IDs.
- Runtime screenshot is compared against the accepted mockup direction and any deltas are documented.

- [ ] **Step 2: Run focused tests**

Run: `npm.cmd run test -- tests\unit\evals-finops-model.test.ts tests\unit\evals-finops-repository.test.ts tests\unit\evals-finops-rollups.test.ts tests\unit\evals-finops-recommendations.test.ts tests\unit\cockpit-api.test.ts`

Expected: PASS.

- [ ] **Step 3: Run browser coverage**

Run the existing cockpit Playwright command used by the repo for governance screenshots.

Expected: PASS with a captured `/governance/evals-finops` state and no visual overlap.

- [ ] **Step 4: Run full verification**

Run: `npm.cmd run verify`

Expected: PASS. If live Supabase `verify:release` is unavailable, report the exact missing env/source condition and do not call the implementation complete.

## Acceptance Criteria

| Area | Pass condition |
| --- | --- |
| Evals | Page shows release-readiness status, gate rows, blockers, scores, thresholds, and record IDs from real eval sources. |
| Agent metrics | Page shows agent/workflow/model rows from typed usage runs or blocked state when usage is unavailable. |
| Cost | Dollar cost appears only from active owner-approved pricing or trusted OpenAI cost import. Missing pricing renders blocked status. |
| Prompt-cache savings | Cached-token savings are visible as cache-hit rate and cached token count. Dollar savings are computed only as avoided full-price input cost from owner-approved pricing, otherwise blocked. |
| Unit economics | Metrics tie cost/tokens/cache savings to cases, cited answers, approvals, and disputed Decimal amounts. |
| Recommendations | Every recommendation has rule basis, evidence record IDs, severity, and human-approval flag. |
| Mockups | Seven visual mockups and a screen spec exist before React implementation; runtime screenshots are compared against the accepted direction. |
| Stitching | Primary access is through authenticated Governance navigation and CFO/governance sidebar; landing/README links are optional discovery only. |
| Supabase | Tables have indexes, RLS, service-role-only read/write, and no delete grant. |
| UI | Governance page is dense, operational, and consistent with existing cockpit navigation. |
| Verification | Focused tests, browser coverage, and `npm.cmd run verify` pass or report a precise source/env blocker. |

## Self-Review

| Check | Result |
| --- | --- |
| Spec coverage | Covers route, backend model, Supabase tables, usage capture, eval snapshots, pricing, rollups, recommendations, mockup screens, UI, and tests. |
| Completeness scan | No unresolved markers or fabricated-data instruction is present. |
| Type consistency | Table names, model names, and route names are stable across sections. |
| Scope | Single Governance feature slice; implementation can be split by tasks without unrelated refactors. |
