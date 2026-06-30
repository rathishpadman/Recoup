import type { RuntimeEnv } from "../../config/env.js";
import type {
  AgentUsageRun,
  EvalGateResult,
  EvalGateRun,
  FinopsDailyRollup,
  FinopsRecommendation,
  ModelPricing,
  OpenAiCostBucket
} from "./evalsFinopsTypes.js";

export type EvalsFinopsSupabaseFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface SupabaseEvalsFinopsRepositoryOptions {
  fetcher?: EvalsFinopsSupabaseFetch;
  serviceRoleKey: string;
  url: string;
}

export interface EvalsFinopsRepository {
  listAgentUsageRuns(): Promise<AgentUsageRun[]>;
  loadLatestEvalRun(): Promise<EvalGateRun | undefined>;
  listEvalGateResults(evalRunId: string): Promise<EvalGateResult[]>;
  listActiveModelPricing(): Promise<ModelPricing[]>;
  listOpenAiCostBuckets(): Promise<OpenAiCostBucket[]>;
  listDailyRollups(): Promise<FinopsDailyRollup[]>;
  listOpenRecommendations(): Promise<FinopsRecommendation[]>;
  upsertAgentUsageRun(run: AgentUsageRun): Promise<void>;
  upsertEvalGateRun(run: EvalGateRun): Promise<void>;
  upsertEvalGateResults(results: EvalGateResult[]): Promise<void>;
}

interface AgentUsageRunRow {
  agent_name: string;
  cached_input_tokens: number;
  cache_capability: string | null;
  cited_record_ids_json: string[] | string;
  correlation_id: string;
  created_at: string;
  deterministic_basis: string;
  guardrail_trip_count: number;
  handoff_count: number;
  input_tokens: number;
  latency_ms: number | null;
  model_execution_mode: string;
  model_id: string;
  output_tokens: number;
  prompt_cache_key: string | null;
  prompt_prefix_version: string | null;
  reasoning_tokens: number;
  record_ids_json: string[] | string;
  source_receipt_id: string | null;
  status: "succeeded" | "blocked" | "failed";
  tool_call_count: number;
  total_tokens: number;
  uncached_input_tokens: number;
  usage_run_id: string;
  workflow_name: string;
}

interface EvalGateRunRow {
  branch_name: string | null;
  commit_sha: string | null;
  completed_at: string;
  deterministic_basis: string;
  eval_run_id: string;
  record_ids_json: string[] | string;
  release_status: "pass" | "fail" | "blocked";
  report_hash: string;
  report_json: Record<string, unknown> | string;
  source_mode: "live_supabase" | "local_fixture" | "blocked";
  started_at: string;
}

interface EvalGateResultRow {
  blocker_reason: string | null;
  deterministic_basis: string;
  eval_gate_result_id: string;
  eval_run_id: string;
  gate:
    | "run-control"
    | "deduction-validity"
    | "intent-precision"
    | "arbitration-agreement"
    | "detection-fp"
    | "decision-fp"
    | "gold-set-parity";
  open_dependencies_json: string[] | string;
  record_ids_json: string[] | string;
  score: string | number | null;
  status: "pass" | "fail" | "blocked";
  threshold: string | number | null;
}

interface ModelPricingRow {
  active: boolean;
  approved_by: string;
  cached_input_per_1m_tokens: string | number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  input_per_1m_tokens: string | number;
  model_id: string;
  output_per_1m_tokens: string | number;
  pricing_hash: string;
  pricing_id: string;
  reasoning_per_1m_tokens: string | number;
  service_tier: string;
}

interface OpenAiCostBucketRow {
  amount: string | number;
  bucket_end: string;
  bucket_start: string;
  cost_bucket_id: string;
  currency: string;
  imported_at: string;
  line_item: string;
  model_id: string | null;
  project_id: string | null;
  provenance: "openai_org_cost_api";
  source_response_hash: string;
}

interface FinopsDailyRollupRow {
  agent_name: string;
  approved_draft_count: number;
  blocked_count: number;
  cached_input_tokens: number;
  cases_processed_count: number;
  cited_answer_count: number;
  computed_cost_amount: string | number | null;
  computed_cost_currency: string | null;
  cost_status: "computed_from_owner_pricing" | "reconciled_from_provider_cost_api" | "pricing_not_configured_not_computed";
  created_at: string;
  deterministic_basis: string;
  disputed_amount: string | number;
  failed_count: number;
  input_tokens: number;
  model_id: string;
  output_tokens: number;
  prompt_cache_hit_rate: string | number | null;
  prompt_cache_savings_amount: string | number | null;
  prompt_cache_savings_currency: string | null;
  prompt_cache_savings_status:
    | "computed_from_owner_pricing"
    | "pricing_not_configured_not_computed"
    | "no_cached_tokens_observed";
  rollup_date: string;
  rollup_id: string;
  run_count: number;
  source_record_ids_json: string[] | string;
  succeeded_count: number;
  total_tokens: number;
  uncached_input_tokens: number;
  unit_economics_json: Record<string, unknown> | string;
  workflow_name: string;
}

interface FinopsRecommendationRow {
  affected_agent_name: string | null;
  affected_workflow_name: string | null;
  created_at: string;
  deterministic_basis: string;
  evidence_record_ids_json: string[] | string;
  expected_impact_json: Record<string, unknown> | string;
  recommendation_id: string;
  recommendation_type:
    | "quality_gate"
    | "pricing_config"
    | "token_budget"
    | "prompt_cache"
    | "batch_eval"
    | "guardrail_regression"
    | "model_routing"
    | "source_gap";
  recommended_action: string;
  requires_human_approval: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  severity: "critical" | "important" | "advisory";
  status: "open" | "accepted" | "dismissed" | "superseded";
  title: string;
}

export function createSupabaseEvalsFinopsRepository(
  options: SupabaseEvalsFinopsRepositoryOptions
): EvalsFinopsRepository {
  const baseUrl = normalizeSupabaseUrl(options.url);
  const fetcher = options.fetcher ?? fetch;

  return {
    async listAgentUsageRuns() {
      const url = new URL(`${baseUrl}/rest/v1/recoup_agent_usage_runs`);
      url.searchParams.set("order", "created_at.desc");
      return (await requestRows<AgentUsageRunRow>(fetcher, options.serviceRoleKey, url.href, "GET")).map(
        parseAgentUsageRunRow
      );
    },
    async loadLatestEvalRun() {
      const url = new URL(`${baseUrl}/rest/v1/recoup_eval_gate_runs`);
      url.searchParams.set("order", "completed_at.desc");
      url.searchParams.set("limit", "1");
      return (await requestRows<EvalGateRunRow>(fetcher, options.serviceRoleKey, url.href, "GET")).map(parseEvalGateRunRow)[0];
    },
    async listEvalGateResults(evalRunId) {
      const url = new URL(`${baseUrl}/rest/v1/recoup_eval_gate_results`);
      url.searchParams.set("eval_run_id", `eq.${evalRunId}`);
      url.searchParams.set("order", "gate.asc");
      return (await requestRows<EvalGateResultRow>(fetcher, options.serviceRoleKey, url.href, "GET")).map(
        parseEvalGateResultRow
      );
    },
    async listActiveModelPricing() {
      const url = new URL(`${baseUrl}/rest/v1/recoup_model_pricing`);
      url.searchParams.set("active", "eq.true");
      url.searchParams.set("order", "model_id.asc,service_tier.asc,effective_from.desc");
      return (await requestRows<ModelPricingRow>(fetcher, options.serviceRoleKey, url.href, "GET")).map(parseModelPricingRow);
    },
    async listOpenAiCostBuckets() {
      const url = new URL(`${baseUrl}/rest/v1/recoup_openai_cost_buckets`);
      url.searchParams.set("order", "bucket_start.desc");
      return (await requestRows<OpenAiCostBucketRow>(fetcher, options.serviceRoleKey, url.href, "GET")).map(
        parseOpenAiCostBucketRow
      );
    },
    async listDailyRollups() {
      const url = new URL(`${baseUrl}/rest/v1/recoup_finops_daily_rollups`);
      url.searchParams.set("order", "rollup_date.desc,agent_name.asc,model_id.asc");
      return (await requestRows<FinopsDailyRollupRow>(fetcher, options.serviceRoleKey, url.href, "GET")).map(
        parseFinopsDailyRollupRow
      );
    },
    async listOpenRecommendations() {
      const url = new URL(`${baseUrl}/rest/v1/recoup_finops_recommendations`);
      url.searchParams.set("status", "eq.open");
      url.searchParams.set("order", "severity.asc,created_at.desc");
      return (await requestRows<FinopsRecommendationRow>(fetcher, options.serviceRoleKey, url.href, "GET")).map(
        parseFinopsRecommendationRow
      );
    },
    async upsertAgentUsageRun(run) {
      await requestRows(fetcher, options.serviceRoleKey, `${baseUrl}/rest/v1/recoup_agent_usage_runs?on_conflict=usage_run_id`, "POST", {
        body: JSON.stringify(toAgentUsageRunRow(run))
      });
    },
    async upsertEvalGateRun(run) {
      await requestRows(fetcher, options.serviceRoleKey, `${baseUrl}/rest/v1/recoup_eval_gate_runs?on_conflict=eval_run_id`, "POST", {
        body: JSON.stringify(toEvalGateRunRow(run))
      });
    },
    async upsertEvalGateResults(results) {
      if (results.length === 0) {
        return;
      }

      await requestRows(
        fetcher,
        options.serviceRoleKey,
        `${baseUrl}/rest/v1/recoup_eval_gate_results?on_conflict=eval_gate_result_id`,
        "POST",
        { body: JSON.stringify(results.map(toEvalGateResultRow)) }
      );
    }
  };
}

export function createSupabaseEvalsFinopsRepositoryFromEnv(
  env: RuntimeEnv,
  fetcher?: EvalsFinopsSupabaseFetch
): EvalsFinopsRepository | undefined {
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = env.SUPABASE_URL?.trim();
  if (serviceRoleKey === undefined || serviceRoleKey.length === 0 || url === undefined || url.length === 0) {
    return undefined;
  }

  return createSupabaseEvalsFinopsRepository({
    ...(fetcher === undefined ? {} : { fetcher }),
    serviceRoleKey,
    url
  });
}

function parseAgentUsageRunRow(row: AgentUsageRunRow): AgentUsageRun {
  return {
    agentName: requireString(row.agent_name, "agent_name"),
    cachedInputTokens: requireNonnegativeInteger(row.cached_input_tokens, "cached_input_tokens"),
    ...(row.cache_capability === null ? {} : { cacheCapability: row.cache_capability }),
    citedRecordIds: parseStringArray(row.cited_record_ids_json),
    correlationId: requireString(row.correlation_id, "correlation_id"),
    createdAt: toIsoString(requireString(row.created_at, "created_at")),
    deterministicBasis: requireString(row.deterministic_basis, "deterministic_basis"),
    guardrailTripCount: requireNonnegativeInteger(row.guardrail_trip_count, "guardrail_trip_count"),
    handoffCount: requireNonnegativeInteger(row.handoff_count, "handoff_count"),
    inputTokens: requireNonnegativeInteger(row.input_tokens, "input_tokens"),
    ...(row.latency_ms === null ? {} : { latencyMs: requireNonnegativeInteger(row.latency_ms, "latency_ms") }),
    modelExecutionMode: requireString(row.model_execution_mode, "model_execution_mode"),
    modelId: requireString(row.model_id, "model_id"),
    outputTokens: requireNonnegativeInteger(row.output_tokens, "output_tokens"),
    ...(row.prompt_cache_key === null ? {} : { promptCacheKey: row.prompt_cache_key }),
    ...(row.prompt_prefix_version === null ? {} : { promptPrefixVersion: row.prompt_prefix_version }),
    reasoningTokens: requireNonnegativeInteger(row.reasoning_tokens, "reasoning_tokens"),
    recordIds: parseStringArray(row.record_ids_json),
    ...(row.source_receipt_id === null ? {} : { sourceReceiptId: row.source_receipt_id }),
    status: parseEnum(row.status, ["succeeded", "blocked", "failed"], "status"),
    toolCallCount: requireNonnegativeInteger(row.tool_call_count, "tool_call_count"),
    totalTokens: requireNonnegativeInteger(row.total_tokens, "total_tokens"),
    uncachedInputTokens: requireNonnegativeInteger(row.uncached_input_tokens, "uncached_input_tokens"),
    usageRunId: requireString(row.usage_run_id, "usage_run_id"),
    workflowName: requireString(row.workflow_name, "workflow_name")
  };
}

function parseEvalGateRunRow(row: EvalGateRunRow): EvalGateRun {
  return {
    ...(row.branch_name === null ? {} : { branchName: row.branch_name }),
    ...(row.commit_sha === null ? {} : { commitSha: row.commit_sha }),
    completedAt: toIsoString(requireString(row.completed_at, "completed_at")),
    deterministicBasis: requireString(row.deterministic_basis, "deterministic_basis"),
    evalRunId: requireString(row.eval_run_id, "eval_run_id"),
    recordIds: parseStringArray(row.record_ids_json),
    releaseStatus: parseEnum(row.release_status, ["pass", "fail", "blocked"], "release_status"),
    reportHash: requireString(row.report_hash, "report_hash"),
    reportJson: parseObject(row.report_json),
    sourceMode: parseEnum(row.source_mode, ["live_supabase", "local_fixture", "blocked"], "source_mode"),
    startedAt: toIsoString(requireString(row.started_at, "started_at"))
  };
}

function parseEvalGateResultRow(row: EvalGateResultRow): EvalGateResult {
  return {
    ...(row.blocker_reason === null ? {} : { blockerReason: row.blocker_reason }),
    deterministicBasis: requireString(row.deterministic_basis, "deterministic_basis"),
    evalGateResultId: requireString(row.eval_gate_result_id, "eval_gate_result_id"),
    evalRunId: requireString(row.eval_run_id, "eval_run_id"),
    gate: parseEnum(
      row.gate,
      ["run-control", "deduction-validity", "intent-precision", "arbitration-agreement", "detection-fp", "decision-fp", "gold-set-parity"],
      "gate"
    ),
    openDependencies: parseStringArray(row.open_dependencies_json),
    recordIds: parseStringArray(row.record_ids_json),
    ...(row.score === null ? {} : { score: requireNumericString(row.score, "score") }),
    status: parseEnum(row.status, ["pass", "fail", "blocked"], "status"),
    ...(row.threshold === null ? {} : { threshold: requireNumericString(row.threshold, "threshold") })
  };
}

function parseModelPricingRow(row: ModelPricingRow): ModelPricing {
  return {
    active: requireBoolean(row.active, "active"),
    approvedBy: requireString(row.approved_by, "approved_by"),
    cachedInputPer1mTokens: requireNumericString(row.cached_input_per_1m_tokens, "cached_input_per_1m_tokens"),
    currency: requireString(row.currency, "currency"),
    effectiveFrom: toIsoString(requireString(row.effective_from, "effective_from")),
    ...(row.effective_to === null ? {} : { effectiveTo: toIsoString(requireString(row.effective_to, "effective_to")) }),
    inputPer1mTokens: requireNumericString(row.input_per_1m_tokens, "input_per_1m_tokens"),
    modelId: requireString(row.model_id, "model_id"),
    outputPer1mTokens: requireNumericString(row.output_per_1m_tokens, "output_per_1m_tokens"),
    pricingHash: requireString(row.pricing_hash, "pricing_hash"),
    pricingId: requireString(row.pricing_id, "pricing_id"),
    reasoningPer1mTokens: requireNumericString(row.reasoning_per_1m_tokens, "reasoning_per_1m_tokens"),
    serviceTier: requireString(row.service_tier, "service_tier")
  };
}

function parseOpenAiCostBucketRow(row: OpenAiCostBucketRow): OpenAiCostBucket {
  return {
    amount: requireNumericString(row.amount, "amount"),
    bucketEnd: toIsoString(requireString(row.bucket_end, "bucket_end")),
    bucketStart: toIsoString(requireString(row.bucket_start, "bucket_start")),
    costBucketId: requireString(row.cost_bucket_id, "cost_bucket_id"),
    currency: requireString(row.currency, "currency"),
    importedAt: toIsoString(requireString(row.imported_at, "imported_at")),
    lineItem: requireString(row.line_item, "line_item"),
    ...(row.model_id === null ? {} : { modelId: row.model_id }),
    ...(row.project_id === null ? {} : { projectId: row.project_id }),
    provenance: parseEnum(row.provenance, ["openai_org_cost_api"], "provenance"),
    sourceResponseHash: requireString(row.source_response_hash, "source_response_hash")
  };
}

function parseFinopsDailyRollupRow(row: FinopsDailyRollupRow): FinopsDailyRollup {
  return {
    agentName: requireString(row.agent_name, "agent_name"),
    approvedDraftCount: requireNonnegativeInteger(row.approved_draft_count, "approved_draft_count"),
    blockedCount: requireNonnegativeInteger(row.blocked_count, "blocked_count"),
    cachedInputTokens: requireNonnegativeInteger(row.cached_input_tokens, "cached_input_tokens"),
    casesProcessedCount: requireNonnegativeInteger(row.cases_processed_count, "cases_processed_count"),
    citedAnswerCount: requireNonnegativeInteger(row.cited_answer_count, "cited_answer_count"),
    ...(row.computed_cost_amount === null ? {} : { computedCostAmount: requireNumericString(row.computed_cost_amount, "computed_cost_amount") }),
    ...(row.computed_cost_currency === null ? {} : { computedCostCurrency: requireString(row.computed_cost_currency, "computed_cost_currency") }),
    costStatus: parseEnum(
      row.cost_status,
      ["computed_from_owner_pricing", "reconciled_from_provider_cost_api", "pricing_not_configured_not_computed"],
      "cost_status"
    ),
    createdAt: toIsoString(requireString(row.created_at, "created_at")),
    deterministicBasis: requireString(row.deterministic_basis, "deterministic_basis"),
    disputedAmount: requireNumericString(row.disputed_amount, "disputed_amount"),
    failedCount: requireNonnegativeInteger(row.failed_count, "failed_count"),
    inputTokens: requireNonnegativeInteger(row.input_tokens, "input_tokens"),
    modelId: requireString(row.model_id, "model_id"),
    outputTokens: requireNonnegativeInteger(row.output_tokens, "output_tokens"),
    ...(row.prompt_cache_hit_rate === null ? {} : { promptCacheHitRate: requireNumericString(row.prompt_cache_hit_rate, "prompt_cache_hit_rate") }),
    ...(row.prompt_cache_savings_amount === null
      ? {}
      : { promptCacheSavingsAmount: requireNumericString(row.prompt_cache_savings_amount, "prompt_cache_savings_amount") }),
    ...(row.prompt_cache_savings_currency === null ? {} : { promptCacheSavingsCurrency: row.prompt_cache_savings_currency }),
    promptCacheSavingsStatus: parseEnum(
      row.prompt_cache_savings_status,
      ["computed_from_owner_pricing", "pricing_not_configured_not_computed", "no_cached_tokens_observed"],
      "prompt_cache_savings_status"
    ),
    recordIds: parseStringArray(row.source_record_ids_json),
    rollupDate: requireString(row.rollup_date, "rollup_date"),
    rollupId: requireString(row.rollup_id, "rollup_id"),
    runCount: requireNonnegativeInteger(row.run_count, "run_count"),
    succeededCount: requireNonnegativeInteger(row.succeeded_count, "succeeded_count"),
    totalTokens: requireNonnegativeInteger(row.total_tokens, "total_tokens"),
    uncachedInputTokens: requireNonnegativeInteger(row.uncached_input_tokens, "uncached_input_tokens"),
    unitEconomics: parseObject(row.unit_economics_json),
    workflowName: requireString(row.workflow_name, "workflow_name")
  };
}

function parseFinopsRecommendationRow(row: FinopsRecommendationRow): FinopsRecommendation {
  return {
    ...(row.affected_agent_name === null ? {} : { affectedAgentName: row.affected_agent_name }),
    ...(row.affected_workflow_name === null ? {} : { affectedWorkflowName: row.affected_workflow_name }),
    createdAt: toIsoString(requireString(row.created_at, "created_at")),
    deterministicBasis: requireString(row.deterministic_basis, "deterministic_basis"),
    evidenceRecordIds: parseStringArray(row.evidence_record_ids_json),
    expectedImpact: parseObject(row.expected_impact_json),
    recommendationId: requireString(row.recommendation_id, "recommendation_id"),
    recommendationType: parseEnum(
      row.recommendation_type,
      ["quality_gate", "pricing_config", "token_budget", "prompt_cache", "batch_eval", "guardrail_regression", "model_routing", "source_gap"],
      "recommendation_type"
    ),
    recommendedAction: requireString(row.recommended_action, "recommended_action"),
    requiresHumanApproval: requireBoolean(row.requires_human_approval, "requires_human_approval"),
    ...(row.resolved_at === null ? {} : { resolvedAt: toIsoString(requireString(row.resolved_at, "resolved_at")) }),
    ...(row.resolved_by === null ? {} : { resolvedBy: row.resolved_by }),
    severity: parseEnum(row.severity, ["critical", "important", "advisory"], "severity"),
    status: parseEnum(row.status, ["open", "accepted", "dismissed", "superseded"], "status"),
    title: requireString(row.title, "title")
  };
}

function toAgentUsageRunRow(run: AgentUsageRun): AgentUsageRunRow {
  return {
    agent_name: run.agentName,
    cached_input_tokens: run.cachedInputTokens,
    cache_capability: run.cacheCapability ?? null,
    cited_record_ids_json: run.citedRecordIds,
    correlation_id: run.correlationId,
    created_at: run.createdAt,
    deterministic_basis: run.deterministicBasis,
    guardrail_trip_count: run.guardrailTripCount,
    handoff_count: run.handoffCount,
    input_tokens: run.inputTokens,
    latency_ms: run.latencyMs ?? null,
    model_execution_mode: run.modelExecutionMode,
    model_id: run.modelId,
    output_tokens: run.outputTokens,
    prompt_cache_key: run.promptCacheKey ?? null,
    prompt_prefix_version: run.promptPrefixVersion ?? null,
    reasoning_tokens: run.reasoningTokens,
    record_ids_json: run.recordIds,
    source_receipt_id: run.sourceReceiptId ?? null,
    status: run.status,
    tool_call_count: run.toolCallCount,
    total_tokens: run.totalTokens,
    uncached_input_tokens: run.uncachedInputTokens,
    usage_run_id: run.usageRunId,
    workflow_name: run.workflowName
  };
}

function toEvalGateRunRow(run: EvalGateRun): EvalGateRunRow {
  return {
    branch_name: run.branchName ?? null,
    commit_sha: run.commitSha ?? null,
    completed_at: run.completedAt,
    deterministic_basis: run.deterministicBasis,
    eval_run_id: run.evalRunId,
    record_ids_json: run.recordIds,
    release_status: run.releaseStatus,
    report_hash: run.reportHash,
    report_json: run.reportJson,
    source_mode: run.sourceMode,
    started_at: run.startedAt
  };
}

function toEvalGateResultRow(result: EvalGateResult): EvalGateResultRow {
  return {
    blocker_reason: result.blockerReason ?? null,
    deterministic_basis: result.deterministicBasis,
    eval_gate_result_id: result.evalGateResultId,
    eval_run_id: result.evalRunId,
    gate: result.gate,
    open_dependencies_json: result.openDependencies,
    record_ids_json: result.recordIds,
    score: result.score ?? null,
    status: result.status,
    threshold: result.threshold ?? null
  };
}

const secretLikeValuePattern =
  /(?:sk-[A-Za-z0-9_-]{6,}|Bearer\s+\S+|api[_-]?key\s*[:=]\s*\S+|client[_-]?secret\s*[:=]\s*\S+|password\s*[:=]\s*\S+|secret\s*[:=]\s*\S+)/iu;
const secretLikeKeyPattern = /^(?:api[_-]?key|apikey|client[_-]?secret|clientsecret|password|secret|service[_-]?role[_-]?key)$/iu;

function assertNoSecretLikeValues(value: unknown, operation: "exposed" | "persisted"): void {
  if (typeof value === "string") {
    if (secretLikeValuePattern.test(value)) {
      throw new Error(
        operation === "persisted"
          ? "Evals FinOps row contains a secret-like value and was not persisted."
          : "Supabase Evals FinOps response contains a secret-like value and was not exposed."
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoSecretLikeValues(item, operation);
    }
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (secretLikeKeyPattern.test(key)) {
        throw new Error(
          operation === "persisted"
            ? "Evals FinOps row contains a secret-like value and was not persisted."
            : "Supabase Evals FinOps response contains a secret-like value and was not exposed."
        );
      }
      assertNoSecretLikeValues(item, operation);
    }
  }
}

async function requestRows<T>(
  fetcher: EvalsFinopsSupabaseFetch,
  serviceRoleKey: string,
  url: string,
  method: "GET" | "POST",
  options: { body?: string } = {}
): Promise<T[]> {
  if (options.body !== undefined) {
    assertNoSecretLikeValues(JSON.parse(options.body) as unknown, "persisted");
  }

  const headers: Record<string, string> = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`
  };
  if (method === "POST") {
    headers.prefer = "resolution=merge-duplicates,return=representation";
    headers["content-type"] = "application/json";
  }
  const response = await fetcher(url, {
    headers,
    method,
    ...(options.body === undefined ? {} : { body: options.body })
  });
  if (!response.ok) {
    throw new Error(`Supabase Evals FinOps request failed with status ${String(response.status)}.`);
  }
  const rows = (await response.json()) as unknown;
  if (!Array.isArray(rows)) {
    throw new Error("Supabase Evals FinOps response was not an array.");
  }
  assertNoSecretLikeValues(rows, "exposed");

  return rows as T[];
}

function normalizeSupabaseUrl(value: string): string {
  return value.replace(/\/+$/u, "");
}

function parseStringArray(value: string[] | string): string[] {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  assertNoSecretLikeValues(parsed, "exposed");
  if (!Array.isArray(parsed)) {
    throw new Error("Supabase Evals FinOps row contained an invalid string array.");
  }

  const items: string[] = [];
  for (const item of parsed as unknown[]) {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error("Supabase Evals FinOps row contained an invalid string array.");
    }
    items.push(item.trim());
  }

  return items;
}

function parseObject(value: Record<string, unknown> | string): Record<string, unknown> {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  assertNoSecretLikeValues(parsed, "exposed");
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Supabase Evals FinOps row contained an invalid object.");
  }

  return parsed as Record<string, unknown>;
}

function toIsoString(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Supabase Evals FinOps row contained an invalid timestamp.");
  }

  return date.toISOString();
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Supabase Evals FinOps row contained an invalid ${fieldName}.`);
  }

  return value;
}

function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Supabase Evals FinOps row contained an invalid ${fieldName}.`);
  }

  return value;
}

function requireNonnegativeInteger(value: unknown, fieldName: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`Supabase Evals FinOps row contained an invalid ${fieldName}.`);
  }

  return value as number;
}

function requireNumericString(value: unknown, fieldName: string): string {
  const normalized = typeof value === "string" ? value.trim() : value;
  if (
    normalized === "" ||
    (typeof normalized !== "string" && typeof normalized !== "number") ||
    !Number.isFinite(Number(normalized)) ||
    Number(normalized) < 0
  ) {
    throw new Error(
      fieldName.includes("per_1m") || fieldName === "amount" || fieldName.includes("cost") || fieldName === "disputed_amount"
        ? "Supabase Evals FinOps row contained an invalid numeric field."
        : `Supabase Evals FinOps row contained an invalid ${fieldName}.`
    );
  }

  return String(normalized);
}

function parseEnum<const T extends readonly string[]>(value: unknown, allowed: T, fieldName: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`Supabase Evals FinOps row contained an invalid ${fieldName}.`);
  }

  return value;
}
