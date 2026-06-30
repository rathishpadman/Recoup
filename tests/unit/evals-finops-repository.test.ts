import { describe, expect, it } from "vitest";
import {
  createSupabaseEvalsFinopsRepository,
  createSupabaseEvalsFinopsRepositoryFromEnv,
  type EvalsFinopsSupabaseFetch
} from "../../src/services/evalsFinopsRepository.js";

describe("evals FinOps Supabase repository", () => {
  it("reads usage runs, eval snapshots, pricing, rollups, and recommendations with service-role headers", async () => {
    const calls: Array<{ init: RequestInit; url: string }> = [];
    const fetcher: EvalsFinopsSupabaseFetch = (url, init) => {
      calls.push({ init, url });

      if (url.includes("/recoup_agent_usage_runs?")) {
        return ok([
          {
            agent_name: "Maya Forensics",
            cached_input_tokens: 300,
            cache_capability: "deduction_forensics",
            cited_record_ids_json: ["S3-L1"],
            correlation_id: "corr-1",
            created_at: "2026-06-30 00:00:00+00",
            deterministic_basis: "live query usage receipt",
            guardrail_trip_count: 1,
            handoff_count: 2,
            input_tokens: 1000,
            latency_ms: 1300,
            model_execution_mode: "live_openai_agents",
            model_id: "gpt-5-mini",
            output_tokens: 400,
            prompt_cache_key: "deduction-forensics-v1",
            prompt_prefix_version: "2026-06-30",
            reasoning_tokens: 50,
            record_ids_json: ["S3-L1", "PRICE-CLAUSE-1"],
            source_receipt_id: "memory-usage-1",
            status: "succeeded",
            tool_call_count: 3,
            total_tokens: 1450,
            uncached_input_tokens: 700,
            usage_run_id: "usage-1",
            workflow_name: "maya_forensics_query"
          }
        ]);
      }

      if (url.includes("/recoup_eval_gate_runs?")) {
        return ok([
          {
            branch_name: "main",
            commit_sha: "a".repeat(40),
            completed_at: "2026-06-30T01:00:00.000Z",
            deterministic_basis: "release-readiness report",
            eval_run_id: "eval-run-1",
            record_ids_json: ["cfg-run-control"],
            release_status: "blocked",
            report_hash: "b".repeat(64),
            report_json: { status: "blocked" },
            source_mode: "live_supabase",
            started_at: "2026-06-30T00:59:00.000Z"
          }
        ]);
      }

      if (url.includes("/recoup_eval_gate_results?")) {
        return ok([
          {
            blocker_reason: "label manifest missing",
            deterministic_basis: "intent precision gate",
            eval_gate_result_id: "gate-result-1",
            eval_run_id: "eval-run-1",
            gate: "intent-precision",
            open_dependencies_json: ["release_eval_label_manifest"],
            record_ids_json: ["release-label-manifest"],
            score: null,
            status: "blocked",
            threshold: "0.90"
          }
        ]);
      }

      if (url.includes("/recoup_model_pricing?")) {
        return ok([
          {
            active: true,
            approved_by: "human:rathish-owner",
            cached_input_per_1m_tokens: "0.125",
            currency: "USD",
            effective_from: "2026-06-30T00:00:00.000Z",
            effective_to: null,
            input_per_1m_tokens: "1.25",
            model_id: "gpt-5-mini",
            output_per_1m_tokens: "10.00",
            pricing_hash: "c".repeat(64),
            pricing_id: "pricing-1",
            reasoning_per_1m_tokens: "0",
            service_tier: "default"
          }
        ]);
      }

      if (url.includes("/recoup_openai_cost_buckets?")) {
        return ok([
          {
            amount: "2.75",
            bucket_end: "2026-06-30T01:00:00.000Z",
            bucket_start: "2026-06-30T00:00:00.000Z",
            cost_bucket_id: "bucket-1",
            currency: "USD",
            imported_at: "2026-06-30T01:05:00.000Z",
            line_item: "model_usage",
            model_id: "gpt-5-mini",
            project_id: "proj-recoup",
            provenance: "openai_org_cost_api",
            source_response_hash: "f".repeat(64)
          }
        ]);
      }

      if (url.includes("/recoup_finops_daily_rollups?")) {
        return ok([
          {
            agent_name: "Maya Forensics",
            approved_draft_count: 1,
            blocked_count: 0,
            cached_input_tokens: 300,
            cases_processed_count: 4,
            cited_answer_count: 3,
            computed_cost_amount: null,
            computed_cost_currency: null,
            cost_status: "pricing_not_configured_not_computed",
            created_at: "2026-06-30T02:00:00.000Z",
            deterministic_basis: "daily rollup",
            disputed_amount: "9200.00",
            failed_count: 0,
            input_tokens: 1000,
            model_id: "gpt-5-mini",
            output_tokens: 400,
            prompt_cache_hit_rate: "0.3",
            prompt_cache_savings_amount: null,
            prompt_cache_savings_currency: null,
            prompt_cache_savings_status: "pricing_not_configured_not_computed",
            rollup_date: "2026-06-30",
            rollup_id: "rollup-1",
            run_count: 4,
            source_record_ids_json: ["usage-1"],
            succeeded_count: 4,
            total_tokens: 1450,
            uncached_input_tokens: 700,
            unit_economics_json: { tokensPerCitedAnswer: "483.33" },
            workflow_name: "maya_forensics_query"
          }
        ]);
      }

      if (url.includes("/recoup_finops_recommendations?")) {
        return ok([
          {
            affected_agent_name: "Maya Forensics",
            affected_workflow_name: "maya_forensics_query",
            created_at: "2026-06-30T02:00:00.000Z",
            deterministic_basis: "pricing-missing",
            evidence_record_ids_json: ["usage-1"],
            expected_impact_json: { costStatus: "blocked" },
            recommendation_id: "rec-1",
            recommendation_type: "pricing_config",
            recommended_action: "Add owner-approved pricing before showing dollar cost.",
            requires_human_approval: true,
            resolved_at: null,
            resolved_by: null,
            severity: "critical",
            status: "open",
            title: "Configure model pricing"
          }
        ]);
      }

      throw new Error(`Unexpected URL ${url}`);
    };
    const repository = createSupabaseEvalsFinopsRepository({
      fetcher,
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co/"
    });

    await expect(repository.listAgentUsageRuns()).resolves.toMatchObject([
      {
        agentName: "Maya Forensics",
        cachedInputTokens: 300,
        createdAt: "2026-06-30T00:00:00.000Z",
        recordIds: ["S3-L1", "PRICE-CLAUSE-1"],
        usageRunId: "usage-1"
      }
    ]);
    await expect(repository.loadLatestEvalRun()).resolves.toMatchObject({
      evalRunId: "eval-run-1",
      releaseStatus: "blocked"
    });
    await expect(repository.listEvalGateResults("eval-run-1")).resolves.toMatchObject([
      {
        blockerReason: "label manifest missing",
        gate: "intent-precision",
        openDependencies: ["release_eval_label_manifest"],
        threshold: "0.90"
      }
    ]);
    await expect(repository.listActiveModelPricing()).resolves.toMatchObject([
      {
        cachedInputPer1mTokens: "0.125",
        inputPer1mTokens: "1.25",
        pricingId: "pricing-1"
      }
    ]);
    await expect(repository.listOpenAiCostBuckets()).resolves.toMatchObject([
      {
        amount: "2.75",
        costBucketId: "bucket-1",
        currency: "USD",
        provenance: "openai_org_cost_api"
      }
    ]);
    await expect(repository.listDailyRollups()).resolves.toMatchObject([
      {
        disputedAmount: "9200.00",
        promptCacheHitRate: "0.3",
        rollupId: "rollup-1"
      }
    ]);
    await expect(repository.listOpenRecommendations()).resolves.toMatchObject([
      {
        recommendationId: "rec-1",
        requiresHumanApproval: true,
        severity: "critical"
      }
    ]);

    expect(calls.map((call) => `${new URL(call.url).origin}${new URL(call.url).pathname}`)).toEqual([
      "https://recoup.supabase.co/rest/v1/recoup_agent_usage_runs",
      "https://recoup.supabase.co/rest/v1/recoup_eval_gate_runs",
      "https://recoup.supabase.co/rest/v1/recoup_eval_gate_results",
      "https://recoup.supabase.co/rest/v1/recoup_model_pricing",
      "https://recoup.supabase.co/rest/v1/recoup_openai_cost_buckets",
      "https://recoup.supabase.co/rest/v1/recoup_finops_daily_rollups",
      "https://recoup.supabase.co/rest/v1/recoup_finops_recommendations"
    ]);
    expect(new URL(calls[0]?.url ?? "").searchParams.get("order")).toBe("created_at.desc");
    expect(new URL(calls[1]?.url ?? "").searchParams.get("limit")).toBe("1");
    expect(new URL(calls[2]?.url ?? "").searchParams.get("eval_run_id")).toBe("eq.eval-run-1");
    expect(new URL(calls[3]?.url ?? "").searchParams.get("active")).toBe("eq.true");
    for (const call of calls) {
      expect(call.init.headers).toMatchObject({
        apikey: "supabase-service-secret",
        authorization: "Bearer supabase-service-secret"
      });
    }
  });

  it("writes typed usage and eval rows with JSON fields serialized and without returning secrets", async () => {
    const calls: Array<{ body?: string; init: RequestInit; url: string }> = [];
    const fetcher: EvalsFinopsSupabaseFetch = (url, init) => {
      const body = typeof init.body === "string" ? init.body : undefined;
      calls.push({ ...(body === undefined ? {} : { body }), init, url });
      return ok([]);
    };
    const repository = createSupabaseEvalsFinopsRepository({
      fetcher,
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await repository.upsertAgentUsageRun({
      agentName: "Maya Forensics",
      cachedInputTokens: 120,
      cacheCapability: "deduction_forensics",
      citedRecordIds: ["S3-L1"],
      correlationId: "corr-1",
      createdAt: "2026-06-30T00:00:00.000Z",
      deterministicBasis: "sdk token usage snapshot",
      guardrailTripCount: 0,
      handoffCount: 1,
      inputTokens: 500,
      latencyMs: 800,
      modelExecutionMode: "live_openai_agents",
      modelId: "gpt-5-mini",
      outputTokens: 200,
      promptCacheKey: "deduction-forensics-v1",
      promptPrefixVersion: "2026-06-30",
      reasoningTokens: 0,
      recordIds: ["S3-L1", "PRICE-CLAUSE-1"],
      sourceReceiptId: "memory-receipt-1",
      status: "succeeded",
      toolCallCount: 2,
      totalTokens: 700,
      uncachedInputTokens: 380,
      usageRunId: "usage-1",
      workflowName: "maya_forensics_query"
    });
    await repository.upsertEvalGateRun({
      branchName: "codex/evals-finops-governance",
      commitSha: "d".repeat(40),
      completedAt: "2026-06-30T00:02:00.000Z",
      deterministicBasis: "release-readiness CLI",
      evalRunId: "eval-run-1",
      recordIds: ["cfg-run-control"],
      releaseStatus: "blocked",
      reportHash: "e".repeat(64),
      reportJson: { status: "blocked" },
      sourceMode: "local_fixture",
      startedAt: "2026-06-30T00:01:00.000Z"
    });
    await repository.upsertEvalGateResults([
      {
        blockerReason: "pricing missing",
        deterministicBasis: "pricing config gate",
        evalGateResultId: "gate-result-1",
        evalRunId: "eval-run-1",
        gate: "run-control",
        openDependencies: ["recoup_model_pricing"],
        recordIds: ["pricing-missing"],
        status: "blocked"
      }
    ]);

    expect(calls[0]?.url).toBe("https://recoup.supabase.co/rest/v1/recoup_agent_usage_runs?on_conflict=usage_run_id");
    expect(calls[1]?.url).toBe("https://recoup.supabase.co/rest/v1/recoup_eval_gate_runs?on_conflict=eval_run_id");
    expect(calls[2]?.url).toBe(
      "https://recoup.supabase.co/rest/v1/recoup_eval_gate_results?on_conflict=eval_gate_result_id"
    );
    expect(calls[0]?.init.headers).toMatchObject({
      apikey: "supabase-service-secret",
      authorization: "Bearer supabase-service-secret",
      prefer: "resolution=merge-duplicates,return=representation"
    });
    expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({
      cited_record_ids_json: ["S3-L1"],
      record_ids_json: ["S3-L1", "PRICE-CLAUSE-1"],
      usage_run_id: "usage-1"
    });
    expect(JSON.parse(calls[1]?.body ?? "{}")).toMatchObject({
      eval_run_id: "eval-run-1",
      record_ids_json: ["cfg-run-control"],
      report_json: { status: "blocked" }
    });
    expect(JSON.parse(calls[2]?.body ?? "[]")).toMatchObject([
      {
        open_dependencies_json: ["recoup_model_pricing"],
        record_ids_json: ["pricing-missing"]
      }
    ]);
    expect(JSON.stringify(calls.map((call) => call.body))).not.toContain("supabase-service-secret");
  });

  it("rejects secret-like values before persisting typed evals FinOps rows", async () => {
    const calls: Array<{ body?: string; init: RequestInit; url: string }> = [];
    const fetcher: EvalsFinopsSupabaseFetch = (url, init) => {
      const body = typeof init.body === "string" ? init.body : undefined;
      calls.push({ ...(body === undefined ? {} : { body }), init, url });
      return ok([]);
    };
    const repository = createSupabaseEvalsFinopsRepository({
      fetcher,
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(
      repository.upsertAgentUsageRun({
        agentName: "Maya Forensics",
        cachedInputTokens: 120,
        citedRecordIds: ["S3-L1"],
        correlationId: "corr-1",
        createdAt: "2026-06-30T00:00:00.000Z",
        deterministicBasis: "sdk response contained sk-live-secret",
        guardrailTripCount: 0,
        handoffCount: 1,
        inputTokens: 500,
        modelExecutionMode: "live_openai_agents",
        modelId: "gpt-5-mini",
        outputTokens: 200,
        reasoningTokens: 0,
        recordIds: ["S3-L1"],
        status: "succeeded",
        toolCallCount: 2,
        totalTokens: 700,
        uncachedInputTokens: 380,
        usageRunId: "usage-1",
        workflowName: "maya_forensics_query"
      })
    ).rejects.toThrow("Evals FinOps row contains a secret-like value and was not persisted.");
    expect(calls).toEqual([]);
  });

  it("rejects secret-like keys before persisting or exposing decoded JSON payloads", async () => {
    const calls: Array<{ body?: string; init: RequestInit; url: string }> = [];
    const fetcher: EvalsFinopsSupabaseFetch = (url, init) => {
      const body = typeof init.body === "string" ? init.body : undefined;
      calls.push({ ...(body === undefined ? {} : { body }), init, url });
      return ok([]);
    };
    const repository = createSupabaseEvalsFinopsRepository({
      fetcher,
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(
      repository.upsertEvalGateRun({
        completedAt: "2026-06-30T00:02:00.000Z",
        deterministicBasis: "release-readiness CLI",
        evalRunId: "eval-run-1",
        recordIds: ["cfg-run-control"],
        releaseStatus: "blocked",
        reportHash: "e".repeat(64),
        reportJson: { clientSecret: "sap-client-secret" },
        sourceMode: "local_fixture",
        startedAt: "2026-06-30T00:01:00.000Z"
      })
    ).rejects.toThrow("Evals FinOps row contains a secret-like value and was not persisted.");
    expect(calls).toEqual([]);

    const readRepository = createSupabaseEvalsFinopsRepository({
      fetcher: () =>
        ok([
          {
            branch_name: null,
            commit_sha: null,
            completed_at: "2026-06-30T00:02:00.000Z",
            deterministic_basis: "release-readiness CLI",
            eval_run_id: "eval-run-1",
            record_ids_json: ["cfg-run-control"],
            release_status: "blocked",
            report_hash: "e".repeat(64),
            report_json: JSON.stringify({ apiKey: "redacted" }),
            source_mode: "live_supabase",
            started_at: "2026-06-30T00:01:00.000Z"
          }
        ]),
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(readRepository.loadLatestEvalRun()).rejects.toThrow(
      "Supabase Evals FinOps response contains a secret-like value and was not exposed."
    );
  });

  it("rejects secret-like values returned by Supabase before exposing rows", async () => {
    const repository = createSupabaseEvalsFinopsRepository({
      fetcher: () =>
        ok([
          {
            branch_name: null,
            commit_sha: null,
            completed_at: "2026-06-30T00:02:00.000Z",
            deterministic_basis: "contaminated row carried sk-live-secret",
            eval_run_id: "eval-run-1",
            record_ids_json: ["cfg-run-control"],
            release_status: "blocked",
            report_hash: "e".repeat(64),
            report_json: { status: "blocked" },
            source_mode: "live_supabase",
            started_at: "2026-06-30T00:01:00.000Z"
          }
        ]),
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(repository.loadLatestEvalRun()).rejects.toThrow(
      "Supabase Evals FinOps response contains a secret-like value and was not exposed."
    );
  });

  it("rejects whitespace-only record IDs returned by Supabase", async () => {
    const repository = createSupabaseEvalsFinopsRepository({
      fetcher: () =>
        ok([
          {
            agent_name: "Maya Forensics",
            cached_input_tokens: 0,
            cache_capability: null,
            cited_record_ids_json: ["S3-L1"],
            correlation_id: "corr-1",
            created_at: "2026-06-30T00:00:00.000Z",
            deterministic_basis: "typed usage run fixture",
            guardrail_trip_count: 0,
            handoff_count: 1,
            input_tokens: 1000,
            latency_ms: null,
            model_execution_mode: "live_openai_agents",
            model_id: "gpt-5-mini",
            output_tokens: 500,
            prompt_cache_key: null,
            prompt_prefix_version: null,
            reasoning_tokens: 0,
            record_ids_json: [" "],
            source_receipt_id: null,
            status: "succeeded",
            tool_call_count: 2,
            total_tokens: 1500,
            uncached_input_tokens: 1000,
            usage_run_id: "usage-1",
            workflow_name: "maya_forensics_query"
          }
        ]),
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(repository.listAgentUsageRuns()).rejects.toThrow(
      "Supabase Evals FinOps row contained an invalid string array."
    );
  });

  it("rejects invalid Supabase enum and numeric rows instead of trusting casts", async () => {
    const invalidReleaseStatusRepository = createSupabaseEvalsFinopsRepository({
      fetcher: () =>
        ok([
          {
            branch_name: null,
            commit_sha: null,
            completed_at: "2026-06-30T00:02:00.000Z",
            deterministic_basis: "release-readiness CLI",
            eval_run_id: "eval-run-1",
            record_ids_json: ["cfg-run-control"],
            release_status: "watch",
            report_hash: "e".repeat(64),
            report_json: { status: "blocked" },
            source_mode: "live_supabase",
            started_at: "2026-06-30T00:01:00.000Z"
          }
        ]),
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(invalidReleaseStatusRepository.loadLatestEvalRun()).rejects.toThrow(
      "Supabase Evals FinOps row contained an invalid release_status."
    );

    const invalidUsageStatusRepository = createSupabaseEvalsFinopsRepository({
      fetcher: () =>
        ok([
          {
            agent_name: "Maya Forensics",
            cached_input_tokens: 0,
            cache_capability: null,
            cited_record_ids_json: [],
            correlation_id: "corr-1",
            created_at: "2026-06-30T00:00:00.000Z",
            deterministic_basis: "usage fixture",
            guardrail_trip_count: 0,
            handoff_count: 0,
            input_tokens: 10,
            latency_ms: null,
            model_execution_mode: "live_openai_agents",
            model_id: "gpt-5-mini",
            output_tokens: 5,
            prompt_cache_key: null,
            prompt_prefix_version: null,
            reasoning_tokens: 0,
            record_ids_json: ["usage-1"],
            source_receipt_id: null,
            status: "done",
            tool_call_count: 0,
            total_tokens: 15,
            uncached_input_tokens: 10,
            usage_run_id: "usage-1",
            workflow_name: "maya_forensics_query"
          }
        ]),
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(invalidUsageStatusRepository.listAgentUsageRuns()).rejects.toThrow(
      "Supabase Evals FinOps row contained an invalid status."
    );

    const invalidNumericRepository = createSupabaseEvalsFinopsRepository({
      fetcher: () =>
        ok([
          {
            active: true,
            approved_by: "human:rathish-owner",
            cached_input_per_1m_tokens: "0.125",
            currency: "USD",
            effective_from: "2026-06-30T00:00:00.000Z",
            effective_to: null,
            input_per_1m_tokens: "not-a-number",
            model_id: "gpt-5-mini",
            output_per_1m_tokens: "10.00",
            pricing_hash: "c".repeat(64),
            pricing_id: "pricing-1",
            reasoning_per_1m_tokens: "0",
            service_tier: "default"
          }
        ]),
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(invalidNumericRepository.listActiveModelPricing()).rejects.toThrow(
      "Supabase Evals FinOps row contained an invalid numeric field."
    );

    const blankNumericRepository = createSupabaseEvalsFinopsRepository({
      fetcher: () =>
        ok([
          {
            active: true,
            approved_by: "human:rathish-owner",
            cached_input_per_1m_tokens: "0.125",
            currency: "USD",
            effective_from: "2026-06-30T00:00:00.000Z",
            effective_to: null,
            input_per_1m_tokens: " ",
            model_id: "gpt-5-mini",
            output_per_1m_tokens: "10.00",
            pricing_hash: "c".repeat(64),
            pricing_id: "pricing-1",
            reasoning_per_1m_tokens: "0",
            service_tier: "default"
          }
        ]),
      serviceRoleKey: "supabase-service-secret",
      url: "https://recoup.supabase.co"
    });

    await expect(blankNumericRepository.listActiveModelPricing()).rejects.toThrow(
      "Supabase Evals FinOps row contained an invalid numeric field."
    );
  });

  it("constructs the repository only from server-side Supabase credentials", () => {
    expect(createSupabaseEvalsFinopsRepositoryFromEnv({})).toBeUndefined();
    expect(
      createSupabaseEvalsFinopsRepositoryFromEnv({
        SUPABASE_SERVICE_ROLE_KEY: "   ",
        SUPABASE_URL: "https://recoup.supabase.co"
      })
    ).toBeUndefined();
    expect(
      createSupabaseEvalsFinopsRepositoryFromEnv({
        SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
        SUPABASE_URL: "   "
      })
    ).toBeUndefined();
    expect(
      createSupabaseEvalsFinopsRepositoryFromEnv({
        SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
        SUPABASE_URL: "https://recoup.supabase.co"
      })
    ).toBeDefined();
  });
});

function ok(body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status: 200 }));
}
