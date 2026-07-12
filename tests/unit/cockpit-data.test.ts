import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchConnectorReadinessModel, fetchEvalFinopsModel, fetchPersonaFinopsModel } from "../../cockpit/app/cockpit-data.ts";

describe("cockpit data client", () => {
  const originalPrincipal = process.env.RECOUP_COCKPIT_HUMAN_PRINCIPAL;
  const originalToken = process.env.RECOUP_COCKPIT_AUTH_TOKEN;

  afterEach(() => {
    restoreEnv("RECOUP_COCKPIT_HUMAN_PRINCIPAL", originalPrincipal);
    restoreEnv("RECOUP_COCKPIT_AUTH_TOKEN", originalToken);
    vi.unstubAllGlobals();
    vi.doUnmock("../../config/localRuntimeEnv.ts");
  });

  it("uses server cockpit auth headers for the Evals FinOps backend fetch", async () => {
    process.env.RECOUP_COCKPIT_HUMAN_PRINCIPAL = "human:cfo";
    process.env.RECOUP_COCKPIT_AUTH_TOKEN = "test-token";
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({
        agentMetrics: [],
        blockedInputs: [],
        evalGates: [],
        generatedAtIso: "2026-06-30T00:00:00.000Z",
        promptCache: {
          cachedInputTokens: 0,
          cacheHitRateLabel: "Usage unavailable",
          deterministicBasis: "test",
          recordIds: ["release-readiness"],
          savingsLabel: "Pricing not configured",
          savingsStatus: "pricing_not_configured_not_computed",
          status: "usage_unavailable",
          uncachedInputTokens: 0
        },
        provenance: {
          deterministicBasis: "test",
          recordIds: ["release-readiness"],
          sourceKind: "derived_backend",
          sourceName: "test"
        },
        recommendations: [],
        releaseReadiness: {
          blockers: [],
          status: "pass"
        },
        surface: "evals-finops",
        unitEconomics: []
      }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchEvalFinopsModel();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
      headers: {
        "x-recoup-human-principal": "human:cfo",
        "x-recoup-human-token": "test-token"
      }
    });
  });

  it("uses server cockpit auth headers for the connector readiness backend fetch", async () => {
    process.env.RECOUP_COCKPIT_HUMAN_PRINCIPAL = "human:cfo";
    process.env.RECOUP_COCKPIT_AUTH_TOKEN = "test-token";
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({
        checkedAtIso: "2026-07-02T00:00:00.000Z",
        connectors: [],
        lastRefreshedLabel: "No source health rows checked",
        provenance: {
          deterministicBasis: "test",
          recordIds: ["connectors"],
          sourceKind: "derived_backend",
          sourceName: "test"
        },
        sourceHealth: [],
        sourceTiles: [],
        surface: "connector-readiness"
      }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchConnectorReadinessModel();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
      headers: {
        "x-recoup-human-principal": "human:cfo",
        "x-recoup-human-token": "test-token"
      }
    });
  });

  it("fetches persona FinOps with an explicit encoded period and caller-provided verified proxy headers", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({
      workflowMetrics: [], blockedInputs: [], captureCoverage: [], generatedAtIso: "2026-07-11T00:00:00.000Z", persona: "maya",
      provenance: { deterministicBasis: "test", recordIds: [], sourceKind: "derived_backend", sourceName: "persona-finops-model" },
      sourceStatus: { pricing: "available", usage: "available" }, surface: "persona-finops"
    })));
    vi.stubGlobal("fetch", fetchMock);
    const headers = { "x-recoup-demo-proof": "signed-proof" };

    await fetchPersonaFinopsModel({ fromIso: "2026-07-01T00:00:00.000Z", toIso: "2026-07-11T00:00:00.000Z" }, headers);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:4317/persona-finops?from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-11T00%3A00%3A00.000Z"
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store", headers });
  });

  it("falls back to local runtime env when Next dev does not expose server auth env", async () => {
    delete process.env.RECOUP_COCKPIT_HUMAN_PRINCIPAL;
    delete process.env.RECOUP_COCKPIT_AUTH_TOKEN;
    vi.resetModules();
    vi.doMock("../../config/localRuntimeEnv.ts", () => ({
      loadLocalRuntimeEnvFiles: () => ({
        RECOUP_COCKPIT_AUTH_TOKEN: "local-runtime-token",
        RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:local-runtime"
      })
    }));
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({
        agentMetrics: [],
        blockedInputs: [],
        evalGates: [],
        generatedAtIso: "2026-06-30T00:00:00.000Z",
        promptCache: {
          cachedInputTokens: 0,
          cacheHitRateLabel: "Usage unavailable",
          deterministicBasis: "test",
          recordIds: ["release-readiness"],
          savingsLabel: "Pricing not configured",
          savingsStatus: "pricing_not_configured_not_computed",
          status: "usage_unavailable",
          uncachedInputTokens: 0
        },
        provenance: {
          deterministicBasis: "test",
          recordIds: ["release-readiness"],
          sourceKind: "derived_backend",
          sourceName: "test"
        },
        recommendations: [],
        releaseReadiness: {
          blockers: [],
          status: "pass"
        },
        surface: "evals-finops",
        unitEconomics: []
      }))
    );
    vi.stubGlobal("fetch", fetchMock);
    const { fetchEvalFinopsModel: fetchEvalFinopsModelWithLocalRuntime } = await import("../../cockpit/app/cockpit-data.ts");

    await fetchEvalFinopsModelWithLocalRuntime();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
      headers: {
        "x-recoup-human-principal": "human:local-runtime",
        "x-recoup-human-token": "local-runtime-token"
      }
    });
  });
});

function restoreEnv(name: "RECOUP_COCKPIT_AUTH_TOKEN" | "RECOUP_COCKPIT_HUMAN_PRINCIPAL", value: string | undefined): void {
  if (value === undefined) {
    if (name === "RECOUP_COCKPIT_AUTH_TOKEN") {
      delete process.env.RECOUP_COCKPIT_AUTH_TOKEN;
      return;
    }

    delete process.env.RECOUP_COCKPIT_HUMAN_PRINCIPAL;
    return;
  }

  process.env[name] = value;
}
